import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DshRuntime } from '../../../build/executors/dsh/index.js';
import type { AgentRuntime, ExecutorEvent } from '../../../src/contracts.ts';

class Stream {
  private values: any[] = []; private waiting?: (value: IteratorResult<any>) => void; private closed = false;
  push(value: any) { if (this.waiting) { const wait = this.waiting; this.waiting = undefined; wait({ done: false, value }); } else this.values.push(value); }
  get active() { return !this.closed; }
  async next(): Promise<IteratorResult<any>> { if (this.values.length) return { done: false, value: this.values.shift() }; if (this.closed) return { done: true, value: undefined }; return await new Promise(resolve => { this.waiting = resolve; }); }
  [Symbol.asyncIterator]() { return this; }
  // The native session.follow stream disposes synchronously and returns void.
  dispose(): void { this.closed = true; this.waiting?.({ done: true, value: undefined }); this.waiting = undefined; }
}
async function eventually(condition: () => unknown) { const deadline = Date.now() + 1000; while (!condition()) { if (Date.now() > deadline) throw new Error('condition timeout'); await new Promise(resolve => setTimeout(resolve, 5)); } }
test('DSH cumulative text bursts coalesce before tool and terminal boundaries',async()=>{
  const streams:Stream[]=[],visible:ExecutorEvent[]=[],cwd='/synthetic/stream';let sequence=0;
  const ok=(value:any)=>({ok:true,value});
  const publish=(type:string,data:any)=>{const event={seq:++sequence,type,data};for(const stream of streams)stream.push({type:'event',event});};
  const remote={permissionPresets:{catalog:async()=>ok({defaultPreset:'workspace-write',options:[{value:'workspace-write'}]})},commands:{list:async()=>ok([{name:'permission',definitionId:'@deepseek-ai/dsh-permission-presets'}]),execute:async()=>ok({result:{kind:'success'}})},session:{
    create:async()=>ok({sessionId:'stream-session'}),
    follow:()=>{const stream=new Stream();streams.push(stream);stream.push({type:'snapshot',header:{id:'stream-session',cwd},cursor:sequence,records:[],projections:{values:{permissions:{currentValue:'workspace-write'}}}});return stream;},
    prompt:async(input:any)=>{queueMicrotask(()=>{
      publish('turn/start',{turn:1});publish('user/message',{turn:1,id:input.requestId,source:{rpcId:input.requestId},content:input.content});
      for(const stream of streams){stream.push({type:'assistant-stream',frame:{type:'start',attemptId:'burst',turn:1,step:1}});for(let i=0;i<2000;i++)stream.push({type:'assistant-stream',frame:{type:'chunk',attemptId:'burst',index:i,chunk:{type:'text-delta',text:'x'}}});}
      publish('tool/call',{turn:1,callId:'tool',name:'shell',arguments:'{}'});publish('tool/result',{turn:1,message:{toolCallId:'tool',content:[{type:'text',text:'done'}]}});publish('turn/end',{turn:1,reason:{kind:'completed'}});
    });return ok({accepted:true});},
  }};
  const runtime=Reflect.construct(DshRuntime,['binding-stream',{close:async()=>{for(const s of streams)s.dispose();}},{remote,close:async()=>{},ctx:{}}]) as AgentRuntime;
  try{
    const contextRef=await runtime.createContext({cwd});await runtime.send({contextRef,cwd,text:'test',images:[],clientRequestId:'stream-request',onEvent:e=>visible.push(e)});
    const texts=visible.filter((e):e is Extract<ExecutorEvent,{type:'item'}>=>e.type==='item'&&e.item.kind==='message'&&e.item.role==='assistant');
    assert.ok(texts.length>0&&texts.length<40);assert.equal(texts.at(-1)!.item.text,'x'.repeat(2000));
    const firstTool=visible.findIndex(e=>e.type==='item'&&e.item.kind==='tool');assert.ok(visible.indexOf(texts.at(-1)!)<firstTool);
    assert.equal(visible.filter(e=>e.type==='item'&&e.item.kind==='tool').length,2);assert.ok(visible.findIndex(e=>e.type==='completed')>firstTool);
  }finally{await runtime.close();}
});
test('DSH steering preserves exact input sources and holds a completion racing native admission', async () => {
  const streams:Stream[]=[],events:any[]=[],visible:ExecutorEvent[]=[],prompts:any[]=[];const cwd='/synthetic/workspace',ok=(value:any)=>({ok:true,value});
  let release!:()=>void;const admission=new Promise<void>(resolve=>{release=resolve;});
  const publish=(event:any)=>{event.seq=events.length+1;events.push(event);for(const stream of streams)stream.push({type:'event',event});};
  const remote={permissionPresets:{catalog:async()=>ok({defaultPreset:'workspace-write',options:[{value:'workspace-write'}]})},commands:{list:async()=>ok([{name:'permission',definitionId:'@deepseek-ai/dsh-permission-presets'}]),execute:async()=>ok({result:{kind:'success'}})},session:{create:async()=>ok({sessionId:'steering-session'}),follow:()=>{const stream=new Stream();streams.push(stream);stream.push({type:'snapshot',header:{id:'steering-session',cwd},cursor:0,records:[],projections:{values:{permissions:{currentValue:'workspace-write'}}}});return stream;},prompt:async(input:any)=>{
    prompts.push(input);
    if(input.mode==='queue'){queueMicrotask(()=>{publish({type:'turn/start',data:{turn:1}});publish({type:'user/message',data:{id:'first',content:input.content,source:{rpcId:input.requestId}}});});return ok({accepted:true});}
    await admission;publish({type:'turn/start',data:{turn:2}});publish({type:'user/message',data:{id:'extra',content:input.content,source:{rpcId:input.requestId}}});publish({type:'turn/end',data:{turn:2,reason:{kind:'completed'}}});return ok({accepted:true});
  }}};
  const runtime=Reflect.construct(DshRuntime,['binding-steer',{close:async()=>{for(const stream of streams)await stream.dispose();}},{remote,close:async()=>{},ctx:{}}]) as AgentRuntime;
  try {
    const contextRef=await runtime.createContext({cwd});const sending=runtime.send({contextRef,cwd,text:'initial',images:[],clientRequestId:'first-request',onEvent:event=>visible.push(event)});
    await eventually(()=>visible.some(event=>event.type==='accepted'));const accepted=visible.find(event=>event.type==='accepted');assert.equal(accepted?.type,'accepted');
    const extra=runtime.supplement!({contextRef,executionRef:accepted.executionRef,cwd,text:'extra',images:[],clientRequestId:'extra-request'});
    await eventually(()=>prompts.length===2);publish({type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});
    await eventually(()=>events.some(event=>event.type==='turn/end'));assert.equal((await runtime.observe({contextRef,executionRef:accepted.executionRef})).status,'running');
    release();assert.equal((await extra).executionRef.id,accepted.executionRef.id);await sending;
    assert.equal(visible.filter(event=>event.type==='completed').length,1);assert.ok(visible.some(event=>event.type==='item'&&event.item.clientRequestId==='extra-request'));
    assert.equal(prompts[1].mode,'steer');assert.equal(prompts[1].sessionId,contextRef.id);
  } finally {release();await runtime.close();}
});
test('DSH retains the model failure after successful tools without losing prior output', async () => {
  const streams: Stream[]=[]; const events:any[]=[]; const cwd='/synthetic/workspace'; const ok=(value:any)=>({ok:true,value});
  const publish=(event:any)=>{event.seq=events.length+1;events.push(event);for(const stream of streams)stream.push({type:'event',event});};
  const remote={
    permissionPresets:{catalog:async()=>ok({defaultPreset:'workspace-write',options:[{value:'workspace-write'}]})},
    commands:{list:async()=>ok([{name:'permission',definitionId:'@deepseek-ai/dsh-permission-presets'}]),execute:async()=>ok({result:{kind:'success'}})},
    session:{create:async()=>ok({sessionId:'failure-session'}),follow:()=>{const stream=new Stream();streams.push(stream);stream.push({type:'snapshot',header:{id:'failure-session',cwd},cursor:0,records:[],projections:{values:{permissions:{currentValue:'workspace-write'}}}});return stream;},
      prompt:async(input:any)=>{queueMicrotask(()=>{
        publish({type:'turn/start',data:{turn:1}});publish({type:'user/message',data:{id:'user',content:input.content,source:{rpcId:input.requestId}}});
        publish({type:'assistant/message',data:{turn:1,step:1,message:{content:[{type:'text',text:'先检查现场。'}]}}});
        publish({type:'tool/call',data:{turn:1,callId:'read-call',name:'read',arguments:'{}'}});
        publish({type:'tool/result',data:{turn:1,message:{toolCallId:'read-call',content:[{type:'text',text:'file result'}]}}});
        publish({type:'turn/end',data:{turn:1,reason:{kind:'error',error:{message:'model_devin_stream_failed: Devin · 工具结果接续 / 响应流：permission_denied: MCP configuration issue. Authorization: Bearer native-secret'}}}});
      });return ok({accepted:true});}},
  };
  const runtime=Reflect.construct(DshRuntime,['binding-fixture',{close:async()=>{for(const s of streams)await s.dispose();}},{remote,close:async()=>{},ctx:{}}]) as AgentRuntime;
  try {
    const contextRef=await runtime.createContext({cwd}), visible:ExecutorEvent[]=[];
    await runtime.send({contextRef,cwd,text:'inspect',images:[],clientRequestId:'failed-request',onEvent:event=>visible.push(event)});
    const completed=visible.find(event=>event.type==='completed');assert.equal(completed?.type,'completed');assert.equal(completed.status,'failed');
    assert.match(completed.diagnostic!,/工具调用后.*permission_denied.*MCP configuration issue/);assert.ok(!completed.diagnostic!.includes('native-secret'));
    const accepted=visible.find(event=>event.type==='accepted');assert.equal(accepted?.type,'accepted');
    const observed=await runtime.observe({contextRef,executionRef:accepted.executionRef});assert.equal(observed.diagnostic,completed.diagnostic);assert.equal(observed.tools[0].status,'completed');
    assert.ok(visible.some(event=>event.type==='item'&&event.item.text==='先检查现场。'));
  }finally{await runtime.close();}
});
test('DSH stream shows accumulated text, answers the native question and observes cancellation', async () => {
  const root=await mkdtemp(join(tmpdir(),'buildr-dsh-image-'));const imagePath=join(root,'image.png');const imageBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=','base64');await writeFile(imagePath,imageBytes);
  let runtime: AgentRuntime; let nativeAnswer: any;
  const streams: Stream[] = []; const events: any[] = []; const ok = (value: any) => ({ ok: true, value }); let cwd = '/synthetic/workspace';
  const publish = (event: any) => { event.seq = events.length + 1; events.push(event); for (const stream of streams) stream.push({ type: 'event', event }); };
  let selectedPermission = 'workspace-write';
  const remote = { permissionPresets: { catalog: async () => ok({ defaultPreset: 'workspace-write', options: [{ value: 'workspace-write' }, { value: 'danger-full-access' }] }) }, commands: { list: async () => ok([{ name: 'permission', definitionId: '@deepseek-ai/dsh-permission-presets' }]), execute: async (_id: string, line: string) => { selectedPermission = line.slice('/permission '.length); return ok({ result: { kind: 'success' } }); } }, session: {
    create: async (input: any) => { cwd = input.cwd; return ok({ sessionId: 'native-dsh' }); },
    follow: () => { const stream = new Stream(); streams.push(stream); stream.push({ type: 'snapshot', header: { id: 'native-dsh', cwd }, cursor: events.length, records: events.map(event => ({ event })), projections: { values: { permissions: { currentValue: selectedPermission } } } }); return stream; },
    page: async () => ok({ records: events.map(event => ({ event })), hasMore: false }),
    prompt: async (input: any) => {const image=input.content.find((part:any)=>part.type==='image');assert.equal(image.mediaType,'image/png');assert.equal(image.data,imageBytes.toString('base64')); setTimeout(() => {
      publish({ type: 'turn/start', data: { turn: 1 } }); publish({ type: 'user/message', data: { id: 'user-dsh', content: input.content, source: { rpcId: input.requestId } } });
      for(const kind of ['time-context','runtime-context','agent-instructions','tool-jobs'])publish({type:'user/message',data:{id:'context-'+kind,source:{kind},content:[{type:'text',text:'private runtime context'}]}});
      for (const stream of streams) { stream.push({ type: 'assistant-stream', frame: { type: 'start', attemptId: 'a1', turn: 1, step: 1 } }); stream.push({ type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'a1', index: 0, chunk: { type: 'text-delta', text: '正在' } } }); stream.push({ type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'a1', index: 1, chunk: { type: 'reasoning-delta', text: 'private reasoning' } } }); stream.push({ type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'a1', index: 2, chunk: { type: 'text-delta', text: '处理' } } }); }
      publish({ type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '正在处理' }] } } });
      publish({ type: 'tool/call', data: { turn: 1, callId: 'question-dsh', name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ id: 'color', question: '颜色', options: [{ label: '蓝' }] }] }) } });
      void (runtime as any).question({ agent: { id: 'native-dsh' }, questions: [{ id: 'color', question: '颜色', options: [{ label: '蓝' }] }], wait: { callId: 'question-dsh' } }).then((answer: any) => { nativeAnswer = answer; publish({ type: 'tool/result', data: { turn: 1, message: { toolCallId: 'question-dsh', content: [{ type: 'text', text: '蓝' }] } } }); publish({ type: 'tool/call', data: { turn: 1, callId: 'bash-dsh', name: 'bash', arguments: '{}' } }); });
    }, 5); return ok({ accepted: true }); },
    cancel: async () => { publish({ type: 'tool/result', data: { turn: 1, message: { toolCallId: 'bash-dsh', content: [{ type: 'text', text: '已中断' }] } } }); publish({ type: 'turn/end', data: { turn: 1, reason: { kind: 'aborted' } } }); return ok({ accepted: true }); },
  } };
  const client = { remote, close: async () => {}, ctx: {} }; const host = { close: async () => { for (const stream of streams) await stream.dispose(); } };
  // This is a controlled official-client seam; no model, account or program is launched.
  runtime = Reflect.construct(DshRuntime, ['binding-fixture', host, client]) as AgentRuntime;
  try {
    const contextRef = await runtime.createContext({ cwd }); const visible: ExecutorEvent[] = [];
    const sending = runtime.send({ contextRef, cwd, text: '处理工作', images: [{id:'image-fixture',path:imagePath,mimeType:'image/png'}], clientRequestId: 'request-exact', onEvent: event => visible.push(event) }); sending.catch(() => {});
    await eventually(() => visible.some(event => event.type === 'request'));
    const accepted = visible.find(event => event.type === 'accepted'); const request = visible.find(event => event.type === 'request'); assert.equal(accepted?.type, 'accepted'); assert.equal(request?.type, 'request');
    await runtime.reply({ contextRef, executionRef: accepted.executionRef, requestId: request.request.id, answer: { color: '蓝' } });
    await eventually(() => visible.some(event => event.type === 'item' && event.item.id === 'bash-dsh'));
    assert.deepEqual(nativeAnswer, { answers: [{ id: 'color', selected: ['蓝'] }] });
    assert.equal(request.request.questions?.[0]?.allowOther,true);
    const custom=(runtime as any).question({agent:{id:'native-dsh'},questions:[{id:'mix',question:'自定义颜色',multiSelect:true,options:[{label:'蓝'}]}],wait:{callId:'custom-question'}});
    await eventually(()=>visible.some(event=>event.type==='request'&&event.request.id==='custom-question'));
    await runtime.reply({contextRef,executionRef:accepted.executionRef,requestId:'custom-question',answer:{mix:['蓝','紫色也可以']}});
    assert.deepEqual(await custom,{answers:[{id:'mix',selected:['蓝'],custom:'紫色也可以'}]});
    const customOnly=(runtime as any).question({agent:{id:'native-dsh'},questions:[{id:'free',question:'自定义',options:[{label:'蓝'}]}],wait:{callId:'custom-only'}});
    await eventually(()=>visible.some(event=>event.type==='request'&&event.request.id==='custom-only'));
    await runtime.reply({contextRef,executionRef:accepted.executionRef,requestId:'custom-only',answer:{free:'绿色'}});
    assert.deepEqual(await customOnly,{answers:[{id:'free',selected:[],custom:'绿色'}]});
    const abort = new AbortController();
    const cancelled = (runtime as any).question({ agent: { id: 'native-dsh' }, signal: abort.signal, questions: [{ id: 'later', question: '继续？' }], wait: { callId: 'cancelled-question' } });
    const rejected = assert.rejects(cancelled, /dsh_question_cancelled/); abort.abort(); await rejected;
    assert.ok(visible.some(event => event.type === 'request-resolved' && event.requestId === 'cancelled-question'));
    await assert.rejects((runtime as any).question({ agent: { id: 'wrong-session' }, questions: [{ id: 'color', question: '颜色' }] }), /dsh_question_owner_unavailable/);
    const endingQuestion = (runtime as any).question({ agent: { id: 'native-dsh' }, questions: [{ id: 'ending', question: '结束前的问题' }], wait: { callId: 'ending-question' } });
    const expired = assert.rejects(endingQuestion, /dsh_question_expired/);
    await runtime.stop({ contextRef, executionRef: accepted.executionRef }); await sending; await expired;
    await assert.rejects(runtime.reply({ contextRef, executionRef: accepted.executionRef, requestId: 'ending-question', answer: { ending: '旧回答' } }), /agent_request_stale/);
    await assert.rejects((runtime as any).question({ agent: { id: 'native-dsh' }, questions: [{ id: 'color', question: '颜色' }] }), /dsh_question_owner_unavailable/);
    assert.equal((await runtime.observe({ contextRef, executionRef: accepted.executionRef })).status, 'stopped');
    const text = visible.filter(event => event.type === 'item' && event.item.role === 'assistant').map(event => event.type === 'item' ? event.item : null);
    assert.equal(new Set(text.map(item => item!.id)).size, 1); assert.equal(text.at(-1)?.text, '正在处理'); assert.ok(!JSON.stringify(visible).includes('private reasoning'));
    const history = await runtime.readHistory({ contextRef, cwd }); assert.equal(history.find(item => item.id === 'user-dsh')?.executionId, 'request-exact');
    assert.deepEqual(history.filter(item=>item.role==='user').map(item=>item.id),['user-dsh']);
    assert.ok(!JSON.stringify(visible).includes('private runtime context'));
  } finally { await runtime.close(); await rm(root,{recursive:true,force:true}); }
});

