import { body } from '../../src/process/transport.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import { AgentServiceError } from '../../src/domain/agent-state.ts';
import type { AgentExecutor, AgentServiceOptions, ConversationEntry, ExecutorObservation } from '../../src/contracts.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { fake, fixture, connected, waitUntil, send, fastRetries, gatewayProviders, sharedAccount, sendWithAccount, continueDraft } from '../support/conversations-fixture.ts';

test('acceptance loss remains unknown through process restart and never retries input', async () => {
  const native = fake('local', { unknown: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'write once');
    await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'unknown');
    const cold = createAgentService(f.options);
    try {
      await cold.conversations.observe('workspace-one', created.id);
      assert.equal(cold.conversations.read('workspace-one', created.id).run?.status, 'unknown');
      assert.equal(native.sends.length, 1);
      assert.equal(cold.conversations.prepareSend('workspace-one',created.id,{expectedRevision:cold.conversations.read('workspace-one',created.id).revision,connectionId:'local',text:'inspect a different issue'}).participantId,undefined);
      assert.equal(native.sends.length,1,'preparing a new instruction never replays the unknown original');
    } finally { await cold.close(); }
  } finally { await f.close(); }
});

test('cold observation cannot revoke persisted completion when a vendor has no recovered live-query state', async () => {
  const native = fake('local', { coldUnknown: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'first');
    const complete = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
    await f.service.close();
    const cold = createAgentService(f.options);
    try {
      const restored = await cold.conversations.observe('workspace-one', created.id);
      assert.equal(restored.run!.status, 'completed');
      assert.equal(restored.participants[0]!.contextId, complete.participants[0]!.contextId);
      send(cold, created.id, 'local', 'next');
      await waitUntil(() => cold.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
      assert.equal(native.sends.length, 2); assert.equal(native.contexts.size, 1);
    } finally { await cold.close(); }
  } finally { await f.close(); }
});

test('shutdown releases the owned runtime and stream when a native stop never returns', { timeout: 2_000 }, async () => {
  const native = fake('local', { toolSurvives: true });
  let stopCalls = 0; let closeCalls = 0;
  const executor: AgentExecutor = { ...native.executor, async open(input) {
    const runtime = await native.executor.open(input);
    return { ...runtime,
      async stop() { stopCalls++; return new Promise<ExecutorObservation>(() => {}); },
      async close() { closeCalls++; },
    };
  } };
  const f = fixture([executor], { shutdownTimeoutMs: 100 });
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'leave a command');
    await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'tools-active');
    const subscription = f.service.conversations.subscribe('workspace-one', created.id);
    const iterator = subscription.events[Symbol.asyncIterator]();
    assert.equal((await iterator.next()).value!.type, 'snapshot');
    await f.service.close();
    assert.equal(stopCalls, 1); assert.equal(closeCalls, 1, 'resource release must not wait for an unresponsive vendor stop');
    while (!(await iterator.next()).done) { /* Shutdown observations already queued remain readable. */ }
    assert.ok(['stopping', 'unknown'].includes(f.service.conversations.read('workspace-one', created.id).run!.status), 'an unconfirmed stop must not become a completed execution');
    await f.service.close(); assert.equal(closeCalls, 1, 'repeated shutdown must not close the native runtime twice');
    await assert.rejects(connected(f.service, 'local'), { code: 'agent_service_closing' });
  } finally { await f.close(); }
});

test('late native request resolution preserves each already observed terminal state', async t => {
  for (const status of ['completed', 'stopped', 'failed'] as const) await t.test(status, async () => {
    const native = fake('local', { request: true }); const f = fixture([native.executor]);
    try {
      await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
      send(f.service, created.id, 'local', 'ask permission');
      const waiting = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.requests.length === 1);
      if (status === 'stopped') {
        await f.service.conversations.stop('workspace-one', created.id, { expectedRevision: waiting.revision, runId: waiting.run!.id, participantId: waiting.run!.participantId, generation: waiting.run!.generation });
      } else {
        if (status === 'failed') native.sends[0]!.onEvent({ type: 'completed', status: 'failed', diagnostic: 'native failure after asking' });
        const context = native.contexts.values().next().value!;
        context.observation = { status: 'idle', tools: [] }; context.unblock!();
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      const terminal = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === status);
      native.sends[0]!.onEvent({ type: 'request-resolved', requestId: 'permit-one' });
      const after = f.service.conversations.read('workspace-one', created.id);
      assert.equal(after.run!.id, terminal.run!.id); assert.equal(after.run!.status, status);
      assert.deepEqual(after.requests, []); assert.equal(native.sends.length, 1);
    } finally { await f.close(); }
  });
});

test('failure to persist native acceptance keeps delivery unknown and never repeats a possibly delivered input', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    const db = new DatabaseSync(path.join(f.options.dataRoot, 'agent-service/conversations.sqlite'));
    try { db.exec("CREATE TRIGGER reject_acceptance BEFORE UPDATE ON conversations WHEN json_extract(NEW.body,'$.view.run.accepted')=1 BEGIN SELECT RAISE(ABORT,'fixture-acceptance-write-rejected'); END"); } finally { db.close(); }
    const draft = { expectedRevision: created.revision, connectionId: 'local', text: 'may have been delivered' };
    const preview = f.service.conversations.prepareSend('workspace-one', created.id, draft);
    const input = { ...draft, previewToken: preview.token, clientRequestId: 'acceptance-write-rejected' };
    f.service.conversations.send('workspace-one', created.id, input);
    const unknown = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'unknown');
    assert.equal(unknown.run!.accepted, false); assert.equal(unknown.entries[0]!.status, 'unknown');
    assert.ok(unknown.participants[0]!.contextId); assert.equal(native.sends.length, 1);
    assert.equal(f.service.conversations.send('workspace-one', created.id, input).run.id, unknown.run!.id);
    assert.equal(native.sends.length, 1);
    assert.equal(f.service.conversations.prepareSend('workspace-one',created.id,{expectedRevision:unknown.revision,connectionId:'local',text:'new issue without replay'}).participantId,undefined);assert.equal(native.sends.length,1);
  } finally { await f.close(); }
});

test('cold recovery rejects prior-generation replies and cannot release an unknown run from another execution observation', async () => {
  const native = fake('local', { request: true }); let opened = 0;
  const executor: AgentExecutor = { ...native.executor, async open(input) {
    const runtime = await native.executor.open(input); const ordinal = ++opened;
    return ordinal === 1 ? runtime : { ...runtime, async observe() { return { status: 'idle', executionRef: { id: 'another-execution' }, tools: [] }; } };
  } };
  const f = fixture([executor]); let cold: ReturnType<typeof createAgentService> | undefined;
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'request before process loss');
    const waiting = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.requests.length === 1);
    cold = createAgentService(f.options);
    await assert.rejects(cold.conversations.reply('workspace-one', created.id, waiting.requests[0]!.id, { expectedRevision: waiting.revision, runId: waiting.run!.id, participantId: waiting.run!.participantId, generation: waiting.run!.generation, answer: 'allow-once' }), { code: 'agent_control_stale' });
    const observed = await cold.conversations.observe('workspace-one', created.id);
    assert.equal(observed.run!.status, 'unknown');
    assert.deepEqual(observed.requests, [], 'old request handles must not be revived by a new service generation');
    assert.equal(cold!.conversations.prepareSend('workspace-one',created.id,{expectedRevision:observed.revision,connectionId:'local',text:'new goal'}).participantId,undefined);
    assert.equal(native.sends.length, 1);
  } finally {
    for (const context of native.contexts.values()) { context.observation = { status: 'stopped', tools: [] }; context.unblock?.(); }
    await new Promise<void>(resolve => setImmediate(resolve)); await cold?.close(); await f.close();
  }
});

