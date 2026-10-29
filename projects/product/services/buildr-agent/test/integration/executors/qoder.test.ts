import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
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

for (const completed of [false, true]) test('Qoder fresh worker reconciles durable interrupted execution without replay; completed=' + completed, { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-cold-')), workspace = join(root, 'workspace'), configRoot = join(root, 'config');
  await mkdir(workspace); const executable = join(root, 'qoder.mjs'); await writeFile(executable, cli);
  const open = () => createQoderExecutor().open({ connectionId: 'qoder', configRoot, executable, environment: { PATH: process.env.PATH ?? '' } });
  let runtime: AgentRuntime | undefined;
  try {
    runtime = await open(); const contextRef = await runtime.createContext({ cwd: workspace }), requestId = '72c5b846-8bcf-4eb7-8ca2-682af42aca45';
    const dir = join(configRoot, 'qoder-config', 'projects', (await realpath(workspace)).replace(/[^a-zA-Z0-9]/g, '-')); await mkdir(dir, { recursive: true });
    const base = { sessionId: contextRef.id, cwd: workspace, isSidechain: false, timestamp: new Date().toISOString(), userType: 'external', entrypoint: 'cli', version: '1.1.75' };
    const records = [
      { ...base, type: 'user', uuid: requestId, parentUuid: null, origin: { kind: 'human' }, humanInput: { text: 'append once' }, promptId: 'prompt', message: { role: 'user', content: [{ type: 'text', text: 'append once' }] } },
      { ...base, type: 'assistant', uuid: 'assistant', parentUuid: requestId, message: { role: 'assistant', id: 'assistant', content: [{ type: 'tool_use', id: 'append', name: 'Bash', input: { command: 'append once' } }] } },
      ...(completed ? [{ ...base, type: 'user', uuid: 'tool-result', parentUuid: 'assistant', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'append', content: 'COMMITTED' }] } }] : []),
      { ...base, type: 'user', uuid: 'interruption', parentUuid: completed ? 'tool-result' : 'assistant', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
    ];
    await writeFile(join(dir, contextRef.id + '.jsonl'), records.map(record => JSON.stringify(record)).join('\n') + '\n');
    (runtime as any).rpc.child.kill('SIGKILL'); await eventually(() => runtime!.closed); await runtime.close();
    runtime = await open(); await runtime.resumeContext({ contextRef, cwd: workspace });
    const items = await runtime.readHistory({ contextRef, cwd: workspace });
    assert.deepEqual(items.filter(item => item.role === 'user').map(item => item.id), [requestId]);
    assert.equal(items.filter(item => item.kind === 'tool').length, 1);
    const observed = await runtime.observe({ contextRef, executionRef: { id: requestId } });
    assert.equal(observed.status, completed ? 'stopped' : 'unknown');
    assert.equal(observed.tools[0].status, completed ? 'completed' : 'unknown');
    assert.equal((await runtime.observe({ contextRef, executionRef: { id: 'unrelated' } })).status, 'unknown');
    assert.equal((await runtime.readHistory({ contextRef, cwd: workspace })).length, items.length);
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});

for (const completed of [false, true]) test('Qoder native child exit recovers only settled tools while the bridge remains alive; completed=' + completed, { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-native-exit-')), workspace = join(root, 'workspace'); await mkdir(workspace);
  const executable = join(root, 'qoder.mjs'); await writeFile(executable, cli); let runtime: AgentRuntime | undefined;
  try {
    runtime = await createQoderExecutor().open({ connectionId: 'qoder', configRoot: join(root, 'config'), executable, environment: { PATH: process.env.PATH ?? '' } });
    const contextRef = await runtime.createContext({ cwd: workspace }), events: ExecutorEvent[] = [], requestId = '923ba1de-b0e2-444a-b442-169ab8f219fc';
    await assert.rejects(runtime.send({ contextRef, cwd: workspace, text: 'native-crash:' + (completed ? 'completed' : 'active'), images: [], clientRequestId: requestId, onEvent: event => events.push(event) }), /qoder_execution_observation_lost/);
    assert.equal(runtime.closed, false); assert.ok(events.some(event => event.type === 'accepted'));
    const observed = await runtime.observe({ contextRef, executionRef: { id: requestId } });
    assert.equal(observed.status, completed ? 'stopped' : 'unknown'); assert.equal(observed.executionRef?.id, requestId);
    assert.equal(observed.tools[0].status, completed ? 'completed' : 'unknown');
    assert.equal((await runtime.observe({ contextRef, executionRef: { id: 'unrelated' } })).status, 'unknown');
    assert.equal(events.filter(event => event.type === 'item' && event.item.kind === 'tool' && event.item.status === 'running').length, 1);
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});
