import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { createServer } from 'node:http';
import { createAgentService } from '@buildr-ai/buildr-agent';
import { createRuntime, runtimeContributions } from '../helpers/runtime-harness.ts';
import { taskRecordFixture } from '../helpers/task-record-system-fixture.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { createAgentServiceHttpContribution } from '../../src/modules/agent-service/interfaces/http/agent-service-http.ts';
import { AGENT_SERVICE_HTTP_OPERATIONS } from '../../src/modules/agent-service/interfaces/http/agent-service-http-contracts.ts';
import { inspectHttpOperationCoverage } from '../../src/web/http/http-operation-coverage.ts';
import { eventStreamResponse } from '../../src/web/http/responses.ts';

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
  contributions.push(createAgentServiceHttpContribution(() => service));
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
  const permissionDraft = { expectedRevision: created.revision, connectionId: 'not-registered', text: 'Keep this unsent.' };
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
  response = await fetch(`${conversations}/${created.id}/prepare-send`, { method: 'POST', headers, body: JSON.stringify({ expectedRevision: attachment.revision, connectionId: 'not-registered', text: 'x'.repeat(129 * 1024) }) }); assert.equal(response.status, 413);
  response = await fetch(`${conversations}?hidden=true&query=updated`, { headers: readHeaders }); assert.equal(response.status, 200); assert.equal((await response.json()).conversations.length, 1);
  const coverage = inspectHttpOperationCoverage([AGENT_SERVICE_HTTP_OPERATIONS], []);
  assert.equal(coverage.status, 'aligned', JSON.stringify(coverage));
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