test('shutdown preserves a completed current turn even when released unknown history remains',async()=>{
  const native=fake('local'),f=fixture([native.executor],{autoContinueInterrupted:true});
  let cold:ReturnType<typeof createAgentService>|undefined;
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','finish once');
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
    const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));
    const record=repository.readConversation(chat.id)!;
    record.view.retainedRuns=[{...record.view.run!,id:'old-unknown',participantId:'old-participant',status:'unknown',resourcesReleased:true,executionState:'ended',interrupted:true}];
    record.participants.push({...record.participants[0]!,id:'old-participant'});
    repository.saveConversation(record,record.view.revision);
    await f.service.close();
    const saved=repository.readConversation(chat.id)!;
    assert.equal(saved.view.run!.id,done.run!.id);assert.equal(saved.view.run!.status,'completed');
    assert.equal(saved.interruption,undefined);assert.equal(saved.view.retainedRuns![0]!.status,'unknown');
    cold=createAgentService(f.options);await cold.conversations.recoverInterrupted();
    assert.equal(native.sends.length,1);assert.equal(cold.conversations.read('workspace-one',chat.id).run!.status,'completed');
  } finally {await cold?.close();await f.close();}
});

test('shutdown never resets a cancelled recovery intent on an accepted unknown turn',async()=>{
  const native=fake('local',{disconnect:'unknown'}),f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','leave stopped');
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='unknown');
    const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service')),record=repository.readConversation(chat.id)!;
    record.interruption={runId:record.view.run!.id,awaitingUser:false,reason:'transport',cancelled:true,attempted:true};
    repository.saveConversation(record,record.view.revision);
    await f.service.close();
    assert.equal(repository.readConversation(chat.id)!.interruption?.cancelled,true);
    assert.equal(repository.readConversation(chat.id)!.interruption?.attempted,true);
    assert.equal(native.sends.length,1);
  } finally {await f.close();}
});

test('observing an unaccepted stop without native identity ends the wait instead of staying unknown',async()=>{
  const native=fake('local',{unknown:true}),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','stop before acceptance');
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='unknown');
    const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));
    const record=repository.readConversation(chat.id)!;
    const run=record.view.run!,attempt=record.attempts.find(value=>value.runId===run.id)!;
    run.status='unknown';run.accepted=false;run.stopRequested=true;run.executionState='unknown';run.tools=[];run.resourcesReleased=undefined;run.generation='retired-generation';
    attempt.accepted=false;delete attempt.executionRef;
    record.interruption={runId:run.id,awaitingUser:false,cancelled:true};
    repository.saveConversation(record,record.view.revision);
    const saved=repository.readConversation(chat.id)!;
    const observed=await f.service.conversations.observeRun('workspace-one',chat.id,{expectedRevision:saved.view.revision,runId:run.id,participantId:run.participantId,generation:'retired-generation'});
    assert.equal(observed.run!.status,'stopped');
    assert.equal(observed.run!.stopRequested,true);
    assert.equal(observed.run!.resourcesReleased,undefined);
    assert.match(observed.run!.diagnostic!,/已结束本轮等待.*是否送达仍未知/);
    const persisted=repository.readConversation(chat.id)!;
    assert.equal(persisted.view.run!.status,'stopped');
    assert.equal(persisted.view.run!.stopRequested,true);
    assert.equal(persisted.view.run!.executionState,'unknown');
  } finally {await f.close();}
});

test('host shutdown records its own interruption without relabelling a user stop or replaying work',async()=>{
 for(const userStop of [false,true]){const native=fake('local',{hold:true}),f=fixture([native.executor]);try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work once');
  const running=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.accepted===true);
  if(userStop)await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:running.revision,runId:running.run!.id,participantId:running.run!.participantId,generation:running.run!.generation});
  await f.service.close();const db=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'),{readOnly:true});try{const row=db.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id) as {body:string};const record=JSON.parse(row.body);if(userStop)assert.ok(!record.view.run.diagnostic?.includes('宿主退出'));else assert.match(record.view.run.diagnostic,/宿主退出/);}finally{db.close();}assert.equal(native.sends.length,1);
 }finally{await f.close();}}
});

test('development startup continues a confirmed host interruption once; released startup leaves unfinished work visible',async()=>{
  for(const development of [false,true]){
    const native=fake('local',{hold:true}),f=fixture([native.executor],{autoContinueInterrupted:development});
    let cold:ReturnType<typeof createAgentService>|undefined;
    try{
      await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
      send(f.service,created.id,'local','finish the goal');
      await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),view=>view.run?.accepted===true);
      await f.service.close();cold=createAgentService(f.options);
      await Promise.all([cold.conversations.recoverInterrupted(),cold.conversations.recoverInterrupted()]);
      const view=cold.conversations.read('workspace-one',created.id);
      if(development){
        await waitUntil(()=>native.sends.length,count=>count===2);
        assert.equal(view.entries.filter(entry=>entry.role==='user').length,1);
        assert.ok(view.entries.some(entry=>entry.role==='system'&&entry.text.startsWith('系统自动恢复')));
        assert.equal(native.sends[1]!.contextRef.id,native.sends[0]!.contextRef.id);
        assert.equal(native.sends[1]!.clientRequestId.startsWith('host-recovery:'),true);
      }else{
        assert.equal(native.sends.length,1);assert.equal(view.run?.interrupted,true);assert.match(view.run!.diagnostic!,/执行未完成/);
      }
    }finally{await cold?.close();await f.close();}
  }
});

test('startup never continues user stops, unresolved approvals or unconfirmed native identities',async()=>{
  for(const kind of ['user-stop','approval','unknown'] as const){
    const native=fake('local',{hold:true,request:kind==='approval',coldUnknown:kind==='unknown'}),f=fixture([native.executor],{autoContinueInterrupted:true});
    let cold:ReturnType<typeof createAgentService>|undefined;
    try{
      await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
      send(f.service,created.id,'local','work');
      const running=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),view=>view.run?.accepted===true);
      if(kind==='user-stop')await f.service.conversations.stop('workspace-one',created.id,{expectedRevision:running.revision,runId:running.run!.id,participantId:running.run!.participantId,generation:running.run!.generation});
      await f.service.close();cold=createAgentService(f.options);await cold.conversations.recoverInterrupted();
      assert.equal(native.sends.length,1);
      if(kind!=='user-stop')assert.equal(cold.conversations.read('workspace-one',created.id).run?.interrupted,true);
    }finally{await cold?.close();await f.close();}
  }
});

test('recovery observes live work without resending and refuses active or uncertain tools',async()=>{
  for(const observed of ['running','tools-active','unknown-tool'] as const){
    const native=fake('local',{hold:true}),f=fixture([native.executor],{autoContinueInterrupted:true});
    let cold:ReturnType<typeof createAgentService>|undefined;
    try{
      await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});send(f.service,created.id,'local','work');
      await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),view=>view.run?.accepted===true);
      await f.service.close();const context=[...native.contexts.values()][0]!;
      context.observation={...context.observation,status:observed==='running'?'running':'stopped',tools:observed==='running'?[]:[{id:'tool',label:'work',status:observed==='tools-active'?'running':'unknown',canStop:false}]};
      cold=createAgentService(f.options);await cold.conversations.recoverInterrupted();
      assert.equal(native.sends.length,1);const view=cold.conversations.read('workspace-one',created.id);
      assert.equal(view.run?.interrupted,observed==='running'?undefined:true);
    }finally{await cold?.close();await f.close();}
  }
});

test('live transport loss reopens the same binding and continues once without a host restart', async () => {
  const native = fake('local', {disconnect:'stopped'}), f = fixture([native.executor], {autoContinueInterrupted:true});
  try {
    await connected(f.service,'local'); const chat = await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','finish my work');
    const done = await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
    await Promise.all([f.service.conversations.recoverInterrupted(),f.service.conversations.observe('workspace-one',chat.id)]);
    assert.equal(native.sends.length,2);
    assert.equal(native.opens.length,2);
    assert.equal(native.opens[0]!.configRoot,native.opens[1]!.configRoot);
    assert.equal(native.sends[0]!.contextRef.id,native.sends[1]!.contextRef.id);
    assert.match(native.sends[1]!.text,/系统自动恢复.*执行观察中断/);
    assert.equal(done.entries.filter(e=>e.role==='user').length,1);
  } finally { await f.close(); }
});

