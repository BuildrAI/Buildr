import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { executionScopeKey } from '../../../../src/index.ts';
import { claim, readProcessRecord } from '../../../../src/process/ownership.ts';
import { request } from '../../../../src/process/transport.ts';
import type { AgentProcessConnection } from '../../../../src/index.ts';
import { isLive, until, actor, prepareAgentRuntime, connectAgentProcess, copyPackage, prepared, cleanupProcessFixture } from '../../../support/process-fixture.ts';

for(const newInstruction of [true,false])test('retiring process preserves unknown work and supports explicit '+(newInstruction?'new instruction':'released continuation'),{timeout:90000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-result-resource-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');fs.mkdirSync(workspace);copyPackage(prepared,packageRoot);
 fs.copyFileSync(path.join(import.meta.dirname,'../../fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
 const marker=path.join(packageRoot,'build/fixture-version.json');fs.writeFileSync(marker,JSON.stringify({version:'old'}));const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='result-resource',scope=executionScopeKey({sourceId:'minimal',id:'directory'});
 let main:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
 t.after(() => cleanupProcessFixture({root,dataRoot,profileId,host:main,observer:observer}));
  {
  main=await actor({dataRoot,profileId,runtime,workspace});observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});const old=await observer.lifecycle.identity();
  const connection=await main.call('connections.read',['first']);await main.call('connections.connect',['first',{expectedRevision:connection.revision}]);const added=await main.call('models.accounts.add',[{provider:'fixture-model'}]),checked=await main.call('models.accounts.check',[added.id]);await main.call('models.accounts.preferences',[added.id,{expectedRevision:checked.revision,models:[{id:'fixture',enabled:true}]}]);const choice={connectionId:'first',modelAccountId:added.id,model:'fixture'};
  const start=async(text:string)=>{const chat=await main!.call('conversations.create',[scope,{}]),draft={expectedRevision:chat.revision,...choice,text},preview=await main!.call('conversations.prepareSend',[scope,chat.id,draft]);await main!.call('conversations.send',[scope,chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()}]);return await until(()=>observer!.operations.conversations.read(scope,chat.id),v=>v.run?.accepted===true);};
  let uncertain=await start('uncertain-ended');const other=await start('hold:other');uncertain=await until(()=>observer!.operations.conversations.read(scope,uncertain.id),v=>v.run?.status==='unknown');
  const original=uncertain.run!;
  fs.writeFileSync(marker,JSON.stringify({version:'new'}));const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'});await observer.lifecycle.requestRuntime({expectedGeneration:old.generation,runtime:next});await until(()=>observer!.lifecycle.status(),v=>v.identity.runtime.digest===next.digest);
  // Unknown work whose owner is gone stays observable. A new instruction is
  // either delivered once through an explicit confirmed replacement or kept
  // with a reason; it is never replayed or silently merged into the old round.
  await main.call('conversations.read',[scope,uncertain.id]);assert.ok(isLive(old.pid));
  if(newInstruction){
    for(let attempt=0;;attempt++){
      const current=await observer.operations.conversations.read(scope,uncertain.id);
      const confirmed={expectedRevision:current.revision,...choice,text:'NEW_INSTRUCTION'};
      try{
        const preview=await observer.operations.conversations.prepareSend(scope,uncertain.id,confirmed);
        await observer.operations.conversations.send(scope,uncertain.id,{...confirmed,previewToken:preview.token,clientRequestId:randomUUID()});
        break;
      }catch(error){if(attempt>=4||(error as {code?:string}).code!=='agent_revision_conflict')throw error;}
    }
  }
  if(newInstruction)uncertain=await until(()=>observer!.operations.conversations.read(scope,uncertain.id),v=>v.run?.id!==original.id&&v.run?.status==='completed');
  fs.writeFileSync(path.join(dataRoot,'release-uncertain-resource'),'yes');
  uncertain=await until(()=>observer!.operations.conversations.read(scope,uncertain.id),v=>(newInstruction?v.retainedRuns?.find(run=>run.id===original.id):v.run)?.resourcesReleased===true);
  const retainedRun=(newInstruction?uncertain.retainedRuns!.find(run=>run.id===original.id):uncertain.run)!;
  assert.equal(retainedRun.status,'unknown');assert.equal(retainedRun.executionState,'unknown');assert.equal(retainedRun.tools[0].status,'unknown');assert.equal(uncertain.pendingSend,undefined);assert.ok(isLive(old.pid),'another conversation still owns this generation');
  if(newInstruction){
  const sent=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').map(v=>JSON.parse(v));assert.equal(sent.filter(v=>v.text==='uncertain-ended').length,1);assert.equal(sent.filter(v=>v.text==='NEW_INSTRUCTION').length,1);
  uncertain=await observer.operations.conversations.read(scope,uncertain.id);assert.equal(uncertain.run?.status,'completed');assert.equal(uncertain.retainedRuns?.find(run=>run.id===original.id)?.resourcesReleased,true);assert.equal(uncertain.pendingSend,undefined);
  }else{
  const sent=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').map(v=>JSON.parse(v));assert.equal(sent.filter(v=>v.text==='uncertain-ended').length,1);assert.equal(sent.some(v=>v.text==='NEVER_REPLAY'),false);
  uncertain=await observer.operations.conversations.read(scope,uncertain.id);assert.equal(uncertain.run?.status,'unknown');assert.equal(uncertain.run?.resourcesReleased,true);assert.equal(uncertain.pendingSend,undefined);
  uncertain=await observer.operations.conversations.observe(scope,uncertain.id);
  const prior=uncertain.run!,recovery={expectedRevision:uncertain.revision,...choice,modelAccountIdentity:prior.modelAccountIdentity,model:prior.model,serviceTier:prior.serviceTier,reasoningEffort:prior.reasoningEffort,permissionMode:prior.permissionMode,continueRunId:prior.id,text:''};
  const preview=await observer.operations.conversations.prepareSend(scope,uncertain.id,recovery);
  const resumed=await observer.operations.conversations.send(scope,uncertain.id,{...recovery,previewToken:preview.token,clientRequestId:randomUUID()});
  await until(()=>observer!.operations.conversations.read(scope,uncertain.id),v=>v.run?.id===resumed.run.id&&v.run.status==='completed');
  const after=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').map(v=>JSON.parse(v));assert.equal(after.filter(v=>v.text==='uncertain-ended').length,1);assert.equal(after.filter(v=>v.text.includes('用户明确请求恢复原对话')).length,1);
  }
  assert.ok(isLive(old.pid));assert.equal((await observer.operations.conversations.read(scope,other.id)).run?.status,'running');
  fs.writeFileSync(path.join(dataRoot,'release-other'),'yes');await until(()=>observer!.operations.conversations.read(scope,other.id),v=>v.run?.status==='completed');await until(async()=>isLive(old.pid),v=>!v);
 }});


