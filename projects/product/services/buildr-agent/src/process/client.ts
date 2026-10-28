import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentHostCapabilities, AgentLifecycleContract, AgentProcessIdentity, AgentRuntimeUnit } from '../execution-contracts.ts';
import { AGENT_EXECUTION_CONTRACTS } from '../execution-contracts.ts';
import type { ServiceEvent } from '../contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { exposeAgentHost } from './host-channel.ts';
import { OPERATION_NAMES } from './operations.ts';
import type { AgentOperations, AgentSubscription } from './operations.ts';
import { claim, controlRoot, live, readLock, readPrivate, readProcessRecord, writePrivate } from './ownership.ts';
import type { ProcessRecord } from './ownership.ts';
import { prepareAgentRuntime, validateAgentRuntime } from './runtime-unit.ts';
import { launchAgentProcess, resumeAgentHandoff } from './handoff.ts';
import { request, privateToken } from './transport.ts';

export interface AgentProcessConnectionOptions {
  dataRoot: string;
  profileId: string;
  sourceId: string;
  host?: AgentHostCapabilities;
  runtime?: AgentRuntimeUnit;
  autoContinueInterrupted?: boolean;
  legacySourceId?: string;
}
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function matches(identity: AgentProcessIdentity, options: Pick<AgentProcessConnectionOptions, 'dataRoot' | 'profileId'>): void {
  if (!identity || identity.dataRoot !== path.resolve(options.dataRoot) || identity.profileId !== options.profileId || Object.entries(AGENT_EXECUTION_CONTRACTS).some(([key, value]) => identity.contracts?.[key as keyof typeof AGENT_EXECUTION_CONTRACTS] !== value)) throw new AgentServiceError('agent_process_identity_mismatch', '执行后台来源或契约不匹配，未接管已有实例。', 409);
}
async function healthy(record: ProcessRecord, options: AgentProcessConnectionOptions): Promise<boolean> {
  matches(record.identity, options);
  try {
    const identity = await request(record.origin, record.token, '/identity', undefined, AbortSignal.timeout(1000)); matches(identity, options);
    if (identity.instanceId !== record.identity.instanceId || identity.generation !== record.identity.generation || identity.pid !== record.identity.pid || identity.runtime?.digest !== record.identity.runtime.digest) throw new AgentServiceError('agent_process_identity_mismatch', '地址上的执行后台与准确持有身份不符，未接管。', 409);
    return true;
  }
  catch (error) { if (error instanceof AgentServiceError && error.code === 'agent_process_identity_mismatch') throw error; return false; }
}
async function ensure(options: AgentProcessConnectionOptions & {runtime:AgentRuntimeUnit}): Promise<ProcessRecord> {
  const current = readProcessRecord(options.dataRoot);
  if (current && await healthy(current, options)) return current;
  let startup: ReturnType<typeof claim> | undefined;
  for (let i = 0; i < 200; i++) {
    try { startup = claim(options.dataRoot, 'startup'); break; }
    catch (error) { if (!(error instanceof AgentServiceError) || error.code !== 'agent_process_owned') throw error; await pause(100); }
  }
  if (!startup) throw new AgentServiceError('agent_process_start_busy', '执行后台启动尚未完成。', 503);
  try {
    let resumed = false;
    for (let i = 0; i < 200; i++) {
      const record = readProcessRecord(options.dataRoot);
      if (record && await healthy(record, options)) return record;
      const owner = readLock(options.dataRoot, 'owner');
      const pendingFile = path.join(controlRoot(options.dataRoot), 'pending.json');
      const pending = readPrivate<{state:string;coordinatorPid?:number;handoffFile?:string}>(pendingFile);
      if (pending?.state === 'switching' && pending.coordinatorPid && !live(pending.coordinatorPid) && (!owner || !live(owner.pid))) {
        if (resumed || !pending.handoffFile) throw new AgentServiceError('agent_handoff_release_unconfirmed', '版本交接进程已退出但结果未确认；原资料与版本保留，请核对后重试。', 503);
        const coordinatorPid = resumeAgentHandoff(options.dataRoot,pending.handoffFile);
        writePrivate(pendingFile,{...pending,coordinatorPid}); resumed = true;
      }
      if ((!owner || !live(owner.pid)) && pending?.state !== 'switching') {
        // A stale record is not proof of a live owner. The new process reclaims only an exact dead lock.
        validateAgentRuntime(options.dataRoot, options.runtime);
        launchAgentProcess({ dataRoot: path.resolve(options.dataRoot), profileId: options.profileId, runtime: options.runtime, token: privateToken(), legacySourceId: options.legacySourceId, autoContinueInterrupted: options.autoContinueInterrupted });
        // Give the successor time to claim before another loop considers launching.
        for (let attempt = 0; attempt < 200; attempt++) {
          const started = readProcessRecord(options.dataRoot);
          if (started && await healthy(started, options)) return started;
          await pause(100);
        }
        break;
      }
      await pause(100);
    }
    throw new AgentServiceError('agent_process_start_unconfirmed', '执行后台未确认就绪；已有记录保留。', 503);
  } finally { startup.release(); }
}

