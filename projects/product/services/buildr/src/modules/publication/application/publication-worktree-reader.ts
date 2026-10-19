import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { publicationError } from '../domain/publication.ts';
import { listPublicationAssets, publicationAsset, publicPublication, readPublicationEntries, safePublicationPath, type PublicationScope, type PublicationRecord } from '../persistence/publication-repository.ts';

type SourceTask = { id: string; title: string };
type Dependencies = {
  taskQuery: { readTask(root: string, id: string): { record: { title: string; scope: { projects: string[]; services: Array<{ project: string }> }; changes: Array<{ project: string }> } } };
  worktreeQuery: { gitWorktreeEvidenceDirectories(root: string): string[] };
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
  function list(root: string, projectCode?: string) {
    const publications: ReturnType<typeof publicPublication>[] = [], diagnostics: Diagnostic[] = [];
    const taskIds = new Set<string>();
    try {
      for (const directory of worktreeQuery.gitWorktreeEvidenceDirectories(root)) {
        if (!fs.existsSync(directory)) continue;
        if (fs.lstatSync(directory).isSymbolicLink()) throw publicationError('publication_worktree_unavailable', '工作树登记目录不可读取。', 409);
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          if (entry.isFile() && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\.json$/.test(entry.name)) taskIds.add(entry.name.slice(0, -5));
        }
      }
    } catch (error: any) {
      diagnostics.push({ projectCode: projectCode || '*', code: error.code || 'publication_worktree_unavailable', message: '部分工作树草稿来源暂时无法发现。' });
    }
    const baselines = new Map<string, { scope: PublicationScope; articles: Map<string, PublicationRecord> }>();
    for (const taskId of taskIds) {
      try {
        const { record } = taskQuery.readTask(root, taskId);
        const projects = new Set([...record.scope.projects, ...record.scope.services.map(item => item.project), ...record.changes.map(item => item.project)]);
        for (const project of projects) {
          if (projectCode && project !== projectCode) continue;
          try {
            const { scope } = taskScope(root, taskId, project, { id: taskId, title: record.title });
            let baseline = baselines.get(project);
            if (!baseline) {
              const baseScope = retainedScope(root, project);
              baseline = { scope: baseScope, articles: new Map(readPublicationEntries(baseScope).map(article => [article.id, article])) };
              baselines.set(project, baseline);
            }
            const errors: { code: string; message: string }[] = [];
            for (const article of readPublicationEntries(scope, { diagnostics: errors })) {
              const task = { id: taskId, title: record.title };
              if (!unchanged(article, scope, baseline.articles.get(article.id), baseline.scope)) publications.push(publicPublication(candidate(observe(scope, article, task), task)));
            }
            diagnostics.push(...errors.map(error => ({ ...error, projectCode: project, taskId })));
          } catch (error: any) {
            // Service-only groups may have no project article root; no unrelated retained copy is substituted.
            if (error.code !== 'publication_worktree_unavailable') diagnostics.push({ projectCode: project, taskId, code: error.code || 'publication_worktree_unavailable', message: `${record.title}：工作树草稿暂时不可读取。` });
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