test('DSH confirmed cancellation remains authoritative after a lost supplementary receipt',async()=>{
 const streams:Stream[]=[],visible:ExecutorEvent[]=[],cwd='/synthetic/workspace',ok=(value:any)=>({ok:true,value});let sequence=0;
 const publish=(event:any)=>{event.seq=++sequence;for(const stream of streams)stream.push({type:'event',event});};
 const remote={permissionPresets:{catalog:async()=>ok({defaultPreset:'workspace-write',options:[{value:'workspace-write'}]})},commands:{list:async()=>ok([{name:'permission',definitionId:'@deepseek-ai/dsh-permission-presets'}]),execute:async()=>ok({result:{kind:'success'}})},session:{create:async()=>ok({sessionId:'unknown-input'}),follow:()=>{const stream=new Stream();streams.push(stream);stream.push({type:'snapshot',header:{id:'unknown-input',cwd},cursor:0,records:[],projections:{values:{permissions:{currentValue:'workspace-write'}}}});return stream;},prompt:async(input:any)=>{
  if(input.mode==='steer')throw Error('receipt lost');queueMicrotask(()=>{publish({type:'turn/start',data:{turn:1}});publish({type:'user/message',data:{id:'initial',source:{rpcId:input.requestId},content:input.content}});});return ok({accepted:true});
 },cancel:async()=>{publish({type:'turn/end',data:{turn:1,reason:{kind:'aborted'}}});return ok({accepted:true});},projections:async()=>ok({kind:'sequenced',values:{inbox:{'next-step':[{id:'queued-input',source:{rpcId:'unknown'},content:[{type:'text',text:'extra'}]}],'next-turn':[{id:'unrelated',source:{rpcId:'other-owner'},content:[{type:'text',text:'retain'}]}]}}}),updateQueue:async(input:any)=>{assert.equal(input.itemId,'queued-input');assert.equal(input.action.kind,'remove');return ok({accepted:true});}}};
 const runtime=Reflect.construct(DshRuntime,['binding-unknown',{close:async()=>{for(const stream of streams)await stream.dispose();}},{remote,close:async()=>{},ctx:{}}]) as AgentRuntime;
 try{
  const contextRef=await runtime.createContext({cwd});const sending=runtime.send({contextRef,cwd,text:'initial',images:[],clientRequestId:'initial',onEvent:event=>visible.push(event)});await eventually(()=>visible.some(event=>event.type==='accepted'));
  const accepted=visible.find(event=>event.type==='accepted');assert.equal(accepted?.type,'accepted');const executionRef=accepted.executionRef;
  await assert.rejects(runtime.supplement!({contextRef,executionRef,cwd,text:'extra',images:[],clientRequestId:'unknown'}),/receipt lost/);assert.equal((await runtime.observe({contextRef,executionRef})).status,'unknown');
  await runtime.stop({contextRef,executionRef});await sending;assert.equal((await runtime.observe({contextRef,executionRef})).status,'stopped');
 }finally{await runtime.close();}
});

