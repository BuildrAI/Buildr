import {agentRuntimeStatus} from '../interfaces/http/runtime-status.ts';
import {HarnessWebEndpoint} from './web-endpoint.ts';
import {connectHarnessProcess} from './client.ts';
import type {AgentProcessConnection} from './client.ts';
import { HarnessDirectoryHost, DIRECTORY_SOURCE_ID } from '../application/directory-host.ts';
import { SourceContinuationPolicies } from './source-policies.ts';
import { HarnessCallerClient } from './caller-client.ts';
import { HarnessCallerSessions } from './caller-sessions.ts';
import { executionLog,diagnosticCode } from '../storage/execution-log.ts';
import type { ServiceEvent } from '../contracts.ts';
import { conversationEventEncoder } from '../domain/conversation-transfer.ts';
import path from 'node:path';
import { conversationControlInstruction } from './conversation-control.ts';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';
import { createAgentService } from '../application/agent-service.ts';
import type { AgentServiceOptions } from '../contracts.ts';
import { AGENT_EXECUTION_CONTRACTS, HARNESS_EXECUTION_CONTRACTS, executionScopeRef, executionScopeKey } from '../execution-contracts.ts';
import type { AgentProcessIdentity, AgentProcessStatus, AgentRuntimeUnit } from '../execution-contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { AgentHostRegistry } from './host-channel.ts';
import { dispatchOperation, validateOperation } from './operations.ts';
import { authorize, body, json, listen, request, privateToken, keepEventStreamAlive } from './transport.ts';
import { claim, claimStorage, clearProcessRecord, controlRoot, readPrivate, writePrivate, readProcessRecord, readProcessInstances, writeProcessInstance, generationAlive, live, readLock } from './ownership.ts';
import type { ProcessBootstrap, ProcessRecord } from './ownership.ts';
import { validateAgentRuntime, canRunParallel, runtimeSupportsHarnessWeb } from './runtime-unit.ts';
import { launchAgentProcess } from './handoff.ts';
import { ConversationRepository } from '../persistence/conversation-repository.ts';
import { ConversationReadModel } from '../persistence/conversation-read-model.ts';
import { PendingSends } from './pending-sends.ts';
import { PendingSendRepository } from '../persistence/pending-send-repository.ts';
import { StorageMaintenance } from './storage-maintenance.ts';
import { runtimeChange } from './runtime-change.ts';

const RUNTIME_REGISTRATION_WAIT_MS = 30_000;
const RUNTIME_REGISTRATION_RETRY_MS = 100;
const PARALLEL_START_WAIT_MS = RUNTIME_REGISTRATION_WAIT_MS + 20_000;

