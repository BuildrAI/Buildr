import { createHash } from 'node:crypto';
import { AGENT_SERVICE_APPLICATION, createAgentServiceModule } from '../../src/modules/agent-service/module.ts';
import { WORKSPACE_APPLICATION } from '../../src/modules/workspace/module.ts';
import { TASK_QUERY_APPLICATION } from '../../src/modules/task/module.ts';
import { stopAgentProcess } from '@buildr-ai/buildr-agent';
import { runtimeProvide } from '../../src/bootstrap/runtime.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { AgentServiceError, createAgentService as createService, type AgentRuntime, type ExecutorItem } from '@buildr-ai/buildr-agent';
import { createRuntime, runtimeContributions } from '../helpers/runtime-harness.ts';
import { taskRecordFixture } from '../helpers/task-record-system-fixture.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { createAgentServiceHttpContribution } from '../../src/modules/agent-service/interfaces/http/agent-service-http.ts';
import { AGENT_SERVICE_HTTP_OPERATIONS } from '../../src/modules/agent-service/interfaces/http/agent-service-http-contracts.ts';
import { inspectHttpOperationCoverage } from '../../src/web/http/http-operation-coverage.ts';
import { apiError, eventStreamResponse } from '../../src/web/http/responses.ts';
import { stopOwnedChildProcess } from '../verification/support/owned-process.ts';

// HTTP fixtures must not load host credentials or start host-configured notification delivery.
function createAgentService(options: Parameters<typeof createService>[0]) {
  return createService({ ...options, environment: options.environment ?? { HOME: path.dirname(options.dataRoot) } });
}

test('linked task verification uses the authoritative summary without resolving full task diagnostics', {timeout:30_000}, async t => {
  let instance:any, dataRoot:string;
  t.after(async()=>{await instance?.provides[AGENT_SERVICE_APPLICATION].close();if(dataRoot)await stopAgentProcess({dataRoot});});
  const {base,root}=taskRecordFixture(t,'agent-task-summary-host');dataRoot=path.join(base,'private-agent');
  let summaries=0, wrongIdentity=false;
  const module=createAgentServiceModule({readProductIdentity:()=>({}),resolveWebProfile:()=>({dataRoot,profile:'fixture'})});
  instance=module.create({
    [WORKSPACE_APPLICATION]:{resolveRegisteredWorkspace:()=>({rootPath:root}),listRegisteredWorkspaces:()=>({workspaces:[]})},
    [TASK_QUERY_APPLICATION]:{
      inspectTask:()=>assert.fail('full diagnostics must not run on the execution callback path'),
      inspectTaskSummaryView:(_root:string,id:string)=>{summaries++;assert.equal(_root,root);return {record:{taskId:wrongIdentity?'another-task':id},recordDigest:'summary-revision'};},
    },
  });
  const response=await instance.contributions.http[0].handle({request:{method:'POST'},suffix:'/agent-conversations',workspaceId:'fixture-workspace',searchParams:new URLSearchParams(),authorizeWrite:()=>{},readJsonBody:async()=>({taskId:'linked-task'})});
  assert.equal(response.status,201,JSON.stringify(response.body));assert.equal(response.body.taskId,'linked-task');assert.equal(summaries,1);
  wrongIdentity=true;
  const rejected=await instance.contributions.http[0].handle({request:{method:'POST'},suffix:'/agent-conversations',workspaceId:'fixture-workspace',searchParams:new URLSearchParams(),authorizeWrite:()=>{},readJsonBody:async()=>({taskId:'linked-task'})});
  assert.equal(rejected.status,404);assert.equal(rejected.body.error.code,'agent_task_missing');
});

test('HTTP service fixtures ignore host webhook configuration', async t => {
  const { base } = taskRecordFixture(t, 'agent-http-host-isolation');
  const config = path.join(base, 'host-webhook.json');
  fs.writeFileSync(config, JSON.stringify({ url: 'http://127.0.0.1:1/host-only', secret: 'fixture-only-secret' }), { mode: 0o600 });
  const previous = process.env.BUILDR_AGENT_WEBHOOK_CONFIG;
  process.env.BUILDR_AGENT_WEBHOOK_CONFIG = config;
  t.after(() => { if (previous === undefined) delete process.env.BUILDR_AGENT_WEBHOOK_CONFIG; else process.env.BUILDR_AGENT_WEBHOOK_CONFIG = previous; });
  const dataRoot = path.join(base, 'agent-profile');
  const service = createAgentService({ dataRoot, executors: [], modelProviders: [] });
  t.after(() => service.close());
  assert.equal(service.webhooks.read().state, 'unconfigured');
  assert.equal(fs.existsSync(dataRoot), false, 'host notification configuration must not initialize fixture storage');
});

test('program preparation is authenticated, schema checked and independently observable/cancellable', { timeout: 30_000 }, async t => {
  const { base, root } = taskRecordFixture(t, 'agent-program-http');
  const previous = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'private-app');
  t.after(() => { if (previous === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previous; });
  const runtime = createRuntime();
  const service = createAgentService({ dataRoot: path.join(base, 'agent-profile'), executors: [{descriptor:{id:'codex',label:'Codex',capabilities:{text:true,images:false,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536}},open:async()=>assert.fail('missing program must not start a native process')}],programManager:{discover:async()=>({candidates:[],installation:{label:'Official Codex',version:'0.163.0',url:'https://learn.chatgpt.com/docs/cli',canInstall:true}}),install:async()=>assert.fail('installation requires a separate explicit action')},resolveWorkspace:()=>({rootPath:root}),assertTask:()=>{} });
  const contributions = runtimeContributions(runtime, 'http').filter((item: { id: string }) => item.id !== 'agent-service.http');
  contributions.push(createAgentServiceHttpContribution(() => service));
  const server = createLocalWorkspaceServer(runtime, {targetRoot:root,httpContributions:contributions});
  const {url,sessionToken}=await server.ready;
  t.after(async()=>{await service.close();server.server.closeAllConnections();await new Promise<void>(resolve=>server.server.close(() => resolve()));});
  const endpoint=`${url}/api/v1/app/agent-service/connections/codex/preparation-attempts`;
  const headers={origin:url,'x-buildr-session':sessionToken,'content-type':'application/json'};
  let response=await fetch(endpoint);assert.equal(response.status,403);
  response=await fetch(endpoint,{headers});assert.equal(response.status,200);assert.deepEqual(await response.json(),{attempt:null});
  assert.equal(fs.existsSync(path.join(base,'agent-profile')),false);
  response=await fetch(endpoint,{method:'POST',headers:{...headers,'x-buildr-session':'invalid'},body:JSON.stringify({expectedRevision:'unconfigured'})});assert.equal(response.status,403);
  response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({expectedRevision:'unconfigured',package:'malicious-package'})});assert.equal(response.status,400);
  response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({expectedRevision:'old'})});assert.equal(response.status,409);
  response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({expectedRevision:'unconfigured'})});assert.equal(response.status,202);
  const attempt=await response.json() as {id:string};
  response=await fetch(`${endpoint}/${attempt.id}`,{headers});assert.equal(response.status,200);assert.equal((await response.json()).state,'installation-required');
  response=await fetch(`${endpoint}/${attempt.id}/cancel`,{method:'POST',headers,body:'{}'});assert.equal(response.status,200);assert.equal((await response.json()).state,'cancelled');
  response=await fetch(endpoint,{headers});assert.equal((await response.json()).attempt.state,'cancelled');
  assert.equal(service.connections.read('codex').enabled,false);
  const upgrade=`${url}/api/v1/app/agent-service/connections/codex/program-upgrades`;
  response=await fetch(upgrade,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(response.status,403);
  response=await fetch(upgrade,{method:'POST',headers,body:JSON.stringify({expectedRevision:'unconfigured',expectedVersion:'0.164.0',package:'arbitrary'})});assert.equal(response.status,400);
  response=await fetch(upgrade,{method:'POST',headers,body:JSON.stringify({expectedRevision:'unconfigured',expectedVersion:'0.164.0'})});assert.equal(response.status,409);
  const updates=`${url}/api/v1/app/agent-service/program-updates`;
  response=await fetch(updates);assert.equal(response.status,403);
  response=await fetch(updates,{headers});assert.equal(response.status,200);
  assert.equal((await response.json()).programs[0].status,'not-connected');
  response=await fetch(updates+'/check',{method:'POST',headers:{...headers,origin:'https://foreign.example'},body:'{}'});assert.equal(response.status,403);
  response=await fetch(updates+'/check',{method:'POST',headers,body:'{"install":true}'});assert.equal(response.status,400);
  response=await fetch(updates+'/check',{method:'POST',headers,body:'{"connectionId":"missing"}'});assert.equal(response.status,404);
  response=await fetch(updates+'/check',{method:'POST',headers,body:'{"connectionId":"codex"}'});assert.equal(response.status,200);
  assert.equal((await response.json()).programs[0].status,'not-connected');
  assert.equal(service.connections.read('codex').enabled,false);

});

test('explicit program upgrade returns accepted work and observes the restarted binding over HTTP', {timeout:30_000}, async t=>{
  const {base,root}=taskRecordFixture(t,'agent-upgrade-http'),runtime=createRuntime();
  const original=path.join(base,'original.js'),installed=path.join(base,'new.js');fs.writeFileSync(original,'old');fs.writeFileSync(installed,'new');
  let opens=0,closes=0,installs=0;
  const capabilities={text:true,images:false,approval:false,questions:false,stop:true,resume:true,maxInputBytes:65536};
  const native:AgentRuntime={capabilities,bindingIdentity:'upgrade-fixture',bindingData:{executable:original},async inspectAccount(){return{status:'ready',label:'saved'};},async models(){return[];},async beginLogin(){assert.fail('upgrade cannot log in');},async cancelLogin(){},async createContext(){assert.fail('upgrade cannot create work');},async resumeContext(){},async readHistory(){return[];},async send(){assert.fail('upgrade cannot send');},async observe(){return{status:'idle',tools:[]};},async reply(){},async stop(){assert.fail('upgrade cannot stop work');},async close(){closes++;}};
  const service=createAgentService({dataRoot:path.join(base,'agent-profile'),executors:[{descriptor:{id:'codex',label:'Codex',capabilities},async open(){opens++;return{...native};}}],programManager:{isManaged:(_,file)=>file===installed,async discover(input){return{candidates:[{executable:input.boundExecutable!,label:'fixture',source:'configured',compatible:true,version:input.boundExecutable===installed?'0.164.0':'0.163.0'}],installation:{label:'fixture',url:'https://fixture.invalid',version:'0.163.0',canInstall:true}};},async install(input){assert.equal(input.version,'0.164.0');installs++;return installed;}},programRelease:async()=>({latestVersion:'0.164.0',source:'https://registry.npmjs.org/%40openai%2Fcodex/latest'}),resolveWorkspace:()=>({rootPath:root}),assertTask:()=>{}});
  const contributions=runtimeContributions(runtime,'http').filter((item:{id:string})=>item.id!=='agent-service.http');contributions.push(createAgentServiceHttpContribution(()=>service));
  const server=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions}),{url,sessionToken}=await server.ready;
  t.after(async()=>{await service.close();server.server.closeAllConnections();await new Promise<void>(resolve=>server.server.close(()=>resolve()));});
  const connection=await service.connections.connect('codex',{expectedRevision:'unconfigured',executable:original}),headers={origin:url,'x-buildr-session':sessionToken,'content-type':'application/json'},endpoint=url+'/api/v1/app/agent-service/connections/codex/program-upgrades';
  let response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({expectedRevision:connection.revision,expectedVersion:'0.164.0'})});assert.equal(response.status,202);assert.equal((await response.json()).state,'downloading');
  let completed=false;
  for(let n=0;n<200;n++){
    response=await fetch(url+'/api/v1/app/agent-service/program-updates',{headers});assert.equal(response.status,200);const row=(await response.json()).programs[0];
    if(row.upgrade?.state==='completed'){assert.equal(row.executable,installed);assert.equal(row.upgrade.currentVersion,'0.164.0');completed=true;break;}
    assert.notEqual(row.upgrade?.state,'failed',row.upgrade?.message);await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.ok(completed);assert.equal(installs,1);assert.equal(opens,2);assert.equal(closes,1);assert.equal(fs.readFileSync(original,'utf8'),'old');
});