test('same executor and model records native session replacement without claiming a model change after released unknown work',async()=>{
  const native=fake('local',{disconnect:'unknown'}),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','preserve my goal');
    const unknown=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='unknown');
    const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));
    const record=repository.readConversation(chat.id)!,revision=record.view.revision;record.view.run!.resourcesReleased=true;record.view.revision=randomUUID();repository.saveConversation(record,revision);
    const draft={expectedRevision:record.view.revision,connectionId:'local',text:'current status'};
    const preview=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
    assert.equal(preview.participantId,undefined,'unknown original context cannot be reused');
    assert.equal(preview.switching,false,'an internal context change is not a user handoff');
    f.service.conversations.send('workspace-one',chat.id,{...draft,clientRequestId:randomUUID()});
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    assert.notEqual(native.sends[0]!.contextRef.id,native.sends[1]!.contextRef.id);
    const transfer=done.entries.find(entry=>entry.nativeSession);
    assert.equal(transfer?.nativeSession?.reason,'session-replacement');
    assert.equal(transfer?.nativeSession?.from.contextId,native.sends[0]!.contextRef.id);
    assert.equal(transfer?.nativeSession?.to.contextId,native.sends[1]!.contextRef.id);
    assert.equal(transfer?.status,'accepted');
    assert.equal(done.retainedRuns?.find(run=>run.id===unknown.run!.id)?.status,'unknown');
  }finally{await f.close();}
});

test('live recovery never resends active work, unknown tools, pending decisions or release-profile work', async () => {
  for (const disconnectError of ['codex_execution_observation_lost','dsh_execution_observation_lost','qoder_execution_observation_lost']) for (const kind of ['running','unknown','tool','approval','release'] as const) {
    const native=fake('local',{disconnectError,disconnect:kind==='approval'||kind==='release'?'stopped':kind,request:kind==='approval'});
    const f=fixture([native.executor],{autoContinueInterrupted:kind!=='release'});
    try {
      await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work');
      await waitUntil(()=>native.opens.length,n=>n===2);
      await Promise.all([f.service.conversations.recoverInterrupted(),f.service.conversations.recoverInterrupted()]);
      const view=f.service.conversations.read('workspace-one',chat.id);
      assert.equal(native.sends.length,1);
      if(kind==='running')assert.equal(view.run?.status,'running');
      else assert.equal(view.run?.interrupted,true);
    } finally { await f.close(); }
  }
});

test('a user stop before transport loss cannot turn into automatic continuation', async () => {
  let release!:()=>void;const beforeDisconnect=new Promise<void>(resolve=>{release=resolve;});
  const native=fake('local',{disconnect:'stopped',beforeDisconnect}),f=fixture([native.executor],{autoContinueInterrupted:true});
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work');
    const view=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.accepted===true),run=view.run!;
    await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:view.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
    release();await f.service.conversations.recoverInterrupted();
    assert.equal(native.sends.length,1);
  } finally {release();await f.close();}
});

test('a failed automatic continuation has a persistent bounded transport retry chain', async () => {
  const native=fake('local',{disconnect:'stopped',disconnectAlways:true}),f=fixture([native.executor],{autoContinueInterrupted:true});
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work');
    const deadline=Date.now()+20_000;
    while(Date.now()<deadline&&native.sends.length<4)await new Promise(resolve=>setTimeout(resolve,20));
    await Promise.all([f.service.conversations.recoverInterrupted(),f.service.conversations.recoverInterrupted()]);
    assert.equal(native.sends.length,4);
    assert.equal(f.service.conversations.read('workspace-one',chat.id).entries.filter(entry=>entry.role==='user').length,1);
  }finally{await f.close();}
});

test('an unavailable workspace host preserves the interrupted run until the same host is ready',async()=>{
  const native=fake('local',{hold:true}),f=fixture([native.executor],{autoContinueInterrupted:true});
  let cold:ReturnType<typeof createAgentService>|undefined,hostReady=false;
  try {
    await connected(f.service,'local');
    const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','finish the original goal');
    const original=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.accepted===true);
    await f.service.close();
    cold=createAgentService({...f.options,resolveWorkspace(id){
      if(!hostReady)throw new AgentServiceError('agent_host_unavailable','no_registered_peer',503);
      return f.options.resolveWorkspace(id);
    }});
    await cold.conversations.recoverInterrupted();
    const waiting=cold.conversations.read('workspace-one',chat.id);
    assert.equal(waiting.run?.id,original.run!.id);
    assert.match(waiting.run?.diagnostic??'',/等待原工作空间连接/);
    assert.equal(native.sends.length,1);
    hostReady=true;
    await Promise.all([cold.conversations.recoverInterrupted(),cold.conversations.recoverInterrupted()]);
    await waitUntil(()=>native.sends.length,count=>count===2);
    assert.equal(native.sends[1]!.clientRequestId,'host-recovery:'+original.run!.id);
    assert.match(native.sends[1]!.text,/系统自动恢复/);
  } finally {await cold?.close();await f.close();}
});

test('a released unknown run can be explicitly continued across backend generations',async()=>{
  const native=fake('local',{disconnect:'unknown'}),f=fixture([native.executor]);
  let cold:ReturnType<typeof createAgentService>|undefined;
  try {
    await connected(f.service,'local');
    const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','preserve the original goal');
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='unknown');
    await f.service.close();
    const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));
    const record=repository.readConversation(chat.id)!,revision=record.view.revision;
    const original=record.view.run!;
    original.resourcesReleased=true;original.status='unknown';original.executionState='unknown';delete original.stopRequested;
    delete record.interruption;
    record.view.revision=randomUUID();
    repository.saveConversation(record,revision);
    cold=createAgentService(f.options);
    assert.notEqual(original.generation,cold.generation);
    const draft={expectedRevision:record.view.revision,connectionId:'local',model:original.model,continueRunId:original.id,text:''};
    const preview=cold.conversations.prepareSend('workspace-one',chat.id,draft);
    const next=cold.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
    await waitUntil(()=>native.sends.length,count=>count===2);
    assert.notEqual(next.run.id,original.id);
    assert.match(native.sends[1]!.text,/旧原生控制资源已核验释放/);
    assert.equal(cold.conversations.read('workspace-one',chat.id).retainedRuns?.find(run=>run.id===original.id)?.status,'unknown');
  } finally {await cold?.close();await f.close();}
});

