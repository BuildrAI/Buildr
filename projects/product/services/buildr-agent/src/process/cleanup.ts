import fs from 'node:fs';
import path from 'node:path';
import { controlRoot, live, readPrivate, readProcessInstances, removeProcessInstance, writePrivate } from './ownership.ts';
import type { AgentRuntimeUnit } from '../execution-contracts.ts';

/** Reap only authenticated-owned receipts whose actual process has exited. */
export function cleanupStoppedProcesses(dataRoot: string, keep: AgentRuntimeUnit): void {
  const records = readProcessInstances(dataRoot);
  const protectedDigests = new Set([keep.digest]);
  const pending = readPrivate<{runtime?:AgentRuntimeUnit}>(path.join(controlRoot(dataRoot), 'pending.json'));
  if (pending?.runtime) protectedDigests.add(pending.runtime.digest);
  for (const record of records) if (!record.stopped || !record.confirmed || live(record.identity.pid)) protectedDigests.add(record.identity.runtime.digest);
  for (const record of records) {
    if (!record.stopped || !record.confirmed || live(record.identity.pid)) continue;
    const runtime = record.identity.runtime;
    const historyFile = path.join(controlRoot(dataRoot),'retired-runtimes.json');
    const history = readPrivate<string[]>(historyFile) ?? [];
    if (!history.includes(runtime.digest)) writePrivate(historyFile,[...history,runtime.digest]);
    if (protectedDigests.has(runtime.digest)) { removeProcessInstance(dataRoot, record); continue; }
    if (!/^[a-f0-9]{64}$/.test(runtime.digest)) continue;
    const expected = path.join(controlRoot(dataRoot), 'runtimes', runtime.digest);
    if (runtime.directory !== expected) continue;
    if (fs.lstatSync(path.dirname(expected)).isSymbolicLink() || fs.realpathSync(path.dirname(expected)) !== path.join(fs.realpathSync(dataRoot),'agent-service','process','runtimes')) continue;
    const stat = fs.lstatSync(expected, {throwIfNoEntry:false});
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) continue;
    const launch = path.join(controlRoot(dataRoot), 'launch-' + runtime.digest + '.json');
    const input = readPrivate<{dataRoot:string;runtime:AgentRuntimeUnit}>(launch);
    if (input && (input.dataRoot !== path.resolve(dataRoot) || input.runtime.digest !== runtime.digest)) continue;
    if (stat) fs.rmSync(expected, {recursive:true});
    if (input) fs.unlinkSync(launch);
    removeProcessInstance(dataRoot, record);
  }
}