test('DSH stop holds admission and cancels a native turn started by a late supplementary receipt',async()=>{
 const streams:Stream[]=[],visible:ExecutorEvent[]=[],cwd='/synthetic/workspace',ok=(value:any)=>({ok:true,value});let sequence=0,native=1,cancels=0,release!:()=>void;
 const admission=new Promise<void>(resolve=>{release=resolve;});const publish=(event:any)=>{event.seq=++sequence;for(const stream of streams)stream.push({type:'event',event});};
 const remote={permissionPresets:{catalog:async()=>ok({defaultPreset:'workspace-write',options:[{value:'workspace-write'}]})},commands:{list:async()=>ok([{name:'permission',definitionId:'@deepseek-ai/dsh-permission-presets'}]),execute:async()=>ok({result:{kind:'success'}})},session:{create:async()=>ok({sessionId:'late-input'}),follow:()=>{const stream=new Stream();streams.push(stream);stream.push({type:'snapshot',header:{id:'late-input',cwd},cursor:0,records:[],projections:{values:{permissions:{currentValue:'workspace-write'}}}});return stream;},prompt:async(input:any)=>{
  if(input.mode==='queue'){queueMicrotask(()=>{publish({type:'turn/start',data:{turn:1}});publish({type:'user/message',data:{id:'initial',source:{rpcId:input.requestId},content:input.content}});});return ok({accepted:true});}
  await admission;native=2;publish({type:'turn/start',data:{turn:2}});publish({type:'user/message',data:{id:'extra',content:input.content,source:{rpcId:input.requestId}}});return ok({accepted:true});
 },cancel:async()=>{cancels++;publish({type:'turn/end',data:{turn:native,reason:{kind:'aborted'}}});return ok({accepted:true});},projections:async()=>ok({kind:'sequenced',values:{inbox:{'next-step':[],'next-turn':[]}}})}};
 const runtime=Reflect.construct(DshRuntime,['binding-late',{close:async()=>{for(const stream of streams)await stream.dispose();}},{remote,close:async()=>{},ctx:{}}]) as AgentRuntime;
 try{
  const contextRef=await runtime.createContext({cwd});const sending=runtime.send({contextRef,cwd,text:'initial',images:[],clientRequestId:'initial',onEvent:event=>visible.push(event)});await eventually(()=>visible.some(event=>event.type==='accepted'));
  const accepted=visible.find(event=>event.type==='accepted');assert.equal(accepted?.type,'accepted');const executionRef=accepted.executionRef;
  const extra=runtime.supplement!({contextRef,executionRef,cwd,text:'extra',images:[],clientRequestId:'extra-request'});await Promise.resolve();
  assert.equal((await runtime.stop({contextRef,executionRef})).status,'unknown');assert.equal(visible.filter(event=>event.type==='completed').length,0);
  release();await extra;await sending;assert.ok(cancels>=2);assert.equal((await runtime.observe({contextRef,executionRef})).status,'stopped');assert.equal(visible.filter(event=>event.type==='completed').length,1);
 }finally{release();await runtime.close();}
});
test('DSH reports the native context window and input-token usage', async () => {
  const streams:Stream[]=[],events:any[]=[],visible:ExecutorEvent[]=[];const cwd='/synthetic/workspace',ok=(value:any)=>({ok:true,value});
  const publish=(event:any)=>{event.seq=events.length+1;events.push(event);for(const stream of streams)stream.push({type:'event',event});};
  const remote={
    permissionPresets:{catalog:async()=>ok({defaultPreset:'workspace-write',options:[{value:'workspace-write'}]})},
    commands:{list:async()=>ok([{name:'permission',definitionId:'@deepseek-ai/dsh-permission-presets'}]),execute:async()=>ok({result:{kind:'success'}})},
    session:{create:async()=>ok({sessionId:'usage-session'}),follow:()=>{const stream=new Stream();streams.push(stream);stream.push({type:'snapshot',header:{id:'usage-session',cwd},cursor:0,records:[],projections:{values:{permissions:{currentValue:'workspace-write'}}}});return stream;},
      prompt:async(input:any)=>{queueMicrotask(()=>{
        publish({type:'turn/start',data:{turn:1}});
        publish({type:'user/message',data:{id:'usage-input',source:{rpcId:input.requestId},content:input.content}});
        publish({type:'request/context',data:{provider:'buildr-models',model:'qoder-deepseek-flash',contextWindow:500000}});
        publish({type:'assistant/message',data:{turn:1,step:1,usage:{inputTokens:23190,outputTokens:137,totalTokens:23327},message:{content:[{type:'text',text:'完成'}]}}});
        publish({type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});
      });return ok({accepted:true});}},
  };
  const runtime=Reflect.construct(DshRuntime,['binding-usage',{close:async()=>{for(const stream of streams)await stream.dispose();}},{remote,close:async()=>{},ctx:{}}]) as AgentRuntime;
  try {
    const contextRef=await runtime.createContext({cwd});
    await runtime.send({contextRef,cwd,text:'统计用量',images:[],clientRequestId:'usage-request',onEvent:event=>visible.push(event)});
    assert.deepEqual(visible.find(event=>event.type==='context-usage'),{type:'context-usage',usedTokens:23190,windowTokens:500000});
  }finally{await runtime.close();}
});

