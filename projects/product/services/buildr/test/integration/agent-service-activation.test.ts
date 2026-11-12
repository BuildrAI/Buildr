import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { connectAgentProcess, prepareAgentRuntime, stopAgentProcess } from '@buildr-ai/buildr-agent';
import { activateAgentServiceRuntime } from '../../src/modules/agent-service/application/activate-runtime.ts';

const isLive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};

// The same activation owner used after launcher installation, with real private
// transport and child processes, no vendor programs or real model accounts.
test('activation reports the exact ready server, protects busy work and adopts the target upgrade', {timeout:60_000}, async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-activation-')),dataRoot=path.join(root,'profile'),packageRoot=path.join(root,'package'),profileId='activation-integration';
  t.after(async()=>{await stopAgentProcess({dataRoot,profileId,mode:'stop-owned'});fs.rmSync(root,{recursive:true,force:true});});
  fs.cpSync(path.resolve(import.meta.dirname,'../../node_modules/@buildr-ai/buildr-agent'),packageRoot,{recursive:true,mode:fs.constants.COPYFILE_FICLONE});
  fs.writeFileSync(path.join(packageRoot,'build/activation-fixture.mjs'),`import fs from 'node:fs';import {startAgentExecutionServer} from './index.js';
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const provider={id:'fixture',label:'fixture',open:async()=>({protocol:'chat-completions',inspect:async()=>({status:'ready',models:[{id:'m',label:'m',images:false,tools:false}]}),beginLogin:async()=>{},cancelLogin:async()=>{},close:async()=>{},infer:async({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}))})};
await startAgentExecutionServer({...input,serviceOptions:{executors:[],modelProviders:[provider]}});\n`);
  const old=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/activation-fixture.mjs'});
  const legacy=await connectAgentProcess({dataRoot,profileId,runtime:old,sourceId:'local'});
  const legacyStatus=await legacy.lifecycle.status();
  const added=await legacy.operations.models.accounts.add({provider:'fixture'});
  const checked=await legacy.operations.models.accounts.check(added.id);
  const account=await legacy.operations.models.accounts.preferences(added.id,{expectedRevision:checked.revision,models:[{id:'m',enabled:true}]});
  const abort=new AbortController();
  const generating=legacy.operations.models.generate({accountId:account.id,modelId:'m',agentId:'codex',conversationId:'activation-busy',runId:'busy',prompt:'fixture',signal:abort.signal});generating.catch(()=>{});
  try{
    for(let attempt=0;attempt<100&&!(await legacy.lifecycle.status()).activity.busy;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal((await legacy.lifecycle.status()).activity.busy,true);
    await assert.rejects(activateAgentServiceRuntime({dataRoot,profileId,runtime:old}),{code:'agent_process_busy'});
    assert.equal((await legacy.lifecycle.identity()).generation,legacyStatus.identity.generation,'busy old backend must not be stopped to repair source identity');
  }finally{abort.abort();await generating.catch(()=>{});}
  for(let attempt=0;attempt<100&&(await legacy.lifecycle.status()).activity.busy;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
  await legacy.disconnect();
  const first=await activateAgentServiceRuntime({dataRoot,profileId,runtime:old});
  assert.notEqual(first.generation,legacyStatus.identity.generation,'an idle backend with inherited missing source identity must be rebuilt');
  assert.equal(first.status,'ready');assert.equal(first.targetDigest,old.digest);assert.equal(first.currentDigest,old.digest);assert.equal(first.accepting,true);
  const connection=await connectAgentProcess({dataRoot,profileId,runtime:old,sourceId:'buildr',legacySourceId:'buildr',host:{
    resolveExecutionScope:async({ref})=>({ref,revision:'fixture',rootPath:root}),
    verifyWorkObject:async()=>{throw Error('unused');},
    listExecutionScopes:async()=>({refs:[{sourceId:'buildr',id:'workspace'}],revision:'fixture'}),
  }});
  try{
    const conversation=await connection.operations.conversations.create('workspace',{cwd:root,title:'activation conversation check'});
    assert.equal(conversation.workspaceId,'workspace','the activated backend must accept the same scope identity as the Web host');
  }finally{await connection.disconnect();}
  fs.writeFileSync(path.join(packageRoot,'build/activation-marker.json'),'{"version":"new"}\n');
  const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/activation-fixture.mjs'});
  const adopted=await activateAgentServiceRuntime({dataRoot,profileId,runtime:next});
  assert.equal(adopted.currentDigest,next.digest);assert.notEqual(adopted.generation,first.generation);assert.notEqual(adopted.pid,first.pid);
});

test('activation refuses an attempted broken target without claiming uncertain startup is confirmed failure', {timeout:60_000}, async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-activation-broken-')),
    dataRoot=path.join(root,'profile'),packageRoot=path.join(root,'package'),profileId='activation-broken';
  t.after(async()=>{await stopAgentProcess({dataRoot,profileId,mode:'stop-owned'});fs.rmSync(root,{recursive:true,force:true});});
  fs.cpSync(path.resolve(import.meta.dirname,'../../node_modules/@buildr-ai/buildr-agent'),packageRoot,{recursive:true,mode:fs.constants.COPYFILE_FICLONE});
  fs.writeFileSync(path.join(packageRoot,'build/activation-good.mjs'),`import fs from 'node:fs';import {startAgentExecutionServer} from './index.js';const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));await startAgentExecutionServer({...input,serviceOptions:{executors:[],modelProviders:[]}});\n`);
  const working=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/activation-good.mjs'});
  const ready=await activateAgentServiceRuntime({dataRoot,profileId,runtime:working});
  assert.equal(ready.status,'ready');assert.equal(ready.currentDigest,working.digest);
  const retainedBytes=fs.readFileSync(working.entry);
  const attempted=path.join(root,'attempted');
  fs.writeFileSync(path.join(packageRoot,'build/activation-broken.mjs'),`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(attempted)},'attempted');throw Error('fixture startup failure');\n`);
  const broken=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/activation-broken.mjs'});
  await assert.rejects(activateAgentServiceRuntime({dataRoot,profileId,runtime:broken}),(error:any)=>{
    assert.ok(['agent_process_activation_failed','agent_process_start_unconfirmed'].includes(error.code));
    assert.equal(error.stage,'connect');assert.ok(error.message.includes(`connect / ${error.code}`));return true;
  });
  assert.equal(fs.readFileSync(attempted,'utf8'),'attempted');
  assert.deepEqual(fs.readFileSync(working.entry),retainedBytes,'The previous working runtime must be retained unchanged.');
  assert.ok(fs.existsSync(broken.entry),'A failed activation retains the exact target bytes.');
});

