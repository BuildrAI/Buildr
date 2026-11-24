import Ajv2020 from 'ajv/dist/2020.js';
import { AGENT_OPERATION_SCHEMAS } from '../../src/operation-schemas.ts';
import { codexItem } from '../../src/executors/codex/items.ts';
import { dshItem } from '../../src/executors/dsh/protocol.ts';
import { qoderHistoryItems } from '../../src/executors/qoder/protocol.ts';
import { zstdCompressSync } from 'node:zlib';
import zlib from 'node:zlib';
import { syncBuiltinESMExports } from 'node:module';
import { ExecutorEventStream } from '../../src/executors/event-stream.ts';
import { NativeContentReader } from '../../src/storage/native-content.ts';
import { dispatchOperation } from '../../src/process/operations.ts';
import { listen, body, json } from '../../src/process/transport.ts';
import { opaqueReference } from '../../src/executors/native-process.ts';
import { interactionPolicy } from '../../src/domain/interaction-policy.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import type { ConversationEntry, ExecutorItem } from '../../src/contracts.ts';
import { ConversationEntryStore } from '../../src/persistence/conversation-entry-store.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { fake, fixture, connected, waitUntil, send } from '../support/conversations-fixture.ts';

for(const provider of ['dsh','qoder'] as const)test(`${provider} streaming keeps HTTP controls responsive with large old tool history`,async t=>{
  const native=fake(provider),open=native.executor.open;let begin:(()=>void)|undefined,started!:()=>void;
  const outputStarted=new Promise<void>(resolve=>{started=resolve;});const chunks=200;
  let finishStream!:()=>void,streamEnded=false;const streamDone=new Promise<void>(resolve=>{finishStream=resolve;});
  native.executor.open=async options=>{
    const runtime=await open(options),create=runtime.createContext.bind(runtime);
    runtime.createContext=async input=>{const previous=await create(input),id=provider==='dsh'?'session-'+previous.id:previous.id;if(id!==previous.id){native.contexts.set(id,native.contexts.get(previous.id)!);native.contexts.delete(previous.id);}return{id,data:{native:opaqueReference(provider,id,input.cwd,runtime.bindingIdentity)}};};
    runtime.send=async input=>{
      try{
      native.sends.push(input);const context=native.contexts.get(input.contextRef.id)!;
      const executionRef={id:input.clientRequestId,data:{resourceContext:input.contextRef.id,resourceBinding:runtime.bindingIdentity}};
      context.observation={status:'running',executionRef,tools:[{id:'stream',label:'command',status:'running'}]};input.onEvent({type:'accepted',executionRef});
      const item:ExecutorItem={id:'stream',kind:'tool',role:'system',name:'shell',nativeTool:true,input:'read-only',text:'begin',executionId:executionRef.id,status:'running'};input.onEvent({type:'item',item});
      await new Promise<void>(resolve=>{begin=resolve;});started();
      const events=new ExecutorEventStream(input.onEvent);
      for(let i=0;i<chunks;i++){events.push({type:'item',item:{...item,text:'stream '+i+'\n'+'data'.repeat(3000)}});await new Promise(resolve=>setTimeout(resolve,5));}
      events.push({type:'item',item:{...item,text:'finished',status:'completed'}});events.push({type:'completed',status:'completed'});context.observation={status:'idle',executionRef,tools:[]};
      }finally{streamEnded=true;finishStream();}
    };return runtime;
  };
  const f=fixture([native.executor]);let channel:Awaited<ReturnType<typeof listen>>|undefined;
  const writes=t.mock.method(ConversationRepository.prototype,'saveConversation');
  const decompressions=t.mock.method(zlib,'zstdDecompressSync');syncBuiltinESMExports();
  t.after(()=>{decompressions.mock.restore();syncBuiltinESMExports();});
  const nativeReads=t.mock.method(NativeContentReader.prototype,'tool');
  try{
    await connected(f.service,provider);const chat=await f.service.conversations.create('workspace-one',{});
    const repo=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));const old=repo.readConversation(chat.id)!;const prior=old.view.revision;
    old.view.entries=Array.from({length:400},(_,i)=>({id:'old-'+i,sequence:i+1,kind:'tool' as const,role:'system' as const,text:'historical-'+i+'\n'+'history-only-data'.repeat(1300),status:'completed' as const,createdAt:'old'}));old.view.revision=randomUUID();repo.saveConversation(old,prior);repo.stopReadModels();
    send(f.service,chat.id,provider,'read-only performance fixture');
    const running=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id,{compactTools:true}),v=>v.entries.some(e=>e.kind==='tool'&&e.detail?.live));
    const through=running.activity?.version??0;
    let controlNativeReads=0;
    channel=await listen(async(req,res)=>{const input=await body(req),before=nativeReads.mock.callCount();const result=await dispatchOperation(f.service,input.operation,input.args);controlNativeReads+=nativeReads.mock.callCount()-before;json(res,200,result);});
    const baseline={writes:writes.mock.callCount(),native:nativeReads.mock.callCount(),decoded:decompressions.mock.callCount()};
    begin!();await outputStarted;
    const timings:Record<string,number[]>={read:[],children:[],activity:[],seen:[]};
    const operations:{[key:string]:[string,unknown[]]}={read:['conversations.read',['workspace-one',chat.id,{compactTools:true}]],children:['conversations.listChildren',['workspace-one',chat.id,{}]],activity:['conversations.listAll',[['workspace-one'],{}]],seen:['conversations.markSeen',['workspace-one',chat.id,{through}]]};
    const start=performance.now();
    for(let n=0;n<250&&(n<12||!streamEnded);n++){
      await Promise.all(Object.entries(operations).map(async([key,[operation,args]])=>{
      const time=performance.now(),response=await fetch(channel!.origin,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,args}),signal:AbortSignal.timeout(3000)});const value=await response.json();assert.equal(response.status,200,response.status===200?undefined:JSON.stringify(value));timings[key].push(performance.now()-time);
      }));
      if(!streamEnded)await new Promise(resolve=>setTimeout(resolve,5));
    }
    assert.equal(controlNativeReads,0,'control requests never open native tool bodies');
    assert.equal(decompressions.mock.callCount()-baseline.decoded,0,'stream snapshots never decode old tool bodies');
    const probeMs=performance.now()-start;
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id,{compactTools:true}),v=>v.run?.status==='completed');
    const saved=writes.mock.callCount()-baseline.writes;assert.ok(saved<chunks/2,`coalesced writes ${saved} for ${chunks} updates`);
    const summary=Object.fromEntries(Object.entries(timings).map(([key,values])=>{const sorted=[...values].sort((a,b)=>a-b);return[key,{requests:values.length,p95Ms:Math.round(sorted[Math.ceil(sorted.length*.95)-1]),maxMs:Math.round(sorted.at(-1)!)}];}));
    t.diagnostic(JSON.stringify({provider,historyTools:400,historyLogicalBytes:Buffer.byteLength(JSON.stringify(old.view.entries)),chunks,persistedUpdates:saved,nativeBodyReads:0,oldBodyDecompressions:0,modelWaitMs:0,source:'controlled post-adapter event fixture, actual HTTP/SQLite',controlProbeMs:Math.round(probeMs),streamFixtureMs:Math.round(performance.now()-start),endpoints:summary}));
  }finally{begin?.();if(begin)await streamDone;await channel?.close();await f.close();}
});

for(const provider of ['dsh','qoder'] as const)test(`${provider} live tool output is never persisted and late native history survives reopening`,async()=>{
  const native=fake(provider),open=native.executor.open,output='native-only-output\n'.repeat(1500);
  let release!:()=>void,file='',completion:unknown;
  native.executor.open=async options=>{
    const runtime=await open(options),create=runtime.createContext.bind(runtime);
    runtime.createContext=async input=>{
      const previous=await create(input),id=provider==='dsh'?'session-'+previous.id:previous.id;
      if(id!==previous.id){native.contexts.set(id,native.contexts.get(previous.id)!);native.contexts.delete(previous.id);}
      return {id,data:{native:opaqueReference(provider,id,input.cwd,runtime.bindingIdentity)}};
    };
    runtime.send=async input=>{
      native.sends.push(input);const context=native.contexts.get(input.contextRef.id)!,id='native-call';
      const executionRef={id:input.clientRequestId,data:{resourceContext:input.contextRef.id,resourceBinding:runtime.bindingIdentity}};
      context.observation={status:'running',executionRef,tools:[{id,label:'tool',status:'running'}]};input.onEvent({type:'accepted',executionRef});
      const call=provider==='dsh'?{seq:2,type:'tool/call',data:{turn:1,callId:id,name:'shell',arguments:JSON.stringify({command:'read-only-command'})}}:{type:'assistant',uuid:'assistant',session_id:input.contextRef.id,message:{content:[{type:'tool_use',id,name:'Shell',input:{command:'read-only-command'}}]}};
      const result=provider==='dsh'?{seq:3,type:'tool/result',data:{turn:1,message:{toolCallId:id,content:[{type:'text',text:output}]}}}:{type:'user',session_id:input.contextRef.id,message:{content:[{type:'tool_result',tool_use_id:id,content:output}]}};
      const projected=(record:any)=>provider==='dsh'?dshItem(record):qoderHistoryItems([{type:'user',uuid:input.clientRequestId,session_id:input.contextRef.id,message:{content:[{type:'text',text:'run'}]}},call,record],input.contextRef.id).filter(item=>item.kind==='tool');
      const raw=(record:any)=>({...record,sessionId:input.contextRef.id,cwd:input.cwd,isSidechain:false,promptId:input.clientRequestId,sourceToolAssistantUUID:record.type==='user'?'assistant':undefined});
      file=provider==='dsh'?path.join(options.configRoot,'dsh-home/sessions/bucket',input.contextRef.id,'session.v4.jsonl.zstd'):path.join(options.nativeAccountConfigRoot??options.configRoot,'qoder-config/projects/bucket',input.contextRef.id+'.jsonl');fs.mkdirSync(path.dirname(file),{recursive:true});
      const rows=provider==='dsh'?[{type:'session',version:4,id:input.contextRef.id,cwd:input.cwd},{seq:0,type:'turn/start',data:{turn:1}},{seq:1,type:'user/message',data:{turn:1,source:{rpcId:input.clientRequestId},content:[{type:'text',text:'run'}]}},call]:[raw({type:'user',uuid:input.clientRequestId,message:{content:[{type:'text',text:'run'}]}}),raw(call)];
      fs.writeFileSync(file,provider==='dsh'?Buffer.concat(rows.map(row=>zstdCompressSync(Buffer.from(JSON.stringify(row)+'\n')))):rows.map(row=>JSON.stringify(row)+'\n').join(''));
      for(const item of projected(call))input.onEvent({type:'item',item:{...item,executionId:executionRef.id}});
      input.onEvent({type:'item',item:{id,kind:'tool',role:'system',nativeTool:true,text:output.slice(0,100),executionId:executionRef.id,status:'running'}});
      await new Promise<void>(resolve=>{release=resolve;});
      for(const item of projected(result)){input.onEvent({type:'item',item:{...item,executionId:executionRef.id}});context.items.push({...item,executionId:executionRef.id});}
      completion=provider==='dsh'?result:raw(result);context.observation={status:'idle',executionRef,tools:[]};input.onEvent({type:'completed',status:'completed'});
    };return runtime;
  };
  const f=fixture([native.executor]);
  try{
    await connected(f.service,provider);const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,provider,'run');
    const running=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id,{compactTools:true}),v=>v.entries.some(e=>e.kind==='tool'&&e.detail?.live));const tool=running.entries.find(e=>e.kind==='tool')!;
    assert.ok(tool.text.includes('native-only-output'));
    const source=f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:running.revision,connectionId:provider,text:'inspect history without sending'}).handoff!;
    const subscription=f.service.conversations.subscribe('workspace-one',chat.id,{compactTools:true});const first=await subscription.events[Symbol.asyncIterator]().next();assert.equal(first.value?.payload.conversation?.entries.find((e:ConversationEntry)=>e.id===tool.id)?.detail?.live,true);subscription.close();
    const db=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'),{readOnly:true});
    const stored=()=>{const row=db.prepare('SELECT c.codec,c.body,e.compact FROM conversation_entry_contents c JOIN conversation_read_entries e USING(conversation_id,content_revision) WHERE e.conversation_id=? AND e.id=?').get(chat.id,tool.id)!;assert.equal(row.codec,'native-tool');assert.equal(row.compact,null);assert.equal(String(row.body).includes('native-only-output'),false);assert.equal(String(row.body).includes('read-only-command'),false);};
    stored();release();await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id,{compactTools:true}),v=>v.run?.status==='completed');stored();
    fs.appendFileSync(file,provider==='dsh'?zstdCompressSync(Buffer.from(JSON.stringify(completion)+'\n')):JSON.stringify(completion)+'\n');
    const ready=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id,{compactTools:true}),v=>!v.entries.find(e=>e.id===tool.id)?.detail?.live);
    const snapshotDetail=f.service.conversations.readEntry('workspace-one',chat.id,tool.id,tool.detail!.revision,source.sourceId);assert.equal(snapshotDetail.text,output);
    const ref=ready.entries.find(e=>e.id===tool.id)!;assert.equal(ref.text,'');assert.equal(f.service.conversations.readEntry('workspace-one',chat.id,tool.id,ref.detail!.revision).text,output);stored();db.close();await f.service.close();
    const cold=createAgentService(f.options);try{const entry=cold.conversations.read('workspace-one',chat.id,{compactTools:true}).entries.find(e=>e.id===tool.id)!;assert.equal(entry.text,'');assert.equal(cold.conversations.readEntry('workspace-one',chat.id,entry.id,entry.detail!.revision).text,output);}finally{await cold.close();}
    assert.equal(native.sends.length,1);
  }finally{release?.();await f.close();}
});