test('DSH lost follow recovers only the exact durable terminal, never a different round or unfinished tools', async()=>{
  const streams:Stream[]=[],events:any[]=[],visible:ExecutorEvent[]=[];const cwd='/synthetic/workspace',ok=(value:any)=>({ok:true,value});let sends=0;
  const remote={permissionPresets:{catalog:async()=>ok({defaultPreset:'workspace-write',options:[{value:'workspace-write'}]})},commands:{list:async()=>ok([{name:'permission',definitionId:'@deepseek-ai/dsh-permission-presets'}]),execute:async()=>ok({result:{kind:'success'}})},session:{create:async()=>ok({sessionId:'recover-session'}),follow:()=>{const stream=new Stream();streams.push(stream);stream.push({type:'snapshot',header:{id:'recover-session',cwd},cursor:events.length,records:events.map(event=>({event})),projections:{values:{permissions:{currentValue:'workspace-write'}}}});return stream;},prompt:async(input:any)=>{sends++;events.push({type:'turn/start',seq:1,data:{turn:1}},{type:'user/message',seq:2,data:{id:'original',content:input.content,source:{kind:'user',rpcId:input.requestId}}});return ok({accepted:true});}}};
  const runtime=Reflect.construct(DshRuntime,['recover-binding',{close:async()=>{for(const stream of streams)await stream.dispose();}},{remote,close:async()=>{},ctx:{}}]) as AgentRuntime;
  try{
    (remote.session as any).page=async()=>ok({records:events.map(event=>({event})),hasMore:false});
    const contextRef=await runtime.createContext({cwd});const sending=runtime.send({contextRef,cwd,text:'work',images:[],permissionMode:'default',clientRequestId:'original-request',onEvent:e=>visible.push(e)});
    sending.catch(()=>{});await eventually(()=>visible.some(e=>e.type==='accepted'));await streams.at(-1)!.dispose();
    events.push({type:'turn/start',seq:3,data:{turn:2}},{type:'user/message',seq:4,data:{id:'other',source:{kind:'user',rpcId:'other-request'},content:[{type:'text',text:'other'}]}},{type:'turn/end',seq:5,data:{turn:2,reason:{kind:'completed'}}});
    const executionRef={id:'original-request'};assert.notEqual((await runtime.observe({contextRef,executionRef})).status,'idle');
    await streams.at(-1)!.dispose();
    events.push({type:'tool/call',seq:6,data:{turn:1,callId:'tool1',name:'bash'}},{type:'turn/end',seq:7,data:{turn:1,reason:{kind:'completed'}}});
    assert.notEqual((await runtime.observe({contextRef,executionRef})).status,'idle');
    await streams.at(-1)!.dispose();
    events.push({type:'tool/result',seq:8,data:{turn:1,message:{toolCallId:'tool1',content:[]}}});
    const restored=await runtime.observe({contextRef,executionRef});assert.equal(restored.status,'idle');assert.equal(restored.executionRef?.id,executionRef.id);assert.equal(restored.tools[0].status,'completed');assert.equal(sends,1);
    assert.equal((await runtime.observe({contextRef,executionRef})).status,'idle');assert.equal(sends,1);
  }finally{await runtime.close();}
});

