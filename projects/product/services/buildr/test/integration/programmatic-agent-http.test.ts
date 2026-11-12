import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {programmaticHttpFixture} from '../helpers/programmatic-http-fixture.ts';
import {ProgrammaticCredentials} from '../../src/modules/agent-service/persistence/programmatic-credentials.ts';
import {PROGRAMMATIC_OPERATIONS} from '../../src/modules/agent-service/interfaces/http/programmatic-operations.ts';
import {AGENT_SERVICE_HTTP_SCHEMAS} from '../../src/modules/agent-service/interfaces/http/agent-service-http-contracts.ts';
import {programmaticOpenApi,programmaticContractVersion,programmaticOperationIndex} from '../../src/modules/agent-service/interfaces/http/programmatic-openapi.ts';

function expandRefs(value:any,document:any):any {
 if(!value||typeof value!=='object')return value;
 if(Array.isArray(value))return value.map(item=>expandRefs(item,document));
 if(value.$ref){assert.match(value.$ref,/^#\/components\/schemas\//);const name=value.$ref.slice('#/components/schemas/'.length);assert.ok(document.components.schemas[name],`unresolved ${name}`);return expandRefs(document.components.schemas[name],document);}
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,expandRefs(item,document)]));
}
function withoutSchemaIds(value:any):any {
 if(!value||typeof value!=='object')return value;
 if(Array.isArray(value))return value.map(withoutSchemaIds);
 return Object.fromEntries(Object.entries(value).filter(([key])=>!['$id','$schema'].includes(key)).map(([key,item])=>[key,withoutSchemaIds(item)]));
}

const fixture=(t:any)=>programmaticHttpFixture(t);

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
 const {token:noFull}=await f.create(['read','execute'],false);
 assert.equal((await f.call(endpoint+'/drafts/'+randomUUID()+'/send',noFull,{...input,permissionMode:'full-access'})).status,403);
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
 const expanded=expandRefs(doc,doc),prepare=expanded.paths[route+'/prepare-send'].post,send=expanded.paths[route+'/send'].post;
 assert.ok(prepare.responses['200'].content['application/json'].schema.properties.token);
 assert.equal(prepare.responses['200'].content['application/json'].schema.properties.previewToken,undefined);
 assert.match(prepare.description,/previewToken = prepareResponse\.token/);
 assert.match(send.requestBody.content['application/json'].schema.properties.previewToken.description,/prepareResponse\.token/);
 const example=await f.call('/example.py',token);assert.equal(example.status,200);assert.ok((await example.text()).includes('os.O_EXCL'));
});

test('browser session reads shared documentation without Bearer, not anonymously or with program credentials',async t=>{
 const f=await fixture(t),{token}=await f.create();
 for(const kind of ['help','openapi.json','operations','operations/start']){
  const url=f.manager+'/documents/'+kind;
  assert.equal((await fetch(url)).status,403);
  assert.equal((await fetch(url,{headers:{authorization:'Bearer '+token}})).status,403);
  const response=await fetch(url,{headers:f.webHeaders});assert.equal(response.status,200);
  const doc=await response.json(),external=await f.call('/'+kind,token);
  assert.equal(typeof doc.content,'string');
  if(kind==='help'){assert.equal(doc.content,await external.text());assert.equal(doc.mediaType,'text/markdown');}
  else{assert.deepEqual(JSON.parse(doc.content),await external.json());assert.equal(doc.mediaType,'application/json');}
  assert.ok(!JSON.stringify(doc).includes(token));
  assert.equal((await fetch(url,{headers:{...f.webHeaders,origin:'https://foreign.example'}})).status,403);
 }
 assert.equal((await f.call('/help')).status,401,'public docs still require Bearer');
 assert.equal((await fetch(f.manager+'/documents/missing',{headers:f.webHeaders})).status,404);
 assert.deepEqual(f.counts(),{sends:0,stops:0,replies:0});
});