for (const kind of ['message', 'thinking'] as const) test(`native ${kind} streams persist every fragment and reload after concurrent writes and stop`, async t => {
  const native=fake('codex',{hold:true}),f=fixture([native.executor]);t.after(()=>f.close());
  await connected(f.service,'codex');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'codex','stream');
  await waitUntil(()=>native.sends.length,n=>n===1);
  await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='running');
  const repo=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));t.after(()=>repo.stopReadModels());
  repo.rebuildReadModel(chat.id);
  const original=ConversationRepository.prototype.readConversation;let loads=0;
  const spy=t.mock.method(ConversationRepository.prototype,'readConversation',function(this:ConversationRepository,...args:Parameters<typeof original>){loads++;return original.apply(this,args);});
  const textWrites=t.mock.method(ConversationEntryStore,'saveText');
  const emit=(text:string)=>native.sends[0].onEvent({type:'item',item:{id:'stream-answer',kind,role:'assistant',text,status:'running',executionId:'execution-1'}});
  for(let i=1;i<=20;i++){
    emit('字'.repeat(i));
    const view=f.service.conversations.read('workspace-one',chat.id);
    assert.equal(view.entries.at(-1)?.text,'字'.repeat(i),'each fragment is visible without a merge window');
  }
  assert.ok(loads<=2,`consecutive text must not reload the complete history (${loads} loads)`);spy.mock.restore();
  assert.equal(textWrites.mock.callCount(),19,'every subsequent fragment updates only its own persisted entry');textWrites.mock.restore();
  assert.equal(repo.readConversation(chat.id)!.view.entries.at(-1)?.text,'字'.repeat(20),'last fragment is durable');
  const seenThrough=f.service.conversations.read('workspace-one',chat.id).activity!.version;
  repo.markSeen('workspace-one',chat.id,seenThrough);emit('after seen');
  assert.equal(f.service.conversations.read('workspace-one',chat.id).activity!.seenThrough,seenThrough,'seen-only writes survive cache reuse at the same revision');
  native.sends[0].onEvent({type:'item',item:{id:'interleaved-tool',kind:'tool',role:'system',name:'read',text:'result',status:'completed',executionId:'execution-1'}});
  emit('after tool');assert.ok(repo.readConversation(chat.id)!.view.entries.some(e=>e.kind==='tool'&&e.text==='result'));
  const record=repo.readConversation(chat.id)!,prior=record.view.revision;
  record.view.title='external rename';record.view.revision=randomUUID();repo.saveConversation(record,prior);
  emit('after external write');
  assert.equal(f.service.conversations.read('workspace-one',chat.id).title,'external rename');
  // Race after the fast revision check: the rejected mutation must retry from storage.
  const save=ConversationRepository.prototype.saveConversation;let race=true;
  const conflict=t.mock.method(ConversationRepository.prototype,'saveConversation',function(this:ConversationRepository,...args:Parameters<typeof save>){
    if(race){race=false;const other=repo.readConversation(chat.id)!,previous=other.view.revision;other.view.title='racing rename';other.view.revision=randomUUID();save.call(repo,other,previous);}
    return save.apply(this,args);
  });
  emit('after race');conflict.mock.restore();
  const current=f.service.conversations.read('workspace-one',chat.id);
  assert.equal(current.title,'racing rename');assert.equal(current.entries.filter(e=>e.role==='assistant').at(-1)?.text,'after race');
  await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:current.revision,runId:current.run!.id,participantId:current.run!.participantId,generation:current.run!.generation});
  emit('late text after stop');
  assert.ok(!repo.readConversation(chat.id)!.view.entries.some(e=>e.text==='late text after stop'));
});

for (const provider of ['codex', 'dsh', 'qoder']) test(`${provider} preserves child provenance without admitting child input or handing off child reports as primary replies`, async () => {
  const native = fake(provider), other = fake('other'), open = native.executor.open;
  native.executor.open = async options => {
    const runtime = await open(options), original = runtime.send.bind(runtime);
    runtime.send = async input => {
      await original(input);
      const context = native.contexts.get(input.contextRef.id)!;
      const executionId = context.observation.executionRef!.id;
      const items: ExecutorItem[] = [
        {id:'child-input',kind:'message',role:'user',text:'internal child instruction',parentToolId:'delegate',executionId,status:'completed'},
        {id:'child-report',kind:'message',role:'assistant',text:'child report must not become primary',parentToolId:'delegate',executionId,status:'completed'},
        {id:'child-read',kind:'tool',role:'system',name:'Read',input:'{"file_path":"probe.txt"}',text:'child tool output',parentToolId:'delegate',executionId,status:'completed'},
      ];
      for (const item of items) {context.items.push(item);input.onEvent({type:'item',item});}
      // A replay with omitted ancestry must not erase the accurately observed source.
      input.onEvent({type:'item',item:{...items[1]!,parentToolId:undefined}});
    };
    return runtime;
  };
  const f = fixture([native.executor, other.executor]);
  try {
    await connected(f.service,provider);await connected(f.service,'other');
    const chat = await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,provider,'read a file');
    const done = await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    for (const text of ['internal child instruction','child report must not become primary','child tool output']) assert.equal(done.entries.find(entry=>entry.text===text)?.parentToolId,'delegate');
    const draft={expectedRevision:done.revision,connectionId:'other',text:'continue'};
    const preview=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
    assert.ok(!preview.handoff?.body.includes('internal child instruction'));
    assert.ok(!preview.handoff?.body.includes('child report must not become primary'));
    assert.ok(preview.handoff?.body.includes(`answer from ${provider}`));
    assert.equal(native.sends.length,1);assert.equal(other.sends.length,0);
    await f.service.close();
    const cold=createAgentService(f.options);
    try {
      const restored=cold.conversations.read('workspace-one',chat.id,{compactTools:true});
      assert.equal(restored.entries.find(entry=>entry.text==='child report must not become primary')?.parentToolId,'delegate');
      assert.equal(restored.entries.find(entry=>entry.text==='child tool output')?.parentToolId,'delegate');
    } finally {await cold.close();}
  } finally {await f.close();}
});

test('reasoning fragments persist as marked process entries beside the visible step text', async () => {
  const native = fake('dsh'), open = native.executor.open;
  native.executor.open = async options => {
    const runtime = await open(options), original = runtime.send.bind(runtime);
    runtime.send = async input => {
      await original(input);
      const context = native.contexts.get(input.contextRef.id)!;
      const executionId = context.observation.executionRef!.id;
      const items: ExecutorItem[] = [
        {id:'assistant:1:2:reasoning',kind:'message',role:'assistant',text:'内部推理',thinking:true,executionId,status:'completed'},
        {id:'assistant:1:2',kind:'message',role:'assistant',text:'可见说明',executionId,status:'completed'},
      ];
      for (const item of items) { context.items.push(item); input.onEvent({type:'item', item}); }
    };
    return runtime;
  };
  const f = fixture([native.executor]);
  try {
    await connected(f.service,'dsh');
    const chat = await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'dsh','开始');
    const done = await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    assert.deepEqual(done.entries.filter(entry=>entry.thinking===true).map(entry=>entry.text),['内部推理']);
    assert.equal(done.entries.find(entry=>entry.text==='内部推理')?.role,'assistant');
    assert.equal(done.entries.find(entry=>entry.text==='可见说明')?.thinking,undefined);
    assert.equal(done.entries.find(entry=>entry.text==='answer from dsh')?.thinking,undefined);
  } finally { await f.close(); }
});

