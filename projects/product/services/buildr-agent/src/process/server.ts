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
import { dispatchOperation, validateOperation } from './operations.ts';
import { authorize, body, json, listen, request, privateToken, keepEventStreamAlive } from './transport.ts';
import { claim, clearProcessRecord, controlRoot, readPrivate, writePrivate, readProcessRecord, readProcessInstances, writeProcessInstance, generationAlive, live, readLock } from './ownership.ts';
import type { ProcessBootstrap, ProcessRecord } from './ownership.ts';
import { validateAgentRuntime, canRunParallel } from './runtime-unit.ts';
import { launchAgentProcess } from './handoff.ts';
import { ConversationRepository } from '../persistence/conversation-repository.ts';
import { PendingSends } from './pending-sends.ts';
import { PendingSendRepository } from '../persistence/pending-send-repository.ts';
import { cleanupStoppedProcesses } from './cleanup.ts';

interface PendingRuntime { runtime: AgentRuntimeUnit; state: 'waiting' | 'switching' | 'parallel-starting' | 'failed'; coordinatorPid?: number; handoffFile?: string; diagnostic?: string }
export async function startAgentExecutionServer(options: ProcessBootstrap & { serviceOptions?: Pick<AgentServiceOptions, 'executors' | 'modelProviders' | 'programManager'> }) {
  validateAgentRuntime(options.dataRoot, options.runtime);
  let owner = claim(options.dataRoot, 'owner'), ownsMetadata = true;
  let abortStart: (() => Promise<void>) | undefined;
  try {
  const hosts = new AgentHostRegistry();
  const service = createAgentService({ ...options.serviceOptions, dataRoot: options.dataRoot, legacySourceId: options.legacySourceId, autoContinueInterrupted: options.autoContinueInterrupted, host: hosts, generationAlive: generation => generationAlive(options.dataRoot, generation) });
  const repository = new ConversationRepository(path.join(options.dataRoot, 'agent-service'));
  service.models.startRefreshing();
  abortStart = () => service.close();
  const instanceId = randomUUID(), pendingFile = path.join(controlRoot(options.dataRoot), 'pending.json');
  const identity: AgentProcessIdentity = { contracts: AGENT_EXECUTION_CONTRACTS, instanceId, generation: service.generation, profileId: options.profileId, dataRoot: path.resolve(options.dataRoot), pid: process.pid, runtime: options.runtime, parallelCompatibility: options.runtime.parallelCompatibility };
  let accepting = true, closing = false, recovering = false, startedRecovery = false, inflight = 0;
  let retiring = false, adopting: Promise<void> | undefined;
  let pending = readPrivate<PendingRuntime>(pendingFile);
  if (pending?.runtime.digest === options.runtime.digest) { pending = undefined; writePrivate(pendingFile, { runtime: options.runtime, state: 'adopted' }); }
  if (pending?.state === 'switching') pending = { ...pending, state: 'failed', diagnostic: '上次切换尚未确认，请核对实际运行版本。' };
  const generations = new Map<string, AbortController>();
  function status(): AgentProcessStatus {
    const activity = service.activity();
    if (inflight) activity.reasons.push({ kind: 'operation', count: inflight });
    if (recovering) activity.reasons.push({ kind: 'recovery-start', count: 1 });
    activity.busy = activity.reasons.length > 0;
    return { identity, activity, accepting, retiring, instances: readProcessInstances(options.dataRoot).filter(record => !record.stopped && live(record.identity.pid)).map(record => ({generation:record.identity.generation,runtimeDigest:record.identity.runtime.digest,retiring:Boolean(record.retiring)})), ...(pending && pending.runtime.digest !== options.runtime.digest ? { pendingRuntime: pending.runtime, diagnostic: pending.diagnostic } : {}) };
  }
  async function recipient(scope: string, id: string, generation?: string): Promise<ProcessRecord | undefined> {
    const conversation = repository.readConversation(id)?.view;
    const run = conversation?.run;
    const ownerGeneration = generation ?? run?.generation;
    if (!ownerGeneration || ownerGeneration === identity.generation) return;
    const record = readProcessInstances(options.dataRoot).find(record => record.identity.generation === ownerGeneration && !record.stopped);
    if (!record || !live(record.identity.pid)) return;
    if (record.identity.profileId !== options.profileId) throw new AgentServiceError('agent_process_identity_mismatch', '执行所属配置域不匹配。', 409);
    if (generation) return record;
    // The owning generation persists this acknowledgement only after closing the
    // exact native resources. Historical contexts retained by that process do
    // not own this ended round; unknown results and unfinished tools still wait.
    if (run?.resourcesReleased && run.executionState === 'ended' && ['completed','failed','stopped'].includes(run.status) && !conversation!.requests.length && run.tools.every(tool=>tool.status==='completed')) return;
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
    if (await recipient(scope, id)) return true;
    return service.conversationBusy(scope, id);
  }
  async function forward(record: ProcessRecord, route: string, input: any): Promise<any> {
    const visited: string[] = input.forwarded ?? [];
    if (!Array.isArray(visited) || visited.length > 8 || visited.includes(identity.instanceId)) throw new AgentServiceError('agent_process_route_conflict', '执行归属发生变化，请重新读取。', 409);
    try { return await request(record.origin, record.token, route, {...input,forwarded:[...visited,identity.instanceId]}); }
    catch (error) { if (error instanceof AgentServiceError) throw error; throw new AgentServiceError('agent_operation_result_unknown', '原后台操作结果尚待核对，不会自动重发。', 503); }
  }
  const sends = new PendingSends({dataRoot:options.dataRoot,service,active:()=>!closing&&accepting&&!retiring&&(!pending||pending.runtime.digest===options.runtime.digest)&&readProcessRecord(options.dataRoot)?.identity.instanceId===instanceId,generationAlive:generation=>generationAlive(options.dataRoot,generation),conversationBusy,stopWaitingHandoff:async(row,alreadyRequested)=>{
    service.checkWaitingHandoff(row.scope,row.conversationId,row.id);
    const view=service.conversations.read(row.scope,row.conversationId), run=view.run!;
    if(['stopped','failed','completed'].includes(run.status)&&!view.requests.length&&run.tools.every(tool=>tool.status==='completed'))return;
    const stop=run.status==='waiting-question'&&!alreadyRequested;
    const operation=stop?'conversations.stop':'conversations.observe';
    const control={expectedRevision:view.revision,runId:run.id,participantId:run.participantId,generation:run.generation};
    const target=await recipient(row.scope,row.conversationId,run.generation);
    try {
      if(target)await forward(target,'/operations',{contract:AGENT_EXECUTION_CONTRACTS.operations,sourceId:executionScopeRef(row.scope,options.legacySourceId).sourceId,operation,args:stop?[row.scope,row.conversationId,control]:[row.scope,row.conversationId]});
      else if(stop)await service.conversations.stop(row.scope,row.conversationId,control);
      else await service.conversations.observe(row.scope,row.conversationId);
    }catch(error){
      const latest=service.conversations.read(row.scope,row.conversationId).run;
      if(latest?.id===run.id&&['unknown','stopping'].includes(latest.status))throw new AgentServiceError('agent_process_state_unconfirmed',latest.diagnostic??'停止尚未确认，交接内容已保存，正在核对原执行。',409);
      throw error;
    }
    service.checkWaitingHandoff(row.scope,row.conversationId,row.id);
    const latest=service.conversations.read(row.scope,row.conversationId).run!;
    if(latest.status==='waiting-question')throw new AgentServiceError('agent_handoff_stop_unconfirmed','原轮仍在等待回答，尚未确认停止。交接内容已保留，可修改后重试或取消。',409);
    if(latest.status==='unknown')throw new AgentServiceError('agent_process_state_unconfirmed',latest.diagnostic??'原轮停止结果尚未确认，正在核对，未发送给新模型。',409);
  }});
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
    const attachmentUpload = req.url === '/operations' && req.headers['x-buildr-operation'] === 'conversations.addAttachment';
    const input = await body(req, attachmentUpload ? 46 * 1024 * 1024 : undefined);
    if (attachmentUpload && input.operation !== 'conversations.addAttachment') throw new AgentServiceError('agent_process_operation_invalid', '附件传输操作不匹配。');
    if (req.url === '/host/attach') {
      if (closing) throw new AgentServiceError('agent_process_switching','执行后台正在退出，宿主尚未接入。',503);
      hosts.attach(input.peer);
      if (!startedRecovery && !retiring) { startedRecovery = true; recovering = true; void service.conversations.recoverInterrupted().catch(() => {}).finally(() => { recovering = false; }); }
      json(res, 200, { attached: true }); return;
    }
    if (req.url === '/host/detach') { hosts.detach(input.peerId); json(res, 200, { detached: true }); return; }
    if (req.url === '/conversation-state') {
      if (input.observe===true) {
        scope(input.sourceId,input.scope);
        const released=await service.observeForRelease(input.scope,input.id,input.runId,input.generation);
        json(res,200,{generation:identity.generation,runId:input.runId,observed:true,busy:!released}); return;
      }
      if (retiring) await service.releaseIdleSources({workspaceId:input.scope,id:input.id});
      json(res, 200, {generation:identity.generation,busy:service.conversationBusy(input.scope,input.id) || retiring && service.retainsConversationSource(input.scope,input.id)}); return;
    }
    if (req.url === '/revoke') {
      if (input.connectionId) { service.revokeModel('native-'+input.connectionId); await service.connections.disconnect(input.connectionId, {expectedRevision:service.connections.read(input.connectionId).revision}); }
      if (input.accountId) service.revokeModel(input.accountId);
      json(res, 200, {revoked:true}); return;
    }
    if (req.url === '/runtime') {
      const current = readProcessRecord(options.dataRoot);
      if (retiring && current && current.identity.instanceId !== instanceId) { json(res, 200, await forward(current, '/runtime', {...input,expectedGeneration:current.identity.generation})); return; }
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
    if (req.url === '/cancel-generation') { generations.get(input.requestId)?.abort(); json(res, 200, { cancelled: true }); return; }
    if (req.url === '/events') {
      scope(input.sourceId, input.scope);
      const subscription = service.conversations.subscribe(input.scope, input.id);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      res.flushHeaders();
      const stopHeartbeat = keepEventStreamAlive(res);
      const controller = new AbortController();
      let signature = '', relayCursor = 0;
      const refresh = () => {
        if (res.destroyed || controller.signal.aborted) return;
        try {
          const conversation = service.conversations.read(input.scope, input.id);
          const next = [conversation.revision,conversation.pendingSend?.revision,conversation.activity?.seenThrough].join(':');
          if (next === signature) return;
          signature = next;
          if (res.writableLength > 8 * 1024 * 1024) { res.destroy(); return; }
          res.write('data: ' + JSON.stringify({type:'conversation',generation:identity.generation,cursor:++relayCursor,workspaceId:input.scope,conversationId:input.id,revision:conversation.revision,payload:{conversation}}) + '\n\n');
        } catch { /* Preserve the last observed snapshot on a transient read conflict. */ }
      };
      // Shared snapshots also cover another retained generation and pending-only
      // changes; they do not resume native contexts or trigger an execution.
      const poll = setInterval(refresh, 500); poll.unref();
      const stop = () => { controller.abort(); subscription.close(); clearInterval(poll); stopHeartbeat(); }; res.once('close', stop);
      try { for await (const event of subscription.events) {
        if (res.destroyed) break;
        const conversation = service.conversations.read(input.scope, input.id);
        signature = [conversation.revision,conversation.pendingSend?.revision,conversation.activity?.seenThrough].join(':');
        if (!res.write('data: ' + JSON.stringify({...event,cursor:++relayCursor,revision:conversation.revision,payload:{conversation}}) + '\n\n')) await once(res, 'drain', {signal:controller.signal});
      } }
      finally { res.removeListener('close', stop); clearInterval(poll); stopHeartbeat(); controller.abort(); subscription.close(); if (!res.destroyed) res.end(); }
      return;
    }
    inflight++;
    try {
      if (req.url === '/generate') {
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
      if (req.url !== '/operations' || input.contract !== AGENT_EXECUTION_CONTRACTS.operations || typeof input.sourceId !== 'string' || typeof input.operation !== 'string' || !Array.isArray(input.args)) throw new AgentServiceError('agent_process_operation_invalid', '执行操作契约不匹配。');
      operationScopes(input.sourceId, input.operation, input.args);
      validateOperation(input.operation, input.args);
      const name: string = input.operation;
      let target: ProcessRecord | undefined;
      const perConversation = name.startsWith('conversations.') && !/Draft/.test(name) && typeof input.args[0] === 'string' && typeof input.args[1] === 'string';
      if (perConversation && !['conversations.fork','conversations.createChild','conversations.listChildren','conversations.send','conversations.prepareSend','conversations.prepareHandoff','conversations.queueSend','conversations.cancelPendingSend'].includes(name)) {
        const control = ['conversations.stop','conversations.supplement'].includes(name) ? input.args[2] : name === 'conversations.reply' ? input.args[3] : undefined;
        target = await recipient(input.args[0], input.args[1], control?.generation);
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
        const run = perConversation ? repository.readConversation(input.args[1])?.view.run : undefined;
        const ownsRun = run?.generation === identity.generation;
        if (!ownsRun || ['conversations.fork','conversations.createChild','conversations.listChildren','conversations.send','conversations.prepareSend','conversations.prepareHandoff','conversations.queueSend','conversations.cancelPendingSend'].includes(name)) target = current;
      }
      if (target) { json(res, 200, await forward(target, '/operations', input)); return; }
      const startsWork = !name.startsWith('conversations.') || ['conversations.fork','conversations.startDraft','conversations.create','conversations.createChild','conversations.send','conversations.prepareSend','conversations.prepareHandoff','conversations.generateTitle'].includes(name);
      if (startsWork && !accepting) throw new AgentServiceError('agent_process_switching', '执行后台正在采用新版，本次新操作尚未受理。', 503);
      if (['conversations.startDraft','conversations.send'].includes(name) && pending?.runtime.digest !== undefined && pending.runtime.digest !== options.runtime.digest) throw new AgentServiceError('agent_process_switching','新版尚未就绪，可以提交待发送内容。',503);
      if (name === 'conversations.send' && await conversationBusy(input.args[0],input.args[1]) && !service.allowsReleasedContinuation(input.args[0],input.args[1],input.args[2])) throw new AgentServiceError('agent_conversation_busy','上一轮仍未释放，可以提交待发送内容。',409);
      if (name === 'conversations.send' && new PendingSendRepository(path.join(options.dataRoot,'agent-service')).read(input.args[0],input.args[1])) throw new AgentServiceError('agent_pending_conflict','已有待发送内容，请等待、修改或取消。',409);
      let result: any = await dispatchOperation(service, input.operation, input.args);
      if (name === 'connections.disconnect' || name === 'models.accounts.disconnect') {
        const revoke = name === 'connections.disconnect' ? {connectionId:input.args[0]} : {accountId:input.args[0]};
        const released=await Promise.allSettled(readProcessInstances(options.dataRoot).filter(record=>record.identity.instanceId!==instanceId&&!record.stopped&&live(record.identity.pid)).map(record=>request(record.origin,record.token,'/revoke',revoke)));
        if(released.some(value=>value.status==='rejected'))throw new AgentServiceError('agent_connection_release_unconfirmed','接入已断开，部分旧执行释放尚待核对。',409);
      }
      if (input.operation === 'conversations.pending') result = { conversations: result.conversations.filter((value: {workspaceId:string}) => executionScopeRef(value.workspaceId, options.legacySourceId).sourceId === input.sourceId) };
      json(res, 200, result);
    } finally { inflight--; }
  });
  abortStart = async () => { await channel.close(); await service.close(); };
  const processRecord = (): ProcessRecord => ({identity,origin:channel.origin,token:options.token,retiring});
  writeProcessInstance(options.dataRoot, processRecord());
  writePrivate(path.join(controlRoot(options.dataRoot), 'instance.json'), processRecord());
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
        writeProcessInstance(options.dataRoot, {...processRecord(),stopped:true,confirmed});
        await channel.close(); clearProcessRecord(options.dataRoot, instanceId);
      } finally { if(confirmed&&ownsMetadata)owner.release(); clearInterval(timer); process.removeListener('SIGTERM', signal); process.removeListener('SIGINT', signal); }
    })(); return closeWork;
  }
  const signal = () => { void close().finally(() => { process.exitCode = 0; }); };
  process.once('SIGTERM', signal); process.once('SIGINT', signal);
  async function adoptParallel(target: AgentRuntimeUnit): Promise<void> {
    let startup: ReturnType<typeof claim> | undefined;
    let pid: number | undefined;
    accepting = false;
    try {
      startup = claim(options.dataRoot, 'startup');
      await service.freezeMetadata();
      if (inflight || recovering || closing) { service.resumeMetadata(); accepting = !closing; return; }
      await service.releaseIdleSources();
      retiring = true;
      writeProcessInstance(options.dataRoot, processRecord());
      writePrivate(path.join(controlRoot(options.dataRoot),'instance.json'),processRecord());
      owner.release(); ownsMetadata = false;
      pending = {runtime:target,state:'parallel-starting'}; writePrivate(pendingFile,pending);
      pid = launchAgentProcess({...options,runtime:target,token:privateToken()});
      for (let attempt=0;attempt<200;attempt++) {
        const current = readProcessRecord(options.dataRoot);
        if (current && current.identity.runtime.digest===target.digest && current.identity.instanceId!==instanceId) {
          const observed = await request(current.origin,current.token,'/identity',undefined,AbortSignal.timeout(1000)).catch(()=>undefined);
          if (observed?.instanceId===current.identity.instanceId && observed.generation===current.identity.generation) { pending=undefined;return; }
        }
        if (!live(pid)) break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new AgentServiceError('agent_process_start_unconfirmed','新版尚未确认就绪，原工作和待发送内容已保留。',503);
    } catch (error) {
      if (ownsMetadata) { accepting = true; pending = {runtime:target,state:'waiting'}; }
      else {
        const holder=readLock(options.dataRoot,'owner');
        if ((!pid||!live(pid))&&(!holder||!live(holder.pid))) {
          // Another offline observer may briefly own the metadata lock. Failure
          // to reacquire it must not reject the adoption task and kill old runs.
          let restored: ReturnType<typeof claim> | undefined;
          try { restored=claim(options.dataRoot,'owner'); } catch { /* Keep the original execution owner and wait. */ }
          if(restored){
            owner=restored;ownsMetadata=true;retiring=false;
            service.resumeMetadata();accepting=true;
            writeProcessInstance(options.dataRoot,processRecord());writePrivate(path.join(controlRoot(options.dataRoot),'instance.json'),processRecord());
          }
        }
        pending={runtime:target,state:'failed',diagnostic:'新版后台未确认就绪，原工作和待发送内容已保留。'};
        sends.waiting('新版执行后台尚未就绪，指令已保存；恢复后将自动接续。');
      }
      writePrivate(pendingFile,pending);
    } finally { startup?.release(); }
  }
  const timer = setInterval(() => {
    if (closing || adopting) return;
    if (retiring) {
      adopting = service.releaseIdleSources().then(() => {
        if (!status().activity.busy && !inflight) void close().finally(()=>{process.exitCode=0;});
      }).catch(() => { /* Keep the exact old owner until native release is confirmed. */ }).finally(() => { adopting=undefined; });
      return;
    }
    if (accepting) { void sends.pump().catch(()=>{}); try { cleanupStoppedProcesses(options.dataRoot,options.runtime); } catch { /* Unknown resources remain retained. */ } }
    if (pending?.state==='waiting' && canRunParallel(options.runtime,pending.runtime) && service.canAdoptParallel() && !inflight && !recovering && !sends.busy) {
      const target=pending.runtime;
      adopting=adoptParallel(target).finally(()=>{adopting=undefined;});
      return;
    }
    if (closing || pending?.state !== 'waiting' || !accepting || status().activity.busy) return;
    const starting=readLock(options.dataRoot,'startup');if(starting&&live(starting.pid))return;
    if (readProcessInstances(options.dataRoot).some(record=>record.identity.instanceId!==instanceId&&!record.stopped&&live(record.identity.pid))) return;
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