test('private conversations use authenticated HTTP and bounded binary input; streams are observation only', { timeout: 30_000 }, async t => {
  const { base, root } = taskRecordFixture(t, 'agent-service-http');
  const previous = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'private-app');
  t.after(() => { if (previous === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previous; });
  const runtime = createRuntime();
  let workspaceId: string;
  const service = createAgentService({ dataRoot: path.join(base, 'agent-profile'), executors: [], resolveWorkspace: id => { assert.equal(id, workspaceId); return { rootPath: root }; }, assertTask: () => {} });
  const contributions = runtimeContributions(runtime, 'http').filter((item: { id: string }) => item.id !== 'agent-service.http');
  contributions.push(createAgentServiceHttpContribution(() => service,{registeredWorkspaceIds:()=>[workspaceId]}));
  const server = createLocalWorkspaceServer(runtime, { targetRoot: root, httpContributions: contributions });
  const { url, initialWorkspaceId, sessionToken } = await server.ready;
  workspaceId = initialWorkspaceId;
  t.after(async () => { await service.close(); server.server.closeAllConnections(); await new Promise<void>(resolve => server.server.close(() => resolve())); });
  const app = `${url}/api/v1/app/agent-service`;
  const conversations = `${url}/api/v1/workspaces/${workspaceId}/agent-conversations`;
  const headers = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const readHeaders = { 'x-buildr-session': sessionToken };
  let response = await fetch(`${app}/connections`);
  assert.equal(response.status, 403);
  response = await fetch(`${app}/connections`, { headers: { ...readHeaders, origin: 'https://foreign.example' } }); assert.equal(response.status, 403);
  response = await fetch(`${app}/connections`, { headers: readHeaders }); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { connections: [] });
  assert.equal(fs.existsSync(path.join(base, 'agent-profile')), false, 'read-only route must not initialize private state');
  response = await fetch(conversations, { method: 'POST', headers: { ...headers, 'x-buildr-session': 'invalid' }, body: '{}' }); assert.equal(response.status, 403);
  response = await fetch(conversations, { method: 'POST', headers, body: JSON.stringify({ title: 'HTTP work', target: '/outside' }) }); assert.equal(response.status, 400);
  response = await fetch(conversations, { method: 'POST', headers, body: JSON.stringify({ title: 'HTTP work' }) }); assert.equal(response.status, 201);
  const created = await response.json() as { id: string; revision: string; entries: unknown[] };
  assert.deepEqual(created.entries, []);
  response = await fetch(`${app}/conversations`); assert.equal(response.status,403);
  response = await fetch(`${app}/conversations`, {headers:readHeaders}); assert.equal(response.status,200);
  let summaries=await response.json();
  // 已创建但从未发出内容的草稿不进入对话历史。
  assert.equal(summaries.total,0);assert.deepEqual(summaries.conversations,[]);assert.deepEqual(summaries.stats.executions,[],'执行组合摘要穿过真实HTTP契约，不被丢弃');
  {
    const store=new DatabaseSync(path.join(base,'agent-profile','agent-service','conversations.sqlite'));
    try{const row=store.prepare('SELECT body FROM conversations WHERE id=?').get(created.id) as {body:string};const record=JSON.parse(row.body);record.view.entries.push({id:'seed-entry',sequence:1,kind:'message',role:'user',text:'started work',createdAt:'2026-10-27T00:00:00Z'});seedConversation(store, record);}finally{store.close();}
  }
  response = await fetch(`${app}/conversations`, {headers:readHeaders}); assert.equal(response.status,200);
  summaries=await response.json();assert.equal(summaries.total,1);assert.equal(summaries.conversations[0].id,created.id);assert.deepEqual(summaries.conversations[0].entries,[]);
  response = await fetch(`${app}/conversations?workspaceId=unregistered`, {headers:readHeaders});assert.equal(response.status,404);
  response = await fetch(`${app}/conversations?activeOnly=1`, {headers:readHeaders});assert.equal(response.status,400);
  response=await fetch(`${app}/conversations?activityState=invalid`,{headers:readHeaders});assert.equal(response.status,400);
  response=await fetch(`${app}/conversations?activityState=waiting`,{headers:readHeaders});assert.equal(response.status,200);const waitingPage=await response.json();assert.equal(waitingPage.total,0);assert.deepEqual(waitingPage.conversations,[]);assert.equal(typeof waitingPage.activityCounts.attention,'number');
  response = await fetch(`${conversations}/${created.id}/seen`, {method:'POST',headers:{...headers,'x-buildr-session':'invalid'},body:JSON.stringify({through:0})});assert.equal(response.status,403);
  response = await fetch(`${conversations}/${created.id}/seen`, {method:'POST',headers,body:JSON.stringify({through:1})});assert.equal(response.status,409);
  response = await fetch(`${conversations}/${created.id}/seen`, {method:'POST',headers,body:JSON.stringify({through:0})});assert.equal(response.status,200);assert.equal((await response.json()).activity.seenThrough,0);

  const permissionDraft = { expectedRevision: created.revision, connectionId: 'not-registered', text: 'Keep this unsent.' };
  response=await fetch(`${conversations}/${created.id}/pending-send`,{method:'POST',headers:{...headers,'x-buildr-session':'invalid'},body:JSON.stringify({...permissionDraft,clientRequestId:'queued-http'})});assert.equal(response.status,403);
  response=await fetch(`${conversations}/${created.id}/pending-send`,{method:'POST',headers,body:JSON.stringify({...permissionDraft,clientRequestId:'queued-http',unrecognized:true})});assert.equal(response.status,400);
  response=await fetch(`${conversations}/${created.id}/pending-send`,{method:'POST',headers,body:JSON.stringify({...permissionDraft,clientRequestId:'queued-http'})});assert.equal(response.status,202);
  const queued=await response.json();assert.equal(queued.pendingSend.state,'waiting');assert.equal(queued.pendingSend.draft.text,permissionDraft.text);
  assert.equal(queued.pendingSend.draft.permissionMode,'full-access','unknown connection remains queued with the default, not admitted or downgraded');
  response=await fetch(`${conversations}/${created.id}`,{headers:readHeaders});assert.equal((await response.json()).pendingSend.id,'queued-http');
  response=await fetch(`${conversations}/${created.id}/cancel-pending-send`,{method:'POST',headers,body:JSON.stringify({expectedPendingRevision:'stale'})});assert.equal(response.status,409);
  response=await fetch(`${conversations}/${created.id}/cancel-pending-send`,{method:'POST',headers,body:JSON.stringify({expectedPendingRevision:queued.pendingSend.revision})});assert.equal(response.status,200);assert.equal((await response.json()).pendingSend,undefined);
  response=await fetch(`${conversations}/${created.id}/pending-send`,{method:'POST',headers,body:JSON.stringify({...permissionDraft,clientRequestId:'queued-http'})});assert.equal(response.status,202);assert.equal((await response.json()).pendingSend,undefined);
  for (const permissionMode of ['always-approve', true, null]) {
    response = await fetch(`${conversations}/${created.id}/prepare-send`, { method: 'POST', headers, body: JSON.stringify({ ...permissionDraft, permissionMode }) });
    assert.equal(response.status, 400, 'unsupported permission values must fail before any native effect');
    response = await fetch(`${conversations}/${created.id}/send`, { method: 'POST', headers, body: JSON.stringify({ ...permissionDraft, permissionMode, previewToken: 'invalid', clientRequestId: 'invalid-permission' }) });
    assert.equal(response.status, 400);
  }
  response = await fetch(`${conversations}/${created.id}/prepare-send`, { method: 'POST', headers, body: JSON.stringify({ ...permissionDraft, permissionMode: 'full-access' }) });
  assert.equal(response.status, 404, 'declared mode reaches the exact connection lookup, without inventing a connection');
  response = await fetch(`${conversations}/${created.id}/generate-title`, { method: 'POST', headers: { ...headers, 'x-buildr-session': 'invalid' }, body: JSON.stringify({ expectedRevision: created.revision }) }); assert.equal(response.status, 403);
  response = await fetch(`${conversations}/${created.id}/generate-title`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: created.revision, title: 'client cannot masquerade as generated' }) }); assert.equal(response.status, 400);
  response = await fetch(`${conversations}/${created.id}/generate-title`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: created.revision }) }); assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'agent_title_unavailable');

  response = await fetch(`${conversations}/${created.id}/events`); assert.equal(response.status, 403);
  const abort = new AbortController();
  const stream = await fetch(`${conversations}/${created.id}/events?cursor=999&generation=old`, { headers: readHeaders, signal: abort.signal });
  assert.equal(stream.status, 200); assert.match(stream.headers.get('content-type')!, /text\/event-stream/);
  const reader = stream.body!.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /event: snapshot/); assert.match(first, new RegExp(created.id));
  response = await fetch(`${conversations}/${created.id}`, { method: 'PATCH', headers, body: JSON.stringify({ expectedRevision: created.revision, title: 'updated through GUI' }) }); assert.equal(response.status, 200);
  const updated = await response.json() as { revision: string };
  const next = new TextDecoder().decode((await reader.read()).value); assert.match(next, /updated through GUI/);
  abort.abort(); await reader.cancel().catch(() => {});

  response = await fetch(`${conversations}/${created.id}/attachments`, { method: 'POST', headers: { origin: url, 'x-buildr-session': 'invalid', 'content-type': 'image/png', 'x-buildr-conversation-revision': updated.revision }, body: Buffer.from('not an image') }); assert.equal(response.status, 403);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  response = await fetch(`${conversations}/${created.id}/attachments`, { method: 'POST', headers: { origin: url, ...readHeaders, 'content-type': 'image/png', 'x-buildr-conversation-revision': updated.revision }, body: png }); assert.equal(response.status, 201);
  const attachment = await response.json() as { id: string; revision: string };
  response = await fetch(`${conversations}/${created.id}/attachments/${attachment.id}`); assert.equal(response.status, 403);
  response = await fetch(`${conversations}/${created.id}/attachments/${attachment.id}`, { headers: readHeaders }); assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  const videoBytes=Buffer.alloc(9*1024*1024);Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex').copy(videoBytes);
  const videoHeaders={origin:url,...readHeaders,'content-type':'video/mp4','x-buildr-conversation-revision':attachment.revision,'x-buildr-video':JSON.stringify({duration:2,frames:[{id:attachment.id,time:0}]})};
  response=await fetch(`${conversations}/${created.id}/attachments`,{method:'POST',headers:{...videoHeaders,'x-buildr-session':'invalid'},body:videoBytes});assert.equal(response.status,403);
  response=await fetch(`${conversations}/${created.id}/attachments`,{method:'POST',headers:videoHeaders,body:videoBytes});assert.equal(response.status,201);const video=await response.json();attachment.revision=video.revision;
  response=await fetch(`${conversations}/${created.id}/attachments/${video.id}`,{headers:readHeaders});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'video/mp4');assert.deepEqual(Buffer.from(await response.arrayBuffer()),videoBytes);
  response = await fetch(`${conversations}/${created.id}/prepare-send`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: attachment.revision, connectionId: 'not-registered', text: 'x'.repeat(129 * 1024) }) }); assert.equal(response.status, 413);
  response = await fetch(`${conversations}?hidden=true&query=updated`, { headers: readHeaders }); assert.equal(response.status, 200); assert.equal((await response.json()).conversations.length, 1);
  response = await fetch(`${conversations}/${created.id}`, { method: 'PATCH', headers, body: JSON.stringify({ expectedRevision: attachment.revision, taskId: 'task-http' }) }); assert.equal(response.status, 200);
  let linked = await response.json() as { revision: string; taskId?: string; taskIds?: string[] };
  assert.deepEqual(linked.taskIds,['task-http']);
  response = await fetch(`${conversations}/${created.id}`, { method:'PATCH',headers,body:JSON.stringify({expectedRevision:linked.revision,taskIds:['task-http']}) });assert.equal(response.status,200);
  linked=await response.json() as typeof linked;assert.deepEqual(linked.taskIds,['task-http']);
  assert.equal(linked.taskId, 'task-http');
  const taskLinks=[{workspaceId,taskId:'task-http'},{workspaceId:'other-workspace',taskId:'task-http'}];
  response=await fetch(`${conversations}/${created.id}`,{method:'PATCH',headers,body:JSON.stringify({expectedRevision:linked.revision,taskLinks})});assert.equal(response.status,200);
  linked=await response.json() as typeof linked;assert.deepEqual((linked as any).taskLinks,taskLinks);assert.deepEqual(linked.taskIds,['task-http']);
  response=await fetch(`${conversations}/${created.id}`,{method:'PATCH',headers,body:JSON.stringify({expectedRevision:linked.revision,taskLinks:[{workspaceId:'',taskId:'task-http'}]})});assert.equal(response.status,400);
  response = await fetch(`${conversations}/${created.id}`, { method: 'PATCH', headers, body: JSON.stringify({ expectedRevision: linked.revision, taskId: null }) }); assert.equal(response.status, 200);
  assert.equal((await response.json() as { taskId?: string }).taskId, undefined);
  const coverage = inspectHttpOperationCoverage([AGENT_SERVICE_HTTP_OPERATIONS], []);
  assert.equal(coverage.status, 'aligned', JSON.stringify(coverage));
});