test('late history from a settled child does not block a new authorized input as a foreign user change',async()=>{
  const native=fake('local'),f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','first request');
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    const context=[...native.contexts.values()][0]!;
    context.items.push({id:'late-child-user',kind:'message',role:'user',parentToolId:'delegate',text:'late internal child instruction',executionId:context.observation.executionRef!.id,status:'completed'});
    const next=send(f.service,chat.id,'local','new request');
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.id===next.run.id&&view.run?.status==='completed');
    assert.equal(native.sends.length,2);
    assert.equal(done.entries.find(entry=>entry.text==='late internal child instruction')?.parentToolId,'delegate');
  } finally {await f.close();}
});

test('a detailed model failure survives public reads, observation and a cold service restart without replay',async()=>{
  const diagnostic='DSH · 工具调用后：Devin · 工具结果接续 / 响应流：permission_denied: MCP configuration issue.';
  const native=fake('local',{toolInput:true,failure:diagnostic}),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
    send(f.service,created.id,'local','inspect');
    const failed=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),view=>view.run?.status==='failed');
    assert.equal(failed.run?.diagnostic,diagnostic);assert.ok(failed.entries.some(item=>item.text==='file content'));
    assert.equal((await f.service.conversations.observe('workspace-one',created.id)).run?.diagnostic,diagnostic);
    await f.service.close();const cold=createAgentService(f.options);
    try{const view=cold.conversations.read('workspace-one',created.id);assert.equal(view.run?.status,'failed');assert.equal(view.run?.diagnostic,diagnostic);assert.equal(native.sends.length,1);}finally{await cold.close();}
  }finally{await f.close();}
});

test('read-only discovery creates no profile and a non-CLI executor needs no vendor account files', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    assert.equal(f.service.connections.list().connections[0]!.status, 'disconnected');
    assert.deepEqual(f.service.conversations.list('workspace-one').conversations, []);
    assert.equal(fs.existsSync(f.options.dataRoot), false);
    const view = await f.service.conversations.create('workspace-one', {});
    assert.equal(view.cwd, fs.realpathSync(f.workspace)); assert.equal(native.sends.length, 0);
    assert.throws(() => f.service.connections.read('unregistered'), { code: 'agent_provider_unavailable' });
    assert.throws(() => f.service.conversations.read('another-workspace', view.id), { code: 'agent_conversation_missing' });
  } finally { await f.close(); }
});

test('one accepted request remains one native execution, stable user entries and replayed history deduplicate', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', { taskId: 'task-one' });
    const draft = { expectedRevision: created.revision, connectionId: 'local', text: 'same request' };
    const preview = f.service.conversations.prepareSend('workspace-one', created.id, draft);
    const input = { ...draft, previewToken: preview.token, clientRequestId: 'request-one' };
    f.service.conversations.send('workspace-one', created.id, input);
    const complete = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
    assert.equal(complete.entries.filter(item => item.role === 'user').length, 1);
    assert.equal(native.sends.length, 1);
    f.service.conversations.send('workspace-one', created.id, input); assert.equal(native.sends.length, 1);
    assert.throws(() => f.service.conversations.send('workspace-one', created.id, { ...input, text: 'different' }), { code: 'agent_request_conflict' });
    const observed = await f.service.conversations.observe('workspace-one', created.id);
    assert.equal(observed.entries.length, complete.entries.length);
  } finally { await f.close(); }
});

test('real image bytes and ownership are checked, source profile and credentials do not leak into executor environment', async () => {
  const native = fake('local', { images: true }); const f = fixture([native.executor]);
  try {
    const sharedCache = path.join(f.root, 'shared-npm-cache');
    fs.mkdirSync(sharedCache);
    const isolated = createAgentService({ ...f.options, environment: { PATH: '/usr/bin', HOME: f.root, npm_config_cache: sharedCache, HTTPS_PROXY: 'http://127.0.0.1:1234', OPENAI_API_KEY: 'secret', CODEX_HOME: '/outside', DSH_HOME: '/outside', QODER_CONFIG_DIR: '/outside', CODEX_DESKTOP_TOKEN: 'secret' } });
    try {
      await connected(isolated, 'local');
      const environment=native.opens.at(-1)!.environment!;
      assert.equal(environment.HOME,f.root);assert.equal(environment.HTTPS_PROXY,'http://127.0.0.1:1234');assert.equal(environment.PATH,'/usr/bin');
      assert.ok(environment.BUILDR_TOOLCHAIN_ROOT);assert.equal(fs.realpathSync(environment.npm_config_cache!),fs.realpathSync(sharedCache));
      for(const secret of ['OPENAI_API_KEY','CODEX_HOME','DSH_HOME','QODER_CONFIG_DIR','CODEX_DESKTOP_TOKEN'])assert.equal(environment[secret],undefined,secret+' must not leak');
      const created = await isolated.conversations.create('workspace-one', {});
      assert.throws(() => isolated.conversations.addAttachment('workspace-one', created.id, { expectedRevision: created.revision, mimeType: 'image/png', bytes: Buffer.from('not png') }), { code: 'agent_image_invalid' });
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
      const attached = isolated.conversations.addAttachment('workspace-one', created.id, { expectedRevision: created.revision, mimeType: 'image/png', bytes: png });
      assert.deepEqual(isolated.conversations.readAttachment('workspace-one', created.id, attached.id).bytes, png);
      const another = await isolated.conversations.create('workspace-one', {});
      assert.throws(() => isolated.conversations.readAttachment('workspace-one', another.id, attached.id), { code: 'agent_attachment_missing' });
    } finally { await isolated.close(); }
  } finally { await f.close(); }
});

test('newer private storage is preserved and no workspace database is created', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    const dir = path.join(f.options.dataRoot, 'agent-service'); fs.mkdirSync(dir, { recursive: true });
    const filename = path.join(dir, 'conversations.sqlite'); const db = new DatabaseSync(filename); db.exec('PRAGMA user_version=99'); db.close();
    const before = fs.readFileSync(filename);
    assert.throws(() => f.service.conversations.list('workspace-one'), { code: 'agent_storage_newer' });
    assert.deepEqual(fs.readFileSync(filename), before);
    assert.equal(fs.existsSync(path.join(f.workspace, '.buildr')), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('a conversation stream begins with the current snapshot and observes only later matching changes', async () => {
  const f = fixture([]);
  try {
    const created = await f.service.conversations.create('workspace-one', {});
    const another = await f.service.conversations.create('workspace-one', {});
    const before = await f.service.conversations.update('workspace-one', created.id, { expectedRevision: created.revision, title: 'before subscription' });
    const subscription = f.service.conversations.subscribe('workspace-one', created.id);
    const iterator = subscription.events[Symbol.asyncIterator]();
    try {
      const snapshot = (await iterator.next()).value!;
      assert.equal(snapshot.type, 'snapshot'); assert.equal(snapshot.revision, before.revision);
      assert.equal(snapshot.payload.conversation!.title, 'before subscription'); assert.equal(snapshot.generation, f.service.generation);
      await f.service.conversations.update('workspace-one', another.id, { expectedRevision: another.revision, title: 'unrelated change' });
      const after = await f.service.conversations.update('workspace-one', created.id, { expectedRevision: before.revision, title: 'after subscription' });
      const change = (await iterator.next()).value!;
      assert.equal(change.type, 'conversation'); assert.equal(change.conversationId, created.id);
      assert.equal(change.revision, after.revision); assert.equal(change.payload.conversation!.title, 'after subscription');
      assert.ok(change.cursor > snapshot.cursor); assert.equal(change.generation, snapshot.generation);
    } finally { subscription.close(); await iterator.return?.(); }
  } finally { await f.close(); }
});

test('temporary image expiry and capacity preserve every image referenced by a submitted message', async () => {
  const native = fake('local', { images: true }); let now = new Date('2026-10-23T00:00:00Z');
  const f = fixture([native.executor], { now: () => now });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    const upload = () => f.service.conversations.addAttachment('workspace-one', created.id, { expectedRevision: f.service.conversations.read('workspace-one', created.id).revision, mimeType: 'image/png', bytes: png });
    const retained = upload();
    const draft = { expectedRevision: retained.revision, connectionId: 'local', text: 'inspect this image', attachmentIds: [retained.id] };
    const preview = f.service.conversations.prepareSend('workspace-one', created.id, draft);
    f.service.conversations.send('workspace-one', created.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
    await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
    const temporary = upload(); now = new Date(now.getTime() + 25 * 60 * 60 * 1_000);
    upload();
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one', created.id, retained.id).bytes, png);
    assert.throws(() => f.service.conversations.readAttachment('workspace-one', created.id, temporary.id), { code: 'agent_attachment_missing' });
    assert.equal(fs.existsSync(path.join(f.options.dataRoot, 'agent-service', 'attachments', created.id, temporary.id)), false);
    for (let index = 1; index < 64; index++) upload();
    const before = f.service.conversations.read('workspace-one', created.id);
    assert.throws(upload, { code: 'agent_attachment_capacity', status: 413 });
    assert.equal(f.service.conversations.read('workspace-one', created.id).revision, before.revision);
    assert.equal(fs.readdirSync(path.join(f.options.dataRoot, 'agent-service', 'attachments', created.id)).length, 65, '64 temporary files plus the submitted image remain');
  } finally { await f.close(); }
});

test('a rejected persistence transaction dispatches no input and removes a newly written unreferenced image', async () => {
  const native = fake('local', { images: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    const before = f.service.conversations.read('workspace-one', created.id);
    const db = new DatabaseSync(path.join(f.options.dataRoot, 'agent-service/conversations.sqlite'));
    try { db.exec("CREATE TRIGGER reject_conversation_update BEFORE UPDATE ON conversations BEGIN SELECT RAISE(ABORT,'fixture-write-rejected'); END"); } finally { db.close(); }
    const draft = { expectedRevision: created.revision, connectionId: 'local', text: 'must not be delivered' };
    const preview = f.service.conversations.prepareSend('workspace-one', created.id, draft);
    assert.throws(() => f.service.conversations.send('workspace-one', created.id, { ...draft, previewToken: preview.token, clientRequestId: 'rejected-write' }), /fixture-write-rejected/);
    assert.equal(native.sends.length, 0); assert.equal(native.contexts.size, 0);
    assert.deepEqual(f.service.conversations.read('workspace-one', created.id), before);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
    assert.throws(() => f.service.conversations.addAttachment('workspace-one', created.id, { expectedRevision: created.revision, mimeType: 'image/png', bytes: png }), /fixture-write-rejected/);
    assert.deepEqual(fs.readdirSync(path.join(f.options.dataRoot, 'agent-service/attachments', created.id)), []);
    assert.deepEqual(f.service.conversations.read('workspace-one', created.id), before);
  } finally { await f.close(); }
});

test('expired image cleanup refuses a replaced attachment directory before deleting files outside its owned directory', async () => {
  const native = fake('local', { images: true }); let now = new Date('2026-10-23T00:00:00Z');
  const f = fixture([native.executor], { now: () => now });
  try {
    const created = await f.service.conversations.create('workspace-one', {});
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
    const attached = f.service.conversations.addAttachment('workspace-one', created.id, { expectedRevision: created.revision, mimeType: 'image/png', bytes: png });
    const directory = path.join(f.options.dataRoot, 'agent-service/attachments', created.id);
    const foreign = path.join(f.root, 'other-owner'); fs.mkdirSync(foreign); fs.writeFileSync(path.join(foreign, attached.id), 'foreign-owned-file');
    fs.renameSync(directory, `${directory}.retained`); fs.symlinkSync(foreign, directory, 'dir');
    now = new Date(now.getTime() + 25 * 60 * 60 * 1_000);
    assert.throws(() => f.service.conversations.addAttachment('workspace-one', created.id, { expectedRevision: attached.revision, mimeType: 'image/png', bytes: png }), { code: 'agent_attachment_unsafe' });
    assert.equal(fs.readFileSync(path.join(foreign, attached.id), 'utf8'), 'foreign-owned-file');
    assert.equal(f.service.conversations.read('workspace-one', created.id).revision, attached.revision);
  } finally { await f.close(); }
});

test('conversation task association can be set, replaced and cleared with the observed revision', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {});
    assert.equal(view.taskId, undefined);
    let current = await f.service.conversations.update('workspace-one', view.id, { expectedRevision: view.revision, taskId: 'task-one' });
    assert.equal(current.taskId, 'task-one');
    assert.equal(f.service.conversations.read('workspace-one', view.id).taskId, 'task-one');
    assert.equal(f.service.conversations.list('workspace-one', { taskId: 'task-one' }).conversations.length, 0, '任务关联不使空草稿进入列表');
    send(f.service, view.id, 'local', 'start associated work');
    current = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    assert.equal(f.service.conversations.list('workspace-one', { taskId: 'task-one' }).conversations[0]?.id, view.id);
    await assert.rejects(f.service.conversations.update('workspace-one', view.id, { expectedRevision: current.revision, taskId: 'task-two' }));
    assert.equal(f.service.conversations.read('workspace-one', view.id).taskId, 'task-one');
    current = await f.service.conversations.update('workspace-one', view.id, { expectedRevision: current.revision, taskId: null });
    assert.equal(current.taskId, undefined); assert.equal(f.service.conversations.list('workspace-one', { taskId: 'task-one' }).conversations.length, 0);
    await assert.rejects(f.service.conversations.update('workspace-one', view.id, { expectedRevision: view.revision, taskId: 'task-one' }), { code: 'agent_revision_conflict' });
  } finally { await f.close(); }
});

