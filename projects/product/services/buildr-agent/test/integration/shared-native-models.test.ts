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
  const catalog=await service.models.catalog.list();assert.equal(catalog.models.length,3);assert.ok(catalog.models.every(m=>m.enabled===false&&!m.available));
  const first=(await service.models.accounts.list()).accounts;assert.deepEqual(first.map(a=>a.connectionId),['codex','dsh','qoder']);assert.equal(requests,5);
  await service.models.catalog.list();assert.equal(requests,5);
  const qoder=service.connections.read('qoder');await service.connections.disconnect('qoder',{expectedRevision:qoder.revision});
  const disabled=await service.models.catalog.list();assert.equal(disabled.models.some(m=>m.accountId==='native-qoder'&&m.available),false);
  const previous=first.find(a=>a.connectionId==='codex')!.identity;account='b';await service.connections.check('codex',{expectedRevision:service.connections.read('codex').revision});await service.models.catalog.list();assert.notEqual((await service.models.accounts.list()).accounts.find(a=>a.connectionId==='codex')!.identity,previous);
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

test('Qoder reports credits quota and per-model credit factor without blocking the catalog',async()=>{
 const requests:string[]=[];let usage='{"userId":"u","userType":"teams","usageType":"credits","totalUsagePercentage":0.07,"expiresAt":1793347662000,"userQuota":{"total":3000,"used":206,"remaining":2794,"percentage":0.07,"unit":"credits"},"orgResourcePackage":{"available":false}}';
 const runtime=await createQoderModelProvider({inspect:async()=>({status:'ready'}),identity:async()=>'user',request:async(path:string)=>{requests.push(path);return path==='/usage'?new Response(usage):Response.json({chat:[{key:'model',enable:true,price_factor:0.5,display_name:'Auto'},{key:'free',enable:true,price_factor:0},{key:'other',enable:true}]});}}).open({accountId:'native-qoder',configRoot:'unused',environment:{}});
 const observation=await runtime.inspect();assert.deepEqual(requests,['/models','/usage']);
 assert.equal(observation.models[0].creditFactor,0.5);assert.equal(observation.models[1].creditFactor,0);assert.equal(observation.models[2].creditFactor,undefined);
 assert.equal(observation.quota?.available,true);assert.equal(observation.quota?.planLabel,'Teams');assert.equal(observation.quota?.resetsAt,'2026-10-30T08:07:42.000Z');assert.equal(observation.quota?.remainingPercent,93.1);assert.equal(observation.quota?.windows?.length,1);assert.ok(observation.quota?.summary?.includes('2794 / 3000'));
 usage='not-json';const failed=await runtime.inspect();assert.equal(failed.status,'ready');assert.equal(failed.quota?.available,false);await runtime.close();
});