test('compact OpenAPI preserves response schemas and only emits resolvable shared schema references',async t=>{
 const f=await fixture(t),{token}=await f.create();
 const doc=await(await f.call('/openapi.json',token)).json(),expanded=expandRefs(doc,doc);
 assert.ok(Object.keys(doc.components.schemas).length>0);
 assert.ok(Buffer.byteLength(JSON.stringify(doc))<100_000,'full contract size regression');
 assert.ok(Buffer.byteLength(JSON.stringify(doc,null,2))<200_000,'formatted contract size regression');
 for(const operation of PROGRAMMATIC_OPERATIONS){
  const route=('/api/v1/programmatic/workspaces/:workspaceId/conversations'+operation.path).replace(/:([A-Za-z]+)/g,'{$1}');
  const result=expanded.paths[route][operation.method.toLowerCase()];
  const expected=withoutSchemaIds(AGENT_SERVICE_HTTP_SCHEMAS[operation.output]);
  if(operation.id==='prepare-send'){assert.match(result.responses['200'].content['application/json'].schema.properties.token.description,/previewToken = prepareResponse\.token/);delete result.responses['200'].content['application/json'].schema.properties.token.description;}
  const status=['start','send','supplement','messages'].includes(operation.id)?'202':'200';
  assert.deepEqual(result.responses[status].content['application/json'].schema,expected,`${operation.id} response changed`);
  if(operation.method==='POST'){
   const input=withoutSchemaIds(AGENT_SERVICE_HTTP_SCHEMAS[operation.input]);
   if(input.properties?.cwd)delete input.properties.cwd;
   if(input.properties?.clientRequestId)input.properties.clientRequestId={type:'string',format:'uuid',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'};
   if(input.properties?.permissionMode)input.properties.permissionMode=operation.id==='messages'
     ?{enum:['default','full-access'],description:'省略时沿用该对话最近一轮执行的 permissionMode；没有最近轮次时默认 default。full-access 需凭据开启“允许全部授权执行”（allowFullAccess），否则返回 403。'}
     :{enum:['default','full-access'],default:'default',description:'省略默认 default。full-access 需凭据开启“允许全部授权执行”（allowFullAccess），否则返回 403；连接须支持该模式。'};
   const actual=result.requestBody.content['application/json'].schema;
   if(operation.id==='send'){assert.match(actual.properties.previewToken.description,/prepareResponse\.token/);delete actual.properties.previewToken.description;}
   assert.deepEqual(actual,input,`${operation.id} input changed`);
  }
 }
});

test('light operation index and self-contained per-operation contracts support stable content versions',async t=>{
 const f=await fixture(t),{token}=await f.create();
 assert.equal((await f.call('/operations')).status,401);
 assert.equal((await f.call('/operations/start')).status,401);
 const index=await(await f.call('/operations',token)).json(),full=await(await f.call('/openapi.json',token)).json();
 assert.equal(index.contractVersion,programmaticContractVersion(full));assert.ok(Buffer.byteLength(JSON.stringify(index))<8_000);
 assert.equal(index.operations.length,PROGRAMMATIC_OPERATIONS.length+2);
 assert.deepEqual(new Set(index.operations.map((item:any)=>item.id)),new Set(['discover','events',...PROGRAMMATIC_OPERATIONS.map(item=>item.id)]));
 for(const item of index.operations){
  const response=await f.call('/operations/'+item.id,token);assert.equal(response.status,200);
  const document=await response.json();assert.equal(document['x-buildr-contract-version'],index.contractVersion);
  assert.equal(document['x-buildr-operation-id'],item.id);
  assert.deepEqual(Object.keys(document.paths),[item.path]);
  assert.deepEqual(Object.keys(document.paths[item.path]),[item.method.toLowerCase()]);
  assert.deepEqual(expandRefs(document.paths,document),expandRefs({[item.path]:{[item.method.toLowerCase()]:full.paths[item.path][item.method.toLowerCase()]}},full));
  assert.ok(Buffer.byteLength(JSON.stringify(document))<35_000);
 }
 assert.equal((await f.call('/operations/not-an-operation',token)).status,404);
 assert.equal((await f.call('/operations/start/extra',token)).status,404);
 assert.equal((await f.call('/operations?unexpected=1',token)).status,400);
 assert.equal((await fetch(f.manager+'/documents/operations/not-an-operation',{headers:f.webHeaders})).status,404);
 assert.equal(programmaticOperationIndex('test-version').contractVersion,index.contractVersion,'content version stable across reads');
 const changed=programmaticOpenApi('test-version');changed.info.description+=' contract change';
 assert.notEqual(programmaticContractVersion(changed),index.contractVersion,'content version changes without a release version bump');
 assert.deepEqual(f.counts(),{sends:0,stops:0,replies:0});
});

test('creating and regenerating credentials safely saves private token files, rejects stale and revoked mutations',async t=>{
 const f=await fixture(t),{token,credential}=await f.create(),file=credential.tokenFilePath;
 assert.equal(fs.readFileSync(file,'utf8').trim(),token);
 assert.equal(fs.statSync(file).mode&0o777,0o600);
 assert.equal(fs.statSync(path.dirname(file)).mode&0o777,0o700);
 const regen=(revision:string)=>fetch(f.manager+'/'+credential.id+'/regenerate',{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:revision})});
 assert.equal((await fetch(f.manager+'/'+credential.id+'/regenerate',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({expectedRevision:credential.revision})})).status,403);
 assert.equal((await regen('stale')).status,409);
 assert.equal((await f.call('',token)).status,200);
 const results=await Promise.all([regen(credential.revision),regen(credential.revision)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const updated=await results.find(r=>r.status===200)!.json();
 assert.equal(updated.credential.id,credential.id);
 assert.deepEqual(updated.credential.workspaceIds,credential.workspaceIds);assert.deepEqual(updated.credential.scopes,credential.scopes);
 assert.notEqual(updated.credential.tokenFilePath,file);
 const newToken=fs.readFileSync(updated.credential.tokenFilePath,'utf8').trim();
 assert.equal(newToken,updated.token);assert.equal(fs.statSync(updated.credential.tokenFilePath).mode&0o777,0o600);
 assert.equal((await f.call('',token)).status,401);assert.equal((await f.call('',newToken)).status,200);
 assert.equal(fs.readFileSync(file,'utf8').trim(),token,'do not delete old files during regeneration');
 assert.equal(fs.readdirSync(path.dirname(file)).length,2,'failed concurrent regeneration leaves no new file');
 const metadata=await(await fetch(f.manager,{headers:f.webHeaders})).json();
 assert.equal(metadata.credentials[0].tokenFilePath,updated.credential.tokenFilePath);
 assert.ok(!JSON.stringify(metadata).includes(newToken));assert.ok(!JSON.stringify(metadata).includes(token));
 await fetch(f.manager+'/'+credential.id+'/revoke',{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:updated.credential.revision})});
 assert.equal((await regen(updated.credential.revision)).status,409);
 assert.equal((await f.call('',newToken)).status,401);
});