function reconnectFixture() {
  const streams:Stream[]=[],events:any[]=[],visible:ExecutorEvent[]=[],cwd='/synthetic/workspace',ok=(value:any)=>({ok:true,value});
  let sends=0;
  const publish=(event:any)=>{event.seq=events.length+1;events.push(event);for(const stream of streams)if(stream.active)stream.push({type:'event',event});};
  const remote={
    permissionPresets:{catalog:async()=>ok({defaultPreset:'workspace-write',options:[{value:'workspace-write'}]})},
    commands:{list:async()=>ok([{name:'permission',definitionId:'@deepseek-ai/dsh-permission-presets'}]),execute:async()=>ok({result:{kind:'success'}})},
    session:{
      create:async()=>ok({sessionId:'live-reconnect'}),
      follow:()=>{const stream=new Stream();streams.push(stream);stream.push({type:'snapshot',header:{id:'live-reconnect',cwd},cursor:events.length,records:events.slice(-2).map(event=>({event})),hasMore:events.length>2,projections:{values:{permissions:{currentValue:'workspace-write'}}},assistantStream:{revision:1,activeAttempt:{attemptId:'partial',turn:1,step:2,nextIndex:5,stream:[{type:'reasoning-chunks',index:0,time0:1,dt:[0],texts:['hidden reasoning']},{type:'text-chunks',index:1,time0:1,dt:[0],texts:['已补回']}]}}});return stream;},
      page:async(input:any)=>{const records=events.filter(event=>event.seq<=input.throughSeq&&(input.beforeSeq===undefined||event.seq<input.beforeSeq));return ok({records:records.slice(-2).map(event=>({event})),hasMore:records.length>2});},
      prompt:async(input:any)=>{sends++;publish({type:'turn/start',data:{turn:1}});publish({type:'user/message',data:{id:'original',source:{kind:'user',rpcId:input.requestId},content:input.content}});return ok({accepted:true});},
      cancel:async()=>{publish({type:'turn/end',data:{turn:events.findLast(event=>event.type==='turn/start')?.data.turn??1,reason:{kind:'cancelled'}}});return ok({});},
    },
  };
  const runtime=Reflect.construct(DshRuntime,['live-binding',{close:async()=>{for(const stream of streams)await stream.dispose();}},{remote,close:async()=>{},ctx:{}}]) as AgentRuntime;
  return {runtime,remote,streams,events,visible,publish,cwd,get sends(){return sends;}};
}
test('DSH reconnects one live follow, repairs paged gaps and resumes partial text without sending input again',async()=>{
  const f=reconnectFixture();
  try{
    const contextRef=await f.runtime.createContext({cwd:f.cwd}),executionRef={id:'live-request'};
    const sending=f.runtime.send({contextRef,cwd:f.cwd,text:'work',images:[],clientRequestId:executionRef.id,onEvent:event=>f.visible.push(event)});
    sending.catch(()=>{});
    await eventually(()=>f.visible.some(event=>event.type==='accepted'));await f.streams.at(-1)!.dispose();
    await eventually(()=>(f.runtime as any).turns.get(contextRef.id)?.observationLost);
    f.publish({type:'tool/call',data:{turn:1,callId:'gap-tool',name:'read'}});
    f.publish({type:'tool/result',data:{turn:1,message:{toolCallId:'gap-tool',content:[{type:'text',text:'gap repaired'}]}}});
    await Promise.all([f.runtime.observe({contextRef,executionRef}),f.runtime.observe({contextRef,executionRef})]);
    assert.equal(f.streams.filter(stream=>stream.active).length,1);assert.equal(f.sends,1);
    assert.ok(f.visible.some(event=>event.type==='item'&&event.item.id==='gap-tool'&&event.item.text==='gap repaired'));
    const stream=f.streams.find(stream=>stream.active)!;
    stream.push({type:'assistant-stream',frame:{type:'chunk',attemptId:'partial',index:5,chunk:{type:'text-delta',text:'并继续'}}});
    await eventually(()=>f.visible.some(event=>event.type==='item'&&event.item.text==='已补回并继续'));
    f.publish({type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});
    await eventually(()=>f.visible.some(event=>event.type==='completed'&&event.status==='completed'));
    assert.equal((await f.runtime.observe({contextRef,executionRef})).status,'idle');assert.equal(f.sends,1);
  }finally{await f.runtime.close();}
});
test('DSH repairs a transient projection failure without ending the native turn',async()=>{
  const f=reconnectFixture();let failOnce=true;
  try{
    const contextRef=await f.runtime.createContext({cwd:f.cwd}),executionRef={id:'projection-request'};
    const sending=f.runtime.send({contextRef,cwd:f.cwd,text:'work',images:[],clientRequestId:executionRef.id,onEvent:event=>{
      if(failOnce&&event.type==='item'&&event.item.id==='failed-local-write'){failOnce=false;throw new Error('database is locked; Authorization: Bearer private-secret https://private.example/path');}
      f.visible.push(event);
    }});
    sending.catch(()=>{});
    await eventually(()=>f.visible.some(event=>event.type==='accepted'));
    f.publish({type:'tool/call',data:{turn:1,callId:'failed-local-write',name:'read'}});await eventually(()=>(f.runtime as any).turns.get(contextRef.id)?.observationLost);
    f.publish({type:'tool/result',data:{turn:1,message:{toolCallId:'failed-local-write',content:[{type:'text',text:'kept native output'}]}}});
    await f.runtime.observe({contextRef,executionRef});
    assert.equal(f.sends,1);assert.equal(f.streams.filter(stream=>stream.active).length,1);
    assert.ok(f.visible.some(event=>event.type==='item'&&event.item.text==='kept native output'));
    const stopped=await f.runtime.stop({contextRef,executionRef});
    await eventually(()=>f.visible.some(event=>event.type==='completed'&&event.status==='stopped'));
    assert.equal((await f.runtime.observe({contextRef,executionRef})).status,'stopped');assert.equal(f.sends,1);
  }finally{await f.runtime.close();}
});

