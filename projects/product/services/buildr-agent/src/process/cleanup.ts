import fs from 'node:fs';
import path from 'node:path';
import { claim, clearProcessRecord, controlRoot, live, readPrivate, readProcessInstances, readProcessRecord, removeProcessInstance, writePrivate } from './ownership.ts';
import { validateRuntimeContents } from './runtime-unit.ts';
import { observeStorageUse, reanchorSharedDentries, removeStorageCandidate, safeStoragePath, storageCandidate, type StorageCandidate, type StorageUse } from '../storage/files.ts';
import type { AgentRuntimeUnit } from '../execution-contracts.ts';

const day = 24 * 60 * 60_000;

/** adopted is an acknowledgement, not a future consumer of an old unit.
 * Missing/unknown states remain protected for compatibility and crash recovery. */
function pendingRuntime(dataRoot:string):AgentRuntimeUnit|undefined {
  const pending=readPrivate<{runtime?:AgentRuntimeUnit;state?:string}>(path.join(controlRoot(dataRoot),'pending.json'));
  return pending?.state==='adopted'?undefined:pending?.runtime;
}


function confirmedStop(dataRoot:string,record:ReturnType<typeof readProcessInstances>[number]):boolean {
  if(live(record.identity.pid))return false;
  const receipt=readPrivate<{instanceId:string;confirmed:boolean;history?:Array<{instanceId:string;confirmed:boolean}>}>(path.join(controlRoot(dataRoot),'last-stop.json'));
  const recorded=receipt&&(
    (receipt.confirmed&&typeof receipt.instanceId==='string'&&receipt.instanceId===record.identity.instanceId)
    || Boolean(receipt.history?.some(entry=>entry&&entry.confirmed&&typeof entry.instanceId==='string'&&entry.instanceId===record.identity.instanceId))
  );
  return Boolean(record.stopped&&record.confirmed || recorded);
}

function currentRuntime(dataRoot:string):AgentRuntimeUnit|undefined {
  const current=readProcessRecord(dataRoot);
  if(!current)return;
  const stopped=readPrivate<{instanceId:string;confirmed:boolean;history?:Array<{instanceId:string;confirmed:boolean}>}>(path.join(controlRoot(dataRoot),'last-stop.json'));
  const recorded=stopped&&(
    (stopped.confirmed&&typeof stopped.instanceId==='string'&&stopped.instanceId===current.identity.instanceId)
    || Boolean(stopped.history?.some(entry=>entry&&entry.confirmed&&typeof entry.instanceId==='string'&&entry.instanceId===current.identity.instanceId))
  );
  if(recorded&&!live(current.identity.pid))return;
  return current.identity.runtime;
}

/** Re-stat protected active/pending/live runtime trees before macOS lsof so XNU vnode path cache stays anchored on live owners rather than stale hard-linked dentries. */
export function reanchorProtectedRuntimeInodes(dataRoot: string, keep?: AgentRuntimeUnit): void {
  if (process.platform !== 'darwin') return;
  const agentRoot = path.join(dataRoot, 'agent-service');
  const directories = new Set<string>();
  if (keep?.directory) directories.add(keep.directory);
  const current = currentRuntime(dataRoot);
  if (current?.directory) directories.add(current.directory);
  const pending = pendingRuntime(dataRoot);
  if (pending?.directory) directories.add(pending.directory);
  for (const record of readProcessInstances(dataRoot)) {
    if (live(record.identity.pid) && record.identity.runtime.directory) directories.add(record.identity.runtime.directory);
  }
  for (const directory of directories) {
    if (safeStoragePath(agentRoot, directory)) reanchorSharedDentries(directory);
  }
}

export function runtimeUnreferenced(dataRoot: string, directory: string, keep?: AgentRuntimeUnit): boolean {
  const digest = path.basename(directory);
  if (keep?.digest === digest || currentRuntime(dataRoot)?.digest === digest) return false;
  if (pendingRuntime(dataRoot)?.digest === digest) return false;
  return !readProcessInstances(dataRoot).some(record => record.identity.runtime.digest === digest && live(record.identity.pid));
}