for (const continued of [true,false]) test('released Qoder crash history can continue while recovery is observing it ('+continued+')',async()=>{
  const native=fake('qoder',{disconnect:'tool',disconnectError:'qoder_execution_observation_lost'});
  const f=fixture([native.executor]);
  let cold:ReturnType<typeof createAgentService>|undefined,checking:Promise<void>|undefined,oldContextId:string|undefined;
  let entered!:()=>void,release!:()=>void;
  const observing=new Promise<void>(resolve=>{entered=resolve;});
  const blocked=new Promise<void>(resolve=>{release=resolve;});
  const open=native.executor.open;
  native.executor.open=async input=>{
    const runtime=await open(input);
    return {...runtime,async readHistory(request){
      if(request.contextRef.id!==oldContextId)return runtime.readHistory(request);
      entered();await blocked;
      return [{id:'unmapped-native-input',kind:'message',role:'user',text:'DO NOT SEND OLD NATIVE INPUT'}];
    }};
  };
  try {
    await connected(f.service,'qoder');
    const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'qoder','original Qoder goal');
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='unknown');
    await f.service.close();
    const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));
    const record=repository.readConversation(chat.id)!,revision=record.view.revision,original=record.view.run!;
    const attempt=record.attempts.find(a=>a.runId===original.id)!;
    const participant=record.participants.find(p=>p.id===original.participantId)!;
    original.tools=[{id:'current-unknown-command',label:'Bash',status:'unknown',canStop:false}];
    const retained={...structuredClone(original),id:randomUUID(),participantId:randomUUID(),generation:randomUUID(),
      status:'unknown' as const,executionState:'unknown' as const,resourcesReleased:true,stopRequested:true,tools:continued?original.tools.map(t=>({...t,id:'retained-unknown-command'})):[]};
    // Two observed shapes: a continued run with a retained unknown command, or
    // a regular current run with a retained stopped-but-unconfirmed round.
    record.view.retainedRuns=[retained];
    record.participants.unshift({...participant,id:retained.participantId,contextRef:undefined});
    record.attempts.unshift({...attempt,runId:retained.id,participantId:retained.participantId,clientRequestId:randomUUID(),executionRef:{id:'retained-execution'}});
    if(continued){
      const user=record.view.entries.find(e=>e.id===attempt.userEntryId)!;
      user.runId=retained.id;user.participantId=retained.participantId;
      const notice:ConversationEntry={id:randomUUID(),sequence:record.view.entries.at(-1)!.sequence+1,kind:'notice',role:'system',
        text:'已请求继续上次执行。',runId:original.id,participantId:participant.id,createdAt:original.startedAt};
      record.view.entries.push(notice);
      Object.assign(attempt,{continuationOf:retained.id,userEntryId:notice.id,through:notice.sequence});
    }
    const oldTool:ConversationEntry={id:randomUUID(),sequence:record.view.entries.at(-1)!.sequence+1,kind:'tool',role:'system',
      text:'命令尚无结果',name:'Bash',status:'unknown',runId:original.id,participantId:participant.id,createdAt:original.startedAt};
    record.view.entries.push(oldTool);
    record.sources[participant.id+':tool:'+original.tools[0].id]=oldTool.id;
    Object.assign(original,{resourcesReleased:true,status:'unknown',executionState:'unknown',interrupted:true});
    delete original.stopRequested;
    record.interruption={runId:original.id,awaitingUser:false};
    record.view.revision=randomUUID();repository.saveConversation(record,revision);
    oldContextId=participant.contextRef!.id;

    cold=createAgentService({...f.options,autoContinueInterrupted:true});
    checking=cold.conversations.recoverInterrupted();
    await observing;
    const view=cold.conversations.read('workspace-one',chat.id);
    const draft={expectedRevision:view.revision,connectionId:'qoder',continueRunId:original.id,text:'',modelAccountId:original.modelAccountId,modelAccountIdentity:original.modelAccountIdentity,model:original.model,permissionMode:original.permissionMode};
    const preview=await cold.conversations.prepareHandoff('workspace-one',chat.id,draft);
    assert.equal(preview.fits,true);
    assert.equal(native.sends.length,1,'observation cannot resend the original input');
    const request={...draft,previewToken:preview.token,clientRequestId:randomUUID()};
    const next=cold.conversations.send('workspace-one',chat.id,request);
    assert.equal(cold.conversations.send('workspace-one',chat.id,request).run.id,next.run.id);
    release();await checking;
    const done=await waitUntil(()=>cold!.conversations.read('workspace-one',chat.id),v=>v.run?.id===next.run.id&&v.run.status==='completed');
    assert.equal(native.sends.length,2);
    assert.notEqual(native.sends[1]!.contextRef.id,oldContextId);
    assert.match(native.sends[1]!.text,/核对.*未知工具/);
    assert.match(native.sends[1]!.text,/不得重跑结果未知的旧命令/);
    assert.doesNotMatch(native.sends[1]!.text,/DO NOT SEND OLD NATIVE INPUT/);
    assert.equal(done.entries.filter(e=>e.role==='user').length,1);
    assert.equal(done.run?.continuedFrom?.runId,continued?retained.id:original.id);
    assert.equal(done.entries.find(e=>e.id===oldTool.id)?.status,'unknown');
    assert.equal(done.entries.some(e=>e.nativeSession?.reason==='session-replacement'&&e.status==='accepted'),true);
    assert.deepEqual(done.retainedRuns?.map(r=>[r.id,r.status,r.resourcesReleased,r.tools.map(t=>t.status)]),[
      [retained.id,'unknown',true,retained.tools.map(t=>t.status)],
      [original.id,'unknown',true,original.tools.map(t=>t.status)],
    ]);
    const stored=repository.readConversation(chat.id)!;
    assert.deepEqual(stored.attempts.find(a=>a.runId===original.id)?.executionRef,attempt.executionRef);
    assert.equal(stored.participants.find(p=>p.id===participant.id)?.contextRef?.id,oldContextId);
    assert.equal(stored.attempts.at(-1)?.continuationOf,original.id);
  } finally {release();await checking?.catch(()=>{});await cold?.close();await f.close();}
});

test('explicit recovery of a pre-dispatch automatic failure continues the goal without replaying user input',async()=>{
  const native=fake('local'),f=fixture([native.executor]);
  let cold:ReturnType<typeof createAgentService>|undefined,hostReady=false;
  try {
    await connected(f.service,'local');
    const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','original user instruction');
    const original=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    await f.service.close();
    cold=createAgentService({...f.options,resolveWorkspace(id){
      if(!hostReady)throw new AgentServiceError('agent_host_unavailable','no_registered_peer',503);
      return f.options.resolveWorkspace(id);
    }});
    send(cold,chat.id,'local','historical automatic recovery instruction');
    const failed=await waitUntil(()=>cold!.conversations.read('workspace-one',chat.id),view=>view.run?.status==='failed');
    const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));
    const record=repository.readConversation(chat.id)!,revision=record.view.revision;
    const attempt=record.attempts.find(value=>value.runId===failed.run!.id)!;
    attempt.clientRequestId='host-recovery:'+original.run!.id;
    attempt.continuationOf=original.run!.id;
    const notice=record.view.entries.find(entry=>entry.id===attempt.userEntryId)!;
    notice.kind='notice';notice.role='system';
    record.view.revision=randomUUID();
    repository.saveConversation(record,revision);
    hostReady=true;
    const draft={expectedRevision:record.view.revision,connectionId:'local',continueRunId:failed.run!.id,text:''};
    const next=cold.conversations.send('workspace-one',chat.id,{...draft,clientRequestId:randomUUID()});
    await waitUntil(()=>cold!.conversations.read('workspace-one',chat.id),view=>view.run?.id===next.run.id&&view.run.status==='completed');
    assert.equal(native.sends.length,2);
    assert.match(native.sends[1]!.text,/继续上次未正常答复的执行/);
    assert.notEqual(native.sends[1]!.text,native.sends[0]!.text);
  } finally {await cold?.close();await f.close();}
});

test('a persisted recovery intent before submission resumes the same request once after restart',async()=>{
  const native=fake('local',{hold:true}),f=fixture([native.executor],{autoContinueInterrupted:true});
  let cold:ReturnType<typeof createAgentService>|undefined;
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','finish the original goal');
    const running=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.accepted===true);
    await f.service.close();
    const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));
    const record=repository.readConversation(chat.id)!,revision=record.view.revision;
    record.interruption={runId:running.run!.id,awaitingUser:false,attempted:true};
    record.attempts.find(attempt=>attempt.runId===running.run!.id)!.automaticRetry={rootRunId:running.run!.id,count:1};
    record.view.revision=randomUUID();repository.saveConversation(record,revision);
    cold=createAgentService(f.options);
    await Promise.all([cold.conversations.recoverInterrupted(),cold.conversations.recoverInterrupted()]);
    await waitUntil(()=>native.sends.length,count=>count===2);
    assert.equal(native.sends[1]!.clientRequestId,'host-recovery:'+running.run!.id);
    assert.equal(cold.conversations.read('workspace-one',chat.id).entries.filter(entry=>entry.role==='user').length,1);
  }finally{await cold?.close();await f.close();}
});

test('legacy accepted unknown runs are reconciled at startup without inventing continuation consent', async () => {
  const native=fake('local',{hold:true}),f=fixture([native.executor],{autoContinueInterrupted:true});let cold:ReturnType<typeof createAgentService>|undefined;
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work');
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.accepted===true);
    await f.service.close();
    const db=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'));
    try {
      const row=db.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id) as {body:string};const record=JSON.parse(row.body);
      delete record.interruption;record.view.run.status='unknown';record.view.run.diagnostic='原生智能体连接未完成，请检查程序、独立登录及兼容版本。';
      db.prepare('UPDATE conversations SET body=? WHERE id=?').run(JSON.stringify(record),chat.id);
      db.prepare('DELETE FROM conversation_read_states WHERE id=?').run(chat.id);
    }finally{db.close();}
    cold=createAgentService(f.options);await cold.conversations.recoverInterrupted();
    const view=cold.conversations.read('workspace-one',chat.id);
    assert.equal(view.run?.status,'stopped');assert.equal(native.sends.length,1);
    assert.match(view.run!.diagnostic!,/已确认停止/);
    assert.doesNotThrow(()=>cold!.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:view.revision,connectionId:'local',text:'continue'}));
  }finally{await cold?.close();await f.close();}
});

