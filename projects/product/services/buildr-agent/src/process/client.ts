import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentHostCapabilities, AgentLifecycleContract, AgentProcessIdentity, AgentRuntimeUnit } from '../execution-contracts.ts';
import { AGENT_EXECUTION_CONTRACTS } from '../execution-contracts.ts';
import type { ServiceEvent } from '../contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { exposeAgentHost } from './host-channel.ts';
import { OPERATION_NAMES } from './operations.ts';
import type { AgentOperations, AgentSubscription } from './operations.ts';
import { claim, controlRoot, live, readLock, readPrivate, readProcessRecord, readProcessInstances, writePrivate } from './ownership.ts';
import type { ProcessRecord } from './ownership.ts';
import { prepareAgentRuntime, validateAgentRuntime, canRunParallel } from './runtime-unit.ts';
import { launchAgentProcess, resumeAgentHandoff } from './handoff.ts';
import { request, privateToken } from './transport.ts';
import { PendingSendRepository } from '../persistence/pending-send-repository.ts';
import { normalizeSendDraft } from '../domain/send-draft.ts';
import { validateOperation } from './operations.ts';

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
      const pending = readPrivate<{state:string;coordinatorPid?:number;handoffFile?:string;runtime?:AgentRuntimeUnit}>(pendingFile);
      if (pending?.state === 'switching' && pending.coordinatorPid && !live(pending.coordinatorPid) && (!owner || !live(owner.pid))) {
        if (resumed || !pending.handoffFile) throw new AgentServiceError('agent_handoff_release_unconfirmed', '版本交接进程已退出但结果未确认；原资料与版本保留，请核对后重试。', 503);
        const coordinatorPid = resumeAgentHandoff(options.dataRoot,pending.handoffFile);
        writePrivate(pendingFile,{...pending,coordinatorPid}); resumed = true;
      }
      if ((!owner || !live(owner.pid)) && pending?.state !== 'switching') {
        // A stale record is not proof of a live owner. The new process reclaims only an exact dead lock.
        const retained=readProcessInstances(options.dataRoot).filter(candidate=>!candidate.stopped&&live(candidate.identity.pid));
        let runtime=pending?.runtime&&['waiting','parallel-starting','adopted'].includes(pending.state)?pending.runtime:record?.identity.runtime??options.runtime;
        if(retained.some(candidate=>!canRunParallel(candidate.identity.runtime,runtime)))runtime=record?.identity.runtime??retained[0]!.identity.runtime;
        validateAgentRuntime(options.dataRoot, runtime);
        launchAgentProcess({ dataRoot: path.resolve(options.dataRoot), profileId: options.profileId, runtime, token: privateToken(), legacySourceId: options.legacySourceId, autoContinueInterrupted: options.autoContinueInterrupted });
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
  let record: ProcessRecord, closed = false, reconnect = false;
  let requestedDigest: string | undefined;
  const pendingSends = new PendingSendRepository(path.join(options.dataRoot,'agent-service'));
  const withPending = (value: any): any => {
    if (!value || typeof value !== 'object') return value;
    if (typeof value.id==='string' && typeof value.workspaceId==='string' && Array.isArray(value.entries)) return {...value,pendingSend:pendingSends.view(pendingSends.read(value.workspaceId,value.id))};
    if (value.conversation) return {...value,conversation:withPending(value.conversation)};
    if (Array.isArray(value.conversations)) return {...value,conversations:value.conversations.map(withPending)};
    return value;
  };
  const attached = new Map<string, ProcessRecord>();
  let connecting: Promise<ProcessRecord> | undefined;
  const subscriptions = new Set<AbortController>(), generating = new Map<string, ProcessRecord>();
  async function connected(): Promise<ProcessRecord> {
    if (closed) throw new AgentServiceError('agent_process_client_closed', '执行后台连接已释放。', 503);
    if (connecting) return connecting;
    connecting = (async () => {
      const observed = readProcessRecord(options.dataRoot);
      if (reconnect || !record || !observed || observed.identity.instanceId !== record.identity.instanceId) { record = await ensure(options); reconnect = false; }
      matches(record.identity, options);
      if(requestedDigest===record.identity.runtime.digest||readProcessInstances(options.dataRoot).some(candidate=>candidate.identity.runtime.digest===requestedDigest&&(candidate.retiring||candidate.stopped)))requestedDigest=undefined;
      if (host) for (const candidate of readProcessInstances(options.dataRoot).filter(candidate=>!candidate.stopped&&live(candidate.identity.pid))) {
        matches(candidate.identity, options);
        if (attached.has(candidate.identity.instanceId)) continue;
        try { await request(candidate.origin, candidate.token, '/host/attach', {peer:host.peer}, AbortSignal.timeout(3000)); attached.set(candidate.identity.instanceId,candidate); }
        catch (error) { if (candidate.identity.instanceId===record.identity.instanceId) throw error; }
      }
      return record;
    })().finally(() => { connecting = undefined; });
    return connecting;
  }
  try {
    record = await ensure(options); await connected();
    const retired = readPrivate<string[]>(path.join(controlRoot(options.dataRoot),'retired-runtimes.json')) ?? [];
    const retainedOlder = readProcessInstances(options.dataRoot).some(candidate=>candidate.identity.runtime.digest===options.runtime.digest&&(candidate.retiring||candidate.stopped));
    if (record.identity.runtime.digest !== options.runtime.digest && !retired.includes(options.runtime.digest) && !retainedOlder) {
      try { await request(record.origin, record.token, '/runtime', { expectedGeneration: record.identity.generation, runtime: options.runtime }); requestedDigest=options.runtime.digest; }
      catch (error) { if (!(error instanceof AgentServiceError) || error.code !== 'agent_process_switching') throw error; }
    }
  } catch (error) { await host?.close(); throw error; }
  async function call(route: string, value?: unknown, signal?: AbortSignal): Promise<any> {
    const current = await connected();
    try { return await request(current.origin, current.token, route, value, signal); }
    catch (error) {
      if (error instanceof AgentServiceError || signal?.aborted) throw error;
      // Never replay a mutation after a transport loss. The original request can be observed.
      attached.delete(current.identity.instanceId);
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
      const current=await connected();
      // The first upgrade cannot add operations to an already running binary.
      // Its compatible client can persist the same private next-instruction
      // record, which the successor discovers after the protected idle handoff.
      if(current.identity.parallelCompatibility!==1&&['conversations.queueSend','conversations.cancelPendingSend'].includes(name)){
        validateOperation(name,args);
        const conversation=await call('/operations',{contract:AGENT_EXECUTION_CONTRACTS.operations,sourceId:options.sourceId,operation:'conversations.read',args:args.slice(0,2)});
        if(name==='conversations.cancelPendingSend')pendingSends.cancel(args[0],args[1],args[2].expectedPendingRevision);
        else{
          const {clientRequestId,expectedPendingRevision,previousRunId,...raw}=args[2];
          const submitted=normalizeSendDraft(raw),existing=pendingSends.lookup(args[0],args[1],clientRequestId);
          if(existing&&expectedPendingRevision===undefined)pendingSends.submit(args[0],args[1],submitted,clientRequestId);
          else{
            if(previousRunId!==undefined&&conversation.run?.id!==previousRunId)throw new AgentServiceError('agent_revision_conflict','上一轮执行已变化，草稿保留。',409);
            const draft={...submitted};
            if(draft.modelAccountId){const account=await call('/operations',{contract:AGENT_EXECUTION_CONTRACTS.operations,sourceId:options.sourceId,operation:'models.accounts.read',args:[draft.modelAccountId]});if(draft.modelAccountIdentity&&draft.modelAccountIdentity!==account.identity)throw new AgentServiceError('agent_model_source_changed','账号来源已变化，待发送内容保留。',409);draft.modelAccountIdentity=account.identity;}
            pendingSends.submit(args[0],args[1],draft,clientRequestId,expectedPendingRevision,submitted);
          }
        }
        return withPending(conversation);
      }
      if(requestedDigest&&current.identity.runtime.digest!==requestedDigest&&['conversations.send','conversations.prepareSend','conversations.prepareHandoff'].includes(name))throw new AgentServiceError('agent_process_switching','新版尚未就绪，可以提交待发送内容。',503);
      if (name === 'conversations.addAttachment') args[2] = { expectedRevision: args[2].expectedRevision, mimeType: args[2].mimeType, base64: Buffer.from(args[2].bytes).toString('base64') };
      const result = await call('/operations', { contract: AGENT_EXECUTION_CONTRACTS.operations, sourceId: options.sourceId, operation: name, args });
      return name === 'conversations.readAttachment' ? { bytes: Buffer.from(result.base64, 'base64'), mimeType: result.mimeType } : withPending(result);
    };
  }
  operations.models.generate = async (value: { signal: AbortSignal } & Record<string, unknown>) => {
    value.signal.throwIfAborted(); const requestId = randomUUID(), { signal, ...payload } = value;
    const current = await connected();
    if(requestedDigest&&current.identity.runtime.digest!==requestedDigest)throw new AgentServiceError('agent_process_switching','新版尚未就绪，本次模型调用未受理。',503);
    generating.set(requestId,current);
    const cancel = () => { void request(current.origin,current.token,'/cancel-generation', { requestId }).catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try { return await request(current.origin,current.token,'/generate', { requestId, input: payload }, signal); }
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
          while ((end = buffered.indexOf('\n\n')) >= 0) { const frame = buffered.slice(0, end); buffered = buffered.slice(end + 2); if (frame.startsWith('data: ')) { const event=JSON.parse(frame.slice(6)) as ServiceEvent;if(event.payload.conversation)event.payload.conversation=withPending(event.payload.conversation);yield event; } }
        }
      } finally { close(); await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } } };
  };
  const lifecycle: AgentLifecycleContract = {
    identity: () => call('/identity'), status: () => call('/status'),
    requestRuntime: async value => {const result=await call('/runtime', value);requestedDigest=value.runtime.digest;return result;},
    async shutdown(value) { await call('/shutdown', value); },
  };
  return { operations, lifecycle, async disconnect() {
    if (closed) return;
    closed = true;
    for (const controller of subscriptions) controller.abort();
    for (const [requestId,origin] of generating) await request(origin.origin, origin.token, '/cancel-generation', { requestId }, AbortSignal.timeout(1000)).catch(() => {});
    if (host) { await Promise.all([...attached.values()].map(origin=>request(origin.origin,origin.token,'/host/detach',{peerId:host.peer.peerId},AbortSignal.timeout(1000)).catch(()=>{}))); await host.close(); }
  } };
}