test('fork HTTP validates authentication and observations, preserves provenance and never sends work', { timeout: 15_000 }, async t => {
  const { base, root } = taskRecordFixture(t, 'agent-fork-http');
  const capabilities = { text: true, images: false, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 65536 };
  const history: ExecutorItem[] = [];
  let sends = 0, forks = 0;
  const executor: AgentRuntime = {
    bindingIdentity: 'fork-http-binding', capabilities,
    async inspectAccount() { return { status: 'ready' }; }, async models() { return [{ id: 'fixture-model', label: 'Fixture model', isDefault: true }]; },
    async beginLogin() {}, async cancelLogin() {},
    async createContext() { return { id: 'source-native' }; }, async resumeContext() {},
    async readHistory() { return history; },
    async forkContext(input) {
      forks++;
      assert.equal(input.contextRef.id, 'source-native');
      assert.equal(input.executionRef.id, 'native-turn');
      assert.equal(input.itemId, 'native-answer');
      const child = { id: 'child-native' };
      input.onCreated(child);
      return child;
    },
    async send(input) {
      sends++;
      input.onEvent({ type: 'accepted', executionRef: { id: 'native-turn' }, inputItemId: input.clientRequestId });
      const answer: ExecutorItem = { id: 'native-answer', kind: 'message', role: 'assistant', text: 'Final answer', executionId: 'native-turn', status: 'completed' };
      history.push(answer);
      input.onEvent({ type: 'item', item: answer });
      input.onEvent({ type: 'completed', status: 'completed' });
    },
    async observe({ executionRef }) { return { status: 'idle', executionRef, tools: [] }; }, async reply() {},
    async stop() { return { status: 'stopped', tools: [] }; }, async close() {},
  };
  const service = createAgentService({
    dataRoot: path.join(base, 'agent-profile'), modelProviders: [],
    executors: [{ descriptor: { id: 'fixture', label: 'Fixture', capabilities }, async open() { return executor; } }],
    resolveWorkspace: () => ({ rootPath: root }),
  });
  const runtime = createRuntime(), contributions = runtimeContributions(runtime, 'http').filter((item: { id: string }) => item.id !== 'agent-service.http');
  contributions.push(createAgentServiceHttpContribution(() => service));
  const server = createLocalWorkspaceServer(runtime, { targetRoot: root, httpContributions: contributions });
  t.after(async () => { await service.close(); server.server.closeAllConnections(); await new Promise<void>(resolve => server.server.close(() => resolve())); });
  const { url, initialWorkspaceId: workspaceId, sessionToken } = await server.ready;
  await service.connections.connect('fixture', { expectedRevision: 'unconfigured' });
  const source = await service.conversations.create(workspaceId, { title: 'Original title' });
  const draft = { expectedRevision: source.revision, connectionId: 'fixture', text: 'Original instruction' };
  const preview = service.conversations.prepareSend(workspaceId, source.id, draft);
  service.conversations.send(workspaceId, source.id, { ...draft, previewToken: preview.token, clientRequestId: 'source-input' });
  for (let n = 0; n < 100 && service.conversations.read(workspaceId, source.id).run?.status !== 'completed'; n++) await new Promise(resolve => setTimeout(resolve, 2));
  const before = service.conversations.read(workspaceId, source.id);
  assert.equal(before.run?.status, 'completed', JSON.stringify(before.run));
  const answer = before.entries.findLast(entry => entry.role === 'assistant')!;
  const endpoint = `${url}/api/v1/workspaces/${workspaceId}/agent-conversations/${source.id}/fork`;
  const headers = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const input = { expectedRevision: before.revision, entryId: answer.id, clientRequestId: 'fork-http-request' };
  const post = (body: unknown, auth = headers) => fetch(endpoint, { method: 'POST', headers: auth, body: JSON.stringify(body) });
  assert.equal((await post(input, { ...headers, 'x-buildr-session': 'invalid' })).status, 403);
  assert.equal((await post({ ...input, untrusted: true })).status, 400);
  assert.equal((await post({ expectedRevision: before.revision, entryId: answer.id })).status, 400);
  assert.equal((await post({ ...input, expectedRevision: 'stale' })).status, 409);
  assert.equal(forks, 0);
  const response = await post(input);
  assert.equal(response.status, 201);
  const child = await response.json();
  assert.notEqual(child.id, source.id);
  assert.deepEqual(child.forkedFrom, { conversationId: source.id, workspaceId, entryId: answer.id, runId: answer.runId, throughSequence: before.entries.at(-1)!.sequence, title: source.title, forkedAt: child.forkedFrom.forkedAt });
  assert.equal(child.forkState.status, 'ready');
  assert.equal(child.run, undefined);
  assert.deepEqual(child.requests, []);
  const repeated = await post(input);
  assert.equal(repeated.status, 201);
  assert.equal((await repeated.json()).id, child.id);
  const read = await fetch(endpoint.replace(`${source.id}/fork`, child.id), { headers });
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).forkedFrom, child.forkedFrom);
  assert.equal(service.conversations.read(workspaceId, source.id).revision, before.revision);
  assert.equal(forks, 1);
  assert.equal(sends, 1);
});

test('a valid large initial snapshot drains before subsequent live events instead of disconnecting', { timeout: 10_000 }, async t => {
  let released = false;
  const server = createServer((_request, response) => {
    const subscription = {
      async *events() {
        yield { cursor: 1, type: 'snapshot', text: 'x'.repeat(400 * 1024) };
        yield { cursor: 2, type: 'conversation', text: 'permission request after snapshot' };
      },
      close() { released = true; },
    };
    void eventStreamResponse(response, { events: subscription.events(), close: subscription.close }, value => value);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const response = await fetch(`http://127.0.0.1:${address.port}`);
  const text = await response.text();
  assert.match(text, /event: snapshot/);
  assert.match(text, /id: 2\nevent: conversation/);
  assert.match(text, /permission request after snapshot/);
  assert.equal(released, true);
});

test('model account HTTP preserves authentication, revisions, source identity and secret-free catalog', {timeout:30000}, async t=>{
  const {base,root}=taskRecordFixture(t,'shared-model-http');
  const service=createAgentService({dataRoot:path.join(base,'model-profile'),executors:[],modelProviders:[{id:'fixture',label:'Fixture',async open(){return {protocol:'chat-completions',async inspect(){return {status:'ready',label:'Plan owner',models:[{id:'same-name',label:'Model',images:false,tools:true}],quota:{available:false,observedAt:new Date().toISOString()}};},async beginLogin(update){update({state:'waiting-browser',url:'https://login.example.test/authorize'});},async cancelLogin(){},async infer(){return Response.json({});},async close(){}};}}],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
  const runtime=createRuntime(),contributions=runtimeContributions(runtime,'http').filter((item:{id:string})=>item.id!=='agent-service.http');contributions.push(createAgentServiceHttpContribution(()=>service));
  const server=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions}),{url,sessionToken}=await server.ready;
  t.after(async()=>{await service.close();server.server.closeAllConnections();await new Promise<void>(resolve=>server.server.close(() => resolve()));});
  const endpoint=url+'/api/v1/app/agent-service/model-accounts',headers={origin:url,'x-buildr-session':sessionToken,'content-type':'application/json'};
  assert.equal((await fetch(endpoint)).status,403);
  let response=await fetch(endpoint,{headers});assert.equal(response.status,200);assert.equal((await response.json()).providers[0].id,'fixture');
  response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({provider:'fixture',token:'must-not-accept-secret'})});assert.equal(response.status,400);
  response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({provider:'fixture'})});assert.equal(response.status,201);const created=await response.json();
  response=await fetch(endpoint+'/'+created.id+'/check',{method:'POST',headers,body:JSON.stringify({expectedRevision:'old'})});assert.equal(response.status,409);
  response=await fetch(endpoint+'/'+created.id+'/check',{method:'POST',headers,body:JSON.stringify({expectedRevision:created.revision})});assert.equal(response.status,200);const checked=await response.json();assert.equal(checked.status,'ready');
  response=await fetch(url+'/api/v1/app/agent-service/model-catalog',{headers});assert.equal(response.status,200);const catalog=await response.json();assert.equal(catalog.models[0].accountId,created.id);assert.equal(catalog.models[0].available,false);assert.equal(catalog.models[0].enabled,false);assert.ok(!JSON.stringify(catalog).includes('apiKey'));
  response=await fetch(endpoint+'/'+created.id+'/login-attempts',{method:'POST',headers,body:JSON.stringify({expectedRevision:checked.revision})});assert.equal(response.status,202);let login=await response.json();
  for(let i=0;i<20&&!login.loginAttempt?.url;i++){response=await fetch(endpoint+'/'+created.id+'/login-attempts/'+login.loginAttempt.id,{headers});login=await response.json();await new Promise(resolve=>setTimeout(resolve,2));}
  assert.equal(login.loginAttempt.url,'https://login.example.test/authorize');
  response=await fetch(endpoint+'/'+created.id+'/login-attempts/'+login.loginAttempt.id+'/cancel',{method:'POST',headers,body:JSON.stringify({expectedRevision:login.revision})});assert.equal(response.status,200);const cancelled=await response.json();assert.equal(cancelled.loginAttempt.state,'cancelled');
});

