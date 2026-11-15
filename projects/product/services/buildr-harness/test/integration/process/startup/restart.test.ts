import assert from 'node:assert/strict';
import { acquirePreparedProcessFixture } from '../../../support/prepared-process-fixture.ts';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { restartAgentProcess, executionScopeKey } from '../../../../src/index.ts';
import type { AgentProcessConnection } from '../../../../src/index.ts';
import { until, actor, connectAgentProcess, cleanupProcessFixture } from '../../../support/process-fixture.ts';

test('explicit restart changes the idle generation, preserves history, rejects stale and busy observations', {timeout:90000}, async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-restart-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work');
  fs.mkdirSync(workspace);
  const runtime=acquirePreparedProcessFixture(dataRoot),profileId='restart-test';
  const options={dataRoot,profileId,runtime,sourceId:'minimal'};
  let host:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
  const controller=new AbortController();
  t.after(async()=>{controller.abort();await cleanupProcessFixture({root,dataRoot,profileId,host,observer});});
  host=await actor({...options,workspace});observer=await connectAgentProcess(options);
  const scope=executionScopeKey({sourceId:'minimal',id:'directory'});
  const conversation=await observer.operations.conversations.create(scope,{title:'must survive restart'});
  const old=await until(()=>observer!.lifecycle.status(),s=>!s.activity.busy);
  await assert.rejects(restartAgentProcess({...options,expectedGeneration:'stale'}),{code:'agent_control_stale'});
  assert.equal((await observer.lifecycle.identity()).generation,old.identity.generation);
  const replacement=await restartAgentProcess({...options,expectedGeneration:old.identity.generation});
  await observer.disconnect();observer=replacement;
  const next=await observer.lifecycle.status();
  assert.notEqual(next.identity.generation,old.identity.generation);assert.notEqual(next.identity.pid,old.identity.pid);
  assert.equal((await observer.operations.conversations.read(scope,conversation.id)).title,'must survive restart');
  const added=await observer.operations.models.accounts.add({provider:'fixture-model'});
  let account=await observer.operations.models.accounts.check(added.id);
  account=await observer.operations.models.accounts.preferences(account.id,{expectedRevision:account.revision,models:[{id:'fixture',enabled:true}]});
  const generating=observer.operations.models.generate({accountId:account.id,modelId:'fixture',expectedIdentity:account.identity,expectedRevision:account.revision,agentId:'restart-test',conversationId:'generation',runId:'generation',prompt:'bounded request',signal:controller.signal});
  const cancelled=assert.rejects(generating);
  await until(async()=>fs.existsSync(path.join(dataRoot,'model-started')),Boolean);
  await assert.rejects(restartAgentProcess({...options,expectedGeneration:next.identity.generation}),{code:'agent_process_busy'});
  assert.equal((await observer.lifecycle.identity()).generation,next.identity.generation);
  controller.abort();await cancelled;
});

test('a killed execution backend keeps its exact exit signal and links the replacement generation', {timeout:90000}, async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-exit-evidence-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work');
 fs.mkdirSync(workspace);
 const runtime=acquirePreparedProcessFixture(dataRoot),profileId='exit-evidence',options={dataRoot,profileId,runtime,sourceId:'minimal'};
 let host:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
 t.after(()=>cleanupProcessFixture({root,dataRoot,profileId,host,observer}));
 host=await actor({...options,workspace});observer=await connectAgentProcess(options);
 const original=await observer.lifecycle.identity();await observer.disconnect();observer=undefined;
 process.kill(original.pid,'SIGKILL'); // Exact live fixture process owned by this test.
 await until(async()=>{try{process.kill(original.pid,0);return false;}catch{return true;}},Boolean);
 observer=await connectAgentProcess(options);const replacement=await observer.lifecycle.identity();
 assert.notEqual(replacement.generation,original.generation);
 const directory=path.join(dataRoot,'agent-service/diagnostics');
 const rows=()=>fs.readdirSync(directory).flatMap(name=>fs.readFileSync(path.join(directory,name),'utf8').trim().split('\n').map(line=>JSON.parse(line)));
 await until(async()=>rows().some(row=>row.event==='service-child-exit'&&row.childPid===original.pid&&row.signal==='SIGKILL'),Boolean);
 assert.ok(rows().some(row=>row.event==='service-start'&&row.generation===replacement.generation&&row.previousGeneration===original.generation&&row.previousPid===original.pid));
 assert.ok(!rows().some(row=>row.event==='service-close-result'&&row.generation===original.generation));
});
