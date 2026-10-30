import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir}from'node:os';import{join}from'node:path';import{createCipheriv}from'node:crypto';
import{createModelAccess}from'../../src/model-access/application.ts';
import{createAgentService}from'../../src/index.ts';
import{createQoderModelProvider,readQoderIdentity,requestQoderModel,unwrapQoderStream}from'../../src/model-access/providers/qoder.ts';
import type{AgentExecutor}from'../../src/contracts.ts';
const offering={id:'model',label:'Model',images:false,tools:true};
const signal=()=>AbortSignal.timeout(3000);
function sse(frames:unknown[],done=true){return new Response(frames.map(frame=>'data: '+(typeof frame==='string'?frame:JSON.stringify(frame))+'\n\n').join('')+(done?'data: [DONE]\n\n':''));}
test('linked sources are discovered once without adding accounts, native login, or extra credential files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-linked-'));let account='a',requests=0;
 const executors=['codex','dsh','qoder'].map(id=>({descriptor:{id,label:id,capabilities:{text:true,images:false,stop:true,resume:true,approval:false,questions:false,maxInputBytes:1000}},async open(){return{bindingIdentity:id,capabilities:this.descriptor.capabilities,inspectAccount:async()=>({status:'ready' as const}),models:async()=>[{id:'model',label:'Model'}],modelIdentity:async()=>id+':'+account,requestModel:async(path:string)=>{requests++;return Response.json(path.includes('models?')?{models:[{slug:'model'}]}:path==='/models'?id==='dsh'?{data:[{id:'model',api_capabilities:{anthropic_messages:{}}}]}:{chat:[{key:'model',enable:true}]}:{});},beginLogin:async()=>{throw Error('duplicate_login');},cancelLogin:async()=>{},createContext:async()=>({id:'context'}),resumeContext:async()=>{},readHistory:async()=>[],send:async()=>{},observe:async()=>({status:'idle' as const,tools:[]}),reply:async()=>{},stop:async()=>({status:'stopped' as const,tools:[]}),close:async()=>{}};}})) satisfies AgentExecutor[];
 const service=createAgentService({dataRoot:root,executors,resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
 try{
  for(const id of ['codex','dsh','qoder'])await service.connections.connect(id,{expectedRevision:'unconfigured'});
  const catalog=await service.models.catalog.list({refresh:true});assert.equal(catalog.models.length,3);assert.ok(catalog.models.every(m=>m.enabled===false&&!m.available));
  const first=(await service.models.accounts.list()).accounts;assert.deepEqual(first.map(a=>a.connectionId),['codex','dsh','qoder']);assert.equal(requests,5);
  await service.models.catalog.list();assert.equal(requests,5);
  const qoder=service.connections.read('qoder');await service.connections.disconnect('qoder',{expectedRevision:qoder.revision});
  const disabled=await service.models.catalog.list();assert.equal(disabled.models.some(m=>m.accountId==='native-qoder'&&m.available),false);assert.equal(disabled.diagnostic,undefined,'intentional disconnect is not a background failure');
  const previous=first.find(a=>a.connectionId==='codex')!.identity;account='b';await service.connections.check('codex',{expectedRevision:service.connections.read('codex').revision});await service.models.catalog.list({refresh:true});assert.notEqual((await service.models.accounts.list()).accounts.find(a=>a.connectionId==='codex')!.identity,previous);
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
});
test('native identity changes and disconnect invalidate scoped leases while old independent accounts survive',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-identity-'));let identity='a';
 const provider={id:'native-codex',label:'Codex',connectionId:'codex',async open(){return{protocol:'chat-completions' as const,inspect:async()=>({status:'ready' as const,identity,models:[offering]}),beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>Response.json({}),close:async()=>{}};}};
 const app=createModelAccess({root,providers:[provider]});try{
  await app.ensureLinked();await app.ensureLinked();assert.equal(app.accounts.list().accounts.length,1);await assert.rejects(app.accounts.add({provider:provider.id}));await app.accounts.check(provider.id);await assert.rejects(app.accounts.login(provider.id,{expectedRevision:app.accounts.read(provider.id).revision}),/原生登录/);
  await app.accounts.preferences(provider.id,{expectedRevision:app.accounts.read(provider.id).revision,models:[{id:'model',enabled:true}]});
  const lease=await app.leases.create({accountId:provider.id,agentId:'dsh',conversationId:'a',runId:'a',modelId:'model'});identity='b';await app.accounts.check(provider.id);
  assert.equal((await fetch(lease.baseUrl+'/models',{headers:{authorization:'Bearer '+lease.apiKey}})).status,401);
  const next=await app.leases.create({accountId:provider.id,agentId:'dsh',conversationId:'a',runId:'b',modelId:'model'});app.invalidate(provider.id);assert.equal((await fetch(next.baseUrl+'/models',{headers:{authorization:'Bearer '+next.apiKey}})).status,401);
 }finally{await app.close();await rm(root,{recursive:true,force:true});}
});
test('Qoder native private credentials are read only and fixed target signatures do not expose raw tokens',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-qoder-auth-'));await mkdir(join(root,'.auth'));const machine='1234567890123456-machine';const key=Buffer.from(machine.slice(0,16)),cipher=createCipheriv('aes-128-cbc',key,key);const user=Buffer.concat([cipher.update(JSON.stringify({uid:'user',security_oauth_token:'private-access',name:'Name'})),cipher.final()]).toString('base64');
 await writeFile(join(root,'.auth','user'),user);await writeFile(join(root,'.auth','machine_id'),machine);
 try{assert.equal((await readQoderIdentity(root)).userID,'user');let observed=false;await requestQoderModel(root,'/chat',{body:'{"messages":[]}'},async(url,init)=>{observed=true;assert.ok(String(url).startsWith('https://api3.qoder.sh/'));const headers=new Headers(init?.headers);assert.ok(headers.get('authorization')?.startsWith('Bearer COSY.'));assert.equal(JSON.stringify(init).includes('private-access'),false);return Response.json({});});assert.ok(observed);await assert.rejects(requestQoderModel(root,'/chat',{body:'{}'},async()=>{throw Error('must_not_send');},'foreign-account'),/identity_conflict/);assert.equal(await readFile(join(root,'.auth','user'),'utf8'),user);await assert.rejects(requestQoderModel(root,'https://foreign.invalid'));await rm(join(root,'.auth','user'));await symlink(join(root,'.auth','machine_id'),join(root,'.auth','user'));await assert.rejects(readQoderIdentity(root),/unsafe/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a pending catalog cannot restore a source after its native login was invalidated',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-pending-source-'));let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let started!:()=>void;const observing=new Promise<void>(resolve=>{started=resolve;});
 const app=createModelAccess({root,providers:[{id:'native-qoder',connectionId:'qoder',label:'Qoder',async open(){return{protocol:'chat-completions',async inspect(){started();await gate;return{status:'ready',identity:'old',models:[offering]};},beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>Response.json({}),close:async()=>{}};}}]});
 try{await app.ensureLinked();const checking=app.accounts.check('native-qoder');await observing;app.invalidate('native-qoder');release();await checking;assert.equal(app.accounts.read('native-qoder').status,'not-authenticated');assert.equal(app.catalog.list().models.length,0);}finally{await app.close();await rm(root,{recursive:true,force:true});}
});