test('model-account transport recovery replaces both caches without changing account or participant', async () => {
  const native=fake('codex',{disconnect:'stopped'});
  const f=fixture([native.executor],{autoContinueInterrupted:true,modelProviders:[{id:'fixture',label:'Fixture',async open(){return{protocol:'chat-completions',async inspect(){return{status:'ready',models:[{id:'test-model',label:'Test',images:false,tools:true}]};},async beginLogin(){},async cancelLogin(){},async infer(){throw Error('unused');},async close(){}};}}]});
  try {
    await connected(f.service,'codex');const account=await f.service.models.accounts.add({provider:'fixture'}),checked=await f.service.models.accounts.check(account.id);
    await f.service.models.accounts.preferences(account.id,{expectedRevision:checked.revision,models:[{id:'test-model',enabled:true}]});
    const chat=await f.service.conversations.create('workspace-one',{}),draft={expectedRevision:chat.revision,connectionId:'codex',modelAccountId:account.id,model:'test-model',text:'finish once'};
    const preview=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
    f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:'model-recovery'});
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
    assert.equal(native.sends.length,2);assert.equal(done.participants.length,1);assert.equal(done.run?.modelAccountId,account.id);
    assert.equal(native.sends[0]!.contextRef.id,native.sends[1]!.contextRef.id);
    const gateways=native.opens.filter(input=>input.gateway);assert.equal(gateways.length,2);assert.equal(gateways[0]!.configRoot,gateways[1]!.configRoot);assert.equal(gateways[0]!.gateway!.identity,gateways[1]!.gateway!.identity);
  }finally{await f.close();}
});

test('a user stop during reconnection cancels the pending automatic continuation', async () => {
  let release!:()=>void;const beforeResume=new Promise<void>(resolve=>{release=resolve;});
  const native=fake('local',{disconnect:'stopped',beforeResume}),f=fixture([native.executor],{autoContinueInterrupted:true});
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work');
    await waitUntil(()=>native.opens.length,n=>n===2);
    const view=f.service.conversations.read('workspace-one',chat.id),run=view.run!;
    await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:view.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
    release();await f.service.conversations.recoverInterrupted();assert.equal(native.sends.length,1);
  }finally{release();await f.close();}
});

test('a later exact stopped observation releases uncertain recovery once',async()=>{
  const native=fake('local',{disconnect:'unknown'}),f=fixture([native.executor],{autoContinueInterrupted:true});
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','finish');
    await waitUntil(()=>native.opens.length,n=>n===2);await f.service.conversations.recoverInterrupted();assert.equal(native.sends.length,1);
    const context=[...native.contexts.values()][0]!;context.observation={...context.observation,status:'stopped',tools:[]};
    await Promise.all([f.service.conversations.observe('workspace-one',chat.id),f.service.conversations.observe('workspace-one',chat.id)]);
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');assert.equal(native.sends.length,2);
  }finally{await f.close();}
});

test('temporary preparation failures retry the original input without creating duplicate user turns', async t => {
  fastRetries(t);
  const native = fake('local', {prepareFailures: 2}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    const initial = send(f.service, chat.id, 'local', 'inspect current work');
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'completed');
    assert.equal(done.run?.id, initial.run.id); assert.equal(native.sends.length, 1);
    assert.equal(native.sends[0].text, 'inspect current work');
    assert.equal(done.entries.filter(entry => entry.role === 'user').length, 1);
  } finally { await f.close(); }
});

test('capacity failure continues the exact context as a system retry and retains original failure', async t => {
  fastRetries(t);
  const native = fake('local', {failure: n => n === 1 ? 'Selected model is at capacity. Please try a different model.' : undefined}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    const initial = send(f.service, chat.id, 'local', 'finish the change');
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'completed');
    assert.equal(native.sends.length, 2); assert.equal(native.sends[0].contextRef.id, native.sends[1].contextRef.id);
    assert.equal(native.sends[0].model, native.sends[1].model); assert.equal(native.sends[0].permissionMode, native.sends[1].permissionMode);
    assert.match(native.sends[1].text, /系统自动重试/);
    assert.equal(done.entries.filter(entry => entry.role === 'user').length, 1);
    assert.ok(done.entries.some(entry => entry.role === 'system' && entry.kind === 'notice' && entry.status === 'accepted'));
    assert.equal(new ConversationRepository(path.join(f.options.dataRoot, 'agent-service')).readConversation(chat.id)?.runOutcomes?.[initial.run.id]?.status, 'failed');
  } finally { await f.close(); }
});

test('a rejected local gateway credential is reissued once and continues the exact context', async t => {
  fastRetries(t);
  const native = fake('codex', {failure: n => n === 1 ? '模型调用的本机凭据已失效。' : undefined}), f = fixture([native.executor], {modelProviders: gatewayProviders});
  try {
    await connected(f.service, 'codex'); const account = await sharedAccount(f);
    const chat = await f.service.conversations.create('workspace-one', {}), initial = sendWithAccount(f, chat.id, account.id, 'finish the change');
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'completed');
    assert.equal(native.sends.length, 2);
    const gateways = native.opens.filter(input => input.gateway);
    assert.equal(gateways.length, 2, 'the rejected key is replaced by a new process');
    assert.notEqual(gateways[0].gateway!.apiKey, gateways[1].gateway!.apiKey, 'the new process starts with a freshly issued key');
    assert.equal(gateways[0].gateway!.identity, gateways[1].gateway!.identity);
    assert.equal(gateways[0].configRoot, gateways[1].configRoot);
    assert.equal(native.sends[0].contextRef.id, native.sends[1].contextRef.id);
    assert.equal(native.sends[0].model, native.sends[1].model); assert.equal(native.sends[0].permissionMode, native.sends[1].permissionMode);
    assert.match(native.sends[1].text, /系统自动重试/); assert.match(native.sends[1].text, /本机模型凭据失效/);
    assert.equal(done.run?.modelAccountId, account.id);
    assert.equal(done.entries.filter(entry => entry.role === 'user').length, 1);
    assert.ok(done.entries.some(entry => entry.role === 'system' && entry.kind === 'notice' && entry.status === 'accepted'));
    assert.equal(new ConversationRepository(path.join(f.options.dataRoot, 'agent-service')).readConversation(chat.id)?.runOutcomes?.[initial.run.id]?.status, 'failed');
  } finally { await f.close(); }
});

test('a reissued local credential that is rejected again stops instead of reissuing forever', async t => {
  fastRetries(t);
  const native = fake('codex', {failure: '模型调用的本机凭据已失效。'}), f = fixture([native.executor], {modelProviders: gatewayProviders});
  try {
    await connected(f.service, 'codex'); const account = await sharedAccount(f);
    const chat = await f.service.conversations.create('workspace-one', {}); sendWithAccount(f, chat.id, account.id, 'finish');
    const ended = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => native.sends.length === 2 && view.run?.status === 'failed');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(native.sends.length, 2, 'the second identical rejection ends the run');
    assert.equal(native.opens.filter(input => input.gateway).length, 2, 'a rejected reissue is not replaced a second time');
    assert.match(ended.run?.diagnostic ?? '', /本机模型凭据重新签发后仍被拒绝/);
    assert.doesNotMatch(ended.run?.diagnostic ?? '', /自动重试已达上限/);
  } finally { await f.close(); }
});