test('DSH automatically restores a lost live follow and bounds repeated reconnect failures',async()=>{
  const f=reconnectFixture();
  try{
    const contextRef=await f.runtime.createContext({cwd:f.cwd}),executionRef={id:'automatic-request'};
    const sending=f.runtime.send({contextRef,cwd:f.cwd,text:'work',images:[],clientRequestId:executionRef.id,onEvent:event=>f.visible.push(event)});
    sending.catch(()=>{});
    await eventually(()=>f.visible.some(event=>event.type==='accepted'));await f.streams.at(-1)!.dispose();
    await eventually(()=>f.streams.filter(stream=>stream.active).length===1);
    f.publish({type:'tool/call',data:{turn:1,callId:'after-auto-restore',name:'read'}});
    await eventually(()=>f.visible.some(event=>event.type==='item'&&event.item.id==='after-auto-restore'));
    assert.equal(f.sends,1);
    f.publish({type:'tool/call',data:{turn:1,callId:'unfinished',name:'bash'}});
    await eventually(()=>f.visible.some(event=>event.type==='item'&&event.item.id==='unfinished'));
    let attempts=0;(f.remote.session as any).follow=()=>{attempts++;throw new Error('native transport unavailable');};
    await f.streams.find(stream=>stream.active)!.dispose();
    const deadline=Date.now()+3000;
    while(attempts<3&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(attempts,3);assert.equal(f.sends,1);
    await assert.rejects(sending,/dsh_execution_observation_lost/);
    assert.ok(f.visible.some(event=>event.type==='observation'&&event.observation.status==='unknown'));
    const unknown=f.visible.filter(event=>event.type==='observation'&&event.observation.status==='unknown').at(-1);
    assert.ok(unknown?.type==='observation'&&unknown.observation.tools.every(tool=>tool.status!=='running'));
    await new Promise(resolve=>setTimeout(resolve,1050));assert.equal(attempts,3);
  }finally{await f.runtime.close();}
});
test('DSH close settles an accepted send even when no more native frames arrive',async()=>{
  const f=reconnectFixture();
  try{
    const contextRef=await f.runtime.createContext({cwd:f.cwd});
    const sending=f.runtime.send({contextRef,cwd:f.cwd,text:'work',images:[],clientRequestId:'close-request',onEvent:event=>f.visible.push(event)});
    const failed=assert.rejects(sending,/agent_native_process_closed/);
    await eventually(()=>f.visible.some(event=>event.type==='accepted'));await f.runtime.close();await failed;
    assert.equal(f.runtime.closed,true);assert.equal(f.streams.filter(stream=>stream.active).length,0);
  }finally{await f.runtime.close();}
});

test('DSH tracks a native child wakeup after a stage reply, including tools, questions and exact stop',async()=>{
  const f=reconnectFixture();
  try{
    const contextRef=await f.runtime.createContext({cwd:f.cwd}),executionRef={id:'goal-request'};
    const sending=f.runtime.send({contextRef,cwd:f.cwd,text:'release after repair',images:[],clientRequestId:executionRef.id,onEvent:event=>f.visible.push(event)});
    await eventually(()=>f.visible.some(event=>event.type==='accepted'));
    f.publish({type:'subagent/catalog',data:{childId:'repair-child',mode:'continuable',label:'repair'}});
    f.publish({type:'assistant/message',data:{turn:1,step:1,message:{content:[{type:'text',text:'修复后继续发布。'}]}}});
    f.publish({type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});await sending;
    const waiting=await f.runtime.observe({contextRef,executionRef});
    assert.equal(waiting.status,'tools-active');
    assert.ok(waiting.tools.some(tool=>tool.status==='running'));

    f.publish({type:'turn/start',data:{turn:2}});
    f.publish({type:'user/message',data:{id:'child-notice',source:{kind:'subagent-settled',senderSessionId:'repair-child'},content:[{type:'text',text:'Child failed without results.'}]}});
    f.publish({type:'tool/call',data:{turn:2,callId:'repair-tool',name:'read',arguments:'{}'}});
    f.publish({type:'tool/result',data:{turn:2,message:{toolCallId:'repair-tool',content:[{type:'text',text:'current repair results'}]}}});
    await eventually(()=>f.visible.some(event=>event.type==='item'&&event.item.id==='repair-tool'&&event.item.status==='completed'));
    assert.equal((await f.runtime.observe({contextRef,executionRef})).status,'running');
    const answer=(f.runtime as any).question({agent:{id:contextRef.id},questions:[{id:'release',question:'确认公开？',options:[{label:'暂缓'}]}],wait:{callId:'followup-question'}});
    await eventually(()=>f.visible.some(event=>event.type==='request'&&event.request.id==='followup-question'));
    assert.equal((await f.runtime.observe({contextRef,executionRef})).status,'waiting');
    await f.runtime.reply({contextRef,executionRef,requestId:'followup-question',answer:{release:'暂缓'}});
    assert.deepEqual(await answer,{answers:[{id:'release',selected:['暂缓']}]});
    await f.runtime.stop({contextRef,executionRef});
    await eventually(()=>f.visible.some(event=>event.type==='completed'&&event.status==='stopped'));
    assert.equal((await f.runtime.observe({contextRef,executionRef})).status,'stopped');
    assert.equal(f.sends,1);
    assert.ok(!f.visible.some(event=>event.type==='item'&&event.item.role==='user'&&event.item.text.includes('Child failed')));
  }finally{await f.runtime.close();}
});

test('DSH reconnects a child continuation after the original native turn ended without resending the goal',async()=>{
  const f=reconnectFixture();
  try{
    const contextRef=await f.runtime.createContext({cwd:f.cwd}),executionRef={id:'reconnect-goal'};
    const sending=f.runtime.send({contextRef,cwd:f.cwd,text:'goal',images:[],clientRequestId:executionRef.id,onEvent:event=>f.visible.push(event)});
    await eventually(()=>f.visible.some(event=>event.type==='accepted'));
    f.publish({type:'subagent/catalog',data:{childId:'child',label:'repair'}});
    f.publish({type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});await sending;
    await f.streams.find(stream=>stream.active)!.dispose();
    assert.ok(!f.visible.some(event=>event.type==='observation'&&event.observation.status==='unknown'));
    f.publish({type:'turn/start',data:{turn:2}});
    f.publish({type:'user/message',data:{id:'wake',source:{kind:'subagent-settled',senderSessionId:'child'},content:[{type:'text',text:'done'}]}});
    f.publish({type:'tool/call',data:{turn:2,callId:'gap-followup',name:'read'}});
    f.publish({type:'tool/result',data:{turn:2,message:{toolCallId:'gap-followup',content:[{type:'text',text:'followup result'}]}}});
    await f.runtime.observe({contextRef,executionRef});
    assert.equal((await f.runtime.observe({contextRef,executionRef})).status,'running');
    assert.ok(f.visible.some(event=>event.type==='item'&&event.item.id==='gap-followup'&&event.item.status==='completed'&&event.item.executionId===executionRef.id));
    f.publish({type:'turn/end',data:{turn:2,reason:{kind:'completed'}}});
    await eventually(()=>f.visible.filter(event=>event.type==='completed').length===2);
    assert.equal((await f.runtime.observe({contextRef,executionRef})).status,'idle');
    const history=await f.runtime.readHistory({contextRef,cwd:f.cwd});
    assert.equal(history.find(item=>item.id==='gap-followup')?.executionId,executionRef.id);
    assert.equal(f.streams.filter(stream=>stream.active).length,1);assert.equal(f.sends,1);
  }finally{await f.runtime.close();}
});

test('DSH ignores foreign native turns in durable and streaming output after completion',async()=>{
  const f=reconnectFixture();
  try{
    const contextRef=await f.runtime.createContext({cwd:f.cwd}),executionRef={id:'original-goal'};
    const sending=f.runtime.send({contextRef,cwd:f.cwd,text:'goal',images:[],clientRequestId:executionRef.id,onEvent:event=>f.visible.push(event)});
    await eventually(()=>f.visible.some(event=>event.type==='accepted'));
    f.publish({type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});await sending;
    for(const source of [{kind:'user',rpcId:'foreign'},{kind:'subagent-settled',senderSessionId:'unknown'}]){
      const turn=source.kind==='user'?2:3;
      f.publish({type:'turn/start',data:{turn}});
      f.publish({type:'user/message',data:{id:'foreign-'+turn,source,content:[{type:'text',text:'foreign input'}]}});
      const stream=f.streams.find(stream=>stream.active)!;
      stream.push({type:'assistant-stream',frame:{type:'start',attemptId:'foreign-'+turn,turn,step:1}});
      stream.push({type:'assistant-stream',frame:{type:'chunk',attemptId:'foreign-'+turn,index:0,chunk:{type:'text-delta',text:'foreign streamed result'}}});
      f.publish({type:'tool/call',data:{turn,callId:'foreign-tool-'+turn,name:'read'}});
      f.publish({type:'assistant/message',data:{turn,step:1,message:{content:[{type:'text',text:'foreign durable result'}]}}});
      f.publish({type:'turn/end',data:{turn,reason:{kind:'completed'}}});
    }
    await new Promise(resolve=>setTimeout(resolve,5));
    assert.ok(!f.visible.some(event=>event.type==='item'&&(event.item.text.includes('foreign')||event.item.id.includes('foreign'))));
    assert.equal((await f.runtime.observe({contextRef,executionRef})).status,'idle');assert.equal(f.sends,1);
  }finally{await f.runtime.close();}
});

test('DSH replays a terminal whose event consumer failed after the native state changed',async()=>{
  const f=reconnectFixture();let failOnce=true;
  try{
    const contextRef=await f.runtime.createContext({cwd:f.cwd}),executionRef={id:'terminal-write-failed'};
    const sending=f.runtime.send({contextRef,cwd:f.cwd,text:'goal',images:[],clientRequestId:executionRef.id,onEvent:event=>{
      if(failOnce&&event.type==='completed'){failOnce=false;throw new Error('local save failed');}
      f.visible.push(event);
    }});
    sending.catch(()=>{});
    await eventually(()=>f.visible.some(event=>event.type==='accepted'));
    f.publish({type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});await eventually(()=>(f.runtime as any).turns.get(contextRef.id)?.observationLost);
    assert.equal((await f.runtime.observe({contextRef,executionRef})).status,'idle');
    assert.ok(f.visible.some(event=>event.type==='completed'&&event.status==='completed'));assert.equal(f.sends,1);
  }finally{await f.runtime.close();}
});


test('DSH silently repairs one linked command and final reply completed during a lost follow',async()=>{
  const f=reconnectFixture();
  try{
    const contextRef=await f.runtime.createContext({cwd:f.cwd}),executionRef={id:'silent-repair'};
    let settled=false;
    const sending=f.runtime.send({contextRef,cwd:f.cwd,text:'goal',images:[],clientRequestId:executionRef.id,onEvent:event=>f.visible.push(event)}).finally(()=>{settled=true;});
    sending.catch(()=>{});
    await eventually(()=>f.visible.some(event=>event.type==='accepted'));
    f.publish({type:'tool/call',data:{turn:1,callId:'command',name:'bash'}});
    f.publish({type:'job/registered',data:{jobId:'job',owner:contextRef.id,label:'test command',toolCall:{callId:'command'}}});
    await eventually(()=>f.visible.some(event=>event.type==='observation'&&event.observation.tools.length===1));
    const active=await f.runtime.observe({contextRef,executionRef});
    assert.equal(active.tools.filter(tool=>tool.status==='running').length,1);
    assert.deepEqual((f.runtime as any).turns.get(contextRef.id).lineage.stopTargets(new Set([executionRef.id])).jobIds,['job']);
    await f.streams.find(stream=>stream.active)!.dispose();
    f.publish({type:'job/settled',data:{jobId:'job',status:'completed'}});
    f.publish({type:'tool/result',data:{turn:1,message:{toolCallId:'command',content:[{type:'text',text:'tests passed'}]}}});
    f.publish({type:'assistant/message',data:{turn:1,step:3,message:{content:[{type:'text',text:'final result'}]}}});
    f.publish({type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});
    assert.equal(settled,false);
    await sending;
    assert.equal(f.sends,1);
    assert.ok(!f.visible.some(event=>event.type==='observation'&&event.observation.status==='unknown'));
    assert.ok(f.visible.some(event=>event.type==='item'&&event.item.text==='tests passed'));
    assert.ok(f.visible.some(event=>event.type==='item'&&event.item.text==='final result'));
    assert.equal((await f.runtime.observe({contextRef,executionRef})).status,'idle');
  }finally{await f.runtime.close();}
});

test('DSH individually stops only the exact background job and retains state when confirmation fails',async()=>{
 const f=reconnectFixture(),dir=await mkdtemp(join(tmpdir(),'dsh-stop-job-'));
 let confirmed=false;const requests:any[]=[];
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;requests.push({url:req.url,body:JSON.parse(body),auth:req.headers.authorization});res.setHeader('content-type','application/json');res.end(JSON.stringify({stopped:confirmed}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const addressFile=join(dir,'address.json');await writeFile(addressFile,JSON.stringify({port:address.port}));
  const runtime=f.runtime as any;runtime.forkBridge={key:'test-key',addressFile};
  const contextRef=await f.runtime.createContext({cwd:f.cwd}),executionRef={id:'stop-preview'};
  const sending=f.runtime.send({contextRef,cwd:f.cwd,text:'work',images:[],clientRequestId:executionRef.id,onEvent:event=>f.visible.push(event)});sending.catch(()=>{});
  await eventually(()=>f.visible.some(event=>event.type==='accepted'));
  for(const [callId,jobId] of [['preview','preview-job'],['server','server-job']]){
   f.publish({type:'tool/call',data:{turn:1,callId,name:'bash'}});
   f.publish({type:'tool/result',data:{turn:1,message:{toolCallId:callId,content:[]}}});
   f.publish({type:'job/registered',data:{turn:1,jobId,owner:contextRef.id,toolCall:{callId}}});
  }
  await eventually(()=>runtime.turns.get(contextRef.id).lineage.toolJobs('preview',new Set([executionRef.id])).length);
  assert.equal((await f.runtime.observe({contextRef,executionRef})).tools.find(t=>t.id==='preview')?.canStop,true);
  await assert.rejects(f.runtime.stop({contextRef,executionRef,toolId:'preview'}),/unconfirmed/);
  assert.equal((await f.runtime.observe({contextRef,executionRef})).tools.find(t=>t.id==='preview')?.status,'running');
  confirmed=true;const result=await f.runtime.stop({contextRef,executionRef,toolId:'preview'});
  assert.equal(result.tools.find(t=>t.id==='preview')?.status,'completed');
  assert.equal(result.tools.find(t=>t.id==='server')?.status,'running');
  assert.deepEqual(requests.map(r=>r.body.jobIds),[['preview-job'],['preview-job']]);assert.ok(requests.every(r=>r.url==='/stop-jobs'&&r.auth==='Bearer test-key'));
  f.publish({type:'job/settled',data:{jobId:'server-job',status:'completed'}});
  f.publish({type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});await sending;
  runtime.forkBridge=undefined;
 }finally{await f.runtime.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});

test('DSH text bursts coalesce persistence events, yield controls and flush all text before terminal', async () => {
  const streams:Stream[]=[], visible:ExecutorEvent[]=[], cwd='/synthetic/stream-load', ok=(value:any)=>({ok:true,value});
  let timerRan=false, timerBeforeEnd=false;
  const publish=(event:any)=>{for(const stream of streams)stream.push({type:'event',event});};
  const remote={permissionPresets:{catalog:async()=>ok({defaultPreset:'workspace-write',options:[{value:'workspace-write'}]})},
    commands:{list:async()=>ok([{name:'permission',definitionId:'@deepseek-ai/dsh-permission-presets'}]),execute:async()=>ok({result:{kind:'success'}})},session:{
    create:async()=>ok({sessionId:'burst'}),follow:()=>{const stream=new Stream();streams.push(stream);stream.push({type:'snapshot',header:{id:'burst',cwd},cursor:0,records:[],projections:{values:{permissions:{currentValue:'workspace-write'}}}});return stream;},
    prompt:async(input:any)=>{queueMicrotask(()=>{
      setTimeout(()=>{timerRan=true;},0);
      publish({type:'turn/start',data:{turn:1}});publish({type:'user/message',data:{id:'u',content:input.content,source:{rpcId:input.requestId}}});
      for(const stream of streams){
        stream.push({type:'assistant-stream',frame:{type:'start',attemptId:'burst',turn:1,step:1}});
        for(let index=0;index<2000;index++)stream.push({type:'assistant-stream',frame:{type:'chunk',attemptId:'burst',index,chunk:{type:'text-delta',text:'字'}}});
        stream.push({type:'assistant-stream',frame:{type:'end',attemptId:'burst'}});
      }
      publish({type:'turn/end',data:{turn:1,reason:{kind:'completed'}}});
    });return ok({accepted:true});},cancel:async()=>ok({accepted:true}),
  }};
  const host={close:async()=>{for(const stream of streams)stream.dispose();}};
  const runtime=Reflect.construct(DshRuntime,['burst-binding',host,{remote,close:async()=>{},ctx:{}}]) as AgentRuntime;
  try{
    const contextRef=await runtime.createContext({cwd});
    await runtime.send({contextRef,cwd,text:'stream fixture',images:[],clientRequestId:'burst-request',onEvent:event=>{
      visible.push(event);if(event.type==='completed')timerBeforeEnd=timerRan;
    }});
    const messages=visible.filter((event):event is Extract<ExecutorEvent,{type:'item'}>=>event.type==='item'&&event.item.id==='assistant:1:1');
    assert.equal(messages.at(-1)!.item.text,'字'.repeat(2000));
    assert.ok(messages.length<40,`${messages.length} snapshots for 2000 chunks`);
    assert.equal(timerBeforeEnd,true,'control timers run before buffered output completes');
    const final=visible.findIndex(event=>event.type==='completed');
    assert.ok(visible.indexOf(messages.at(-1)!)<final);
    const count=visible.length;await new Promise(resolve=>setTimeout(resolve,80));assert.equal(visible.length,count,'no delayed output after terminal');
  }finally{await runtime.close();}
});

test('DSH compaction uses current lineage and exact completion identity',async()=>{
 const streams:Stream[]=[],events:ExecutorEvent[]=[],cwd='/synthetic/compaction';let sequence=0;
 const ok=(value:any)=>({ok:true,value});
 const publish=(type:string,data:any)=>{for(const stream of streams)stream.push({type:'event',event:{seq:++sequence,time:1700000000000,type,data}});};
 const remote={permissionPresets:{catalog:async()=>ok({defaultPreset:'workspace-write',options:[{value:'workspace-write'}]})},commands:{list:async()=>ok([{name:'permission',definitionId:'@deepseek-ai/dsh-permission-presets'}]),execute:async()=>ok({result:{kind:'success'}})},session:{
  create:async()=>ok({sessionId:'compaction-session'}),
  follow:()=>{const s=new Stream();streams.push(s);s.push({type:'snapshot',header:{id:'compaction-session',cwd},cursor:sequence,records:[],projections:{values:{permissions:{currentValue:'workspace-write'}}}});return s;},
  prompt:async(input:any)=>{queueMicrotask(()=>{
   publish('turn/start',{turn:1});publish('user/message',{turn:1,id:input.requestId,source:{rpcId:input.requestId},content:input.content});
   publish('compaction/start',{turn:99,compactionId:'foreign'});
   publish('compaction/start',{turn:null,compactionId:'standalone'});
   publish('compaction/start',{turn:1,compactionId:'compact'});
   publish('compaction/end',{turn:1,compactionId:'other'});
   publish('compaction/end',{turn:1,compactionId:'compact',error:'sensitive native error'});
   publish('turn/end',{turn:1,reason:{kind:'completed'}});
  });return ok({accepted:true});}
 }};
 const runtime=Reflect.construct(DshRuntime,['binding-compaction',{close:async()=>{for(const s of streams)s.dispose();}},{remote,close:async()=>{},ctx:{}}]) as AgentRuntime;
 try{
  const contextRef=await runtime.createContext({cwd});await runtime.send({contextRef,cwd,text:'test',images:[],clientRequestId:'compact-request',onEvent:e=>events.push(e)});
  const observations=events.filter((e):e is Extract<ExecutorEvent,{type:'observation'}>=>e.type==='observation').map(e=>e.observation);
  assert.equal(observations.filter(o=>o.contextCompaction?.id==='compact').length,2);
  assert.equal(observations.some(o=>['foreign','standalone'].includes(o.contextCompaction?.id??'')),false);
  assert.ok(observations.some(o=>o.diagnostic==='DSH 上下文压缩失败。'&&o.contextCompaction===null));
  assert.equal(observations.at(-1)!.contextCompaction,null);assert.equal(JSON.stringify(observations).includes('sensitive native error'),false);
 }finally{await runtime.close();}
});
