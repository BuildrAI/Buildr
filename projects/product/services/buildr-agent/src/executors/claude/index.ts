import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AccountObservation, AgentExecutor, AgentRuntime, ContextRef, ExecutorEvent, ExecutorForkInput, ExecutorItem, ExecutorObservation, ExecutorOpenOptions, ExecutorSendInput, ExecutorSupplementInput, ExecutorTitleInput, LoginObservation, PermissionMode } from '../../contracts.ts';
import { withExecutionFault } from '../../domain/execution-fault.ts';
import { interactionPolicy } from '../../domain/interaction-policy.ts';
import { instructionParticipation } from '../../domain/participation.ts';
import { HANDOFF_SUMMARY_PROMPT } from '../../domain/handoff-material.ts';
import { checkedGateway, consumerBinding, type ExecutorGateway } from '../model-gateway.ts';
import { findExecutable, inspectVersion, isolatedEnvironment, nativeHome, NativeRpc, opaqueReference, ownedProcessGroupIdle, parseReference, privateDirectories, releasedNativeControl } from '../native-process.ts';
import { isCompatibleProgram } from '../program-policy.ts';
import { generateModelTitle } from '../model-title.ts';
import { claudeEffort, claudeGatewayEnvironment } from './protocol.ts';
import { claudeContent, readClaudePersistedExecution, readClaudeSupplementReceipt } from './content.ts';
import { importClaudeFork } from './fork.ts';

