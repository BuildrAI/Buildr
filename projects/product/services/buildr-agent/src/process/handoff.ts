import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import type { AgentRuntimeUnit } from '../execution-contracts.ts';
import type { ProcessBootstrap } from './ownership.ts';
import { controlRoot, live, readLock, readPrivate, readProcessRecord, writePrivate } from './ownership.ts';
import { request } from './transport.ts';
import { validateAgentRuntime } from './runtime-unit.ts';
import { AgentServiceError } from '../domain/agent-state.ts';

/** Resume only the already accepted, retained handoff under the startup lock. */
export function resumeAgentHandoff(dataRoot: string, filename: string): number {
  if (path.dirname(filename) !== controlRoot(dataRoot) || !/^handoff-[a-f0-9-]+\.json$/.test(path.basename(filename))) throw new AgentServiceError('agent_handoff_release_unconfirmed','交接来源不匹配，原资料保留。',409);
  const input = readPrivate<{bootstrap:ProcessBootstrap;expectedInstanceId:string;target:AgentRuntimeUnit}>(filename);
  const stopped = readPrivate<{instanceId:string;confirmed:boolean}>(path.join(controlRoot(dataRoot),'last-stop.json'));
  if (!input || input.bootstrap.dataRoot !== path.resolve(dataRoot) || stopped?.instanceId !== input.expectedInstanceId || !stopped.confirmed) throw new AgentServiceError('agent_handoff_release_unconfirmed','交接前的准确释放尚未确认，原资料保留。',409);
  validateAgentRuntime(dataRoot,input.bootstrap.runtime); validateAgentRuntime(dataRoot,input.target);
  const child = spawn(input.bootstrap.runtime.node,[path.join(input.bootstrap.runtime.directory,'build/process/handoff.js'),filename],{detached:true,stdio:'ignore',windowsHide:true});
  child.once('error',()=>{});child.unref();
  if (!child.pid) throw new AgentServiceError('agent_handoff_release_unconfirmed','交接进程未确认启动。',503);
  return child.pid;
}

export function launchAgentProcess(bootstrap: ProcessBootstrap): number {
  validateAgentRuntime(bootstrap.dataRoot, bootstrap.runtime);
  const input = path.join(controlRoot(bootstrap.dataRoot), 'launch-' + bootstrap.runtime.digest + '.json');
  writePrivate(input, bootstrap);
  const log = fs.openSync(path.join(controlRoot(bootstrap.dataRoot), 'startup.log'), 'a', 0o600);
  try {
    const child = spawn(bootstrap.runtime.node, [bootstrap.runtime.entry, input], { detached: true, stdio: ['ignore', log, log], windowsHide: true });
    child.once('error', () => {}); child.unref();
    if (!child.pid) throw new Error('agent_process_start_failed'); return child.pid;
  } finally { fs.closeSync(log); }
}
function storageVersion(dataRoot: string): number {
  const filename = path.join(dataRoot, 'agent-service/conversations.sqlite');
  if (!fs.existsSync(filename)) return 0;
  const db = new DatabaseSync(filename, { readOnly: true });
  try { return (db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version; } finally { db.close(); }
}
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function handoff(input: {bootstrap:ProcessBootstrap;expectedInstanceId:string;target:AgentRuntimeUnit}): Promise<void> {
  const { bootstrap, target } = input, pendingFile = path.join(controlRoot(bootstrap.dataRoot), 'pending.json');
  validateAgentRuntime(bootstrap.dataRoot, target);
  // Wait for the exact old process to release; never terminate by a recovered PID.
  const stopped = () => readPrivate<{instanceId:string;confirmed:boolean}>(path.join(controlRoot(bootstrap.dataRoot), 'last-stop.json'));
  for (let i = 0; i < 200; i++) {
    const owner = readLock(bootstrap.dataRoot, 'owner');
    if (!owner || !live(owner.pid)) break;
    if (readProcessRecord(bootstrap.dataRoot)?.identity.instanceId !== input.expectedInstanceId) return;
    if (i === 199) throw new Error('agent_handoff_release_unconfirmed');
    await delay(100);
  }
  if (stopped()?.instanceId !== input.expectedInstanceId || !stopped()?.confirmed) throw new Error('agent_handoff_release_unconfirmed');
  const beforeVersion = storageVersion(bootstrap.dataRoot);
  const pid = launchAgentProcess({ ...bootstrap, runtime: target });
  for (let i = 0; i < 200; i++) {
    const current = readProcessRecord(bootstrap.dataRoot);
    if (current?.identity.runtime.digest === target.digest) {
      try { const identity = await request(current.origin, current.token, '/identity', undefined, AbortSignal.timeout(1000)); if (identity.instanceId === current.identity.instanceId) return; } catch { /* Only actual readiness is success. */ }
    }
    if (!live(pid)) break;
    await delay(100);
  }
  writePrivate(pendingFile, { runtime: target, state: 'failed', diagnostic: '新版后台未确认就绪；已有数据和运行版本已保留。' });
  const owner = readLock(bootstrap.dataRoot, 'owner');
  if (!live(pid) && (!owner || !live(owner.pid)) && storageVersion(bootstrap.dataRoot) === beforeVersion && stopped()?.instanceId === input.expectedInstanceId && stopped()?.confirmed) launchAgentProcess(bootstrap);
}
async function runHandoffEntry(): Promise<void> {
  const filename = process.argv[2], input = filename && readPrivate<Parameters<typeof handoff>[0]>(filename);
  if (!input) throw new Error('agent_handoff_input_missing');
  try { await handoff(input); }
  catch { writePrivate(path.join(controlRoot(input.bootstrap.dataRoot), 'pending.json'), { runtime: input.target, state: 'failed', diagnostic: '版本交接未完成，请核对准确后台身份；未覆盖已有数据。' }); process.exitCode = 1; }
  finally { fs.unlinkSync(filename); }
}
// The public package is also synchronously loaded by the bundled CJS host.
// Keep executable-only async work out of the imported module's top level.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runHandoffEntry().catch(error => { console.error(error); process.exitCode = 1; });
}
