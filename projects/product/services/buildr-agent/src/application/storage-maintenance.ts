import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createNativeExecutors } from '../executors/index.ts';
import { configRoot as nativeConfigRoot } from './native-content-resolver.ts';
import { ExecutorStorage, executorCacheCandidates } from './executor-storage.ts';
import { claim } from '../process/ownership.ts';
import { sharedCacheCandidates, sharedCacheReclaimable, sharedCachePolicy } from '../storage/shared-cache.ts';
import { discoverHomeStorage } from '../storage/home-discovery.ts';
import { runtimeObjectCandidates, runtimeObjectUnreferenced } from '../storage/runtime-objects.ts';
import { runtimeSharingCandidates, shareRetainedRuntime } from '../process/runtime-sharing.ts';
import { retainedRuntimeCandidates, retireRuntimeRecords, runtimeUnreferenced } from '../process/cleanup.ts';
import { observeStorageUse, removeStorageCandidate, removeDiagnosticFileBatch, safeStoragePath, safeStorageResource, type StorageCandidate } from '../storage/files.ts';
import { testArtifactCandidates, testArtifactUnreferenced } from '../storage/test-artifacts.ts';
import type { HomeDiscoveryCursor } from '../storage/home-discovery.ts';
import { diagnosticCandidates, diagnosticUnreferenced } from '../storage/diagnostics.ts';
import { ConversationRepository } from '../persistence/conversation-repository.ts';

export interface AgentStoragePlan {
  schemaVersion: 1; dataRoot: string; generatedAt: string;
  homeStorage?: ReturnType<typeof discoverHomeStorage>; sharedCachePolicy?: typeof sharedCachePolicy;
  observationComplete: boolean; items: StorageCandidate[]; diagnostics: string[];
}

/** Native release proof is supplied by the owning runtime; all expensive file
 * and process observations run in the same maintenance worker entry. */
export function collectReleasedExecutorStorage(dataRoot: string, provider: string, config: string): void {
  const root = path.join(dataRoot, 'agent-service'), account = path.join(root, 'connections', provider);
  const executor = createNativeExecutors().find(item => item.descriptor.id === provider);
  if (!executor || !safeStoragePath(root, config) || config !== account && !/^model-bindings\/[a-f0-9]{64}$/.test(path.relative(account, config).split(path.sep).join('/'))) return;
  const lock = claim(dataRoot, 'storage');
  try {
    const storage = new ExecutorStorage(root), use = observeStorageUse();
    for (const item of executorCacheCandidates(root, executor, config, use, Infinity, true)) {
      try { if (item.eligible && storage.preserveSnapshot(executor, config, item.path)) removeStorageCandidate(root, item); } catch { /* Retain a failed cache. */ }
    }
  } finally { lock.release(); }
}

/** Read-only, local profile maintenance. Native session bodies and accounts are never candidates. */
export function inspectAgentStorage(input: { dataRoot: string; homeCursor?:HomeDiscoveryCursor;scanHomes?:boolean }): AgentStoragePlan {
  const dataRoot = path.resolve(input.dataRoot), root = path.join(dataRoot, 'agent-service');
  const use = observeStorageUse();
  const result: AgentStoragePlan = { schemaVersion: 1, dataRoot, generatedAt: new Date().toISOString(), observationComplete: use.complete, items: [], diagnostics: use.diagnostic ? [use.diagnostic] : [] };
  if (!safeStoragePath(dataRoot, root)) { result.diagnostics.push('storage_root_unsafe'); return result; }
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const references = legacyCacheReferences(root, new ConversationRepository(root));
  const dependencies = references.dependencies;
  for (const executor of createNativeExecutors()) {
    const account = path.join(root, 'connections', executor.descriptor.id);
    if (!safeStoragePath(root, account)) continue;
    const configs = [account], bindings = path.join(account, 'model-bindings');
    if (safeStoragePath(root, bindings)) for (const id of fs.readdirSync(bindings)) {
      const config = path.join(bindings, id);
      if (/^[a-f0-9]{64}$/.test(id) && safeStoragePath(root, config)) configs.push(config);
    }
    for (const config of configs) {
      result.items.push(...executorCacheCandidates(root, executor, config, use, cutoff,false,references(config)));
      result.items.push(...testArtifactCandidates(root, config, use, cutoff));
      result.items.push(...nestedStoppedRuntimeCandidates(root, config, use));
      try { result.items.push(...diagnosticCandidates(root, executor, config, use, dependencies, Date.now())); }
      catch { result.diagnostics.push('diagnostic_inventory_unknown:' + executor.descriptor.id); }
    }
  }
  try { result.items.push(...retainedRuntimeCandidates(dataRoot, use), ...runtimeSharingCandidates(dataRoot, use), ...runtimeObjectCandidates(root, use)); }
  catch { result.diagnostics.push('runtime_inventory_unknown'); }
  result.items.push(...sharedCacheCandidates(root,use,dependencies));
  result.sharedCachePolicy=sharedCachePolicy;
  if(input.scanHomes!==false)result.homeStorage=discoverHomeStorage(root,{cursor:input.homeCursor});
  return result;
}