export interface AgentProcessConnection {
  operations: AgentOperations;
  lifecycle: AgentLifecycleContract;
  disconnect(): Promise<void>;
}
export async function connectAgentProcess(input: AgentProcessConnectionOptions): Promise<AgentProcessConnection> {
  const options = { ...input, dataRoot: path.resolve(input.dataRoot), runtime: input.runtime ?? prepareAgentRuntime({ dataRoot: input.dataRoot }) };
  const host = input.host ? await exposeAgentHost(input.sourceId, input.host) : undefined;
  let record: ProcessRecord, attachedInstance: string | undefined, closed = false, reconnect = false;
  let connecting: Promise<ProcessRecord> | undefined;
  const subscriptions = new Set<AbortController>(), generating = new Set<string>();
  async function connected(): Promise<ProcessRecord> {
    if (closed) throw new AgentServiceError('agent_process_client_closed', '执行后台连接已释放。', 503);
    if (connecting) return connecting;
    connecting = (async () => {
      const observed = readProcessRecord(options.dataRoot);
      if (reconnect || !record || !observed || observed.identity.instanceId !== record.identity.instanceId) { record = await ensure(options); reconnect = false; }
      matches(record.identity, options);
      if (host && attachedInstance !== record.identity.instanceId) { await request(record.origin, record.token, '/host/attach', { peer: host.peer }); attachedInstance = record.identity.instanceId; }
      return record;
    })().finally(() => { connecting = undefined; });
    return connecting;
  }
  try {
    record = await ensure(options); await connected();
    if (record.identity.runtime.digest !== options.runtime.digest) await request(record.origin, record.token, '/runtime', { expectedGeneration: record.identity.generation, runtime: options.runtime });
  } catch (error) { await host?.close(); throw error; }
  async function call(route: string, value?: unknown, signal?: AbortSignal): Promise<any> {
    const current = await connected();
    try { return await request(current.origin, current.token, route, value, signal); }
    catch (error) {
      if (error instanceof AgentServiceError || signal?.aborted) throw error;
      // Never replay a mutation after a transport loss. The original request can be observed.
      attachedInstance = undefined;
      reconnect = true;
      throw new AgentServiceError('agent_operation_result_unknown', '执行后台连接中断，操作结果尚待核对；不会自动重发。', 503);
    }
  }
  const operations: any = { connections: {}, conversations: {}, models: { accounts: {}, catalog: {} } };
  Object.defineProperty(operations, 'generation', { get: () => record.identity.generation });
  for (const name of OPERATION_NAMES) {
    const parts = name.split('.'), method = parts.pop()!; let owner = operations;
    for (const part of parts) owner = owner[part];
    owner[method] = async (...original: any[]) => {
      const args = [...original];
      while(args.length && args.at(-1) === undefined)args.pop();
      if (name === 'conversations.addAttachment') args[2] = { expectedRevision: args[2].expectedRevision, mimeType: args[2].mimeType, base64: Buffer.from(args[2].bytes).toString('base64') };
      const result = await call('/operations', { contract: AGENT_EXECUTION_CONTRACTS.operations, sourceId: options.sourceId, operation: name, args });
      return name === 'conversations.readAttachment' ? { bytes: Buffer.from(result.base64, 'base64'), mimeType: result.mimeType } : result;
    };
  }
  operations.models.generate = async (value: { signal: AbortSignal } & Record<string, unknown>) => {
    value.signal.throwIfAborted(); const requestId = randomUUID(), { signal, ...payload } = value;
    generating.add(requestId);
    const cancel = () => { void call('/cancel-generation', { requestId }).catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try { return await call('/generate', { requestId, input: payload }, signal); }
    finally { signal.removeEventListener('abort', cancel); generating.delete(requestId); }
  };
  operations.conversations.subscribe = async (scope: string, id: string): Promise<AgentSubscription> => {
    const current = await connected(), controller = new AbortController(); subscriptions.add(controller);
    let response: Response;
    try { response = await fetch(current.origin + '/events', { method: 'POST', headers: { Authorization: 'Bearer ' + current.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceId: options.sourceId, scope, id }), signal: controller.signal }); }
    catch (error) { subscriptions.delete(controller); throw error; }
    if (!response.ok || !response.body) { subscriptions.delete(controller); await response.body?.cancel(); throw new AgentServiceError('agent_process_subscription_failed', '执行后台事件连接未建立。', response.status); }
    const stream = response.body;
    const close = () => { controller.abort(); subscriptions.delete(controller); };
    return { close, events: { async *[Symbol.asyncIterator]() {
      const reader = stream.getReader(), decoder = new TextDecoder(); let buffered = '';
      try {
        while (!controller.signal.aborted) {
          const part = await reader.read(); if (part.done) break;
          buffered += decoder.decode(part.value, { stream: true });
          if (buffered.length > 8 * 1024 * 1024) throw new Error('agent_process_event_too_large');
          let end: number;
          while ((end = buffered.indexOf('\n\n')) >= 0) { const frame = buffered.slice(0, end); buffered = buffered.slice(end + 2); if (frame.startsWith('data: ')) yield JSON.parse(frame.slice(6)) as ServiceEvent; }
        }
      } finally { close(); await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } } };
  };
  const lifecycle: AgentLifecycleContract = {
    identity: () => call('/identity'), status: () => call('/status'),
    requestRuntime: value => call('/runtime', value),
    async shutdown(value) { await call('/shutdown', value); },
  };
  return { operations, lifecycle, async disconnect() {
    if (closed) return;
    closed = true;
    for (const controller of subscriptions) controller.abort();
    for (const requestId of generating) await request(record.origin, record.token, '/cancel-generation', { requestId }, AbortSignal.timeout(1000)).catch(() => {});
    if (host) { await request(record.origin, record.token, '/host/detach', { peerId: host.peer.peerId }, AbortSignal.timeout(1000)).catch(() => {}); await host.close(); }
  } };
}

/** Lifecycle owners such as previews can stop an existing backend without starting one. */
export async function stopAgentProcess(input: { dataRoot: string; profileId?: string; mode?: 'if-idle' | 'stop-owned' }): Promise<void> {
  const record = readProcessRecord(input.dataRoot);
  if (!record) {
    const owner = readLock(input.dataRoot, 'owner');
    if (owner && live(owner.pid)) throw new AgentServiceError('agent_process_stop_unconfirmed', '执行后台仍在运行，不能确认停止。', 409);
    if (readPrivate<{confirmed:boolean}>(path.join(controlRoot(input.dataRoot), 'last-stop.json'))?.confirmed === false) throw new AgentServiceError('agent_process_stop_unconfirmed', '原执行或工具释放尚未确认，数据保留。', 409);
    return;
  }
  if (record.identity.dataRoot !== path.resolve(input.dataRoot) || input.profileId && record.identity.profileId !== input.profileId) throw new AgentServiceError('agent_process_identity_mismatch', '执行后台不属于此运行范围。', 409);
  try { await request(record.origin, record.token, '/shutdown', { expectedGeneration: record.identity.generation, mode: input.mode ?? 'stop-owned' }, AbortSignal.timeout(5000)); }
  catch (error) { if (live(record.identity.pid)) throw error; }
  for (let i = 0; i < 240; i++) {
    const current = readProcessRecord(input.dataRoot);
    if (!current || current.identity.instanceId !== record.identity.instanceId) {
      const result = readPrivate<{instanceId:string;confirmed:boolean}>(path.join(controlRoot(input.dataRoot), 'last-stop.json'));
      if (current || result?.instanceId !== record.identity.instanceId || !result.confirmed) throw new AgentServiceError('agent_process_stop_unconfirmed', '后台退出或原执行释放尚未确认；数据保留。', 409);
      return;
    }
    await pause(50);
  }
  throw new AgentServiceError('agent_process_stop_unconfirmed', '执行后台退出尚未确认，数据保留。', 409);
}