test('context usage stores the latest executor observation and ignores invalid counts', async () => {
  const native=fake('local',{hold:true});const f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
    await send(f.service,created.id,'local','usage observation');
    await waitUntil(()=>native.sends.length,value=>value===1);
    native.sends[0]!.onEvent({type:'context-usage',usedTokens:12000,windowTokens:500000});
    assert.deepEqual(f.service.conversations.read('workspace-one',created.id).run?.contextUsage,{usedTokens:12000,windowTokens:500000});
    native.sends[0]!.onEvent({type:'context-usage',usedTokens:-1});
    assert.equal(f.service.conversations.read('workspace-one',created.id).run?.contextUsage?.usedTokens,12000);
    native.sends[0]!.onEvent({type:'context-usage',usedRatio:0.25});
    assert.deepEqual(f.service.conversations.read('workspace-one',created.id).run?.contextUsage,{usedRatio:0.25});
    native.sends[0]!.onEvent({type:'context-usage',usedRatio:2});
    assert.deepEqual(f.service.conversations.read('workspace-one',created.id).run?.contextUsage,{usedRatio:0.25});
  } finally {await f.close();}
});

test('tool result updates preserve original invocation input and name across history reconciliation', async () => {
  const native=fake('local',{toolInput:true}),f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
    send(f.service,created.id,'local','read file');
    await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),view=>view.run?.status==='completed');
    const view=await f.service.conversations.observe('workspace-one',created.id);
    const tool=view.entries.find(entry=>entry.kind==='tool');
    assert.equal(tool?.name,'read');assert.equal(tool?.input,'{"file_path":"src/example.ts"}');assert.equal(tool?.text,'file content');
    assert.equal(view.entries.filter(entry=>entry.kind==='tool').length,1);
  } finally { await f.close(); }
});

test('a pinned database reader cannot block conversation event persistence',async()=>{
  const native=fake('local'),f=fixture([native.executor]);let reader:DatabaseSync|undefined;
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    reader=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'),{readOnly:true});
    reader.exec('BEGIN');reader.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id);
    const updated=await f.service.conversations.update('workspace-one',chat.id,{expectedRevision:chat.revision,title:'updated while native tool reads'});
    assert.equal(updated.title,'updated while native tool reads');
    const old=JSON.parse((reader.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id) as {body:string}).body);
    assert.equal(old.view.title,'新对话');reader.exec('ROLLBACK');reader.close();reader=undefined;
    assert.equal(f.service.conversations.read('workspace-one',chat.id).title,updated.title);
  }finally{reader?.close();await f.close();}
});

test('video keeps original bytes, timed visual inputs, history sources and referenced frames across expiry and restart', async () => {
  const native=fake('visual',{images:true}),reader=fake('reader');let now=new Date('2026-10-28T00:00:00Z');
  const f=fixture([native.executor,reader.executor],{now:()=>now});
  const png=Buffer.from('89504e470d0a1a0a','hex'),mp4=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
  try {
    await connected(f.service,'visual');await connected(f.service,'reader');
    const chat=await f.service.conversations.create('workspace-one',{});
    const upload=(mimeType:string,bytes:Buffer,video?:{duration:number;frames:Array<{id:string;time:number}>})=>f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:f.service.conversations.read('workspace-one',chat.id).revision,mimeType,bytes,video});
    const frames=Array.from({length:8},(_,i)=>({id:upload('image/png',png).id,time:i*2}));
    const video=upload('video/mp4',mp4,{duration:14.4,frames});
    const draft={expectedRevision:video.revision,connectionId:'visual',text:'inspect the recording',attachmentIds:[video.id]};
    const preview=f.service.conversations.prepareSend('workspace-one',chat.id,draft);assert.equal(preview.fits,true);
    f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:'video-input'});
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
    assert.deepEqual(native.sends[0].images.map(image=>image.id),frames.map(frame=>frame.id));
    assert.match(native.sends[0].text,/抽样画面，不含音轨/);assert.match(native.sends[0].text,/"time":14/);assert.ok(native.sends[0].text.includes(video.id));
    const original=f.service.conversations.read('workspace-one',chat.id).entries.find(entry=>entry.role==='user');assert.equal(original?.text,'inspect the recording');assert.deepEqual(original?.attachments,[video.id]);
    now=new Date(now.getTime()+25*60*60*1000);upload('image/png',png);
    for(const frame of frames)assert.deepEqual(f.service.conversations.readAttachment('workspace-one',chat.id,frame.id).bytes,png);
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one',chat.id,video.id).bytes,mp4);
    const current=f.service.conversations.read('workspace-one',chat.id),handoff=f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:current.revision,connectionId:'reader',text:'continue'});
    assert.equal(handoff.fits,true,'historical video never blocks a later text-only executor');
    const index=JSON.parse(fs.readFileSync(handoff.handoff!.sourcePath!,'utf8'));
    const source=index.images.find((image:any)=>image.id===video.id);assert.equal(source.mimeType,'video/mp4');assert.equal(source.video.frames.length,8);assert.ok(fs.existsSync(source.video.frames[0].path));
    await f.service.close();const cold=createAgentService(f.options);
    try{assert.deepEqual(cold.conversations.readAttachment('workspace-one',chat.id,video.id).bytes,mp4);assert.deepEqual(cold.conversations.readAttachment('workspace-one',chat.id,frames[0].id).bytes,png);}finally{await cold.close();}
  } finally {await f.close();}
});

test('video ownership, metadata, bytes, revision and visual capability reject incomplete input without dispatch',async()=>{
  const native=fake('text'),f=fixture([native.executor]);
  const png=Buffer.from('89504e470d0a1a0a','hex'),mp4=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
  try{
    await connected(f.service,'text');const chat=await f.service.conversations.create('workspace-one',{}),other=await f.service.conversations.create('workspace-one',{});
    const frame=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:chat.revision,mimeType:'image/png',bytes:png});
    const input={mimeType:'video/mp4',bytes:mp4,video:{duration:2,frames:[{id:frame.id,time:0}]}};
    assert.throws(()=>f.service.conversations.addAttachment('workspace-one',other.id,{...input,expectedRevision:other.revision}),{code:'agent_attachment_missing'});
    assert.throws(()=>f.service.conversations.addAttachment('workspace-one',chat.id,{...input,expectedRevision:chat.revision}),{code:'agent_revision_conflict'});
    const upload=(extra:Record<string,unknown>)=>f.service.conversations.addAttachment('workspace-one',chat.id,{...input,expectedRevision:f.service.conversations.read('workspace-one',chat.id).revision,...extra});
    assert.throws(()=>upload({bytes:Buffer.from('bad')}),{code:'agent_video_invalid'});
    assert.throws(()=>upload({bytes:Buffer.alloc(32*1024*1024+1)}),{code:'agent_video_invalid',status:413});
    assert.throws(()=>upload({video:{duration:2,frames:[]}}),{code:'agent_video_invalid'});
    assert.throws(()=>upload({video:{duration:2,frames:[{id:frame.id,time:3}]}}),{code:'agent_video_invalid'});
    const video=upload({});
    const preview=f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:video.revision,connectionId:'text',text:'',attachmentIds:[video.id]});
    assert.equal(preview.fits,false);assert.match(preview.diagnostic!,/无法接收这些图片/);assert.equal(native.sends.length,0);
  }finally{await f.close();}
});

