/** SDK filesystem/config discovery is private to this process, never the host HOME. */
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { query, getSessionInfo, getSessionMessages, getSubagentMessages, forkSession, type Query, type SDKUserMessage, type PermissionResult, type SpawnOptions, type SpawnedProcess } from '@anthropic-ai/claude-agent-sdk';
import type { ExecutorEvent, ExecutorItem, ExecutorObservation, ExecutorRequest } from '../../contracts.ts';
import { checkedGateway, gatewayModel, type ExecutorGateway } from '../model-gateway.ts';
import { bounded, nativePreview } from '../native-process.ts';
import { claudeAnswers, claudeEffort, claudeGatewayEnvironment, claudeInputId, ClaudeItemProjector, claudeQuestion } from './protocol.ts';
import { ClaudeReceiptCursor } from './content.ts';
import { withExecutionFault } from '../../domain/execution-fault.ts';
import { ClaudeControlInput } from './control.ts';
import { ExecutorEventStream } from '../event-stream.ts';

console.log = console.info = console.warn = console.error = console.debug = () => {};
const write = (message: unknown) => process.stdout.write(JSON.stringify(message) + '\n');
let executable = '', instructions = '';
let gateway: ExecutorGateway | undefined;

class Inputs implements AsyncIterableIterator<SDKUserMessage> {
  private queue: SDKUserMessage[] = [];
  private waiter?: (value: IteratorResult<SDKUserMessage>) => void;
  private ended = false;
  [Symbol.asyncIterator]() { return this; }
  next(): Promise<IteratorResult<SDKUserMessage>> {
    if (this.queue.length) return Promise.resolve({done:false, value:this.queue.shift()!});
    if (this.ended) return Promise.resolve({done:true,value:undefined});
    return new Promise(resolve => { this.waiter = resolve; });
  }
  push(value: SDKUserMessage) {
    if (this.ended) throw new Error('agent_native_process_closed');
    if (this.waiter) { const resolve = this.waiter; this.waiter = undefined; resolve({done:false,value}); }
    else this.queue.push(value);
  }
  close() { this.ended = true; this.queue = []; this.waiter?.({done:true,value:undefined}); this.waiter = undefined; }
}
interface Pending {
  request: ExecutorRequest; input: Record<string, unknown>; toolId:string; settle(value: PermissionResult): void;
}
interface Round {
  id: string; inputId: string; requestId: string; accepted: boolean; terminal?: 'completed'|'stopped'|'failed';
  stopping: boolean; diagnostic?: string; resolve(): void; reject(error: Error): void; settled: Promise<void>;
  pending: Map<string, Pending>;
  outstanding:Set<string>;
  receiptTimer?:ReturnType<typeof setInterval>;
  lastResult?:any;
  acks: Map<string, { requestId:string; resolve(value:unknown):void; reject(error:Error):void }>;
}
interface Session {
  id: string; cwd: string; q: Query; inputs: Inputs; round?: Round; closed: boolean; initialized: boolean;
  mode: string; effort?: string;
  child?:ChildProcessWithoutNullStreams;
  cancelQueued?:boolean;
  cancelQueuedSupported?:boolean;
  tools: Map<string, {id:string; label:string; status:'running'|'completed'|'unknown'; taskId?:string}>;
  tasks: Map<string, {toolId?:string; active:boolean; background?:boolean; runId?:string; kind?:string}>;
  items: Map<string, ExecutorItem>;
  projector:ClaudeItemProjector;
  receipts:ClaudeReceiptCursor;
  streams: Map<string, {messageId:string; blocks:Map<number, {type:string;text:string;id?:string;name?:string;arguments?:string}>; used?:number}>;
}
const sessions = new Map<string, Session>();
const historyProjectors=new Map<string,ClaudeItemProjector>();
/** The prompt size of one model request: uncached plus cache reads and writes. */
const usageTokens = (usage:any) => ['input_tokens','cache_read_input_tokens','cache_creation_input_tokens']
  .reduce((sum,key)=>sum+(typeof usage?.[key]==='number'?usage[key]:0),0);
