import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { regenerableToolCaches, legacyDownloadRetained } from '../storage/tool-cache.ts';
import { recordSharedCacheUse } from '../storage/shared-cache.ts';
import { sharedToolchainEnvironment } from '../storage/toolchain-environment.ts';
import type { AgentExecutor, AgentRuntime, ExecutorOpenOptions } from '../contracts.ts';
import { claim, privateDirectory } from '../process/ownership.ts';
import { disposableGatewayLease, ensureStorageDirectory, observeStorageUse, safeStoragePath, storageCandidate, storageInUse, type StorageCandidate, type StorageUse } from '../storage/files.ts';

/** Service-owned storage lifecycle; vendor adapters only name regenerable directories. */
export class ExecutorStorage {
  private readonly bindings = new WeakMap<AgentRuntime, { root: string; executor: AgentExecutor; nativeRoot?: string }>();
  private readonly root: string;
  constructor(root: string) { this.root = root; }

  options(executor: AgentExecutor, options: ExecutorOpenOptions): ExecutorOpenOptions {
    options = { ...options, environment: { ...options.environment, BUILDR_APP_DATA_DIR: options.environment.BUILDR_APP_DATA_DIR || path.dirname(this.root) } };
    const connection = path.join(this.root, 'connections', options.connectionId);
    if (!/^[a-z][a-z0-9-]*$/.test(options.connectionId)) throw new Error('agent_storage_connection_invalid');
    privateDirectory(this.root);
    privateDirectory(path.join(this.root, 'connections'));
    if (!safeStoragePath(this.root, path.join(this.root, 'connections'))) throw new Error('agent_storage_path_unsafe');
    privateDirectory(connection);
    if (!safeStoragePath(this.root, connection)) throw new Error('agent_storage_path_unsafe');
    const shared = sharedToolchainEnvironment(this.root, options.environment);
    options = { ...options, environment: shared.environment, cacheRoot: shared.cacheRoot };
    if (!executor.storage) return options;
    try {
      for (const part of ['cache', 'cache/npm', 'cache/node-compile', 'cache/yarn']) {
        const directory = path.join(connection, part); privateDirectory(directory);
        if (!safeStoragePath(this.root, directory)) throw new Error('agent_storage_path_unsafe');
      }
    } catch { return options; } // Optional cache damage cannot gate a safe private native context.
    // Priming is optional and never delays admission behind another maintenance process.
    let lock: ReturnType<typeof claim> | undefined;
    try {
      lock = claim(path.dirname(this.root), 'storage');
      for (const snapshot of executor.storage.snapshots ?? []) {
        const rel = options.nativeAccountConfigRoot ? path.relative(this.root, options.nativeAccountConfigRoot) : '';
        const snapshotRoot = rel && !rel.startsWith('..') && !path.isAbsolute(rel)
          ? options.nativeAccountConfigRoot!
          : options.configRoot;
        const seed = path.join(connection, 'cache', snapshot.key), target = path.join(snapshotRoot, snapshot.relative);
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
    return options;
  }

  opened(runtime: AgentRuntime, executor: AgentExecutor, root: string, nativeRoot?: string): AgentRuntime {
    if (!this.bindings.has(runtime)) {
      const send=runtime.send;
      const observe=()=>{try{recordSharedCacheUse(this.root);}catch{/* Retain unsafe observations during maintenance. */}};
      runtime.send=async input=>{observe();try{return await send.call(runtime,input);}finally{observe();}};
    }
    this.bindings.set(runtime, { root, executor, nativeRoot }); return runtime;
  }

  async released(runtime: AgentRuntime): Promise<void> {
    const binding = this.bindings.get(runtime);
    if (!binding) return;
    const hasTransient = binding.executor.storage?.transientDirectories.some(relative => fs.existsSync(path.join(binding.root, relative))) ?? false;
    const leaseRelative = path.relative(this.root, binding.root).split(path.sep).join('/');
    const isolatedGatewayLease = Boolean(
      binding.nativeRoot
      && path.resolve(binding.nativeRoot) !== path.resolve(binding.root)
      && /^connections\/[^/]+\/model-bindings\/[a-f0-9]{64}$/.test(leaseRelative),
    );
    if (!hasTransient && !isolatedGatewayLease) return;
    if (!runtime.closed || !await runtime.canReclaimStorage?.()) return;
    if (hasTransient) {
      const worker = new Worker(new URL(import.meta.url.endsWith('.ts') ? '../process/storage-maintenance.ts' : '../process/storage-maintenance.js', import.meta.url), {
        workerData: { kind: 'agent-storage-release', dataRoot: path.dirname(this.root), provider: binding.executor.descriptor.id, configRoot: binding.root },
      });
      // Keep this narrow release alive until its rename/delete has finished.
      await new Promise<void>((resolve, reject) => { worker.once('error', reject); worker.once('exit', () => resolve()); });
    }
    if (isolatedGatewayLease) this.reclaimGatewayLeaseShell(binding.root);
  }

  private reclaimGatewayLeaseShell(leaseRoot: string): void {
    const lock = claim(path.dirname(this.root), 'storage');
    try {
      if (!safeStoragePath(this.root, leaseRoot) || !disposableGatewayLease(this.root, leaseRoot)) return;
      if (storageInUse(leaseRoot, observeStorageUse())) return;
      fs.rmSync(leaseRoot, { recursive: true, force: true });
    } catch { /* Retain unprovable or busy gateway leases safely. */ }
    finally { lock.release(); }
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

export function executorCacheCandidates(root: string, executor: AgentExecutor, configRoot: string, use: StorageUse, cutoff: number, snapshotsOnly = false, dependencies?:{complete:boolean;contexts:string[];strictOccupancy?:boolean}): StorageCandidate[] {
  const candidates: StorageCandidate[] = [];
  const legacy = snapshotsOnly ? [] : executor.storage?.legacyDirectories?.(configRoot) ?? [];
  for (const relative of [...(executor.storage?.transientDirectories ?? []), ...legacy]) {
    // Immediate native release only touches its bounded plugin snapshot; large
    // tool caches are inventoried by the existing background maintenance worker.
    if (snapshotsOnly && !executor.storage?.snapshots?.some(snapshot => snapshot.relative === relative)) continue;
    // Declarations are trusted adapter code, still never permit whole configs or traversal.
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => !part || part === '.' || part === '..') || relative.split(/[\\/]/).length < 2) continue;
    const directory = path.join(configRoot, relative);
    if (fs.existsSync(directory)) {
      // Adapter-owned bytecode can retire as a whole class. Downloads remain
      // protected here; only the verified npm merge path proves public coverage.
      const retire = regenerableToolCaches.includes(relative) || legacy.includes(relative);
      const referenced = dependencies?.contexts.some(context => context.startsWith(executor.descriptor.id + ':'));
      const narrow = retire && dependencies?.complete === true && !referenced && !dependencies.strictOccupancy;
      const item = storageCandidate(root, 'cache', directory, narrow ? directory : configRoot, use, retire ? Infinity : cutoff);
      if (retire) item.retire = true;
      if (retire && legacyDownloadRetained(relative)) { item.eligible=false;item.reason='legacy_cache_reuse_value_unverified'; }
      if (narrow) { item.ownerRoot = configRoot; item.useRoot = directory; }
      if (retire && dependencies && (!dependencies.complete || referenced)) {
        item.eligible = false;
        item.reason = dependencies.complete ? 'cache_recovery_or_execution_retained' : 'cache_reference_observation_failed';
      }
      if (!retire && item.eligible && executor.storage?.canReclaim && !executor.storage.canReclaim(configRoot, relative)) {
        item.eligible = false; item.reason = 'cache_contents_retained';
      }
      candidates.push(item);
    }
  }
  return candidates;
}