test('model selection HTTP returns the local snapshot without waiting for external account checks', {timeout:30000},async t=>{
  const {base,root}=taskRecordFixture(t,'model-catalog-current-http');
  const service=createAgentService({dataRoot:path.join(base,'profile'),executors:[],modelProviders:[{id:'fixture',label:'Fixture',async open(){return{protocol:'chat-completions',async inspect(){return{status:'ready',models:[{id:'model',label:'Model',images:false,tools:true}]};},async beginLogin(){},async cancelLogin(){},async infer(){return assert.fail('catalog must not infer');},async close(){}};}}],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
  const added=await service.models.accounts.add({provider:'fixture'});await service.models.accounts.check(added.id);
  const list=service.models.catalog.list,cached=await list();
  let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),reading=new Promise<void>(resolve=>{started=resolve;});
  // The discovery boundary offers a quick cached read or its current refresh.
  service.models.catalog.list=async(input={})=>{started();if(input.refresh===false)return cached;await gate;return list();};
  const runtime=createRuntime(),contributions=runtimeContributions(runtime,'http').filter((item:{id:string})=>item.id!=='agent-service.http');contributions.push(createAgentServiceHttpContribution(()=>service));
  const server=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions}),{url,sessionToken}=await server.ready,headers={'x-buildr-session':sessionToken};
  t.after(async()=>{release();await service.close();server.server.closeAllConnections();await new Promise<void>(resolve=>server.server.close(()=>resolve()));});
  const pending=fetch(url+'/api/v1/app/agent-service/model-catalog',{headers});await reading;
  assert.equal((await fetch(url+'/api/v1/app/agent-service/connections',{headers})).status,200);
  const response=await pending;assert.equal(response.status,200);
  assert.equal((await response.json()).models[0].accountRevision,cached.models[0].accountRevision);
  release();
});

test('model preferences enforce authentication, revision and context limits', {timeout:30000},async t=>{
 const {base,root}=taskRecordFixture(t,'model-preferences-http');
 const service=createAgentService({dataRoot:path.join(base,'agent-profile'),executors:[],modelProviders:[{id:'fixture',label:'Fixture',async open(){return{protocol:'chat-completions',inspect:async()=>({status:'ready',models:[{id:'model',label:'Model',images:false,tools:true,contextWindow:258000}],quota:{available:true,observedAt:'2026-10-25T00:00:00Z',windows:[{id:'weekly',label:'每周窗口',remainingPercent:93}]}}),beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>assert.fail('metadata must not infer'),close:async()=>{}};}}],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
 const runtime=createRuntime(),contributions=runtimeContributions(runtime,'http').filter((item:{id:string})=>item.id!=='agent-service.http');contributions.push(createAgentServiceHttpContribution(()=>service));
 const server=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions});const {url,sessionToken}=await server.ready;
 t.after(async()=>{await service.close();server.server.closeAllConnections();await new Promise<void>(resolve=>server.server.close(() => resolve()));});
 const added=await service.models.accounts.add({provider:'fixture'}),checked=await service.models.accounts.check(added.id);
 const endpoint=`${url}/api/v1/app/agent-service/model-accounts/${added.id}/preferences`,headers={origin:url,'x-buildr-session':sessionToken,'content-type':'application/json'};
 assert.equal((await fetch(endpoint,{method:'POST',body:'{}'})).status,403);
 assert.equal((await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({models:[{id:'model',enabled:true}]})})).status,400);
 for(const value of [0,1.5,258001])assert.equal((await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({expectedRevision:checked.revision,models:[{id:'model',contextWindow:value}]})})).status,400);
 const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({expectedRevision:checked.revision,models:[{id:'model',enabled:true,contextWindow:128000}]})});assert.equal(response.status,200);const updated=await response.json();assert.equal(updated.models[0].contextWindow,128000);assert.equal(updated.models[0].contextWindowOverride,128000);assert.equal(updated.quota.windows[0].remainingPercent,93);assert.equal(JSON.stringify(updated).includes('apiKey'),false);
 assert.equal((await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({expectedRevision:checked.revision,models:[{id:'model',enabled:false}]})})).status,409);
 const reset=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({expectedRevision:updated.revision,models:[{id:'model',contextWindow:null}]})});assert.equal(reset.status,200);assert.equal((await reset.json()).models[0].contextWindow,258000);
});

test('HTTP handoff exposes the exact bounded body, local sources and confirmed receipt without manual condensation', {timeout:15_000}, async t=>{
  const {base,root}=taskRecordFixture(t,'handoff-http');
  const previous=process.env.BUILDR_APP_DATA_DIR;process.env.BUILDR_APP_DATA_DIR=path.join(base,'private-app');
  t.after(()=>{if(previous===undefined)delete process.env.BUILDR_APP_DATA_DIR;else process.env.BUILDR_APP_DATA_DIR=previous;});
  let workspaceId='';const sent:string[]=[];
  const executors=['a','b'].map(id=>({descriptor:{id,label:id,capabilities:{text:true,images:false,approval:true,questions:true,stop:true,resume:true,maxInputBytes:id==='b'?8192:128*1024}},async open(){return {
    bindingIdentity:id,capabilities:this.descriptor.capabilities,inspectAccount:async()=>({status:'ready' as const}),models:async()=>[{id:'fixture',label:'Fixture',isDefault:true}],beginLogin:async()=>{},cancelLogin:async()=>{},createContext:async()=>({id:'native-'+id}),resumeContext:async()=>{},readHistory:async()=>[],
    async send(input:any){sent.push(input.text);input.onEvent({type:'accepted',executionRef:{id:'run-'+id}});input.onEvent({type:'item',item:{id:'answer-'+id,kind:'message',role:'assistant',text:'still need real startup validation',status:'completed'}});input.onEvent({type:'completed',status:'completed'});},
    observe:async()=>({status:'idle' as const,executionRef:{id:'run-'+id},tools:[]}),reply:async()=>{},stop:async()=>({status:'stopped' as const,tools:[]}),close:async()=>{}
  };}}));
  const service=createAgentService({dataRoot:path.join(base,'agent-profile'),executors,resolveWorkspace:id=>{assert.equal(id,workspaceId);return{rootPath:root};},assertTask:()=>{}});
  const runtime=createRuntime(),contributions=runtimeContributions(runtime,'http').filter((item:{id:string})=>item.id!=='agent-service.http');contributions.push(createAgentServiceHttpContribution(()=>service));
  const server=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions});
  const ready=await server.ready;workspaceId=ready.initialWorkspaceId;
  t.after(async()=>{await service.close();server.server.closeAllConnections();await new Promise<void>(resolve=>server.server.close(()=>resolve()));});
  const headers={origin:ready.url,'x-buildr-session':ready.sessionToken,'content-type':'application/json'};
  for(const id of ['a','b'])await service.connections.connect(id,{expectedRevision:service.connections.read(id).revision});
  const chat=await service.conversations.create(workspaceId,{});
  const first={expectedRevision:chat.revision,connectionId:'a',text:'original user requirement '.repeat(900)};
  const preview=service.conversations.prepareSend(workspaceId,chat.id,first);service.conversations.send(workspaceId,chat.id,{...first,previewToken:preview.token,clientRequestId:'first'});
  const completed=async()=>{for(let n=0;n<500;n++){const value=service.conversations.read(workspaceId,chat.id);if(value.run?.status==='completed')return value;if(value.run?.status==='failed'||value.run?.status==='unknown')assert.fail(JSON.stringify(value.run));await new Promise<void>(resolve=>setTimeout(resolve,2));}assert.fail(JSON.stringify(service.conversations.read(workspaceId,chat.id).run));};
  const before=await completed(),draft={expectedRevision:before.revision,connectionId:'b',text:'continue'};
  const endpoint=`${ready.url}/api/v1/workspaces/${workspaceId}/agent-conversations/${chat.id}`;
  let response=await fetch(endpoint+'/prepare-send',{method:'POST',headers,body:JSON.stringify(draft)});assert.equal(response.status,200);
  const prepared=await response.json();assert.equal(prepared.fits,true);assert.equal(prepared.handoff.mode,'indexed');assert.ok(fs.existsSync(prepared.handoff.sourcePath));assert.ok(prepared.inputBytes<=8192);
  response=await fetch(endpoint+'/send',{method:'POST',headers,body:JSON.stringify({...draft,previewToken:prepared.token,clientRequestId:'second'})});assert.equal(response.status,202);
  const after=await completed(),receipt=after.entries.find(entry=>entry.kind==='handoff')!;
  assert.equal(sent[1],prepared.handoff.body);assert.equal(receipt.handoff!.body,prepared.handoff.body);assert.equal(receipt.status,'accepted');
  response=await fetch(endpoint,{headers});assert.equal(response.status,200);assert.equal((await response.json()).entries.find((entry:any)=>entry.kind==='handoff').handoff.body,sent[1]);
  // Ordinary HTTP admission requires no preview request or token, but remains idempotent.
  const ordinary={expectedRevision:after.revision,connectionId:'b',text:'ordinary follow-up',clientRequestId:'direct-http'};
  const start=performance.now();
  response=await fetch(endpoint+'/send',{method:'POST',headers,body:JSON.stringify(ordinary)});assert.equal(response.status,202);
  const admitted=await response.json(),admissionMs=performance.now()-start;
  response=await fetch(endpoint+'/send',{method:'POST',headers,body:JSON.stringify(ordinary)});assert.equal(response.status,202);
  assert.equal((await response.json()).run.id,admitted.run.id);
  await completed();assert.equal(sent.length,3);assert.equal(sent[2],'ordinary follow-up');
  t.diagnostic('Local fake-executor HTTP admission: '+admissionMs.toFixed(1)+'ms; through native completion: '+(performance.now()-start).toFixed(1)+'ms (not a live-model latency measurement)');

});


