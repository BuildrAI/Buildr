import { createDecipheriv, createHash, randomUUID } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelProvider, ModelOffering, ModelProviderObservation, ProtocolJson } from '../contracts.ts';
import type { AccountObservation } from '../../contracts.ts';
import { record, string, positive } from './private-account.ts';
import { buildAuthHeaders, qoderEncodeBody } from './qoder-signing.ts';
import { ModelAccessError } from '../contracts.ts';
import { upstreamFailure } from '../errors.ts';
import { qoderAccountFailure, qoderAuthenticationError, qoderTeamQuotaMessage } from './qoder-auth.ts';

/** Read only the exact Buildr private profile. The native CLI remains the credential writer. */
export async function readQoderIdentity(config: string) {
  const root = join(config, '.auth');
  for (const file of [root, join(root,'user'), join(root,'machine_id')]) {
    const stat=await lstat(file); if(stat.isSymbolicLink() || (file!==root && (!stat.isFile() || stat.nlink!==1))) throw new Error('qoder_credential_unsafe');
  }
  const machineID=(await readFile(join(root,'machine_id'),'utf8')).trim();
  const key=Buffer.from(machineID.slice(0,16));
  const decipher=createDecipheriv('aes-128-cbc',key,key);
  const user=record(JSON.parse(Buffer.concat([decipher.update(Buffer.from((await readFile(join(root,'user'),'utf8')).trim(),'base64')),decipher.final()]).toString('utf8')));
  const userID=string(user.uid),authToken=string(user.security_oauth_token)??string(user.access_token);
  if(!userID||!authToken) throw new Error('qoder_login_required');
  return {userID,authToken,machineID,name:string(user.name)??'',email:string(user.email)??''};
}
/** Only the fixed model and quota endpoints are reachable through this owner. */
export async function requestQoderModel(config: string, path: string, init: RequestInit = {}, fetchFn: typeof fetch=fetch, expectedIdentity?:string):Promise<Response> {
  if(path!=='/models'&&path!=='/chat'&&path!=='/usage') throw new Error('qoder_model_target_invalid');
  const creds=await readQoderIdentity(config);
  if(expectedIdentity&&createHash('sha256').update('qoder:'+creds.userID).digest('hex')!==expectedIdentity)throw new Error('model_identity_conflict');
  // The openapi host authenticates with the plain OAuth bearer instead of COSY signing.
  if(path==='/usage')return fetchFn('https://center.qoder.sh/api/v2/quota/usage',{method:'GET',headers:{accept:'application/json',authorization:`Bearer ${creds.authToken}`},signal:init.signal,redirect:'error'});
  const url=path==='/models'?'https://api3.qoder.sh/algo/api/v2/model/list?Encode=1':'https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1';
  const body=path==='/chat'?qoderEncodeBody(String(init.body)):null;
  return fetchFn(url,{method:path==='/chat'?'POST':'GET',headers:{...buildAuthHeaders(body,url,creds),accept:path==='/chat'?'text/event-stream':'application/json',...(body?{'content-type':'application/json'}:{})},...(body?{body:new Uint8Array(body)}:{}),signal:init.signal,redirect:'error'});
}
export interface QoderModelOwner {
  inspect(): Promise<AccountObservation>;
  identity(): Promise<string>;
  request(path:string,init?:RequestInit):Promise<Response>;
}
/** Verify official login without starting another SDK query or invoking a model. */
export async function inspectQoderLogin(config: string): Promise<AccountObservation> {
  try {
    const response = await requestQoderModel(config, '/models', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw await qoderResponseFailure(response);
    const data = record(await response.json());
    if (!Array.isArray(data.chat)) throw new Error('qoder_catalog_invalid');
    return { status: 'ready', label: 'Qoder', loginMethod: 'Qoder 账号' };
  } catch (error) {
    if (error instanceof ModelAccessError && error.code === 'qoder_platform_login_expired') return { status: 'expired', diagnostic: error.message };
    return qoderAccountFailure(error);
  }
}
const quotaNumber=(value:unknown):number|undefined=>typeof value==='number'&&Number.isFinite(value)?value:undefined;
const quotaFormat=(value:number):string=>Number.isInteger(value)?value.toLocaleString('zh-CN'):value.toFixed(1);
const quotaPercent=(value:number):number=>value>0?Math.max(0.1,Math.round(Math.min(100,value)*10)/10):0;
/** Read the openapi credits usage. A failed read keeps the model catalog usable. */
async function observeQoderQuota(request:(path:string,init?:RequestInit)=>Promise<Response>):Promise<ModelProviderObservation['quota']>{
  const observedAt=new Date().toISOString();
  try{
    const response=await request('/usage',{signal:AbortSignal.timeout(10000)});
    if(!response.ok){await response.body?.cancel();return{available:false,observedAt};}
    const data=record(await response.json());
    const resetsAt=positive(data.expiresAt)?new Date(positive(data.expiresAt)!).toISOString():undefined;
    const remainingPercent=(bucket:Record<string,unknown>,totalField:string):number|undefined=>{
      const total=positive(bucket[totalField]),remaining=quotaNumber(bucket.remaining);
      if(total!==undefined&&remaining!==undefined)return quotaPercent(remaining/total*100);
      const used=quotaNumber(bucket.percentage);return used===undefined?undefined:quotaPercent((1-used)*100);
    };
    const windows:Array<{id:string;label:string;remainingPercent:number;resetsAt?:string}>=[];
    const user=record(data.userQuota),userPercent=remainingPercent(user,'total');
    const buckets:Array<{total?:number;remaining?:number}>=[];
    if(userPercent!==undefined){windows.push({id:'credits',label:'套餐内 Credits',remainingPercent:userPercent,...(resetsAt?{resetsAt}:{})});buckets.push({total:positive(user.total),remaining:quotaNumber(user.remaining)});}
    const addOn=record(data.addOnQuota),addOnPercent=remainingPercent(addOn,'total');
    if(addOnPercent!==undefined){windows.push({id:'add-on',label:'资源包',remainingPercent:addOnPercent,...(resetsAt?{resetsAt}:{})});buckets.push({total:positive(addOn.total),remaining:quotaNumber(addOn.remaining)});}
    const org=record(data.orgResourcePackage),orgPercent=addOnPercent===undefined?(org.available===true?remainingPercent(org,'cap'):remainingPercent(org,'total')):undefined;
    if(orgPercent!==undefined){windows.push({id:'org-package',label:'组织资源包',remainingPercent:orgPercent});buckets.push({total:positive(org.cap)??positive(org.total),remaining:quotaNumber(org.remaining)});}
    if(!windows.length)return{available:false,observedAt};
    const userType=string(data.userType),planLabel=userType==='teams'?'Teams':userType?userType.split('_').map(part=>part?part[0]!.toUpperCase()+part.slice(1):part).join(' '):undefined;
    const combined=buckets.length?(()=>{const total=buckets.reduce((sum,bucket)=>sum+(bucket.total??0),0),remaining=buckets.reduce((sum,bucket)=>sum+(bucket.remaining??0),0);return total>0?quotaPercent(remaining/total*100):undefined;})():undefined;
    const remaining=typeof data.isQuotaExceeded==='boolean'&&data.isQuotaExceeded?0:combined??Math.min(...windows.map(window=>window.remainingPercent));
    const userTotal=positive(user.total),userRemaining=quotaNumber(user.remaining),addOnTotal=positive(addOn.total),addOnRemaining=quotaNumber(addOn.remaining);
    const orgTotal=positive(org.cap)??positive(org.total),orgRemaining=quotaNumber(org.remaining);
    const summaryParts=[
      userTotal!==undefined&&userRemaining!==undefined?`套餐 ${quotaFormat(userRemaining)} / ${quotaFormat(userTotal)} credits`:undefined,
      addOnTotal!==undefined&&addOnRemaining!==undefined?`资源包 ${quotaFormat(addOnRemaining)} / ${quotaFormat(addOnTotal)} credits`:undefined,
      addOnPercent===undefined&&orgPercent!==undefined?(orgTotal!==undefined&&orgRemaining!==undefined?`组织资源包 ${quotaFormat(orgRemaining)} / ${quotaFormat(orgTotal)} credits`:`组织资源包 · 剩余 ${quotaFormat(orgPercent)}%`):undefined,
    ].filter((value):value is string=>!!value);
    const summary=summaryParts.length?`Qoder · ${summaryParts.join(' · ')}`:undefined;
    return{available:true,observedAt,...(planLabel?{planLabel}:{}),windows,remainingPercent:remaining,...(resetsAt?{resetsAt}:{}),...(summary?{summary}:{})};
  }catch{return{available:false,observedAt};}
}
export function createQoderModelProvider(owner:QoderModelOwner):ModelProvider {
  return {id:'native-qoder',label:'Qoder',connectionId:'qoder',async open(){
    const models=new Map<string,{offering:ModelOffering;config:ProtocolJson}>();
    const inspect=async():Promise<ModelProviderObservation>=>{
      let identity: string | undefined;
      try {
        identity=await owner.identity();
        // Authenticated endpoints establish current login. Avoid launching an
        // additional CLI just to reread the same local account.
        const [response,quota]=await Promise.all([owner.request('/models',{signal:AbortSignal.timeout(15000)}),observeQoderQuota((path,init)=>owner.request(path,init))]);
        if(!response.ok)throw await qoderResponseFailure(response);
        const data=record(await response.json());
        const chat=Array.isArray(data.chat)?data.chat:[],app=Array.isArray(data.app)?data.app:[];
        if(!chat.length&&!app.length)throw new Error('qoder_catalog_invalid');models.clear();
        // Prefer the chat group; app-only entries such as QoDuck are still real models.
        for(const value of [...chat,...app]){const config=record(value),id=string(config.key);if(!id||config.enable===false||models.has(id))continue;
          const thinking=record(config.thinking_config),enabled=record(thinking.enabled),efforts=Object.keys(record(enabled.efforts));
          const contexts=Object.values(record(config.context_config)).map(record);const windows=contexts.flatMap(v=>positive(v.token_count)??[]);const contextWindow=positive(contexts.find(v=>v.is_default===true)?.token_count)??positive(config.max_input_tokens)??(windows.length?Math.min(...windows):undefined);
          const reportedContextWindow=windows.length?Math.max(...windows):positive(config.max_input_tokens);
          const creditFactor=quotaNumber(config.price_factor);
          const offering:ModelOffering={id,...(reportedContextWindow?{reportedContextWindow}:{}),label:string(config.display_name)??id,tools:true,images:config.is_vl===true,...(contextWindow?{contextWindow}:{}),...(creditFactor!==undefined?{creditFactor}:{}),...(efforts.length?{reasoningEfforts:efforts.map(id=>({id,label:id})),defaultReasoningEffort:efforts.find(id=>record(record(enabled.efforts)[id]).is_default===true)}:{})};
          models.set(id,{offering,config});}
        const currentIdentity=await owner.identity();
        if(currentIdentity!==identity){models.clear();return{status:'failed',incomplete:true,identity:currentIdentity,models:[],diagnostic:'Qoder 账号已变化，请重新刷新；未使用前一个账号的模型或额度。'};}
        const exhaustedTeam=quota?.available&&quota.planLabel==='Teams'&&quota.remainingPercent===0;
        return{status:models.size?'ready':'failed',label:'Qoder',identity,models:[...models.values()].map(v=>v.offering),quota,...(exhaustedTeam?{diagnostic:qoderTeamQuotaMessage}:{})};
      } catch(error) {
        const failure=error instanceof ModelAccessError&&error.code==='qoder_platform_login_expired'?{status:'expired' as const,diagnostic:error.message}:error instanceof ModelAccessError&&error.code==='model_quota_exhausted'?{status:'failed' as const,diagnostic:'Qoder 当前账号额度不足；团队账号额度用尽后无法继续使用，请更换有额度的账号后重新登录。'}:qoderAccountFailure(error);
        return{...failure,incomplete:failure.status==='failed',identity,models:[]};
      }
    };
    return {protocol:'chat-completions',inspect,
      async beginLogin(){throw new Error('请在Qoder账号中登录。');},async cancelLogin(){},async close(){},
      async infer(input){
        if((await owner.inspect()).status!=='ready')return Response.json({error:{code:'qoder_login_required'}},{status:401});
        if(!models.has(input.modelId))await inspect();
        const selected=models.get(input.modelId);if(!selected)return Response.json({error:{code:'model_not_available'}},{status:404});
        const source=input.body, messages=Array.isArray(source.messages)?source.messages.map(value=>{
          const item=record(value);
          // Qoder drops a null-content assistant, leaving its tool results unpaired.
          if(item.role==='assistant'&&item.content===null&&Array.isArray(item.tool_calls)&&item.tool_calls.length)return{...item,content:''};
          return item.role==='developer'?{...item,role:'system'}:item;
        }):[];
        const last=[...messages].reverse().map(record).find(m=>m.role==='user');const lastText=typeof last?.content==='string'?last.content:'';
        const effort=string(source.reasoning_effort);const parameters:ProtocolJson={...(positive(source.max_tokens)?{max_tokens:positive(source.max_tokens)}:{}),...(effort?{enable_thinking:effort!=='none',reasoning_effort:effort}:{})};
        const id=randomUUID();const body={request_id:input.context.requestId,request_set_id:id,chat_record_id:id,session_id:input.context.conversationId,stream:true,chat_task:'FREE_INPUT',is_reply:true,is_retry:false,source:1,version:'3',session_type:'qodercli',agent_id:'agent_common',task_id:'common',code_language:'',chat_prompt:'',image_urls:null,aliyun_user_type:'',system:'',messages,tools:source.tools??[],parameters,chat_context:{chatPrompt:'',imageUrls:null,extra:{context:[],modelConfig:{key:input.modelId,is_reasoning:selected.config.is_reasoning},originalContent:lastText},features:[],text:lastText},model_config:selected.config,business:{product:'cli',version:'1.0.0',type:'agent',stage:'start',id:input.context.runId,name:lastText.slice(0,30),begin_at:Date.now()}};
        const response=await owner.request('/chat',{body:JSON.stringify(body),signal:input.signal});
        if(!response.ok){
          const failure=await qoderResponseFailure(response);
          return Response.json({error:{code:failure.code,message:failure.message}},{status:failure.status});
        }
        const stream=unwrapQoderStream(response,input.signal);
        if(source.stream===true)return new Response(stream,{headers:{'content-type':'text/event-stream'}});
        const chunks:ProtocolJson[]=[];for await(const value of readSse(new Response(stream)))if(value!=='[DONE]')chunks.push(record(JSON.parse(value)));
        const message:ProtocolJson={role:'assistant',content:''};const tools=new Map<number,ProtocolJson>();let finish='stop';let usage:unknown;
        for(const chunk of chunks){const choice=record((chunk.choices as unknown[]|undefined)?.[0]),delta=record(choice.delta);if(typeof delta.content==='string')message.content=String(message.content)+delta.content;if(typeof delta.reasoning_content==='string')message.reasoning_content=String(message.reasoning_content??'')+delta.reasoning_content;
          for(const raw of (Array.isArray(delta.tool_calls)?delta.tool_calls:[])){const t=record(raw),index=Number(t.index??0),prior=tools.get(index)??{id:t.id,type:'function',function:{name:'',arguments:''}},fn=record(prior.function),next=record(t.function);if(t.id)prior.id=t.id;if(next.name)fn.name=String(fn.name)+String(next.name);if(next.arguments)fn.arguments=String(fn.arguments)+String(next.arguments);prior.function=fn;tools.set(index,prior);}if(choice.finish_reason)finish=String(choice.finish_reason);if(chunk.usage)usage=chunk.usage;}
        if(tools.size)message.tool_calls=[...tools.values()];return Response.json({id:chunks[0]?.id??id,object:'chat.completion',model:input.modelId,choices:[{index:0,message,finish_reason:finish}],...(usage?{usage}:{})});
      }};
  }};
}
export async function* readSse(response:Response):AsyncGenerator<string>{
  if(!response.body)throw new Error('qoder_stream_missing');const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  try{while(true){const part=await reader.read();buffer+=decoder.decode(part.value,{stream:!part.done}).replace(/\r\n/g,'\n');let at;while((at=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,at);buffer=buffer.slice(at+2);const lines=frame.split('\n'),data=lines.filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(data)yield data;if(lines.includes('event:finish'))yield '[DONE]';}if(part.done)break;}if(buffer.trim())throw new Error('qoder_stream_truncated');}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function qoderResponseFailure(response:Response):Promise<ModelAccessError>{
  const reader=response.body?.getReader();let text='',bytes=0;
  try{if(reader){const decoder=new TextDecoder();for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>8192)break;text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}}
  finally{await reader?.cancel().catch(()=>{});reader?.releaseLock();}
  let detail:ProtocolJson={};try{if(bytes<=8192){const body=record(JSON.parse(text));detail=record(body.error??body);}}catch{/* Arbitrary response bodies stay private. */}
  const auth=qoderAuthenticationError(response.status,{code:detail.code,message:detail.message??detail.msg});if(auth)return auth;
  return upstreamFailure({code:detail.code??'qoder_model_upstream_failed',message:detail.message??detail.msg},response.status);
}
function qoderStreamFailure(envelope:ProtocolJson):ModelAccessError{
  let body:ProtocolJson={};try{if(typeof envelope.body==='string'&&envelope.body.length<=8192)body=record(JSON.parse(envelope.body));}catch{/* Non-JSON error bodies stay private. */}
  const detail=record(envelope.error??body.error??(Object.keys(body).length?body:envelope));
  const status=typeof envelope.statusCodeValue==='number'&&envelope.statusCodeValue>=400&&envelope.statusCodeValue<=599?envelope.statusCodeValue:502;
  return upstreamFailure({code:detail.code??'qoder_stream_upstream_failed',message:detail.message??detail.msg},status);
}
export function unwrapQoderStream(response:Response,signal:AbortSignal):ReadableStream<Uint8Array>{
  const encoder=new TextEncoder();const iterator=readSse(response)[Symbol.asyncIterator]();let done=false,finished=false,toolCalls=false;
  return new ReadableStream({async pull(controller){try{while(true){signal.throwIfAborted();const next=await iterator.next();if(next.done){if(!done||!finished)throw new Error('qoder_stream_truncated');controller.close();return;}
    let value=next.value;if(value!=='[DONE]'){const envelope=record(JSON.parse(value));if(typeof envelope.statusCodeValue==='number'&&envelope.statusCodeValue!==200)throw qoderStreamFailure(envelope);if(typeof envelope.body==='string')value=envelope.body;else if(envelope.error||envelope.code&&String(envelope.code)!=='200')throw qoderStreamFailure(envelope);else if(!envelope.choices&&!envelope.usage)continue;}
    if(value==='[DONE]'){if(!finished){if(!toolCalls)throw new Error('qoder_stream_truncated');controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));}done=true;controller.enqueue(encoder.encode('data: [DONE]\n\n'));controller.close();await iterator.return?.(undefined);return;}
    const chunk=record(JSON.parse(value));if(chunk.error)throw qoderStreamFailure(chunk);const choices=chunk.choices as Array<ProtocolJson>|undefined;if(choices?.some(c=>c.finish_reason))finished=true;if(choices?.some(c=>{const calls=record(c.delta).tool_calls;return Array.isArray(calls)&&calls.length>0;}))toolCalls=true;controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));return;
  }}catch(error){controller.error(!signal.aborted&&error instanceof ModelAccessError?error:new Error(signal.aborted?'qoder_stream_cancelled':'qoder_stream_failed'));await iterator.return?.(undefined);}},async cancel(){await iterator.return?.(undefined);}});
}