test('Qoder discovers supported context windows separately from the default',async()=>{
 const runtime=await createQoderModelProvider({inspect:async()=>({status:'ready'}),identity:async()=>'user',request:async()=>Response.json({chat:[{key:'model',enable:true,max_input_tokens:180000,context_config:{small:{token_count:200000,is_default:true},medium:{token_count:400000},large:{token_count:1000000}}}]})}).open({accountId:'native-qoder',configRoot:'unused',environment:{}});
 const observation=await runtime.inspect();assert.equal(observation.models[0].contextWindow,200000);assert.equal(observation.models[0].reportedContextWindow,1000000);await runtime.close();
});

test('account refreshes coalesce, but login invalidation starts a new observation and removes old team quota', async () => {
 const root=await mkdtemp(join(tmpdir(),'buildr-login-refresh-'));
 let calls=0,account='team',hold=false,release=()=>{};
 let gate=Promise.resolve();
 const app=createModelAccess({root,providers:[{id:'native-qoder',connectionId:'qoder',label:'Qoder',async open(){return{
  protocol:'chat-completions',async inspect(){calls++;const identity=account;const waiting=gate;if(hold)await waiting;return{status:'ready',identity,models:[offering],quota:identity==='team'?{available:true,observedAt:new Date().toISOString(),planLabel:'Teams',remainingPercent:0}:{available:false,observedAt:new Date().toISOString()}};},
  beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>Response.json({}),close:async()=>{},
 };}}]});
 try{
  await app.ensureLinked();await app.accounts.check('native-qoder');
  assert.equal(app.accounts.read('native-qoder').quota?.planLabel,'Teams');
  hold=true;gate=new Promise<void>(resolve=>{release=resolve;});
  const first=app.accounts.check('native-qoder'),duplicate=app.accounts.check('native-qoder');
  await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(calls,2,'two simultaneous observers use one upstream check');
  app.invalidate('native-qoder');
  assert.equal(app.accounts.read('native-qoder').quota,undefined);
  account='personal';hold=false;
  const personal=await app.accounts.check('native-qoder');
  assert.equal(calls,3,'the new login does not wait for the older observation');
  assert.equal(personal.status,'ready');assert.equal(personal.quota?.available,false);
  assert.equal(personal.quota?.planLabel,undefined);
  release();await Promise.all([first,duplicate]);
  assert.equal(app.accounts.read('native-qoder').identity,personal.identity);
  assert.equal(app.accounts.read('native-qoder').quota?.available,false);
 }finally{release();await app.close();await rm(root,{recursive:true,force:true});}
});