test('draft images survive ownership changes and cold reads without creating a conversation', async () => {
  const f = fixture([]), id = randomUUID(), png = Buffer.from([137,80,78,71,13,10,26,10]);
  try {
    const empty = f.service.conversations.readDraft('@default', id);
    assert.deepEqual(empty.images, []); assert.equal(fs.existsSync(f.options.dataRoot), false);
    const added = f.service.conversations.addDraftImage('@default', id, { expectedRevision: empty.revision, name: 'image.png', mimeType: 'image/png', bytes: png });
    assert.equal(added.images.length, 1);
    assert.deepEqual(f.service.conversations.readDraft('workspace-one', id), added);
    assert.equal(new ConversationRepository(path.join(f.options.dataRoot, 'agent-service')).readConversation(id), undefined);
    assert.equal(fs.existsSync(path.join(f.options.dataRoot, 'agent-service/conversations.sqlite')), false);
    assert.throws(() => f.service.conversations.addDraftImage('@default', id, { expectedRevision: empty.revision, name: 'old.png', mimeType: 'image/png', bytes: png }), { code: 'agent_revision_conflict' });
    assert.throws(() => f.service.conversations.addDraftImage('@default', id, { expectedRevision: added.revision, name: 'bad.png', mimeType: 'image/png', bytes: Buffer.from('not an image') }), { code: 'agent_image_invalid' });
    assert.deepEqual(f.service.conversations.readDraftImage('@default', id, added.images[0]!.id).bytes, png);
    const foreign = 'scope:' + Buffer.from(JSON.stringify(['another-host', '@default'])).toString('base64url');
    assert.deepEqual(f.service.conversations.readDraft(foreign, id).images, []);
    await f.service.close(); const cold = createAgentService(f.options);
    try {
      assert.deepEqual(cold.conversations.readDraft('workspace-one', id), added);
      const removed = cold.conversations.removeDraftImage('@default', id, { expectedRevision: added.revision, attachmentId: added.images[0]!.id });
      assert.deepEqual(removed.images, []);
    } finally { await cold.close(); }
  } finally { await f.close(); }
});

test('first submission persists input and conversation together and is idempotent across restart', async () => {
  const native = fake('local', { images: true }), f = fixture([native.executor]), id = randomUUID();
  try {
    const staged = f.service.conversations.addDraftImage('@default', id, { expectedRevision: f.service.conversations.readDraft('@default', id).revision, name: 'one.png', mimeType: 'image/png', bytes: Buffer.from([137,80,78,71,13,10,26,10]) });
    const input = { connectionId: 'local', text: 'inspect this picture', attachmentIds: staged.images.map(image => image.id), clientRequestId: randomUUID(), expectedDraftRevision: staged.revision };
    await assert.rejects(f.service.conversations.startDraft('workspace-one', id, input), { code: 'agent_account_unavailable' });
    assert.deepEqual(f.service.conversations.readDraft('@default', id), staged);
    assert.equal(f.service.conversations.lookupDraft('workspace-one', id, input.clientRequestId).found, false);
    assert.deepEqual(f.service.conversations.list('workspace-one').conversations, []);
    await connected(f.service, 'local');
    const pending = f.service.conversations.startDraft('workspace-one', id, input);
    const repeatedStart = f.service.conversations.startDraft('workspace-one', id, input);
    assert.throws(() => f.service.conversations.lookupDraft('workspace-one', id, input.clientRequestId), { code: 'agent_first_send_result_unknown' });
    const [first, repeated] = await Promise.all([pending, repeatedStart]);
    assert.equal(first.conversation.id, repeated.conversation.id);
    assert.equal(first.conversation.entries.filter(entry => entry.role === 'user').length, 1);
    const accepted = await waitUntil(() => f.service.conversations.read('workspace-one', first.conversation.id), view => view.run?.status === 'completed');
    assert.equal(native.sends.length, 1); assert.equal(native.sends[0]!.images?.length, 1);
    assert.deepEqual(f.service.conversations.readDraft('@default', id).images, []);
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one', accepted.id, staged.images[0]!.id).bytes, Buffer.from([137,80,78,71,13,10,26,10]));
    assert.throws(() => f.service.conversations.startDraft('workspace-one', id, { ...input, text: 'different' }), { code: 'agent_request_conflict' });
    await f.service.close(); const cold = createAgentService(f.options);
    try {
      assert.equal(cold.conversations.lookupDraft('workspace-one', id, input.clientRequestId).conversation?.id, accepted.id);
      assert.equal((await cold.conversations.startDraft('workspace-one', id, input)).conversation.id, accepted.id);
      assert.equal(native.sends.length, 1);
    } finally { await cold.close(); }
  } finally { await f.close(); }
});

test('shared video draft keeps original and frames without creating a conversation, then transfers them once', async () => {
  const native=fake('local',{images:true}),f=fixture([native.executor]),id=randomUUID();
  const png=Buffer.from('89504e470d0a1a0a','hex'),mp4=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
  try {
    let staged=f.service.conversations.readDraft('@default',id);
    staged=f.service.conversations.addDraftImage('@default',id,{expectedRevision:staged.revision,name:'frame.png',mimeType:'image/png',bytes:png,frame:true});
    const frame=staged.images[0]!;
    assert.throws(()=>f.service.conversations.addDraftImage('@default',id,{expectedRevision:staged.revision,name:'broken.mp4',mimeType:'video/mp4',bytes:mp4,video:{duration:2,frames:[{id:randomUUID(),time:0}]}}),{code:'agent_video_invalid'});
    staged=f.service.conversations.addDraftImage('@default',id,{expectedRevision:staged.revision,name:'recording.mp4',mimeType:'video/mp4',bytes:mp4,video:{duration:2,frames:[{id:frame.id,time:0}]}});
    const video=staged.images.find(image=>image.video)!;
    assert.deepEqual(f.service.conversations.readDraft('workspace-one',id),staged);
    assert.deepEqual(f.service.conversations.readDraftImage('@default',id,video.id).bytes,mp4);
    assert.deepEqual(f.service.conversations.list('workspace-one').conversations,[]);
    assert.throws(()=>f.service.conversations.removeDraftImage('@default',id,{expectedRevision:staged.revision,attachmentId:frame.id}),{code:'agent_video_invalid'});
    const input={connectionId:'local',text:'inspect recording',attachmentIds:[video.id],expectedDraftRevision:staged.revision,clientRequestId:randomUUID()};
    await assert.rejects(f.service.conversations.startDraft('workspace-one',id,input),{code:'agent_account_unavailable'});
    assert.deepEqual(f.service.conversations.readDraft('@default',id),staged);
    await connected(f.service,'local');
    const accepted=await f.service.conversations.startDraft('workspace-one',id,input);
    await waitUntil(()=>f.service.conversations.read('workspace-one',accepted.conversation.id),view=>view.run?.status==='completed');
    assert.deepEqual(native.sends[0].images.map(image=>image.id),[frame.id]);assert.match(native.sends[0].text,/抽样画面，不含音轨/);
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one',accepted.conversation.id,video.id).bytes,mp4);
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one',accepted.conversation.id,frame.id).bytes,png);
    assert.deepEqual(f.service.conversations.readDraft('@default',id).images,[]);
    assert.equal((await f.service.conversations.startDraft('workspace-one',id,input)).conversation.id,accepted.conversation.id);assert.equal(native.sends.length,1);
    let removable=f.service.conversations.addDraftImage('@default',id,{expectedRevision:f.service.conversations.readDraft('@default',id).revision,name:'frame.png',mimeType:'image/png',bytes:png,frame:true});
    removable=f.service.conversations.addDraftImage('@default',id,{expectedRevision:removable.revision,name:'recording.mp4',mimeType:'video/mp4',bytes:mp4,video:{duration:2,frames:[{id:removable.images[0]!.id,time:0}]}});
    assert.deepEqual(f.service.conversations.removeDraftImage('@default',id,{expectedRevision:removable.revision,attachmentId:removable.images.find(image=>image.video)!.id}).images,[]);
  }finally{await f.close();}
});

test('child conversations freeze all prior rounds and never replay inherited messages as new work',async()=>{
  const native=fake(),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const parent=await f.service.conversations.create('workspace-one',{});
    for(const text of ['早期决定：一次只展开一个','第二轮：使用右上角浮窗']){send(f.service,parent.id,'local',text);await waitUntil(()=>f.service.conversations.read('workspace-one',parent.id),v=>v.run?.status==='completed');}
    const before=f.service.conversations.read('workspace-one',parent.id),calls=native.sends.length;
    const input={expectedRevision:before.revision,clientRequestId:randomUUID()};
    const child=await f.service.conversations.createChild('workspace-one',parent.id,input);
    assert.deepEqual(f.service.conversations.read('workspace-one',parent.id),before);
    assert.equal(native.sends.length,calls);assert.deepEqual(child.entries,[]);assert.deepEqual(child.participants,[]);assert.equal(child.run,undefined);
    assert.equal(child.cwd,before.cwd,'creation inherits only the starting work location');
    assert.equal(child.childOf?.throughSequence,before.entries.at(-1)!.sequence);
    assert.equal(f.service.conversations.listChildren('workspace-one',parent.id).conversations[0]?.id,child.id);
    send(f.service,parent.id,'local','创建后才出现的新消息');await waitUntil(()=>f.service.conversations.read('workspace-one',parent.id),v=>v.run?.status==='completed');
    const untouched=f.service.conversations.read('workspace-one',parent.id);
    const draft={expectedRevision:child.revision,connectionId:'local',text:'新建一个任务，使用独立工作树实现相关改动'};
    const preview=f.service.conversations.prepareSend('workspace-one',child.id,draft);
    assert.match(preview.handoff!.body,/早期决定：一次只展开一个/);assert.match(preview.handoff!.body,/第二轮：使用右上角浮窗/);
    assert.doesNotMatch(preview.handoff!.body,/创建后才出现的新消息/);assert.match(preview.handoff!.body,/不要继续或重复执行主对话任务/);
    assert.match(preview.handoff!.body,/后续任务.*本次用户要求及适用规则安排/);
    assert.match(preview.handoff!.body,/需要时使用已有能力新建任务.*工作树/);
    assert.doesNotMatch(preview.handoff!.body,/子对话不隔离实际文件/);
    f.service.conversations.send('workspace-one',child.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',child.id),v=>v.run?.status==='completed');
    assert.ok(native.sends.at(-1)!.text.includes('本次用户要求：\n'+draft.text),'the executor receives the new task/worktree instruction unchanged');
    assert.equal(done.entries.filter(e=>e.role==='user').length,1);assert.ok(done.entries[0]!.sequence>before.entries.at(-1)!.sequence);
    assert.notEqual(done.participants[0]?.contextId,before.participants[0]?.contextId);assert.deepEqual(f.service.conversations.read('workspace-one',parent.id),untouched);
    const second=f.service.conversations.prepareSend('workspace-one',child.id,{expectedRevision:done.revision,connectionId:'local',text:'继续解释'});
    assert.ok(!second.history.some(entry=>entry.text.includes('早期决定')),'same native participant already received inherited context');
    await f.service.close();const cold=createAgentService(f.options);
    try{assert.equal(cold.conversations.read('workspace-one',child.id).childOf?.conversationId,parent.id);assert.equal((await cold.conversations.createChild('workspace-one',parent.id,input)).id,child.id);assert.equal(native.sends.length,calls+2);}finally{await cold.close();}
  }finally{await f.close();}
});