/** Lifecycle owners such as previews can stop an existing backend without starting one. */
export async function stopAgentProcess(input: { dataRoot: string; profileId?: string; mode?: 'if-idle' | 'stop-owned' }): Promise<void> {
  let startup: ReturnType<typeof claim> | undefined;
  for(let attempt=0;attempt<240;attempt++){
    try{startup=claim(input.dataRoot,'startup');break;}
    catch(error){if(!(error instanceof AgentServiceError)||error.code!=='agent_process_owned')throw error;await pause(50);}
  }
  if(!startup)throw new AgentServiceError('agent_process_stop_unconfirmed','后台版本采用尚未完成，未清理任何资料。',409);
  try{await stopAllProcesses(input);}finally{startup.release();}
}
async function stopAllProcesses(input: { dataRoot: string; profileId?: string; mode?: 'if-idle' | 'stop-owned' }): Promise<void> {
  const records = readProcessInstances(input.dataRoot);
  if (!records.length) {
    const owner = readLock(input.dataRoot, 'owner');
    if (owner && live(owner.pid)) throw new AgentServiceError('agent_process_stop_unconfirmed', '执行后台仍在运行，不能确认停止。', 409);
    if (readPrivate<{confirmed:boolean}>(path.join(controlRoot(input.dataRoot), 'last-stop.json'))?.confirmed === false) throw new AgentServiceError('agent_process_stop_unconfirmed', '原执行或工具释放尚未确认，数据保留。', 409);
    return;
  }
  for (const record of records) {
    if (record.identity.dataRoot !== path.resolve(input.dataRoot) || input.profileId && record.identity.profileId !== input.profileId) throw new AgentServiceError('agent_process_identity_mismatch', '执行后台不属于此运行范围。', 409);
  }
  if(input.mode==='if-idle')for(const record of records.filter(value=>!value.stopped)){
    const status=await request(record.origin,record.token,'/status',undefined,AbortSignal.timeout(3000));
    if(status.activity.busy)throw new AgentServiceError('agent_process_busy','仍有新旧后台持有工作，未退出。',409);
  }
  // Validate every retained generation before stopping or purging a preview.
  const results = await Promise.allSettled(records.map(async record => {
    if (record.stopped && record.confirmed) return;
    try { await request(record.origin, record.token, '/shutdown', { expectedGeneration: record.identity.generation, mode: input.mode ?? 'stop-owned' }, AbortSignal.timeout(5000)); }
    catch (error) { if (live(record.identity.pid)) throw error; }
    for (let i = 0; i < 240; i++) {
      const receipt = readProcessInstances(input.dataRoot).find(value=>value.identity.instanceId===record.identity.instanceId);
      if (receipt?.stopped && receipt.confirmed) return;
      if (!receipt && readProcessRecord(input.dataRoot)?.identity.instanceId !== record.identity.instanceId) {
        const stopped=readPrivate<{instanceId:string;confirmed:boolean}>(path.join(controlRoot(input.dataRoot),'last-stop.json'));
        if (stopped?.instanceId===record.identity.instanceId&&stopped.confirmed) return;
      }
      await pause(50);
    }
    throw new AgentServiceError('agent_process_stop_unconfirmed', '仍有新旧后台或原执行释放未确认，数据保留。', 409);
  }));
  const failure=results.find((result):result is PromiseRejectedResult=>result.status==='rejected');
  if (failure) throw failure.reason;
}
