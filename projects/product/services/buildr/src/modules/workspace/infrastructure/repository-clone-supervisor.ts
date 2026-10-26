import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { atomicWriteJson } from '../../../infrastructure/filesystem/atomic-files.ts';
import { acquireExclusiveFileLock, releaseExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';
import { resolveSourceRoot } from './workspace-source-filesystem.ts';

export type RepositoryCloneState = 'cloning' | 'failed';
export type RepositoryCloneStatus = { state: RepositoryCloneState | null; diagnostic: string | null; startedAt: string | null };
export type RepositoryCloneRequest = { status: 'started' | 'already-running' | 'ready' | 'unavailable'; diagnostic: string | null };
type Repository = { id: string; source: any };
type CloneRecord = { schemaVersion: 'buildr.repository-clone/v1'; location: string; token: string; state: 'cloning' | 'failed' | 'ready'; diagnostic: string | null; startedAt: string; ownerPid: number; childPid: number | null };
type Entry = { record: CloneRecord; child: ChildProcess; stopped: string | null };
const CLONE_TIMEOUT_MS = 10 * 60 * 1000;
const emptyStatus: RepositoryCloneStatus = { state: null, diagnostic: null, startedAt: null };

function cloneEnvironment(inherited: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(Object.entries(inherited).filter(([name]) => !name.toUpperCase().startsWith('GIT_')));
  return { ...environment, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: '0' };
}
function directoryHasContent(location: string): boolean {
  try { return fs.statSync(location).isDirectory() && fs.readdirSync(location).length > 0; } catch { return false; }
}
function recordPath(root: string, location: string): string {
  return path.join(root, '.buildr', 'local', 'repository-clones', crypto.createHash('sha256').update(location).digest('hex') + '.json');
}
function readRecord(file: string, location: string): CloneRecord | null {
  let record: CloneRecord;
  try { record = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('克隆结果记录无法读取，已保留本机目录，请检查后重试。'); }
  if (record?.schemaVersion !== 'buildr.repository-clone/v1' || record.location !== location ||
    !['cloning', 'failed', 'ready'].includes(record.state) || typeof record.token !== 'string' || !record.token ||
    typeof record.startedAt !== 'string' || !Number.isSafeInteger(record.ownerPid) || record.ownerPid <= 0 ||
    !(record.childPid === null || (Number.isSafeInteger(record.childPid) && record.childPid > 0))) throw new Error('克隆结果记录无效，已保留本机目录，请检查后重试。');
  return record;
}
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}
function observedStatus(record: CloneRecord | null): RepositoryCloneStatus {
  if (!record || record.state === 'ready') return { ...emptyStatus };
  if (record.state === 'failed') return { state: 'failed', diagnostic: record.diagnostic, startedAt: record.startedAt };
  if (alive(record.childPid ?? record.ownerPid)) return { state: 'cloning', diagnostic: null, startedAt: record.startedAt };
  return { state: 'failed', diagnostic: '上次克隆已中断，未确认完成；已保留目标目录，请检查后重试。', startedAt: record.startedAt };
}
function tailLines(text: string): string { return text.split('\n').map(line => line.trim()).filter(Boolean).slice(-4).join(' '); }
const activeSupervisors = new Set<{ hasCloning(): boolean }>();
export function repositoryClonesIdle(): Promise<void> {
  return new Promise(resolve => {
    const check = () => { if (![...activeSupervisors].some(supervisor => supervisor.hasCloning())) resolve(); else setTimeout(check, 20); };
    check();
  });
}

/** Git writes directly to the declared directory. Only its successful close
 * records completion; a persisted unfinished attempt survives host restarts. */
