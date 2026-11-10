import path from 'node:path';
import type { AgentExecutor } from '../contracts.ts';
import { live } from '../process/ownership.ts';
import { safeStorageResource, storageInUse, storageVersion, type StorageCandidate, type StorageUse } from './files.ts';

export interface StorageDependencies { complete: boolean; contexts: readonly string[] }
export const diagnosticStabilityMs = 15 * 60_000;
const validProducer = (pid?: number): pid is number => typeof pid === 'number' && Number.isSafeInteger(pid) && pid > 0;

export function diagnosticUnreferenced(item: StorageCandidate, dependencies: StorageDependencies): boolean {
  const proof = item.diagnostic;
  if(proof?.config&&proof.database)return dependencies.complete&&dependencies.contexts.length===0;
  return validProducer(proof?.producerPid) && !live(proof.producerPid) && (!proof.contextId ||
    dependencies.complete && !dependencies.contexts.includes(`${proof.provider}:${proof.contextId}`));
}

/** Adapter declarations select resources; common policy cannot accept an arbitrary path from a plan. */
export function diagnosticCandidates(root: string, executor: AgentExecutor, config: string, use: StorageUse, dependencies: StorageDependencies, now: number, idleDependencies=dependencies): StorageCandidate[] {
  const items: StorageCandidate[] = [];
  for (const resource of executor.storage?.diagnostics?.(config) ?? []) {
    const target = path.resolve(config, resource.relativePath), relative = path.relative(config, target);
    const database=resource.quiescentDatabase&&path.resolve(config,resource.quiescentDatabase);
    const item: StorageCandidate = { kind: 'diagnostic', path: target, ownerRoot: database?config:target, sizeBytes: 0, eligible: false, reason: 'storage_path_unsafe',
      diagnostic: { provider: executor.descriptor.id, producerPid: resource.producerPid, contextId: resource.contextId, ...(database?{config,database}:{}) } };
    items.push(item);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !safeStorageResource(root, target)) continue;
    if(database&&(!['','-wal','-shm'].some(suffix=>target===database+suffix)||path.relative(config,database).startsWith('..')))continue;
    try {
      const refs=database?idleDependencies:dependencies;
      const version = storageVersion(target); item.identity = version.identity; item.sizeBytes = version.sizeBytes; item.rootChanged = version.rootChanged;
      item.reason = resource.reason ?? (!database&&!validProducer(resource.producerPid) ? 'diagnostic_identity_unknown' : validProducer(resource.producerPid)&&live(resource.producerPid) ? 'diagnostic_producer_alive' :
        !use.complete ? 'storage_usage_unknown' : storageInUse(item.ownerRoot, use) ? 'storage_in_use' :
          version.modified > now - diagnosticStabilityMs ? 'storage_recent' :
            resource.contextId && !dependencies.complete ? 'diagnostic_dependencies_unknown' :
              !diagnosticUnreferenced(item, refs) ? 'diagnostic_recovery_evidence' : 'unused_diagnostic');
      item.eligible = item.reason === 'unused_diagnostic';
    } catch { item.reason = 'storage_observation_failed'; }
  }
  return items;
}