test('child creation from a waiting parent preserves the parent control and treats questions as background',async()=>{
  const waiting=fake('parent',{question:true}),other=fake('child'),f=fixture([waiting.executor,other.executor]);
  try{
    for(const id of ['parent','child'])await connected(f.service,id);
    const parent=await f.service.conversations.create('workspace-one',{});send(f.service,parent.id,'parent','先确认范围');
    const before=await waitUntil(()=>f.service.conversations.read('workspace-one',parent.id),v=>v.run?.status==='waiting-question');
    const child=await f.service.conversations.createChild('workspace-one',parent.id,{expectedRevision:before.revision,clientRequestId:randomUUID()});
    assert.deepEqual(child.requests,[]);assert.equal(child.childOf?.state,'waiting-question');assert.deepEqual(waiting.replies,[]);
    const preview=f.service.conversations.prepareSend('workspace-one',child.id,{expectedRevision:child.revision,connectionId:'child',text:'解释这个范围问题'});
    assert.match(preview.handoff!.body,/具体范围/);assert.match(preview.handoff!.body,/waiting-question/);
    send(f.service,child.id,'child','解释，不做选择');await waitUntil(()=>f.service.conversations.read('workspace-one',child.id),v=>v.run?.status==='completed');
    assert.deepEqual(f.service.conversations.read('workspace-one',parent.id),before);assert.equal(waiting.replies.length,0);
  }finally{await f.close();}
});

test('child creation is idempotent under concurrency and rejects a changed source version',async()=>{
  const f=fixture([]);
  try{
    const parent=await f.service.conversations.create('workspace-one',{}),input={expectedRevision:parent.revision,clientRequestId:randomUUID()};
    const children=await Promise.all(Array.from({length:4},()=>f.service.conversations.createChild('workspace-one',parent.id,input)));
    assert.equal(new Set(children.map(row=>row.id)).size,1);assert.equal(f.service.conversations.listChildren('workspace-one',parent.id).conversations.length,1);
    assert.equal(f.service.conversations.list('workspace-one').conversations.length,1,'an unsent child is discoverable, not a discarded draft');
    const changed=await f.service.conversations.update('workspace-one',parent.id,{expectedRevision:parent.revision,title:'changed'});
    await assert.rejects(f.service.conversations.createChild('workspace-one',parent.id,{...input,expectedRevision:changed.revision}),{code:'agent_request_conflict'});
    await assert.rejects(f.service.conversations.createChild('workspace-one',parent.id,{...input,clientRequestId:randomUUID()}),{code:'agent_revision_conflict'});
    assert.equal((await f.service.conversations.createChild('workspace-one',parent.id,input)).id,children[0]!.id);
    assert.equal(f.service.conversations.read('workspace-one',children[0]!.id).childOf?.title,'新对话');
    assert.throws(()=>f.service.conversations.listChildren('foreign',parent.id),{code:'agent_conversation_missing'});
  }finally{await f.close();}
});

test('a child independently retains referenced video and frames but not unsent parent media',async()=>{
  let now=new Date('2026-10-29T10:00:00Z');const native=fake('local',{images:true}),f=fixture([native.executor],{now:()=>now});
  try{
    await connected(f.service,'local');const parent=await f.service.conversations.create('workspace-one',{});
    const png=Buffer.from('89504e470d0a1a0a','hex'),mp4=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
    const upload=(mimeType:string,bytes:Buffer,video?:any)=>f.service.conversations.addAttachment('workspace-one',parent.id,{expectedRevision:f.service.conversations.read('workspace-one',parent.id).revision,mimeType,bytes,video});
    const frame=upload('image/png',png),video=upload('video/mp4',mp4,{duration:1,frames:[{id:frame.id,time:0}]}),unsent=upload('image/png',png);
    let before=f.service.conversations.read('workspace-one',parent.id);const draft={expectedRevision:before.revision,connectionId:'local',text:'看这个视频',attachmentIds:[video.id]};
    const preview=f.service.conversations.prepareSend('workspace-one',parent.id,draft);f.service.conversations.send('workspace-one',parent.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
    before=await waitUntil(()=>f.service.conversations.read('workspace-one',parent.id),v=>v.run?.status==='completed');
    const child=await f.service.conversations.createChild('workspace-one',parent.id,{expectedRevision:before.revision,clientRequestId:randomUUID()});
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one',child.id,frame.id).bytes,png);
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one',child.id,video.id).bytes,mp4);
    assert.throws(()=>f.service.conversations.readAttachment('workspace-one',child.id,unsent.id),{code:'agent_attachment_missing'});
    const directory=path.join(f.options.dataRoot,'agent-service','attachments');
    assert.notEqual(fs.statSync(path.join(directory,parent.id,video.id)).ino,fs.statSync(path.join(directory,child.id,video.id)).ino);
    fs.unlinkSync(path.join(directory,parent.id,video.id));assert.deepEqual(f.service.conversations.readAttachment('workspace-one',child.id,video.id).bytes,mp4);
    now=new Date(now.getTime()+25*60*60*1000);
    f.service.conversations.addAttachment('workspace-one',child.id,{expectedRevision:child.revision,mimeType:'image/png',bytes:png});
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one',child.id,frame.id).bytes,png);
    const prepared=f.service.conversations.prepareSend('workspace-one',child.id,{expectedRevision:f.service.conversations.read('workspace-one',child.id).revision,connectionId:'local',text:'解释抽样限制'});
    assert.match(prepared.handoff!.body,/不含音轨/);
  }finally{await f.close();}
});

test('long inherited background keeps complete indexed sources and never silently narrows to the latest turn',async()=>{
  const native=fake(),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const parent=await f.service.conversations.create('workspace-one',{});
    const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service')),record=repository.readConversation(parent.id)!;
    record.view.entries=Array.from({length:8},(_,i)=>({id:randomUUID(),sequence:i+1,kind:'message',role:'user',text:`第${i}轮原始决定：`+'文'.repeat(16000),createdAt:'2026-10-29T00:00:00Z',runId:'round-'+i}));
    repository.saveConversation(record,parent.revision);
    const child=await f.service.conversations.createChild('workspace-one',parent.id,{expectedRevision:record.view.revision,clientRequestId:randomUUID()});
    const preview=f.service.conversations.prepareSend('workspace-one',child.id,{expectedRevision:child.revision,connectionId:'local',text:'只解释第一轮决定'});
    assert.equal(preview.handoff!.mode,'indexed');assert.equal(preview.fits,true);
    assert.match(preview.handoff!.body,/后续任务.*本次用户要求及适用规则安排/);
    const index=JSON.parse(fs.readFileSync(preview.handoff!.sourcePath!,'utf8'));assert.equal(index.rounds.length,8);
    const first=f.service.conversations.readHistory('workspace-one',child.id,{sourceId:path.basename(preview.handoff!.sourcePath!),roundId:index.rounds[0].id});assert.equal(first.unavailable.length,0);assert.equal(f.service.conversations.readEntry('workspace-one',child.id,first.entries[0].id,first.entries[0].detail!.revision).text,record.view.entries[0]!.text);
    assert.deepEqual(child.entries,[]);assert.equal(native.sends.length,0);
  }finally{await f.close();}
});

test('missing inherited media rejects only child creation and paginated relation reads retain all children',async()=>{
 const f=fixture([]);
 try{
  const parent=await f.service.conversations.create('workspace-one',{});
  for(let n=0;n<3;n++)await f.service.conversations.createChild('workspace-one',parent.id,{expectedRevision:parent.revision,clientRequestId:'page-'+n});
  const first=f.service.conversations.listChildren('workspace-one',parent.id,{limit:1});assert.equal(first.conversations.length,1);assert.ok(first.nextCursor);
  const second=f.service.conversations.listChildren('workspace-one',parent.id,{limit:1,cursor:first.nextCursor});assert.notEqual(first.conversations[0]!.id,second.conversations[0]!.id);
  const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service')),record=repository.readConversation(parent.id)!;
  record.view.entries.push({id:randomUUID(),sequence:1,kind:'message',role:'user',text:'附件必须可读',attachments:[randomUUID()],createdAt:new Date().toISOString()});
  repository.saveConversation(record,parent.revision);
  await assert.rejects(f.service.conversations.createChild('workspace-one',parent.id,{expectedRevision:record.view.revision,clientRequestId:'missing'}),{code:'agent_attachment_missing'});
  assert.equal(f.service.conversations.listChildren('workspace-one',parent.id).conversations.length,3);assert.equal(f.service.conversations.read('workspace-one',parent.id).revision,record.view.revision);
 }finally{await f.close();}
});

test('child discovery reflects current unread and seen activity without changing conversation revisions',async()=>{
  const native=fake('local'),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');
    const parent=await f.service.conversations.create('workspace-one',{});
    const child=await f.service.conversations.createChild('workspace-one',parent.id,{expectedRevision:parent.revision,clientRequestId:randomUUID()});
    send(f.service,child.id,'local','独立说明');
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',child.id),value=>value.run?.status==='completed');
    assert.ok(done.activity!.version>done.activity!.seenThrough);
    assert.deepEqual(f.service.conversations.listChildren('workspace-one',parent.id).conversations[0]!.activity,done.activity);
    f.service.conversations.markSeen('workspace-one',child.id,{through:done.activity!.version});
    const seen=f.service.conversations.read('workspace-one',child.id);
    assert.equal(seen.revision,done.revision);
    assert.equal(seen.activity!.seenThrough,seen.activity!.version);
    assert.deepEqual(f.service.conversations.listChildren('workspace-one',parent.id).conversations[0]!.activity,seen.activity);
    assert.deepEqual(f.service.conversations.list('workspace-one').conversations[0]!.activity,seen.activity);
    assert.equal(f.service.conversations.read('workspace-one',parent.id).revision,parent.revision);
  }finally{await f.close();}
});

test('service supplies its interaction policy through the public contract to any executor', async () => {
  const native = fake('another-executor'), f = fixture([native.executor]);
  try {
    await connected(f.service, 'another-executor');
    assert.ok(native.opens.length > 0);
    for (const opening of native.opens) assert.deepEqual(opening.interaction, interactionPolicy);
  } finally { await f.close(); }
});