const provider = 'claude-code';
const capabilities = {
  interaction:{policy:interactionPolicy.version,nonBlockingQuestions:false},supplement:true,
  permissionModes:['default','full-access'] as PermissionMode[],
  text:true,images:true,maxImageBytes:8*1024*1024,approval:true,questions:true,stop:true,resume:true,maxInputBytes:96*1024,
};
export function createClaudeExecutor(): AgentExecutor {
  return {
    descriptor:{id:provider,label:'Claude Code',capabilities},nativeContent:claudeContent,
    readReleasedControl:input=>releasedNativeControl(provider,input),
    readPersistedExecution:readClaudePersistedExecution,readSupplementReceipt:readClaudeSupplementReceipt,
    storage:{transientDirectories:[]},
    open:options=>ClaudeRuntime.open(options),
  };
}
class ClaudeRuntime implements AgentRuntime {
  readonly capabilities=capabilities;
  readonly bindingIdentity:string;
  bindingData?:Record<string,unknown>;
  readonly participationInstruction;
  private readonly rpc:NativeRpc;
  private readonly gateway?:ExecutorGateway;
  private readonly configRoot:string;
  private readonly handlers=new Map<string,ExecutorSendInput['onEvent']>();
  private readonly executionContexts=new Map<string,string>();
  private readonly observations=new Map<string,ExecutorObservation>();
  private readonly contexts=new Map<string,string>();
  private readonly releaseProofs=new Set<string>();
  private readonly submissions=new Map<string,{contextId:string;executionId:string;settled:boolean;accepted:boolean}>();
  private constructor(rpc:NativeRpc,binding:{identity:string;data:Record<string,unknown>},gateway:ExecutorGateway|undefined,instructions:string,configRoot:string) {
    this.configRoot=configRoot;
    this.rpc=rpc;this.bindingIdentity=binding.identity;this.bindingData=binding.data;this.gateway=gateway;
    this.participationInstruction=instructionParticipation('interaction-policy',instructions);
    rpc.onMessage(message=>{
      if(message.method==='buildr/transportClosed'||message.method==='buildr/eventConsumerFailed'){
        for(const [id,handler] of this.handlers){
          const prior=this.observations.get(this.executionContexts.get(id)??'');
          if(prior?.executionRef&&prior.executionRef.id!==id)continue;
          if(prior&&['idle','stopped'].includes(prior.status)&&!prior.backgroundWork&&!prior.requests?.length&&prior.tools.every(tool=>tool.status==='completed'))continue;
          const observation:ExecutorObservation={...prior,status:'unknown',tools:prior?.tools??[],diagnostic:'agent_claude_observation_lost'};
          this.observations.set(this.executionContexts.get(id)??id,observation);handler(withExecutionFault({type:'observation',observation}));
        }
        return;
      }
      if(message.method!=='event')return;
      const {contextId,executionId}=message.params,event=message.params.event as ExecutorEvent;
      if(event.type==='accepted') {
        const submission=[...this.submissions.values()].find(value=>value.executionId===executionId);if(submission)submission.accepted=true;
        event.executionRef=rpc.executionRef(event.executionRef.id,contextId,this.bindingIdentity);
        this.observations.set(contextId,{status:'running',executionRef:event.executionRef,tools:[]});
      }
      if(event.type==='observation'){
        if(event.observation.executionRef)event.observation.executionRef=rpc.executionRef(event.observation.executionRef.id,contextId,this.bindingIdentity,event.observation.backgroundWork===true);
        this.observations.set(contextId,event.observation);
      }
      this.handlers.get(executionId)?.(event);
    });
  }
  static async open(options:ExecutorOpenOptions):Promise<ClaudeRuntime> {
    options.signal?.throwIfAborted();
    const gateway=checkedGateway(options.gateway),{home,temporary}=nativeHome(options.configRoot);
    const config=join(options.configRoot,'claude-config');
    // Claude's complete host-HOME override has not been established. Preserve the
    // private HOME fallback rather than leaking host settings/keychain discovery.
    const env=isolatedEnvironment(options.environment,home,temporary,{
      CLAUDE_CONFIG_DIR:config,CLAUDE_CODE_TMPDIR:temporary,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1',
      ...(gateway?claudeGatewayEnvironment(gateway):{}),
    },options.cacheRoot);
    await privateDirectories(options.configRoot,home,temporary,config);
    const executable=await findExecutable(options.executable,['claude','claude.exe'],env);
    const version=await inspectVersion(executable,env,options.signal);
    if(!isCompatibleProgram(provider,version))throw new Error('agent_claude_version_unsupported');
    const binding=await consumerBinding(provider,executable,version,config,options);
    const rpc=new NativeRpc(process.execPath,[fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'./worker.ts':'./worker.js',import.meta.url))],{cwd:options.configRoot,env,diagnostics:options.diagnostics});
    const instructions=(options.interaction??interactionPolicy).instructions+'\n必要业务提问使用 AskUserQuestion。完全访问不表示业务问题已获回答。';
    const runtime=new ClaudeRuntime(rpc,binding,gateway,instructions,options.configRoot);
    const abort=()=>{void rpc.close();};
    options.signal?.addEventListener('abort',abort,{once:true});
    try{
      await rpc.call('initialize',{executable,instructions,...(gateway?{gateway}:{})});
      if(!gateway)await rpc.call('probe',{},15000);
      options.signal?.throwIfAborted();return runtime;
    }catch(error){await rpc.close();throw error;}
    finally{options.signal?.removeEventListener('abort',abort);}
  }
  get closed(){return this.rpc.closed;}
  private reference(context:ContextRef,cwd?:string):string {
    const saved=this.contexts.get(context.id)??context.data?.cwd;
    if(typeof saved!=='string'||cwd&&saved!==cwd||parseReference(String(context.data?.native??''),provider,saved,this.bindingIdentity).nativeSessionId!==context.id)throw new Error('agent_context_binding_mismatch');
    this.contexts.set(context.id,saved);return saved;
  }
  async inspectAccount():Promise<AccountObservation> {
    return {status:'ready',label:'使用所选模型账号',loginMethod:'shared-model-gateway'};
  }
  async models(){return structuredClone(this.gateway?.models??[]);}
  async beginLogin(update:(value:LoginObservation)=>void):Promise<void>{
    update({state:'failed',diagnostic:'Claude Code 使用模型页的 API Key 或已有模型来源，不提供 claude.ai 订阅登录。'});
  }
  async cancelLogin():Promise<void>{}
  async verifyUpgrade():Promise<void>{await this.rpc.call('probe',{},15000);}
  async createContext({cwd}:{cwd:string}):Promise<ContextRef>{
    const id=randomUUID();this.contexts.set(id,cwd);
    return{id,data:{cwd,native:opaqueReference(provider,id,cwd,this.bindingIdentity)}};
  }
  async resumeContext({contextRef,cwd}:{contextRef:ContextRef;cwd:string}):Promise<void>{this.reference(contextRef,cwd);}
  async prepareContext(input:Parameters<NonNullable<AgentRuntime['prepareContext']>>[0]):Promise<void>{
    this.reference(input.contextRef,input.cwd);
    if(this.gateway)claudeEffort(this.gateway,input.model,input.reasoningEffort);
    // No model request and no work input is admitted during preparation.
  }
  async readHistory({contextRef,cwd}:{contextRef:ContextRef;cwd:string}):Promise<ExecutorItem[]>{
    this.reference(contextRef,cwd);
    const items=new Map<string,ExecutorItem>();let offset=0,bytes=0;
    for(let page=0;page<1000;page++){
      const result=await this.rpc.call('history',{contextId:contextRef.id,cwd,offset});
      for(const item of result.items){bytes+=Buffer.byteLength(JSON.stringify(item));if(bytes>64*1024*1024)throw new Error('agent_history_too_large');items.set(item.id,{...items.get(item.id),...item});}
      if(result.nextOffset===undefined)return [...items.values()];
      if(result.nextOffset<=offset)throw new Error('agent_history_cursor_invalid');offset=result.nextOffset;
    }
    throw new Error('agent_history_too_large');
  }
  async forkContext(input:ExecutorForkInput):Promise<ContextRef>{
    if(!(input.source instanceof ClaudeRuntime))throw new Error('agent_context_binding_mismatch');
    input.source.reference(input.contextRef,input.cwd);
    const result=await input.source.rpc.call('fork',{contextId:input.contextRef.id,cwd:input.cwd,itemId:input.itemId});
    if(!result.sessionId||result.sessionId===input.contextRef.id)throw new Error('agent_fork_identity_invalid');
    const context={id:result.sessionId,data:{cwd:input.cwd,native:opaqueReference(provider,result.sessionId,input.cwd,this.bindingIdentity)}};
    this.contexts.set(context.id,input.cwd);input.onCreated(context);
    if(input.source.configRoot!==this.configRoot)await importClaudeFork(input.source.configRoot,this.configRoot,result.sessionId,input.cwd,input.rebindReasoning,
      input.source.gateway?.models[0]&&this.gateway?.models[0]?{from:input.source.gateway.models[0].id,to:this.gateway.models[0].id}:undefined);
    return context;
  }
  async send(input:ExecutorSendInput):Promise<void>{
    this.reference(input.contextRef,input.cwd);
    if(!this.gateway)throw new Error('agent_model_source_unavailable');
    claudeEffort(this.gateway,input.model,input.reasoningEffort);
    const executionId=randomUUID();this.handlers.set(executionId,input.onEvent);
    this.executionContexts.set(executionId,input.contextRef.id);
    const submission={contextId:input.contextRef.id,executionId,settled:false,accepted:false};this.submissions.set(input.clientRequestId,submission);
    try{await this.rpc.call('send',{...input,contextId:input.contextRef.id,contextRef:undefined,onEvent:undefined,executionId},24*60*60_000);}
    catch(error){
      const prior=this.observations.get(input.contextRef.id);
      const current=prior?.executionRef?.id===executionId?prior:undefined;
      input.onEvent(withExecutionFault({type:'observation',observation:{...current,status:'unknown',tools:current?.tools??[],diagnostic:error instanceof Error?error.message:'agent_claude_observation_lost'}}));
      throw error;
    }
    finally{submission.settled=true;}
  }
  async supplement(input:ExecutorSupplementInput){
    this.reference(input.contextRef,input.cwd);
    return await this.rpc.call('supplement',{...input,contextRef:undefined,executionRef:undefined,contextId:input.contextRef.id,executionId:input.executionRef.id},30000);
  }
  async observe({contextRef,executionRef}:Parameters<AgentRuntime['observe']>[0]):Promise<ExecutorObservation>{
    this.reference(contextRef);
    const value=await this.rpc.call('observe',{contextId:contextRef.id,executionId:executionRef?.id});
    if(value.executionRef)value.executionRef=this.rpc.executionRef(value.executionRef.id,contextRef.id,this.bindingIdentity,value.backgroundWork===true);
    this.observations.set(contextRef.id,value);return value;
  }
  async reply(input:Parameters<AgentRuntime['reply']>[0]):Promise<void>{
    this.reference(input.contextRef);
    await this.rpc.call('reply',{contextId:input.contextRef.id,executionId:input.executionRef.id,requestId:input.requestId,answer:input.answer});
  }
  async stop(input:Parameters<AgentRuntime['stop']>[0]):Promise<ExecutorObservation>{
    this.reference(input.contextRef);
    const value=await this.rpc.call('stop',{contextId:input.contextRef.id,executionId:input.executionRef.id,toolId:input.toolId},15000);
    return {...value,executionRef:input.executionRef};
  }
  async canRelease(input:Parameters<NonNullable<AgentRuntime['canRelease']>>[0]):Promise<boolean|{executionState:'ended'|'unknown'}>{
    this.reference(input.contextRef);
    const owned=input.executionRef.data?.resourceGroup===this.rpc.child.pid;
    if(owned&&!this.closed){
      if(!await this.prepareRelease(input))return false;
    }
    const ended=this.releaseProofs.has(input.executionRef.id);
    const reference=ended&&input.executionRef.data?{...input.executionRef,data:{...input.executionRef.data,backgroundWork:false}}:input.executionRef;
    return await this.rpc.control.releaseExecution(reference,input.contextRef.id,this.bindingIdentity,{ended,executionState:ended?'ended':'unknown',channelClosed:this.closed});
  }
  async prepareRelease(input:Parameters<NonNullable<AgentRuntime['prepareRelease']>>[0]):Promise<boolean>{
    this.reference(input.contextRef);
    if(this.closed||input.executionRef.data?.resourceGroup!==this.rpc.child.pid)return Boolean(await this.canRelease(input));
    const safe=Boolean(await this.rpc.call('can-release',{contextId:input.contextRef.id,executionId:input.executionRef.id}));
    if(safe)this.releaseProofs.add(input.executionRef.id);
    return safe;
  }
  async releaseUnaccepted(input:Parameters<NonNullable<AgentRuntime['releaseUnaccepted']>>[0]):Promise<false|{executionState:'unknown'}>{
    this.reference(input.contextRef);
    const submission=this.submissions.get(input.clientRequestId);
    if(!submission||submission.contextId!==input.contextRef.id||!submission.settled||submission.accepted)return false;
    if(!this.closed&&!await this.rpc.call('release-unaccepted',{contextId:input.contextRef.id,executionId:submission.executionId,clientRequestId:input.clientRequestId}))return false;
    const reference=this.rpc.executionRef(submission.executionId,input.contextRef.id,this.bindingIdentity);
    const released=await this.rpc.control.releaseExecution(reference,input.contextRef.id,this.bindingIdentity,{ended:true,executionState:'unknown',channelClosed:this.closed});
    return released?{executionState:'unknown'}:false;
  }
  async canReclaimStorage():Promise<boolean>{return this.closed&&Boolean(this.rpc.child.pid)&&await ownedProcessGroupIdle(this.rpc.child.pid!);}
  async generateTitle(input:ExecutorTitleInput):Promise<string|undefined>{
    this.reference(input.contextRef,input.cwd);
    const gateway=this.gateway;if(!gateway)return;
    return await generateModelTitle(input,gateway.models[0]!.id,'anthropic-messages',init=>fetch(gateway.baseUrl+'/messages',{...init,headers:{...init.headers,authorization:'Bearer '+gateway.apiKey}}));
  }
  async readTitle(input:{contextRef:ContextRef;cwd:string}):Promise<string|undefined>{
    this.reference(input.contextRef,input.cwd);return await this.rpc.call('title',{contextId:input.contextRef.id,cwd:input.cwd});
  }
  async summarizeHandoff(input:ExecutorTitleInput):Promise<string|undefined>{
    this.reference(input.contextRef,input.cwd);input.signal.throwIfAborted();
    const gateway=this.gateway;if(!gateway)return;
    if(Buffer.byteLength(input.description)>48*1024)throw new Error('agent_handoff_summary_input_too_large');
    const response=await fetch(gateway.baseUrl+'/messages',{method:'POST',signal:input.signal,
      headers:{'content-type':'application/json',authorization:'Bearer '+gateway.apiKey},
      body:JSON.stringify({model:gateway.models[0]!.id,system:HANDOFF_SUMMARY_PROMPT,messages:[{role:'user',content:input.description}],tools:[],stream:false,max_tokens:Math.min(2048,gateway.models[0]!.maxOutputTokens??2048)})});
    if(!response.ok){await response.body?.cancel();throw new Error('agent_handoff_summary_failed');}
    if(!response.body)throw new Error('agent_handoff_summary_failed');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    try{for(;;){input.signal.throwIfAborted();const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>1024*1024)throw new Error('agent_handoff_summary_too_large');chunks.push(chunk.value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(value.stop_reason==='max_tokens'||!Array.isArray(value.content)||value.content.some((part:any)=>!['text','thinking','redacted_thinking'].includes(part.type)))throw new Error('agent_handoff_summary_invalid');
    const text=value.content.filter((part:any)=>part.type==='text').map((part:any)=>part.text??'').join('').trim();
    if(!text)throw new Error('agent_handoff_summary_invalid');return text;
  }
  async close():Promise<void>{
    try{if(!this.closed)await this.rpc.call('close',{},5000);}
    catch(error){if(!this.closed)throw error;} // A concurrently exiting owned worker already closed its transport.
    finally{await this.rpc.close();this.handlers.clear();this.executionContexts.clear();}
  }
}
