import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SCHEMA = 'buildr.exclusive-file-lock/v1';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_DELAY_MS = 25;

function waitSynchronously(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function lockError(message: string, code: string, file: string, cause: unknown = null): Error & Record<string, any> {
  const error: Error & Record<string, any> = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.operation = 'exclusive-file-lock';
  error.target = file;
  return error;
}

function validateRecord(value: any, target: string): any {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).sort().join(',') !== 'createdAt,pid,schemaVersion,target,token') return null;
  if (value.schemaVersion !== SCHEMA || !Number.isInteger(value.pid) || value.pid <= 0
    || typeof value.token !== 'string' || !/^[a-f0-9]{32}$/.test(value.token)
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.target !== 'string' || path.resolve(value.target) !== target) return null;
  return value;
}

function readLock(file: string, target: string, options: any = {}): any {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    let value: any = null;
    try { value = JSON.parse(raw); } catch {}
    const legacyPid = options.allowLegacyPid === true && /^[1-9]\d*$/u.test(raw.trim()) ? Number(raw.trim()) : null;
    const legacyOwner = Number.isSafeInteger(legacyPid) ? { pid: legacyPid, createdAt: 'legacy-pid-format' } : null;
    return { raw, record: validateRecord(value, target) || legacyOwner };
  } catch (error: any) {
    if (error.code === 'ENOENT') return null;
    throw lockError(`Cannot read exclusive filesystem lock ${file}: ${error.message}`, 'buildr_exclusive_file_lock_read_failed', file, error);
  }
}

function ownerAlive(record: any, options: any = {}): boolean {
  if (options.ownerAlive) return options.ownerAlive(record.pid, record);
  try { process.kill(record.pid, 0); return true; }
  catch (error: any) { return error.code !== 'ESRCH'; }
}

function publishCandidate(file: string, record: any): boolean {
  const candidate = `${file}.candidate-${record.pid}-${record.token}`;
  try {
    fs.writeFileSync(candidate, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 });
    const descriptor = fs.openSync(candidate, 'r+');
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    fs.linkSync(candidate, file);
    return true;
  } catch (error: any) {
    if (error.code === 'EEXIST') return false;
    throw lockError(`Cannot acquire exclusive filesystem lock ${file}: ${error.message}`, 'buildr_exclusive_file_lock_acquire_failed', file, error);
  } finally { fs.rmSync(candidate, { force: true }); }
}

function moveAndRemove(file: string, observed: any, operationToken: string): boolean {
  const quarantine = `${file}.${operationToken}-${crypto.randomUUID()}`;
  try { fs.renameSync(file, quarantine); }
  catch (error: any) {
    if (error.code === 'ENOENT') return false;
    throw lockError(`Cannot claim exclusive filesystem lock ${file} for ${operationToken}: ${error.message}`, 'buildr_exclusive_file_lock_claim_failed', file, error);
  }
  try {
    const moved = fs.readFileSync(quarantine, 'utf8');
    if (moved !== observed.raw) {
      if (!fs.existsSync(file)) fs.renameSync(quarantine, file);
      throw lockError(`Exclusive filesystem lock ${file} changed while ${operationToken} claimed it.`, 'buildr_exclusive_file_lock_ownership_lost', file);
    }
    fs.rmSync(quarantine, { force: true });
    return true;
  } catch (error: any) {
    if (error?.code?.startsWith?.('buildr_exclusive_file_lock_')) throw error;
    throw lockError(`Cannot remove claimed exclusive filesystem lock ${file}: ${error.message}`, 'buildr_exclusive_file_lock_release_failed', file, error);
  }
}

export function acquireExclusiveFileLock(file: string, target: string, options: any = {}): any {
  const resolvedFile = path.resolve(file);
  const resolvedTarget = path.resolve(target);
  const now = options.now || Date.now;
  const pause = options.wait || waitSynchronously;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(retryDelayMs) || retryDelayMs <= 0) throw new Error('Exclusive filesystem lock timeout and retry delay must be bounded non-negative milliseconds.');
  fs.mkdirSync(path.dirname(resolvedFile), { recursive: true });
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  const record = Object.freeze({ schemaVersion: SCHEMA, pid: process.pid, token: crypto.randomBytes(16).toString('hex'), createdAt: new Date(startedAt).toISOString(), target: resolvedTarget });
  while (true) {
    if (publishCandidate(resolvedFile, record)) return Object.freeze({ owner: true, file: resolvedFile, target: resolvedTarget, record });
    const observed = readLock(resolvedFile, resolvedTarget, options);
    if (!observed) continue;
    if (observed.record && !ownerAlive(observed.record, options) && moveAndRemove(resolvedFile, observed, 'stale')) continue;
    const observedAt = now();
    if (observedAt >= deadline) {
      const owner = observed.record ? `pid=${observed.record.pid} createdAt=${observed.record.createdAt}` : 'owner=invalid-or-unknown';
      throw lockError(`Exclusive filesystem lock wait expired for ${resolvedFile}: ${owner}.`, 'buildr_exclusive_file_lock_timeout', resolvedFile);
    }
    pause(Math.min(retryDelayMs, Math.max(1, deadline - observedAt)));
  }
}

export function releaseExclusiveFileLock(lock: any): boolean {
  if (!lock?.owner || typeof lock.file !== 'string' || typeof lock.target !== 'string' || !lock.record) return false;
  const file = path.resolve(lock.file);
  const target = path.resolve(lock.target);
  const expected = validateRecord(lock.record, target);
  if (!expected) return false;
  const observed = readLock(file, target);
  if (!observed?.record || JSON.stringify(observed.record) !== JSON.stringify(expected)) return false;
  return moveAndRemove(file, observed, 'release');
}

export function withExclusiveFileLock(file: string, target: string, callback: (lock: any) => any, options: any = {}): any {
  const lock = acquireExclusiveFileLock(file, target, options);
  let result: any;
  let primaryError: any = null;
  try { options.onAcquired?.(lock); result = callback(lock); }
  catch (error) { primaryError = error; }
  if (!releaseExclusiveFileLock(lock)) throw lockError(`Exclusive filesystem lock ownership was lost before release: ${lock.file}.`, 'buildr_exclusive_file_lock_ownership_lost', lock.file, primaryError);
  if (primaryError) throw primaryError;
  return result;
}