test('unsafe token directory cannot create or change a credential and is not overwritten',async t=>{
 const f=await fixture(t),{token,credential}=await f.create();
 const dir=path.dirname(credential.tokenFilePath),saved=dir+'-original';
 fs.renameSync(dir,saved);fs.symlinkSync(f.base,dir,'dir');
 const response=await fetch(f.manager,{method:'POST',headers:f.webHeaders,body:JSON.stringify({name:'must not activate',workspaceIds:[f.workspaceId],scopes:['read']})});
 assert.equal(response.status,409);assert.equal((await response.json()).error.code,'programmatic_storage_unsafe');
 const updated=await fetch(f.manager+'/'+credential.id+'/regenerate',{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:credential.revision})});
 assert.equal(updated.status,409);
 assert.equal((await f.call('',token)).status,200,'original credential is unaffected');
 assert.equal(new ProgrammaticCredentials(f.appData).list().length,1);
 assert.ok(fs.lstatSync(dir).isSymbolicLink(),'do not remove the conflicting object');
 assert.equal(fs.readdirSync(f.base).some(name=>name.endsWith('.token')),false);
 fs.unlinkSync(dir);fs.renameSync(saved,dir);
 fs.renameSync(dir,saved);fs.writeFileSync(dir,'conflicting ordinary file');
 const failed=await fetch(f.manager,{method:'POST',headers:f.webHeaders,body:JSON.stringify({name:'cannot save',workspaceIds:[f.workspaceId],scopes:['read']})});
 assert.equal(failed.status,500);assert.equal((await failed.json()).error.code,'programmatic_token_save_failed');
 assert.equal(fs.readFileSync(dir,'utf8'),'conflicting ordinary file');
 assert.equal(new ProgrammaticCredentials(f.appData).list().length,1);
 assert.equal((await f.call('',token)).status,200);
 fs.unlinkSync(dir);fs.renameSync(saved,dir);
});

test('public conversation-wide stop uses a stable request identity and does not require a live current run',async t=>{
 const f=await fixture(t),{token}=await f.create(),endpoint='/workspaces/'+f.workspaceId+'/conversations',draft=randomUUID();
 const state=await(await f.call(endpoint+'/drafts/'+draft,token)).json();
 const first=await f.call(endpoint+'/drafts/'+draft+'/send',token,{connectionId:'fixture',text:'stop this work',clientRequestId:randomUUID(),expectedDraftRevision:state.revision});
 assert.equal(first.status,202);const sent=await first.json(),path=endpoint+'/'+sent.conversation.id;
 for(let n=0;n<100&&!f.counts().sends;n++)await new Promise(resolve=>setTimeout(resolve,2));
 const current=await(await f.call(path,token)).json(),stopId=randomUUID();
 const {token:readToken}=await f.create(['read']);assert.equal((await f.call(path+'/stop-all',readToken,{expectedRevision:current.revision,clientRequestId:stopId})).status,403);
 assert.equal((await f.call(path+'/stop-all',token,{expectedRevision:'stale',clientRequestId:stopId})).status,409);
 const result=await f.call(path+'/stop-all',token,{expectedRevision:current.revision,clientRequestId:stopId});assert.equal(result.status,200,await result.clone().text());
 const stopped=await result.json();assert.equal(stopped.stopRequest.id,stopId);assert.equal(stopped.run.status,'stopped');assert.deepEqual(stopped.stopRequest.runIds,[current.run.id]);
 const replay=await f.call(path+'/stop-all',token,{expectedRevision:'stale',clientRequestId:stopId});assert.equal(replay.status,200);assert.equal(f.counts().stops,1);assert.equal(f.counts().sends,1);
});

