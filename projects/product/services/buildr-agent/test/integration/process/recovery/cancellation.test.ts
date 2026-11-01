import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { executionScopeKey } from '../../../../src/index.ts';
import type { AgentProcessConnection } from '../../../../src/index.ts';
import { isLive, until, actor, prepareAgentRuntime, connectAgentProcess, copyPackage, prepared, cleanupProcessFixture } from '../../../support/process-fixture.ts';

test('cancelled next input can continue a terminal old round after automatic exact release, without stopping another conversation',{timeout:90000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-cancel-continue-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');
 fs.mkdirSync(workspace);copyPackage(prepared,packageRoot);fs.copyFileSync(path.join(import.meta.dirname,'../../fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
 const marker=path.join(packageRoot,'build/fixture-version.json');fs.writeFileSync(marker,JSON.stringify({version:'old'}));
 const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='cancel-continue',scope=executionScopeKey({sourceId:'minimal',id:'directory'});
 let main:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
 t.after(() => cleanupProcessFixture({root,dataRoot,profileId,host:main,observer:observer}));
  {
  main=await actor({dataRoot,profileId,runtime,workspace});observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});const old=await observer.lifecycle.identity();
  const connection=await main.call('connections.read',['first']);await main.call('connections.connect',['first',{expectedRevision:connection.revision}]);
  const added=await main.call('models.accounts.add',[{provider:'fixture-model'}]),checked=await main.call('models.accounts.check',[added.id]);await main.call('models.accounts.preferences',[added.id,{expectedRevision:checked.revision,models:[{id:'fixture',enabled:true}]}]);
  const choice={connectionId:'first',modelAccountId:added.id,model:'fixture'};
  const start=async(text:string)=>{const chat=await main!.call('conversations.create',[scope,{}]),draft={...choice,text,expectedRevision:chat.revision},preview=await main!.call('conversations.prepareSend',[scope,chat.id,draft]);await main!.call('conversations.send',[scope,chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()}]);return await until(()=>observer!.operations.conversations.read(scope,chat.id),v=>v.run?.accepted===true);};
  let target=await start('lost-observation');const other=await start('hold:other');target=await until(()=>observer!.operations.conversations.read(scope,target.id),v=>v.run?.status==='unknown');
  target=await observer.operations.conversations.queueSend(scope,target.id,{...choice,text:'cancelled-next-input',clientRequestId:randomUUID(),expectedRevision:target.revision});await observer.operations.conversations.cancelPendingSend(scope,target.id,{expectedPendingRevision:target.pendingSend!.revision});
  const walk=(dir:string):string[]=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
  const filename=walk(path.join(dataRoot,'agent-service','connections')).find(file=>{try{return JSON.parse(fs.readFileSync(file,'utf8')).kind==='lost-observation';}catch{return false;}})!;assert.ok(filename);
  const native=JSON.parse(fs.readFileSync(filename,'utf8'));native.status='stopped';fs.writeFileSync(filename,JSON.stringify(native));
  target=await observer.operations.conversations.observe(scope,target.id);assert.equal(target.run?.status,'stopped');const originalRun=target.run!.id;
  native.awaitingObservation=true;fs.writeFileSync(filename,JSON.stringify(native));
  fs.writeFileSync(marker,JSON.stringify({version:'new'}));const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'});await observer.lifecycle.requestRuntime({expectedGeneration:old.generation,runtime:next});const adopted=await until(()=>observer!.lifecycle.status(),v=>v.identity.runtime.digest===next.digest);
  await main.call('conversations.read',[scope,target.id]); // Attach the actual host to its adopted backend.
  target=await observer.operations.conversations.read(scope,target.id);assert.equal(target.pendingSend,undefined);
  const draft={...choice,continueRunId:originalRun,text:'',expectedRevision:target.revision},preview=await observer.operations.conversations.prepareSend(scope,target.id,draft),requestId=randomUUID();
  await observer.operations.conversations.send(scope,target.id,{...draft,previewToken:preview.token,clientRequestId:requestId});
  target=await until(()=>observer!.operations.conversations.read(scope,target.id),v=>v.run?.generation===adopted.identity.generation&&v.run?.status==='completed');
  const sends=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(sends.filter(v=>v.version==='new').length,1);assert.ok(!sends.some(v=>v.text==='cancelled-next-input'));
  assert.equal((await observer.operations.conversations.read(scope,other.id)).run?.status,'running');assert.ok(isLive(old.pid));assert.ok(!JSON.parse(fs.readFileSync(filename,'utf8')).awaitingObservation);
 }});