test('a stale account row is re-inspected once before the rejected key is replaced', async t => {
  fastRetries(t);
  let stale = false, inspections = 0;
  const providers: AgentServiceOptions['modelProviders'] = [{ id: 'fixture', label: 'Fixture', async open() { return { protocol: 'chat-completions', async inspect() { inspections++; return stale ? { status: 'not-authenticated' as const, models: [] } : { status: 'ready' as const, models: [{ id: 'test-model', label: 'Test', images: false, tools: true }] }; }, async beginLogin() {}, async cancelLogin() {}, async infer() { throw Error('unused'); }, async close() {} }; } }];
  const native = fake('codex', { hold: true, failure: n => n === 1 ? '模型调用的本机凭据已失效。' : undefined }), f = fixture([native.executor], { modelProviders: providers });
  try {
    await connected(f.service, 'codex'); const account = await sharedAccount(f);
    const chat = await f.service.conversations.create('workspace-one', {}); sendWithAccount(f, chat.id, account.id, 'finish the change');
    const held = await waitUntil(() => [...native.contexts.values()][0], context => Boolean(context?.unblock));
    stale = true; await f.service.models.accounts.check(account.id); stale = false;
    assert.equal(f.service.models.accounts.snapshot(account.id)?.status, 'not-authenticated', 'the refresh leaves a downgraded row behind');
    const first = held!.unblock!; first();
    const retried = await waitUntil(() => [...native.contexts.values()][0], context => Boolean(context?.unblock) && context!.unblock !== first);
    retried!.unblock!();
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'completed');
    assert.equal(native.sends.length, 2, 'one re-inspection is enough to continue');
    assert.equal(native.opens.filter(input => input.gateway).length, 2);
    assert.equal(inspections, 3, 'only the stale row is re-inspected once');
    assert.equal(done.run?.modelAccountId, account.id);
  } finally { await f.close(); }
});

test('a rejected local credential stops when the account is no longer usable', async t => {
  fastRetries(t);
  const native = fake('codex', { hold: true, failure: '模型调用的本机凭据已失效。' }), f = fixture([native.executor], { modelProviders: gatewayProviders });
  try {
    await connected(f.service, 'codex'); const account = await sharedAccount(f);
    const chat = await f.service.conversations.create('workspace-one', {}); sendWithAccount(f, chat.id, account.id, 'finish');
    const held = await waitUntil(() => [...native.contexts.values()][0], context => Boolean(context?.unblock));
    await f.service.models.accounts.disconnect(account.id, { expectedRevision: f.service.models.accounts.snapshot(account.id)!.revision });
    held!.unblock!();
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'failed');
    await new Promise(resolve => setTimeout(resolve, 50));
    const ended = f.service.conversations.read('workspace-one', chat.id);
    assert.equal(native.sends.length, 1, 'an unusable account is not retried');
    assert.equal(native.opens.filter(input => input.gateway).length, 1, 'the rejected key is kept when there is nothing to reissue');
    assert.match(ended.run?.diagnostic ?? '', /本机凭据已失效/);
    assert.doesNotMatch(ended.run?.diagnostic ?? '', /正在重新准备执行环境/);
  } finally { await f.close(); }
});

test('persistent capacity errors stop after three automatic attempts', async t => {
  fastRetries(t);
  const native = fake('local', {failure: 'Selected model is at capacity.'}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => native.sends.length === 4 && view.run?.status === 'failed');
    assert.equal(new Set(native.sends.map(input => input.clientRequestId)).size, 4);
    assert.equal(native.contexts.size, 1);
  } finally { await f.close(); }
});

test('Qoder network failure automatically resumes the goal with preserved cause and selection', async t => {
  fastRetries(t);
  const reason='Qoder · 本轮执行：Network attempt failed at response_headers · ECONNRESET · Client network socket disconnected before secure TLS connection was established';
  const native=fake('qoder',{failure:n=>n===1?reason:undefined}),f=fixture([native.executor]);
  try {
    await connected(f.service,'qoder');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'qoder','finish the existing changes and verify the results');
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    assert.equal(native.sends.length,2);
    const [original,resumed]=native.sends;
    assert.match(resumed!.clientRequestId,/^automatic-retry:/);
    assert.match(resumed!.text,/核对原对话、当前成果及工具结果/);
    assert.match(resumed!.text,/不要重放全部历史命令/);
    for(const key of ['model','permissionMode','reasoningEffort','serviceTier'] as const)assert.equal(resumed![key],original![key]);
    assert.equal(resumed!.contextRef.id,original!.contextRef.id);
    assert.equal(done.entries.filter(entry=>entry.role==='user'&&entry.kind==='message').length,1);
    const saved=new ConversationRepository(path.join(f.options.dataRoot,'agent-service')).readConversation(chat.id)!;
    const originalRun=saved.attempts[0]!.runId;
    assert.equal(saved.runOutcomes?.[originalRun]?.status,'failed');
    assert.equal(saved.runOutcomes?.[originalRun]?.diagnostic,reason);
  } finally {await f.close();}
});

test('stop cancels a retry wait and concurrent observations do not start a second execution', async () => {
  const native = fake('local', {failure: 'Selected model is at capacity.'}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => Boolean(view.run?.diagnostic?.includes('自动重试')));
    await Promise.all([f.service.conversations.observe('workspace-one', chat.id), f.service.conversations.observe('workspace-one', chat.id)]);
    const pending = f.service.conversations.read('workspace-one', chat.id), run = pending.run!;
    const stopped = await f.service.conversations.stop('workspace-one', chat.id, {expectedRevision: pending.revision, runId: run.id, participantId: run.participantId, generation: run.generation});
    assert.equal(stopped.run?.status, 'stopped');
    await new Promise(resolve => setImmediate(resolve)); assert.equal(native.sends.length, 1);
  } finally { await f.close(); }
});

test('quota, authentication, unknown delivery and unfinished tools are not automatically retried', async t => {
  fastRetries(t);
  for (const options of [{failure: 'at capacity; daily quota exhausted'}, {failure: 'unauthorized: temporary failure'}, {failure: 'at capacity', toolSurvives: true}, {unknown: true}]) {
    const native = fake('local', options), f = fixture([native.executor]);
    try {
      await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
      send(f.service, chat.id, 'local', 'finish');
      const ended = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => ['failed', 'tools-active', 'unknown'].includes(view.run?.status ?? ''));
      assert.doesNotMatch(ended.run?.diagnostic ?? '', /自动重试/); assert.equal(native.sends.length, 1);
    } finally { await f.close(); }
  }
});

test('host shutdown cancels a retry wait without converting it into host recovery', async () => {
  const native = fake('local', {failure: 'at capacity'}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => Boolean(view.run?.diagnostic?.includes('自动重试')));
    await f.service.close(); const cold = createAgentService(f.options);
    try {
      await cold.conversations.recoverInterrupted();
      assert.equal(cold.conversations.read('workspace-one', chat.id).run?.status, 'failed'); assert.equal(native.sends.length, 1);
    }finally{await cold.close();}
  }finally{await f.close();}
});

test('an explicit stop during terminal observation cancels a not-yet-scheduled retry', async () => {
  let release!: () => void;
  const beforeObservation = new Promise<void>(resolve => {release = resolve;});
  const native = fake('local', {failure: 'at capacity', beforeObservation}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    const failed = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'failed');
    const run = failed.run!;
    await f.service.conversations.stop('workspace-one', chat.id, {expectedRevision:failed.revision, runId:run.id, participantId:run.participantId, generation:run.generation});
    release(); await new Promise(resolve => setImmediate(resolve));
    assert.doesNotMatch(f.service.conversations.read('workspace-one', chat.id).run?.diagnostic ?? '', /自动重试/);
    assert.equal(native.sends.length, 1);
  } finally {release(); await f.close();}
});

test('a terminal observation for a different execution cannot authorize retry', async () => {
  const native = fake('local', {failure: 'at capacity', wrongObservation:true}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'failed');
    await new Promise(resolve => setImmediate(resolve));
    assert.doesNotMatch(f.service.conversations.read('workspace-one', chat.id).run?.diagnostic ?? '', /自动重试/);
    assert.equal(native.sends.length, 1);
  } finally {await f.close();}
});

test('ambiguous context creation is preserved without automatically creating another context', async () => {
  const native = fake('local', {prepareFailures:1, unknownCreate:true}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    const failed = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'failed');
    assert.doesNotMatch(failed.run?.diagnostic ?? '', /自动重试/); assert.equal(native.sends.length, 0);
    assert.equal(native.contexts.size, 0);
  } finally {await f.close();}
});