test('preparation lock contention drains an idle backend through lifecycle ownership and retries once', {timeout:30_000}, async t=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'buildr-activation-lock-'))),dataRoot=path.join(root,'profile'),profileId='activation-lock';
  t.after(async()=>{await stopAgentProcess({dataRoot,profileId,mode:'stop-owned'});fs.rmSync(root,{recursive:true,force:true});});
  const runtime=prepareAgentRuntime({dataRoot});
  const connection=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'buildr',legacySourceId:'buildr'});
  const before=await connection.lifecycle.identity();await connection.disconnect();
  const control=path.join(dataRoot,'agent-service/process'),lock=path.join(control,'storage.lock');
  fs.mkdirSync(lock,{mode:0o700});fs.writeFileSync(path.join(lock,'identity.json'),JSON.stringify({pid:process.pid,nonce:'fixture-held-preparation'}),{mode:0o600});
  let released=false;
  const timer=setInterval(()=>{
    const file=path.join(control,'last-stop.json');
    if (!released&&fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).confirmed) {fs.rmSync(lock,{recursive:true});released=true;}
  },5);t.after(()=>clearInterval(timer));
  const result=await activateAgentServiceRuntime({dataRoot,profileId,timeoutMs:10000});
  assert.equal(released,true);assert.equal(result.status,'ready');assert.equal(result.currentDigest,runtime.digest);assert.notEqual(result.pid,before.pid);
});

