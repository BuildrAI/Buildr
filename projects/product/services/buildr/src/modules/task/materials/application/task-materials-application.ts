import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { TaskMaterialDocument, TaskMaterialReference, TaskMaterialsManifest, TaskMaterialsResponse, TaskMaterialsWriteResponse, TaskMaterialsRecordRequest, TaskMaterialsWriteRequest } from '../../../../../build/generated/task-dto.ts';
import { withExclusiveFileLock } from '../../../../infrastructure/filesystem/exclusive-file-lock.ts';
import { taskActionId } from '../../application/task-validation.ts';
import { LEGACY_TASK_MATERIALS_SCHEMA, TASK_MATERIALS_SCHEMAS, validateMaterials } from './task-materials-contracts.ts';
import { assertPlainDirectory, assertPlainPath, createTaskProjectDocumentReader, documentDigest, documentError, markdownPath, MAX_TASK_DOCUMENT_BYTES, readBoundedText, type TaskDocumentQuery, type TaskDocumentProjectQuery, type TaskDocumentWorktreeQuery } from './task-project-document-reader.ts';
import { observeMarkdownImageContext, readMarkdownImage, type MarkdownImageRequest } from '../../../../infrastructure/filesystem/markdown-images.ts';

type Dependencies = {
  taskQuery: TaskDocumentQuery & { assertCanonicalTaskWorkspace(root: string): string };
  projectQuery: TaskDocumentProjectQuery;
  worktreeQuery: TaskDocumentWorktreeQuery;
};
const MAX_MANIFEST_BYTES = 128 * 1024;
export type LegacyTaskBriefReference = Omit<TaskMaterialReference, 'role'> & { role: 'brief' };
export type LegacyTaskBriefDocument = Omit<TaskMaterialDocument, 'role'> & { role: 'brief' };
type StoredReference = TaskMaterialReference | LegacyTaskBriefReference;
type StoredManifest = { schemaVersion: 'buildr.task-materials/v1' | 'buildr.task-materials/v2'; documents: StoredReference[] };
const isCurrentReference = (reference: StoredReference): reference is TaskMaterialReference => reference.role !== 'brief';
const currentManifest = (materials: StoredManifest): TaskMaterialsManifest => ({ schemaVersion: 'buildr.task-materials/v2', documents: materials.documents.filter(isCurrentReference) });
const emptyManifest = (): TaskMaterialsManifest => ({ schemaVersion: 'buildr.task-materials/v2', documents: [] });
const diagnostic = (cause: unknown) => ({ code: cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : 'task_materials_unreadable', message: cause instanceof Error ? cause.message : '任务材料当前不可读取。' });

