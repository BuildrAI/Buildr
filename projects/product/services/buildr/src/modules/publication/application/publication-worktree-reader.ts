import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { publicationError } from '../domain/publication.ts';
import { inside, listPublicationAssets, publicationAsset, publicPublication, readPublicationEntries, safePublicationPath, type PublicationScope, type PublicationRecord } from '../persistence/publication-repository.ts';

type SourceTask = { id: string; title: string };
type EvidenceRepository = { selector: string; entityType: string; sourcePath: string; sourceRepository: string; checkoutPath: string; branch: string; state: string };
type WorktreeEvidence = { taskId: string; repositories: EvidenceRepository[] };
type Dependencies = {
  taskQuery: { readTask(root: string, id: string): { record: { title: string; scope: { projects: string[]; services: Array<{ project: string }> }; changes: Array<{ project: string }> } } };
  worktreeQuery: {
    listGitWorktreeEvidence(root: string): Array<{ file: string; evidence: WorktreeEvidence }>;
    probeGitWorktreeCheckoutFs(record: { sourceRepository: string; checkoutPath: string; branch: string }): boolean;
  };
  materialsQuery: { resolveTaskProjectDocument(root: string, task: string, project: string, file: string): { root: string; path: string; provenance: string } };
};
type Diagnostic = { projectCode: string; code: string; message: string; taskId?: string };

