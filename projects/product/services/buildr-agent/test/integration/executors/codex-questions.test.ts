import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createAgentService } from '../../../src/application/agent-service.ts';
import { createCodexExecutor } from '../../../src/executors/codex/index.ts';
import type { ConversationView, PermissionMode } from '../../../src/contracts.ts';

function replace(source: string, before: string, after: string) {
  assert.ok(source.includes(before), 'native fixture changed: '+before);
  return source.replace(before, after);
}
async function questionFixture(twoQuestions = false) {
  let source = await readFile(new URL('./fixtures/codex-cli.mjs', import.meta.url), 'utf8');
  source = replace(source, 'state[t.id]=t;', 't.interaction={config:m.params.config,developerInstructions:m.params.developerInstructions};state[t.id]=t;');
  source = replace(source, "if(m.method==='thread/resume'||m.method==='thread/read'){", "if(m.method==='thread/resume'){state[m.params.threadId].interaction={config:m.params.config,developerInstructions:m.params.developerInstructions};save();}if(m.method==='thread/resume'||m.method==='thread/read'){");
  source = replace(source, "{id:'color',question:'颜色',options:[{label:'蓝'}]}", "{id:'color',question:'颜色',isOther:true,options:[{label:'蓝',description:'使用蓝色方案'},{label:'绿',description:'使用绿色方案'}]}");
  const emission = source.split('\n').find(line => line.startsWith("process.stdout.write(JSON.stringify({id:'request-'+id"))!;
  // Model the native collaborator's feature gate, rather than unconditionally exposing a question.
  source = replace(source, emission, "if(state[p.threadId].interaction?.config?.features?.default_mode_request_user_input){"+emission+(twoQuestions ? emission.replace("id:'request-'+id", "id:'second-'+id") : '')+'}');
  source = replace(source, "m.id?.startsWith('request-')", "/^(request|second)-/.test(String(m.id))");
  source = replace(source, "if(m.result.answers.color.answers[0]!=='蓝')throw Error('wrong answer');", 'state[active.threadId].lastAnswer=m.result.answers;save();');
  source = replace(source, "const user={id:'native-'+p.clientUserMessageId", "if(p.input[0]?.text==='cancel-first'){event('serverRequest/resolved',{threadId:p.threadId,requestId:'request-'+active.id});event('serverRequest/resolved',{threadId:p.threadId,requestId:'unknown'});event('serverRequest/resolved',{threadId:'another-thread',requestId:'second-'+active.id});}const user={id:'native-'+p.clientUserMessageId");
  return source;
}
async function eventually(read: () => ConversationView, predicate: (view: ConversationView) => boolean) {
  const deadline = Date.now()+2000;
  while (Date.now()<deadline) { const view=read(); if (predicate(view)) return view; await delay(5); }
  assert.fail('question state was not observed: '+JSON.stringify(read().run));
}
async function fixture(mode: PermissionMode, twoQuestions = false) {
  const root = await mkdtemp(join(tmpdir(), 'buildr-codex-decisions-'));
  const executable=join(root,'codex.mjs');await writeFile(executable,await questionFixture(twoQuestions));
  const service=createAgentService({dataRoot:join(root,'profile'),executors:[createCodexExecutor()],modelProviders:[],environment:{PATH:process.env.PATH??''},resolveWorkspace:()=>({rootPath:root})});
  await service.connections.connect('codex',{expectedRevision:service.connections.read('codex').revision,executable});
  const chat=await service.conversations.create('workspace',{});
  const read=()=>service.conversations.read('workspace',chat.id);
  const input={expectedRevision:read().revision,connectionId:'codex',text:'请先让用户决定颜色，再继续。',permissionMode:mode};
  const preview=service.conversations.prepareSend('workspace',chat.id,input);
  await service.conversations.send('workspace',chat.id,{...input,previewToken:preview.token,clientRequestId:'decision-input'});
  const control=()=>{const v=read(),r=v.run!;return {expectedRevision:v.revision,runId:r.id,participantId:r.participantId,generation:r.generation};};
  return {service,root,chat,read,control,async close(){await service.close();await rm(root,{recursive:true,force:true});}};
}

