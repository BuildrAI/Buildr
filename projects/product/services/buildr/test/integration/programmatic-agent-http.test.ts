import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createAgentService, type AgentRuntime, type ExecutorEvent} from '@buildr-ai/buildr-agent';
import {taskRecordFixture} from '../helpers/task-record-system-fixture.ts';
import {createRuntime,runtimeContributions} from '../helpers/runtime-harness.ts';
import {createLocalWorkspaceServer} from '../../src/web/http/server.ts';
import {createAgentServiceHttpContribution} from '../../src/modules/agent-service/interfaces/http/agent-service-http.ts';
import {createProgrammaticHttpContribution} from '../../src/modules/agent-service/interfaces/http/programmatic-http.ts';
import {ProgrammaticCredentials} from '../../src/modules/agent-service/persistence/programmatic-credentials.ts';
import {PROGRAMMATIC_OPERATIONS} from '../../src/modules/agent-service/interfaces/http/programmatic-operations.ts';

async function fixture(t:any){
 let release:()=>void=()=>{};
 const {base,root}=taskRecordFixture({after:(callback:()=>void)=>{release=callback;}},'programmatic-http');let sends=0,stops=0,replies=0,emit:(event:ExecutorEvent)=>void=()=>{};
 let finish:()=>void=()=>{};const ending=new Promise<void>(resolve=>{finish=resolve;});
 const capabilities={text:true,images:false,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536};
 const native:AgentRuntime={bindingIdentity:'fixture-binding',capabilities,inspectAccount:async()=>({status:'ready'}),models:async()=>[{id:'fixture-model',label:'Fixture',isDefault:true}],beginLogin:async()=>{},cancelLogin:async()=>{},createContext:async()=>({id:'context'}),resumeContext:async()=>{},readHistory:async()=>[],
  async send(input){sends++;emit=input.onEvent;emit({type:'accepted',executionRef:{id:'native-run'},inputItemId:input.clientRequestId});emit({type:'item',item:{id:'result-note',kind:'message',role:'assistant',text:'fixture result',executionId:'native-run'}});await ending;},
  observe:async()=>({status:'running',executionRef:{id:'native-run'},tools:[]}),reply:async()=>{replies++;},stop:async()=>{stops++;finish();return{status:'stopped',tools:[]};},close:async()=>{finish();}};
 const service=createAgentService({dataRoot:path.join(base,'agent'),environment:{HOME:base},modelProviders:[],executors:[{descriptor:{id:'fixture',label:'Fixture',capabilities},open:async()=>native}],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
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
 const create=async(scopes=['read','execute'])=>{const response=await fetch(manager,{method:'POST',headers:webHeaders,body:JSON.stringify({name:'GrokBot fixture',workspaceIds:[workspaceId],scopes})});assert.equal(response.status,201,await response.clone().text());return response.json();};
 return {base,service,appData,ready,workspaceId,manager,webHeaders,call,create,emit:(event:ExecutorEvent)=>emit(event),counts:()=>({sends,stops,replies})};
}

test('Bearer authentication is separate, revocable, persistent and workspace scoped',async t=>{
 const f=await fixture(t),{token,credential}=await f.create();
 assert.equal((await f.call('')).status,401);
 assert.equal((await f.call('', 'brp_'+'x'.repeat(43))).status,401);
 let response=await f.call('',token);assert.equal(response.status,200);const discovery=await response.json();
 assert.equal(discovery.version,'test-version');assert.deepEqual(discovery.workspaces,[{id:f.workspaceId,name:'Allowed'}]);assert.equal(discovery.connections[0].id,'fixture');assert.ok(!JSON.stringify(discovery).includes('configPath'));assert.ok(!JSON.stringify(discovery).includes(token));
 assert.equal(new ProgrammaticCredentials(f.appData).authenticate('Bearer '+token).id,credential.id,'new store instance accepts persisted token');
 assert.equal(fs.statSync(path.join(f.appData,'programmatic-access/credentials.sqlite')).mode&0o777,0o600);
 assert.equal(fs.readFileSync(path.join(f.appData,'programmatic-access/credentials.sqlite')).includes(Buffer.from(token)),false);
 assert.equal((await f.call('/workspaces/'+randomUUID()+'/conversations',token)).status,403);
 assert.equal((await f.call('',token,undefined,{origin:'https://foreign.example'})).status,403);
 assert.equal((await fetch(f.manager,{headers:{authorization:'Bearer '+token}})).status,403,'Bearer cannot manage credentials');
 assert.equal((await fetch(f.ready.url+'/api/v1/app/agent-service/connections',{headers:{authorization:'Bearer '+token}})).status,403,'Bearer does not become browser session');
 response=await fetch(f.manager,{headers:f.webHeaders});const metadata=await response.json();assert.equal(metadata.credentials[0].id,credential.id);assert.ok(!JSON.stringify(metadata).includes(token));
 response=await fetch(f.manager+'/'+credential.id+'/revoke',{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:'stale'})});assert.equal(response.status,409);
 response=await fetch(f.manager+'/'+credential.id+'/revoke',{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:credential.revision})});assert.equal(response.status,200);
 assert.equal((await f.call('',token)).status,401);assert.equal((await f.call('/help',token)).status,401);assert.deepEqual(f.counts(),{sends:0,stops:0,replies:0});
});

