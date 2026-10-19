import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createPublicationWorktreeReader } from './publication-worktree-reader.ts';
import { assertPublicationId, decodePublicationUpload, publicationError, validatePublicationFields } from '../domain/publication.ts';
import {
  inside, listPublicationAssets, publicationAsset, publicPublication, publicPublicationAsset,
  parsePublicationText, readPublicationEntries, renderNewPublication, renderPublicationUpdate, safePublicationPath,
  type PublicationRecord, type PublicationScope,
} from '../persistence/publication-repository.ts';

export { canonicalPublicationPlatform, PUBLICATION_PLATFORM_ALIASES, publicationError } from '../domain/publication.ts';

export function registerPublicationApplication(runtime: any, { projectQuery, taskQuery, worktreeQuery, materialsQuery }: any = {}) {
  if (!projectQuery || typeof projectQuery.readProjectRegistryRecord !== 'function' || typeof projectQuery.resolveSourceRoot !== 'function') throw publicationError('publication_project_query_missing', 'Publication Application requires the Project Query capability.', 500);

  function projectScope(targetRoot: string, projectCode = 'product'): PublicationScope {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectCode)) throw publicationError('publication_project_invalid', '文章所属项目不合法。');
    const record = projectQuery.readProjectRegistryRecord(targetRoot);
    const project = record.projects[projectCode];
    if (!project) throw publicationError('publication_project_not_found', `文章所属项目不存在：${projectCode}。`, 404);
    const projectRoot = projectQuery.resolveSourceRoot(record.root, project.source);
    if (!inside(record.root, projectRoot) || project.source.root === 'attached' || !['workspace', 'git'].includes(project.source.type)) throw publicationError('publication_project_boundary', '文章所属项目不在当前工作空间的受控范围内。', 409);
    const scope = { workspaceRoot: record.root, root: path.join(projectRoot, 'docs', 'publications'), projectCode, projectName: project.name || projectCode };
    safePublicationPath(scope, scope.root);
    return scope;
  }

  const worktrees = taskQuery && worktreeQuery && materialsQuery ? createPublicationWorktreeReader({ taskQuery, worktreeQuery, materialsQuery }, projectScope) : null;

  function findArticle(scope: PublicationScope, id: unknown): PublicationRecord {
    assertPublicationId(id);
    const entries = readPublicationEntries(scope).filter(entry => entry.id === id);
    if (entries.length > 1) throw publicationError('publication_identity_conflict', `项目中有多个文章使用同一 ID：${id}。`, 409);
    if (!entries[0]) throw publicationError('publication_not_found', `文章不存在：${id}。`, 404);
    return entries[0];
  }

  function detail(scope: PublicationScope, article: PublicationRecord) {
    let assets: ReturnType<typeof listPublicationAssets> = [];
    const assetDiagnostics: { code: string; message: string }[] = [];
    try { assets = listPublicationAssets(scope); }
    catch (error: any) { assetDiagnostics.push({ code: error.code || 'publication_assets_unavailable', message: error.code ? error.message : '文章资源暂时不可读取。' }); }
    return { schemaVersion: 'buildr.publication-detail/v1', publication: publicPublication(article), content: article.content, source: article.source, revision: article.revision, assets, assetDiagnostics };
  }

  function assertRevision(article: PublicationRecord, revision: unknown) {
    if (revision !== article.revision) throw publicationError('publication_revision_conflict', '文章已被其他入口修改，请读取最新稿件后再保存。', 409, { currentRevision: article.revision });
  }

  function listPublications(targetRoot: string, projectCode?: string) {
    const record = projectQuery.readProjectRegistryRecord(targetRoot);
    const publications: ReturnType<typeof publicPublication>[] = [];
    const diagnostics: { projectCode: string; code: string; message: string }[] = [];
    for (const code of projectCode ? [projectCode] : Object.keys(record.projects)) {
      try {
        const fileDiagnostics: { code: string; message: string }[] = [];
        publications.push(...readPublicationEntries(projectScope(targetRoot, code), { diagnostics: fileDiagnostics }).map(publicPublication));
        diagnostics.push(...fileDiagnostics.map(item => ({ projectCode: code, ...item })));
      }
      catch (error: any) {
        if (projectCode) throw error;
        diagnostics.push({ projectCode: code, code: error.code || 'publication_source_unavailable', message: error.code ? error.message : '该项目文章来源暂时不可读取。' });
      }
    }
    if (worktrees) {
      const candidates = worktrees.list(targetRoot, projectCode);
      publications.push(...candidates.publications);
      diagnostics.push(...candidates.diagnostics);
    }
    publications.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title, 'zh-CN'));
    return { schemaVersion: 'buildr.publications/v1', publications, empty: publications.length === 0, diagnostics };
  }

  function publicationDetail(targetRoot: string, id: string, projectCode = 'product') {
    const scope = projectScope(targetRoot, projectCode);
    return detail(scope, findArticle(scope, id));
  }

  function sourceArticle(targetRoot: string, projectCode: string, id: string, sourceTaskId?: string) {
    if (sourceTaskId) {
      if (!worktrees) throw publicationError('publication_worktree_unavailable', '工作树稿件来源当前不可用。', 409);
      assertPublicationId(id);
      return worktrees.resolve(targetRoot, sourceTaskId, projectCode, id);
    }
    const scope = projectScope(targetRoot, projectCode);
    return { scope, article: findArticle(scope, id) };
  }

  /** Re-read inside the shared mutation lock. A pre-write conflict commits no writes, avoiding rollback over an external edit. */
  function mutateArticle(targetRoot: string, projectCode: string, id: string, revision: unknown, operation: string, affected: string[], action: (scope: PublicationScope, current: PublicationRecord) => any, sourceTaskId?: string) {
    const before = sourceArticle(targetRoot, projectCode, id, sourceTaskId);
    assertRevision(before.article, revision);
    const observeCurrent = () => {
      const current = sourceArticle(targetRoot, projectCode, id, sourceTaskId);
      assertRevision(current.article, revision);
      if (current.article.file !== before.article.file || current.scope.workspaceRoot !== before.scope.workspaceRoot || current.scope.root !== before.scope.root) throw publicationError('publication_revision_conflict', '文章来源或位置已变化，请重新读取。', 409);
      return current;
    };
    const result = runtime.withWorkspaceMutation(before.scope.workspaceRoot, `publication.${operation}:${projectCode}/${id}${sourceTaskId ? `:task:${sourceTaskId}` : ''}`, affected, () => {
      let scope: PublicationScope;
      let current: PublicationRecord;
      try {
        ({ scope, article: current } = observeCurrent());
      } catch (error) { return { error }; }
      return { value: action(scope, current) };
    }, { preSnapshot: observeCurrent });
    if (result.error) throw result.error;
    return result.value;
  }

  function createPublication(targetRoot: string, projectCode: string, input: any) {
    const fields = validatePublicationFields({ summary: '', content: '', status: 'draft', ...input });
    const id = input.id || `article-${crypto.randomUUID()}`;
    assertPublicationId(id);
    const scope = projectScope(targetRoot, projectCode);
    const file = safePublicationPath(scope, path.join(scope.root, `${id}.md`));
    const conflict = () => publicationError('publication_already_exists', '这个文章 ID 或文件名已经存在。', 409);
    const verify = () => {
      const current = projectScope(targetRoot, projectCode);
      if (current.root !== scope.root) throw publicationError('publication_project_changed', '文章所属项目位置已变化，请重新读取。', 409);
      safePublicationPath(current, file);
      if (fs.existsSync(file) || readPublicationEntries(current, { strict: true }).some(entry => entry.id === id)) throw conflict();
    };
    verify();
    const result = runtime.withWorkspaceMutation(targetRoot, `publication.create:${projectCode}/${id}`, [file], () => {
      try { verify(); } catch (error) { return { error }; }
      fs.mkdirSync(scope.root, { recursive: true });
      try { fs.writeFileSync(file, renderNewPublication(id, fields), { flag: 'wx' }); }
      catch (error: any) { if (error.code === 'EEXIST') return { error: conflict() }; throw error; }
      return { value: publicationDetail(targetRoot, id, projectCode) };
    }, { preSnapshot: verify });
    if (result.error) throw result.error;
    return result.value;
  }

  function updatePublication(targetRoot: string, projectCode: string, id: string, input: any, sourceTaskId?: string) {
    const { article: before } = sourceArticle(targetRoot, projectCode, id, sourceTaskId);
    assertRevision(before, input.revision);
    let editable = input;
    let sourceDocument: PublicationRecord['document'] | undefined;
    if (typeof input.source === 'string') {
      const parsed = parsePublicationText(input.source);
      if (!parsed) throw publicationError('publication_source_invalid', '原文格式不正确，请保留有效的文章信息与 Markdown 正文。');
      const preserved = (metadata: any) => Object.fromEntries(Object.entries(metadata).filter(([key]) => !['title', 'summary', 'updated_at'].includes(key)));
      if (!isDeepStrictEqual(preserved(parsed.metadata), preserved(before.document.toJS()))) throw publicationError('publication_metadata_readonly', '原文可校准标题、摘要和正文；文章标识、状态及发布记录请保持原样。');
      editable = { title: parsed.metadata.title, summary: parsed.metadata.summary ?? '', content: parsed.content, status: before.status };
      sourceDocument = parsed.document;
    }
    const fields = validatePublicationFields(sourceTaskId ? { ...editable, status: before.status } : editable, before.status);
    return mutateArticle(targetRoot, projectCode, id, input.revision, 'update', [before.file], (scope, current) => {
      safePublicationPath(scope, current.file);
      runtime.atomicWriteFile(current.file, renderPublicationUpdate(sourceDocument ? { ...current, document: sourceDocument } : current, fields));
      return sourceTaskId ? worktrees!.detail(targetRoot, sourceTaskId, projectCode, id) : detail(scope, findArticle(scope, id));
    }, sourceTaskId);
  }

  function deletePublication(targetRoot: string, projectCode: string, id: string, input: any) {
    const before = findArticle(projectScope(targetRoot, projectCode), id);
    return mutateArticle(targetRoot, projectCode, id, input.revision, 'delete', [before.file], (scope, current) => {
      fs.unlinkSync(safePublicationPath(scope, current.file));
      return { schemaVersion: 'buildr.publication-delete/v1', projectCode, id, deleted: true };
    });
  }

  function publicationAssets(targetRoot: string, projectCode: string, id: string) {
    const scope = projectScope(targetRoot, projectCode);
    const article = findArticle(scope, id);
    return { schemaVersion: 'buildr.publication-assets/v1', projectCode, id, revision: article.revision, assets: listPublicationAssets(scope) };
  }

  function uploadPublicationAsset(targetRoot: string, projectCode: string, id: string, input: any) {
    const upload = decodePublicationUpload(input.filename, input.contentBase64);
    const scope = projectScope(targetRoot, projectCode);
    const relativePath = `assets/${upload.stem}-${crypto.randomUUID()}${upload.extension}`;
    const file = safePublicationPath(scope, path.join(scope.root, relativePath));
    return mutateArticle(targetRoot, projectCode, id, input.revision, 'asset.upload', [file], (currentScope, current) => {
      if (currentScope.root !== scope.root) throw publicationError('publication_project_changed', '文章所属项目位置已变化，请重新读取。', 409);
      safePublicationPath(currentScope, file);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, upload.bytes, { flag: 'wx' });
      return { schemaVersion: 'buildr.publication-asset-upload/v1', revision: current.revision, asset: publicPublicationAsset(publicationAsset(currentScope, relativePath)) };
    });
  }

  function readPublicationAsset(targetRoot: string, id: string, assetPath: string, projectCode = 'product') {
    const scope = projectScope(targetRoot, projectCode);
    findArticle(scope, id);
    return publicationAsset(scope, assetPath);
  }

  const worktreePublicationDetail = (root: string, task: string, project: string, id: string) => {
    if (!worktrees) throw publicationError('publication_worktree_unavailable', '工作树草稿读取能力不可用。', 409);
    assertPublicationId(id);
    return worktrees.detail(root, task, project, id);
  };
  const readWorktreePublicationAsset = (root: string, task: string, project: string, id: string, relative: string) => {
    if (!worktrees) throw publicationError('publication_worktree_unavailable', '工作树草稿读取能力不可用。', 409);
    assertPublicationId(id);
    return worktrees.asset(root, task, project, id, relative);
  };
  const updateWorktreePublication = (root: string, task: string, project: string, id: string, input: any) => updatePublication(root, project, id, input, task);
  Object.assign(runtime, { publicationRoot: (targetRoot: string, projectCode = 'product') => projectScope(targetRoot, projectCode).root, listPublications, publicationDetail, createPublication, updatePublication, deletePublication, publicationAssets, uploadPublicationAsset, readPublicationAsset, worktreePublicationDetail, readWorktreePublicationAsset, updateWorktreePublication });
  return runtime;
}
