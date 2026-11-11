import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAgentService, type AgentRuntime, type ExecutorEvent} from '@buildr-ai/buildr-agent';
import {taskRecordFixture} from './task-record-system-fixture.ts';
import {createRuntime,runtimeContributions} from './runtime-harness.ts';
import {createLocalWorkspaceServer} from '../../src/web/http/server.ts';
import {createAgentServiceHttpContribution} from '../../src/modules/agent-service/interfaces/http/agent-service-http.ts';
import {createProgrammaticHttpContribution} from '../../src/modules/agent-service/interfaces/http/programmatic-http.ts';

export type ProgrammaticHttpFixtureOptions={holdSend?:boolean;pushbackTransport?:typeof fetch;pushbackNow?:()=>number};

/** Shared programmatic HTTP fixture: a held native run by default, or a self-completing
 * run with an injected pushback transport for event-delivery assertions. */
export async function programmaticHttpFixture(t:any,options:ProgrammaticHttpFixtureOptions={}){
 const holdSend=options.holdSend!==false;
 let release:()=>void=()=>{};
 const {base,root}=taskRecordFixture({after:(callback:()=>void)=>{release=callback;}},'programmatic-http');let sends=0,stops=0,replies=0,emit:(event:ExecutorEvent)=>void=()=>{};
 let finish:()=>void=()=>{};const ending=new Promise<void>(resolve=>{finish=resolve;});
 let observedStatus:'running'|'idle'='running';
 const capabilities={text:true,images:false,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536,permissionModes:['default','full-access'] as Array<'default'|'full-access'>};
 const native:AgentRuntime={bindingIdentity:'fixture-binding',capabilities,inspectAccount:async()=>({status:'ready'}),models:async()=>[{id:'fixture-model',label:'Fixture',isDefault:true}],beginLogin:async()=>{},cancelLogin:async()=>{},createContext:async()=>({id:'context'}),resumeContext:async()=>{},readHistory:async()=>[],
  async send(input){sends++;emit=input.onEvent;emit({type:'accepted',executionRef:{id:'native-run'},inputItemId:input.clientRequestId});emit({type:'item',item:{id:'result-note',kind:'message',role:'assistant',text:'fixture result',executionId:'native-run'}});if(holdSend)await ending;else emit({type:'completed',status:'completed'});},
  observe:async()=>({status:observedStatus,executionRef:{id:'native-run'},tools:[]}),reply:async()=>{replies++;},stop:async()=>{stops++;finish();return{status:'stopped',tools:[]};},close:async()=>{finish();}};
 const service=createAgentService({dataRoot:path.join(base,'agent'),environment:{HOME:base},modelProviders:[],executors:[{descriptor:{id:'fixture',label:'Fixture',capabilities},open:async()=>native}],resolveWorkspace:()=>({rootPath:root}),assertTask(){},...(options.pushbackTransport?{pushbackTransport:options.pushbackTransport}:{}),...(options.pushbackNow?{pushbackNow:options.pushbackNow}:{})});
 await service.connections.connect('fixture',{expectedRevision:'unconfigured'});
 const runtime=createRuntime();let workspaceId='';const appData=path.join(base,'app');
 const agent=createAgentServiceHttpContribution(()=>service);
 const program=createProgrammaticHttpContribution(()=>service,agent,{dataRoot:()=>appData,version:()=>'test-version',workspaces:()=>[{id:workspaceId,name:'Allowed'}]});
 const contributions=runtimeContributions(runtime,'http').filter((item:{id:string})=>!['agent-service.http','programmatic-access.http'].includes(item.id));contributions.push(agent,program);
 const server=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions}),ready=await server.ready;workspaceId=ready.initialWorkspaceId;
 t.after(async()=>{finish();await service.close();server.server.closeAllConnections();await new Promise<void>(resolve=>server.server.close(()=>resolve()));release();});
 const manager=ready.url+'/api/v1/app/programmatic-access',url=ready.url+'/api/v1/programmatic';
 const webHeaders={'x-buildr-session':ready.sessionToken,origin:ready.url,'content-type':'application/json'};
 const call=async(suffix:string,token?:string,body?:unknown,extra:Record<string,string>={})=>fetch(url+suffix,{method:body===undefined?'GET':'POST',headers:{...(token?{authorization:'Bearer '+token}:{}),'content-type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const create=async(scopes=['read','execute'],allowFullAccess?:boolean)=>{const response=await fetch(manager,{method:'POST',headers:webHeaders,body:JSON.stringify({name:'GrokBot fixture',workspaceIds:[workspaceId],scopes,...(allowFullAccess===undefined?{}:{allowFullAccess})})});if(response.status!==201)throw new Error('credential create failed: '+await response.clone().text());return response.json();};
 const flush=async()=>{for(let i=0;i<25;i++)await new Promise(resolve=>setTimeout(resolve,0));};
 const complete=()=>{observedStatus='idle';emit({type:'completed',status:'completed'});finish();};
 return {base,service,appData,ready,workspaceId,manager,webHeaders,call,create,emit:(event:ExecutorEvent)=>emit(event),counts:()=>({sends,stops,replies}),flush,complete};
}

/** A local fake pushback receiver; never touches a real address. */
export function fakePushbackReceiver(){
 const calls:Array<{url:string;init:any;body:any}>=[];
 let status=200;
 const transport:typeof fetch=async(url,init)=>{calls.push({url:String(url),init,body:JSON.parse(String(init!.body))});return new Response(null,{status});};
 return {calls,transport,fail:()=>{status=500;},ok:()=>{status=200;}};
}

export {randomUUID};