test('native login completion refreshes its own source while unrelated discovery is still waiting', async () => {
 const root=await mkdtemp(join(tmpdir(),'buildr-login-source-'));
 let identity='team',hold=false,release=()=>{},started=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const capabilities={text:true,images:false,stop:true,resume:true,approval:false,questions:false,maxInputBytes:1000};
 const executor:AgentExecutor={descriptor:{id:'qoder',label:'Qoder',capabilities},async open(){return{
  bindingIdentity:'qoder',capabilities,inspectAccount:async()=>({status:'ready'}),models:async()=>[offering],
  async beginLogin(update){identity='personal';update({state:'completed'});},cancelLogin:async()=>{},
  createContext:async()=>({id:'context'}),resumeContext:async()=>{},readHistory:async()=>[],send:async()=>{},observe:async()=>({status:'idle',tools:[]}),reply:async()=>{},stop:async()=>({status:'stopped',tools:[]}),close:async()=>{},
 };}};
 const providers=['native-qoder','slow'].map(id=>({id,label:id,...(id==='native-qoder'?{connectionId:'qoder'}:{}),async open(){return{
  protocol:'chat-completions' as const,async inspect(){if(id==='slow'&&hold){started();await gate;}return{status:'ready' as const,identity:id==='native-qoder'?identity:id,models:[offering]};},
  beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>Response.json({}),close:async()=>{},
 };}}));
 const service=createAgentService({dataRoot:root,executors:[executor],modelProviders:providers,resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
 try{
  await service.connections.connect('qoder',{expectedRevision:'unconfigured'});
  await service.models.catalog.list({refresh:true});
  const initial=service.models.accounts.read('native-qoder');
  const slow=await service.models.accounts.add({provider:'slow'});await service.models.accounts.check(slow.id);
  hold=true;const waiting=new Promise<void>(resolve=>{started=resolve;});service.models.startRefreshing();await waiting;
  service.connections.login('qoder',{expectedRevision:service.connections.read('qoder').revision});
  let updated=false;
  for(let i=0;i<200;i++){const account=service.models.accounts.read('native-qoder');if(account.status==='ready'&&account.identity!==initial.identity){updated=true;break;}await new Promise(resolve=>setTimeout(resolve,1));}
  assert.equal(updated,true,'new login must become visible without releasing the slow unrelated source');
 }finally{release();await service.close();await rm(root,{recursive:true,force:true});}
});

test('Qoder reports credits quota and per-model credit factor without blocking the catalog',async()=>{
 const requests:string[]=[];let usage='{"userId":"u","userType":"teams","usageType":"credits","totalUsagePercentage":0.07,"expiresAt":1793347662000,"userQuota":{"total":3000,"used":206,"remaining":2794,"percentage":0.07,"unit":"credits"},"orgResourcePackage":{"available":false}}';
 const runtime=await createQoderModelProvider({inspect:async()=>({status:'ready'}),identity:async()=>'user',request:async(path:string)=>{requests.push(path);return path==='/usage'?new Response(usage):Response.json({chat:[{key:'model',enable:true,price_factor:0.5,display_name:'Auto'},{key:'free',enable:true,price_factor:0},{key:'other',enable:true}]});}}).open({accountId:'native-qoder',configRoot:'unused',environment:{}});
 const observation=await runtime.inspect();assert.deepEqual(requests,['/models','/usage']);
 assert.equal(observation.models[0].creditFactor,0.5);assert.equal(observation.models[1].creditFactor,0);assert.equal(observation.models[2].creditFactor,undefined);
 assert.equal(observation.quota?.available,true);assert.equal(observation.quota?.planLabel,'Teams');assert.equal(observation.quota?.resetsAt,'2026-10-30T08:07:42.000Z');assert.equal(observation.quota?.remainingPercent,93.1);assert.equal(observation.quota?.windows?.length,1);assert.ok(observation.quota?.summary?.includes('2794 / 3000'));
 usage='not-json';const failed=await runtime.inspect();assert.equal(failed.status,'ready');assert.equal(failed.quota?.available,false);await runtime.close();
});


test('background catalog starts once, ticks every 60 seconds, never overlaps, preserves failures and stops on close',async t=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-model-refresh-'));
 t.mock.timers.enable({apis:['setInterval','Date']});
 let calls=0,hold=false,failed=false,release:()=>void=()=>{},started:()=>void=()=>{};
 let gate=Promise.resolve();
 const provider={id:'fixture',label:'Fixture',async open(){return{protocol:'chat-completions' as const,async inspect(){calls++;if(hold){started();await gate;}if(failed)throw Error('private-upstream-secret');return{status:'ready' as const,models:[offering]};},async beginLogin(){},async cancelLogin(){},async infer(){throw Error('catalog must not infer');},async close(){}};}};
 const create=()=>createAgentService({dataRoot:root,executors:[],modelProviders:[provider],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
 const service=create();
 try{
  const empty=await service.models.catalog.list();assert.equal(empty.hasSnapshot,false);assert.equal(empty.diagnostic,undefined);assert.deepEqual(empty.models,[]);assert.equal(calls,0);
  const added=await service.models.accounts.add({provider:'fixture'});const checked=await service.models.accounts.check(added.id);
  await service.models.accounts.preferences(added.id,{expectedRevision:checked.revision,models:[{id:offering.id,enabled:true}]});
  assert.equal(calls,1);await service.models.catalog.list();await service.models.accounts.list();assert.equal(calls,1,'ordinary reads never contact the provider');
  service.models.startRefreshing();service.models.startRefreshing();await service.models.catalog.list({refresh:true});assert.equal(calls,2,'startup and explicit observers share one check');
  hold=true;gate=new Promise<void>(resolve=>{release=resolve;});const begun=new Promise<void>(resolve=>{started=resolve;});
  t.mock.timers.tick(30_000);assert.equal(calls,2,'30 seconds must not trigger an external check');
  t.mock.timers.tick(30_000);await begun;assert.equal(calls,3);
  t.mock.timers.tick(60_000);assert.equal(calls,3,'slow refresh cannot overlap the next ticks');
  const cached=await service.models.catalog.list();assert.equal(cached.models[0]?.available,true,'reads do not wait for the held external check');
  failed=true;release();const failure=await service.models.catalog.list({refresh:true});
  assert.equal(failure.models.length,1);assert.equal(failure.models[0]?.available,true);assert.match(failure.diagnostic||'',/核对失败/);assert.ok(!JSON.stringify(failure).includes('private-upstream-secret'));
  hold=false;failed=false;t.mock.timers.tick(60_000);const restored=await service.models.catalog.list({refresh:true});
  assert.equal(calls,4);assert.equal(restored.models[0]?.available,true);assert.equal(restored.diagnostic,undefined);
  await service.close();const after=calls;t.mock.timers.tick(60_000);service.models.startRefreshing();assert.equal(calls,after,'close clears scheduling and forbids restarting');
  const reopened=create();try{const saved=await reopened.models.catalog.list();assert.equal(saved.models[0]?.available,true);assert.equal(calls,after,'persisted result is immediately readable after restart');}finally{await reopened.close();}
 }finally{await service.close();t.mock.timers.reset();await rm(root,{recursive:true,force:true});}
});