test('the real web CLI discovers host interruptions on listening without a browser request', {timeout:30_000}, async t=>{
  const {base,root}=taskRecordFixture(t,'agent-startup-recovery');
  const dataRoot=path.join(base,'restart-profile');
  const service=createAgentService({dataRoot,executors:[],resolveWorkspace:()=>({rootPath:root}),assertTask:()=>{}});
  const conversation=await service.conversations.create('startup-workspace',{});await service.close();
  const filename=path.join(dataRoot,'agent-service','conversations.sqlite');
  const db=new DatabaseSync(filename);
  const record=JSON.parse((db.prepare('SELECT body FROM conversations WHERE id=?').get(conversation.id) as {body:string}).body);
  record.view.run={id:'interrupted-run',participantId:'missing-participant',provider:'codex',generation:'previous-host',status:'stopped',accepted:true,tools:[],interrupted:true,diagnostic:'before-startup',startedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  record.interruption={runId:'interrupted-run',awaitingUser:false};
  db.prepare('UPDATE conversations SET body=? WHERE id=?').run(JSON.stringify(record),conversation.id);db.close();
  const child=spawn(process.execPath,[path.resolve('bin/buildr.mjs'),'web','--port','0','--no-open'],{env:{...process.env,BUILDR_APP_DATA_DIR:dataRoot},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>{output+=chunk});child.stderr.on('data',chunk=>{output+=chunk});
  t.after(async()=>{
    try { await stopOwnedChildProcess(child); }
    finally { await stopAgentProcess({dataRoot}).catch(error=>{if(error.code!=='agent_process_stop_unconfirmed')throw error;}); }
  });
  const end=Date.now()+20_000;let diagnostic='before-startup';
  while(Date.now()<end){
    const read=new DatabaseSync(filename,{readOnly:true});
    read.exec('PRAGMA busy_timeout=1000');
    const current=JSON.parse((read.prepare('SELECT body FROM conversations WHERE id=?').get(conversation.id) as {body:string}).body);read.close();
    diagnostic=current.view.run.diagnostic;
    if(diagnostic!=='before-startup')break;
    assert.equal(child.exitCode,null,output);await new Promise(resolve=>setTimeout(resolve,50));
  }
  const startupLog=path.join(dataRoot,'agent-service/process/startup.log');
  assert.match(diagnostic,/执行未完成.*核对原执行及控制资源.*不重复操作/,JSON.stringify({output,startupLog:fs.existsSync(startupLog)?fs.readFileSync(startupLog,'utf8').slice(-6000):null}));
});


test('default conversations use a stable application directory without a registered workspace', async t => {
  t.after(async()=>{await runtimeProvide(runtime,AGENT_SERVICE_APPLICATION).close();await stopAgentProcess({dataRoot:path.join(base,'private-app')});});
  const { base, root } = taskRecordFixture(t, 'agent-default-http');
  const previous = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'private-app');
  t.after(() => { if (previous === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previous; });
  const runtime = createRuntime();
  const server = createLocalWorkspaceServer(runtime, { targetRoot: root, httpContributions: runtimeContributions(runtime, 'http') });
  const { url, sessionToken } = await server.ready;
  t.after(async () => { server.server.closeAllConnections(); await new Promise<void>(resolve => server.server.close(() => resolve())); });
  const endpoint = `${url}/api/v1/app/agent-service/conversations`;
  const headers = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  assert.equal((await fetch(endpoint)).status, 403);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...headers, 'x-buildr-session': 'invalid' }, body: '{}' })).status, 403);
  for (const body of [{ cwd: root }, { taskId: 'some-task' }]) {
    assert.equal((await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) })).status, 400);
  }
  const directoryEndpoint = `${url}/api/v1/app/agent-service/default-workspace`;
  assert.equal((await fetch(directoryEndpoint)).status, 403);
  const directoryResponse = await fetch(directoryEndpoint, { headers });
  assert.equal(directoryResponse.status, 200);
  const directory = await directoryResponse.json() as { rootPath: string };
  assert.ok(path.isAbsolute(directory.rootPath));
  assert.equal(fs.existsSync(directory.rootPath), false);
  const response = await fetch(endpoint, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 201);
  const chat = await response.json() as { id: string; workspaceId: string; cwd: string; revision: string };
  assert.equal(chat.workspaceId, '@default');
  assert.equal(chat.cwd, fs.realpathSync(directory.rootPath));
  assert.notEqual(chat.cwd, fs.realpathSync(root));
  assert.equal(path.basename(chat.cwd), 'default-workspace');
  assert.ok(fs.statSync(chat.cwd).isDirectory());
  const read = await fetch(`${endpoint}/${chat.id}`, { headers });
  assert.equal(read.status, 200);
  assert.equal((await read.json() as { cwd: string }).cwd, chat.cwd);
  const list = await fetch(endpoint, { headers });
  assert.equal(list.status, 200);
  // 已创建但未发送的对话属于草稿：可按 ID 读取，但不进入对话列表。
  assert.ok(!(await list.json() as { conversations: Array<{ id: string }> }).conversations.some(row => row.id === chat.id));
  {
    const store = new DatabaseSync(path.join(base, 'private-app', 'agent-service', 'conversations.sqlite'));
    try {
      const row = store.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id) as { body: string };
      const record = JSON.parse(row.body);
      record.view.entries.push({ id: 'seed-entry', sequence: 1, kind: 'message', role: 'user', text: 'started work', createdAt: '2026-10-27T00:00:00Z' });
      seedConversation(store, record);
    } finally { store.close(); }
  }
  const list2 = await fetch(endpoint, { headers });
  assert.ok((await list2.json() as { conversations: Array<{ id: string }> }).conversations.some(row => row.id === chat.id));
  assert.equal((await fetch(`${endpoint}/${chat.id}`, { method: 'PATCH', headers, body: JSON.stringify({ expectedRevision: chat.revision, cwd: root }) })).status, 400);
  assert.equal((await fetch(`${endpoint}/${chat.id}`, { method: 'PATCH', headers, body: JSON.stringify({ expectedRevision: chat.revision, taskId: 'some-task' }) })).status, 400);
  assert.equal((await fetch(`${endpoint}/${chat.id}`, { method: 'PATCH', headers, body: JSON.stringify({ expectedRevision: chat.revision, taskIds: ['some-task'] }) })).status, 400);
});

test('changing the default workspace only affects new conversations and preserves existing files', async t => {
  const { base, root } = taskRecordFixture(t, 'default-workspace-preservation');
  const dataRoot = path.join(base, 'profile');
  const newRoot = path.join(base, 'default-workspace');
  fs.mkdirSync(newRoot);
  fs.writeFileSync(path.join(root, 'existing.txt'), 'original work');
  fs.writeFileSync(path.join(newRoot, 'existing.txt'), 'new workspace work');
  const original = createAgentService({ dataRoot, resolveWorkspace: () => ({ rootPath: root }), assertTask: () => {} });
  const oldChat = await original.conversations.create('@default', {});
  await original.close();
  const current = createAgentService({ dataRoot, resolveWorkspace: () => ({ rootPath: newRoot }), assertTask: () => {} });
  t.after(() => current.close());
  assert.equal(current.conversations.read('@default', oldChat.id).cwd, fs.realpathSync(root));
  const newChat = await current.conversations.create('@default', {});
  assert.equal(newChat.cwd, fs.realpathSync(newRoot));
  assert.equal(fs.readFileSync(path.join(root, 'existing.txt'), 'utf8'), 'original work');
  assert.equal(fs.readFileSync(path.join(newRoot, 'existing.txt'), 'utf8'), 'new workspace work');
});


