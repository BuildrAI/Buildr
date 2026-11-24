import { executionLog,diagnosticCode } from '../storage/execution-log.ts';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import type { AgentRuntimeUnit } from '../execution-contracts.ts';
import type { ProcessBootstrap } from './ownership.ts';
import { controlRoot, live, readLock, readPrivate, readProcessRecord, writePrivate } from './ownership.ts';
import { request } from './transport.ts';
import { ensureStableRuntimeNode, validateAgentRuntime } from './runtime-unit.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { launchDetachedProcess, type DetachedProcessHandle } from './detached-launch.ts';

function sharedNodeChildEnv(runtimeNode: string): NodeJS.ProcessEnv {
  if (process.env.BUILDR_HOST_NODE?.trim()) return process.env;
  if (path.resolve(process.execPath) === path.resolve(runtimeNode)) return process.env;
  return {
    ...process.env,
    BUILDR_HOST_NODE: process.execPath,
    BUILDR_HOST_NODE_VERSION: process.versions.node,
  };
}

/** Resume only the already accepted, retained handoff under the startup lock. */
export function resumeAgentHandoff(dataRoot: string, filename: string): number {
  if (path.dirname(filename) !== controlRoot(dataRoot) || !/^handoff-[a-f0-9-]+\.json$/.test(path.basename(filename))) throw new AgentServiceError('agent_handoff_release_unconfirmed','交接来源不匹配，原资料保留。',409);
  const input = readPrivate<{bootstrap:ProcessBootstrap;expectedInstanceId:string;target:AgentRuntimeUnit}>(filename);
  const stopped = readPrivate<{instanceId:string;confirmed:boolean}>(path.join(controlRoot(dataRoot),'last-stop.json'));
  if (!input || input.bootstrap.dataRoot !== path.resolve(dataRoot) || stopped?.instanceId !== input.expectedInstanceId || !stopped.confirmed) throw new AgentServiceError('agent_handoff_release_unconfirmed','交接前的准确释放尚未确认，原资料保留。',409);
  validateAgentRuntime(dataRoot,input.bootstrap.runtime); validateAgentRuntime(dataRoot,input.target);
  const runtimeNode = ensureStableRuntimeNode(dataRoot, input.bootstrap.runtime);
  const handle = launchDetachedProcess({
    command: runtimeNode,
    args: [path.join(input.bootstrap.runtime.directory,'build/process/handoff.js'), filename],
    env: sharedNodeChildEnv(runtimeNode),
    labelPrefix: 'harness-handoff',
    stateDir: path.join(controlRoot(dataRoot), 'launchd-jobs'),
  });
  handle.child?.once('error', () => {});
  if (!handle.pid) {
    handle.bootout();
    throw new AgentServiceError('agent_handoff_release_unconfirmed','交接进程未确认启动。',503);
  }
  return handle.pid;
}

export function launchAgentProcessHandle(bootstrap: ProcessBootstrap): DetachedProcessHandle {
  validateAgentRuntime(bootstrap.dataRoot, bootstrap.runtime);
  const runtimeNode = ensureStableRuntimeNode(bootstrap.dataRoot, bootstrap.runtime);
  const input = path.join(controlRoot(bootstrap.dataRoot), 'launch-' + bootstrap.runtime.digest + '.json');
  writePrivate(input, bootstrap);
  const startupLog = path.join(controlRoot(bootstrap.dataRoot), 'startup.log');
  const diagnostics = executionLog(path.join(bootstrap.dataRoot,'agent-service'),'launcher-'+process.pid);
  const handle = launchDetachedProcess({
    command: runtimeNode,
    args: [bootstrap.runtime.entry, input],
    env: sharedNodeChildEnv(runtimeNode),
    labelPrefix: 'harness-agent',
    stateDir: path.join(controlRoot(bootstrap.dataRoot), 'launchd-jobs'),
    standardOutPath: startupLog,
    standardErrorPath: startupLog,
  });
  diagnostics({event:'service-launch',childPid:handle.pid,isolationMode:handle.isolationMode,runtimeDigest:bootstrap.runtime.digest});
  handle.child?.once('error', error => diagnostics({event:'service-launch-error',childPid:handle.pid,code:diagnosticCode(error)}));
  handle.child?.once('exit',(exitCode,signal)=>diagnostics({event:'service-child-exit',childPid:handle.pid,exitCode,signal}));
  if (!handle.pid) {
    handle.bootout();
    throw new Error('agent_process_start_failed');
  }
  return handle;
}

export function launchAgentProcess(bootstrap: ProcessBootstrap): number {
  return launchAgentProcessHandle(bootstrap).pid;
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
