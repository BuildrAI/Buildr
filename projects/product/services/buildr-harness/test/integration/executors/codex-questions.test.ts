import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createAgentService } from '../../../src/application/agent-service.ts';
import { createCodexExecutor } from '../../../src/executors/codex/index.ts';
import type { ConversationView, PermissionMode } from '../../../src/contracts.ts';
import { interactionPolicy } from '../../../src/domain/interaction-policy.ts';

function replace(source: string, before: string, after: string) {
  assert.ok(source.includes(before), 'native fixture changed: '+before);
  return source.replace(before, after);
}
async function questionFixture(twoQuestions = false, blocking = true, autoResolveMs = 0) {
  let source = await readFile(new URL('./fixtures/codex-cli.mjs', import.meta.url), 'utf8');
  source = replace(source, 'state[t.id]=t;', 't.interaction={config:m.params.config,developerInstructions:m.params.developerInstructions};state[t.id]=t;');
  source = replace(source, "if(m.method==='thread/resume'||m.method==='thread/read'){", "if(m.method==='thread/resume'){state[m.params.threadId].interaction={config:m.params.config,developerInstructions:m.params.developerInstructions};save();}if(m.method==='thread/resume'||m.method==='thread/read'){");
  source = replace(source, "{id:'color',question:'颜色',options:[{label:'蓝'}]}", "{id:'color',question:'颜色',isOther:true,options:[{label:'蓝',description:'使用蓝色方案'},{label:'绿',description:'使用绿色方案'}]}");
  const emission = source.split('\n').find(line => line.startsWith("process.stdout.write(JSON.stringify({id:'request-'+id"))!;
  // Model the native collaborator's feature gate, rather than unconditionally exposing a question.
  const emitted = emission + (twoQuestions ? emission.replace("id:'request-'+id", "id:'second-'+id") : '') + (autoResolveMs > 0 ? `\nsetTimeout(()=>event('serverRequest/resolved',{threadId:p.threadId,requestId:'request-'+id}),${autoResolveMs});` : '');
  source = replace(source, emission, "if(state[p.threadId].interaction?.config?.features?.default_mode_request_user_input){"+emitted+'}');
  source = replace(source, "m.id?.startsWith('request-')", "/^(request|second)-/.test(String(m.id))");
  source = replace(source, "if(m.result.answers.color.answers[0]!=='蓝')throw Error('wrong answer');", 'state[active.threadId].lastAnswer=m.result.answers;save();');
  if (!blocking) source = source.replaceAll('questions:[{', 'isBlocking:false,autoResolutionMs:1,questions:[{');
  return source;
}
async function eventually(read: () => ConversationView, predicate: (view: ConversationView) => boolean, budget = 2000) {
  const deadline = Date.now()+budget;
  while (Date.now()<deadline) { const view=read(); if (predicate(view)) return view; await delay(5); }
  assert.fail('question state was not observed: '+JSON.stringify(read().run));
}
async function fixture(mode: PermissionMode, twoQuestions = false, blocking = true, autoResolveMs = 0) {
  const root = await mkdtemp(join(tmpdir(), 'buildr-codex-decisions-'));
  const executable=join(root,'codex.mjs');await writeFile(executable,await questionFixture(twoQuestions, blocking, autoResolveMs));
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
    // 输入框按新语义开启新轮，等待回答时不再作为原轮的补充投递。
    await assert.rejects(f.service.conversations.supplement('workspace',f.chat.id,{...f.control(),text:'补充说明，尚未决定。',clientRequestId:'supplement'}),{code:'agent_supplement_unavailable'});
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
  // 原生主动解除其中一个问题；旧触发依赖同轮补充，同轮补充已不属于新语义。
  const f=await fixture('full-access',true,true,800);
  try {
    const waiting=await eventually(f.read,v=>v.requests.length===2),cancelled=waiting.requests[0],retained=waiting.requests[1];
    const current=await eventually(f.read,v=>v.requests.length===1,6000);
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
    assert.ok(native[contextRef.id].interaction.developerInstructions.startsWith(interactionPolicy.instructions));
    await runtime.stop({contextRef,executionRef:events.find(e=>e.type==='accepted').executionRef});await sending;
  } finally {await runtime?.close();await rm(root,{recursive:true,force:true});}
});


test('Codex non-blocking metadata keeps the question while work runs and never auto-selects', async () => {
  const f = await fixture('default', false, false);
  try {
    const first = await eventually(f.read, v => v.requests.length === 1);
    assert.equal(first.requests[0].blocking, false);
    assert.equal(first.run!.status, 'running');
    await delay(20);
    const current = await f.service.conversations.observe('workspace', f.chat.id);
    assert.equal(current.requests.length, 1, 'running does not cancel the question');
    assert.equal(current.run!.status, 'running');
    assert.equal(current.entries.some(e => e.id.startsWith('reply-')), false, 'native timeout hint is not user consent');
    await f.service.conversations.reply('workspace', f.chat.id, current.requests[0].id, { ...f.control(), answer: { color: '绿' } });
    await eventually(f.read, v => v.requests.length === 0);
    await f.service.conversations.stop('workspace', f.chat.id, f.control());
  } finally { await f.close(); }
});