/** Execute only objects still present, eligible and unchanged in a fresh inventory. */
export function collectAgentStorage(plan: AgentStoragePlan, maximumItems = 128, options:{budgetMs?:number}={}) {
  if (plan.schemaVersion !== 1 || !path.isAbsolute(plan.dataRoot) || !Array.isArray(plan.items)) throw new Error('agent_storage_plan_invalid');
  const root = path.join(plan.dataRoot, 'agent-service');
  if (!safeStoragePath(plan.dataRoot, root)) throw new Error('agent_storage_root_unsafe');
  const current = inspectAgentStorage({ dataRoot: plan.dataRoot,scanHomes:false });
  const candidates = new Map(current.items.map(item => [item.kind + ":" + item.path, item]));
  const executors = new Map(createNativeExecutors().map(executor => [executor.descriptor.id, executor]));
  const storage = new ExecutorStorage(root);
  const repository = new ConversationRepository(root);
  const cacheUnreferenced=(item:StorageCandidate)=>{
    if(!item.retire)return true;
    const dependencies = legacyCacheReferences(root, repository)(item.ownerRoot);
    return dependencies.complete && dependencies.contexts.length === 0 && (!dependencies.strictOccupancy || !item.useRoot);
  };
  const limit = Number.isSafeInteger(maximumItems) ? Math.max(0, Math.min(1024, maximumItems)) : 0;
  const deadline=Date.now()+Math.max(100,Math.min(options.budgetMs??10000,30000));
  const results: Array<{ path: string; status: 'removed' | 'retained' | 'shared'; reason: string; sizeBytes: number }> = [];
  let attempted = 0;
  const pending=plan.items.filter(item=>item.eligible).sort((a,b)=>b.sizeBytes-a.sizeBytes),handled=new Set<string>();
  for (const expected of pending) {
    if(handled.has(expected.path))continue;
    const item = candidates.get(expected.kind + ":" + expected.path);
    let reason = !item ? 'storage_no_longer_candidate' : item.kind !== expected.kind || item.identity !== expected.identity ? 'storage_changed' : item.reason;
    let removed = false, lock: ReturnType<typeof claim> | undefined, nestedLock: ReturnType<typeof claim> | undefined;
    if (attempted >= limit || Date.now()>deadline) {
      results.push({ path: expected.path, status: 'retained', reason: 'storage_batch_deferred', sizeBytes: item?.sizeBytes ?? expected.sizeBytes }); continue;
    }
    if (item?.eligible && item.kind === expected.kind && item.identity === expected.identity) {
      if(item.kind==='diagnostic'&&item.sizeBytes<=256*1024&&safeStorageResource(root,item.path,64)) {
        const group:Array<{expected:StorageCandidate;item:StorageCandidate}>=[];
        for(const value of pending){
          if(group.length>=Math.min(256,limit-attempted))break;
          if(handled.has(value.path))continue;
          const candidate=candidates.get(value.kind + ":" + value.path);
          if(candidate?.eligible&&candidate.kind==='diagnostic'&&value.kind===candidate.kind&&candidate.identity===value.identity&&candidate.sizeBytes<=256*1024&&safeStorageResource(root,candidate.path,64))group.push({expected:value,item:candidate});
        }
        let groupLock:ReturnType<typeof claim>|undefined;let removed=new Set<string>();
        try {
          groupLock=claim(plan.dataRoot,'storage');
          removed=new Set(removeDiagnosticFileBatch(root,group.map(value=>value.item),value=>diagnosticUnreferenced(value,value.diagnostic?.contextId?repository.storageDependencies():{complete:true,contexts:[]}),observeStorageUse,deadline));
        }catch{/* Lock or observation failure only defers this group. */}finally{groupLock?.release();}
        for(const value of group){handled.add(value.item.path);results.push({path:value.item.path,status:removed.has(value.item.path)?'removed':'retained',reason:removed.has(value.item.path)?'unused_diagnostic':Date.now()>deadline?'storage_batch_deferred':'storage_recheck_retained',sizeBytes:value.item.sizeBytes});}
        attempted+=group.length;continue;
      }
      attempted++;
      try {
        lock = claim(plan.dataRoot, 'storage');
        const runtimeDataRoot = item.runtimeDataRoot ?? plan.dataRoot;
        if (item.runtimeDataRoot && item.runtimeDataRoot !== plan.dataRoot) nestedLock = claim(item.runtimeDataRoot, 'storage');
        const executor = item.kind === 'cache' ? executors.get(path.relative(root, item.ownerRoot).split(path.sep)[1]!) : undefined;
        const policy = item.retire || !executor?.storage?.canReclaim || executor.storage.canReclaim(item.ownerRoot, path.relative(item.ownerRoot, item.path));
        if (!policy || executor && !storage.preserveSnapshot(executor, item.ownerRoot, item.path)) reason = 'cache_seed_or_contents_retained';
        else {
          removed = item.kind === 'runtime-share' ? shareRetainedRuntime(root, item, deadline) : removeStorageCandidate(root, item, observeStorageUse, directory => item.retire ? cacheUnreferenced(item) : item.kind === 'runtime'
            ? runtimeUnreferenced(runtimeDataRoot, item.path) : item.kind === 'shared-cache' ? sharedCacheReclaimable(root,item,observeStorageUse(),repository.storageDependencies()) : item.kind === 'runtime-object' ? runtimeObjectUnreferenced(directory, path.basename(item.path)) : item.kind === 'test-artifact' ? testArtifactUnreferenced(directory, item.path) : item.kind !== 'diagnostic' || diagnosticUnreferenced(item, repository.storageDependencies()));
          if (removed && item.kind === 'runtime') {
            try { retireRuntimeRecords(runtimeDataRoot, item.path); } catch { current.diagnostics.push('runtime_metadata_retained:' + item.path); }
          }
          if (!removed) reason = 'storage_recheck_retained';
        }
      } catch { reason = 'storage_collection_failed'; }
      finally { nestedLock?.release(); lock?.release(); }
    }
    results.push({ path: expected.path, status: removed ? item?.kind === 'runtime-share' ? 'shared' : 'removed' : 'retained', reason: removed ? item?.kind === 'runtime-share' ? 'identical_runtime_objects_shared' : item?.retire ? 'legacy_rebuildable_retired' : 'unused_rebuildable' : reason, sizeBytes: item?.sizeBytes ?? expected.sizeBytes });
  }
  return { schemaVersion: 1 as const, dataRoot: plan.dataRoot, results, removedBytes: results.filter(item => item.status === 'removed').reduce((sum,item) => sum + item.sizeBytes, 0), migratedBytes: 0, diagnostics: current.diagnostics };
}

