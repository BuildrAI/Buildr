import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createAgentService } from '../application/agent-service.ts';
import type { AgentServiceOptions } from '../contracts.ts';
import { AGENT_EXECUTION_CONTRACTS, executionScopeRef } from '../execution-contracts.ts';
import type { AgentProcessIdentity, AgentProcessStatus, AgentRuntimeUnit } from '../execution-contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { AgentHostRegistry } from './host-channel.ts';
import { dispatchOperation } from './operations.ts';
import { authorize, body, json, listen } from './transport.ts';
import { claim, clearProcessRecord, controlRoot, readPrivate, writePrivate } from './ownership.ts';
import type { ProcessBootstrap } from './ownership.ts';
import { validateAgentRuntime } from './runtime-unit.ts';

interface PendingRuntime { runtime: AgentRuntimeUnit; state: 'waiting' | 'switching' | 'failed'; coordinatorPid?: number; handoffFile?: string; diagnostic?: string }
export async function startAgentExecutionServer(options: ProcessBootstrap & { serviceOptions?: Pick<AgentServiceOptions, 'executors' | 'modelProviders' | 'programManager'> }) {
  validateAgentRuntime(options.dataRoot, options.runtime);
  const owner = claim(options.dataRoot, 'owner');
  let abortStart: (() => Promise<void>) | undefined;
  try {
  const hosts = new AgentHostRegistry();
  const service = createAgentService({ ...options.serviceOptions, dataRoot: options.dataRoot, legacySourceId: options.legacySourceId, autoContinueInterrupted: options.autoContinueInterrupted, host: hosts });
  service.models.startRefreshing();
  abortStart = () => service.close();
  const instanceId = randomUUID(), pendingFile = path.join(controlRoot(options.dataRoot), 'pending.json');
  const identity: AgentProcessIdentity = { contracts: AGENT_EXECUTION_CONTRACTS, instanceId, generation: service.generation, profileId: options.profileId, dataRoot: path.resolve(options.dataRoot), pid: process.pid, runtime: options.runtime };
  let accepting = true, closing = false, recovering = false, startedRecovery = false, inflight = 0;
  let pending = readPrivate<PendingRuntime>(pendingFile);
  if (pending?.runtime.digest === options.runtime.digest) { pending = undefined; writePrivate(pendingFile, { runtime: options.runtime, state: 'adopted' }); }
  if (pending?.state === 'switching') pending = { ...pending, state: 'failed', diagnostic: '上次切换尚未确认，请核对实际运行版本。' };
  const generations = new Map<string, AbortController>();
  function status(): AgentProcessStatus {
    const activity = service.activity();
    if (inflight) activity.reasons.push({ kind: 'operation', count: inflight });
    if (recovering) activity.reasons.push({ kind: 'recovery-start', count: 1 });
    activity.busy = activity.reasons.length > 0;
    return { identity, activity, accepting, ...(pending && pending.runtime.digest !== options.runtime.digest ? { pendingRuntime: pending.runtime, diagnostic: pending.diagnostic } : {}) };
  }
  function scope(sourceId: string, key: unknown): void {
    if (typeof key !== 'string' || !key || executionScopeRef(key, options.legacySourceId).sourceId !== sourceId) throw new AgentServiceError('agent_host_source_mismatch', '执行范围不属于当前接入来源。', 409);
  }
  function operationScopes(sourceId: string, name: string, args: any[]): void {
    if (name === 'conversations.listAll') {
      if (!Array.isArray(args[0])) throw new AgentServiceError('agent_process_input_invalid', '执行范围列表无效。');
      for (const key of args[0]) scope(sourceId, key);
    } else if (name.startsWith('conversations.') && name !== 'conversations.pending') scope(sourceId, args[0]);
  }
  const channel = await listen(async (req, res) => {
    authorize(req, options.token);
    if (req.method === 'GET' && req.url === '/identity') { json(res, 200, identity); return; }
    if (req.method === 'GET' && req.url === '/status') { json(res, 200, status()); return; }
    if (req.method !== 'POST') throw new AgentServiceError('agent_process_operation_invalid', '不支持的执行后台入口。', 404);
    const input = await body(req);
    if (req.url === '/host/attach') {
      if (!accepting || closing) throw new AgentServiceError('agent_process_switching','执行后台正在切换，宿主尚未接入。',503);
      hosts.attach(input.peer);
      if (!startedRecovery) { startedRecovery = true; recovering = true; void service.conversations.recoverInterrupted().catch(() => {}).finally(() => { recovering = false; }); }
      json(res, 200, { attached: true }); return;
    }
    if (req.url === '/host/detach') { hosts.detach(input.peerId); json(res, 200, { detached: true }); return; }
    if (req.url === '/runtime') {
      if(closing || !accepting)throw new AgentServiceError('agent_process_switching','执行后台正在切换，尚未受理新更新。',503);
      if (input.expectedGeneration !== identity.generation) throw new AgentServiceError('agent_control_stale', '执行后台代次已变化。', 409);
      validateAgentRuntime(options.dataRoot, input.runtime);
      pending = input.runtime.digest === options.runtime.digest ? undefined : { runtime: input.runtime, state: 'waiting' };
      writePrivate(pendingFile, pending ?? { runtime: options.runtime, state: 'adopted' });
      json(res, 200, status()); return;
    }
    if (req.url === '/shutdown') {
      if (input.expectedGeneration !== identity.generation || !['if-idle','stop-owned'].includes(input.mode)) throw new AgentServiceError('agent_control_stale', '退出请求已变化。', 409);
      if (input.mode === 'if-idle' && status().activity.busy) throw new AgentServiceError('agent_process_busy', '执行后台仍有工作或待确认事项。', 409);
      accepting = false; json(res, 202, { accepted: true }); setImmediate(() => { void close().finally(() => { process.exitCode = 0; }); }); return;
    }
    if (!accepting) throw new AgentServiceError('agent_process_switching', '执行后台正在切换，本次新操作尚未受理。', 503);
    if (req.url === '/cancel-generation') { generations.get(input.requestId)?.abort(); json(res, 200, { cancelled: true }); return; }
    if (req.url === '/events') {
      scope(input.sourceId, input.scope);
      const subscription = service.conversations.subscribe(input.scope, input.id);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      const controller = new AbortController();
      const stop = () => { controller.abort(); subscription.close(); }; res.once('close', stop);
      try { for await (const event of subscription.events) { if (res.destroyed) break; if (!res.write('data: ' + JSON.stringify(event) + '\n\n')) await once(res, 'drain', {signal:controller.signal}); } }
      finally { res.removeListener('close', stop); subscription.close(); if (!res.destroyed) res.end(); }
      return;
    }
    inflight++;
    try {
      if (req.url === '/generate') {
        if (typeof input.requestId !== 'string' || generations.has(input.requestId)) throw new AgentServiceError('agent_generation_conflict', '模型调用身份已占用。', 409);
        const controller = new AbortController(); generations.set(input.requestId, controller);
        const disconnected = () => { if(!res.writableEnded)controller.abort(); }; res.once('close',disconnected);
        try { json(res, 200, await service.models.generate({ ...input.input, signal: controller.signal })); }
        finally { res.removeListener('close',disconnected); generations.delete(input.requestId); }
        return;
      }
      if (req.url !== '/operations' || input.contract !== AGENT_EXECUTION_CONTRACTS.operations || typeof input.sourceId !== 'string' || typeof input.operation !== 'string' || !Array.isArray(input.args)) throw new AgentServiceError('agent_process_operation_invalid', '执行操作契约不匹配。');
      operationScopes(input.sourceId, input.operation, input.args);
      let result: any = await dispatchOperation(service, input.operation, input.args);
      if (input.operation === 'conversations.pending') result = { conversations: result.conversations.filter((value: {workspaceId:string}) => executionScopeRef(value.workspaceId, options.legacySourceId).sourceId === input.sourceId) };
      json(res, 200, result);
    } finally { inflight--; }
  });
  abortStart = async () => { await channel.close(); await service.close(); };
  writePrivate(path.join(controlRoot(options.dataRoot), 'instance.json'), { identity, origin: channel.origin, token: options.token });
  let closeWork: Promise<void> | undefined;
  function close(): Promise<void> {
    if (closeWork) return closeWork;
    closing = true; accepting = false;
    let confirmed=false;
    closeWork = (async () => {
      try {
        for (const controller of generations.values()) controller.abort();
        await service.close(); await new Promise<void>(resolve => setImmediate(resolve));
        const activity = service.activity();
        confirmed=!activity.busy;
        writePrivate(path.join(controlRoot(options.dataRoot), 'last-stop.json'), { instanceId, confirmed, reasons: activity.reasons });
        await channel.close(); clearProcessRecord(options.dataRoot, instanceId);
      } finally { if(confirmed)owner.release(); clearInterval(timer); process.removeListener('SIGTERM', signal); process.removeListener('SIGINT', signal); }
    })(); return closeWork;
  }
  const signal = () => { void close().finally(() => { process.exitCode = 0; }); };
  process.once('SIGTERM', signal); process.once('SIGINT', signal);
  const timer = setInterval(() => {
    if (closing || pending?.state !== 'waiting' || !accepting || status().activity.busy) return;
    accepting = false;
    if (status().activity.busy) { accepting = true; return; }
    const target = pending.runtime;
    pending = { runtime: target, state: 'switching' }; writePrivate(pendingFile, pending);
    const handoff = path.join(controlRoot(options.dataRoot), 'handoff-' + instanceId + '.json');
    writePrivate(handoff, { bootstrap: options, expectedInstanceId: instanceId, target });
    // The short-lived successor coordinator owns the handoff after this process exits.
    const child = spawn(options.runtime.node, [path.join(options.runtime.directory, 'build/process/handoff.js'), handoff], { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', () => { pending = { runtime: target, state: 'failed', diagnostic: '无法启动版本交接程序，旧后台已保留。' }; writePrivate(pendingFile, pending); accepting = true; });
    child.once('spawn', () => { pending = { runtime: target, state: 'switching', coordinatorPid: child.pid, handoffFile:handoff }; writePrivate(pendingFile, pending); child.unref(); void close().finally(() => { process.exitCode = 0; }); });
  }, 250);
  timer.unref();
  return { identity, origin: channel.origin, status, close };
  } catch (error) { try { await abortStart?.(); } finally { owner.release(); } throw error; }
}