test('public first submit is idempotent across lost responses, rejects changed content and supports read/observe/stop',async t=>{
 const f=await fixture(t),{token}=await f.create(),draft=randomUUID(),requestId=randomUUID(),endpoint='/workspaces/'+f.workspaceId+'/conversations';
 const state=await (await f.call(endpoint+'/drafts/'+draft,token)).json();
 const input={connectionId:'fixture',text:'small authorized change',clientRequestId:requestId,expectedDraftRevision:state.revision};
 const replies=await Promise.all([f.call(endpoint+'/drafts/'+draft+'/send',token,input),f.call(endpoint+'/drafts/'+draft+'/send',token,input)]);
 for(const response of replies)assert.equal(response.status,202,await response.clone().text());
 const first=await replies[0].json(),second=await replies[1].json();assert.equal(first.conversation.id,second.conversation.id);
 for(let n=0;n<100&&!f.counts().sends;n++)await new Promise(r=>setTimeout(r,2));assert.equal(f.counts().sends,1);
 const lookup=await (await f.call(endpoint+'/drafts/'+draft+'/submissions/'+requestId,token)).json();assert.equal(lookup.found,true);assert.equal(lookup.conversation.id,first.conversation.id);
 assert.equal((await f.call(endpoint+'/drafts/'+draft+'/send',token,{...input,text:'changed'})).status,409);
 assert.equal((await f.call(endpoint+'/drafts/'+randomUUID()+'/send',token,{...input,cwd:'/tmp'})).status,403);
 assert.equal((await f.call(endpoint+'/drafts/'+randomUUID()+'/send',token,{...input,permissionMode:'full-access'})).status,403);
 const conversation=endpoint+'/'+first.conversation.id;
 const observe=await f.call(conversation+'/observe',token,{});assert.equal(observe.status,200);const view=await observe.json();assert.equal(view.run.id,lookup.conversation.run.id);
 const messages=await (await f.call(conversation+'/entries',token)).json();assert.ok(messages.entries.some((entry:any)=>entry.text==='fixture result'));
 const sendLookup=await (await f.call(conversation+'/submissions/'+requestId,token)).json();assert.equal(sendLookup.found,true);
 const {token:readToken}=await f.create(['read']);assert.equal((await f.call(conversation+'/stop',readToken,{})).status,403);assert.equal((await f.call(conversation+'/observe',readToken,{})).status,200);
 const control={expectedRevision:view.revision,runId:view.run.id,participantId:view.run.participantId,generation:view.run.generation};
 assert.equal((await f.call(conversation+'/stop',token,{...control,expectedRevision:'stale'})).status,409);
 const latest=await(await f.call(conversation,token)).json();
 const response=await f.call(conversation+'/stop',token,{...control,expectedRevision:latest.revision});assert.equal(response.status,200,await response.clone().text());assert.equal(f.counts().stops,1);assert.equal(f.counts().sends,1);
 const after=await(await f.call(conversation,token)).json();
 const follow={expectedRevision:after.revision,connectionId:'fixture',text:'authorized follow-up'};
 const previewResponse=await f.call(conversation+'/prepare-send',token,follow);assert.equal(previewResponse.status,200,await previewResponse.clone().text());
 const preview=await previewResponse.json(),followId=randomUUID(),payload={...follow,expectedRevision:preview.revision,previewToken:preview.token,clientRequestId:followId};
 const sent=await f.call(conversation+'/send',token,payload);assert.equal(sent.status,202,await sent.clone().text());const sentView=await sent.json();
 const repeated=await f.call(conversation+'/send',token,payload);assert.equal(repeated.status,202,await repeated.clone().text());assert.equal((await repeated.json()).run.id,sentView.run.id);
 const found=await(await f.call(conversation+'/submissions/'+followId,token)).json();assert.equal(found.found,true);assert.equal(found.conversation.run.id,sentView.run.id);
 assert.equal((await f.call(conversation+'/send',token,{...payload,text:'changed follow-up'})).status,409);
 for(let n=0;n<100&&f.counts().sends<2;n++)await new Promise(r=>setTimeout(r,2));assert.equal(f.counts().sends,2);
});

