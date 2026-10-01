import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { TaskMaterialDocument, TaskMaterialReference, TaskMaterialsManifest, TaskMaterialsResponse, TaskMaterialsWriteResponse, TaskMaterialsRecordRequest, TaskMaterialsWriteRequest } from '../../../../../build/generated/task-dto.ts';
import { withExclusiveFileLock } from '../../../../infrastructure/filesystem/exclusive-file-lock.ts';
import { taskActionId } from '../../application/task-validation.ts';
import { TASK_MATERIALS_SCHEMAS, validateMaterials } from './task-materials-contracts.ts';
import { assertPlainDirectory, assertPlainPath, createTaskProjectDocumentReader, documentDigest, documentError, markdownPath, MAX_TASK_DOCUMENT_BYTES, readBoundedText, type TaskDocumentQuery, type TaskDocumentProjectQuery, type TaskDocumentWorktreeQuery } from './task-project-document-reader.ts';

type Dependencies = {
  taskQuery: TaskDocumentQuery & { assertCanonicalTaskWorkspace(root: string): string };
  projectQuery: TaskDocumentProjectQuery;
  worktreeQuery: TaskDocumentWorktreeQuery;
};
const MAX_MANIFEST_BYTES = 128 * 1024;
const emptyManifest = (): TaskMaterialsManifest => ({ schemaVersion: 'buildr.task-materials/v1', documents: [] });
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
    if (documents.filter(item => item.role === 'brief').length > 1 || new Set(documents.map(item => item.id)).size !== documents.length) throw documentError('task_materials_references_invalid', '材料编码必须唯一且至多关联一份任务说明。');
  }
  function manifest(root: string, relative: string) {
    const observed = readBoundedText(root, `${relative}/materials.json`, MAX_MANIFEST_BYTES);
    if (!observed.exists) return { materials: emptyManifest(), materialsDigest: 'absent' };
    let parsed: unknown;
    try { parsed = JSON.parse(observed.content!); } catch { throw documentError('task_materials_manifest_invalid', '任务材料清单不是合法 JSON。', 409); }
    // Use the closed record schema to validate the manifest without accepting extra fields.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).sort().join(',') !== 'documents,schemaVersion' || !('schemaVersion' in parsed) || parsed.schemaVersion !== 'buildr.task-materials/v1' || !('documents' in parsed)) throw documentError('task_materials_manifest_invalid', '任务材料清单不符合契约。', 409);
    const materials = parsed as TaskMaterialsManifest;
    validateMaterials(TASK_MATERIALS_SCHEMAS.recordRequest, { expectedCurrent: observed.actualDigest, documents: materials.documents });
    // Invalid legacy references remain individually diagnosable and removable.
    if (materials.documents.filter(item => item.role === 'brief').length > 1 || new Set(materials.documents.map(item => item.id)).size !== materials.documents.length) throw documentError('task_materials_manifest_invalid', '材料清单身份或说明数量不合法。', 409);
    return { materials, materialsDigest: observed.actualDigest! };
  }
  function readReference(targetRoot: string, taskId: string, root: string, relative: string, reference: TaskMaterialReference): TaskMaterialDocument {
    try {
      const read = reference.source.kind === 'task'
        ? { ...readBoundedText(root, `${relative}/${markdownPath(reference.source.path)}`), provenance: 'task-local' as const }
        : reader.taskProjectDocument(targetRoot, taskId, reference.source.project, reference.source.path);
      return { ...reference, exists: read.exists, content: read.content, actualDigest: read.actualDigest, provenance: read.provenance, diagnostic: !read.exists ? { code: 'task_materials_document_missing', message: '已关联的任务材料当前不存在。' } : !read.content?.trim() ? { code: 'task_materials_document_empty', message: '已关联的任务材料正文为空，尚无真实可读内容。' } : null };
    } catch (cause) { return { ...reference, exists: false, content: null, actualDigest: null, provenance: null, diagnostic: diagnostic(cause) }; }
  }
  function inspectTaskMaterials(targetRoot: string, taskId: string): TaskMaterialsResponse {
    const current = context(targetRoot, taskId);
    const observed = manifest(current.root, current.relative);
    return { schemaVersion: 'buildr.task-materials-result/v1', taskId, ...observed, documents: observed.materials.documents.map(reference => readReference(targetRoot, taskId, current.root, current.relative, reference)), diagnostics: [] };
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
      for (const reference of input.documents) {
        if (observed.materials.documents.some(previous => previous.source.kind === reference.source.kind && previous.source.path === reference.source.path && (previous.source.kind !== 'project' || (reference.source.kind === 'project' && previous.source.project === reference.source.project)))) continue;
        // Match the reader's one project-root alias expansion before guarding
        // moving artifacts; spelling the same file with @project/ is not a bypass.
        const relative = reference.source.kind === 'project' && reference.source.path.startsWith('@project/') ? reference.source.path.slice('@project/'.length) : reference.source.path;
        markdownPath(relative);
        if (reference.source.kind === 'project' && /^openspec\/changes\/(?!archive\/)[^/]+\/brief\.md$/.test(relative)) throw documentError('task_materials_moving_change_reference', '活跃变更说明会随归档移动，请使用既有逻辑变更入口而非独立材料引用。');
        const document = readReference(targetRoot, taskId, current.root, current.relative, reference);
        if (!document.exists || document.diagnostic) throw documentError(document.diagnostic?.code || 'task_materials_document_missing', document.diagnostic?.message || '新材料引用必须可读取。', 409);
      }
    }
    const bytes = Buffer.from(`${JSON.stringify({ schemaVersion: 'buildr.task-materials/v1', documents: input.documents }, null, 2)}\n`);
    if (bytes.length > MAX_MANIFEST_BYTES) throw documentError('task_materials_manifest_too_large', '材料清单超出大小限制。');
    // Preflight is zero-write; only the repeated lock-protected observation authorizes publication.
    validateNewReferences(manifest(current.root, current.relative));
    locked(current, () => {
      validateNewReferences(manifest(current.root, current.relative));
      publish(current.root, `${current.relative}/materials.json`, bytes);
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
      return { schemaVersion: 'buildr.task-materials-write-result/v1', taskId, path: relative, actualDigest: documentDigest(bytes) };
    });
  }
  return Object.freeze({ inspectTaskMaterials, recordTaskMaterials, writeTaskMaterialDocument, taskProjectDocument: reader.taskProjectDocument });
}
export type TaskMaterialsApplication = ReturnType<typeof createTaskMaterialsApplication>;
