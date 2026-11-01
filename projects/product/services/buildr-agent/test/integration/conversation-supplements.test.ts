import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ExecutorEventStream } from '../../src/executors/event-stream.ts';
import { createAgentService, ExecutorInputRejected, type AgentExecutor, type AgentRuntime, type ExecutorEvent, type ExecutorItem, type ExecutorObservation, type ExecutorSupplementInput } from '../../build/index.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=', 'base64');
function gate() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function wait(read: () => boolean) { for (let i = 0; i < 400; i++) { if (read()) return; await new Promise(resolve => setTimeout(resolve, 2)); } assert.fail('state did not settle'); }
async function fixture(options: { beforeSupplement?: Promise<void>; delivery?: 'rejected' | 'unknown'; supported?: boolean; historyReceipt?: boolean; historyClientId?: string; beforeObserve?: Promise<void>; endOnReject?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-supplement-')), ending = gate();
  const calls: ExecutorSupplementInput[] = [], items: ExecutorItem[] = []; let emit: (event: ExecutorEvent) => void = () => {};
  let observation: ExecutorObservation = { status: 'idle', tools: [] };
  const capabilities = { supplement: options.supported !== false, text: true, images: true, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 65536 };
  const runtime: AgentRuntime = {
    capabilities, bindingIdentity: 'fixture-binding', async inspectAccount() { return { status: 'ready' }; }, async models() { return [{ id: 'fixture-model', label: 'Fixture model' }]; }, async beginLogin() {}, async cancelLogin() {},
    async createContext() { return { id: 'native-context' }; }, async resumeContext() {}, async readHistory() { return structuredClone(items); },
    async send(input) {
      const notify = input.onEvent; emit = notify; observation = { status: 'running', executionRef: { id: 'native-run' }, tools: [] };
      emit({ type: 'accepted', executionRef: observation.executionRef!, inputItemId: input.clientRequestId });
      const item: ExecutorItem = { id: input.clientRequestId, clientRequestId: input.clientRequestId, kind: 'message', role: 'user', text: input.text, executionId: 'native-run' }; items.push(item); emit({ type: 'item', item });
      await ending.promise; observation = { status: 'idle', executionRef: { id: 'native-run' }, tools: [] }; emit({ type: 'completed', status: 'completed' });
    },
    async supplement(input) {
      calls.push(input); await options.beforeSupplement;
      if (options.delivery === 'rejected') { if(options.endOnReject)observation={status:'idle',executionRef:input.executionRef,tools:[]}; throw new ExecutorInputRejected('proven rejection'); }
      if (options.delivery === 'unknown' && !options.historyReceipt) throw new Error('receipt lost');
      const item: ExecutorItem = { id: 'native-' + input.clientRequestId, clientRequestId: input.clientRequestId, kind: 'message', role: 'user', text: input.text, executionId: input.executionRef.id };
      items.push(item); if(options.historyReceipt){if(options.historyClientId)item.clientRequestId=options.historyClientId;throw new Error('receipt lost');} emit({ type: 'item', item }); return { executionRef: input.executionRef, inputItemId: item.id };
    },
    async observe() { await options.beforeObserve; return structuredClone(observation); }, async reply() {}, async stop() { observation = { status: 'stopped', tools: [] }; ending.resolve(); return observation; }, async close() { ending.resolve(); },
  };
  const executor: AgentExecutor = { descriptor: { id: 'fixture', label: 'Fixture', capabilities }, async open() { return runtime; } };
  const service = createAgentService({ dataRoot: path.join(root, 'private'), executors: [executor], modelProviders: [], resolveWorkspace() { return { rootPath: root }; } });
  await service.connections.connect('fixture', { expectedRevision: service.connections.read('fixture').revision });
  let view = await service.conversations.create('workspace', {});
  const draft = { expectedRevision: view.revision, connectionId: 'fixture', text: 'initial' };
  const preview = service.conversations.prepareSend('workspace', view.id, draft);
  service.conversations.send('workspace', view.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
  await wait(() => service.conversations.read('workspace', view.id).run?.status === 'running');
  const read = () => service.conversations.read('workspace', view.id);
  const input = (text: string, clientRequestId = randomUUID()) => { const run = read().run!; return { runId: run.id, participantId: run.participantId, generation: run.generation, text, clientRequestId }; };
  return { historyReceipt:(item:ExecutorItem)=>items.push(item), setObservation:(value:ExecutorObservation)=>{observation=value;}, service, read, input, calls, emit: (event: ExecutorEvent) => emit(event), async close() { ending.resolve(); await service.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

test('multiple supplementary inputs retain exact identity, ordering and idempotency within one execution', async () => {
  const f = await fixture(); try {
    const runId = f.read().run!.id, one = f.input('first'), two = f.input('second');
    assert.equal((await f.service.conversations.supplement('workspace', f.read().id, one)).delivery, 'accepted');
    assert.equal((await f.service.conversations.supplement('workspace', f.read().id, two)).delivery, 'accepted');
    await f.service.conversations.supplement('workspace', f.read().id, one);
    assert.equal(f.calls.length, 2); assert.equal(f.read().run!.id, runId);
    assert.deepEqual(f.read().entries.filter(entry => entry.role === 'user').map(entry => [entry.text, entry.status]), [['initial', 'accepted'], ['first', 'accepted'], ['second', 'accepted']]);
    await f.service.conversations.observe('workspace', f.read().id); assert.equal(f.read().entries.filter(entry => entry.role === 'user').length, 3);
    await assert.rejects(async () => f.service.conversations.supplement('workspace', f.read().id, { ...one, text: 'different' }), /相同请求身份/);
  } finally { await f.close(); }
});
test('in-flight repeats share admission and late receipt preserves concurrent record changes', async () => {
  const before = gate(), f = await fixture({ beforeSupplement: before.promise }); try {
    const input = f.input('delayed'), a = f.service.conversations.supplement('workspace', f.read().id, input), b = f.service.conversations.supplement('workspace', f.read().id, input);
    await assert.rejects(async () => f.service.conversations.supplement('workspace', f.read().id, { ...input, text: 'conflicting in flight' }), /相同请求身份/);
    await wait(() => f.calls.length === 1);
    f.service.conversations.update('workspace', f.read().id, { expectedRevision: f.read().revision, title: 'renamed concurrently' });
    f.emit({ type: 'item', item: { id: 'tool-new', kind: 'tool', role: 'system', text: 'new output', executionId: 'native-run', status: 'completed' } });
    before.resolve(); assert.equal((await a).delivery, 'accepted'); assert.equal((await b).delivery, 'accepted');
    assert.equal(f.calls.length, 1); assert.equal(f.read().title, 'renamed concurrently'); assert.ok(f.read().entries.some(entry => entry.id && entry.text === 'new output'));
  } finally { before.resolve(); await f.close(); }
});
test('rejection and unknown supplementary delivery preserve the original execution and never replay', async () => {
  for (const delivery of ['rejected', 'unknown'] as const) {
    const f = await fixture({ delivery }); try {
      const input = f.input(delivery); const result = await f.service.conversations.supplement('workspace', f.read().id, input);
      assert.equal(result.delivery, delivery); assert.equal(f.read().run!.status, 'running'); assert.equal(f.read().entries.at(-1)!.status, delivery === 'rejected' ? 'failed' : 'unknown');
      await f.service.conversations.observe('workspace', f.read().id); await f.service.conversations.supplement('workspace', f.read().id, input); assert.equal(f.calls.length, 1);
      if (delivery === 'unknown') {
        f.emit({ type: 'item', item: { id: 'observed-native-input', clientRequestId: input.clientRequestId, kind: 'message', role: 'user', text: input.text, executionId: 'native-run' } });
        assert.equal((await f.service.conversations.supplement('workspace', f.read().id, input)).delivery, 'accepted');
      }
    } finally { await f.close(); }
  }
});
test('wrong execution and unavailable capability reject without appending or dispatching input', async () => {
  const f = await fixture({ supported: false }); try {
    await assert.rejects(async () => f.service.conversations.supplement('workspace', f.read().id, { ...f.input('wrong'), runId: 'other-run' }), /原执行已变化/);
    await assert.rejects(async () => f.service.conversations.supplement('workspace', f.read().id, f.input('unsupported')), /尚不支持/);
    assert.equal(f.calls.length, 0); assert.equal(f.read().entries.length, 1);
  } finally { await f.close(); }
});

test('an exactly ended native round continues the submitted input once without sending to the old round',async()=>{
  const f=await fixture();try{
    const input=f.input('continue after native end'),originalRun=f.read().run!,original=originalRun.id;
    f.setObservation({status:'idle',executionRef:{id:'native-run'},tools:[]});
    const result=await f.service.conversations.supplement('workspace',f.read().id,input);
    assert.equal(result.delivery,'continued');assert.notEqual(result.conversation.run!.id,original);assert.equal(f.calls.length,0);
    for(const field of ['model','modelAccountId','modelAccountIdentity','serviceTier','reasoningEffort','permissionMode'] as const)assert.equal(result.conversation.run![field],originalRun[field],field);
    await wait(()=>f.read().entries.filter(entry=>entry.text===input.text&&entry.status==='accepted').length===1);
    assert.equal((await f.service.conversations.supplement('workspace',f.read().id,input)).delivery,'continued');
    assert.equal(f.read().entries.filter(entry=>entry.text===input.text&&entry.status==='accepted').length,1);
  }finally{await f.close();}
});

test('a proven end after rejection can continue, while a lost receipt is reconciled only by exact native input identity',async()=>{
  const ended=await fixture({delivery:'rejected',endOnReject:true});try{
    const input=ended.input('end during admission');
    assert.equal((await ended.service.conversations.supplement('workspace',ended.read().id,input)).delivery,'continued');
    assert.equal(ended.calls.length,1);
  }finally{await ended.close();}
  const f=await fixture({delivery:'unknown',historyReceipt:true});try{
    const input=f.input('lost receipt'),run=f.read().run!.id;
    assert.equal((await f.service.conversations.supplement('workspace',f.read().id,input)).delivery,'accepted');
    assert.equal(f.read().run!.id,run);assert.equal(f.calls.length,1);
    assert.equal((await f.service.conversations.supplement('workspace',f.read().id,input)).delivery,'accepted');
    assert.equal(f.calls.length,1);
  }finally{await f.close();}
});

test('unknown or mismatched native execution is not dispatched or silently continued',async()=>{
  for(const observation of [{status:'unknown',tools:[]},{status:'idle',executionRef:{id:'other-native'},tools:[]}] as ExecutorObservation[]){
    const f=await fixture();try{
      const input=f.input('retain input'),run=f.read().run!.id;f.setObservation(observation);
      assert.equal((await f.service.conversations.supplement('workspace',f.read().id,input)).delivery,'rejected');
      assert.equal(f.calls.length,0);assert.equal(f.read().run!.id,run);
      if(observation.status==='unknown')assert.equal(f.read().run!.status,'unknown');
    }finally{await f.close();}
  }
});

test('an explicit user stop prevents a delayed supplement from automatically starting another round',async()=>{
  const f=await fixture();try{
    const before=f.read(),input=f.input('do not restart after stop'),run=before.run!;
    await f.service.conversations.stop('workspace',before.id,{expectedRevision:before.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
    f.setObservation({status:'stopped',executionRef:{id:'native-run'},tools:[]});
    assert.equal((await f.service.conversations.supplement('workspace',before.id,input)).delivery,'rejected');
    assert.equal(f.read().run!.id,run.id);assert.equal(f.calls.length,0);
  }finally{await f.close();}
});

test('a newer independently submitted requirement wins over an in-flight old supplement observation',async()=>{
  const observed=gate(),f=await fixture({beforeObserve:observed.promise});try{
    const input=f.input('old supplementary input'),pending=f.service.conversations.supplement('workspace',f.read().id,input);
    await wait(()=>f.read().entries.some(entry=>entry.text===input.text));
    const before=f.read(),draft={expectedRevision:before.revision,connectionId:'fixture',text:'new independent requirement'};
    const preview=f.service.conversations.prepareSend('workspace',before.id,draft);
    const newer=f.service.conversations.send('workspace',before.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
    observed.resolve();assert.equal((await pending).delivery,'rejected');
    assert.equal(f.read().run!.id,newer.run.id);assert.equal(f.calls.length,0);
  }finally{observed.resolve();await f.close();}
});

test('identical text under another native request identity cannot confirm the missing receipt',async()=>{
  const f=await fixture({delivery:'unknown',historyReceipt:true,historyClientId:'another-request'});try{
    const input=f.input('same body is not a receipt');
    assert.equal((await f.service.conversations.supplement('workspace',f.read().id,input)).delivery,'unknown');
    assert.equal(f.calls.length,1);assert.equal(f.read().entries.at(-1)!.status,'unknown');
  }finally{await f.close();}
});

test('rechecking a persisted unknown request reconciles a later native receipt without another dispatch',async()=>{
  const f=await fixture({delivery:'unknown'});try{
    const input=f.input('receipt arrives later');
    assert.equal((await f.service.conversations.supplement('workspace',f.read().id,input)).delivery,'unknown');
    f.historyReceipt({id:'late-native-receipt',clientRequestId:input.clientRequestId,kind:'message',role:'user',executionId:'native-run',text:input.text});
    const result=await f.service.conversations.supplement('workspace',f.read().id,input);
    assert.equal(result.delivery,'accepted');assert.equal(f.calls.length,1);
    assert.equal(result.conversation.entries.filter(entry=>entry.text===input.text).length,1);
    assert.equal(result.conversation.entries.at(-1)!.deliveryDiagnostic,undefined);
  }finally{await f.close();}
});

test('a native failed-input record is not promoted to confirmed delivery',async()=>{
  const f=await fixture({delivery:'unknown'});try{
    const input=f.input('native did not accept');
    await f.service.conversations.supplement('workspace',f.read().id,input);
    f.historyReceipt({id:'failed-receipt',clientRequestId:input.clientRequestId,kind:'message',role:'user',executionId:'native-run',status:'failed',text:input.text});
    assert.equal((await f.service.conversations.supplement('workspace',f.read().id,input)).delivery,'unknown');
    assert.equal(f.calls.length,1);
  }finally{await f.close();}
});

test('a multi-megabyte durable history receives the latest burst text and terminal control with bounded writes',async(t)=>{
  const f=await fixture();try{
    for(let i=0;i<12;i++)f.emit({type:'item',item:{id:'large-history-'+i,executionId:'native-run',kind:'tool',role:'system',status:'completed',text:'h'.repeat(200000)}});
    let deliveries=0;const started=performance.now();
    const stream=new ExecutorEventStream(event=>{deliveries++;f.emit(event);},()=>()=>{});
    const observation:ExecutorEvent={type:'observation',observation:{status:'running',executionRef:{id:'native-run'},tools:[]}};
    stream.push(observation);
    for(let i=0;i<5000;i++){stream.push({type:'item',item:{id:'burst',executionId:'native-run',kind:'message',role:'assistant',status:'running',text:'latest '+i}});stream.push(observation);}
    stream.push({type:'item',item:{id:'burst',executionId:'native-run',kind:'message',role:'assistant',status:'completed',text:'latest 4999'}});
    stream.push({type:'observation',observation:{status:'idle',executionRef:{id:'native-run'},tools:[]}});
    t.diagnostic(JSON.stringify({historyBytes:2400000,nativeEvents:10002,consumerEvents:deliveries,burstAndTerminalMs:Math.round(performance.now()-started)}));
    assert.ok(deliveries<=4);assert.equal(f.read().run!.status,'completed');assert.equal(f.read().entries.at(-1)!.text,'latest 4999');
  }finally{await f.close();}
});
test('supplementing while approval is pending does not answer or replace the request', async () => {
  const f = await fixture(); try {
    f.emit({ type: 'request', request: { id: 'native-approval', kind: 'approval', title: 'Allow write?' } }); const pending = f.read().requests[0];
    await f.service.conversations.supplement('workspace', f.read().id, f.input('additional context'));
    assert.equal(f.read().run!.status, 'waiting-approval'); assert.equal(f.read().requests[0].id, pending.id);
  } finally { await f.close(); }
});
test('image admission has its own observed revision and never overwrites streamed entries', async () => {
  const f = await fixture(); try {
    const before = f.read(); f.emit({ type: 'item', item: { id: 'streamed', kind: 'message', role: 'assistant', text: 'new text', executionId: 'native-run', status: 'running' } });
    const image = f.service.conversations.addAttachment('workspace', before.id, { expectedRevision: before.revision, expectedAttachmentRevision: before.attachmentRevision, mimeType: 'image/png', bytes: png });
    assert.ok(f.read().entries.some(entry => entry.text === 'new text')); assert.notEqual(image.attachmentRevision, before.attachmentRevision);
    const result = await f.service.conversations.supplement('workspace', before.id, { ...f.input(''), attachmentIds: [image.id] }); assert.equal(result.delivery, 'accepted'); assert.equal(f.calls[0].images[0].id, image.id);
    assert.throws(() => f.service.conversations.addAttachment('workspace', before.id, { expectedAttachmentRevision: before.attachmentRevision, mimeType: 'image/png', bytes: png }), /内容已变化/);
    const current = f.read(); assert.ok(f.service.conversations.addAttachment('workspace', current.id, { expectedRevision: current.revision, mimeType: 'image/png', bytes: png }).id);
  } finally { await f.close(); }
});

test('video supplement preserves one run and sends timed visual frames with original source, retaining only the submitted original in history',async()=>{
  const f=await fixture();try{
    const chat=f.read(),frame=f.service.conversations.addAttachment('workspace',chat.id,{expectedRevision:chat.revision,mimeType:'image/png',bytes:png});
    const video=f.service.conversations.addAttachment('workspace',chat.id,{expectedRevision:frame.revision,mimeType:'video/mp4',bytes:Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex'),video:{duration:2,frames:[{id:frame.id,time:0}]}});
    const result=await f.service.conversations.supplement('workspace',chat.id,{...f.input('look at the recording'),attachmentIds:[video.id]});
    assert.equal(result.delivery,'accepted');assert.equal(f.calls[0].images[0].id,frame.id);assert.match(f.calls[0].text,/不含音轨/);assert.ok(f.calls[0].text.includes(video.id));
    const entry=f.read().entries.find(entry=>entry.attachments?.includes(video.id));assert.equal(entry?.text,'look at the recording');assert.deepEqual(entry?.attachments,[video.id]);assert.equal(f.read().run?.id,chat.run?.id);
  }finally{await f.close();}
});