test('transport recovery preserves the temporary-failure retry budget instead of resetting it', async t => {
  fastRetries(t);
  const native = fake('local', {failure:'at capacity', disconnect:'stopped', disconnectOn:2}), f = fixture([native.executor], {autoContinueInterrupted:true});
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    const ended = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => Boolean(view.run?.diagnostic?.includes('已达上限')));
    assert.equal(native.sends.length, 4); // Original + a shared budget of three recoveries/retries.
    assert.equal(native.sends.filter(input => input.clientRequestId.startsWith('automatic-retry:')).length, 2);
    assert.equal(native.sends.filter(input => input.clientRequestId.startsWith('host-recovery:')).length, 1);
    assert.equal(ended.run?.status, 'failed');
  } finally {await f.close();}
});

test('explicit retry restores undelivered text and images without a duplicate user message', async () => {
  const native=fake('local',{images:true,prepareFailures:1,unknownCreate:true}), f=fixture([native.executor]);
  try {
    await connected(f.service,'local'); const chat=await f.service.conversations.create('workspace-one',{});
    const image=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:chat.revision,mimeType:'image/png',bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
    const input={expectedRevision:image.revision,connectionId:'local',text:'Inspect the image and finish the original task',attachmentIds:[image.id]};
    const preview=f.service.conversations.prepareSend('workspace-one',chat.id,input);
    const original=f.service.conversations.send('workspace-one',chat.id,{...input,previewToken:preview.token,clientRequestId:randomUUID()});
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='failed');
    const draft=continueDraft(f.service,chat.id), next=f.service.conversations.prepareSend('workspace-one',chat.id,draft), request={...draft,previewToken:next.token,clientRequestId:randomUUID()};
    const started=f.service.conversations.send('workspace-one',chat.id,request);
    assert.equal(f.service.conversations.send('workspace-one',chat.id,request).run.id,started.run.id);
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    assert.equal(native.sends.length,1);assert.match(native.sends[0].text,/Inspect the image/);assert.equal(native.sends[0].images.length,1);
    assert.equal(done.entries.filter(entry=>entry.kind==='message'&&entry.role==='user').length,1);
    assert.ok(done.entries.some(entry=>entry.role==='system'&&entry.text==='已请求重试上次未送达的要求。'));
    assert.equal(new ConversationRepository(path.join(f.options.dataRoot,'agent-service')).readConversation(chat.id)?.attempts.at(-1)?.continuationOf,original.run.id);
    assert.throws(()=>f.service.conversations.prepareSend('workspace-one',chat.id,{...draft,expectedRevision:done.revision}),{code:'agent_continue_stale'});
  } finally {await f.close();}
});

test('manual continuation works with the same selection, another model or another executor', async () => {
  for (const target of ['same','model','executor']) {
    const first=fake('local',{multipleModels:true,failure:n=>n===1?'permission_denied: previous execution failed':undefined}),second=fake('other',{multipleModels:true}),f=fixture([first.executor,second.executor]);
    try {
      await connected(f.service,'local');await connected(f.service,'other');const chat=await f.service.conversations.create('workspace-one',{});
      send(f.service,chat.id,'local','Complete the existing goal');
      await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='failed');
      const draft=continueDraft(f.service,chat.id,target==='executor'?'other':'local',target==='model'?'other-model':undefined);
      const preview=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
      f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
      const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
      const sent=target==='executor'?second.sends[0]:first.sends.at(-1)!;
      assert.match(sent.text,/接着完成原目标/);if(target==='model')assert.equal(sent.model,'other-model');
      assert.equal(done.entries.filter(entry=>entry.kind==='message'&&entry.role==='user').length,1);
      assert.ok(done.entries.some(entry=>entry.role==='system'&&entry.text==='已请求继续上次执行。'));
      if(target==='same')assert.equal(first.sends[0].contextRef.id,sent.contextRef.id);
      else assert.match(sent.text,/Complete the existing goal/);
    } finally {await f.close();}
  }
});

test('manual continuation exposes the exact source prompt while list summaries omit its body', async () => {
  const native=fake('local',{failure:n=>n===1?'permission_denied: previous execution failed':undefined}),f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','Original exact requirement');
    const failed=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='failed');
    const source=failed.entries.find(entry=>entry.kind==='message'&&entry.role==='user')!;
    const draft=continueDraft(f.service,chat.id),preview=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
    f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    assert.equal(done.run?.continuedFrom?.runId,failed.run?.id);
    assert.equal(done.run?.continuedFrom?.userEntryId,source.id);
    assert.equal(done.run?.continuedFrom?.prompt?.text,'Original exact requirement');
    const listed=f.service.conversations.list('workspace-one',{}).conversations.find(value=>value.id===chat.id)!;
    assert.equal(listed.run?.continuedFrom?.runId,failed.run?.id);
    assert.equal(listed.run?.continuedFrom?.userEntryId,source.id);
    assert.equal(listed.run?.continuedFrom?.prompt,undefined);
  } finally {await f.close();}
});

test('an empty completed response can continue, but a normal response or unknown work cannot', async () => {
  for(const options of [{noAnswer:true},{unknown:true},{toolSurvives:true},{}]) {
    const native=fake('local',options),f=fixture([native.executor]);
    try {
      await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','finish');
      await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>['completed','unknown','tools-active'].includes(view.run?.status??''));
      const draft=continueDraft(f.service,chat.id);
      if('noAnswer' in options)assert.ok(f.service.conversations.prepareSend('workspace-one',chat.id,draft).fits);
      else assert.throws(()=>f.service.conversations.prepareSend('workspace-one',chat.id,draft),error=>['agent_conversation_busy','agent_continue_unavailable'].includes((error as any).code));
      assert.throws(()=>f.service.conversations.prepareSend('workspace-one',chat.id,{...draft,text:'unrelated new instruction'}),{code:'agent_continue_input_conflict'});
      assert.throws(()=>f.service.conversations.queueSend('workspace-one',chat.id,{...draft,clientRequestId:randomUUID()}),{code:'agent_continue_unavailable'});
      assert.equal(native.sends.length,1);
    } finally {await f.close();}
  }
});

test('manual continuation can still use bounded automatic retry without replaying the manual action', async t => {
  fastRetries(t);
  const native=fake('local',{failure:n=>n===1?'permission_denied: failed':n===2?'Selected model is at capacity.':undefined}),f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','finish original goal');
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='failed');
    const draft=continueDraft(f.service,chat.id),preview=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
    f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    assert.equal(native.sends.length,3);assert.equal(done.entries.filter(entry=>entry.kind==='message'&&entry.role==='user').length,1);
    assert.equal(done.entries.filter(entry=>entry.text==='已请求继续上次执行。').length,1);
  } finally {await f.close();}
});

test('explicit retry keeps an undelivered video and its timed frames after mainline integration', async () => {
  const native=fake('local',{images:true,prepareFailures:1,unknownCreate:true}),f=fixture([native.executor]);
  const png=Buffer.from('89504e470d0a1a0a','hex'),mp4=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    const frame=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:chat.revision,mimeType:'image/png',bytes:png});
    const video=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:frame.revision,mimeType:'video/mp4',bytes:mp4,video:{duration:2,frames:[{id:frame.id,time:0}]}});
    const input={expectedRevision:video.revision,connectionId:'local',text:'finish reviewing this recording',attachmentIds:[video.id]};
    const preview=f.service.conversations.prepareSend('workspace-one',chat.id,input);
    f.service.conversations.send('workspace-one',chat.id,{...input,previewToken:preview.token,clientRequestId:randomUUID()});
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='failed');
    const draft=continueDraft(f.service,chat.id),next=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
    f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:next.token,clientRequestId:randomUUID()});
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    assert.equal(native.sends.length,1);assert.deepEqual(native.sends[0].images.map(image=>image.id),[frame.id]);assert.match(native.sends[0].text,/抽样画面，不含音轨/);
    assert.equal(done.entries.filter(entry=>entry.role==='user').length,1);assert.deepEqual(f.service.conversations.readAttachment('workspace-one',chat.id,video.id).bytes,mp4);
  } finally {await f.close();}
});