const streams = new WeakMap<Round, ExecutorEventStream>();
const emit = (session: Session, event: ExecutorEvent) => {
  const round = session.round;
  if (!round) return;
  let stream = streams.get(round);
  if (!stream) {
    stream = new ExecutorEventStream(value => write({
      method: 'event',
      params: { contextId: session.id, executionId: round.id, event: withExecutionFault(value) },
    }));
    streams.set(round, stream);
  }
  stream.push(event);
};
function observation(session: Session): ExecutorObservation {
  const round = session.round;
  const backgroundWork = [...session.tasks.values()].some(task=>task.active);
  const questionTools=new Set([...(round?.pending.values()??[])].filter(p=>p.request.kind==='question').map(p=>p.toolId));
  const tools = [...session.tools.values()]
    .filter(tool => !questionTools.has(tool.id))
    .map(({id, label, status, taskId}) => ({id, label, status, canStop: Boolean(taskId)}));
  const active = tools.some(tool=>tool.status!=='completed') || backgroundWork;
  return {
    status: session.closed && !round?.terminal ? 'unknown' : round?.pending.size ? 'waiting'
      : round?.terminal ? active ? 'tools-active' : round.terminal==='stopped' ? 'stopped' : 'idle' : round ? 'running' : 'idle',
    ...(round ? {executionRef:{id:round.id}} : {}), tools, backgroundWork,
    requests: [...(round?.pending.values()??[])].map(p=>p.request),
    ...(round?.diagnostic ? {diagnostic:round.diagnostic} : {}),
    canContinue: round?.terminal==='completed',
  };
}
function item(session: Session, value: ExecutorItem) {
  const previous = session.items.get(value.id);
  const next = {...previous,...value, ...(previous?.input && !value.input ? {input:previous.input}:{}),
    ...(previous?.parentToolId && !value.parentToolId ? {parentToolId:previous.parentToolId}:{})};
  if (next.kind === 'tool') {
    const old = session.tools.get(next.id);
    if(next.status==='completed'||next.status==='failed')for(const task of session.tasks.values())if(task.toolId===next.id&&task.background===false)task.active=false;
    const task = [...session.tasks].find(([,task])=>task.toolId===next.id&&task.active);
    const status = task ? 'running' : next.status==='completed'||next.status==='failed' ? 'completed' : next.status==='running' ? 'running' : 'unknown';
    session.tools.set(next.id,{id:next.id,label:next.name??old?.label??'工具',status,...(task?{taskId:task[0]}:old?.taskId?{taskId:old.taskId}:{})});
    if (task) next.status = 'running';
  }
  session.items.set(next.id,next); emit(session,{type:'item',item:next});
}
function admit(session: Session, uuid: string) {
  const round = session.round;
  if (!round) return;
  if (uuid === round.inputId && !round.accepted) {
    round.accepted = true;
    emit(session,{type:'accepted',executionRef:{id:round.id},inputItemId:uuid});
    if(round.lastResult)queueMicrotask(()=>{if(session.round===round&&!round.terminal)result(session,round.lastResult);});
  }
  const ack = round.acks.get(uuid);
  if (ack) { round.acks.delete(uuid); ack.resolve({executionRef:{id:round.id},inputItemId:uuid}); }
  if(round.accepted&&!round.acks.size){clearInterval(round.receiptTimer);round.receiptTimer=undefined;}
}
function watchReceipts(session:Session){
  const round=session.round;if(!round||round.receiptTimer)return;
  const read=()=>{
    if(session.closed||round!==session.round||round.terminal){clearInterval(round.receiptTimer);round.receiptTimer=undefined;return;}
    try{
      const expected=new Set([...(round.accepted?[]:[round.inputId]),...round.acks.keys()]);
      for(const uuid of session.receipts.read(expected))admit(session,uuid);
    }catch{/* Native streaming or later exact history can still establish admission. Never guess. */}
  };
  round.receiptTimer=setInterval(read,250);round.receiptTimer.unref();read();
}
function result(session: Session, message: any) {
  const round = session.round;
  if (!round) return;
  round.lastResult=message;
  for (const uuid of message.user_message_uuids??[message.user_message_uuid]) if (typeof uuid==='string') {admit(session,uuid);round.outstanding.delete(uuid);}
  // A result is a receipt for this input only when its exact UUID is present.
  if (!round.accepted) {
    if(message.is_error){emit(session,{type:'observation',observation:{...observation(session),status:'unknown',diagnostic:'agent_claude_input_unknown'}});round.reject(new Error('agent_claude_input_unknown'));}
    return;
  }
  if(message.is_error&&round.outstanding.size===1&&round.outstanding.has(round.inputId)&&!round.acks.size)round.outstanding.delete(round.inputId);
  if (round.acks.size||round.outstanding.size) return; // Supplements can be acknowledged before their own result.
  round.terminal = round.stopping ? 'stopped' : message.is_error || message.subtype!=='success' ? 'failed' : 'completed';
  clearInterval(round.receiptTimer);round.receiptTimer=undefined;
  if (message.is_error) round.diagnostic = 'agent_claude_execution_failed';
  emit(session,{type:'completed',status:round.terminal,diagnostic:round.diagnostic});
  emit(session,{type:'observation',observation:observation(session)});
  round.resolve();
}
async function event(session: Session, message: any) {
  const round = session.round;
  if (message.type==='system' && message.subtype==='init') { session.initialized=true;session.cancelQueuedSupported=message.capabilities?.includes('interrupt_cancel_queued_v1')===true;return; }
  if (!round) return;
  if(!message.parent_tool_use_id)for(const uuid of message.user_message_uuids??[message.user_message_uuid])if(typeof uuid==='string')admit(session,uuid);
  if (message.type==='user') {
    if (!message.parent_tool_use_id && typeof message.uuid==='string') admit(session,message.uuid);
    for (const entry of session.projector.items(message,round.id)) item(session,entry);
  } else if (message.type==='assistant') {
    for (const entry of session.projector.items(message,round.id)) item(session,entry);
  } else if (message.type==='stream_event') {
    const source = message.parent_tool_use_id??'main', e = message.event;
    if (e?.type==='message_start') session.streams.set(source,{messageId:e.message.id,blocks:new Map(),used:usageTokens(e.message?.usage)});
    const stream=session.streams.get(source); if (!stream) return;
    if (!message.parent_tool_use_id && ['message_delta','message_stop'].includes(e.type)) {
      // Streamed assistant frames carry non-final usage. The provider's last
      // request total arrives in message_delta; retain message_start's value
      // when a protocol reports the prompt size only there.
      const used=usageTokens(e.usage);
      if(used>0)stream.used=used;
      if(e.type==='message_stop'&&stream.used){
        const window=gateway?.models[0]?.contextWindow;
        emit(session,{type:'context-usage',usedTokens:stream.used,...(window?{windowTokens:window,usedRatio:stream.used/window}:{})});
      }
    }
    if (e.type==='content_block_start') {
      const block=e.content_block;
      stream.blocks.set(e.index,{type:block.type,text:block.text??block.thinking??'',id:block.id,name:block.name,arguments:''});
      if (block.type==='tool_use') item(session,{id:block.id,kind:'tool',role:'assistant',name:block.name,text:'',input:'{}',nativeTool:true,status:'running',executionId:round.id,...(message.parent_tool_use_id?{parentToolId:message.parent_tool_use_id}:{})});
    }
    const block=stream.blocks.get(e.index);
    if (e.type==='content_block_delta' && block) {
      if (e.delta.type==='text_delta'||e.delta.type==='thinking_delta') {
        block.text+=e.delta.text??e.delta.thinking??'';
        item(session,{id:`message:${stream.messageId}:${e.index}`,kind:block.type==='thinking'?'thinking':'message',role:'assistant',text:block.text,thinking:block.type==='thinking',status:'running',executionId:round.id,...(message.parent_tool_use_id?{parentToolId:message.parent_tool_use_id}:{})});
      } else if (e.delta.type==='input_json_delta' && block.id) {
        block.arguments=(block.arguments??'')+e.delta.partial_json;
        item(session,{id:block.id,kind:'tool',role:'assistant',name:block.name,input:nativePreview(block.arguments),text:'',nativeTool:true,status:'running',executionId:round.id});
      }
    }
  } else if (message.type==='system' && message.subtype==='api_retry' && [401,403].includes(message.error_status)) {
    // Invalid credentials are not transient. Stop the owned query before the
    // CLI's automatic API retry can replay a request with the same bad key.
    round.terminal='failed';round.diagnostic='agent_model_source_authentication_failed';
    clearInterval(round.receiptTimer);round.receiptTimer=undefined;
    session.closed=true;session.inputs.close();session.q.close();
    for(const ack of round.acks.values())ack.reject(new Error('agent_claude_input_unknown'));
    round.acks.clear();
    emit(session,{type:'completed',status:'failed',diagnostic:round.diagnostic});
    emit(session,{type:'observation',observation:observation(session)});round.resolve();
  } else if (message.type==='result') result(session,message);
  else if (message.type==='system' && message.subtype==='status') {
    emit(session,{type:'observation',observation:{...observation(session),contextCompaction:message.status==='compacting'?{id:message.uuid??randomUUID(),startedAt:new Date().toISOString()}:null}});
  } else if (message.type==='system' && message.subtype==='compact_boundary') {
    emit(session,{type:'observation',observation:{...observation(session),contextCompaction:null}});
  } else if (message.type==='system' && ['task_started','task_updated','task_notification'].includes(message.subtype)) {
    const task=session.tasks.get(message.task_id)??{active:true};
    if(task.runId&&message.run_id&&message.run_id<task.runId)return;
    if(message.run_id)task.runId=message.run_id;
    if(message.task_type)task.kind=message.task_type;
    if (message.tool_use_id) task.toolId=message.tool_use_id;
    if (typeof message.is_backgrounded==='boolean')task.background=message.is_backgrounded;
    if (typeof message.patch?.is_backgrounded==='boolean')task.background=message.patch.is_backgrounded;
    if (message.subtype==='task_notification') task.active=false;
    if(['completed','failed','killed'].includes(message.patch?.status))task.active=false;
    if(['running','pending','paused'].includes(message.patch?.status))task.active=true;
    session.tasks.set(message.task_id,task);
    if(message.subtype==='task_notification'&&task.kind==='local_agent'&&task.toolId){
      try{
        const projector=new ClaudeItemProjector();
        for(let offset=0;offset<100000;offset+=100){
          const rows=await getSubagentMessages(session.id,message.task_id,{dir:session.cwd,offset,limit:100});
          for(const row of rows)for(const entry of projector.items({...row,parent_tool_use_id:row.parent_tool_use_id??task.toolId},round.id))item(session,entry);
          if(rows.length<100)break;
        }
      }catch{
        emit(session,{type:'diagnostic',message:'agent_claude_child_history_unavailable'});
      }
    }
    if (task.toolId) {
      const tool=session.tools.get(task.toolId);
      if (tool) { tool.taskId=message.task_id; tool.status=task.active?'running':'completed'; }
    }
    emit(session,{type:'observation',observation:observation(session)});
  } else if(message.type==='system'&&message.subtype==='background_tasks_changed'){
    const active=new Set<string>((message.tasks??[]).map((task:any)=>task.task_id));
    for(const [id,task] of session.tasks)if(task.background&&!active.has(id)){
      task.active=false;if(task.toolId){const tool=session.tools.get(task.toolId);if(tool)tool.status='completed';}
    }
    for(const native of message.tasks??[]){
      const task=session.tasks.get(native.task_id)??{active:true};
      task.active=true;task.background=true;session.tasks.set(native.task_id,task);
    }
    emit(session,{type:'observation',observation:observation(session)});
  } else if (message.type==='system' && ['session_writes_lost','mirror_error'].includes(message.subtype)) {
    round.diagnostic='agent_claude_history_unavailable';
    emit(session,{type:'diagnostic',message:round.diagnostic});
  }
}
async function permission(session: Session, name: string, input: Record<string,unknown>, options: any): Promise<PermissionResult> {
  const round=session.round;
  if (!round || session.closed) return {behavior:'deny',message:'No active owning execution.'};
  const id=options.requestId??options.toolUseID;
  if (!id || round.pending.has(id)) return {behavior:'deny',message:'Request identity unavailable.'};
  const parent=options.agentID?session.tasks.get(options.agentID)?.toolId:undefined;
  const request:ExecutorRequest=name==='AskUserQuestion'?claudeQuestion(id,input,parent):{
    id,kind:'approval',title:options.title??`允许 ${name}？`,description:options.description??JSON.stringify(input),
    options:[{id:'approve',label:'允许'},{id:'deny',label:'拒绝'}],...(parent?{parentToolId:parent}:{}),
  };
  return new Promise(resolve=>{
    const finish=(value:PermissionResult)=>{ options.signal.removeEventListener('abort',abort); round.pending.delete(id); emit(session,{type:'request-resolved',requestId:id}); resolve(value); };
    const abort=()=>finish({behavior:'deny',message:'The original request was cancelled.'});
    round.pending.set(id,{request,input,toolId:options.toolUseID,settle:finish});
    options.signal.addEventListener('abort',abort,{once:true});
    emit(session,{type:'request',request});
    emit(session,{type:'observation',observation:observation(session)});
    if(options.signal.aborted)abort();
  });
}
const nativeChildren=new Set<ChildProcessWithoutNullStreams>();
function spawnNative(options:SpawnOptions,onSpawn:(child:ChildProcessWithoutNullStreams)=>void,cancelQueued:()=>boolean):SpawnedProcess{
  const child=spawn(options.command,options.args,{cwd:options.cwd,env:options.env,signal:options.signal,stdio:['pipe','pipe','pipe'],windowsHide:true});
  nativeChildren.add(child);child.once('exit',()=>nativeChildren.delete(child));onSpawn(child);child.stderr.on('data',()=>{});
  const stdin=new ClaudeControlInput(cancelQueued);
  stdin.pipe(child.stdin);child.stdin.on('error',error=>stdin.destroy(error));
  return {stdin,stdout:child.stdout,get killed(){return child.killed;},get exitCode(){return child.exitCode;},get signalCode(){return child.signalCode;},
    kill:signal=>child.kill(signal),once:(name,listener)=>{child.once(name,listener);},on:(name,listener)=>{child.on(name,listener);},off:(name,listener)=>{child.off(name,listener);}};
}
async function waitNativeExit(child?:ChildProcessWithoutNullStreams){
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));
  try{await bounded(exited,1500);}catch{child.kill('SIGKILL');await bounded(exited,1500);}
}
async function closeNative(){
  for(const session of sessions.values()){session.closed=true;clearInterval(session.round?.receiptTimer);session.inputs.close();session.q.close();}
  await Promise.all([...nativeChildren].map(async child=>{if(!child.stdin.writableEnded)child.stdin.end();await waitNativeExit(child);}));
}
async function open(params: any): Promise<Session> {
  const old=sessions.get(params.contextId);
  if (old && !old.closed) {
    if(old.cwd!==params.cwd)throw new Error('agent_context_binding_mismatch');
    return old;
  }
  if (!gateway) throw new Error('agent_model_source_unavailable');
  const inputs=new Inputs(), mode=params.permissionMode==='full-access'?'bypassPermissions':'default';
  const model=gatewayModel(gateway,params.model),effort=claudeEffort(gateway,params.model,params.reasoningEffort);
  const persisted=await getSessionInfo(params.contextId,{dir:params.cwd});
  const configRoot=path.dirname(process.env.CLAUDE_CONFIG_DIR!);
  const root=path.resolve(configRoot,configRoot.includes(`${path.sep}model-bindings${path.sep}`)?'../../../..':'../..');
  const receipts=new ClaudeReceiptCursor({root,configRoot,contextId:params.contextId,cwd:params.cwd});
  const session:Session={id:params.contextId,cwd:params.cwd,q:undefined!,inputs,closed:false,initialized:false,mode,effort,tools:new Map(),tasks:new Map(),items:new Map(),projector:new ClaudeItemProjector(),receipts,streams:new Map()};
  session.q=query({prompt:inputs,options:{
    cwd:params.cwd,pathToClaudeCodeExecutable:executable,
    ...(persisted?{resume:params.contextId}:{sessionId:params.contextId}),
    model:model.id, permissionMode:mode,allowDangerouslySkipPermissions:true,
    env:{...process.env},settingSources:['project','local'],
    skills:'all',
    systemPrompt:{type:'preset',preset:'claude_code',append:instructions},
    settings:{env:{...claudeGatewayEnvironment(gateway),CLAUDE_CONFIG_DIR:process.env.CLAUDE_CONFIG_DIR!,CLAUDE_CODE_TMPDIR:process.env.CLAUDE_CODE_TMPDIR!},model:model.id,attribution:{commit:'',pr:''},
      ...(!model.reasoningEfforts?.length?{alwaysThinkingEnabled:false}:{})},
    canUseTool:(name,input,options)=>permission(session,name,input,options),
    includePartialMessages:true,forwardSubagentText:true,persistSession:true,
    spawnClaudeCodeProcess:options=>spawnNative(options,child=>{session.child=child;},()=>session.cancelQueued===true),
    extraArgs:{'replay-user-messages':null},
    stderr:()=>{}, // Never forward raw CLI diagnostics or secrets to host events.
  }});
  sessions.set(session.id,session);
  void (async()=>{
    try { for await (const message of session.q) await event(session,message); }
    catch { if(session.round&&!session.closed){session.round.diagnostic='agent_claude_observation_lost';emit(session,{type:'observation',observation:{...observation(session),status:'unknown'}});session.round.reject(new Error('agent_claude_observation_lost'));} }
    finally {
      session.closed=true;inputs.close();
      clearInterval(session.round?.receiptTimer);
      for(const ack of session.round?.acks.values()??[])ack.reject(new Error('agent_claude_input_unknown'));
      if(session.round&&!session.round.terminal)session.round.reject(new Error('agent_claude_observation_lost'));
    }
  })();
  return session;
}
async function user(params:any):Promise<SDKUserMessage> {
  const content:any[]=[{type:'text',text:params.text}];
  for(const image of params.images??[]) {
    const bytes=await readFile(image.path);
    if(bytes.length>8*1024*1024)throw new Error('agent_image_invalid');
    content.push({type:'image',source:{type:'base64',media_type:image.mimeType,data:bytes.toString('base64')}});
  }
  return {type:'user',message:{role:'user',content},parent_tool_use_id:null,session_id:params.contextId,uuid:claudeInputId(params.clientRequestId) as `${string}-${string}-${string}-${string}-${string}`};
}
function exact(params:any):Session {
  const session=sessions.get(params.contextId);
  if(!session || params.executionId&&session.round?.id!==params.executionId)throw new Error('agent_exact_live_turn_unavailable');
  return session;
}
async function dispatch(method:string,params:any):Promise<unknown> {
  if(method==='initialize'){executable=params.executable;instructions=params.instructions;gateway=checkedGateway(params.gateway);return{};}
  if(method==='title'){return (await getSessionInfo(params.contextId,{dir:params.cwd}))?.customTitle;}
  if(method==='probe'){
    const inputs=new Inputs();
    let child:ChildProcessWithoutNullStreams|undefined;
    const q=query({prompt:inputs,options:{cwd:process.cwd(),pathToClaudeCodeExecutable:executable,env:{...process.env},settingSources:[],tools:[],persistSession:false,stderr:()=>{},spawnClaudeCodeProcess:options=>spawnNative(options,value=>{child=value;},()=>false)}});
    try{await bounded(q.initializationResult(),10000);return{};}
    finally{inputs.close();q.close();await waitNativeExit(child);}
  }
  if(method==='history'){
    if(!params.offset){if(historyProjectors.size>=8)historyProjectors.delete(historyProjectors.keys().next().value!);historyProjectors.set(params.contextId,new ClaudeItemProjector());}
    const projector=historyProjectors.get(params.contextId);if(!projector)throw new Error('agent_history_cursor_invalid');
    const rows=await getSessionMessages(params.contextId,{dir:params.cwd,limit:100,offset:params.offset??0,includeSystemMessages:true});
    return {items:rows.flatMap(row=>projector.items(row)),nextOffset:rows.length===100?(params.offset??0)+100:undefined};
  }
  if(method==='fork'){
    let row;const projector=new ClaudeItemProjector();
    for(let offset=0;offset<100000;offset+=100){
      const rows=await getSessionMessages(params.contextId,{dir:params.cwd,limit:100,offset});
      row=rows.find(row=>projector.items(row).some(item=>item.id===params.itemId));
      if(row||rows.length<100)break;
    }
    if(!row)throw new Error('agent_fork_boundary_unavailable');
    return await forkSession(params.contextId,{dir:params.cwd,upToMessageId:row.uuid});
  }
  if(method==='prepare'){await open(params);return{};}
  if(method==='send'){
    const input=await user(params),session=await open(params);
    const previous=observation(session);
    if(session.round&&(!session.round.terminal||previous.backgroundWork||previous.tools.some(tool=>tool.status!=='completed')||session.round.pending.size||session.round.acks.size))throw new Error('agent_execution_busy');
    await session.q.setPermissionMode(params.permissionMode==='full-access'?'bypassPermissions':'default');
    await session.q.applyFlagSettings({effortLevel:claudeEffort(gateway!,params.model,params.reasoningEffort)??null});
    const round:Round={id:params.executionId,inputId:input.uuid!,requestId:params.clientRequestId,accepted:false,stopping:false,pending:new Map(),outstanding:new Set([input.uuid!]),acks:new Map(),resolve:()=>{},reject:()=>{},settled:undefined!};
    round.settled=new Promise<void>((resolve,reject)=>{round.resolve=resolve;round.reject=reject;});
    // The prior turn is proven quiescent above. Durable native history owns
    // its content; live tool/stream observation belongs only to the new turn.
    session.tools.clear();session.tasks.clear();session.items.clear();session.streams.clear();session.projector=new ClaudeItemProjector();
    session.round=round;session.inputs.push(input);watchReceipts(session);
    await round.settled;return{};
  }
  if(method==='supplement'){
    const session=exact(params),round=session.round!;
    if(session.closed||round.terminal||round.stopping)throw new Error('agent_supplement_unavailable');
    const input=await user(params),id=input.uuid!;
    // stop() can linearize while image bytes are being read. Never enqueue
    // an input after the native interrupt has already cancelled its queue.
    if(session.closed||session.round!==round||round.terminal||round.stopping)throw new Error('agent_supplement_unavailable');
    if(round.acks.has(id))throw new Error('agent_input_already_dispatched');
    const receipt=new Promise((resolve,reject)=>round.acks.set(id,{requestId:params.clientRequestId,resolve,reject}));
    round.outstanding.add(id);session.inputs.push(input);watchReceipts(session);return await receipt;
  }
  if(method==='observe'){
    const session=sessions.get(params.contextId);
    return session?observation(exact(params)):{status:'unknown',tools:[],diagnostic:'agent_exact_live_turn_unavailable'};
  }
  if(method==='reply'){
    const session=exact(params),pending=session.round?.pending.get(params.requestId);
    if(!pending)throw new Error('agent_request_stale');
    if(pending.request.kind==='approval') {
      if(!['approve','deny'].includes(params.answer))throw new Error('agent_approval_answer_invalid');
      pending.settle(params.answer==='approve'?{behavior:'allow',updatedInput:pending.input}:{behavior:'deny',message:'User declined this operation.'});
    } else pending.settle({behavior:'allow',updatedInput:claudeAnswers(pending.request,pending.input,params.answer)});
    return{};
  }
  if(method==='stop'){
    const session=exact(params),round=session.round!;
    if(params.toolId){
      const tool=session.tools.get(params.toolId);
      if(!tool?.taskId)throw new Error('agent_exact_tool_stop_unavailable');
      await bounded(session.q.stopTask(tool.taskId),5000);
    }else{
      round.stopping=true;
      const tasks=[...session.tasks].filter(([,task])=>task.active);
      await Promise.all(tasks.map(async([id])=>{await bounded(session.q.stopTask(id),5000);}));
      // Older/mismatched CLIs cannot atomically clear their queue. Terminate only
      // this exact native child before it can dispatch queued model work.
      if(!session.cancelQueuedSupported&&(round.acks.size||round.outstanding.size>1)){
        session.child?.kill('SIGKILL');session.closed=true;session.inputs.close();session.q.close();
        round.diagnostic='agent_claude_stop_outcome_unknown';round.reject(new Error(round.diagnostic));
        return {...observation(session),status:'unknown',diagnostic:round.diagnostic};
      }
      let receipt;
      session.cancelQueued=true;
      try{receipt=await bounded(session.q.interrupt(),5000);}
      finally{session.cancelQueued=false;}
      for(const uuid of receipt?.cancelled??[]){
        round.outstanding.delete(uuid);
        round.acks.get(uuid)?.reject(new Error('agent_supplement_cancelled'));
        round.acks.delete(uuid);
      }
      if(!round.terminal&&round.lastResult&&!round.outstanding.size)result(session,round.lastResult);
      // interrupt() does not cancel queued input. Close this owned native query
      // before it can run queued work; lost outcomes remain unknown.
      if(!receipt||receipt.still_queued?.length||round.acks.size){
        session.closed=true;session.inputs.close();session.q.close();
        round.diagnostic='agent_claude_stop_outcome_unknown';
        round.reject(new Error(round.diagnostic));
        return {...observation(session),status:'unknown',diagnostic:round.diagnostic};
      }
    }
    return observation(session);
  }
  if(method==='can-release'){
    const session=exact(params),value=observation(session);
    return Boolean(session.round?.terminal)&&!value.backgroundWork&&!session.round?.pending.size&&!session.round?.acks.size&&value.tools.every(tool=>tool.status==='completed');
  }
  if(method==='release-unaccepted'){
    const session=exact(params),round=session.round;
    return Boolean(round&&session.closed&&round.requestId===params.clientRequestId&&!round.accepted);
  }
  if(method==='close'){
    await closeNative();return{};
  }
  throw new Error('agent_native_method_unsupported');
}
const lines=createInterface({input:process.stdin});
lines.on('line',line=>{
  let message:any;
  try{message=JSON.parse(line);}catch{write({error:{message:'agent_native_protocol_invalid'}});return;}
  void dispatch(message.method,message.params??{}).then(result=>write({id:message.id,result}),error=>{
    const code=error instanceof Error&&/^(agent_|claude_)[a-z0-9_]+$/.test(error.message)?error.message:'agent_claude_request_failed';
    write({id:message.id,error:{message:code}});
  });
});
lines.on('close',()=>{void closeNative().catch(()=>{});});

// Normal host shutdown and a direct termination signal must both dispose the
// live SDK-owned children. A hard crash remains unknown until physical proof.
let shuttingDown=false;
async function shutdown(){
  if(shuttingDown)return;shuttingDown=true;
  await closeNative().catch(()=>{});
  process.exit(0);
}
process.once('SIGTERM',()=>{void shutdown();});
process.once('SIGINT',()=>{void shutdown();});