test('activation retains a busy owner and completes through parallel adoption when preparation is lock-contended', {timeout:90_000}, async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-activation-busy-')),dataRoot=path.join(root,'profile'),packageRoot=path.join(root,'package'),profileId='activation-busy-handoff';
  const livePids:number[]=[];
  t.after(async()=>{
    try{fs.writeFileSync(path.join(dataRoot,'release-slow'),'yes');}catch{}
    await stopAgentProcess({dataRoot,profileId,mode:'stop-owned'}).catch(()=>{});
    for(let attempt=0;attempt<200&&livePids.some(pid=>isLive(pid));attempt++)await new Promise(resolve=>setTimeout(resolve,50));
    fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  });
  fs.cpSync(path.resolve(import.meta.dirname,'../../node_modules/@buildr-ai/buildr-agent'),packageRoot,{recursive:true,mode:fs.constants.COPYFILE_FICLONE});
  fs.copyFileSync(path.resolve(import.meta.dirname,'../../../buildr-agent/test/integration/fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/activation-fixture.mjs'));
  fs.writeFileSync(path.join(packageRoot,'build/fixture-version.json'),JSON.stringify({version:'old'}));
  const old=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/activation-fixture.mjs'});
  const legacy=await connectAgentProcess({dataRoot,profileId,runtime:old,sourceId:'buildr',legacySourceId:'buildr',host:{
    resolveExecutionScope:async({ref})=>({ref,revision:'fixture',rootPath:root}),
    verifyWorkObject:async()=>{throw Error('unused');},
    listExecutionScopes:async()=>({refs:[{sourceId:'buildr',id:'workspace'}],revision:'fixture'}),
  }});
  const oldIdentity=await legacy.lifecycle.identity();
  livePids.push(oldIdentity.pid);
  const connection=await legacy.operations.connections.read('first');
  await legacy.operations.connections.connect('first',{expectedRevision:connection.revision});
  const added=await legacy.operations.models.accounts.add({provider:'fixture-model'});
  const checked=await legacy.operations.models.accounts.check(added.id);
  await legacy.operations.models.accounts.preferences(added.id,{expectedRevision:checked.revision,models:[{id:'fixture',enabled:true}]});
  const chat=await legacy.operations.conversations.create('workspace',{cwd:root,title:'busy handoff'});
  const draft={expectedRevision:chat.revision,connectionId:'first',modelAccountId:added.id,model:'fixture',text:'hold:slow'};
  const preview=await legacy.operations.conversations.prepareSend('workspace',chat.id,draft);
  await legacy.operations.conversations.send('workspace',chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
  for(let attempt=0;attempt<200&&!(await legacy.lifecycle.status()).activity.busy;attempt++)await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal((await legacy.lifecycle.status()).activity.busy,true,'the old owner must be busy before activation');
  await legacy.disconnect();
  const control=path.join(dataRoot,'agent-service/process'),lock=path.join(control,'storage.lock');
  fs.mkdirSync(lock,{mode:0o700});fs.writeFileSync(path.join(lock,'identity.json'),JSON.stringify({pid:process.pid,nonce:'fixture-busy-preparation'}),{mode:0o600});
  const release=setTimeout(()=>{try{fs.rmSync(lock,{recursive:true,force:true});}catch{}},750);t.after(()=>clearTimeout(release));
  const result=await activateAgentServiceRuntime({dataRoot,profileId,timeoutMs:60_000});
  livePids.push(result.pid);
  // Activation prepares the installed package, not the fixture package the old
  // owner runs; the digests differ, so the busy owner must hand over via adoption.
  const expected=prepareAgentRuntime({dataRoot});
  assert.equal(result.status,'ready');assert.equal(result.currentDigest,expected.digest);assert.notEqual(result.currentDigest,old.digest);
  assert.notEqual(result.generation,oldIdentity.generation,'the successor must own new work');
  assert.ok(isLive(oldIdentity.pid),'the busy old generation is retained, not stopped');
  const observer=await connectAgentProcess({dataRoot,profileId,runtime:expected,sourceId:'buildr',legacySourceId:'buildr'});
  try{
    const view=await observer.operations.conversations.read('workspace',chat.id);
    assert.equal(view.run?.status,'running','the retained execution keeps running on the old generation');
    assert.equal(view.run?.generation,oldIdentity.generation);
  }finally{await observer.disconnect();}
});
