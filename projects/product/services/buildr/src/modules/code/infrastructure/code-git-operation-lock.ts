import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { acquireExclusiveFileLock, releaseExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';
import { codeFailure, gitCommonDirectory, type CodeSource } from './code-file-reader.ts';

const operations = new Map<string, symbol>();
const heldTokens = new Set<string>();

// Write Workers share the host process pid, so pid liveness alone cannot detect
// a dead worker's lock: the lock record would keep naming the living host. The
// write executor therefore points each Worker at a registry file and reclaims
// orphaned records when a Worker exits; every acquire/release is noted here.
const registryFile = process.env.BUILDR_GIT_OPERATION_LOG || '';
/** Append one lock event; best-effort bookkeeping owned by the write executor's per-Worker registry file. */
function registryNote(event: string, lockFile: string, token = '') {
  if (!registryFile) return;
  try { fs.appendFileSync(registryFile, JSON.stringify({ event, lockFile, token }) + '\n'); } catch { /* Notes are best-effort; missing coverage only means an unclaimed candidate. */ }
}

/** Reclaim only the exact token preregistered by an exited Worker, after its
 * supervised Git children have closed. A different owner is never inferred. */
export function reclaimCodeGitOperationFile(lockFile: string, expectedToken: string): void {
  let record: { pid?: number; token?: string; target?: string } | null = null;
  try { record = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch { return; }
  if (!record || record.pid !== process.pid || record.token !== expectedToken || typeof record.target !== 'string') return;
  if (heldTokens.has(record.token!)) return;
  try { releaseExclusiveFileLock({ owner: true, file: lockFile, target: path.resolve(record.target), record }); } catch { /* Foreign or already-settled records need no action. */ }
}

/** Serializes this application's writes across all checkouts sharing Git refs.
 * The exclusive file lock inside the shared Git common directory keeps every
 * entry point — write Workers, the HTTP process and the CLI — mutually exclusive;
 * a dead owner's record is reclaimed by the shared lock implementation. */
export function acquireCodeGitOperation(source: CodeSource): () => void {
  const common = gitCommonDirectory(source.location);
  if (operations.has(common)) throw codeFailure('code_git_operation_in_progress', '该代码库已有 Git 操作进行中，请等待完成后刷新。', 409);
  const lockPath = path.join(common, 'buildr-operation.lock');
  const ownershipToken = crypto.randomBytes(16).toString('hex');
  registryNote('intent', lockPath, ownershipToken);
  let lock: any;
  try { lock = acquireExclusiveFileLock(lockPath, common, { timeoutMs: 0, token: ownershipToken }); }
  catch (error) {
    if ((error as any)?.code === 'buildr_exclusive_file_lock_timeout') throw codeFailure('code_git_operation_in_progress', '该代码库已有 Git 操作进行中，请等待完成后刷新。', 409);
    throw codeFailure('code_git_operation_unavailable', '无法取得该代码库的 Git 操作许可，请刷新后重试。', 409);
  }
  const token = Symbol(common);
  operations.set(common, token);
  heldTokens.add(lock.record.token);
  registryNote('acquire', lock.file, lock.record.token);
  return () => {
    if (operations.get(common) === token) operations.delete(common);
    try { releaseExclusiveFileLock(lock); } catch { /* A broken lock record becomes stale for the next operation. */ }
    registryNote('release', lock.file, lock.record.token);
    heldTokens.delete(lock.record.token);
  };
}