interface PendingRuntime { runtime: AgentRuntimeUnit; state: 'waiting' | 'switching' | 'parallel-starting' | 'failed'; coordinatorPid?: number; handoffFile?: string; diagnostic?: string }
export async function startAgentExecutionServer(options: ProcessBootstrap & { serviceOptions?: Pick<AgentServiceOptions, 'executors' | 'modelProviders' | 'programManager'> }) {
  options = {...options, legacySourceId: options.legacySourceId ?? 'buildr'};
  validateAgentRuntime(options.dataRoot, options.runtime);
  let owner = claim(options.dataRoot, 'owner'), ownsMetadata = true;
  let abortStart: (() => Promise<void>) | undefined;
  let cleanupDiagnostics:(()=>void)|undefined;
  try {
  const directories = new HarnessDirectoryHost(options.dataRoot);
  const hosts = new AgentHostRegistry(directories);
  const sourcePolicies = new SourceContinuationPolicies(options.dataRoot, options.legacySourceId!, () => options.autoContinueInterrupted ?? false);
  const backendChange = runtimeChange(readProcessRecord(options.dataRoot), options.runtime.digest, new Date().toISOString());
  const retainedOwners=new Map(readProcessInstances(options.dataRoot).map(record=>[record.identity.generation,record.identity]));
  const service = createAgentService({ ...options.serviceOptions, backendChange, dataRoot: options.dataRoot, legacySourceId: options.legacySourceId, get autoContinueInterrupted() { return options.autoContinueInterrupted; }, continuationPolicy: scope => sourcePolicies.enabled(scope), host: hosts, controlSupersededRun:async(scope,id,control,action)=>{
    const target=await recipient(scope,id,control.generation);
    if(target)return forward(target,'/operations',{contract:AGENT_EXECUTION_CONTRACTS.operations,sourceId:executionScopeRef(scope,options.legacySourceId).sourceId,operation:action==='stop'?'conversations.stop':action==='release-question-wait'?'conversations.releaseQuestionWait':'conversations.observeRun',args:[scope,id,control]});
    return action==='stop'?service.conversations.stop(scope,id,control):action==='release-question-wait'?service.conversations.releaseQuestionWait(scope,id,control):service.conversations.observeRun(scope,id,control);
  }, conversationControl:(scope,id)=>conversationControlInstruction({dataRoot:options.dataRoot,profileId:options.profileId,sourceId:executionScopeRef(scope,options.legacySourceId).sourceId,scope,conversationId:id},options.runtime.node), generationAlive: generation => generationAlive(options.dataRoot, generation), generationReleased:generation=>{
    const prior=readProcessInstances(options.dataRoot).find(record=>record.identity.generation===generation);
    if(prior)retainedOwners.set(generation,prior.identity);
    const owner=prior?.identity??retainedOwners.get(generation);
    if(!owner||live(owner.pid)||owner.dataRoot!==path.resolve(options.dataRoot)||owner.profileId!==options.profileId)return false;
    if(prior?.stopped&&prior.confirmed)return true;
    // Runtime housekeeping may remove a stopped instance before the next stop.
    // Match its authenticated shutdown receipt to the previously observed owner.
    const stopped=readPrivate<{instanceId:string;confirmed:boolean}>(path.join(controlRoot(options.dataRoot),'last-stop.json'));
    return stopped?.instanceId===owner.instanceId&&stopped.confirmed===true;
  } });
  const repository = new ConversationRepository(path.join(options.dataRoot, 'agent-service'));
  service.models.startRefreshing();
  abortStart = () => service.close();
  const instanceId = randomUUID(), pendingFile = path.join(controlRoot(options.dataRoot), 'pending.json');
  function savePending(value: unknown): void {
    const storage = claimStorage(options.dataRoot);
    try { writePrivate(pendingFile, value); } finally { storage.release(); }
  }
  async function savePendingAfterStorageWait(value: unknown): Promise<void> {
    const deadline = performance.now() + RUNTIME_REGISTRATION_WAIT_MS;
    for (;;) {
      let storage: ReturnType<typeof claim>;
      try { storage = claim(options.dataRoot, 'storage'); }
      catch (error) {
        if (!(error instanceof AgentServiceError) || error.code !== 'agent_process_owned' || performance.now() >= deadline) throw error;
        await pause(RUNTIME_REGISTRATION_RETRY_MS);
        continue;
      }
      try { writePrivate(pendingFile, value); } finally { storage.release(); }
      return;
    }
  }
  const identity: AgentProcessIdentity = { contracts: AGENT_EXECUTION_CONTRACTS, capabilities: {directoryHost: 1,harnessWeb:1}, supportedContracts: {operations: [AGENT_EXECUTION_CONTRACTS.operations, HARNESS_EXECUTION_CONTRACTS.operations], host: [AGENT_EXECUTION_CONTRACTS.host, HARNESS_EXECUTION_CONTRACTS.host], lifecycle: [AGENT_EXECUTION_CONTRACTS.lifecycle]}, instanceId, generation: service.generation, profileId: options.profileId, dataRoot: path.resolve(options.dataRoot), pid: process.pid, runtime: options.runtime, parallelCompatibility: options.runtime.parallelCompatibility };
  const diagnostics=executionLog(path.join(options.dataRoot,'agent-service'),service.generation);
  const previous=readProcessRecord(options.dataRoot);
  diagnostics({event:'service-start',runtimeDigest:options.runtime.digest,previousGeneration:previous?.identity.generation,previousPid:previous?.identity.pid,reason:backendChange?.reason??'initial-start'});
  const fatal=(error:Error)=>diagnostics({event:'service-uncaught-exception',code:diagnosticCode(error)});
  const onExit=(exitCode:number)=>diagnostics({event:'service-exit',exitCode,expected:closing});
  process.on('uncaughtExceptionMonitor',fatal);process.on('exit',onExit);
  cleanupDiagnostics=()=>{process.removeListener('uncaughtExceptionMonitor',fatal);process.removeListener('exit',onExit);};
  let accepting = true, closing = false, recovering = false, recoveryRequested = false, inflight = 0;
  let retiring = false, adopting: Promise<void> | undefined;
  let pending = readPrivate<PendingRuntime>(pendingFile);
  if (pending?.runtime.digest === options.runtime.digest) {
    try { await savePendingAfterStorageWait({ runtime: options.runtime, state: 'adopted' }); }
    catch (error) { diagnostics({event:'service-adoption-record-failed',code:diagnosticCode(error),reason:'successor-start'}); throw error; }
    pending = undefined;
  }
  if (pending?.state === 'switching') pending = { ...pending, state: 'failed', diagnostic: '上次切换尚未确认，请核对实际运行版本。' };
  function recoverAfterHostAttach(): void {
    recoveryRequested = true;
    if (retiring || closing || recovering) return;
    recovering = true;
    void (async () => {
      // Acknowledge registration before the synchronous part of recovery.
      await new Promise<void>(resolve => setImmediate(resolve));
      while (recoveryRequested && !retiring && !closing) {
        recoveryRequested = false;
        await service.conversations.recoverInterrupted().catch(() => {});
      }
    })().finally(() => { recovering = false; });
  }
  const generations = new Map<string, AbortController>();
  function status(): AgentProcessStatus {
    const activity = service.activity();
    if (inflight) activity.reasons.push({ kind: 'operation', count: inflight });
    if (recovering) activity.reasons.push({ kind: 'recovery-start', count: 1 });
    activity.busy = activity.reasons.length > 0;
    return { identity, activity, accepting, retiring, instances: readProcessInstances(options.dataRoot).filter(record => !record.stopped && live(record.identity.pid)).map(record => ({generation:record.identity.generation,runtimeDigest:record.identity.runtime.digest,retiring:Boolean(record.retiring)})), ...(pending && pending.runtime.digest !== options.runtime.digest ? { pendingRuntime: pending.runtime, diagnostic: pending.diagnostic } : {}) };
  }
  async function recipient(scope: string, id: string, generation?: string): Promise<ProcessRecord | undefined> {
    const conversation = repository.readState(id)?.view;
    const run = conversation?.run;
    const ownerGeneration = generation ?? run?.generation;
    if (!ownerGeneration || ownerGeneration === identity.generation) return;
    const record = readProcessInstances(options.dataRoot).find(record => record.identity.generation === ownerGeneration && !record.stopped);
    if (!record || !live(record.identity.pid)) return;
    if (record.identity.profileId !== options.profileId) throw new AgentServiceError('agent_process_identity_mismatch', '执行所属配置域不匹配。', 409);
    if (generation) return record;
    // This acknowledges release of the exact old controls, independently of
    // operation results. A new observer still resumes the exact native context;
    // native writer conflicts fail there rather than replaying uncertain work.
    if (run?.resourcesReleased && !conversation!.requests.length) return;
    let state = await request(record.origin, record.token, '/conversation-state', { scope, id }, AbortSignal.timeout(3000)).catch(error => {
      if (error instanceof AgentServiceError) throw error;
      throw new AgentServiceError('agent_process_state_unconfirmed', '上一轮后台状态尚未确认，指令已保存并继续等待。', 503);
    });
    if (state.generation !== ownerGeneration) throw new AgentServiceError('agent_process_identity_mismatch', '执行所属后台身份不匹配。', 409);
    if(state.busy && run && ['completed','failed','stopped'].includes(run.status) && !conversation!.requests.length && run.tools.every(tool=>tool.status==='completed')){
      const observed=await request(record.origin,record.token,'/conversation-state',{sourceId:executionScopeRef(scope,options.legacySourceId).sourceId,scope,id,observe:true,runId:run.id,generation:run.generation},AbortSignal.timeout(15000));
      const latest=repository.readConversation(id)?.view.run;
      if(observed.observed===true&&observed.generation===ownerGeneration&&observed.runId===run.id&&latest?.id===run.id&&latest.generation===ownerGeneration)state=observed;
    }
    return state.busy ? record : undefined;
  }
  async function conversationBusy(scope: string, id: string): Promise<boolean> {
    return service.conversationInputBusy(scope, id);
  }
  const forwardingClients = new Map<string, HarnessCallerClient>();
  async function forward(record: ProcessRecord, route: string, input: any, caller?: ReturnType<HarnessCallerSessions['authenticate']>): Promise<any> {
    const visited: string[] = input.forwarded ?? [];
    if (!Array.isArray(visited) || visited.length > 8 || visited.includes(identity.instanceId)) throw new AgentServiceError('agent_process_route_conflict', '执行归属发生变化，请重新读取。', 409);
    try {
      const payload = {...input,forwarded:[...visited,identity.instanceId]};
      if (!caller) return await request(record.origin, record.token, route, payload);
      const key = JSON.stringify(caller.caller);
      let client = forwardingClients.get(key);
      if (!client) { client = new HarnessCallerClient(caller.caller); forwardingClients.set(key, client); }
      const endpoint = await client.endpoint(record, route, payload);
      return await request(record.origin, endpoint.token, endpoint.route, endpoint.input);
    }
    catch (error) { if (error instanceof AgentServiceError) throw error; throw new AgentServiceError('agent_operation_result_unknown', '原后台操作结果尚待核对，不会自动重发。', 503); }
  }
  const sends = new PendingSends({dataRoot:options.dataRoot,service,active:()=>!closing&&accepting&&!retiring&&(!pending||pending.state==='failed'||pending.runtime.digest===options.runtime.digest)&&readProcessRecord(options.dataRoot)?.identity.instanceId===instanceId,generationAlive:generation=>generationAlive(options.dataRoot,generation),conversationBusy});
  function scope(sourceId: string, key: unknown): void {
    if (typeof key !== 'string' || !key || executionScopeRef(key, options.legacySourceId).sourceId !== sourceId) throw new AgentServiceError('agent_host_source_mismatch', '执行范围不属于当前接入来源。', 409);
  }
  function operationScopes(sourceId: string, name: string, args: any[]): void {
    const input=args.at(-1);
    if(input&&typeof input==='object'&&input.workObjectLinks!==undefined)throw new AgentServiceError('agent_capability_unavailable','工作对象引用需要明确的 v2 调用身份。',409);
    if (name === 'conversations.listAll' || name === 'conversations.activityEpoch') {
      if (!Array.isArray(args[0])) throw new AgentServiceError('agent_process_input_invalid', '执行范围列表无效。');
      for (const key of args[0]) scope(sourceId, key);
    } else if (name.startsWith('conversations.') && !['conversations.pending','conversations.pendingSummary'].includes(name)) scope(sourceId, args[0]);
  }
  const callers = new HarnessCallerSessions(service.generation);
  let webConnection:Promise<AgentProcessConnection>|undefined;
  const web=new HarnessWebEndpoint({dataRoot:options.dataRoot,profileId:options.profileId,generation:identity.generation,instanceId,staticRoot:path.join(options.runtime.directory,'build/harness-web-dist'),runtimeDigest:options.runtime.digest,ownsListener:()=>ownsMetadata&&!closing&&!retiring,
    connect:()=>webConnection??=connectHarnessProcess({dataRoot:options.dataRoot,profileId:options.profileId,runtime:options.runtime,sourceId:DIRECTORY_SOURCE_ID,caller:{kind:'first-party-user',product:'buildr-harness'}}).catch(error=>{webConnection=undefined;throw error;}),
  });
  const channel = await listen(async (req, res) => {
    const isV2 = req.url?.startsWith('/v2/') === true;
    const caller = isV2 ? callers.authenticate(req) : undefined;
    if (!caller) authorize(req, options.token);
    const route = isV2 ? req.url!.slice(3) : req.url;
    if (caller && !['/operations', '/events', '/directories', '/host/attach', '/host/detach', '/scope-catalog', '/source-policy', '/web', '/caller-close', '/generate', '/cancel-generation'].includes(route!)) throw new AgentServiceError('agent_caller_operation_denied', '调用连接没有后台管理权限。', 403);
    if (req.method === 'GET' && route === '/identity') { json(res, 200, identity); return; }
    if (req.method === 'GET' && route === '/status') { json(res, 200, status()); return; }
    if (req.method !== 'POST') throw new AgentServiceError('agent_process_operation_invalid', '不支持的执行后台入口。', 404);
    const attachmentUpload = route === '/operations' && req.headers['x-buildr-operation'] === 'conversations.addAttachment';
    const input = await body(req, attachmentUpload ? 46 * 1024 * 1024 : undefined);
    if (attachmentUpload && input.operation !== 'conversations.addAttachment') throw new AgentServiceError('agent_process_operation_invalid', '附件传输操作不匹配。');
    if (route === '/caller/negotiate') {
      // This path remains owner-token-only; caller tokens cannot issue identities.
      if (closing) throw new AgentServiceError('agent_process_switching', '后台正在退出，未建立调用连接。', 503);
      json(res, 200, callers.issue(input)); return;
    }
    if (caller) {
      if (input.caller !== undefined || input.authoritySources !== undefined || input.sourceId !== undefined) throw new AgentServiceError('agent_caller_identity_assertion', '请求体不能声明调用身份或来源权限。', 403);
      if (route === '/caller-close') { callers.close(caller); json(res, 200, {closed: true}); return; }
      if (route === '/operations') {
        if (input.contract !== HARNESS_EXECUTION_CONTRACTS.operations || typeof input.operation !== 'string' || !Array.isArray(input.args)) throw new AgentServiceError('agent_caller_contract_unsupported', '操作未协商新版契约。', 409);
        callers.operation(caller, input);
        input.sourceId = input.targetScope?.sourceId ?? (caller.caller.kind === 'host' ? caller.caller.sourceId : 'harness-local');
        input.contract = AGENT_EXECUTION_CONTRACTS.operations;
      } else if (route === '/events') {
        if (!input.targetScope) throw new AgentServiceError('agent_caller_scope_denied', '事件订阅缺少准确目标来源。', 403);
        input.sourceId = callers.scope(caller, input.scope, input.targetScope).sourceId;
      } else if (route === '/host/attach') callers.authority(caller, input.peer?.sourceId);
      else if (route === '/host/detach') {
        const source = hosts.sourceOf(input.peerId);
        if (source) callers.authority(caller, source);
      } else if (route === '/directories') {
        callers.directory(caller, !['list','preview'].includes(input.operation)); input.sourceId = DIRECTORY_SOURCE_ID;
      } else if (['/generate', '/cancel-generation'].includes(route!) && !callers.isFirstParty(caller)) throw new AgentServiceError('agent_caller_operation_denied', '此调用连接没有模型管理或生成权限。', 403);
    }
    if(route==='/web'){
      if(!caller||!callers.isFirstParty(caller))throw new AgentServiceError('agent_caller_operation_denied','独立网页管理需要本机第一方身份。',403);
      if(input.operation==='status'){json(res,200,web.status());return;}
      if(caller.caller.kind!=='first-party-user'||caller.caller.product!=='buildr-harness')throw new AgentServiceError('agent_caller_operation_denied','Development 不隐式启用独立 Harness 网页。',403);
      if(input.operation==='restart'&&Object.keys(input).every(key=>['operation','expectedGeneration'].includes(key))){
        if(input.expectedGeneration!==identity.generation)throw new AgentServiceError('agent_process_generation_changed','执行后台代次已变化，未重启。',409);
        if(!ownsMetadata||retiring||closing||status().activity.busy)throw new AgentServiceError('agent_process_busy','仍有执行或交接未释放，未重启。',409);
        pending={runtime:options.runtime,state:'waiting'};savePending(pending);json(res,202,agentRuntimeStatus(status()));return;
      }
      if(input.operation==='enable'&&!runtimeSupportsHarnessWeb(options.runtime))throw new AgentServiceError('agent_web_runtime_incompatible','此负载未声明受支持的页面会话格式。',409);
      if(input.operation==='enable'&&Object.keys(input).every(key=>['operation','port','developmentRoot'].includes(key))){json(res,200,await web.enable(input));return;}
      if(input.operation==='rebind'&&Object.keys(input).every(key=>['operation','expectedEndpointId','expectedPort','expectedGeneration','port'].includes(key))){json(res,200,await web.rebind(input));return;}
      if(input.operation==='login'&&Object.keys(input).join()==='operation'){json(res,200,await web.login());return;}
      throw new AgentServiceError('agent_process_input_invalid','网页管理操作无效。');
    }
    if (route === '/source-policy') {
      if (!caller) throw new AgentServiceError('agent_caller_contract_unsupported', '恢复策略维护需要新版调用身份。', 409);
      callers.policy(caller, input.policySource, input.operation !== 'read');
      if (input.operation === 'read') { json(res, 200, sourcePolicies.read(input.policySource)); return; }
      if (input.operation !== 'configure') throw new AgentServiceError('agent_source_policy_invalid', '恢复策略操作无效。');
      if (!accepting || retiring || closing) throw new AgentServiceError('agent_process_switching', '当前代次不再维护来源策略。', 503);
      const updated = sourcePolicies.configure(input.policySource, input);
      if (updated.autoContinueInterrupted) recoverAfterHostAttach();
      json(res, 200, updated); return;
    }
    if (route === '/scope-catalog') {
      if (!caller) throw new AgentServiceError('agent_caller_contract_unsupported', '范围发现需要显式新版调用连接。', 409);
      const keys = new Set(repository.listScopeKeys());
      for (const directory of directories.list()) keys.add(executionScopeKey(directory.ref));
      const registered = new Set(hosts.sources());
      await Promise.all([...registered].filter(source => callers.isFirstParty(caller) || caller.caller.kind === 'host' && caller.caller.sourceId === source).map(async sourceId => {
        try {
          const result = await hosts.listExecutionScopes({sourceId});
          for (const ref of result.refs) {
            if (ref.sourceId !== sourceId) throw new AgentServiceError('agent_host_source_mismatch', '宿主范围发现来源不匹配。', 409);
            // Preserve the original bare key for Development's historical scopes.
            keys.add(sourceId === 'buildr' ? ref.id : executionScopeKey(ref));
          }
        } catch { registered.delete(sourceId); }
      }));
      const scopes = [...keys].filter(key => callers.canRead(caller, key)).map(key => {
        const ref = executionScopeRef(key, 'buildr');
        return {key, ref, authority: ref.sourceId === DIRECTORY_SOURCE_ID ? 'builtin' : registered.has(ref.sourceId) ? 'registered' : 'offline'};
      });
      json(res, 200, {scopes}); return;
    }
    if (route === '/directories') {
      if (input.sourceId !== DIRECTORY_SOURCE_ID) throw new AgentServiceError('agent_host_source_mismatch', '此入口不是目录宿主。', 409);
      if (input.operation === 'list') { json(res, 200, directories.list()); return; }
      if(input.operation==='preview'){
        const record=typeof input.conversationId==='string'?repository.readConversation(input.conversationId):undefined;
        if(!record?.hostScope||executionScopeRef(record.view.workspaceId,'buildr').sourceId!==DIRECTORY_SOURCE_ID)throw new AgentServiceError('agent_directory_file_forbidden','仅能读取准确目录对话的来源文件。',403);
        json(res,200,await directories.preview({ref:record.hostScope.ref,expectedRevision:record.hostScope.revision,path:input.path}));return;
      }
      if (input.operation !== 'register' || typeof input.path !== 'string') throw new AgentServiceError('agent_process_input_invalid', '目录操作无效。');
      if (closing || retiring || !accepting) throw new AgentServiceError('agent_process_switching', '目录登记暂不可写，输入已保留。', 503);
      json(res, 200, directories.register(input.path)); return;
    }
    if (route === '/host/attach') {
      if (closing) throw new AgentServiceError('agent_process_switching','执行后台正在退出，宿主尚未接入。',503);
      hosts.validatePeer(input.peer);
      if (caller && typeof input.autoContinueInterrupted === 'boolean' && sourcePolicies.read(input.peer.sourceId).revision === 'absent') {
        if (!accepting || retiring) throw new AgentServiceError('agent_process_switching', '当前代次不再维护来源策略。', 503);
        try { sourcePolicies.configure(input.peer.sourceId, {expectedRevision: 'absent', autoContinueInterrupted: input.autoContinueInterrupted}); }
        catch (error) { if (!(error instanceof AgentServiceError) || error.code !== 'agent_source_policy_conflict') throw error; }
      }
      const attached = hosts.attach(input.peer);
      // A new owning host refreshes policy even when the old bootstrap launched this generation.
      const ownsPolicy = input.peer.sourceId === options.legacySourceId;
      const enabledRecovery = ownsPolicy && input.autoContinueInterrupted === true && !options.autoContinueInterrupted;
      if (ownsPolicy && typeof input.autoContinueInterrupted === 'boolean') options.autoContinueInterrupted = input.autoContinueInterrupted;
      if (attached || enabledRecovery) recoverAfterHostAttach();
      json(res, 200, { attached: true }); return;
    }
    if (route === '/host/detach') { hosts.detach(input.peerId); json(res, 200, { detached: true }); return; }
    if (route === '/conversation-state') {
      if (input.observe===true) {
        scope(input.sourceId,input.scope);
        const released=await service.observeForRelease(input.scope,input.id,input.runId,input.generation);
        json(res,200,{generation:identity.generation,runId:input.runId,observed:true,busy:!released}); return;
      }
      if (retiring) await service.releaseIdleSources({workspaceId:input.scope,id:input.id});
      json(res, 200, {generation:identity.generation,busy:service.conversationBusy(input.scope,input.id) || retiring && service.retainsConversationSource(input.scope,input.id)}); return;
    }
    if (route === '/revoke') {
      if (input.connectionId) { service.revokeModel('native-'+input.connectionId); await service.connections.disconnect(input.connectionId, {expectedRevision:service.connections.read(input.connectionId).revision}); }
      if (input.accountId) service.revokeModel(input.accountId);
      json(res, 200, {revoked:true}); return;
    }
    if (route === '/runtime') {
      const current = readProcessRecord(options.dataRoot);
      if (retiring && current && current.identity.instanceId !== instanceId) { json(res, 200, await forward(current, '/runtime', {...input,expectedGeneration:current.identity.generation})); return; }
      if(closing || !accepting)throw new AgentServiceError('agent_process_switching','执行后台正在切换，尚未受理新更新。',503);
      if (input.expectedGeneration !== identity.generation) throw new AgentServiceError('agent_control_stale', '执行后台代次已变化。', 409);
      validateAgentRuntime(options.dataRoot, input.runtime);
      if(web.status().enabled&&!runtimeSupportsHarnessWeb(input.runtime,web.developmentEnabled()))throw new AgentServiceError('agent_web_runtime_incompatible','候选不兼容现有页面会话或开发网页，原网页和工作已保留。',409);
      const nextPending = input.runtime.digest === options.runtime.digest ? undefined : { runtime: input.runtime, state: 'waiting' as const };
      const observedPending = pending;
      const started = performance.now();
      let waited = false, lockHolderPid: unknown, lockHolderThreadId: unknown, phase = 'storage-lock';
      const logRegistration = (event:string, code?:string) => diagnostics({
        event, phase, reason:'runtime-registration', lockName:'storage', lockHolderPid, lockHolderThreadId,
        runtimeDigest:input.runtime.digest, lockWaitMs:Math.round(performance.now()-started), code,
      });
      try {
        for (;;) {
          if (res.destroyed) {
            logRegistration('service-runtime-registration-failed','agent_runtime_registration_cancelled');
            return;
          }
          if (closing || !accepting || !ownsMetadata || readProcessRecord(options.dataRoot)?.identity.instanceId !== instanceId) {
            phase = 'revalidate-owner';
            throw new AgentServiceError('agent_process_switching','执行后台正在切换，尚未受理新更新。',503);
          }
          if (pending !== observedPending) {
            phase = 'revalidate-target';
            if (pending?.runtime.digest === input.runtime.digest) {
              if (waited) logRegistration('service-runtime-registration-resumed');
              json(res, 200, status()); return;
            }
            throw new AgentServiceError('agent_process_activation_superseded','启用目标已被另一版本更新，请核对当前目标。',409);
          }
          let storage: ReturnType<typeof claim>;
          try { storage = claim(options.dataRoot,'storage'); }
          catch (error) {
            if (!(error instanceof AgentServiceError) || error.code !== 'agent_process_owned') throw error;
            const holder = 'lockHolderPid' in error ? error.lockHolderPid : undefined;
            const holderThread = 'lockHolderThreadId' in error ? error.lockHolderThreadId : undefined;
            if (!waited || holder !== lockHolderPid || holderThread !== lockHolderThreadId) {
              lockHolderPid = holder;
              lockHolderThreadId = holderThread;
              logRegistration('service-runtime-registration-wait',error.code);
            }
            waited = true;
            if (performance.now()-started >= RUNTIME_REGISTRATION_WAIT_MS) {
              throw new AgentServiceError('agent_runtime_registration_busy','等待新版登记的存储锁超时；旧后台和原执行已保留。',503);
            }
            await pause(RUNTIME_REGISTRATION_RETRY_MS);
            continue;
          }
          phase = 'persist-pending';
          try { writePrivate(pendingFile,nextPending ?? {runtime:options.runtime,state:'adopted'}); }
          finally { storage.release(); }
          pending = nextPending;
          if (waited) logRegistration('service-runtime-registration-resumed');
          json(res, 200, status()); return;
        }
      } catch (error) {
        logRegistration('service-runtime-registration-failed',diagnosticCode(error));
        throw error;
      }
    }
    if (route === '/shutdown') {
      if (input.expectedGeneration !== identity.generation || !['if-idle','stop-owned'].includes(input.mode)) throw new AgentServiceError('agent_control_stale', '退出请求已变化。', 409);
      if (input.mode === 'if-idle' && status().activity.busy) throw new AgentServiceError('agent_process_busy', '执行后台仍有工作或待确认事项。', 409);
      accepting = false; json(res, 202, { accepted: true }); setImmediate(() => { void close('authenticated-shutdown').finally(() => { process.exitCode = 0; }); }); return;
    }
    if (route === '/cancel-generation') { generations.get(input.requestId)?.abort(); json(res, 200, { cancelled: true }); return; }
    if (route === '/events') {
      scope(input.sourceId, input.scope);
      const subscription = service.conversations.subscribe(input.scope, input.id,{compactTools:true});
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      res.flushHeaders();
      const stopHeartbeat = keepEventStreamAlive(res);
      const controller = new AbortController();
      let signature = '', relayCursor = 0;
      const encode = ['delta-v1','delta-v2'].includes(input.transfer) ? conversationEventEncoder(input.transfer) : (event: ServiceEvent) => event;
      const refresh = () => {
        if (res.destroyed || controller.signal.aborted) return;
        try {
          const next = service.conversations.observationVersion(input.scope,input.id);
          if (next === signature) return;
          const conversation = service.conversations.read(input.scope, input.id,{compactTools:true});
          signature = [conversation.revision,conversation.activity?.seenThrough,conversation.pendingSend?.revision].join(':');
          if (res.writableLength > 8 * 1024 * 1024) { res.destroy(); return; }
          res.write('data: ' + JSON.stringify(encode({type:'conversation',generation:identity.generation,cursor:++relayCursor,workspaceId:input.scope,conversationId:input.id,revision:conversation.revision,payload:{conversation}})) + '\n\n');
        } catch { /* Preserve the last observed snapshot on a transient read conflict. */ }
      };
      // Shared snapshots also cover another retained generation and pending-only
      // changes; they do not resume native contexts or trigger an execution.
      const poll = setInterval(refresh, 500); poll.unref();
      const stop = () => { controller.abort(); subscription.close(); clearInterval(poll); stopHeartbeat(); }; res.once('close', stop);
      try { for await (const event of subscription.events) {
        if (res.destroyed) break;
        const published=event.payload.conversation;
        const publishedVersion=published?[published.revision,published.activity?.seenThrough,published.pendingSend?.revision].join(':'):undefined;
        // Legacy raw/present entries may still need compacting or file metadata
        // from read(). Reuse only snapshots that already have those semantics.
        const reusable=published?.entries.every(entry=>!(entry.kind==='tool'&&entry.provider==='dsh'&&entry.name==='present'&&entry.status==='completed'&&entry.detail&&!entry.input&&!entry.presentedFiles)
          &&(entry.detail||ConversationReadModel.compact(entry)===entry));
        const conversation = published&&reusable&&publishedVersion===service.conversations.observationVersion(input.scope,input.id)
          ?published:service.conversations.read(input.scope, input.id,{compactTools:true});
        signature = [conversation.revision,conversation.activity?.seenThrough,conversation.pendingSend?.revision].join(':');
        if (!res.write('data: ' + JSON.stringify(encode({...event,cursor:++relayCursor,revision:conversation.revision,payload:{conversation}})) + '\n\n')) await once(res, 'drain', {signal:controller.signal});
      } }
      finally { res.removeListener('close', stop); clearInterval(poll); stopHeartbeat(); controller.abort(); subscription.close(); if (!res.destroyed) res.end(); }
      return;
    }
    inflight++;
    try {
      if (route === '/generate') {
        const current = readProcessRecord(options.dataRoot);
        if (retiring && current && current.identity.instanceId !== instanceId) throw new AgentServiceError('agent_process_switching','新模型调用请重新连接当前后台，本次尚未受理。',503);
        if (!accepting) throw new AgentServiceError('agent_process_switching', '新版尚未就绪，本次模型请求尚未受理。', 503);
        if (typeof input.requestId !== 'string' || generations.has(input.requestId)) throw new AgentServiceError('agent_generation_conflict', '模型调用身份已占用。', 409);
        const controller = new AbortController(); generations.set(input.requestId, controller);
        const disconnected = () => { if(!res.writableEnded)controller.abort(); }; res.once('close',disconnected);
        try { json(res, 200, await service.models.generate({ ...input.input, signal: controller.signal })); }
        finally { res.removeListener('close',disconnected); generations.delete(input.requestId); }
        return;
      }
      if (route !== '/operations' || input.contract !== AGENT_EXECUTION_CONTRACTS.operations || typeof input.sourceId !== 'string' || typeof input.operation !== 'string' || !Array.isArray(input.args)) throw new AgentServiceError('agent_process_operation_invalid', '执行操作契约不匹配。');
      if (!caller) operationScopes(input.sourceId, input.operation, input.args);
      validateOperation(input.operation, input.args);
      const name: string = input.operation;
      if(name.startsWith('programmatic.')&&!accepting)throw new AgentServiceError('agent_process_switching','凭据维护等待协调后台就绪，尚未写入。',503);
      if(name==='conversations.read')await service.conversations.reconcileSupplementReceipts(input.args[0],input.args[1]);
      if (['conversations.observe','conversations.observeRun'].includes(name) &&
          await service.reconcilePersisted(input.args[0],input.args[1],name==='conversations.observeRun'?input.args[2]:undefined)) {
        json(res,200,service.conversations.read(input.args[0],input.args[1]));return;
      }
      if(name==='conversations.reply') {
        const view=repository.readState(input.args[1])?.view;
        if(view?.stopRequest?.runIds.includes(input.args[3]?.runId))throw new AgentServiceError('agent_request_stale','本轮已经请求停止，不能向已取消执行提交回答或授权。',409);
        if(view?.retainedRuns?.some(run=>run.id===input.args[3]?.runId&&run.supersededBy))throw new AgentServiceError('agent_request_stale','原问题等待已结束，不能向旧执行提交回答。',409);
      }
      let target: ProcessRecord | undefined;
      let controlGeneration:string|undefined;
      const perConversation = name.startsWith('conversations.') && !/Draft/.test(name) && typeof input.args[0] === 'string' && typeof input.args[1] === 'string';
      // Metadata belongs to the current application schema, not the retained native run owner.
      if (perConversation && !['conversations.participation','conversations.update','conversations.settleRetainedRun','conversations.stopAll','conversations.read','conversations.readEntry','conversations.readHistory','conversations.fork','conversations.createChild','conversations.listChildren','conversations.send','conversations.prepareSend','conversations.prepareHandoff','conversations.queueSend','conversations.cancelPendingSend'].includes(name)) {
        const control = ['conversations.stop','conversations.observeRun','conversations.releaseQuestionWait','conversations.supplement'].includes(name) ? input.args[2] : name === 'conversations.reply' ? input.args[3] : undefined;
        controlGeneration=control?.generation;
        target = await recipient(input.args[0], input.args[1], controlGeneration);
      }
      if (target && name==='conversations.observe') {
        const run=repository.readConversation(input.args[1])?.view.run;
        if (run && run.generation===target.identity.generation) {
          const state=await request(target.origin,target.token,'/conversation-state',{sourceId:input.sourceId,scope:input.args[0],id:input.args[1],observe:true,runId:run.id,generation:run.generation},AbortSignal.timeout(15000));
          const latest=repository.readConversation(input.args[1])?.view.run;
          if (state.observed===true && state.busy===false && state.generation===run.generation && state.runId===run.id && latest?.id===run.id && latest.generation===run.generation && ['completed','stopped','failed'].includes(latest.status)) target=undefined;
        }
      }
      const current = readProcessRecord(options.dataRoot);
      if (!target && retiring && current && current.identity.instanceId !== instanceId) {
        const run = perConversation ? repository.readState(input.args[1])?.view.run : undefined;
        const ownsRun = controlGeneration ? controlGeneration === identity.generation : run?.generation === identity.generation;
        if (!ownsRun || ['conversations.update','conversations.settleRetainedRun','conversations.readEntry','conversations.readHistory','conversations.fork','conversations.createChild','conversations.listChildren','conversations.send','conversations.prepareSend','conversations.prepareHandoff','conversations.queueSend','conversations.cancelPendingSend'].includes(name)) target = current;
      }
      if (target) {
        const result=await forward(target, '/operations', input, caller);
        // Legacy owners can leave a settled, unaccepted submission permanently
        // "stopping" because there is no native execution identity to control.
        // Cancel only its recovery intent; retain delivery and resource unknowns.
        if(name==='conversations.stop'&&!input.args[2]?.toolId&&result.run?.id===input.args[2]?.runId&&result.run.accepted===false&&['stopping','unknown'].includes(result.run.status)){
          const ownerStatus=await request(target.origin,target.token,'/status',undefined,AbortSignal.timeout(3000));
          if(ownerStatus.identity?.generation===target.identity.generation && ownerStatus.retiring && !ownerStatus.accepting && !ownerStatus.activity.reasons.some((reason:{kind:string;count:number})=>['execution','input','recovery','reply'].includes(reason.kind)&&reason.count>0)){
            const record=repository.readConversation(input.args[1]);
            if(record && record.view.revision===result.revision && !record.attempts.find(attempt=>attempt.runId===result.run.id)?.executionRef){
              json(res,200,await service.conversations.stop(input.args[0],input.args[1],{...input.args[2],expectedRevision:result.revision}));return;
            }
          }
        }
        json(res,200,result);return;
      }
      const startsWork = !name.startsWith('conversations.') || ['conversations.fork','conversations.startDraft','conversations.create','conversations.createChild','conversations.send','conversations.prepareSend','conversations.prepareHandoff','conversations.generateTitle'].includes(name);
      if (startsWork && !accepting) throw new AgentServiceError('agent_process_switching', '执行后台正在采用新版，本次新操作尚未受理。', 503);
      if (['conversations.startDraft','conversations.send'].includes(name) && pending?.state !== 'failed' && pending?.runtime.digest !== undefined && pending.runtime.digest !== options.runtime.digest) throw new AgentServiceError('agent_process_switching','新版尚未就绪，可以提交待发送内容。',503);
      if (name === 'conversations.send' && await conversationBusy(input.args[0],input.args[1]) && !service.allowsReleasedContinuation(input.args[0],input.args[1],input.args[2])) throw new AgentServiceError('agent_conversation_busy','上一轮仍未释放，可以提交待发送内容。',409);
      if (name === 'conversations.send' && new PendingSendRepository(path.join(options.dataRoot,'agent-service')).read(input.args[0],input.args[1])) throw new AgentServiceError('agent_pending_conflict','已有待发送内容，请等待、修改或取消。',409);
      let result: any = await dispatchOperation(service, input.operation, input.args);
      if (name === 'connections.disconnect' || name === 'models.accounts.disconnect') {
        const revoke = name === 'connections.disconnect' ? {connectionId:input.args[0]} : {accountId:input.args[0]};
        const released=await Promise.allSettled(readProcessInstances(options.dataRoot).filter(record=>record.identity.instanceId!==instanceId&&!record.stopped&&live(record.identity.pid)).map(record=>request(record.origin,record.token,'/revoke',revoke)));
        if(released.some(value=>value.status==='rejected'))throw new AgentServiceError('agent_connection_release_unconfirmed','接入已断开，部分旧执行释放尚待核对。',409);
      }
      if (['conversations.pending', 'conversations.pendingSummary'].includes(input.operation)) result = { conversations: result.conversations.filter((value: {workspaceId:string}) => caller ? callers.canRead(caller, value.workspaceId) : executionScopeRef(value.workspaceId, options.legacySourceId).sourceId === input.sourceId) };
      json(res, 200, result);
    } finally { inflight--; }
  });
  abortStart = async () => { await web.close(); await webConnection?.then(value=>value.disconnect()); await channel.close(); await service.close(); };
  const processRecord = (): ProcessRecord => ({identity,origin:channel.origin,token:options.token,retiring,...(backendChange ? {backendChange} : {})});
  writeProcessInstance(options.dataRoot, processRecord());
  writePrivate(path.join(controlRoot(options.dataRoot), 'instance.json'), processRecord());
  void web.resume().catch(()=>{});
  let closeWork: Promise<void> | undefined;
  function close(reason='internal-close'): Promise<void> {
    if (closeWork) return closeWork;
    diagnostics({event:'service-close-request',reason});
    closing = true; accepting = false;
    storageMaintenance.close();
    let confirmed=false;
    closeWork = (async () => {
      try {
        for (const controller of generations.values()) controller.abort();
        await web.close();
        await webConnection?.then(value=>value.disconnect()).catch(()=>{});
        await service.close();
        await Promise.all([...forwardingClients.values()].map(client => client.close()));
        await new Promise<void>(resolve => setImmediate(resolve));
        const activity = service.activity();
        confirmed=!activity.busy;
        const stopFile = path.join(controlRoot(options.dataRoot), 'last-stop.json');
        const prev = readPrivate<{ instanceId?: string; confirmed?: boolean; reasons?: string[]; history?: Array<{ instanceId: string; confirmed: boolean; reasons?: string[] }> }>(stopFile);
        const priorHistory = prev ? [
          ...(Array.isArray(prev.history) ? prev.history : []),
          ...(typeof prev.instanceId === 'string' && typeof prev.confirmed === 'boolean' ? [{ instanceId: prev.instanceId, confirmed: prev.confirmed, reasons: prev.reasons }] : []),
        ] : [];
        const history = [...priorHistory.filter(entry => entry && typeof entry.instanceId === 'string' && entry.instanceId !== instanceId), { instanceId, confirmed, reasons: activity.reasons }].slice(-32);
        writePrivate(stopFile, { instanceId, confirmed, reasons: activity.reasons, history });
        writeProcessInstance(options.dataRoot, {...processRecord(),stopped:true,confirmed});
        await channel.close(); clearProcessRecord(options.dataRoot, instanceId);
        diagnostics({event:'service-close-result',confirmed});
      } finally { if(confirmed&&ownsMetadata)owner.release(); clearInterval(timer); process.removeListener('SIGTERM', term); process.removeListener('SIGINT', interrupt);cleanupDiagnostics?.(); }
    })(); return closeWork;
  }
  const signal = (name:string) => { diagnostics({event:'service-signal',signal:name});void close('signal-'+name).finally(() => { process.exitCode = 0; }); };
  const term=()=>signal('SIGTERM'),interrupt=()=>signal('SIGINT');
  process.once('SIGTERM', term); process.once('SIGINT', interrupt);
  let parallelChild: number | undefined;
  let successorReady = false;
  function restoreParallelOwner(): boolean {
    if (ownsMetadata || (parallelChild && live(parallelChild))) return ownsMetadata;
    try { owner = claim(options.dataRoot, 'owner'); }
    catch (error) {
      diagnostics({event:'service-adoption-record-failed',code:diagnosticCode(error),reason:'restore-owner'});
      return false;
    }
    const restored = {...processRecord(),retiring:false};
    try {
      writeProcessInstance(options.dataRoot, restored);
      writePrivate(path.join(controlRoot(options.dataRoot),'instance.json'),restored);
    } catch (error) {
      owner.release();
      throw error;
    }
    ownsMetadata = true;
    retiring = false;
    service.resumeMetadata();
    accepting = true;
    void web.resume().catch(()=>{});
    return true;
  }

  async function adoptParallel(target: AgentRuntimeUnit): Promise<void> {
    let startup: ReturnType<typeof claim> | undefined;
    parallelChild = undefined;
    successorReady = false;
    accepting = false;
    try {
      startup = claim(options.dataRoot, 'startup');
      await service.freezeMetadata();
      if (inflight || recovering || closing) { service.resumeMetadata(); accepting = !closing; return; }
      await service.releaseIdleSources();
      const starting: PendingRuntime = {runtime:target,state:'parallel-starting'};
      await savePendingAfterStorageWait(starting);
      pending = starting;
      if (closing) return;
      await web.releaseListener();
      retiring = true;
      writeProcessInstance(options.dataRoot, processRecord());
      writePrivate(path.join(controlRoot(options.dataRoot),'instance.json'),processRecord());
      owner.release(); ownsMetadata = false;
      parallelChild = launchAgentProcess({...options,runtime:target,token:privateToken()});
      const deadline = performance.now() + PARALLEL_START_WAIT_MS;
      while (performance.now() < deadline) {
        const current = readProcessRecord(options.dataRoot);
        if (current && current.identity.runtime.digest===target.digest && current.identity.instanceId!==instanceId) {
          const observed = await request(current.origin,current.token,'/identity',undefined,AbortSignal.timeout(1000)).catch(()=>undefined);
          if (observed?.instanceId===current.identity.instanceId && observed.generation===current.identity.generation) { successorReady=true;pending=undefined;return; }
        }
        if (!live(parallelChild)) break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new AgentServiceError('agent_process_start_unconfirmed','新版尚未确认就绪，原工作和待发送内容已保留。',503);
    } catch (error) {
      diagnostics({event:'service-adoption-record-failed',code:diagnosticCode(error),reason:'parallel-adoption'});
      if (ownsMetadata) { service.resumeMetadata(); accepting = !closing; void web.resume().catch(()=>{}); }
      else if (!closing) restoreParallelOwner();
      pending = {runtime:target,state:'failed',diagnostic:'新版后台未确认就绪，原工作和待发送内容已保留。'};
      if (ownsMetadata && !closing) await savePendingAfterStorageWait(pending);
    } finally { startup?.release(); }
  }
  const storageMaintenance = new StorageMaintenance(options.dataRoot, {
    enabled: () => accepting && !retiring && !closing && !inflight && !recovering && !sends.busy && service.canMaintainStorage(),
    runtime: options.runtime, diagnostics,
  });
  let unsettledSince: number | undefined, retirementAttempt = 0;
  const RETIRED_GRACE_MS = 60_000, RETIRED_RETRY_MS = 5_000;
  const watchedPeerGenerations = new Set<string>(
    readProcessInstances(options.dataRoot)
      .filter(record => record.identity.instanceId !== instanceId && !record.stopped && live(record.identity.pid))
      .map(record => record.identity.generation),
  );
  let previousTick = performance.now();
  const timer = setInterval(() => {
    const tick = performance.now();
    const durationMs = Math.round(tick - previousTick - 250);
    previousTick = tick;
    if (durationMs >= 500) diagnostics({event:'service-event-loop-delay',durationMs});
    if (closing || adopting) return;
    if (!retiring || !successorReady) { unsettledSince = undefined; if (!retiring) retirementAttempt = 0; }
    if (retiring) {
      const now = Date.now();
      // Retrying a release proof four times a second never changes the outcome
      // and keeps the retired process hot. Retry slowly instead.
      if (now - retirementAttempt < RETIRED_RETRY_MS) return;
      retirementAttempt = now;
      if (!successorReady) {
        adopting = (async () => {
          const current = readProcessRecord(options.dataRoot);
          if (current && current.identity.instanceId !== instanceId && !current.retiring && live(current.identity.pid)) {
            const observed = await request(current.origin,current.token,'/identity',undefined,AbortSignal.timeout(1000));
            successorReady = observed?.instanceId === current.identity.instanceId && observed.generation === current.identity.generation;
          } else if (restoreParallelOwner() && pending) await savePendingAfterStorageWait(pending);
        })().catch(error => {
          diagnostics({event:'service-adoption-record-failed',code:diagnosticCode(error),reason:'restore-pending'});
        }).finally(() => { adopting=undefined; });
        return;
      }
      adopting = Promise.race([
        service.releaseIdleSources().catch(() => {}),
        // A native release proof may itself stall; the retired process still
        // reaches the bounded exit below instead of waiting on it forever.
        new Promise<void>(resolve => { const stalled = setTimeout(resolve, 20_000); stalled.unref?.(); }),
      ]).then(async () => {
        const current = status();
        if (!current.activity.busy && !inflight) { unsettledSince = undefined; void close('retired-idle').finally(()=>{process.exitCode=0;}); return; }
        // A successor already owns new work; only this generation's own
        // execution can keep it alive. When the remaining reasons are native
        // resources whose release can no longer be proven, record the exact
        // uncertainty and exit instead of holding the process forever.
        const unsettledOnly = current.activity.reasons.every(reason => reason.kind === 'source-resource' || reason.kind === 'unfinished-execution');
        if (inflight || !unsettledOnly) { unsettledSince = undefined; return; }
        const settledAt = Date.now();
        unsettledSince ??= settledAt;
        if (settledAt - unsettledSince < RETIRED_GRACE_MS) return;
        await service.releaseRetiredWork();
        if (!status().activity.busy && !inflight) void close('retired-unconfirmed').finally(()=>{process.exitCode=0;});
      }).catch(() => { /* Keep the exact old owner until native release is confirmed. */ }).finally(() => { adopting=undefined; });
      return;
    }
    if (accepting) {
      const livePeers = new Set(
        readProcessInstances(options.dataRoot)
          .filter(record => record.identity.instanceId !== instanceId && !record.stopped && live(record.identity.pid))
          .map(record => record.identity.generation),
      );
      let peerExited = false;
      for (const peer of [...watchedPeerGenerations]) {
        if (!livePeers.has(peer)) {
          watchedPeerGenerations.delete(peer);
          peerExited = true;
        }
      }
      for (const peer of livePeers) watchedPeerGenerations.add(peer);
      if (peerExited) recoverAfterHostAttach();
      void sends.pump().catch(()=>{});
    }
    if (pending?.state==='waiting' && canRunParallel(options.runtime,pending.runtime) && !inflight && !recovering && !sends.busy) {
      const target=pending.runtime;
      adopting=adoptParallel(target).catch(error => {
        diagnostics({event:'service-adoption-record-failed',code:diagnosticCode(error),reason:'parallel-rollback'});
      }).finally(()=>{adopting=undefined;});
      return;
    }
    if (closing || pending?.state !== 'waiting' || !accepting || status().activity.busy) return;
    const starting=readLock(options.dataRoot,'startup');if(starting&&live(starting.pid))return;
    if (readProcessInstances(options.dataRoot).some(record=>record.identity.instanceId!==instanceId&&!record.stopped&&live(record.identity.pid))) return;
    accepting = false;
    if (status().activity.busy) { accepting = true; return; }
    const target = pending.runtime;
    pending = { runtime: target, state: 'switching' }; savePending(pending);
    const handoff = path.join(controlRoot(options.dataRoot), 'handoff-' + instanceId + '.json');
    writePrivate(handoff, { bootstrap: options, expectedInstanceId: instanceId, target });
    // The short-lived successor coordinator owns the handoff after this process exits.
    const child = spawn(options.runtime.node, [path.join(options.runtime.directory, 'build/process/handoff.js'), handoff], { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', () => { pending = { runtime: target, state: 'failed', diagnostic: '无法启动版本交接程序，旧后台已保留。' }; savePending(pending); accepting = true; });
    child.once('spawn', () => { pending = { runtime: target, state: 'switching', coordinatorPid: child.pid, handoffFile:handoff }; savePending(pending); child.unref(); void close('runtime-handoff').finally(() => { process.exitCode = 0; }); });
  }, 250);
  timer.unref();
  return { identity, origin: channel.origin, status, close };
  } catch (error) { try { await abortStart?.(); } finally { cleanupDiagnostics?.();owner.release(); } throw error; }
}