for (const mode of ['default','full-access'] as const) test('Codex '+mode+' waits for a decision and continues only the original turn after an answer', async () => {
  const f=await fixture(mode);
  try {
    const waiting=await eventually(f.read,v=>v.run?.status==='waiting-question');
    assert.equal(waiting.requests.length,1);assert.equal(waiting.run!.permissionMode,mode);
    const question=waiting.requests[0];assert.equal(question.questions![0].allowOther,true);
    assert.equal(question.questions![0].options![0].description,'使用蓝色方案');
    assert.equal(f.read().requests[0].id,question.id,'reopening reads the same pending question');
    assert.equal(waiting.entries.some(e=>e.name==='command'),false,'dependent work has not started');
    await f.service.conversations.supplement('workspace',f.chat.id,{...f.control(),text:'补充说明，尚未决定。',clientRequestId:'supplement'});
    assert.equal(f.read().requests[0].id,question.id);assert.equal(f.read().run!.status,'waiting-question');
    assert.equal(f.read().entries.some(e=>e.name==='command'),false);
    await f.service.conversations.reply('workspace',f.chat.id,question.id,{...f.control(),answer:{color:'自定义颜色'}});
    const continued=await eventually(f.read,v=>v.entries.some(e=>e.name==='command'));
    assert.equal(continued.run!.id,waiting.run!.id);assert.equal(continued.requests.length,0);
    assert.ok(continued.entries.some(e=>e.id.startsWith('reply-')&&e.text.includes('自定义颜色')&&e.runId===waiting.run!.id));
    await assert.rejects(f.service.conversations.reply('workspace',f.chat.id,question.id,{...f.control(),answer:{color:'蓝'}}),/失效|变化/);
    const native=JSON.parse(await readFile(join(f.root,'profile/agent-service/connections/codex/codex-home/state.json'),'utf8'));
    const thread=Object.values(native)[0] as any;assert.equal(thread.turns.length,1);assert.deepEqual(thread.lastAnswer,{color:{answers:['自定义颜色']}});
    await f.service.conversations.stop('workspace',f.chat.id,f.control());
  } finally { await f.close(); }
});

test('Codex cancellation removes only the exact question and rejects its late answer',async()=>{
  const f=await fixture('full-access',true);
  try {
    const waiting=await eventually(f.read,v=>v.requests.length===2),cancelled=waiting.requests[0],retained=waiting.requests[1];
    await f.service.conversations.supplement('workspace',f.chat.id,{...f.control(),text:'cancel-first',clientRequestId:'cancel'});
    const current=await eventually(f.read,v=>v.requests.length===1);
    assert.equal(current.requests[0].id,retained.id);assert.equal(current.run!.status,'waiting-question');
    await assert.rejects(f.service.conversations.reply('workspace',f.chat.id,cancelled.id,{...f.control(),answer:{color:'蓝'}}),/失效|变化/);
    assert.equal(f.read().entries.some(e=>e.name==='command'),false);
    await f.service.conversations.reply('workspace',f.chat.id,retained.id,{...f.control(),answer:{color:'绿'}});
    await eventually(f.read,v=>v.entries.some(e=>e.name==='command'));
    await f.service.conversations.stop('workspace',f.chat.id,f.control());
  } finally {await f.close();}
});

test('stopping a pending Codex decision cannot execute dependent work or accept the old answer',async()=>{
  const f=await fixture('default');
  try {
    const waiting=await eventually(f.read,v=>v.requests.length===1),question=waiting.requests[0];
    await f.service.conversations.stop('workspace',f.chat.id,f.control());
    const stopped=await eventually(f.read,v=>v.run?.status==='stopped');
    assert.equal(stopped.requests.length,0);assert.equal(stopped.entries.some(e=>e.name==='command'),false);
    await assert.rejects(f.service.conversations.reply('workspace',f.chat.id,question.id,{...f.control(),answer:{color:'蓝'}}));
  } finally {await f.close();}
});

test('resuming a legacy Codex thread enables native questions without changing its identity',async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-codex-decision-resume-'));let runtime;
  try {
    const executable=join(root,'codex.mjs');await writeFile(executable,await questionFixture());
    const options={connectionId:'codex',configRoot:root,executable,environment:{PATH:process.env.PATH??''}};
    runtime=await createCodexExecutor().open(options);const contextRef=await runtime.createContext({cwd:root});await runtime.close();
    const file=join(root,'codex-home/state.json'),state=JSON.parse(await readFile(file,'utf8'));state[contextRef.id].interaction={config:{features:{default_mode_request_user_input:false}}};await writeFile(file,JSON.stringify(state));
    runtime=await createCodexExecutor().open(options);await runtime.resumeContext({contextRef,cwd:root});
    const events:any[]=[];const sending=runtime.send({contextRef,cwd:root,text:'choose',images:[],clientRequestId:'resumed',onEvent:e=>events.push(e)});sending.catch(()=>{});
    const deadline=Date.now()+1500;while(!events.some(e=>e.type==='request')&&Date.now()<deadline)await delay(5);
    assert.ok(events.some(e=>e.type==='request'));
    const native=JSON.parse(await readFile(file,'utf8'));assert.deepEqual(Object.keys(native),[contextRef.id]);assert.match(native[contextRef.id].interaction.developerInstructions,/request_user_input/);
    await runtime.stop({contextRef,executionRef:events.find(e=>e.type==='accepted').executionRef});await sending;
  } finally {await runtime?.close();await rm(root,{recursive:true,force:true});}
});