test('live text and image input uses exact admission identity while stop remains independent', {timeout:15000},async t=>{
 const {base,root}=taskRecordFixture(t,'agent-live-http');let workspaceId='',emit:any,finish!:()=>void,admit!:()=>void,admissionStarted!:()=>void;
 const ending=new Promise<void>(resolve=>{finish=resolve;}),admission=new Promise<void>(resolve=>{admit=resolve;}),started=new Promise<void>(resolve=>{admissionStarted=resolve;});let supplements=0;
 const capabilities={supplement:true,text:true,images:true,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536};
 const service=createAgentService({dataRoot:path.join(base,'profile'),modelProviders:[],executors:[{descriptor:{id:'fixture',label:'Fixture',capabilities},async open(){return{
  bindingIdentity:'fixture-binding',capabilities,inspectAccount:async()=>({status:'ready' as const}),models:async()=>[{id:'fixture-model',label:'Fixture model',isDefault:true}],beginLogin:async()=>{},cancelLogin:async()=>{},createContext:async()=>({id:'context'}),resumeContext:async()=>{},readHistory:async()=>[],
  async send(input:any){emit=input.onEvent;emit({type:'accepted',executionRef:{id:'native-run'},inputItemId:input.clientRequestId});await ending;},
  async supplement(input:any){supplements++;admissionStarted();await admission;emit({type:'item',item:{id:input.clientRequestId,clientRequestId:input.clientRequestId,kind:'message',role:'user',text:input.text,executionId:'native-run'}});return{executionRef:input.executionRef,inputItemId:input.clientRequestId};},
  observe:async()=>({status:'running' as const,executionRef:{id:'native-run'},tools:[]}),reply:async()=>{},stop:async()=>{finish();return{status:'stopped' as const,tools:[]};},close:async()=>{finish();admit();},
 };}}],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
 await service.connections.connect('fixture',{expectedRevision:'unconfigured'});
 const runtime=createRuntime(),contributions=runtimeContributions(runtime,'http').filter((item:{id:string})=>item.id!=='agent-service.http');contributions.push(createAgentServiceHttpContribution(()=>service));
 const server=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions}),ready=await server.ready;workspaceId=ready.initialWorkspaceId;
 t.after(async()=>{admit();finish();await service.close();server.server.closeAllConnections();await new Promise<void>(resolve=>server.server.close(()=>resolve()));});
 const headers={origin:ready.url,'x-buildr-session':ready.sessionToken,'content-type':'application/json'},endpoint=`${ready.url}/api/v1/workspaces/${workspaceId}/agent-conversations`;
 let response=await fetch(endpoint,{method:'POST',headers,body:'{}'});const created=await response.json();
 const draft={expectedRevision:created.revision,connectionId:'fixture',text:'initial'},preview=service.conversations.prepareSend(workspaceId,created.id,draft);
 response=await fetch(endpoint+'/'+created.id+'/send',{method:'POST',headers,body:JSON.stringify({...draft,previewToken:preview.token,clientRequestId:'initial-client'})});assert.equal(response.status,202);
 for(let n=0;n<100&&!service.conversations.read(workspaceId,created.id).run?.accepted;n++)await new Promise(resolve=>setTimeout(resolve,2));
 const before=service.conversations.read(workspaceId,created.id),run=before.run!;
 emit({type:'item',item:{id:'live-note',kind:'message',role:'assistant',text:'concurrent text',executionId:'native-run'}});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
 response=await fetch(endpoint+'/'+created.id+'/attachments',{method:'POST',headers:{origin:ready.url,'x-buildr-session':ready.sessionToken,'content-type':'image/png','x-buildr-attachment-revision':before.attachmentRevision!},body:png});assert.equal(response.status,201);const image=await response.json();assert.ok(image.attachmentRevision);
 const input={runId:run.id,participantId:run.participantId,generation:run.generation,text:'',attachmentIds:[image.id],clientRequestId:'image-client'},supplementUrl=endpoint+'/'+created.id+'/supplement';
 assert.equal((await fetch(supplementUrl,{method:'POST',body:JSON.stringify(input)})).status,403);
 assert.equal((await fetch(supplementUrl,{method:'POST',headers,body:JSON.stringify({...input,untrusted:true})})).status,400);
 assert.equal((await fetch(supplementUrl,{method:'POST',headers,body:JSON.stringify({...input,runId:'other'})})).status,409);
 const pending=fetch(supplementUrl,{method:'POST',headers,body:JSON.stringify(input)});await started;
 const current=service.conversations.read(workspaceId,created.id);
 response=await fetch(endpoint+'/'+created.id+'/stop',{method:'POST',headers,body:JSON.stringify({expectedRevision:current.revision,runId:run.id,participantId:run.participantId,generation:run.generation})});assert.equal(response.status,200);assert.equal((await response.json()).run.status,'stopped');
 admit();response=await pending;assert.equal(response.status,202);const receipt=await response.json();assert.equal(receipt.delivery,'accepted');assert.equal(receipt.conversation.run.status,'stopped');assert.ok(receipt.conversation.entries.some((entry:any)=>entry.text==='concurrent text'));
 response=await fetch(supplementUrl,{method:'POST',headers,body:JSON.stringify(input)});assert.equal((await response.json()).delivery,'accepted');assert.equal(supplements,1);
});

test('draft image HTTP is authenticated and never creates a conversation or binds a workspace',async t=>{
  const {base,root}=taskRecordFixture(t,'draft-image-http');
  const previous=process.env.BUILDR_APP_DATA_DIR;process.env.BUILDR_APP_DATA_DIR=path.join(base,'private-app');
  t.after(()=>{if(previous===undefined)delete process.env.BUILDR_APP_DATA_DIR;else process.env.BUILDR_APP_DATA_DIR=previous;});
  const runtime=createRuntime(),service=createAgentService({dataRoot:path.join(base,'agent-profile'),executors:[],resolveWorkspace:()=>assert.fail('image staging must not resolve a workspace')});
  const contributions=runtimeContributions(runtime,'http').filter((item:{id:string})=>item.id!=='agent-service.http');contributions.push(createAgentServiceHttpContribution(()=>service));
  const server=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions}),{url,sessionToken}=await server.ready;
  t.after(async()=>{await service.close();server.server.closeAllConnections();await new Promise<void>(resolve=>server.server.close(()=>resolve()));});
  const draftId='9eab19bd-94b9-4cfa-93d0-1d277715737f',endpoint=url+'/api/v1/app/agent-service/conversations/drafts/'+draftId,readHeaders={'x-buildr-session':sessionToken};
  let response=await fetch(endpoint);assert.equal(response.status,403);
  response=await fetch(endpoint,{headers:readHeaders});assert.equal(response.status,200);const empty=await response.json();assert.deepEqual(empty.images,[]);
  const png=Buffer.from([137,80,78,71,13,10,26,10]),headers={...readHeaders,origin:url,'content-type':'image/png','x-buildr-draft-revision':empty.revision,'x-buildr-image-name':encodeURIComponent('截图.png')};
  response=await fetch(endpoint+'/attachments',{method:'POST',headers:{...headers,'x-buildr-session':'wrong'},body:png});assert.equal(response.status,403);
  response=await fetch(endpoint+'/attachments',{method:'POST',headers,body:png});assert.equal(response.status,201);const saved=await response.json();assert.equal(saved.images[0].name,'截图.png');
  assert.equal(fs.existsSync(path.join(base,'agent-profile/agent-service/conversations.sqlite')),false);
  response=await fetch(endpoint+'/attachments/'+saved.images[0].id,{headers:readHeaders});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
  response=await fetch(endpoint+'/attachments/'+saved.images[0].id,{method:'DELETE',headers:{...readHeaders,origin:url,'content-type':'application/json'},body:JSON.stringify({expectedRevision:empty.revision})});assert.equal(response.status,409);
  response=await fetch(endpoint+'/attachments/'+saved.images[0].id,{method:'DELETE',headers:{...readHeaders,origin:url,'content-type':'application/json'},body:JSON.stringify({expectedRevision:saved.revision})});assert.equal(response.status,200);assert.deepEqual((await response.json()).images,[]);
  response=await fetch(endpoint,{headers:readHeaders});const cleared=await response.json();
  response=await fetch(endpoint+'/attachments',{method:'POST',headers:{...headers,'x-buildr-draft-revision':cleared.revision,'x-buildr-frame':'true'},body:png});assert.equal(response.status,201);const frame=await response.json();assert.equal(frame.images[0].frame,true);
  const recording=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
  response=await fetch(endpoint+'/attachments',{method:'POST',headers:{...headers,'content-type':'video/mp4','x-buildr-image-name':'recording.mp4','x-buildr-draft-revision':frame.revision,'x-buildr-video':JSON.stringify({duration:2,frames:[{id:frame.images[0].id,time:0}]})},body:recording});assert.equal(response.status,201);const video=await response.json(),original=video.images.find((image:any)=>image.video);assert.ok(original);
  response=await fetch(endpoint+'/attachments/'+original.id,{headers:readHeaders});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'video/mp4');assert.deepEqual(Buffer.from(await response.arrayBuffer()),recording);
  response=await fetch(endpoint+'/attachments/'+original.id,{method:'DELETE',headers:{...readHeaders,origin:url,'content-type':'application/json'},body:JSON.stringify({expectedRevision:video.revision})});assert.equal(response.status,200);assert.deepEqual((await response.json()).images,[]);
  assert.equal(fs.existsSync(path.join(base,'agent-profile/agent-service/conversations.sqlite')),false);
});

test('child creation and discovery preserve provenance through authenticated HTTP without starting work',{timeout:30000},async t=>{
  const {base,root}=taskRecordFixture(t,'agent-child-http'),previous=process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR=path.join(base,'private-app');
  t.after(()=>{if(previous===undefined)delete process.env.BUILDR_APP_DATA_DIR;else process.env.BUILDR_APP_DATA_DIR=previous;});
  const runtime=createRuntime();let workspaceId:string;
  const service=createAgentService({dataRoot:path.join(base,'profile'),executors:[],resolveWorkspace:id=>{assert.equal(id,workspaceId);return {rootPath:root};},assertTask:()=>{}});
  const contributions=runtimeContributions(runtime,'http').filter((item:{id:string})=>item.id!=='agent-service.http');
  contributions.push(createAgentServiceHttpContribution(()=>service));
  const server=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions});
  const {url,initialWorkspaceId,sessionToken}=await server.ready;workspaceId=initialWorkspaceId;
  t.after(async()=>{await service.close();server.server.closeAllConnections();await new Promise<void>(resolve=>server.server.close(()=>resolve()));});
  const headers={origin:url,'x-buildr-session':sessionToken,'content-type':'application/json'},endpoint=`${url}/api/v1/workspaces/${workspaceId}/agent-conversations`;
  let response=await fetch(endpoint,{method:'POST',headers,body:'{}'});assert.equal(response.status,201);const parent=await response.json();
  const input={expectedRevision:parent.revision,clientRequestId:'one-child-request'},children=`${endpoint}/${parent.id}/children`;
  response=await fetch(children,{method:'POST',headers:{...headers,'x-buildr-session':'invalid'},body:JSON.stringify(input)});assert.equal(response.status,403);
  response=await fetch(children,{method:'POST',headers,body:JSON.stringify({...input,cwd:'/unrelated'})});assert.equal(response.status,400);
  response=await fetch(children,{method:'POST',headers,body:JSON.stringify(input)});assert.equal(response.status,201);const child=await response.json();
  assert.equal(child.childOf.conversationId,parent.id);assert.equal(child.childOf.sourceRevision,parent.revision);assert.deepEqual(child.entries,[]);assert.equal(child.run,undefined);
  response=await fetch(children,{method:'POST',headers,body:JSON.stringify(input)});assert.equal((await response.json()).id,child.id);
  response=await fetch(children+'?limit=1',{headers});assert.equal(response.status,200);assert.equal((await response.json()).conversations[0].childOf.conversationId,parent.id);
  response=await fetch(children+'?unknown=yes',{headers});assert.equal(response.status,400);
  response=await fetch(`${endpoint}/${child.id}`,{headers});assert.equal((await response.json()).childOf.conversationId,parent.id);
  response=await fetch(`${endpoint}/${parent.id}`,{headers});assert.equal((await response.json()).revision,parent.revision);
});

