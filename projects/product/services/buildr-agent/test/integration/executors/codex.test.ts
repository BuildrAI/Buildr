import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createAgentService } from '../../../build/index.js';
import { createCodexExecutor } from '../../../build/executors/codex/index.js';
import type { ExecutorEvent, AgentRuntime, ContextRef, ExecutionRef } from '../../../src/contracts.ts';

const source = readFileSync(new URL('./fixtures/codex-cli.mjs', import.meta.url), 'utf8');
async function eventually(condition: () => unknown, timeout = 1000) { const until = Date.now() + timeout; while (!condition()) { if (Date.now() > until) throw new Error('condition timeout'); await new Promise(resolve => setTimeout(resolve, 5)); } }
test('Codex supplementary text and local images bind to the exact active turn and client input identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-codex-supplement-')); let runtime: AgentRuntime | undefined;
  try {
    const executable = join(root,'codex.mjs'); await writeFile(executable, source);
    const imagePath=join(root,'image.png');await writeFile(imagePath,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=','base64'));
    runtime = await createCodexExecutor().open({connectionId:'codex',configRoot:root,executable,environment:{PATH:process.env.PATH??''}});
    const contextRef=await runtime.createContext({cwd:root}),events:ExecutorEvent[]=[];
    const sending=runtime.send({contextRef,cwd:root,text:'initial',images:[],clientRequestId:'initial-request',onEvent:event=>events.push(event)});
    sending.catch(()=>{});
    await eventually(()=>events.some(event=>event.type==='request'));
    const accepted=events.find(event=>event.type==='accepted');assert.equal(accepted?.type,'accepted');
    const receipt=await runtime.supplement!({contextRef,executionRef:accepted.executionRef,cwd:root,text:'extra',images:[{id:'image',path:imagePath,mimeType:'image/png'}],clientRequestId:'extra-request'});
    assert.equal(receipt.executionRef.id,accepted.executionRef.id);assert.equal(receipt.inputItemId,'extra-request');
    await eventually(()=>events.some(event=>event.type==='item'&&event.item.id==='native-extra-request'));
    const extra=events.find(event=>event.type==='item'&&event.item.id==='native-extra-request');assert.equal(extra?.type,'item');assert.equal(extra.item.clientRequestId,'extra-request');
    const history=await runtime.readHistory({contextRef,cwd:root});assert.deepEqual(history.filter(item=>item.role==='user').map(item=>[item.id,item.clientRequestId]),[['initial-request',undefined],['native-extra-request','extra-request']]);
    const state=JSON.parse(await readFile(join(root,'codex-home/state.json'),'utf8'));assert.equal(state[contextRef.id].turns.length,1);assert.ok(state[contextRef.id].turns[0].items[1].content.some((part:any)=>part.type==='localImage'&&part.path===imagePath));
    assert.equal((await runtime.observe({contextRef,executionRef:accepted.executionRef})).status,'waiting');
    await assert.rejects(runtime.supplement!({contextRef,executionRef:{id:'other'},cwd:root,text:'wrong',images:[],clientRequestId:'wrong'}),/stale/);
    await runtime.stop({contextRef,executionRef:accepted.executionRef});await sending;
    await runtime.close();runtime=await createCodexExecutor().open({connectionId:'codex',configRoot:root,executable,environment:{PATH:process.env.PATH??''}});
    await runtime.resumeContext({contextRef,cwd:root});
    assert.equal((await runtime.readHistory({contextRef,cwd:root})).find(item=>item.id==='native-extra-request')?.clientRequestId,'extra-request');
  } finally { await runtime?.close();await rm(root,{recursive:true,force:true}); }
});
test('Codex supplementary native identities repair legacy history and allow a new turn in the same conversation', async () => {
  const root=await mkdtemp(join(tmpdir(),'buildr-codex-supplement-resume-'));
  const options={dataRoot:join(root,'profile'),executors:[createCodexExecutor()],modelProviders:[],environment:{PATH:process.env.PATH??''},resolveWorkspace(){return {rootPath:root};}};
  let service:ReturnType<typeof createAgentService>|undefined;
  try {
    const executable=join(root,'codex.mjs');await writeFile(executable,source);
    service=createAgentService(options);
    await service.connections.connect('codex',{expectedRevision:service.connections.read('codex').revision,executable});
    const view=await service.conversations.create('workspace',{}),id=view.id;
    const send=(text:string,clientRequestId:string)=>{const draft={expectedRevision:service!.conversations.read('workspace',id).revision,connectionId:'codex',text};const preview=service!.conversations.prepareSend('workspace',id,draft);return service!.conversations.send('workspace',id,{...draft,previewToken:preview.token,clientRequestId});};
    send('initial','initial-request');
    await eventually(()=>service!.conversations.read('workspace',id).run?.status==='waiting-question');
    const run=service.conversations.read('workspace',id).run!;
    // Identical content must still match the two explicit client identities.
    for(const clientRequestId of ['extra-one','extra-two']){
      assert.equal((await service.conversations.supplement('workspace',id,{runId:run.id,participantId:run.participantId,generation:run.generation,text:'same text',clientRequestId})).delivery,'accepted');
    }
    assert.equal(service.conversations.read('workspace',id).run?.status,'waiting-question');
    await service.conversations.stop('workspace',id,{expectedRevision:service.conversations.read('workspace',id).revision,runId:run.id,participantId:run.participantId,generation:run.generation});
    await service.close();service=undefined;
    // The old adapter saved the client id as the native id and never indexed
    // the native supplementary item. Recreate that existing persisted shape.
    const db=new DatabaseSync(join(options.dataRoot,'agent-service/conversations.sqlite'));
    let contextId:string;
    try {
      const row=db.prepare('SELECT body FROM conversations WHERE id=?').get(id) as {body:string};const record=JSON.parse(row.body);contextId=record.participants[0].contextRef.id;
      for(const attempt of record.attempts.filter((a:any)=>a.supplement)){delete record.sources[`${attempt.participantId}:message:${attempt.nativeInputItemId}`];attempt.nativeInputItemId=attempt.clientRequestId;record.sources[`${attempt.participantId}:message:${attempt.clientRequestId}`]=attempt.userEntryId;}
      db.prepare('UPDATE conversations SET body=? WHERE id=?').run(JSON.stringify(record),id);
    } finally {db.close();}
    service=createAgentService(options);
    await service.conversations.observe('workspace',id);
    assert.deepEqual(service.conversations.read('workspace',id).entries.filter(entry=>entry.role==='user').map(entry=>[entry.text,entry.status]),[['initial','accepted'],['same text','accepted'],['same text','accepted']]);
    send('next instruction','next-request');
    await eventually(()=>service!.conversations.read('workspace',id).run?.status==='waiting-question');
    const state=JSON.parse(await readFile(join(options.dataRoot,'agent-service/connections/codex/codex-home/state.json'),'utf8'));
    assert.deepEqual(Object.values(state).filter((thread:any)=>thread.turns.some((turn:any)=>turn.items.some((item:any)=>item.id==='next-request'))).map((thread:any)=>thread.id),[contextId!]);assert.equal(state[contextId!].turns.length,2);
    assert.deepEqual(state[contextId!].turns[0].items.filter((item:any)=>item.type==='userMessage').map((item:any)=>item.id),['initial-request','native-extra-one','native-extra-two']);
    const next=service.conversations.read('workspace',id).run!;await service.conversations.stop('workspace',id,{expectedRevision:service.conversations.read('workspace',id).revision,runId:next.id,participantId:next.participantId,generation:next.generation});
  } finally {await service?.close();await rm(root,{recursive:true,force:true});}
});
test('Codex retains a safe native failure after tools in completion and observation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-codex-error-')); let runtime: AgentRuntime | undefined;
  try {
    const executable = join(root,'codex.mjs');
    const original = "event('item/started',{threadId:active.threadId,turnId:active.id,item});";
    assert.ok(source.includes(original));
    await writeFile(executable,source.replace(original,original+"item.status='completed';event('item/completed',{threadId:active.threadId,turnId:active.id,item});active.status='failed';active.error={message:'Devin · 工具结果接续 / 响应流：permission_denied: MCP configuration issue. Authorization: Bearer native-secret'};save();event('turn/completed',{threadId:active.threadId,turn:active});"));
    runtime = await createCodexExecutor().open({connectionId:'codex',configRoot:root,executable,environment:{PATH:process.env.PATH??''}});
    const contextRef = await runtime.createContext({cwd:root}), events: ExecutorEvent[]=[];
    const sending=runtime.send({contextRef,cwd:root,text:'inspect',images:[],clientRequestId:'error-turn',onEvent:event=>events.push(event)});
    await eventually(()=>events.some(event=>event.type==='request'));
    const accepted=events.find(event=>event.type==='accepted'), request=events.find(event=>event.type==='request');
    assert.equal(accepted?.type,'accepted');assert.equal(request?.type,'request');
    await runtime.reply({contextRef,executionRef:accepted.executionRef,requestId:request.request.id,answer:{color:'蓝'}});await sending;
    const completed=events.find(event=>event.type==='completed');assert.equal(completed?.type,'completed');assert.equal(completed.status,'failed');
    assert.match(completed.diagnostic!,/工具调用后.*permission_denied.*MCP configuration issue/);assert.ok(!completed.diagnostic!.includes('native-secret'));
    assert.equal((await runtime.observe({contextRef,executionRef:accepted.executionRef})).diagnostic,completed.diagnostic);
    assert.ok(events.some(event=>event.type==='item'&&event.item.text==='你好'));
  } finally {await runtime?.close();await rm(root,{recursive:true,force:true});}
});
test('Codex native adapter preserves exact context, streams, answers and stops only its native terminal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-executor-codex-')); const workspace = join(root, 'workspace'); await mkdir(workspace);
  const executable = join(root, 'codex.mjs'); await writeFile(executable, source); const configRoot = join(root, 'connection');
  const options = { connectionId: 'codex', configRoot, executable, environment: { PATH: process.env.PATH ?? '', OPENAI_API_KEY: 'must-not-inherit', CODEX_APP_SERVER_TOKEN: 'must-not-inherit' } };
  let runtime: AgentRuntime | undefined; let reference: ContextRef;
  try {
    runtime = await createCodexExecutor().open(options); assert.equal((await runtime.inspectAccount()).status, 'ready'); assert.equal((await runtime.models())[0].id, 'fixture-model');
    reference = await runtime.createContext({ cwd: workspace }); const events: ExecutorEvent[] = [];
    const image = join(root, 'fixture.png'); await writeFile(image, Buffer.from('89504e470d0a1a0a', 'hex'));
    const sending = runtime.send({ contextRef: reference, cwd: workspace, text: '读取图片后执行', images: [{ id: 'image', path: image, mimeType: 'image/png' }], clientRequestId: 'client-1', onEvent: event => events.push(event) });
    await eventually(() => events.find(event => event.type === 'request'));
    const accepted = events.find(event => event.type === 'accepted'); assert.equal(accepted?.type, 'accepted'); const executionRef = (accepted as { executionRef: ExecutionRef }).executionRef;
    assert.equal(events[0].type, 'accepted'); assert.ok(events.some(event => event.type === 'item' && event.item.text === '你好'));
    const request = events.find(event => event.type === 'request'); assert.equal(request?.type, 'request');
    await assert.rejects(runtime.reply({ contextRef: reference, executionRef: { id: 'wrong' }, requestId: request.request.id, answer: { color: '蓝' } }), /stale/);
    await runtime.reply({ contextRef: reference, executionRef, requestId: request.request.id, answer: { color: '蓝' } });
    await eventually(() => events.some(event => event.type === 'item' && event.item.kind === 'tool'));
    await runtime.stop({ contextRef: reference, executionRef }); await sending;
    await eventually(() => events.some(event => event.type === 'item' && event.item.kind === 'tool' && event.item.status === 'completed'));
    assert.equal((await runtime.observe({ contextRef: reference, executionRef })).status, 'stopped');
    assert.ok(events.some(event => event.type === 'item' && event.item.name === 'command' && event.item.input === 'synthetic command'));
    assert.deepEqual(events.find(event=>event.type==='context-usage'),{type:'context-usage',usedTokens:12000,windowTokens:500000});
    const nativeState = JSON.parse(await readFile(join(configRoot, 'codex-home/state.json'), 'utf8')); assert.equal(nativeState[reference.id].turns[0].items[0].content[1].type, 'localImage');
    const binding = runtime.bindingIdentity; await runtime.close(); runtime = await createCodexExecutor().open(options); assert.equal(runtime.bindingIdentity, binding);
    await runtime.resumeContext({ contextRef: reference, cwd: workspace });
    const history = await runtime.readHistory({ contextRef: reference, cwd: workspace }); assert.ok(history.some(item => item.id === 'client-1' && item.executionId === 'turn-0'));
    assert.equal(history.find(item=>item.id==='command-turn-0')?.status,'completed','completed native tool stays completed inside an interrupted turn');
    await assert.rejects(runtime.resumeContext({ contextRef: reference, cwd: root }), /binding_mismatch/);
    const prior={identity:runtime.bindingIdentity,data:runtime.bindingData};await runtime.close();
    await writeFile(executable,source.replace('codex 0.163.0','codex 0.164.0-alpha.11.1'));
    runtime=await createCodexExecutor().open({...options,binding:prior});
    assert.equal(runtime.bindingIdentity,binding);assert.equal(runtime.bindingData?.observedVersion,'0.164.0-alpha.11.1');
    await runtime.resumeContext({contextRef:reference,cwd:workspace});
    assert.ok((await runtime.readHistory({contextRef:reference,cwd:workspace})).some(item=>item.id==='client-1'));
    await runtime.close();runtime=undefined;
    await writeFile(executable,source.replace('codex 0.163.0','codex 1.0.0'));
    await assert.rejects(createCodexExecutor().open({...options,binding:prior}),/version_unsupported/);
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});