export function createTaskMaterialsApplication({ taskQuery, projectQuery, worktreeQuery }: Dependencies) {
  const reader = createTaskProjectDocumentReader(taskQuery, projectQuery, worktreeQuery);
  function context(targetRoot: string, taskId: string) {
    taskActionId(taskId, 'taskId');
    const root = taskQuery.assertCanonicalTaskWorkspace(targetRoot);
    taskQuery.readTask(root, taskId);
    // The explicit Task workspace (including an isolated preview snapshot) owns local files.
    // A project candidate never changes this directory or writes back into another workspace.
    const relative = `.buildr/local/task-materials/${taskId}`;
    return { root, relative, directory: assertPlainPath(root, relative) };
  }
  function references(documents: TaskMaterialReference[]): void {
    if (new Set(documents.map(item => item.id)).size !== documents.length) throw documentError('task_materials_references_invalid', '材料编码必须唯一。');
  }
  function manifest(root: string, relative: string, options: { requireRootProof?: boolean } = {}) {
    const observed = readBoundedText(root, `${relative}/materials.json`, MAX_MANIFEST_BYTES, options);
    if (!observed.exists) return { materials: emptyManifest(), materialsDigest: 'absent' };
    let parsed: unknown;
    try { parsed = JSON.parse(observed.content!); } catch { throw documentError('task_materials_manifest_invalid', '任务材料清单不是合法 JSON。', 409); }
    // Use the closed record schema to validate the manifest without accepting extra fields.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).sort().join(',') !== 'documents,schemaVersion' || !('schemaVersion' in parsed) || !['buildr.task-materials/v1', 'buildr.task-materials/v2'].includes(String(parsed.schemaVersion)) || !('documents' in parsed)) throw documentError('task_materials_manifest_invalid', '任务材料清单不符合契约。', 409);
    const materials = parsed as StoredManifest;
    if (materials.schemaVersion === 'buildr.task-materials/v1') validateMaterials(LEGACY_TASK_MATERIALS_SCHEMA, materials);
    else validateMaterials(TASK_MATERIALS_SCHEMAS.recordRequest, { expectedCurrent: observed.actualDigest, documents: materials.documents });
    // Invalid legacy references remain individually diagnosable and removable.
    if (materials.documents.filter(item => item.role === 'brief').length > 1 || new Set(materials.documents.map(item => item.id)).size !== materials.documents.length) throw documentError('task_materials_manifest_invalid', '材料清单身份或说明数量不合法。', 409);
    return { materials, materialsDigest: observed.actualDigest! };
  }
  function readReference<R extends StoredReference>(targetRoot: string, taskId: string, root: string, relative: string, reference: R, options: { requireRootProof?: boolean } = {}): Omit<TaskMaterialDocument, 'role'> & { role: R['role'] } {
    try {
      // Strict provenance inspection preserves its original descriptor-backed
      // read and never adds an ordinary path read for optional Web images.
      const source = options.requireRootProof ? null : materialSource(targetRoot, taskId, reference, { root, relative, directory: assertPlainPath(root, relative) });
      const read = source
        ? { ...readBoundedText(source.root, source.path), provenance: source.provenance }
        : reference.source.kind === 'task'
          ? { ...readBoundedText(root, `${relative}/${markdownPath(reference.source.path)}`, undefined, options), provenance: 'task-local' as const }
          : reader.taskProjectDocument(targetRoot, taskId, reference.source.project, reference.source.path, options);
      const imageContext = source ? observeMarkdownImageContext(source, read.content, read.actualDigest) : undefined;
      return { ...reference, exists: read.exists, content: read.content, actualDigest: read.actualDigest, provenance: read.provenance, ...(imageContext ? { imageContext } : {}), diagnostic: !read.exists ? { code: 'task_materials_document_missing', message: '已关联的任务材料当前不存在。' } : !read.content?.trim() ? { code: 'task_materials_document_empty', message: '已关联的任务材料正文为空，尚无真实可读内容。' } : null };
    } catch (cause) { if (options.requireRootProof) throw cause; return { ...reference, exists: false, content: null, actualDigest: null, provenance: null, diagnostic: diagnostic(cause) }; }
  }
  function materialSource(targetRoot: string, taskId: string, reference: StoredReference, current = context(targetRoot, taskId)) {
    const source = reference.source.kind === 'task'
      ? { root: current.directory, path: markdownPath(reference.source.path), identity: ['task-local', current.root, taskId], provenance: 'task-local' as const }
      : reader.resolveTaskProjectDocument(targetRoot, taskId, reference.source.project, reference.source.path);
    return { ...source, identity: [source.identity, 'material', reference.id, reference.source] };
  }
  function taskMaterialImage(targetRoot: string, taskId: string, materialId: string, input: MarkdownImageRequest) {
    return readMarkdownImage(() => {
      const current = context(targetRoot, taskId);
      const observed = manifest(current.root, current.relative);
      const reference = observed.materials.documents.find(item => isCurrentReference(item) && item.id === materialId);
      if (!reference) throw documentError('task_materials_document_missing', '图片所属材料当前未关联，请刷新任务。', 404);
      return materialSource(targetRoot, taskId, reference, current);
    }, input);
  }
  function inspectTaskMaterials(targetRoot: string, taskId: string): TaskMaterialsResponse {
    const current = context(targetRoot, taskId);
    const observed = manifest(current.root, current.relative);
    const materials = currentManifest(observed.materials);
    const legacy = observed.materials.documents.some(reference => reference.role === 'brief');
    return { schemaVersion: 'buildr.task-materials-result/v2', taskId, materials, materialsDigest: observed.materialsDigest, documents: materials.documents.map(reference => readReference(targetRoot, taskId, current.root, current.relative, reference)), diagnostics: legacy ? [{ code: 'task_materials_legacy_brief', message: '旧任务说明文件关联尚待显式迁移或释放；任务说明仅从 Task Record.brief 读取。' }] : [] };
  }
  /** Read only the explicitly selected material; does not load sibling bodies. */
  function inspectTaskMaterial(targetRoot: string, taskId: string, materialId: string): TaskMaterialDocument | null {
    taskActionId(materialId, 'materialId');
    const current = context(targetRoot, taskId);
    const observed = manifest(current.root, current.relative, { requireRootProof: true });
    const selected = currentManifest(observed.materials).documents.find(item => item.id === materialId);
    if (!selected) return null;
    const relative = selected.source.path;
    if (relative.split('/').some(part => part.startsWith('.env') || ['.ssh', '.aws', '.gnupg', '.git', 'node_modules'].includes(part)) || /(?:\.pem|\.key|credentials(?:\.[^/]*)?)$/i.test(relative)) {
      throw documentError('task_document_path_forbidden', '材料路径属于秘密或内部目录，不能用于被动来源读取。');
    }
    return readReference(targetRoot, taskId, current.root, current.relative, selected, { requireRootProof: true });
  }
  function ensureDirectory(root: string, relative: string): void {
    let directory = root;
    assertPlainDirectory(root);
    for (const segment of relative.split('/')) {
      directory = path.join(directory, segment);
      if (!assertPlainDirectory(directory)) {
        try { fs.mkdirSync(directory, { mode: 0o700 }); } catch (cause) { if (!(cause && typeof cause === 'object' && 'code' in cause && cause.code === 'EEXIST')) throw cause; }
        assertPlainDirectory(directory);
      }
    }
  }
  function locked<T>(current: ReturnType<typeof context>, action: () => T): T {
    ensureDirectory(current.root, current.relative);
    const lock = assertPlainPath(current.root, `${current.relative}/.materials.lock`);
    const entry = fs.lstatSync(lock, { throwIfNoEntry: false });
    if (entry && !entry.isFile()) throw documentError('task_document_path_forbidden', '任务材料锁必须是普通文件。', 409);
    if (entry && entry.size > 64 * 1024) throw documentError('task_materials_lock_too_large', '任务材料锁超过 64 KiB，保留现场并停止对应写入。', 409);
    return withExclusiveFileLock(lock, current.directory, action);
  }
  function publish(root: string, relative: string, bytes: Uint8Array): void {
    const destination = assertPlainPath(root, relative);
    const entry = fs.lstatSync(destination, { throwIfNoEntry: false });
    if (entry && !entry.isFile()) throw documentError('task_document_path_forbidden', '任务材料写入目标必须是普通文件。');
    const temporaryRelative = `${relative}.tmp-${crypto.randomUUID()}`;
    const temporary = assertPlainPath(root, temporaryRelative);
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
      // Recheck both exact in-scope targets immediately before atomic publication.
      assertPlainPath(root, relative); assertPlainPath(root, temporaryRelative);
      fs.renameSync(temporary, destination);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      const checked = assertPlainPath(root, temporaryRelative);
      if (fs.lstatSync(checked, { throwIfNoEntry: false })) fs.unlinkSync(checked);
    }
  }
  function recordTaskMaterials(targetRoot: string, taskId: string, input: TaskMaterialsRecordRequest): TaskMaterialsResponse {
    validateMaterials(TASK_MATERIALS_SCHEMAS.recordRequest, input);
    references(input.documents);
    const current = context(targetRoot, taskId);
    function validateNewReferences(observed: ReturnType<typeof manifest>): void {
      if (input.expectedCurrent !== observed.materialsDigest) throw documentError('task_materials_conflict', '任务材料关联已变化，请重新读取后判断。', 409);
      if (observed.materials.documents.some(previous => previous.role === 'brief' && input.documents.some(reference => reference.id === previous.id))) throw documentError('task_materials_legacy_id_conflict', '材料编码仍由旧任务说明关联使用，请先显式迁移或释放该关联。', 409);
      for (const reference of input.documents) {
        if (observed.materials.documents.some(previous => previous.source.kind === reference.source.kind && previous.source.path === reference.source.path && (previous.source.kind !== 'project' || (reference.source.kind === 'project' && previous.source.project === reference.source.project)))) continue;
        // Validate the same project-root alias expansion used by the reader.
        const relative = reference.source.kind === 'project' && reference.source.path.startsWith('@project/') ? reference.source.path.slice('@project/'.length) : reference.source.path;
        markdownPath(relative);
        const document = readReference(targetRoot, taskId, current.root, current.relative, reference);
        if (!document.exists || document.diagnostic) throw documentError(document.diagnostic?.code || 'task_materials_document_missing', document.diagnostic?.message || '新材料引用必须可读取。', 409);
      }
    }
    function bytesFor(observed: ReturnType<typeof manifest>) {
      const legacy = observed.materials.documents.filter(reference => reference.role === 'brief');
      const stored = { schemaVersion: legacy.length ? 'buildr.task-materials/v1' : 'buildr.task-materials/v2', documents: [...legacy, ...input.documents] };
      // The hidden migration source still counts toward the bounded stored manifest.
      // Validate the combined object before any lock directory or publication exists.
      if (legacy.length) validateMaterials(LEGACY_TASK_MATERIALS_SCHEMA, stored);
      const bytes = Buffer.from(`${JSON.stringify(stored, null, 2)}\n`);
      if (bytes.length > MAX_MANIFEST_BYTES) throw documentError('task_materials_manifest_too_large', '材料清单超出大小限制。');
      return bytes;
    }
    // Preflight is zero-write; only the repeated lock-protected observation authorizes publication.
    const preflight = manifest(current.root, current.relative);
    validateNewReferences(preflight); bytesFor(preflight);
    locked(current, () => {
      const observed = manifest(current.root, current.relative);
      validateNewReferences(observed);
      publish(current.root, `${current.relative}/materials.json`, bytesFor(observed));
    });
    return inspectTaskMaterials(targetRoot, taskId);
  }
  function writeTaskMaterialDocument(targetRoot: string, taskId: string, input: TaskMaterialsWriteRequest): TaskMaterialsWriteResponse {
    validateMaterials(TASK_MATERIALS_SCHEMAS.writeRequest, input);
    const relative = markdownPath(input.path);
    const bytes = Buffer.from(input.content, 'utf8');
    if (bytes.length > MAX_TASK_DOCUMENT_BYTES || new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== input.content) throw documentError('task_document_encoding_invalid', '正文必须是有界合法 UTF-8，不能含未配对代理字符。');
    const current = context(targetRoot, taskId);
    return locked(current, () => {
      const target = `${current.relative}/${relative}`;
      const observed = readBoundedText(current.root, target);
      if (input.expectedDocumentDigest !== (observed.actualDigest || 'absent')) throw documentError('task_materials_document_conflict', '任务材料正文已变化，请重新读取后判断。', 409);
      const parent = path.posix.dirname(target);
      ensureDirectory(current.root, parent);
      publish(current.root, target, bytes);
      return { schemaVersion: 'buildr.task-materials-write-result/v2', taskId, path: relative, actualDigest: documentDigest(bytes) };
    });
  }
  function inspectLegacyTaskBrief(targetRoot: string, taskId: string) {
    const current = context(targetRoot, taskId);
    const observed = manifest(current.root, current.relative);
    const reference = observed.materials.documents.find((item): item is LegacyTaskBriefReference => item.role === 'brief') || null;
    return { materialsDigest: observed.materialsDigest, materials: currentManifest(observed.materials), reference, document: reference ? readReference(targetRoot, taskId, current.root, current.relative, reference) : null };
  }
  function migrateLegacyTaskBrief<T>(targetRoot: string, taskId: string, input: { expectedMaterialsDigest: string; expectedDocumentDigest: string }, save: (source: ReturnType<typeof inspectLegacyTaskBrief>) => T) {
    const current = context(targetRoot, taskId);
    const validate = () => {
      const source = inspectLegacyTaskBrief(targetRoot, taskId);
      if (source.materialsDigest !== input.expectedMaterialsDigest) throw documentError('task_materials_conflict', '旧说明关联已变化，请重新观察。', 409);
      if (!source.reference || !source.document?.exists || source.document.diagnostic || !source.document.content?.trim()) throw documentError(source.document?.diagnostic?.code || 'task_brief_source_missing', source.document?.diagnostic?.message || '没有可读取的独立旧说明，不能使用变更说明替代。', 409);
      if (source.document.actualDigest !== input.expectedDocumentDigest) throw documentError('task_materials_document_conflict', '旧说明正文已变化，请重新观察。', 409);
      return source;
    };
    validate();
    return locked(current, () => {
      const source = validate();
      const result = save(source);
      try {
        // The record write is already established; a later release failure cannot undo it.
        validate();
        publish(current.root, `${current.relative}/materials.json`, Buffer.from(`${JSON.stringify(source.materials, null, 2)}\n`));
        return { status: 'migrated' as const, result, materialsDigest: documentDigest(Buffer.from(`${JSON.stringify(source.materials, null, 2)}\n`)), diagnostic: null };
      } catch (cause) {
        return { status: 'partial' as const, result, materialsDigest: source.materialsDigest, diagnostic: diagnostic(cause) };
      }
    });
  }
  function releaseLegacyTaskBrief<T>(targetRoot: string, taskId: string, expectedMaterialsDigest: string, keepRecord: () => T) {
    const current = context(targetRoot, taskId);
    const validate = () => {
      const observed = manifest(current.root, current.relative);
      if (observed.materialsDigest !== expectedMaterialsDigest) throw documentError('task_materials_conflict', '旧说明关联已变化，请重新观察。', 409);
      return currentManifest(observed.materials);
    };
    validate();
    return locked(current, () => {
      const materials = validate();
      const result = keepRecord();
      validate();
      const bytes = Buffer.from(`${JSON.stringify(materials, null, 2)}\n`);
      publish(current.root, `${current.relative}/materials.json`, bytes);
      return { result, materialsDigest: documentDigest(bytes) };
    });
  }
  return Object.freeze({ inspectTaskMaterials, inspectTaskMaterial, recordTaskMaterials, writeTaskMaterialDocument, inspectLegacyTaskBrief, migrateLegacyTaskBrief, releaseLegacyTaskBrief, taskProjectDocument: reader.taskProjectDocument, taskProjectDocumentImage: reader.taskProjectDocumentImage, taskMaterialImage });
}
export type TaskMaterialsApplication = ReturnType<typeof createTaskMaterialsApplication>;