test('tool detail reads preserve full history, enforce content revisions and remain scoped/authenticated',async t=>{
  const {base,root}=taskRecordFixture(t,'agent-entry-detail');
  const runtime=createRuntime();const profile=path.join(base,'agent-profile');
  const service=createAgentService({dataRoot:profile,executors:[],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
  const contributions=runtimeContributions(runtime,'http').filter((item:{id:string})=>item.id!=='agent-service.http');contributions.push(createAgentServiceHttpContribution(()=>service));
  const server=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions});const {url,sessionToken}=await server.ready;
  t.after(async()=>{await service.close();server.server.closeAllConnections();await new Promise<void>(resolve=>server.server.close(()=>resolve()));});
  const workspaceId=(await server.ready).initialWorkspaceId;
  const created=await service.conversations.create(workspaceId,{});
  const filename=path.join(profile,'agent-service/conversations.sqlite'),db=new DatabaseSync(filename);t.after(()=>db.close());
  const raw=JSON.parse((db.prepare('SELECT body FROM conversations WHERE id=?').get(created.id) as {body:string}).body);
  const full={id:'tool/http-id',sequence:1,kind:'tool',role:'system',name:'command',text:'complete output\n'+'x'.repeat(50000),input:JSON.stringify({cmd:'read result'}),createdAt:created.updatedAt};raw.view.entries=[full];raw.view.revision='seed-large';
  seedConversation(db, raw);
  const headers={'x-buildr-session':sessionToken};const endpoint=`${url}/api/v1/workspaces/${workspaceId}/agent-conversations/${created.id}`;
  let response=await fetch(endpoint,{headers});assert.equal(response.status,200);const page=await response.json();assert.ok(page.entries[0].detail);assert.ok(page.entries[0].text.length<full.text.length);
  const detail=endpoint+'/entry-detail/'+encodeURIComponent(full.id)+'?revision='+page.entries[0].detail.revision;
  response=await fetch(detail);assert.equal(response.status,403);
  response=await fetch(detail,{headers});assert.equal(response.status,200);assert.deepEqual(await response.json(),full);
  response=await fetch(detail.replace(page.entries[0].detail.revision,'0'.repeat(64)),{headers});assert.equal(response.status,409);
  response=await fetch(detail.replace('/workspaces/'+workspaceId,'/workspaces/00000000-0000-0000-0000-000000000001'),{headers});assert.equal(response.status,400);
  assert.deepEqual(JSON.parse((db.prepare('SELECT body FROM conversations WHERE id=?').get(created.id) as {body:string}).body).view.entries,[]);
  assert.equal(db.prepare('SELECT count(*) AS n FROM conversation_entry_contents WHERE conversation_id=?').get(created.id)!.n,1);
});


test('agent HTTP keeps public service failures while unknown failures get safe correlated diagnostics',async()=>{
 const context={request:{method:'GET'},pathname:'/api/v1/app/agent-service/connections',searchParams:new URLSearchParams(),authorizeRead(){},authorizeWrite(){}};
 const known=createAgentServiceHttpContribution(()=>{throw new AgentServiceError('agent_process_switching','执行后台正在切换，请稍后重试。',503);});
 assert.deepEqual(await known.handleTopLevel(context),{status:503,body:{error:{code:'agent_process_switching',message:'执行后台正在切换，请稍后重试。'}}});
 const secret='private-native-token';
 const unknown=createAgentServiceHttpContribution(()=>{throw Object.assign(new Error(secret),{code:'SQLITE_BUSY'});});
 await assert.rejects(unknown.handleTopLevel(context),{message:secret});
 let body='',status:number|undefined;const logs:string[]=[];const original=console.error;console.error=value=>logs.push(value);
 try { apiError({writeHead(value:number){status=value;},end(value:string){body=value;}},Object.assign(new Error(secret),{code:'SQLITE_BUSY',details:{token:secret}}),{method:'GET',url:'/api/v1/app/agent-service/connections?token='+secret}); }
 finally {console.error=original;}
 assert.equal(status,500);const result=JSON.parse(body);assert.match(result.error.details.requestId,/^[a-f0-9-]{36}$/);
 assert.equal(JSON.parse(logs[0]).requestId,result.error.details.requestId);assert.equal(JSON.parse(logs[0]).code,'SQLITE_BUSY');
 assert.equal(JSON.parse(logs[0]).pathname,'/api/v1/app/agent-service/connections');assert.doesNotMatch(body+logs.join(''),new RegExp(secret));
});

test('契约违约在运行单元不一致时降级为版本对齐，同版本仍按违约暴露',async()=>{
 const service:any={connections:{list:async()=>({connections:[{id:'codex'}]})}};
 const context={request:{method:'GET'},pathname:'/api/v1/app/agent-service/connections',searchParams:new URLSearchParams(),authorizeRead(){},authorizeWrite(){}};
 const mismatch=createAgentServiceHttpContribution(()=>service,{runtimeAligning:async()=>true});
 assert.deepEqual(await mismatch.handleTopLevel(context),{status:503,body:{error:{code:'agent_service_aligning',message:'执行后台正在切换版本，连接状态暂不可用。'}}});
 const aligned=createAgentServiceHttpContribution(()=>service,{runtimeAligning:async()=>false});
 assert.deepEqual(await aligned.handleTopLevel(context),{status:500,body:{error:{code:'agent_http_response_invalid',message:'智能体服务返回结果不符合契约。'}}});
 const unavailable=createAgentServiceHttpContribution(()=>service,{runtimeAligning:async()=>{throw new Error('status unavailable');}});
 assert.equal((await unavailable.handleTopLevel(context)).status,500);
 const plain=createAgentServiceHttpContribution(()=>service);
 assert.equal((await plain.handleTopLevel(context)).status,500);
});

test('historical native file presentations reach authenticated HTTP without replaying work',async t=>{
 const {base,root}=taskRecordFixture(t,'agent-presented-file-http');
 const previous=process.env.BUILDR_APP_DATA_DIR;process.env.BUILDR_APP_DATA_DIR=path.join(base,'private-app');
 t.after(()=>{if(previous===undefined)delete process.env.BUILDR_APP_DATA_DIR;else process.env.BUILDR_APP_DATA_DIR=previous;});
 const runtime=createRuntime(),dataRoot=path.join(base,'agent-profile');
 const service=createAgentService({dataRoot,executors:[],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
 const contributions=runtimeContributions(runtime,'http').filter((item:{id:string})=>item.id!=='agent-service.http');contributions.push(createAgentServiceHttpContribution(()=>service));
 const server=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions});
 const {url,initialWorkspaceId:workspaceId,sessionToken}=await server.ready;
 t.after(async()=>{await service.close();server.server.closeAllConnections();await new Promise<void>(resolve=>server.server.close(()=>resolve()));});
 const chat=await service.conversations.create(workspaceId,{title:'已交付文件'});
 const filename=path.join(root,'.buildr/local/record.md');fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,'# 发布记录\n正文仍在。\n');
 const db=new DatabaseSync(path.join(dataRoot,'agent-service/conversations.sqlite'));
 const stored=JSON.parse((db.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id) as {body:string}).body);
 stored.view.revision='presented-v2';stored.view.entries=[{id:'presented-tool',sequence:1,createdAt:'now',kind:'tool',role:'system',provider:'dsh',participantId:'p',runId:'run',name:'present',input:JSON.stringify({files:[{path:filename,description:'发布记录'}]}),text:'Presented '+filename,status:'completed'}];
 seedConversation(db, stored);const body=(db.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id) as {body:string}).body;
 const endpoint=`${url}/api/v1/workspaces/${workspaceId}/agent-conversations/${chat.id}`;
 let response=await fetch(endpoint);assert.equal(response.status,403);
 response=await fetch(endpoint,{headers:{origin:url,'x-buildr-session':sessionToken}});assert.equal(response.status,200);
 assert.deepEqual((await response.json()).entries[0].presentedFiles,[{path:filename,description:'发布记录'}]);
 assert.equal((db.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id) as {body:string}).body,body);db.close();
});

test('conversation stream negotiation preserves legacy snapshots and validates compact deltas',async()=>{
 const id='00000000-0000-4000-8000-000000000001',workspaceId='workspace';
 const initial:any={id,workspaceId,cwd:'/workspace',title:'work',revision:'r1',hidden:false,updatedAt:'now',participants:[],requests:[],entries:Array.from({length:20},(_,i)=>({id:'entry-'+i,sequence:i+1,kind:'message',role:'assistant',text:'history '.repeat(1000),createdAt:'now'}))};
 const next={...initial,revision:'r2',title:'updated'};
 const service:any={conversations:{subscribe:async()=>({close(){},events:(async function*(){yield{cursor:0,generation:'g',type:'snapshot',workspaceId,conversationId:id,revision:'r1',payload:{conversation:initial}};yield{cursor:1,generation:'g',type:'conversation',workspaceId,conversationId:id,revision:'r2',payload:{conversation:next}};})()})}};
 const contribution=createAgentServiceHttpContribution(()=>service);let lastResponse:any;
 const observe=async(headers:Record<string,string>)=>{
  const output:any[]=[];
  lastResponse=await contribution.handle({request:{method:'GET',headers},workspaceId,suffix:'/agent-conversations/'+id+'/events',searchParams:new URLSearchParams(),authorizeRead(){},respond:{async stream(subscription:any,map:any){for await(const event of subscription.events)output.push(map(event));return true;}}});
  return output;
 };
 const legacy=await observe({});assert.deepEqual(legacy.map(event=>event.payload.conversation),[initial,next]);
 const compact=await observe({'x-buildr-conversation-transfer':'delta-v1'});
 assert.deepEqual(compact[0],legacy[0]);assert.equal(compact[1].payload.conversation,undefined);assert.equal(compact[1].payload.delta.baseCursor,0);assert.equal(compact[1].payload.delta.conversation.revision,'r2');assert.deepEqual(compact[1].payload.delta.entries,[]);
 assert.ok(JSON.stringify(compact[1]).length<JSON.stringify(legacy[1]).length/20);
 await observe({'x-buildr-conversation-transfer':'unsupported'});assert.equal(lastResponse.status,400);assert.equal(lastResponse.body.error.code,'agent_http_input_invalid');
});

test('联合活动摘要裁剪上下文并以内容版本返回未变化标记，旧接口兼容',async t=>{
  const {base,root}=taskRecordFixture(t,'activity-summary-http'),runtime=createRuntime();
  const previous=process.env.BUILDR_APP_DATA_DIR;process.env.BUILDR_APP_DATA_DIR=path.join(base,'app-data');t.after(()=>{if(previous===undefined)delete process.env.BUILDR_APP_DATA_DIR;else process.env.BUILDR_APP_DATA_DIR=previous;});
  const row:any={id:'11111111-1111-4111-8111-111111111111',workspaceId:'22222222-2222-4222-8222-222222222222',cwd:root,title:'工作',revision:'r1',hidden:false,updatedAt:'now',participants:[{id:'p',provider:'codex',connectionId:'codex',label:'Codex',deliveredThrough:0,contextId:'private-context'}],entries:[],requests:[],activity:{version:1,seenThrough:0,active:true,updatedAt:'now',pendingDecisionCount:0},run:{id:'r',participantId:'p',provider:'codex',generation:'g',status:'running',accepted:true,tools:[],startedAt:'now',updatedAt:'now'},retainedRuns:[]};
  const page={conversations:[row],total:1},pending={conversations:[{conversationId:row.id,workspaceId:row.workspaceId,title:row.title,status:'running',count:0}]};
  const contribution=createAgentServiceHttpContribution(()=>({conversations:{listAll:()=>page,pendingSummary:()=>pending}} as any));
  const contributions=runtimeContributions(runtime,'http').filter((item:any)=>item.id!=='agent-service.http');contributions.push(contribution);
  const instance=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions});const {url,sessionToken}=await instance.ready;
  t.after(()=>new Promise<void>(resolve=>instance.server.close(()=>resolve())));
  const headers={'x-buildr-session':sessionToken},endpoint=url+'/api/v1/app/agent-service/activity-summary';
  assert.equal((await fetch(endpoint)).status,403);
  const response=await fetch(endpoint,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const first:any=await response.json();assert.deepEqual(first.conversations[0].participants,[]);assert.equal(first.conversations[0].retainedRuns,undefined);assert.equal(first.conversations[0].run.status,'running');assert.deepEqual(first.pending,pending.conversations);
  const unchanged:any=await (await fetch(endpoint+'?revision='+first.revision,{headers})).json();assert.deepEqual(unchanged,{revision:first.revision,unchanged:true});assert.ok(JSON.stringify(unchanged).length<120);
  row.title='更新标题';row.revision='r2';const changed:any=await (await fetch(endpoint+'?revision='+first.revision,{headers})).json();assert.notEqual(changed.revision,first.revision);assert.equal(changed.conversations[0].title,'更新标题');
  const legacy:any=await (await fetch(url+'/api/v1/app/agent-service/conversations?activeOnly=true&limit=100',{headers})).json();assert.equal(legacy.conversations[0].participants[0].contextId,'private-context');
  assert.equal((await fetch(endpoint+'?revision=invalid',{headers})).status,400);
});

