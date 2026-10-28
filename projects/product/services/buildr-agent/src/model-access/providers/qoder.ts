import { createDecipheriv, createHash, randomUUID } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelProvider, ModelOffering, ModelProviderObservation, ProtocolJson } from '../contracts.ts';
import type { AccountObservation } from '../../contracts.ts';
import { record, string, positive } from './private-account.ts';
import { buildAuthHeaders, qoderEncodeBody } from './qoder-signing.ts';

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
const quotaNumber=(value:unknown):number|undefined=>typeof value==='number'&&Number.isFinite(value)?value:undefined;
const quotaFormat=(value:number):string=>Number.isInteger(value)?String(value):value.toFixed(1);
const quotaPercent=(value:number):number=>Math.round(Math.max(0,Math.min(100,value))*10)/10;
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
    if(userPercent!==undefined)windows.push({id:'credits',label:'Credits',remainingPercent:userPercent,...(resetsAt?{resetsAt}:{})});
    const org=record(data.orgResourcePackage),orgPercent=org.available===true?remainingPercent(org,'cap'):undefined;
    if(orgPercent!==undefined)windows.push({id:'org-package',label:'组织资源包',remainingPercent:orgPercent});
    if(!windows.length)return{available:false,observedAt};
    const userType=string(data.userType),planLabel=userType==='teams'?'Teams':userType?userType[0]!.toUpperCase()+userType.slice(1):undefined;
    const total=positive(user.total),remaining=quotaNumber(user.remaining);
    const summary=total!==undefined&&remaining!==undefined?`Qoder · 剩余 ${quotaFormat(remaining)} / ${quotaFormat(total)} credits`:undefined;
    return{available:true,observedAt,...(planLabel?{planLabel}:{}),windows,remainingPercent:Math.min(...windows.map(window=>window.remainingPercent)),...(resetsAt?{resetsAt}:{}),...(summary?{summary}:{})};
  }catch{return{available:false,observedAt};}
}
export function createQoderModelProvider(owner:QoderModelOwner):ModelProvider {
  return {id:'native-qoder',label:'Qoder',connectionId:'qoder',async open(){
    const models=new Map<string,{offering:ModelOffering;config:ProtocolJson}>();
    const inspect=async():Promise<ModelProviderObservation>=>{
        const account=await owner.inspect(); if(account.status!=='ready')return{status:account.status,incomplete:account.status==='failed',models:[],label:account.label,diagnostic:account.diagnostic};
        const response=await owner.request('/models',{signal:AbortSignal.timeout(15000)});
        if(response.status===401){await response.body?.cancel();return{status:'expired',models:[]};}
        if(!response.ok){await response.body?.cancel();throw new Error('qoder_catalog_failed');}
        const data=record(await response.json());if(!Array.isArray(data.chat))throw new Error('qoder_catalog_invalid');models.clear();
        for(const value of data.chat){const config=record(value),id=string(config.key);if(!id||config.enable===false)continue;
          const thinking=record(config.thinking_config),enabled=record(thinking.enabled),efforts=Object.keys(record(enabled.efforts));
          const contexts=Object.values(record(config.context_config)).map(record);const windows=contexts.flatMap(v=>positive(v.token_count)??[]);const contextWindow=positive(contexts.find(v=>v.is_default===true)?.token_count)??positive(config.max_input_tokens)??(windows.length?Math.min(...windows):undefined);
          const reportedContextWindow=windows.length?Math.max(...windows):positive(config.max_input_tokens);
          const creditFactor=quotaNumber(config.price_factor);
          const offering:ModelOffering={id,...(reportedContextWindow?{reportedContextWindow}:{}),label:string(config.display_name)??id,tools:true,images:config.is_vl===true,...(contextWindow?{contextWindow}:{}),...(creditFactor!==undefined?{creditFactor}:{}),...(efforts.length?{reasoningEfforts:efforts.map(id=>({id,label:id})),defaultReasoningEffort:efforts.find(id=>record(record(enabled.efforts)[id]).is_default===true)}:{})};
          models.set(id,{offering,config});}
        return{status:models.size?'ready':'failed',label:account.label??'Qoder',identity:await owner.identity(),models:[...models.values()].map(v=>v.offering),quota:await observeQoderQuota((path,init)=>owner.request(path,init))};
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
        if(!response.ok){await response.body?.cancel();return Response.json({error:{code:'qoder_model_upstream_failed'}},{status:response.status});}
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
  try{while(true){const part=await reader.read();buffer+=decoder.decode(part.value,{stream:!part.done}).replace(/\r\n/g,'\n');let at;while((at=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,at);buffer=buffer.slice(at+2);const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(data)yield data;}if(part.done)break;}if(buffer.trim())throw new Error('qoder_stream_truncated');}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function unwrapQoderStream(response:Response,signal:AbortSignal):ReadableStream<Uint8Array>{
  const encoder=new TextEncoder();const iterator=readSse(response)[Symbol.asyncIterator]();let done=false,finished=false;
  return new ReadableStream({async pull(controller){try{signal.throwIfAborted();const next=await iterator.next();if(next.done){if(!done||!finished)throw new Error('qoder_stream_truncated');controller.close();return;}
    let value=next.value;if(value!=='[DONE]'){const envelope=record(JSON.parse(value));if(typeof envelope.statusCodeValue==='number'&&envelope.statusCodeValue!==200)throw new Error('qoder_stream_upstream_failed');if(typeof envelope.body==='string')value=envelope.body;else if(envelope.error||envelope.code&&String(envelope.code)!=='200')throw new Error('qoder_stream_upstream_failed');else if(!envelope.choices&&!envelope.usage)return;}
    if(value==='[DONE]'){if(!finished)throw new Error('qoder_stream_truncated');done=true;controller.enqueue(encoder.encode('data: [DONE]\n\n'));controller.close();await iterator.return?.(undefined);return;}
    const chunk=record(JSON.parse(value));if(chunk.error)throw new Error('qoder_stream_upstream_failed');if((chunk.choices as Array<ProtocolJson>|undefined)?.some(c=>c.finish_reason))finished=true;controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
  }catch{controller.error(new Error(signal.aborted?'qoder_stream_cancelled':'qoder_stream_failed'));await iterator.return?.(undefined);}},async cancel(){await iterator.return?.(undefined);}});
}
