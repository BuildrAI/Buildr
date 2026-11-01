import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { executionScopeKey } from '../../../../src/index.ts';
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
  if(newInstruction)uncertain=await observer.operations.conversations.queueSend(scope,uncertain.id,{expectedRevision:uncertain.revision,...choice,text:'NEW_INSTRUCTION',clientRequestId:randomUUID(),previousRunId:uncertain.run!.id});
  await main.call('conversations.read',[scope,uncertain.id]);assert.ok(isLive(old.pid));
  if(newInstruction)uncertain=await until(()=>observer!.operations.conversations.read(scope,uncertain.id),v=>v.run?.id!==original.id&&v.run?.status==='completed'&&!v.pendingSend);
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