test('many-to-many task associations persist, filter both directions and reject stale or invalid changes', async () => {
  const native = fake(), f = fixture([native.executor], {taskIds:['task-one','task-two']});
  try {
    await connected(f.service, 'local');
    const created = await f.service.conversations.create('workspace-one', {taskId:'task-one'});
    let current = await f.service.conversations.update('workspace-one', created.id, {expectedRevision:created.revision,taskIds:['task-one','task-two','task-one']});
    assert.deepEqual(current.taskIds,['task-one','task-two']);
    assert.equal(current.taskId,'task-one');
    send(f.service, current.id, 'local', 'work on shared result');
    current=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),value=>value.run?.status==='completed');
    for (const taskId of ['task-one','task-two']) assert.equal(f.service.conversations.list('workspace-one',{taskId}).conversations[0]?.id,created.id);
    assert.deepEqual(f.service.conversations.read('workspace-one',created.id).taskIds,['task-one','task-two']);
    await assert.rejects(f.service.conversations.update('workspace-one',created.id,{expectedRevision:current.revision,taskIds:['task-two','missing']}));
    assert.deepEqual(f.service.conversations.read('workspace-one',created.id).taskIds,['task-one','task-two']);
    const old=current;
    current=await f.service.conversations.update('workspace-one',created.id,{expectedRevision:current.revision,taskIds:['task-two']});
    await assert.rejects(f.service.conversations.update('workspace-one',created.id,{expectedRevision:old.revision,taskIds:[]}),{code:'agent_revision_conflict'});
    assert.equal(f.service.conversations.list('workspace-one',{taskId:'task-one'}).conversations.length,0);
    assert.equal(f.service.conversations.list('workspace-one',{taskId:'task-two'}).conversations.length,1);
    const another=await f.service.conversations.create('workspace-one',{taskId:'task-two'});
    send(f.service,another.id,'local','another task conversation');
    await waitUntil(()=>f.service.conversations.read('workspace-one',another.id),value=>value.run?.status==='completed');
    assert.equal(f.service.conversations.list('workspace-one',{taskId:'task-two'}).conversations.length,2);
    current=await f.service.conversations.update('workspace-one',created.id,{expectedRevision:current.revision,taskIds:[]});
    assert.equal(current.taskId,undefined);assert.deepEqual(current.taskIds,[]);
    assert.equal(f.service.conversations.list('workspace-one',{taskId:'task-two'}).conversations.length,1);
  } finally {await f.close();}
});

test('task link writes survive a save that lands during host verification',async()=>{
  const native=fake(),f=fixture([native.executor],{taskIds:['task-one','task-two']});
  try{
    await connected(f.service,'local');
    const created=await f.service.conversations.create('workspace-one',{taskId:'task-one'});
    const before=await f.service.conversations.read('workspace-one',created.id);
    const assertTask=f.options.assertTask!;let saved=false;
    // Streaming execution keeps saving the conversation while the task host
    // verifies the new link; the local link write must not be rejected by it.
    f.options.assertTask=async(id,taskId)=>{if(!saved){saved=true;await f.service.conversations.update('workspace-one',created.id,{expectedRevision:before.revision,title:'streaming progress'});}await assertTask(id,taskId);};
    const linked=await f.service.conversations.update('workspace-one',created.id,{expectedRevision:before.revision,taskIds:['task-one','task-two']});
    assert.deepEqual(linked.taskIds,['task-one','task-two']);
    const savedView=f.service.conversations.read('workspace-one',created.id);
    assert.deepEqual(savedView.taskIds,['task-one','task-two']);assert.equal(savedView.title,'streaming progress');
  }finally{await f.close();}
});

test('a concurrent task link change during verification still conflicts',async()=>{
  const native=fake(),f=fixture([native.executor],{taskIds:['task-one','task-two']});
  try{
    await connected(f.service,'local');
    const created=await f.service.conversations.create('workspace-one',{taskId:'task-one'});
    let injected=false;
    f.options.assertTask=async()=>{if(injected)return;injected=true;await f.service.conversations.update('workspace-one',created.id,{expectedRevision:created.revision,taskIds:['task-two']});};
    const current=await f.service.conversations.read('workspace-one',created.id);
    await assert.rejects(f.service.conversations.update('workspace-one',created.id,{expectedRevision:current.revision,taskIds:['task-one','task-two']}),{code:'agent_revision_conflict'});
    assert.deepEqual(f.service.conversations.read('workspace-one',created.id).taskIds,['task-two']);
  }finally{await f.close();}
});

test('cross-workspace task links keep composite identity, legacy writes and scoped reverse pagination',async()=>{
  const native=fake(),f=fixture([native.executor],{taskIds:['task-one','task-two']});
  try{
    await connected(f.service,'local');
    const created=await f.service.conversations.create('workspace-one',{taskId:'task-one'});
    send(f.service,created.id,'local','cross workspace links');
    let current=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),value=>value.run?.status==='completed');
    const runId=current.run?.id,cwd=current.cwd;
    const local={workspaceId:'workspace-one',taskId:'task-one'},remote={workspaceId:'workspace-two',taskId:'task-one'};
    current=await f.service.conversations.update('workspace-one',created.id,{expectedRevision:current.revision,taskLinks:[local,remote,remote]});
    assert.deepEqual(current.taskLinks,[local,remote]);assert.deepEqual(current.taskIds,['task-one']);
    assert.equal(current.cwd,cwd);assert.equal(current.run?.id,runId);
    assert.equal(f.service.conversations.list('workspace-two',{taskId:'task-one'}).conversations[0]?.id,created.id);
    assert.equal(f.service.conversations.list('workspace-two',{taskId:'task-one',workspaceIds:['workspace-two']}).conversations.length,0,'unavailable conversation scope excluded');
    assert.equal(f.service.conversations.list('workspace-two',{taskId:'task-one',workspaceIds:['workspace-one']}).conversations.length,1);
    const stale=current;
    current=await f.service.conversations.update('workspace-one',created.id,{expectedRevision:current.revision,taskIds:['task-two']});
    assert.deepEqual(current.taskLinks,[remote,{workspaceId:'workspace-one',taskId:'task-two'}]);
    assert.equal(f.service.conversations.list('workspace-one',{taskId:'task-one'}).conversations.length,0,'same ID in other workspace cannot match');
    await assert.rejects(f.service.conversations.update('workspace-one',created.id,{expectedRevision:stale.revision,taskLinks:[]}),{code:'agent_revision_conflict'});
    await assert.rejects(f.service.conversations.update('workspace-one',created.id,{expectedRevision:current.revision,taskLinks:[{workspaceId:'workspace-two',taskId:'missing'}]}));
    await assert.rejects(f.service.conversations.update('workspace-one',created.id,{expectedRevision:current.revision,taskLinks:[],taskIds:[]}),{code:'agent_input_invalid'});
    current=await f.service.conversations.update('workspace-one',created.id,{expectedRevision:current.revision,taskId:null});
    assert.deepEqual(current.taskLinks,[remote]);assert.deepEqual(current.taskIds,[]);assert.equal(current.taskId,undefined);
    current=await f.service.conversations.update('workspace-one',created.id,{expectedRevision:current.revision,taskLinks:[]});
    assert.equal(f.service.conversations.list('workspace-two',{taskId:'task-one'}).conversations.length,0);
  }finally{await f.close();}
});

test('archived run preserves context usage and generation after a new turn replaces it', async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 const native=fake('local',{beforeAccepted:gate}),f=fixture([native.executor]);
 try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'local','first usage');await waitUntil(()=>native.sends.length,n=>n===1);
  native.sends[0]!.onEvent({type:'context-usage',usedTokens:1234,windowTokens:50000});release();
  const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
  send(f.service,chat.id,'local','next turn');await waitUntil(()=>native.sends.length,n=>n===2);
  const db=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'));
  try{
   const row=db.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id) as {body:string};
   const record=JSON.parse(row.body);assert.deepEqual(record.runOutcomes[done.run!.id].contextUsage,{usedTokens:1234,windowTokens:50000});
   assert.equal(record.runOutcomes[done.run!.id].generation,done.run!.generation);
  }finally{db.close();}
 }finally{release();await f.close();}
});

test('direct ordinary sends preserve identity, capacity and revision checks without preparing history files',async()=>{
 const a=fake('a'),f=fixture([a.executor]);
 try{
  await connected(f.service,'a');const chat=await f.service.conversations.create('workspace-one',{});
  const first={expectedRevision:chat.revision,connectionId:'a',text:'first',clientRequestId:'direct-first'};
  const accepted=f.service.conversations.send('workspace-one',chat.id,first);
  const repeat=f.service.conversations.send('workspace-one',chat.id,first);
  assert.equal(repeat.run.id,accepted.run.id);
  let done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const materialRoot=path.join(f.options.dataRoot,'agent-service','handoff-materials',chat.id);
  const before=fs.existsSync(materialRoot)?fs.readdirSync(materialRoot):[];
  assert.throws(()=>f.service.conversations.send('workspace-one',chat.id,{...first,clientRequestId:'stale-direct'}),{code:'agent_revision_conflict'});
  assert.throws(()=>f.service.conversations.send('workspace-one',chat.id,{...first,expectedRevision:done.revision,text:'x'.repeat(200000),clientRequestId:'large-direct'}),{code:'agent_input_too_large'});
  f.service.conversations.send('workspace-one',chat.id,{expectedRevision:done.revision,connectionId:'a',text:'second',clientRequestId:'direct-second'});
  done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  assert.equal(a.contexts.size,1);assert.equal(a.sends.length,2);assert.equal(a.sends[1]!.text,'second');
  assert.deepEqual(fs.existsSync(materialRoot)?fs.readdirSync(materialRoot):[],before);
 }finally{await f.close();}
});

