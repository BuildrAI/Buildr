import fs from 'node:fs';
import path from 'node:path';
import { createNativeExecutors } from '../executors/index.ts';
import { ExecutorStorage, executorCacheCandidates } from './executor-storage.ts';
import { claim } from '../process/ownership.ts';
import { retainedRuntimeCandidates, retireRuntimeRecords, runtimeUnreferenced } from '../process/cleanup.ts';
import { observeStorageUse, removeStorageCandidate, safeStoragePath, type StorageCandidate } from '../storage/files.ts';

export interface AgentStoragePlan {
  schemaVersion: 1; dataRoot: string; generatedAt: string;
  observationComplete: boolean; items: StorageCandidate[]; diagnostics: string[];
}

/** Read-only, local profile maintenance. Account and session stores are never candidates. */
export function inspectAgentStorage(input: { dataRoot: string }): AgentStoragePlan {
  const dataRoot = path.resolve(input.dataRoot), root = path.join(dataRoot, 'agent-service');
  const use = observeStorageUse();
  const result: AgentStoragePlan = { schemaVersion: 1, dataRoot, generatedAt: new Date().toISOString(), observationComplete: use.complete, items: [], diagnostics: use.diagnostic ? [use.diagnostic] : [] };
  if (!safeStoragePath(dataRoot, root)) { result.diagnostics.push('storage_root_unsafe'); return result; }
  const cutoff = Date.now() - 24 * 60 * 60_000;
  for (const executor of createNativeExecutors()) {
    const account = path.join(root, 'connections', executor.descriptor.id);
    if (!safeStoragePath(root, account)) continue;
    const configs = [account], bindings = path.join(account, 'model-bindings');
    if (safeStoragePath(root, bindings)) for (const id of fs.readdirSync(bindings)) {
      const config = path.join(bindings, id);
      if (/^[a-f0-9]{64}$/.test(id) && safeStoragePath(root, config)) configs.push(config);
    }
    for (const config of configs) result.items.push(...executorCacheCandidates(root, executor, config, use, cutoff));
  }
  try { result.items.push(...retainedRuntimeCandidates(dataRoot, use)); }
  catch { result.diagnostics.push('runtime_inventory_unknown'); }
  return result;
}

/** Execute only objects still present, eligible and unchanged in a fresh inventory. */
export function collectAgentStorage(plan: AgentStoragePlan) {
  if (plan.schemaVersion !== 1 || !path.isAbsolute(plan.dataRoot) || !Array.isArray(plan.items)) throw new Error('agent_storage_plan_invalid');
  const root = path.join(plan.dataRoot, 'agent-service');
  if (!safeStoragePath(plan.dataRoot, root)) throw new Error('agent_storage_root_unsafe');
  const current = inspectAgentStorage({ dataRoot: plan.dataRoot });
  const candidates = new Map(current.items.map(item => [item.path, item]));
  const executors = new Map(createNativeExecutors().map(executor => [executor.descriptor.id, executor]));
  const storage = new ExecutorStorage(root);
  const results: Array<{ path: string; status: 'removed' | 'retained'; reason: string; sizeBytes: number }> = [];
  for (const expected of plan.items.filter(item => item.eligible)) {
    const item = candidates.get(expected.path);
    let reason = !item ? 'storage_no_longer_candidate' : item.kind !== expected.kind || item.identity !== expected.identity ? 'storage_changed' : item.reason;
    let removed = false, lock: ReturnType<typeof claim> | undefined;
    if (item?.eligible && item.kind === expected.kind && item.identity === expected.identity) {
      try {
        lock = claim(plan.dataRoot, 'storage');
        const executor = item.kind === 'cache' ? executors.get(path.relative(root, item.ownerRoot).split(path.sep)[1]!) : undefined;
        const policy = !executor?.storage?.canReclaim || executor.storage.canReclaim(item.ownerRoot, path.relative(item.ownerRoot, item.path));
        if (!policy || executor && !storage.preserveSnapshot(executor, item.ownerRoot, item.path)) reason = 'cache_seed_or_contents_retained';
        else {
          removed = removeStorageCandidate(root, item, observeStorageUse, () => item.kind !== 'runtime' || runtimeUnreferenced(plan.dataRoot, item.path));
          if (removed && item.kind === 'runtime') {
            try { retireRuntimeRecords(plan.dataRoot, item.path); } catch { current.diagnostics.push('runtime_metadata_retained:' + item.path); }
          }
          if (!removed) reason = 'storage_recheck_retained';
        }
      } catch { reason = 'storage_collection_failed'; }
      finally { lock?.release(); }
    }
    results.push({ path: expected.path, status: removed ? 'removed' : 'retained', reason: removed ? 'unused_rebuildable' : reason, sizeBytes: item?.sizeBytes ?? expected.sizeBytes });
  }
  return { schemaVersion: 1 as const, dataRoot: plan.dataRoot, results, removedBytes: results.filter(item => item.status === 'removed').reduce((sum,item) => sum + item.sizeBytes, 0), diagnostics: current.diagnostics };
}