export function createRepositoryCloneSupervisor({ timeoutMs = CLONE_TIMEOUT_MS, spawnGit = spawn }: { timeoutMs?: number; spawnGit?: typeof spawn } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Clone timeout must be positive and bounded.');
  const states = new Map<string, Entry>();
  let closed = false;
  const self = { hasCloning: () => [...states.values()].some(entry => entry.record.state === 'cloning') };
  activeSupervisors.add(self);
  const key = (root: string, id: string) => path.resolve(root) + '\0' + id;

  function status(root: string, repositoryId: string, repository?: Repository): RepositoryCloneStatus {
    const current = states.get(key(root, repositoryId));
    const location = repository ? resolveSourceRoot(root, repository.source) : current?.record.location;
    if (!location) return { ...emptyStatus };
    if (current && current.record.location === location && current.record.state === 'cloning') return { state: 'cloning', diagnostic: null, startedAt: current.record.startedAt };
    try {
      const record = readRecord(recordPath(root, location), location);
      return observedStatus(current && current.record.location === location && current.record.token === record?.token ? current.record : record);
    }
    catch (error) {
      if (current && current.record.location === location && current.record.state === 'ready') return { ...emptyStatus, diagnostic: (error as Error).message };
      return { state: 'failed', diagnostic: (error as Error).message, startedAt: null };
    }
  }

  function ensure(root: string, repository: Repository): RepositoryCloneRequest {
    if (closed) return { status: 'unavailable', diagnostic: '克隆执行器已关闭。' };
    if (!repository || repository.source?.type !== 'git' || !repository.source.git?.url) return { status: 'unavailable', diagnostic: null };
    const location = resolveSourceRoot(root, repository.source), file = recordPath(root, location);
    const current = states.get(key(root, repository.id));
    if (current?.record.state === 'cloning') return { status: 'already-running', diagnostic: null };
    let lock: ReturnType<typeof acquireExclusiveFileLock>;
    try { lock = acquireExclusiveFileLock(file + '.lock', location, { timeoutMs: 0 }); }
    catch { return { status: 'unavailable', diagnostic: '该目录的克隆准备正在处理，请稍后重试。' }; }
    try {
      const previous = readRecord(file, location);
      const observed = observedStatus(current && current.record.token === previous?.token ? current.record : previous);
      if (observed.state === 'cloning') return { status: 'already-running', diagnostic: null };
      if (previous?.state === 'cloning' && previous.childPid === null) return { status: 'unavailable', diagnostic: '上次克隆启动中断，子进程身份未能确认；已保留记录和目录，不能自动重复下载。' };
      if (directoryHasContent(location)) {
        if (observed.state === 'failed') return { status: 'unavailable', diagnostic: '上次克隆未完成，目标目录仍有内容，已保留；请先检查该目录后重试。' };
        return { status: 'ready', diagnostic: null };
      }
      fs.mkdirSync(path.dirname(location), { recursive: true });
      const record: CloneRecord = { schemaVersion: 'buildr.repository-clone/v1', location, token: crypto.randomUUID(), state: 'cloning', diagnostic: null, startedAt: new Date().toISOString(), ownerPid: process.pid, childPid: null };
      // Record before spawning: even an abrupt exit cannot turn partial files
      // into evidence of a completed clone. Existing content is never removed.
      atomicWriteJson(file, record);
      const args = ['clone'];
      const branch = repository.source.git.integrationBranch || null;
      if (branch) args.push('--branch', branch, '--single-branch');
      args.push('--', repository.source.git.url, location);
      const child = spawnGit('git', args, { env: cloneEnvironment(), stdio: ['ignore', 'ignore', 'pipe'], detached: process.platform !== 'win32' });
      record.childPid = child.pid ?? null;
      const entry: Entry = { record, child, stopped: null };
      states.set(key(root, repository.id), entry);
      let stderr = '', processError: Error | null = null;
      child.stderr!.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-16 * 1024); });
      let force: ReturnType<typeof setTimeout> | undefined;
      const stop = (reason: string) => {
        entry.stopped ||= reason;
        const kill = (signal: NodeJS.Signals) => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* Already exited. */ } };
        kill('SIGTERM');
        force ||= setTimeout(() => kill('SIGKILL'), 1000);
        force.unref();
      };
      // Keep stop with this entry so close uses the same bounded process cleanup.
      child.once('error', error => { processError = error; });
      const timeout = setTimeout(() => stop('克隆超时，已停止下载。'), timeoutMs);
      timeout.unref();
      const onClose = (code: number | null) => {
        clearTimeout(timeout); if (force) clearTimeout(force);
        record.state = code === 0 && !entry.stopped && !processError && directoryHasContent(location) ? 'ready' : 'failed';
        record.diagnostic = record.state === 'ready' ? null : entry.stopped || processError?.message || tailLines(stderr) || (code === null ? '克隆已中止。' : `git clone 未完成（退出码 ${code}）。`);
        try {
          // A declaration can be changed while Git runs; never overwrite a newer attempt.
          const settledLock = acquireExclusiveFileLock(file + '.lock', location, { timeoutMs: 0 });
          try { if (readRecord(file, location)?.token === record.token) atomicWriteJson(file, record); }
          finally { releaseExclusiveFileLock(settledLock); }
        } catch (error) { record.diagnostic = `克隆结果未能保存：${(error as Error).message}`; }
        if (closed && !self.hasCloning()) activeSupervisors.delete(self);
      };
      child.once('close', onClose);
      stops.set(entry, stop);
      try { atomicWriteJson(file, record); }
      catch { stop('克隆启动记录未能保存，已停止下载。'); }
      return { status: 'started', diagnostic: null };
    } catch (error) { return { status: 'unavailable', diagnostic: (error as Error).message }; }
    finally { releaseExclusiveFileLock(lock); }
  }
  const stops = new WeakMap<Entry, (reason: string) => void>();
  function request(root: string, repository: Repository | undefined): RepositoryCloneRequest {
    return repository ? ensure(root, repository) : { status: 'unavailable', diagnostic: '代码库不存在。' };
  }
  function idle(): Promise<void> {
    return new Promise(resolve => { const check = () => { if (!self.hasCloning()) resolve(); else setTimeout(check, 20); }; check(); });
  }
  function close(): Promise<void> {
    closed = true;
    for (const entry of states.values()) if (entry.record.state === 'cloning') stops.get(entry)?.('克隆已中止。');
    if (!self.hasCloning()) activeSupervisors.delete(self);
    return idle();
  }
  return Object.freeze({ ensure, status, request, idle, close });
}
