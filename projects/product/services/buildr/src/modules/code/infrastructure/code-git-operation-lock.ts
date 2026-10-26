import path from 'node:path';
import { acquireExclusiveFileLock, releaseExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';
import { codeFailure, gitCommonDirectory, type CodeSource } from './code-file-reader.ts';

const operations = new Map<string, symbol>();

/** Serializes this application's writes across all checkouts sharing Git refs.
 * The exclusive file lock inside the shared Git common directory keeps every
 * entry point — write Workers, the HTTP process and the CLI — mutually exclusive;
 * a dead owner's record is reclaimed by the shared lock implementation. */
export function acquireCodeGitOperation(source: CodeSource): () => void {
  const common = gitCommonDirectory(source.location);
  if (operations.has(common)) throw codeFailure('code_git_operation_in_progress', '该代码库已有 Git 操作进行中，请等待完成后刷新。', 409);
  let lock: any;
  try { lock = acquireExclusiveFileLock(path.join(common, 'buildr-operation.lock'), common, { timeoutMs: 0 }); }
  catch (error) {
    if ((error as any)?.code === 'buildr_exclusive_file_lock_timeout') throw codeFailure('code_git_operation_in_progress', '该代码库已有 Git 操作进行中，请等待完成后刷新。', 409);
    throw codeFailure('code_git_operation_unavailable', '无法取得该代码库的 Git 操作许可，请刷新后重试。', 409);
  }
  const token = Symbol(common);
  operations.set(common, token);
  return () => {
    if (operations.get(common) === token) operations.delete(common);
    try { releaseExclusiveFileLock(lock); } catch { /* A broken lock record becomes stale for the next operation. */ }
  };
}