test('full-access execution follows the credential toggle and discovery passes through connection modes',async t=>{
 const f=await fixture(t),endpoint='/workspaces/'+f.workspaceId+'/conversations';
 const {token,credential}=await f.create();
 assert.equal(credential.allowFullAccess,true,'new credentials default to allowing full-access');
 const discovery=await(await f.call('',token)).json();
 assert.deepEqual(discovery.connections[0].capabilities.permissionModes,['default','full-access'],'discovery passes through real connection modes');
 const draft=randomUUID(),state=await(await f.call(endpoint+'/drafts/'+draft,token)).json();
 const started=await f.call(endpoint+'/drafts/'+draft+'/send',token,{connectionId:'fixture',text:'authorized full-access work',clientRequestId:randomUUID(),expectedDraftRevision:state.revision,permissionMode:'full-access'});
 assert.equal(started.status,202,await started.clone().text());
 const conversation=endpoint+'/'+(await started.json()).conversation.id;
 for(let n=0;n<100&&!f.counts().sends;n++)await new Promise(r=>setTimeout(r,2));
 const view=await(await f.call(conversation+'/observe',token,{})).json();
 assert.equal((await f.call(conversation+'/stop',token,{expectedRevision:view.revision,runId:view.run.id,participantId:view.run.participantId,generation:view.run.generation})).status,200);
 const after=await(await f.call(conversation,token)).json();
 const preview=await(await f.call(conversation+'/prepare-send',token,{expectedRevision:after.revision,connectionId:'fixture',text:'full-access follow-up',permissionMode:'full-access'})).json();
 assert.equal(preview.permissionMode,'full-access');
 const sent=await f.call(conversation+'/send',token,{expectedRevision:preview.revision,connectionId:'fixture',text:'full-access follow-up',permissionMode:'full-access',previewToken:preview.token,clientRequestId:randomUUID()});
 assert.equal(sent.status,202,await sent.clone().text());
 const off=await fetch(f.manager+'/'+credential.id+'/full-access',{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:credential.revision,allowFullAccess:false})});
 assert.equal(off.status,200,await off.clone().text());const toggled=(await off.json()).credential;
 assert.equal(toggled.allowFullAccess,false);assert.notEqual(toggled.revision,credential.revision);
 const blocked=await f.call(endpoint+'/drafts/'+randomUUID()+'/send',token,{connectionId:'fixture',text:'x',clientRequestId:randomUUID(),expectedDraftRevision:state.revision,permissionMode:'full-access'});
 assert.equal(blocked.status,403);assert.equal((await blocked.json()).error.code,'programmatic_forbidden');
 assert.equal((await fetch(f.manager+'/'+credential.id+'/full-access',{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:credential.revision,allowFullAccess:true})})).status,409);
 assert.equal((await fetch(f.manager+'/'+credential.id+'/full-access',{method:'POST',headers:f.webHeaders,body:JSON.stringify({expectedRevision:toggled.revision,allowFullAccess:'yes'})})).status,400);
 const doc=await(await f.call('/openapi.json',token)).json(),expanded=expandRefs(doc,doc);
 const startRoute='/api/v1/programmatic/workspaces/{workspaceId}/conversations/drafts/{draftId}/send';
 assert.deepEqual(expanded.paths[startRoute].post.requestBody.content['application/json'].schema.properties.permissionMode.enum,['default','full-access']);
 const messagesRoute='/api/v1/programmatic/workspaces/{workspaceId}/conversations/{conversationId}/messages';
 const messagesMode=expanded.paths[messagesRoute].post.requestBody.content['application/json'].schema.properties.permissionMode;
 assert.equal(messagesMode.default,undefined,'messages omission must not document a default');
 assert.match(messagesMode.description,/沿用该对话最近一轮/);
});
