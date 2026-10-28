import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQoderExecutor } from '../../../build/executors/qoder/index.js';
import type { ExecutorEvent, AgentRuntime } from '../../../src/contracts.ts';

const cli = readFileSync(new URL('./fixtures/qoder-cli.mjs', import.meta.url), 'utf8');
async function eventually(condition: () => unknown, timeout = 3000) { const end = Date.now() + timeout; while (!condition()) { if (Date.now() > end) throw new Error('condition timeout'); await new Promise(resolve => setTimeout(resolve, 10)); } }
test('Qoder SDK worker keeps control responsive and binds native input UUID while send waits', { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-executor-qoder-')); const workspace = join(root, 'workspace'); await mkdir(workspace);
  const imagePath = join(root, 'image.png'); await writeFile(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=', 'base64'));
  const executable = join(root, 'qoder.mjs'); await writeFile(executable, cli); let runtime: AgentRuntime | undefined;
  try {
    runtime = await createQoderExecutor().open({ connectionId: 'qoder', configRoot: join(root, 'config'), executable, environment: { PATH: process.env.PATH ?? '', QODER_PERSONAL_ACCESS_TOKEN: 'must-not-inherit' } });
    assert.equal((await runtime.inspectAccount()).status, 'ready');
    assert.equal(runtime.capabilities.images,true);
    const contextRef = await runtime.createContext({ cwd: workspace }); const events: ExecutorEvent[] = [];
    let failure: unknown; const sending = runtime.send({ contextRef, cwd: workspace, text: '继续处理', images: [{id:'image-fixture',path:imagePath,mimeType:'image/png'}], clientRequestId: '4d2b231e-3ddd-4e85-8b5c-6a18a623ac8d', onEvent: event => events.push(event) }); sending.catch(error => { failure = error; });
    await eventually(() => { if (failure) throw failure; return events.some(event => event.type === 'request'); });
    assert.ok(events.some(event=>event.type==='item'&&event.item.text==='图片已接收'));
    const accepted = events.find(event => event.type === 'accepted'); const request = events.find(event => event.type === 'request'); assert.equal(accepted?.type, 'accepted'); assert.equal(request?.type, 'request');
    assert.equal(accepted.inputItemId, '4d2b231e-3ddd-4e85-8b5c-6a18a623ac8d');
    const supplement = await runtime.supplement!({ contextRef, executionRef: accepted.executionRef, cwd: workspace, text: '', images: [{id:'more-image',path:imagePath,mimeType:'image/png'}], clientRequestId: '6ded507e-94e5-47cd-bb71-5dc40b30ba5a' });
    assert.equal(supplement.inputItemId, '6ded507e-94e5-47cd-bb71-5dc40b30ba5a');
    assert.equal(supplement.executionRef.id, accepted.executionRef.id);
    assert.ok(events.some(event => event.type === 'item' && event.item.clientRequestId === supplement.inputItemId));
    assert.equal((await runtime.observe({contextRef,executionRef:accepted.executionRef})).requests?.[0].id,request.request.id);
    await assert.rejects(runtime.supplement!({contextRef,executionRef:{id:'other'},cwd:workspace,text:'wrong execution',images:[],clientRequestId:'wrong'}), /rejected/);
    await runtime.reply({ contextRef, executionRef: accepted.executionRef, requestId: request.request.id, answer: { '0': '蓝' } });
    await eventually(() => events.some(event => event.type === 'item' && event.item.text.includes('已收到蓝色')));
    await runtime.stop({ contextRef, executionRef: accepted.executionRef }); await sending;
    assert.equal((await runtime.observe({ contextRef, executionRef: accepted.executionRef })).status, 'stopped');
    const assistantIds = events.filter(event => event.type === 'item' && event.item.role === 'assistant').map(event => event.type === 'item' ? event.item.id : '');
    assert.equal(new Set(assistantIds).size, 1);
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});

test('Qoder close releases an active SDK query while a question is unanswered', { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-executor-qoder-close-')); const workspace = join(root, 'workspace'); await mkdir(workspace);
  const executable = join(root, 'qoder.mjs'); await writeFile(executable, cli); let runtime: AgentRuntime | undefined;
  try {
    runtime = await createQoderExecutor().open({ connectionId: 'qoder', configRoot: join(root, 'config'), executable, environment: { PATH: process.env.PATH ?? '' } });
    const contextRef = await runtime.createContext({ cwd: workspace }); const events: ExecutorEvent[] = [];
    const sending = runtime.send({ contextRef, cwd: workspace, text: '等待用户', images: [], clientRequestId: 'c2d58b2e-a31a-4330-a7f9-1641fbb29d9f', onEvent: event => events.push(event) }); sending.catch(() => {});
    await eventually(() => events.some(event => event.type === 'request'));
    const start = Date.now(); await runtime.close(); runtime = undefined;
    await assert.rejects(sending, /qoder_|agent_/); assert.ok(Date.now() - start < 6000);
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});

test('Qoder local event failure keeps the exact worker and controls alive until the original turn stops', {timeout:15000}, async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-qoder-projection-')),workspace=join(root,'workspace');await mkdir(workspace);
  const executable=join(root,'qoder.mjs');await writeFile(executable,cli);let runtime:AgentRuntime|undefined;let failed=false;
  const events:ExecutorEvent[]=[];
  try{
    runtime=await createQoderExecutor().open({connectionId:'qoder',configRoot:join(root,'config'),executable,environment:{PATH:process.env.PATH??''}});
    const contextRef=await runtime.createContext({cwd:workspace});
    const sending=runtime.send({contextRef,cwd:workspace,text:'等待用户',images:[],clientRequestId:'b424efce-efb3-44d0-8053-93f2e0b978a5',onEvent:event=>{
      if(event.type==='request'&&!failed){failed=true;throw new Error('database is locked');}events.push(event);
    }});
    await assert.rejects(sending,/qoder_event_observation_lost/);
    const accepted=events.find(event=>event.type==='accepted');assert.equal(accepted?.type,'accepted');
    const observed=await runtime.observe({contextRef,executionRef:accepted.executionRef});
    assert.equal(runtime.closed,false);assert.equal(observed.executionRef?.id,accepted.executionRef.id);assert.equal(observed.status,'waiting');
    assert.equal(observed.requests?.length,1);
    await runtime.stop({contextRef,executionRef:accepted.executionRef});
    await eventually(()=>events.some(event=>event.type==='completed'&&event.status==='stopped'));
    assert.equal((await runtime.observe({contextRef,executionRef:accepted.executionRef})).status,'stopped');
  }finally{await runtime?.close();await rm(root,{recursive:true,force:true});}
});
test('Qoder reports a closed worker transport instead of retaining a reusable runtime', {timeout:15000}, async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-qoder-closed-')),workspace=join(root,'workspace');await mkdir(workspace);
  const executable=join(root,'qoder.mjs');await writeFile(executable,cli);let runtime:AgentRuntime|undefined;
  try{
    runtime=await createQoderExecutor().open({connectionId:'qoder',configRoot:join(root,'config'),executable,environment:{PATH:process.env.PATH??''}});
    assert.equal(runtime.closed,false);await runtime.close();assert.equal(runtime.closed,true);
  }finally{await runtime?.close();await rm(root,{recursive:true,force:true});}
});

for (const unavailable of [false,true]) test('Qoder repairs lost items before publishing terminal observation; history unavailable='+unavailable,{timeout:15000},async()=>{
  const root=await mkdtemp(join(tmpdir(),'buildr-qoder-terminal-repair-')),workspace=join(root,'workspace');await mkdir(workspace);
  const executable=join(root,'qoder.mjs');await writeFile(executable,cli);let runtime:AgentRuntime|undefined,failed=false,lostId="";
  const events:ExecutorEvent[]=[],requestId='ce70f3b5-244c-4485-bd68-16b51bdc0ada';
  try{
    runtime=await createQoderExecutor().open({connectionId:'qoder',configRoot:join(root,'config'),executable,environment:{PATH:process.env.PATH??''}});
    const contextRef=await runtime.createContext({cwd:workspace}),rpc=(runtime as any).rpc,call=rpc.call.bind(rpc);
    rpc.call=(method:string,args:any,...rest:any[])=>method==='history'?(unavailable?Promise.reject(Error('history unavailable')):Promise.resolve([{id:lostId,kind:'message',role:'assistant',text:'completed once',executionId:requestId,status:'completed'}])):call(method,args,...rest);
    const sending=runtime.send({contextRef,cwd:workspace,text:'等待用户',images:[],clientRequestId:requestId,onEvent:event=>{if(event.type==='item'&&!failed){failed=true;lostId=event.item.id;throw Error('record write failed');}events.push(event);}});
    await assert.rejects(sending,/qoder_event_observation_lost/);
    const accepted=events.find(e=>e.type==='accepted');assert.equal(accepted?.type,'accepted');
    await runtime.stop({contextRef,executionRef:accepted.executionRef});
    await eventually(()=>events.some(e=>e.type==='completed'));
    const observed=await runtime.observe({contextRef,executionRef:accepted.executionRef});
    if(unavailable){assert.equal(observed.status,'unknown');assert.ok(!events.some(e=>e.type==='observation'&&e.observation.status==='stopped'));}
    else{assert.equal(observed.status,'stopped');const repaired=events.findIndex(e=>e.type==='item'&&e.item.text==='completed once'),terminal=events.findIndex(e=>e.type==='observation'&&e.observation.status==='stopped');assert.ok(repaired>=0&&terminal>repaired);}
  }finally{await runtime?.close();await rm(root,{recursive:true,force:true});}
});