/** Disk inventory complements receipts: a dead PID is never the sole deletion proof. */
export function retainedRuntimeCandidates(dataRoot: string, use: StorageUse, keep?: AgentRuntimeUnit, now = Date.now(), confirmedOnly = false): StorageCandidate[] {
  const root = controlRoot(dataRoot), units = path.join(root, 'runtimes');
  if (!fs.existsSync(units) || !safeStoragePath(path.join(dataRoot, 'agent-service'), units)) return [];
  const records = readProcessInstances(dataRoot);
  const protectedDigests = new Set<string>();
  if (keep) protectedDigests.add(keep.digest);
  const current = currentRuntime(dataRoot); if (current) protectedDigests.add(current.digest);
  const pending = pendingRuntime(dataRoot);
  if (pending) protectedDigests.add(pending.digest);
  for (const record of records) if (live(record.identity.pid)) protectedDigests.add(record.identity.runtime.digest);
  const confirmed = new Set(records.filter(record => confirmedStop(dataRoot,record)).map(record => record.identity.runtime.digest));
  const directories = fs.readdirSync(units).filter(name => /^[a-f0-9]{64}$/.test(name) && (!confirmedOnly || confirmed.has(name)));
  const items = directories.map(digest => {
    const directory = path.join(units, digest);
    const item = storageCandidate(path.join(dataRoot, 'agent-service'), 'runtime', directory, directory, use, confirmedOnly ? Infinity : now - day);
    if (protectedDigests.has(digest)) { item.eligible = false; item.reason = 'runtime_retained_reference'; }
    if (item.eligible) {
      try {
        const manifest = readPrivate<AgentRuntimeUnit>(path.join(directory, 'runtime.json'));
        if (!manifest || manifest.digest !== digest) throw new Error('runtime_identity_invalid');
        validateRuntimeContents(dataRoot, manifest);
      } catch { item.eligible = false; item.reason = 'runtime_contents_unknown'; }
    }
    return item;
  });
  // A changed/unknown directory is not a usable rollback version.
  const rollback = items.filter(item => item.eligible).sort((a,b) => fs.lstatSync(b.path).mtimeMs - fs.lstatSync(a.path).mtimeMs)[0];
  if (!confirmedOnly && rollback) { rollback.eligible = false; rollback.reason = 'runtime_rollback_retained'; }
  return items;
}

/** Called only after the shared storage lock and fresh system/file observation. */
export function retireRuntimeRecords(dataRoot: string, directory: string): void {
  const digest = path.basename(directory);
  const historyFile = path.join(controlRoot(dataRoot), 'retired-runtimes.json');
  const history = readPrivate<string[]>(historyFile) ?? [];
  if (!history.includes(digest)) writePrivate(historyFile, [...history, digest]);
  for (const record of readProcessInstances(dataRoot)) if (record.identity.runtime.digest === digest && !live(record.identity.pid)) removeProcessInstance(dataRoot, record);
  const current=readProcessRecord(dataRoot);
  if(current?.identity.runtime.digest===digest&&!currentRuntime(dataRoot))clearProcessRecord(dataRoot,current.identity.instanceId);
  const pendingFile=path.join(controlRoot(dataRoot),'pending.json');
  const pending=readPrivate<{runtime?:AgentRuntimeUnit;state?:string}>(pendingFile);
  if(pending?.state==='adopted'&&pending.runtime?.digest===digest)fs.unlinkSync(pendingFile);
  const launch = path.join(controlRoot(dataRoot), 'launch-' + digest + '.json');
  const input = readPrivate<{dataRoot:string;runtime:AgentRuntimeUnit}>(launch);
  if (input?.dataRoot === path.resolve(dataRoot) && input.runtime.digest === digest && input.runtime.directory === directory) fs.unlinkSync(launch);
}

/** Housekeeping failure retains disk data and never changes execution or session facts. */
export function cleanupStoppedProcesses(dataRoot: string, keep: AgentRuntimeUnit, reconcile = false): void {
  // Preserve the existing timely reaping of normal, authenticated shutdowns.
  if (!reconcile && !readProcessInstances(dataRoot).some(record => confirmedStop(dataRoot,record))) return;
  const root = path.join(dataRoot, 'agent-service');
  reanchorProtectedRuntimeInodes(dataRoot, keep);
  const use = observeStorageUse();
  for (const item of retainedRuntimeCandidates(dataRoot, use, keep, Date.now(), !reconcile).filter(item => item.eligible)) {
    let lock: ReturnType<typeof claim> | undefined;
    try {
      lock = claim(dataRoot, 'storage');
      const observe = () => { reanchorProtectedRuntimeInodes(dataRoot, keep); return observeStorageUse(); };
      if (removeStorageCandidate(root, item, observe, () => runtimeUnreferenced(dataRoot, item.path, keep))) retireRuntimeRecords(dataRoot, item.path);
    } catch { /* A busy, unknown or changed directory does not stop other work. */ }
    finally { lock?.release(); }
  }
}