test('Codex live tool output reaches conversation SSE without persisting a body, then switches to native history', async () => {
  const native = fake('codex');
  const open = native.executor.open;
  let release!: () => void;
  let nativeFile = '';
  let finalRow: unknown;
  let nativeRows: unknown[] = [];
  const output = 'unique-native-live-output\n'.repeat(900);
  native.executor.open = async options => {
    const runtime = await open(options);
    const create = runtime.createContext.bind(runtime);
    runtime.createContext = async input => {
      const context = await create(input);
      return {...context,data:{native:opaqueReference('codex',context.id,input.cwd,runtime.bindingIdentity)}};
    };
    runtime.send = async input => {
      native.sends.push(input);
      const context = native.contexts.get(input.contextRef.id)!;
      const executionRef = {id:input.clientRequestId,data:{resourceContext:input.contextRef.id,resourceBinding:runtime.bindingIdentity}};
      context.observation = {status:'running',executionRef,tools:[{id:'native-live',label:'命令',status:'running'}]};
      input.onEvent({type:'accepted',executionRef});
      nativeFile = path.join(options.configRoot,'codex-home/sessions/2026/11/04','rollout-'+input.contextRef.id+'.jsonl');
      fs.mkdirSync(path.dirname(nativeFile),{recursive:true});
      nativeRows = [{type:'session_meta',payload:{id:input.contextRef.id,cwd:input.cwd}}];
      fs.writeFileSync(nativeFile,nativeRows.map(row=>JSON.stringify(row)+'\n').join(''));
      const tool = {type:'commandExecution',id:'native-live',command:'echo native',aggregatedOutput:output,status:'inProgress'};
      for(const item of codexItem(tool,executionRef.id,'inProgress')) input.onEvent({type:'item',item});
      await new Promise<void>(resolve=>{release=resolve;});
      for(const item of codexItem({...tool,status:'completed',exitCode:0},executionRef.id,'completed')) {
        input.onEvent({type:'item',item});context.items.push(item);
      }
      context.observation = {status:'idle',executionRef,tools:[]};
      finalRow = {type:'event_msg',payload:{type:'item_completed',turn_id:executionRef.id,item:{type:'CommandExecution',id:'native-live',command:tool.command,aggregated_output:output,exit_code:0,status:'completed'}}};
      input.onEvent({type:'completed',status:'completed'});
    };
    return runtime;
  };
  const other = fake('other');
  const f = fixture([native.executor,other.executor]);
  try {
    await connected(f.service,'codex');await connected(f.service,'other');
    const chat = await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'codex','run');
    const running = await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id,{compactTools:true}),view=>view.entries.some(e=>e.kind==='tool'&&e.status==='running'));
    const tool = running.entries.find(e=>e.kind==='tool')!;
    assert.ok(tool.text.includes('unique-native-live-output'));
    const stream = f.service.conversations.subscribe('workspace-one',chat.id,{compactTools:true});
    const first = await stream.events[Symbol.asyncIterator]().next();
    assert.ok(first.value?.payload.conversation?.entries.find((e:ConversationEntry)=>e.id===tool.id)?.text.includes('unique-native-live-output'));
    const validate = new Ajv2020({strict:false}).compile(AGENT_OPERATION_SCHEMAS.event);
    assert.equal(validate(JSON.parse(JSON.stringify(first.value))),true,JSON.stringify(validate.errors));
    assert.equal(tool.detail?.live,true);
    stream.close();
    const db = new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'),{readOnly:true});
    const verifyStored = () => {
      const row = db.prepare('SELECT c.codec,c.body,c.content_revision,e.compact FROM conversation_entry_contents c JOIN conversation_read_entries e USING(conversation_id,content_revision) WHERE e.conversation_id=? AND e.id=?').get(chat.id,tool.id)!;
      assert.equal(row.codec,'native-tool');
      assert.equal(String(row.body).includes('unique-native-live-output'),false);
      assert.equal(String(row.body).includes('echo native'),false);
      assert.equal(String(row.compact).includes('echo native'),false);
      assert.equal(row.compact,null);
      const stored = JSON.parse(String(db.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id)!.body));
      assert.equal(stored.participationTools[tool.id].entryRevision,row.content_revision);
      assert.equal(String(db.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id)!.body).includes('unique-native-live-output'),false);
    };
    verifyStored();release();
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id,{compactTools:true}),view=>view.run?.status==='completed');
    verifyStored();
    const current = f.service.conversations.read('workspace-one',chat.id);
    f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:current.revision,connectionId:'other',text:'continue'});
    const handoff = path.join(f.options.dataRoot,'agent-service/handoff-materials',chat.id);
    for(const name of fs.readdirSync(handoff)) assert.equal(fs.readFileSync(path.join(handoff,name),'utf8').includes('unique-native-live-output'),false);
    assert.equal(other.sends.length,0);
    fs.appendFileSync(nativeFile,JSON.stringify(finalRow)+'\n');
    const published = await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id,{compactTools:true}),view=>Boolean(view.entries.find(e=>e.id===tool.id)?.detail)&&!view.entries.find(e=>e.id===tool.id)?.detail?.live);
    const pointer = published.entries.find(e=>e.id===tool.id)!;
    assert.equal(pointer.text,'');
    const before = fs.readFileSync(nativeFile);
    assert.equal(f.service.conversations.readEntry('workspace-one',chat.id,tool.id,pointer.detail!.revision).text,'echo native\n'+output);
    verifyStored();db.close();
    await f.service.close();
    const cold = createAgentService(f.options);
    try {
      const history = cold.conversations.read('workspace-one',chat.id,{compactTools:true});
      const entry = history.entries.find(e=>e.id===tool.id)!;
      assert.equal(entry.text,'');
      assert.equal(cold.conversations.readEntry('workspace-one',chat.id,entry.id,entry.detail!.revision).text,'echo native\n'+output);
    } finally {await cold.close();}
    assert.deepEqual(fs.readFileSync(nativeFile),before);
  } finally {release?.();await f.close();}
});

test('documents: first send restores nine named originals without requiring vision and rejects a tenth',async()=>{
 const native=fake('local'),f=fixture([native.executor]),id=randomUUID();
 try {
  await connected(f.service,'local');
  let staged=f.service.conversations.readDraft('@default',id);
  for(let i=0;i<9;i++)staged=f.service.conversations.addDraftImage('@default',id,{expectedRevision:staged.revision,name:`说明${i}.md`,mimeType:'text/markdown',bytes:Buffer.from(`# 内容 ${i}`)});
  assert.equal(staged.images.length,9);
  assert.throws(()=>f.service.conversations.addDraftImage('@default',id,{expectedRevision:staged.revision,name:'第十份.md',mimeType:'text/markdown',bytes:Buffer.from('extra')}),{code:'agent_attachment_capacity'});
  const input={connectionId:'local',text:'读取这些文档',attachmentIds:staged.images.map(image=>image.id),clientRequestId:randomUUID(),expectedDraftRevision:staged.revision};
  const first=await f.service.conversations.startDraft('workspace-one',id,input);
  await waitUntil(()=>f.service.conversations.read('workspace-one',first.conversation.id),view=>view.run?.status==='completed');
  assert.equal(native.sends.length,1);assert.equal(native.sends[0]!.images.length,0);
  assert.match(native.sends[0]!.text,/用户附加文档/);assert.match(native.sends[0]!.text,/说明8.md/);
  for(let i=0;i<9;i++){
   const read=f.service.conversations.readAttachment('workspace-one',first.conversation.id,staged.images[i]!.id);
   assert.equal(read.name,`说明${i}.md`);assert.equal(read.bytes.toString(),`# 内容 ${i}`);
  }
  assert.equal(f.service.conversations.readDraft('@default',id).images.length,0);
 }finally{await f.close();}
});

test('documents: existing conversation mixes PDF and images, retaining names and safe exact paths',async()=>{
 const native=fake('local',{images:true}),f=fixture([native.executor]);
 try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
  const upload=(name:string,mimeType:string,bytes:Buffer)=>f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:f.service.conversations.read('workspace-one',chat.id).revision,name,mimeType,bytes});
  assert.throws(()=>upload('../bad.pdf','application/pdf',Buffer.from('%PDF-1.7')),{code:'agent_attachment_invalid'});
  assert.throws(()=>upload('bad.pdf','application/pdf',Buffer.from('bad')),{code:'agent_document_invalid'});
  const doc=upload('合同.pdf','application/pdf',Buffer.from('%PDF-1.7\nexample'));
  const image=upload('截图.png','image/png',Buffer.from([137,80,78,71,13,10,26,10]));
  const before=f.service.conversations.read('workspace-one',chat.id);
  const input={expectedRevision:before.revision,connectionId:'local',text:'对照文档和截图',attachmentIds:[doc.id,image.id]};
  f.service.conversations.send('workspace-one',chat.id,{...input,clientRequestId:randomUUID()});
  await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
  assert.deepEqual(native.sends[0]!.images.map(image=>image.id),[image.id]);
  const docs=JSON.parse(native.sends[0]!.text.split('用户附加文档')[1]!.split('：\n')[1]!);
  assert.equal(docs[0].name,'合同.pdf');assert.equal(fs.readFileSync(docs[0].path).toString(),'%PDF-1.7\nexample');
  assert.equal(f.service.conversations.readAttachment('workspace-one',chat.id,doc.id).name,'合同.pdf');
 }finally{await f.close();}
});

test('canonical work objects deduplicate full identities and legacy updates preserve opaque relations', async()=>{
  const native=fake(),f=fixture([native.executor],{taskIds:['task-one','task-two']});
  try {
    const chat=await f.service.conversations.create('workspace-one',{});
    const object={sourceId:'local',scopeId:'workspace-one',kind:'work-item',id:'task-one'};
    let current=await f.service.conversations.update('workspace-one',chat.id,{expectedRevision:chat.revision,workObjectLinks:[object,object,{...object,scopeId:'workspace-two'}]});
    assert.equal(current.workObjectLinks?.length,2);
    assert.deepEqual(current.taskLinks,[{workspaceId:'workspace-one',taskId:'task-one'},{workspaceId:'workspace-two',taskId:'task-one'}]);
    assert.equal(current.workObjectLinks?.[0]?.revision,'task-one');
    const repo=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));
    try {
      const record=repo.readConversation(chat.id)!;
      const opaque={sourceId:'future-host',scopeId:'other',kind:'future-artifact',id:'task-one',revision:'future',snapshot:{title:'not authority'},unknownFutureSetting:{keep:true}};
      record.view.workObjectLinks!.push(opaque);
      const previous=record.view.revision;record.view.revision=randomUUID();repo.saveConversation(record,previous);
      current=await f.service.conversations.update('workspace-one',chat.id,{expectedRevision:record.view.revision,taskIds:['task-two']});
      assert.deepEqual(current.workObjectLinks?.find(link=>link.kind==='future-artifact'),opaque);
      assert.equal(current.workObjectLinks?.filter(link=>link.id==='task-one').length,2,'remote same-code task and opaque object survive');
      assert.deepEqual(current.taskIds,['task-two']);
      assert.equal(current.run,undefined);assert.equal(native.sends.length,0);
      await assert.rejects(f.service.conversations.update('workspace-one',chat.id,{expectedRevision:current.revision,workObjectLinks:[{...object,revision:'stale'}]}),{code:'agent_work_object_changed'});
      await assert.rejects(f.service.conversations.update('workspace-one',chat.id,{expectedRevision:current.revision,taskLinks:[],workObjectLinks:[]}),{code:'agent_input_invalid'});
      current=await f.service.conversations.update('workspace-one',chat.id,{expectedRevision:current.revision,taskLinks:[]});
      assert.deepEqual(current.workObjectLinks,[opaque]);
      assert.deepEqual(current.taskLinks,[]);
    } finally {repo.stopReadModels();}
  } finally {await f.close();}
});