/** Article semantics stay here; Task Materials owns task scope and current checkout identity. */
export function createPublicationWorktreeReader(dependencies: Dependencies, retainedScope: (root: string, project: string) => PublicationScope) {
  const { taskQuery, worktreeQuery, materialsQuery } = dependencies;
  function taskScope(root: string, taskId: string, project: string, sourceTask?: SourceTask) {
    const retained = retainedScope(root, project);
    const task = sourceTask || { id: taskId, title: taskQuery.readTask(root, taskId).record.title };
    const source = materialsQuery.resolveTaskProjectDocument(root, taskId, project, 'docs/publications/.publication-source.md');
    if (source.provenance !== 'task-worktree-candidate') throw publicationError('publication_worktree_unavailable', '文章来源工作树当前不可读取，请刷新列表。', 409);
    const scope = { ...retained, workspaceRoot: source.root, root: path.dirname(path.join(source.root, source.path)) };
    safePublicationPath(scope, scope.root);
    return { scope, task };
  }
  const candidate = (article: PublicationRecord, task: SourceTask): PublicationRecord => ({ ...article, sourceTask: task, status: 'draft', publishedAt: null, targets: [] });
  const observe = (scope: PublicationScope, article: PublicationRecord, task: SourceTask): PublicationRecord => ({ ...article,
    revision: `sha256-${crypto.createHash('sha256').update(JSON.stringify([task.id, scope.projectCode, scope.workspaceRoot, scope.root, article.sourcePath, article.revision])).digest('hex')}`,
  });
  function find(root: string, task: string, project: string, id: string) {
    const source = taskScope(root, task, project);
    const articles = readPublicationEntries(source.scope).filter(article => article.id === id);
    if (articles.length > 1) throw publicationError('publication_identity_conflict', '工作树中有多篇文章使用同一标识。', 409);
    if (!articles[0]) throw publicationError('publication_not_found', '这篇工作树草稿已不存在，请刷新文章列表。', 404);
    return { ...source, article: observe(source.scope, articles[0], source.task) };
  }
  function assetSignature(scope: PublicationScope, relative: string) {
    try {
      const asset = publicationAsset(scope, relative);
      if (asset.size > 10 * 1024 * 1024) return null;
      return crypto.createHash('sha256').update(fs.readFileSync(asset.file)).digest('hex');
    } catch { return null; }
  }
  function unchanged(article: PublicationRecord, scope: PublicationScope, retained: PublicationRecord | undefined, baseline: PublicationScope) {
    if (!retained || retained.revision !== article.revision) return false;
    const paths = new Set([...article.content.matchAll(/!?\[[^\]]*\]\((assets\/[^)]+)\)/g)].map(match => {
      try { return decodeURIComponent(match[1]); } catch { return match[1]; }
    }));
    for (const relative of paths) {
      const observed = assetSignature(scope, relative);
      if (!observed || observed !== assetSignature(baseline, relative)) return false;
    }
    return true;
  }
  /**
   * Evidence-recorded project source for list discovery. Resolution follows the
   * selector precedence of resolveTaskProjectDocument: direct project evidence,
   * then the workspace checkout, then a covering service checkout. A recorded
   * source whose checkout fails the filesystem probe reports a local diagnostic;
   * a project with no recorded source yields no candidate and no retained copy.
   */
  function candidateScope(root: string, evidence: WorktreeEvidence, project: string, retained: PublicationScope): { scope: PublicationScope } | { diagnostic: { code: string; message: string } } | null {
    const retainedProjectRoot = path.dirname(path.dirname(retained.root));
    const drifted = () => ({ diagnostic: { code: 'publication_worktree_unavailable', message: '登记的工作树检出已变化，草稿暂不列入。' } });
    let record: EvidenceRepository | null = evidence.repositories.find(item => item.selector === `project:${project}`) || null;
    if (record && record.sourcePath !== path.relative(path.resolve(root), retainedProjectRoot).split(path.sep).join('/')) return drifted();
    // boundary mirrors resolveTaskProjectDocument: workspaceRoot stays the project or
    // service checkout root so the observed revision matches the fully verified paths.
    let boundary = record ? record.checkoutPath : null;
    let base = record ? record.checkoutPath : null;
    if (!record) {
      const workspace = evidence.repositories.find(item => item.selector === 'workspace' && item.sourcePath === '.');
      if (workspace) {
        const candidate = path.resolve(workspace.checkoutPath, path.relative(path.resolve(root), retainedProjectRoot));
        if (inside(workspace.checkoutPath, candidate)) {
          record = workspace;
          boundary = candidate;
          base = candidate;
        }
      }
      if (!record) {
        const service = evidence.repositories
          .filter(item => item.selector.startsWith(`service:${project}/`) && item.sourcePath && inside(path.resolve(root, item.sourcePath), retainedProjectRoot))
          .sort((left, right) => right.sourcePath.length - left.sourcePath.length)[0];
        if (!service) return null;
        record = service;
        boundary = service.checkoutPath;
        // scope.root maps the retained publications directory itself, not its parent.
        base = path.dirname(path.resolve(service.checkoutPath, path.relative(path.resolve(root, service.sourcePath), retained.root)));
      }
    }
    if (!worktreeQuery.probeGitWorktreeCheckoutFs(record)) return drifted();
    return { scope: { ...retained, workspaceRoot: boundary!, root: path.join(base!, 'docs', 'publications') } };
  }

  function list(root: string, projectCode?: string) {
    const publications: ReturnType<typeof publicPublication>[] = [], diagnostics: Diagnostic[] = [];
    let evidences: WorktreeEvidence[] = [];
    try {
      evidences = worktreeQuery.listGitWorktreeEvidence(root).map(item => item.evidence);
    } catch (error: any) {
      diagnostics.push({ projectCode: projectCode || '*', code: error.code || 'publication_worktree_unavailable', message: '部分工作树草稿来源暂时无法发现。' });
    }
    const baselines = new Map<string, { scope: PublicationScope; articles: Map<string, PublicationRecord> }>();
    for (const evidence of evidences) {
      const taskId = evidence.taskId;
      try {
        const { record } = taskQuery.readTask(root, taskId);
        const projects = new Set([...record.scope.projects, ...record.scope.services.map(item => item.project), ...record.changes.map(item => item.project)]);
        for (const project of projects) {
          if (projectCode && project !== projectCode) continue;
          try {
            const retained = retainedScope(root, project);
            const candidateScopeResult = candidateScope(root, evidence, project, retained);
            if (!candidateScopeResult) continue;
            if ('diagnostic' in candidateScopeResult) {
              const { code, message } = candidateScopeResult.diagnostic;
              diagnostics.push({ projectCode: project, taskId, code, message });
              continue;
            }
            const { scope } = candidateScopeResult;
            safePublicationPath(scope, scope.root);
            let baseline = baselines.get(project);
            if (!baseline) {
              baseline = { scope: retained, articles: new Map(readPublicationEntries(retained).map(article => [article.id, article])) };
              baselines.set(project, baseline);
            }
            const errors: { code: string; message: string }[] = [];
            for (const article of readPublicationEntries(scope, { diagnostics: errors })) {
              const task = { id: taskId, title: record.title };
              if (!unchanged(article, scope, baseline.articles.get(article.id), baseline.scope)) publications.push(publicPublication(candidate(observe(scope, article, task), task)));
            }
            diagnostics.push(...errors.map(error => ({ ...error, projectCode: project, taskId })));
          } catch (error: any) {
            diagnostics.push({ projectCode: project, taskId, code: error.code || 'publication_worktree_unavailable', message: `${record.title}：工作树草稿暂时不可读取。` });
          }
        }
      } catch (error: any) {
        diagnostics.push({ projectCode: projectCode || '*', taskId, code: error.code || 'publication_worktree_unavailable', message: `来源任务 ${taskId} 暂时不可读取。` });
      }
    }
    return { publications, diagnostics };
  }
  function detail(root: string, task: string, project: string, id: string) {
    const { scope, article, task: sourceTask } = find(root, task, project, id);
    let assets: ReturnType<typeof listPublicationAssets> = [];
    const assetDiagnostics: { code: string; message: string }[] = [];
    try { assets = listPublicationAssets(scope); }
    catch (error: any) { assetDiagnostics.push({ code: error.code || 'publication_assets_unavailable', message: '部分工作树资源暂时不可读取。' }); }
    return { schemaVersion: 'buildr.publication-detail/v1', publication: publicPublication(candidate(article, sourceTask)), content: article.content, source: article.source, revision: article.revision, assets, assetDiagnostics };
  }
  function asset(root: string, task: string, project: string, id: string, relative: string) {
    const { scope } = find(root, task, project, id);
    return publicationAsset(scope, relative);
  }
  return Object.freeze({ list, detail, asset, resolve: find });
}