test('storage contention during successor startup and rollback preserves the running backend', {timeout:90000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-switch-contention-'));
  const dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');
  fs.mkdirSync(workspace);copyPackage(prepared,packageRoot);
  fs.copyFileSync(path.join(import.meta.dirname,'../../fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
  const marker=path.join(packageRoot,'build/fixture-version.json');
  fs.writeFileSync(marker,JSON.stringify({version:'old'}));
  const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='switch-contention';
  let main:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
  t.after(()=>cleanupProcessFixture({root,dataRoot,profileId,host:main,observer}));
  main=await actor({dataRoot,profileId,runtime,workspace});
  observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});
  const old=await observer.lifecycle.identity(),scope=main.info.scope;
  const connection=await main.call('connections.read',['first']);
  await main.call('connections.connect',['first',{expectedRevision:connection.revision}]);
  const chat=await main.call('conversations.create',[scope,{}]);
  const draft={expectedRevision:chat.revision,connectionId:'first',text:'hold:other'};
  await main.call('conversations.send',[scope,chat.id,{...draft,clientRequestId:randomUUID()}]);
  const original=await until(()=>observer!.operations.conversations.read(scope,chat.id),view=>view.run?.accepted===true);

  fs.writeFileSync(marker,JSON.stringify({version:'wait-for-startup-storage-contention'}));
  const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'});
  await observer.lifecycle.requestRuntime({expectedGeneration:old.generation,runtime:next});
  const successorPid=await until(async()=>Number(fs.readFileSync(path.join(dataRoot,'successor-starting'),'utf8')),pid=>pid>0);
  const diagnostic=path.join(dataRoot,'agent-service','diagnostics','lifecycle-'+old.pid+'-'+old.generation+'.jsonl');
  const lock=claim(dataRoot,'storage');
  try {
    fs.writeFileSync(path.join(dataRoot,'successor-may-start'),'yes');
    await until(async()=>isLive(successorPid),live=>!live);
    await until(async()=>fs.readFileSync(diagnostic,'utf8'),log=>log.includes('"reason":"parallel-rollback"')||log.includes('"event":"service-uncaught-exception"'));
    assert.ok(isLive(old.pid));
    assert.doesNotMatch(fs.readFileSync(diagnostic,'utf8'),/service-uncaught-exception/);
  } finally { lock.release(); }

  const restored=await observer.lifecycle.status();
  assert.equal(restored.identity.generation,old.generation);
  assert.equal(restored.accepting,true);
  assert.equal((await observer.operations.conversations.read(scope,chat.id)).run?.id,original.run!.id);
  fs.writeFileSync(path.join(dataRoot,'release-other'),'yes');
  const completed=await until(()=>observer!.operations.conversations.read(scope,chat.id),view=>view.run?.status==='completed');
  assert.equal(completed.run?.id,original.run!.id);
  assert.equal(fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').length,1);
});


test('runtime registration waits for a same-PID storage lock while the old execution advances', {timeout:90000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-register-contention-'));
  const dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');
  fs.mkdirSync(workspace);copyPackage(prepared,packageRoot);
  fs.copyFileSync(path.join(import.meta.dirname,'../../fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
  const marker=path.join(packageRoot,'build/fixture-version.json');
  fs.writeFileSync(marker,JSON.stringify({version:'registration-storage-contention'}));
  const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='registration-contention';
  let main:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
  t.after(()=>cleanupProcessFixture({root,dataRoot,profileId,host:main,observer}));
  main=await actor({dataRoot,profileId,runtime,workspace});
  observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});
  const old=await observer.lifecycle.identity(),scope=main.info.scope;
  const connection=await main.call('connections.read',['first']);
  await main.call('connections.connect',['first',{expectedRevision:connection.revision}]);
  const chat=await main.call('conversations.create',[scope,{}]);
  await main.call('conversations.send',[scope,chat.id,{expectedRevision:chat.revision,connectionId:'first',text:'hold:other',clientRequestId:randomUUID()}]);
  const original=await until(()=>observer!.operations.conversations.read(scope,chat.id),view=>view.run?.accepted===true);

  fs.writeFileSync(marker,JSON.stringify({version:'registered-successor'}));
  const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'});
  const diagnostic=path.join(dataRoot,'agent-service','diagnostics','lifecycle-'+old.pid+'-'+old.generation+'.jsonl');
  const events=async()=>fs.readFileSync(diagnostic,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  const registration={expectedGeneration:old.generation,runtime:next};
  let activating:Promise<unknown>|undefined;
  try {
    fs.writeFileSync(path.join(dataRoot,'hold-registration-storage'),'yes');
    await until(async()=>Number(fs.readFileSync(path.join(dataRoot,'registration-storage-held'),'utf8')),pid=>pid===old.pid);
    const owner=readProcessRecord(dataRoot)!;
    const controller=new AbortController();
    const cancelled=assert.rejects(request(owner.origin,owner.token,'/runtime',registration,controller.signal),{name:'AbortError'});
    const waiting=(event:any)=>event.event==='service-runtime-registration-wait';
    const first=await until(events,rows=>rows.some(waiting));
    assert.deepEqual(first.filter(waiting).map(({phase,lockName,lockHolderPid,lockHolderThreadId}:any)=>({phase,lockName,lockHolderPid,lockHolderThreadId})),
      [{phase:'storage-lock',lockName:'storage',lockHolderPid:old.pid,lockHolderThreadId:0}]);
    controller.abort();
    await cancelled;
    const failures=await until(events,rows=>rows.some(row=>row.code==='agent_runtime_registration_cancelled'));
    assert.ok(failures.some(row=>row.event==='service-runtime-registration-failed'&&row.phase==='storage-lock'&&row.lockHolderPid===old.pid));
    assert.equal((await observer.lifecycle.status()).pendingRuntime,undefined);

    let registered=false;
    const registrationResult=observer.lifecycle.requestRuntime(registration).then(value=>{registered=true;return value;});
    activating=registrationResult;void activating.catch(()=>{});
    await until(events,rows=>rows.filter(waiting).length===2);
    fs.writeFileSync(path.join(dataRoot,'release-other'),'yes');
    const completed=await until(()=>observer!.operations.conversations.read(scope,chat.id),view=>view.run?.status==='completed');
    assert.equal(completed.run?.id,original.run!.id);
    assert.equal(registered,false,'the old execution completes while registration is still waiting');
    assert.equal((await observer.lifecycle.status()).accepting,true);
    assert.ok(isLive(old.pid));
    fs.writeFileSync(path.join(dataRoot,'release-registration-storage'),'yes');
    assert.equal((await registrationResult).pendingRuntime?.digest,next.digest);
    await until(()=>observer!.lifecycle.status(),value=>value.identity.runtime.digest===next.digest);
    const after=await events();
    assert.ok(after.some(row=>row.event==='service-runtime-registration-resumed'&&row.phase==='persist-pending'&&row.lockHolderPid===old.pid&&row.lockWaitMs>0));
    assert.equal(fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').length,1);
  } finally {
    fs.writeFileSync(path.join(dataRoot,'release-registration-storage'),'yes');
    await activating?.catch(()=>{});
  }
});
