import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { taskActionId } from '../../application/task-validation.ts';

// Structural ports deliberately contain no OpenSpec types or queries.
export type TaskDocumentProject = { source: { type?: string; path: string } };
export type TaskDocumentProjectQuery = {
  projectDetail(root: string, code: string): { project: TaskDocumentProject };
  resolveSourceRoot(root: string, source: TaskDocumentProject['source']): string;
};
export type TaskDocumentWorktreeQuery = { inspectGitWorktrees(input: { workspaceRoot: string; taskId: string }): { status: string; repositories: Array<{ selector: string; entityType: string; sourcePath: string; checkoutPath: string; state: string }>; diagnostic?: { code: string; message: string } | null } };
export type TaskDocumentQuery = { readTask(root: string, taskId: string): { record: { changes: Array<{ project: string; change: string }>; scope?: { projects: string[]; services: Array<{ project: string; service: string }> } } } };
export const MAX_TASK_DOCUMENT_BYTES = 512 * 1024;
export function documentError(code: string, message: string, status = 400) { return Object.assign(new Error(message), { code, status }); }
export function documentDigest(bytes: Uint8Array): string { return `sha256-${crypto.createHash('sha256').update(bytes).digest('hex')}`; }
export function isInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}
export function markdownPath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw || raw.length > 1024 || raw.includes('\\') || raw.includes('\0') || path.posix.isAbsolute(raw) || /^[A-Za-z]:/.test(raw) || raw.split('/').some(segment => !segment || segment === '.' || segment === '..') || !raw.endsWith('.md')) throw documentError('task_document_path_forbidden', '只允许范围内的相对 Markdown 路径，不接受路径穿越。');
  return raw;
}
export function assertPlainDirectory(directory: string): boolean {
  const entry = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!entry) return false;
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw documentError('task_document_path_forbidden', '文档目录不能是符号链接或非普通目录。');
  return true;
}
export function assertPlainPath(root: string, relative: string): string {
  if (!isInside(root, path.resolve(root, relative))) throw documentError('task_document_path_forbidden', '文档路径越界。');
  assertPlainDirectory(root);
  let current = root;
  const segments = relative.split('/');
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink() || (stat && index < segments.length - 1 && !stat.isDirectory())) throw documentError('task_document_path_forbidden', '不能通过符号链接或非普通目录读取任务文档。');
  }
  return current;
}
export function readBoundedText(root: string, relative: string, maxBytes = MAX_TASK_DOCUMENT_BYTES): { exists: boolean; content: string | null; actualDigest: string | null } {
  const file = assertPlainPath(root, relative);
  const entry = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!entry) return { exists: false, content: null, actualDigest: null };
  if (!entry.isFile() || entry.size > maxBytes) throw documentError('task_document_unreadable', `任务文档必须是 ${maxBytes} 字节以内的普通文件。`);
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > maxBytes) throw documentError('task_document_unreadable', '任务文档不是有界普通文件。');
    const buffer = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(descriptor, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > maxBytes) throw documentError('task_document_unreadable', '任务文档超出大小限制。');
    const bytes = buffer.subarray(0, length);
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw documentError('task_document_encoding_invalid', '任务文档必须是合法 UTF-8。'); }
    return { exists: true, content, actualDigest: documentDigest(bytes) };
  } finally { fs.closeSync(descriptor); }
}

export function createTaskProjectDocumentReader(taskQuery: TaskDocumentQuery, projectQuery: TaskDocumentProjectQuery, worktreeQuery?: TaskDocumentWorktreeQuery) {
  function taskScopedProjectRoot(targetRoot: string, taskId: string, projectCode: string, project: TaskDocumentProject): string | null {
    if (!worktreeQuery) return null;
    const inspected = worktreeQuery.inspectGitWorktrees({ workspaceRoot: targetRoot, taskId });
    if (inspected.status !== 'ready' && !inspected.repositories.length) {
      if (!inspected.diagnostic || inspected.diagnostic.code === 'git_worktree_evidence_missing') return null;
      throw documentError('task_worktree_unavailable', '任务工作树当前不可读取，不能用主目录替代。', 409);
    }
    const direct = inspected.repositories.find(repository => repository.selector === `project:${projectCode}`);
    if (direct) {
      if (direct.entityType !== 'project' || direct.sourcePath !== project.source.path || direct.state !== 'ready') throw documentError('task_worktree_unavailable', '任务项目工作树身份已变化，不能读取主目录替代。', 409);
      return path.resolve(direct.checkoutPath);
    }
    const workspace = inspected.repositories.find(repository => repository.selector === 'workspace');
    if (!workspace) {
      if (inspected.repositories.some(repository => repository.selector.startsWith(`service:${projectCode}/`))) throw documentError('task_worktree_project_root_unavailable', '服务工作树不能证明完整项目文件根，不能用保留副本替代。', 409);
      return null;
    }
    if (workspace.entityType !== 'workspace' || workspace.sourcePath !== '.' || workspace.state !== 'ready') throw documentError('task_worktree_unavailable', '任务工作树身份已变化，不能读取主目录替代。', 409);
    const executionRoot = path.resolve(workspace.checkoutPath);
    const candidate = projectQuery.resolveSourceRoot(executionRoot, project.source);
    if (!isInside(executionRoot, candidate)) return null;
    assertPlainPath(executionRoot, path.relative(executionRoot, candidate));
    return candidate;
  }
  function taskProjectDocument(targetRoot: string, taskId: string, projectCode: string, documentPath: string) {
    taskActionId(taskId, 'taskId');
    const task = taskQuery.readTask(targetRoot, taskId);
    const scope = task.record.scope;
    if (!scope?.projects.includes(projectCode) && !scope?.services.some(service => service.project === projectCode) && !task.record.changes.some(reference => reference.project === projectCode)) throw documentError('task_document_scope_forbidden', '文档不在当前任务的项目范围内。', 403);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(projectCode)) throw documentError('task_document_scope_forbidden', '项目编码不合法。', 403);
    const { project } = projectQuery.projectDetail(targetRoot, projectCode);
    const projectRoot = projectQuery.resolveSourceRoot(targetRoot, project.source);
    const candidateRoot = taskScopedProjectRoot(targetRoot, taskId, projectCode, project);
    const sourceRoot = candidateRoot || projectRoot;
    // Also check ancestors inside the selected workspace, not merely the final project root.
    if (!candidateRoot && isInside(targetRoot, sourceRoot)) assertPlainPath(targetRoot, path.relative(targetRoot, sourceRoot));
    const relative = markdownPath(documentPath.startsWith('@project/') ? documentPath.slice('@project/'.length) : documentPath);
    return { schemaVersion: 'buildr.task-project-document/v1', projectCode, path: relative, name: path.posix.basename(relative), ...readBoundedText(sourceRoot, relative), provenance: candidateRoot ? 'task-worktree-candidate' as const : 'retained-project' as const };
  }
  return Object.freeze({ taskScopedProjectRoot, taskProjectDocument });
}