test('DSH and Qoder exact stopped transport losses enter the existing single continuation policy',async()=>{
  for(const disconnectError of ['dsh_execution_observation_lost','dsh_event_observation_lost','qoder_execution_observation_lost','qoder_event_observation_lost']){
    const native=fake('local',{disconnect:'stopped',disconnectError}),f=fixture([native.executor],{autoContinueInterrupted:true});
    try{
      await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','finish existing work');
      await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
      await Promise.all([f.service.conversations.recoverInterrupted(),f.service.conversations.observe('workspace-one',chat.id)]);
      assert.equal(native.sends.length,2,disconnectError);assert.equal(native.opens.length,2);
      assert.equal(native.sends[0]!.contextRef.id,native.sends[1]!.contextRef.id);
      assert.equal(native.opens[0]!.configRoot,native.opens[1]!.configRoot);
    }finally{await f.close();}
  }
});

for(const previouslyStopped of [false,true])test('startup preserves a pending question without a replacement or repeated stop ('+previouslyStopped+')',async()=>{
 const old=fake('local',{question:true}),other=fake('other',{hold:true}),controls:Array<{runId:string;action:string}>=[];
 const f=fixture([old.executor,other.executor],{controlSupersededRun:async(_scope,_id,input,action)=>{controls.push({runId:input.runId,action});}});
 try{
  await connected(f.service,'local');await connected(f.service,'other');
  const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','old goal');
  const before=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.requests.length===1);
  if(previouslyStopped){const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service')),record=repository.readConversation(chat.id)!;record.view.run!.stopRequested=true;repository.saveConversation(record,record.view.revision);}
  assert.throws(()=>send(f.service,chat.id,'other','new goal'),{code:'agent_pending_response'});
  await f.service.conversations.recoverInterrupted();await f.service.conversations.recoverInterrupted();
  const current=f.service.conversations.read('workspace-one',chat.id);
  assert.equal(current.run!.id,before.run!.id);assert.deepEqual(current.requests,before.requests);
  assert.equal(other.sends.length,0);assert.equal(old.replies.length,0);assert.deepEqual(controls,[]);
 }finally{await f.close();}
});

for(const terminalStatus of ['idle','stopped'] as const)for(const liveOldGeneration of [false,true])test(`durable completion repairs missing receipts and final reply without opening or replaying native work; oldAlive=${liveOldGeneration}; terminal=${terminalStatus}`,async()=>{
 const native=fake('dsh',{hold:true,noAnswer:true}),f=fixture([native.executor]);let observer:ReturnType<typeof createAgentService>|undefined,persistedInput:Parameters<NonNullable<AgentExecutor['readPersistedExecution']>>[0]|undefined;
 try{
  const executable=path.join(f.root,'dsh.mjs');fs.writeFileSync(executable,'// fake native executable');fs.chmodSync(executable,0o700);
  await f.service.connections.connect('dsh',{expectedRevision:f.service.connections.read('dsh').revision,executable});
  const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'dsh','finish once');
  const before=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.accepted===true);
  const count=native.opens.length;
  await assert.rejects(f.service.reconcilePersisted('workspace-one',chat.id,{expectedRevision:'stale',runId:before.run!.id,participantId:before.run!.participantId,generation:before.run!.generation}),{code:'agent_revision_conflict'});
  native.executor.readPersistedExecution=async input=>{persistedInput=input;return{observation:{status:terminalStatus,executionRef:input.executionRef,tools:[{id:'missing-tool',label:'bash',status:'completed'}]},items:[{id:'missing-tool',kind:'tool',role:'system',name:'bash',text:'already delivered',executionId:input.executionRef.id,status:'completed'},{id:'missing-final',kind:'message',role:'assistant',text:'Everything delivered once.',executionId:input.executionRef.id,status:'completed'}]};};
  observer=createAgentService({...f.options,generationAlive:()=>liveOldGeneration});
  if(!liveOldGeneration)await observer.conversations.recoverInterrupted();
  else assert.equal(await observer.reconcilePersisted('workspace-one',chat.id,{expectedRevision:before.revision,runId:before.run!.id,participantId:before.run!.participantId,generation:before.run!.generation}),true);
  const after=observer.conversations.read('workspace-one',chat.id);
  assert.equal(after.run?.status,terminalStatus==='idle'?'completed':'stopped');assert.equal(after.run?.executionState,'ended');assert.equal(after.run?.generation,before.run?.generation,'reading evidence does not acquire old controls');
  const admitted=after.entries.find(entry=>entry.runId===before.run!.id&&entry.role==='user');
  assert.deepEqual(persistedInput?.nativeInputs,[{clientRequestId:native.sends[0]!.clientRequestId,text:'finish once',createdAt:admitted?.createdAt}]);
  assert.equal(persistedInput?.startedAt,before.run?.startedAt);
  assert.ok(after.entries.some(e=>e.text==='Everything delivered once.'));assert.ok(after.entries.some(e=>e.text==='already delivered'));
  const again=await observer.conversations.observe('workspace-one',chat.id);assert.equal(again.entries.filter(e=>e.text==='Everything delivered once.').length,1);
  native.sends[0]!.onEvent({type:'diagnostic',message:'late stream closure'});
  native.sends[0]!.onEvent({type:'observation',observation:{status:'unknown',tools:[],executionRef:{id:'lost'}}});
  native.sends[0]!.onEvent({type:'completed',status:'failed',diagnostic:'late failure'});
  const settled=f.service.conversations.read('workspace-one',chat.id);
  assert.equal(settled.run?.status,after.run?.status);assert.equal(settled.run?.diagnostic,after.run?.diagnostic);
  assert.equal(native.sends.length,1);assert.equal(native.opens.length,count);
 }finally{await observer?.close();await f.close();}
});

test('persisted evidence cannot overwrite a conversation changed during the read',async()=>{
 const native=fake('dsh',{hold:true,noAnswer:true}),f=fixture([native.executor]);
 try{
  const executable=path.join(f.root,'dsh.mjs');fs.writeFileSync(executable,'// never executed');fs.chmodSync(executable,0o700);
  await f.service.connections.connect('dsh',{expectedRevision:f.service.connections.read('dsh').revision,executable});
  const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'dsh','one operation');
  await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.accepted===true);
  native.executor.readPersistedExecution=async input=>{
   const current=f.service.conversations.read('workspace-one',chat.id);
   await f.service.conversations.update('workspace-one',chat.id,{expectedRevision:current.revision,title:'A newer title'});
   return {observation:{status:'idle',executionRef:input.executionRef,tools:[]},items:[{id:'stale-final',kind:'message',role:'assistant',text:'Stale answer',executionId:input.executionRef.id}]};
  };
  assert.equal(await f.service.reconcilePersisted('workspace-one',chat.id),false);
  const after=f.service.conversations.read('workspace-one',chat.id);
  assert.equal(after.title,'A newer title');assert.notEqual(after.run?.status,'completed');assert.equal(after.entries.some(entry=>entry.text==='Stale answer'),false);assert.equal(native.sends.length,1);
 }finally{await f.close();}
});

test('Claude SDK startup failure persists a visible reason on the undelivered input', async t => {
  const native=fake(), open=native.executor.open;
  native.executor.open=async input=>({...await open(input),async createContext(){throw new Error('agent_claude_sdk_missing');}});
  const other=fake('other'),f=fixture([native.executor,other.executor]);t.after(()=>f.close());
  await connected(f.service,'local');await connected(f.service,'other');
  const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'local','keep original message');
  const failed=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='failed');
  const entry=failed.entries.find(e=>e.role==='user'&&e.text==='keep original message');
  assert.equal(failed.run?.accepted,false);assert.equal(native.sends.length,0);assert.equal(entry?.status,'failed');
  assert.match(entry?.deliveryDiagnostic??'',/消息未发送：Claude Code 配套组件/);
  send(f.service,chat.id,'other','independent next message');
  const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  assert.equal(done.entries.find(e=>e.id===entry?.id)?.deliveryDiagnostic,entry?.deliveryDiagnostic);
});

test('closing service and deleting data root during unknown disconnect produces no unhandledRejection', async () => {
  const native = fake('local', { disconnect: 'unknown' }), f = fixture([native.executor]);
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => { rejections.push(reason); };
  process.on('unhandledRejection', onRejection);
  try {
    await connected(f.service, 'local');
    const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'close right after unknown');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), v => v.run?.status === 'unknown');
    await f.close();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual(rejections, []);
  } finally {
    process.off('unhandledRejection', onRejection);
    await f.close();
  }
});
