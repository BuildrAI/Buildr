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
  async dispose() { this.closed = true; this.waiting?.({ done: true, value: undefined }); this.waiting = undefined; }
}
async function eventually(condition: () => unknown) { const deadline = Date.now() + 1000; while (!condition()) { if (Date.now() > deadline) throw new Error('condition timeout'); await new Promise(resolve => setTimeout(resolve, 5)); } }
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
  if(input.mode==='steer')throw Error('receipt lost');queueMicrotask(()=>publish({type:'turn/start',data:{turn:1}}));return ok({accepted:true});
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
  if(input.mode==='queue'){queueMicrotask(()=>publish({type:'turn/start',data:{turn:1}}));return ok({accepted:true});}
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
      prompt:async(_input:any)=>{queueMicrotask(()=>{
        publish({type:'turn/start',data:{turn:1}});
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
    const failed=assert.rejects(sending,/dsh_execution_observation_lost/);await eventually(()=>visible.some(e=>e.type==='accepted'));await streams.at(-1)!.dispose();await failed;
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
      cancel:async()=>{publish({type:'turn/end',data:{turn:1,reason:{kind:'cancelled'}}});return ok({});},
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
    const failed=assert.rejects(sending,/dsh_execution_observation_lost/);
    await eventually(()=>f.visible.some(event=>event.type==='accepted'));await f.streams.at(-1)!.dispose();await failed;
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
test('DSH projection errors preserve the native turn and retain a sanitized failure cause',async()=>{
  const f=reconnectFixture();let failOnce=true;
  try{
    const contextRef=await f.runtime.createContext({cwd:f.cwd}),executionRef={id:'projection-request'};
    const sending=f.runtime.send({contextRef,cwd:f.cwd,text:'work',images:[],clientRequestId:executionRef.id,onEvent:event=>{
      if(failOnce&&event.type==='item'&&event.item.id==='failed-local-write'){failOnce=false;throw new Error('database is locked; Authorization: Bearer private-secret https://private.example/path');}
      f.visible.push(event);
    }});
    const failed=assert.rejects(sending,(error:any)=>error.message==='dsh_event_observation_lost'&&error.diagnostic.includes('database is locked')&&!error.diagnostic.includes('private-secret')&&!error.diagnostic.includes('private.example'));
    await eventually(()=>f.visible.some(event=>event.type==='accepted'));
    f.publish({type:'tool/call',data:{turn:1,callId:'failed-local-write',name:'read'}});await failed;
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
    const failed=assert.rejects(sending,/dsh_execution_observation_lost/);
    await eventually(()=>f.visible.some(event=>event.type==='accepted'));await f.streams.at(-1)!.dispose();await failed;
    await eventually(()=>f.streams.filter(stream=>stream.active).length===1);
    f.publish({type:'tool/call',data:{turn:1,callId:'after-auto-restore',name:'read'}});
    await eventually(()=>f.visible.some(event=>event.type==='item'&&event.item.id==='after-auto-restore'));
    assert.equal(f.sends,1);
    let attempts=0;(f.remote.session as any).follow=()=>{attempts++;throw new Error('native transport unavailable');};
    await f.streams.find(stream=>stream.active)!.dispose();
    const deadline=Date.now()+3000;
    while(attempts<3&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(attempts,3);assert.equal(f.sends,1);
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
