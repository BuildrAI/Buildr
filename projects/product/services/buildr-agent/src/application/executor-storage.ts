import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentExecutor, AgentRuntime, ExecutorOpenOptions } from '../contracts.ts';
import { claim, privateDirectory } from '../process/ownership.ts';
import { ensureStorageDirectory, observeStorageUse, removeStorageCandidate, safeStoragePath, storageCandidate, type StorageCandidate, type StorageUse } from '../storage/files.ts';

/** Service-owned storage lifecycle; vendor adapters only name regenerable directories. */
export class ExecutorStorage {
  private readonly bindings = new WeakMap<AgentRuntime, { root: string; executor: AgentExecutor }>();
  private readonly root: string;
  constructor(root: string) { this.root = root; }

  options(executor: AgentExecutor, options: ExecutorOpenOptions): ExecutorOpenOptions {
    if (!executor.storage) return options;
    const connection = path.join(this.root, 'connections', options.connectionId);
    if (!/^[a-z][a-z0-9-]*$/.test(options.connectionId)) throw new Error('agent_storage_connection_invalid');
    privateDirectory(this.root);
    privateDirectory(path.join(this.root, 'connections'));
    if (!safeStoragePath(this.root, path.join(this.root, 'connections'))) throw new Error('agent_storage_path_unsafe');
    privateDirectory(connection);
    if (!safeStoragePath(this.root, connection)) throw new Error('agent_storage_path_unsafe');
    try {
      for (const part of ['cache', 'cache/npm', 'cache/node-compile']) {
        const directory = path.join(connection, part); privateDirectory(directory);
        if (!safeStoragePath(this.root, directory)) throw new Error('agent_storage_path_unsafe');
      }
    } catch { return options; } // Optional cache damage cannot gate a safe private native context.
    // Priming is optional and never delays admission behind another maintenance process.
    let lock: ReturnType<typeof claim> | undefined;
    try {
      lock = claim(path.dirname(this.root), 'storage');
      for (const snapshot of executor.storage.snapshots ?? []) {
        const seed = path.join(connection, 'cache', snapshot.key), target = path.join(options.configRoot, snapshot.relative);
        if (!/^[a-z][a-z0-9-]*$/.test(snapshot.key) || fs.existsSync(target) || !safeStoragePath(this.root, seed) || !snapshot.identity(seed)) continue;
        ensureStorageDirectory(this.root, path.dirname(target));
        const staged = path.join(path.dirname(target), '.prime-' + randomUUID());
        try {
          this.copySnapshot(seed, staged);
          if (!fs.existsSync(target)) fs.renameSync(staged, target);
        } finally { if (fs.existsSync(staged)) fs.rmSync(staged, { recursive: true }); }
      }
    } catch { /* Native cache creation remains the compatibility fallback. */ }
    finally { lock?.release(); }
    return { ...options, cacheRoot: path.join(connection, 'cache') };
  }

  opened(runtime: AgentRuntime, executor: AgentExecutor, root: string): AgentRuntime {
    this.bindings.set(runtime, { root, executor }); return runtime;
  }

  async released(runtime: AgentRuntime): Promise<void> {
    const binding = this.bindings.get(runtime);
    if (!binding || !binding.executor.storage?.transientDirectories.some(relative => fs.existsSync(path.join(binding.root, relative)))) return;
    if (!runtime.closed || !await runtime.canReclaimStorage?.()) return;
    const lock = claim(path.dirname(this.root), 'storage');
    try {
      const use = observeStorageUse();
      for (const item of executorCacheCandidates(this.root, binding.executor, binding.root, use, Infinity)) {
        try { if (item.eligible && this.preserveSnapshot(binding.executor, binding.root, item.path)) removeStorageCandidate(this.root, item); } catch { /* Retain a failed cache; never change session state. */ }
      }
    } finally { lock.release(); }
  }

  /** Caller holds storage lock. A retained seed prevents re-downloading the checkout every turn. */
  preserveSnapshot(executor: AgentExecutor, configRoot: string, directory: string): boolean {
    const snapshot = executor.storage?.snapshots?.find(item => path.join(configRoot, item.relative) === directory);
    if (!snapshot) return true;
    const identity = snapshot.identity(directory);
    if (!identity || !/^[a-z][a-z0-9-]*$/.test(snapshot.key)) return false;
    const cache = path.join(this.root, 'connections', executor.descriptor.id, 'cache'); ensureStorageDirectory(this.root, cache);
    const seed = path.join(cache, snapshot.key);
    if (fs.existsSync(seed)) {
      if (!safeStoragePath(this.root, seed)) return false;
      const prior = snapshot.identity(seed); if (!prior) return false; if (prior === identity) return true;
    }
    const staged = path.join(cache, '.seed-' + randomUUID()), retired = path.join(cache, '.retired-' + randomUUID());
    try {
      this.copySnapshot(directory, staged);
      if (snapshot.identity(staged) !== identity) return false;
      if (fs.existsSync(seed)) fs.renameSync(seed, retired);
      fs.renameSync(staged, seed); return true;
    } catch { if (fs.existsSync(retired) && !fs.existsSync(seed)) fs.renameSync(retired, seed); return false; }
    finally { for (const temporary of [staged, retired]) if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true }); }
  }

  private copySnapshot(source: string, target: string): void {
    try { fs.cpSync(source, target, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE_FORCE }); }
    catch (error) { if (fs.existsSync(target)) fs.rmSync(target, { recursive: true }); throw error; }
  }
}

export function executorCacheCandidates(root: string, executor: AgentExecutor, configRoot: string, use: StorageUse, cutoff: number): StorageCandidate[] {
  const candidates: StorageCandidate[] = [];
  for (const relative of executor.storage?.transientDirectories ?? []) {
    // Declarations are trusted adapter code, still never permit whole configs or traversal.
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => !part || part === '.' || part === '..') || relative.split(/[\\/]/).length < 2) continue;
    const directory = path.join(configRoot, relative);
    if (fs.existsSync(directory)) {
      const item = storageCandidate(root, 'cache', directory, configRoot, use, cutoff);
      if (item.eligible && executor.storage?.canReclaim && !executor.storage.canReclaim(configRoot, relative)) { item.eligible = false; item.reason = 'cache_contents_retained'; }
      candidates.push(item);
    }
  }
  return candidates;
}
