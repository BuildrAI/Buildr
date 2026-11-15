import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createAgentService} from '../../src/application/agent-service.ts';
import {createAgentServiceHttpContribution} from '../../src/interfaces/http/agent-service-http.ts';
import {createProgrammaticHttpContribution} from '../../src/interfaces/http/programmatic-http.ts';
import {executionScopeKey} from '../../src/execution-contracts.ts';
import {body,json,listen,authorize} from '../../src/process/transport.ts';
import {AgentServiceError} from '../../src/domain/agent-state.ts';

test('one public HTTP implementation serves source routes, old URLs and narrow program credentials without Development',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'harness-http-'));
  const work=path.join(root,'work');fs.mkdirSync(work);
  const scope={sourceId:'harness-local',id:'directory-ref'},key=executionScopeKey(scope);
  const service=createAgentService({dataRoot:root,legacySourceId:'buildr',executors:[],modelProviders:[],environment:{HOME:root},host:{
    async resolveExecutionScope({ref}){if(!(ref.sourceId==='buildr'&&ref.id==='legacy'||ref.sourceId===scope.sourceId&&ref.id===scope.id))throw new AgentServiceError('agent_scope_missing','未登记范围。',404);return {ref,revision:'registered',rootPath:work};},
    async listExecutionScopes(){return {refs:[scope,{sourceId:'buildr',id:'legacy'}],revision:'registered'};},
  }});
  const old=await service.conversations.create('legacy',{}),directory=await service.conversations.create(key,{});
  const browser='b'.repeat(40),keys=async()=>['legacy',key];
  const common=createAgentServiceHttpContribution(()=>service,{executionScopeKeys:keys});
  const api=createProgrammaticHttpContribution(()=>service,common,{dataRoot:()=>root,workspaces:()=>[{id:'legacy',name:'Development'}],scopeKeys:keys,version:()=>'test',buildId:()=>null});
  const channel=await listen(async(req,res)=>{
    const url=new URL(req.url!,'http://127.0.0.1');
    const auth=()=>authorize(req,browser);
    const context={request:req,pathname:url.pathname,searchParams:url.searchParams,authorizeRead:auth,authorizeWrite:auth,authorizeMutation:auth,readJsonBody:()=>body(req)};
    const result=await api.handleTopLevel(context)??await common.handleTopLevel(context);
    if(!result)throw new AgentServiceError('not_found','无此入口。',404);
    json(res,result.status,result.body);
  });
  t.after(async()=>{await channel.close();await service.close();fs.rmSync(root,{recursive:true,force:true});});
  const request=(url:string,token=browser,method='GET',input?:unknown)=>fetch(channel.origin+url,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json',origin:channel.origin},...(input?{body:JSON.stringify(input)}:{})});
  let response=await request('/api/v1/harness/sources/buildr/scopes/legacy/conversations/'+old.id);
  assert.equal(response.status,200);assert.equal((await response.json()).id,old.id,'a source alias never renames the legacy storage scope');
  response=await request('/api/v1/harness/sources/harness-local/scopes/directory-ref/conversations/'+directory.id);
  assert.equal(response.status,200);assert.equal((await response.json()).id,directory.id);
  response=await request('/api/v1/app/programmatic-access',browser,'POST',{name:'directory program',executionScopes:[scope],scopes:['read']});
  assert.equal(response.status,201,await response.clone().text());const {token,credential}=await response.json();
  assert.deepEqual(credential.workspaceIds,[]);assert.deepEqual(credential.executionScopes,[scope]);
  const prefix='/api/v1/programmatic/sources/harness-local/scopes/directory-ref/conversations/';
  response=await request(prefix+directory.id,token);assert.equal(response.status,200);assert.equal((await response.json()).id,directory.id);
  response=await request('/api/v1/programmatic/sources/buildr/scopes/legacy/conversations/'+old.id,token);assert.equal(response.status,403);
  response=await request('/api/v1/harness/connections',token);assert.equal(response.status,401,'program Bearer cannot become a page credential');
  response=await request('/api/v1/programmatic',token);assert.equal(response.status,200);const discovery=await response.json();assert.equal(discovery.executionScopes.length,1);assert.equal(discovery.executionScopes[0].ref.sourceId,scope.sourceId);
  response=await request('/api/v1/app/programmatic-access',browser,'POST',{name:'raw path',executionScopes:[{sourceId:'harness-local',id:'/tmp'}],scopes:['read']});assert.equal(response.status,404);
  const page=await service.conversations.read(key,directory.id);assert.equal(page.run,undefined);
});