test('question answering and sensitive approvals require independent explicit grants',async t=>{
 const f=await fixture(t),{token}=await f.create(),{token:answer}=await f.create(['read','answer']),{token:approve}=await f.create(['read','approve']);
 const endpoint='/workspaces/'+f.workspaceId+'/conversations',draft=randomUUID();const state=await(await f.call(endpoint+'/drafts/'+draft,token)).json();
 const created=await(await f.call(endpoint+'/drafts/'+draft+'/send',token,{connectionId:'fixture',text:'work',clientRequestId:randomUUID(),expectedDraftRevision:state.revision})).json();
 for(let n=0;n<100&&!f.counts().sends;n++)await new Promise(r=>setTimeout(r,2));
 f.emit({type:'request',request:{id:'approval-native',kind:'approval',title:'Write?',options:[{id:'yes',label:'Yes'}]}});
 const view=f.service.conversations.read(f.workspaceId,created.conversation.id),pending=view.requests[0];assert.ok(pending);
 const reply=endpoint+'/'+view.id+'/requests/'+pending.id+'/reply';const input={expectedRevision:view.revision,runId:pending.runId,participantId:pending.participantId,generation:pending.generation,answer:'yes'};
 assert.equal((await f.call(reply,token,input)).status,403);assert.equal((await f.call(reply,answer,input)).status,403);assert.equal(f.counts().replies,0);
 const response=await f.call(reply,approve,input);assert.equal(response.status,200,await response.clone().text());assert.equal(f.counts().replies,1);
 f.emit({type:'request',request:{id:'question-native',kind:'question',title:'Which scope?'}});
 const question=f.service.conversations.read(f.workspaceId,view.id),q=question.requests.find(item=>item.kind==='question')!;
 const qPath=endpoint+'/'+view.id+'/requests/'+q.id+'/reply';const qInput={expectedRevision:question.revision,runId:q.runId,participantId:q.participantId,generation:q.generation,answer:'only the authorized scope'};
 assert.equal((await f.call(qPath,approve,qInput)).status,403);
 assert.equal((await f.call(qPath,answer,qInput)).status,200);assert.equal(f.counts().replies,2);
});

test('malformed input and unsupported routes are rejected without starting work',async t=>{
 const f=await fixture(t),{token}=await f.create(),endpoint='/workspaces/'+f.workspaceId+'/conversations';
 assert.equal((await f.call(endpoint+'/drafts/'+randomUUID()+'/send',token,{taskLinks:'bad'})).status,400);
 assert.equal((await f.call(endpoint+'/'+randomUUID()+'/observe',token,null)).status,400);
 assert.equal((await f.call(endpoint+'/'+randomUUID()+'/events',token)).status,404);
 assert.equal((await f.call('/connections/fixture/program-upgrades',token,{})).status,404);
 assert.equal((await f.call(endpoint+'/drafts/'+randomUUID()+'/send',token,{}, {'content-type':'text/plain'})).status,415);
 assert.equal(f.counts().sends,0);
});

test('HTTP help and OpenAPI use the dispatch allowlist and include executable recovery example',async t=>{
 const f=await fixture(t),{token}=await f.create();const response=await f.call('/openapi.json',token);assert.equal(response.status,200);const doc=await response.json();assert.equal(doc.openapi,'3.1.0');
 for(const op of PROGRAMMATIC_OPERATIONS){const route=('/api/v1/programmatic/workspaces/:workspaceId/conversations'+op.path).replace(/:([A-Za-z]+)/g,'{$1}');assert.equal(doc.paths[route][op.method.toLowerCase()].operationId,op.id);}
 const help=await f.call('/help',token);assert.equal(help.status,200);assert.match(help.headers.get('content-type')!,/text\/markdown/);
 const guide=await help.text();assert.match(guide,/previewToken = prepareResponse\.token/);
 const route='/api/v1/programmatic/workspaces/{workspaceId}/conversations/{conversationId}';
 const prepare=doc.paths[route+'/prepare-send'].post,send=doc.paths[route+'/send'].post;
 assert.ok(prepare.responses['200'].content['application/json'].schema.properties.token);
 assert.equal(prepare.responses['200'].content['application/json'].schema.properties.previewToken,undefined);
 assert.match(prepare.description,/previewToken = prepareResponse\.token/);
 assert.match(send.requestBody.content['application/json'].schema.properties.previewToken.description,/prepareResponse\.token/);
 const example=await f.call('/example.py',token);assert.equal(example.status,200);assert.ok((await example.text()).includes('os.O_EXCL'));
});