/** Explicit v5 raw fixture; production writing and migration are tested by the service. */
function seedConversation(db: DatabaseSync, record: any): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const entry of record.view.entries) {
      const body=JSON.stringify(entry),revision=createHash('sha256').update(body).digest('hex');
      const compact=entry.kind==='tool'&&body.length>16384?JSON.stringify({...entry,text:entry.text.slice(0,512),detail:{revision}}):null;
      db.prepare('INSERT OR REPLACE INTO conversation_entry_contents VALUES(?,?,?,?,?)').run(record.view.id,revision,'raw',Buffer.byteLength(body),body);
      db.prepare('INSERT OR REPLACE INTO conversation_read_entries VALUES(?,?,?,?,?,?,?,?,?,?)').run(record.view.id,'main',entry.sequence,entry.id,'legacy:fixture',revision,compact,Buffer.byteLength(body),Buffer.byteLength(compact??body),Number(entry.kind==='message'&&!entry.thinking));
    }
    const count=record.view.entries.length;
    const header=JSON.stringify({...record,_bodyFormat:5,view:{...record.view,entries:[]}});
    db.prepare('UPDATE conversations SET body=?,revision=?,entry_count=? WHERE id=?').run(header,record.view.revision,count,record.view.id);
    db.exec('COMMIT');
  } catch(error) { db.exec('ROLLBACK');throw error; }
}
test('participation HTTP is authenticated, workspace-bound and rejects scope replacement',async t=>{
 const {base,root}=taskRecordFixture(t,'participation-http'),runtime=createRuntime();
 const previous=process.env.BUILDR_APP_DATA_DIR;process.env.BUILDR_APP_DATA_DIR=path.join(base,'private');t.after(()=>{if(previous===undefined)delete process.env.BUILDR_APP_DATA_DIR;else process.env.BUILDR_APP_DATA_DIR=previous;});
 const id='11111111-1111-4111-8111-111111111111',calls:any[]=[];
 const service:any={conversations:{
  participation:(workspaceId:string,conversationId:string,input:any)=>{calls.push([workspaceId,conversationId,input]);return {schemaVersion:'buildr.agent-participation/v1',contextConfiguration:'unknown',workspaceId,conversationId,runId:input.runId,revision:'r',coverage:'not-collected',gaps:['historical-not-collected'],items:[]};},
  participationSummary:(workspaceId:string,input:any)=>{calls.push([workspaceId,input]);return {schemaVersion:'buildr.agent-participation-summary/v1',workspaceId,revision:'r',range:{from:'2026-11-01T00:00:00Z',to:'2026-11-02T00:00:00Z'},coverage:'not-collected',runs:0,collectedRuns:0,gaps:[],rows:[]};},
 }};
 const contributions=runtimeContributions(runtime,'http').filter((item:any)=>item.id!=='agent-service.http');contributions.push(createAgentServiceHttpContribution(()=>service));
 const instance=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions});const {url,sessionToken,initialWorkspaceId}=await instance.ready;
 t.after(async()=>{instance.server.closeAllConnections();await new Promise<void>(resolve=>instance.server.close(()=>resolve()));});
 const headers={'x-buildr-session':sessionToken},endpoint=`${url}/api/v1/workspaces/${initialWorkspaceId}/agent-conversations/${id}/participation?runId=run`;
 assert.equal((await fetch(endpoint)).status,403);assert.equal(calls.length,0);
 let response=await fetch(endpoint,{headers});assert.equal(response.status,200);assert.equal((await response.json()).coverage,'not-collected');assert.deepEqual(calls[0],[initialWorkspaceId,id,{runId:'run'}]);
 assert.equal((await fetch(endpoint+'&workspaceId=other',{headers})).status,400);
 response=await fetch(`${url}/api/v1/app/agent-service/conversations/participation-summary?limit=50`,{headers});assert.equal(response.status,200);assert.equal((await response.json()).workspaceId,'@default');assert.deepEqual(calls[1],['@default',{limit:50}]);
 assert.equal((await fetch(`${url}/api/v1/workspaces/missing/agent-conversations/participation-summary`,{headers})).status,404);
 assert.equal((await fetch(`${url}/api/v1/app/agent-service/conversations/participation-summary?limit=201`,{headers})).status,400);
});

test('CLI target proof accepts only current authorized physical entry, not PATH names or same-content copies',async t=>{
 const {observeParticipationCli}=await import('../../src/modules/agent-service/application/participation-cli-source.ts');
 const {base}=taskRecordFixture(t,'participation-cli-source'),sourceRoot=path.join(base,'product/services/buildr'),entry=path.join(base,'product/buildr'),copy=path.join(base,'copy/buildr');
 fs.mkdirSync(sourceRoot,{recursive:true});fs.mkdirSync(path.dirname(copy),{recursive:true});fs.writeFileSync(entry,'#!/bin/sh\necho buildr\n');fs.copyFileSync(entry,copy);
 const identity={package:'@buildr-ai/buildr',channel:'development',sourceRoot};
 assert.equal(observeParticipationCli(identity,'buildr'),undefined);assert.equal(observeParticipationCli(identity,copy),undefined);
 const observed=observeParticipationCli(identity,entry)!;assert.equal(observed.status,'confirmed');assert.equal(observed.observedVersion,undefined);assert.match(observed.offeredVersion!,/^sha256-/);
 assert.equal(observeParticipationCli({...identity,package:'untrusted'},entry),undefined);
});

test('webhook replay HTTP validates authentication, conversation scope and immutable event ID',async t=>{
 const {base,root}=taskRecordFixture(t,'webhook-replay-http'),runtime=createRuntime();
 const previous=process.env.BUILDR_APP_DATA_DIR;process.env.BUILDR_APP_DATA_DIR=path.join(base,'private');t.after(()=>{if(previous===undefined)delete process.env.BUILDR_APP_DATA_DIR;else process.env.BUILDR_APP_DATA_DIR=previous;});
 const id='11111111-1111-4111-8111-111111111111',eventId='a'.repeat(64),calls:any[]=[];
 const service:any={conversations:{replayWebhook:(scope:string,conversationId:string,input:any)=>{calls.push([scope,conversationId,input]);return{eventId:input.eventId,queued:true};}}};
 const contributions=runtimeContributions(runtime,'http').filter((item:any)=>item.id!=='agent-service.http');contributions.push(createAgentServiceHttpContribution(()=>service));
 const instance=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions});const {url,sessionToken,initialWorkspaceId}=await instance.ready;
 t.after(async()=>{instance.server.closeAllConnections();await new Promise<void>(resolve=>instance.server.close(()=>resolve()));});
 const headers={origin:url,'x-buildr-session':sessionToken,'content-type':'application/json'},endpoint=`${url}/api/v1/workspaces/${initialWorkspaceId}/agent-conversations/${id}/webhook-replay`;
 assert.equal((await fetch(endpoint,{method:'POST',body:JSON.stringify({eventId})})).status,403);assert.equal(calls.length,0);
 for(const body of [{eventId:'bad'},{eventId,workspaceId:'other'},{eventId,payload:{text:'arbitrary'}}])assert.equal((await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body)})).status,400);
 const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({eventId})});assert.equal(response.status,200);assert.deepEqual(await response.json(),{eventId,queued:true});assert.deepEqual(calls,[[initialWorkspaceId,id,{eventId}]]);
});

test('webhook settings require authentication, protect secret reads and reject stale saves', {timeout:30_000}, async t=>{
  const {base,root}=taskRecordFixture(t,'webhook-settings-http');
  const runtime=createRuntime();
  const service=createAgentService({dataRoot:path.join(base,'agent-profile'),environment:{HOME:base},executors:[],modelProviders:[],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
  const contribution=createAgentServiceHttpContribution(()=>service);
  const contributions=runtimeContributions(runtime,'http').filter((item:{id:string})=>item.id!=='agent-service.http');contributions.push(contribution);
  const server=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions});
  const {url,sessionToken}=await server.ready;
  t.after(async()=>{await service.close();server.server.closeAllConnections();await new Promise<void>(resolve=>server.server.close(()=>resolve()));});
  const endpoint=url+'/api/v1/app/agent-service/webhook-settings';
  const headers={origin:url,'x-buildr-session':sessionToken,'content-type':'application/json'};
  assert.equal((await fetch(endpoint)).status,403);
  let response=await fetch(endpoint,{headers});assert.equal(response.status,200);
  const initial=await response.json();assert.equal(initial.state,'unconfigured');assert.equal('secret' in initial,false);
  response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({expectedRevision:initial.revision,url:'https://receiver.invalid/hook',secret:'http-secret-test',enabled:true,unexpected:true})});assert.equal(response.status,400);
  response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({expectedRevision:initial.revision,url:'https://receiver.invalid/hook',secret:'http-secret-test',enabled:true})});assert.equal(response.status,200);
  const saved=await response.json();assert.equal(saved.state,'enabled');assert.equal(JSON.stringify(saved).includes('http-secret-test'),false);
  assert.equal((await fetch(endpoint+'/reveal',{method:'POST',headers:{...headers,origin:'https://foreign.invalid'},body:JSON.stringify({expectedRevision:saved.revision})})).status,403);
  assert.equal((await fetch(endpoint+'/reveal',{headers})).status,404);
  response=await fetch(endpoint+'/reveal',{method:'POST',headers,body:JSON.stringify({expectedRevision:saved.revision})});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),{secret:'http-secret-test'});
  response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({expectedRevision:initial.revision,url:saved.url,enabled:false})});assert.equal(response.status,409);
  response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({expectedRevision:saved.revision,url:saved.url,enabled:false})});assert.equal(response.status,200);const disabled=await response.json();assert.equal(disabled.state,'disabled');
  response=await fetch(endpoint+'/test',{method:'POST',headers,body:JSON.stringify({expectedRevision:disabled.revision})});assert.equal(response.status,409);
});