test('closed Codex transport restores the exact interrupted execution from native history', async () => {
  const root=await mkdtemp(join(tmpdir(),'buildr-codex-transport-'));let runtime:AgentRuntime|undefined;
  try {
    const executable=join(root,'codex.mjs'),before="setTimeout(()=>{event('item/started'";
    assert.ok(source.includes(before));
    await writeFile(executable,source.replace(before,"setTimeout(()=>{active.status='interrupted';save();process.exit(0);event('item/started'"));
    const options={connectionId:'codex',configRoot:root,executable,environment:{PATH:process.env.PATH??''}};
    runtime=await createCodexExecutor().open(options);assert.equal(runtime.closed,false);
    const contextRef=await runtime.createContext({cwd:root}),events:ExecutorEvent[]=[];
    await assert.rejects(runtime.send({contextRef,cwd:root,text:'finish once',images:[],clientRequestId:'transport-loss',onEvent:event=>events.push(event)}),/codex_execution_observation_lost/);
    assert.equal(runtime.closed,true);
    const accepted=events.find(event=>event.type==='accepted');assert.equal(accepted?.type,'accepted');
    const binding=runtime.bindingIdentity;await runtime.close();
    runtime=await createCodexExecutor().open(options);assert.equal(runtime.closed,false);assert.equal(runtime.bindingIdentity,binding);
    await runtime.resumeContext({contextRef,cwd:root});
    const observation=await runtime.observe({contextRef,executionRef:accepted.executionRef});
    assert.equal(observation.status,'stopped');assert.equal(observation.executionRef?.id,accepted.executionRef.id);
    assert.equal((await runtime.readHistory({contextRef,cwd:root})).filter(item=>item.role==='user').length,1);
    await runtime.close();
    const statePath=join(root,'codex-home/state.json'),state=JSON.parse(await readFile(statePath,'utf8'));
    state[contextRef.id].turns[0].items.push({id:'unfinished',type:'commandExecution',command:'partially executed'});
    await writeFile(statePath,JSON.stringify(state));runtime=await createCodexExecutor().open(options);
    await runtime.resumeContext({contextRef,cwd:root});
    const uncertain=await runtime.observe({contextRef,executionRef:accepted.executionRef});
    assert.equal(uncertain.tools[0]?.status,'unknown');assert.equal(uncertain.tools[0]?.id,'unfinished');

  } finally {await runtime?.close();await rm(root,{recursive:true,force:true});}
});


