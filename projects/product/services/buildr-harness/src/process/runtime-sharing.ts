import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentRuntimeUnit } from '../execution-contracts.ts';
import { materializeRuntimeObject } from '../storage/runtime-objects.ts';
import { observeStorageUse, storageCandidate, storageInUse, storageVersion, type StorageCandidate, type StorageUse } from '../storage/files.ts';
import { readPrivate } from './ownership.ts';
import { runtimeUnreferenced, retainedRuntimeCandidates } from './cleanup.ts';
import { validateRuntimeContents } from './runtime-unit.ts';

/** Preserve rollback paths and manifests; only share identical immutable bytes. */
export function runtimeSharingCandidates(dataRoot: string, use: StorageUse): StorageCandidate[] {
  const root = path.join(dataRoot, 'agent-service');
  return retainedRuntimeCandidates(dataRoot, use).filter(item => !item.eligible &&
    ['runtime_rollback_retained', 'storage_recent'].includes(item.reason) && runtimeUnreferenced(dataRoot, item.path)).flatMap(item => {
    try {
      const runtime = readPrivate<AgentRuntimeUnit & {files:string[]}>(path.join(item.path, 'runtime.json'));
      if (!runtime) return [];
      validateRuntimeContents(dataRoot, runtime);
      const files = [...runtime.files.filter(name => name !== 'build/runtime-contracts.json'), path.basename(runtime.node)];
      if (!files.some(name => fs.statSync(path.join(item.path, name)).nlink === 1)) return [];
      return [{ ...storageCandidate(root, 'runtime-share', item.path, item.path, use, Infinity), runtimeDataRoot: dataRoot }];
    } catch { return []; }
  });
}

/** Existing storage lock is held. Partial work stays valid and resumes later. */
export function shareRetainedRuntime(root: string, item: StorageCandidate, deadline: number, observe = observeStorageUse): boolean {
  const dataRoot = item.runtimeDataRoot;
  if (!dataRoot || !item.identity || !item.eligible || !runtimeUnreferenced(dataRoot, item.path) ||
      storageInUse(item.path, observe()) || storageVersion(item.path).identity !== item.identity) return false;
  const runtime = readPrivate<AgentRuntimeUnit & {files:string[]}>(path.join(item.path, 'runtime.json'));
  if (!runtime) return false;
  validateRuntimeContents(dataRoot, runtime);
  const files = [...runtime.files.filter(name => name !== 'build/runtime-contracts.json'), path.basename(runtime.node)];
  for (const name of files) {
    if (Date.now() > deadline) return false;
    const file = path.join(item.path, name), before = fs.lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink()) return false;
    const object = materializeRuntimeObject(root, file, file === runtime.node ? 0o100 : undefined), info = fs.statSync(object);
    if (before.dev === info.dev && before.ino === info.ino) continue;
    const current = fs.lstatSync(file);
    if (current.dev !== before.dev || current.ino !== before.ino || current.mtimeMs !== before.mtimeMs || current.ctimeMs !== before.ctimeMs ||
        !runtimeUnreferenced(dataRoot, item.path)) return false;
    const temporary = path.join(path.dirname(file), '.share-' + randomUUID());
    try { fs.linkSync(object, temporary); fs.renameSync(temporary, file); }
    finally { fs.rmSync(temporary, {force:true}); }
  }
  validateRuntimeContents(dataRoot, runtime);
  return true;
}