/** Older development commands used the private HOME as a default app root.
 * Only authenticated, confirmed shutdown receipts use timely cleanup here;
 * ordinary/crashed profiles retain their current, pending and rollback units. */
function nestedStoppedRuntimeCandidates(root: string, config: string, use: import('../storage/files.ts').StorageUse): StorageCandidate[] {
  const base = path.join(config, 'home/Library/Application Support');
  const profiles = [path.join(base, 'Buildr Dev')], previews = path.join(base, 'Buildr/previews');
  if (safeStoragePath(root, previews)) for (const name of fs.readdirSync(previews)) {
    const profile = path.join(previews, name);
    if (safeStoragePath(root, profile)) profiles.push(profile);
  }
  return profiles.filter(profile => safeStoragePath(root, profile)).flatMap(profile => {
    try { return [...retainedRuntimeCandidates(profile, use, undefined, Date.now(), true), ...runtimeSharingCandidates(profile, use)].map(item => ({ ...item, runtimeDataRoot: profile })); }
    catch { return []; }
  });
}

/** Resolve authoritative references to their actual private configuration. One
 * busy binding must not pin unrelated legacy HOMEs. Unresolvable or replaced
 * binding identities retain that provider's caches conservatively. */
export function legacyCacheReferences(root: string, repository: Pick<ConversationRepository, 'storageDependencies'>) {
  const configs = new Set<string>(), unknown = new Set<string>(), observed = new Set<string>(), consumers = new Set<string>(), quiescent = new Set<string>();
  // This observation is cache-only; native diagnostic/recovery dependencies below
  // retain the original strict evidence set. Failure retains ambiguous consumers.
  let liveGroups: Set<number> | undefined;
  try {
    const result = spawnSync('/bin/ps', ['-axo', 'pgid='], {encoding:'utf8',timeout:1000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});
    const lines = result.stdout?.trim().split(/\s+/) ?? [];
    if (!result.error && result.status === 0 && !result.stderr.trim() && lines.length && lines.every(value => /^\d+$/.test(value))) liveGroups = new Set(lines.map(Number));
  } catch { /* Incomplete process observation retains old consumers. */ }
  const dependencies = repository.storageDependencies((record, participant, bindingIdentity, consumer) => {
    observed.add(participant.provider);
    let requiresQuiescence = false;
    if (consumer && !consumer.pending) {
      const run = consumer.run, group = consumer.executionRef?.data?.resourceGroup;
      const ended = run && ['completed','failed','stopped'].includes(run.status) && run.executionState === 'ended' && run.tools.every(tool => tool.status === 'completed');
      if (run?.resourcesReleased === true || ended && Number.isSafeInteger(group) && Number(group) > 1 && liveGroups && !liveGroups.has(Number(group))) return;
      // Pre-acceptance failures have no owned execution to release. Their whole
      // config must be process-quiescent; never narrow this case to cache files.
      requiresQuiescence = Boolean(run && ['failed','stopped','unknown'].includes(run.status) && run.accepted === false && !consumer.executionRef && run.tools.length === 0);
    }
    const resolved = bindingIdentity && bindingIdentity !== participant.bindingIdentity ? undefined : nativeConfigRoot(root, record, participant);
    if (requiresQuiescence && resolved) { quiescent.add(resolved); quiescent.add(path.join(root, 'connections', participant.provider)); return; }
    consumers.add(participant.provider);
    const config = resolved;
    if (config) configs.add(config); else unknown.add(participant.provider);
  });
  // Callers without scoped evidence (old readers/test doubles) retain the
  // provider rather than interpreting a missing callback as no references.
  return Object.assign((config: string) => {
    const provider = path.relative(root, config).split(path.sep)[1];
    const contexts = dependencies.contexts.filter(context => context.startsWith(provider + ':'));
    const sharedConnection = config === path.join(root, 'connections', provider!);
    const protectedScope = configs.has(config) || unknown.has(provider!) || contexts.length > 0 && !observed.has(provider!) || sharedConnection && consumers.has(provider!);
    return {complete: dependencies.complete, strictOccupancy: quiescent.has(config), contexts: protectedScope ? contexts.length ? contexts : [provider + ':pending-native-context'] : []};
  }, {dependencies});
}