test('a local event consumer failure preserves native work and later terminal observation',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-codex-consumer-'));let runtime:AgentRuntime|undefined;
  try{
    const executable=join(root,'codex.mjs');await writeFile(executable,source);
    runtime=await createCodexExecutor().open({connectionId:'codex',configRoot:root,executable,environment:{PATH:process.env.PATH??''}});
    const contextRef=await runtime.createContext({cwd:root}),events:ExecutorEvent[]=[];let failed=false;
    const sending=runtime.send({contextRef,cwd:root,text:'work once',images:[],clientRequestId:'local-consumer-failure',onEvent:event=>{
      if(!failed&&event.type==='item'&&event.item.role==='assistant'){failed=true;throw Error('private local write error');}
      events.push(event);
    }});
    await assert.rejects(sending,/codex_event_observation_lost/);assert.equal(runtime.closed,false);
    await eventually(()=>events.some(event=>event.type==='request'));
    const accepted=events.find(event=>event.type==='accepted'),request=events.find(event=>event.type==='request');assert.equal(accepted?.type,'accepted');assert.equal(request?.type,'request');
    await runtime.reply({contextRef,executionRef:accepted.executionRef,requestId:request.request.id,answer:{color:'蓝'}});
    await eventually(()=>events.some(event=>event.type==='item'&&event.item.kind==='tool'));
    await runtime.stop({contextRef,executionRef:accepted.executionRef});
    assert.equal(runtime.closed,false);
    assert.ok(events.some(event=>event.type==='observation'&&event.observation.status==='tools-active'));
    assert.equal((await runtime.observe({contextRef,executionRef:accepted.executionRef})).status,'stopped');
  }finally{await runtime?.close();await rm(root,{recursive:true,force:true});}
});


test('a terminal projection error cannot strand the native send promise',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-codex-terminal-projection-'));let runtime:AgentRuntime|undefined;
  try{
    const executable=join(root,'codex.mjs');await writeFile(executable,source);
    runtime=await createCodexExecutor().open({connectionId:'codex',configRoot:root,executable,environment:{PATH:process.env.PATH??''}});
    const contextRef=await runtime.createContext({cwd:root}),events:ExecutorEvent[]=[];
    const sending=runtime.send({contextRef,cwd:root,text:'finish once',images:[],clientRequestId:'terminal-consumer-failure',onEvent:event=>{
      events.push(event);if(event.type==='completed')throw Error('local terminal projection failed');
    }});
    await eventually(()=>events.some(event=>event.type==='request'));
    const accepted=events.find(event=>event.type==='accepted');assert.equal(accepted?.type,'accepted');
    await runtime.stop({contextRef,executionRef:accepted.executionRef});
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([sending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('send remained pending')),1000);})]);}finally{clearTimeout(timer);}
    assert.equal(runtime.closed,false);assert.equal((await runtime.observe({contextRef,executionRef:accepted.executionRef})).status,'stopped');
  }finally{await runtime?.close();await rm(root,{recursive:true,force:true});}
});
