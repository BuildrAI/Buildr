import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_DOCUMENT_BYTES = 256 * 1024;
const RETROSPECTIVE_DOCUMENT_ROOT: readonly string[] = Object.freeze(['.buildr', 'local', 'task-retrospectives']);
const isTaskRecordId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(value);
const taskRecordError = (code: string, message: string, status = 500, details?: unknown) => Object.assign(new Error(message), { code, status, details, taskRecordBusiness: true });

export type TaskRuntime = {
  assertCanonicalTaskWorkspace(targetRoot: string): string;
  taskRetrospectiveDocumentPath?: (targetRoot: string, taskId: string) => { absolutePath: string; relativePath: string };
  readTaskRetrospectiveDocumentPersistence?: (task: TaskDocumentOwner) => TaskRetrospectiveDocument;
};

export type TaskDocumentOwner = { root: string; record: { taskId: string; retrospective: null | { state: 'pending-decision' | 'decided'; documentDigest: string } } };

export type TaskRetrospectiveDocument = {
  taskId: string;
  path: string;
  present: boolean;
  content: string | null;
  actualDigest: string | null;
  registeredDigest: string | null;
  registeredState: 'pending-decision' | 'decided' | null;
  effectiveState: 'missing' | 'pending-decision' | 'decided';
  diagnostic: null | { code: string; message: string };
};
export type TaskDocumentPersistence = {
  taskRetrospectiveDocumentPath(targetRoot: string, taskId: string): { absolutePath: string; relativePath: string };
  readTaskRetrospectiveDocumentPersistence(task: TaskDocumentOwner): TaskRetrospectiveDocument;
};

function digest(bytes: Uint8Array): string {
  return `sha256-${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

export function registerTaskRetrospectiveDocument<T extends TaskRuntime>(runtime: T): T & TaskDocumentPersistence {
  function taskRetrospectiveDocumentPath(targetRoot: string, taskId: string): { absolutePath: string; relativePath: string } {
    const root = runtime.assertCanonicalTaskWorkspace(targetRoot);
    if (!isTaskRecordId(taskId)) {
      throw taskRecordError('task_record_identity_invalid', `Task ID不合法：${taskId || '<missing>'}。`, 400);
    }
    let current = root;
    for (const segment of RETROSPECTIVE_DOCUMENT_ROOT) {
      current = path.join(current, segment);
      if (!fs.existsSync(current)) continue;
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw taskRecordError('task_record_retrospective_document_directory_invalid', '任务复盘文档目录必须位于Workspace内且不能经过符号链接。', 409, { path: path.relative(root, current) });
      }
    }
    const documentsRoot = path.join(root, ...RETROSPECTIVE_DOCUMENT_ROOT);
    const absolutePath = path.resolve(documentsRoot, `${taskId}.md`);
    if (path.dirname(absolutePath) !== documentsRoot) {
      throw taskRecordError('task_record_retrospective_document_path_escape', '任务复盘文档路径逃逸。', 400);
    }
    return {
      absolutePath,
      relativePath: path.posix.join(...RETROSPECTIVE_DOCUMENT_ROOT, `${taskId}.md`),
    };
  }

  function readTaskRetrospectiveDocumentPersistence(task: TaskDocumentOwner): TaskRetrospectiveDocument {
    const taskId = task.record.taskId;
    const resolved = taskRetrospectiveDocumentPath(task.root, task.record.taskId);
    const registered = task.record.retrospective;
    let descriptor: number | undefined;
    try {
      const entry = fs.lstatSync(resolved.absolutePath);
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw taskRecordError('task_record_retrospective_document_invalid', '任务复盘文档必须是普通文件且不能是符号链接。', 409);
      }
      descriptor = fs.openSync(resolved.absolutePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile()) {
        throw taskRecordError('task_record_retrospective_document_invalid', '任务复盘文档必须是普通文件。', 409);
      }
      if (stat.size < 1 || stat.size > MAX_DOCUMENT_BYTES) {
        throw taskRecordError('task_record_retrospective_document_size_invalid', `任务复盘文档必须是1到${MAX_DOCUMENT_BYTES}字节。`, 409);
      }
      const bytes = fs.readFileSync(descriptor);
      const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!content.trim()) {
        throw taskRecordError('task_record_retrospective_document_empty', '任务复盘文档不能为空。', 409);
      }
      const actualDigest = digest(bytes);
      const matches = registered?.documentDigest === actualDigest;
      return {
        taskId,
        path: resolved.relativePath,
        present: true,
        content,
        actualDigest,
        registeredDigest: registered?.documentDigest ?? null,
        registeredState: registered?.state ?? null,
        effectiveState: matches ? registered?.state ?? 'pending-decision' : 'pending-decision',
        diagnostic: registered && !matches
          ? { code: 'task_record_retrospective_document_changed', message: '任务复盘文档内容已变化，需要重新登记并由用户决定。' }
          : null,
      };
    } catch (cause) {
      if (cause && typeof cause === 'object' && 'taskRecordBusiness' in cause) throw cause;
      const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
      if (code === 'ENOENT') {
        return {
          taskId,
          path: resolved.relativePath,
          present: false,
          content: null,
          actualDigest: null,
          registeredDigest: registered?.documentDigest ?? null,
          registeredState: registered?.state ?? null,
          effectiveState: registered ? 'pending-decision' : 'missing',
          diagnostic: registered
            ? { code: 'task_record_retrospective_document_missing', message: '已登记的任务复盘文档当前不存在。' }
            : null,
        };
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      throw taskRecordError('task_record_retrospective_document_read_failed', `任务复盘文档读取失败：${message}`, 409);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }

  return Object.assign(runtime, { taskRetrospectiveDocumentPath, readTaskRetrospectiveDocumentPersistence });
}
