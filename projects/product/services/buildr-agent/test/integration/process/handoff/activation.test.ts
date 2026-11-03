import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { executionScopeKey } from '../../../../src/index.ts';
import type { ConversationView, AgentProcessConnection } from '../../../../src/index.ts';
import { isLive, until, actor, prepareAgentRuntime, connectAgentProcess, copyPackage, prepared, cleanupProcessFixture } from '../../../support/process-fixture.ts';

for (const {modelBound,parallel,uncertain} of [{modelBound:true,parallel:true,uncertain:false},{modelBound:false,parallel:true,uncertain:false},{modelBound:false,parallel:true,uncertain:true},{modelBound:false,parallel:false,uncertain:false}]) test(`activation proves the target while old work drains (${modelBound ? 'model-bound' : 'shared native'} ${parallel ? 'parallel with failed-target retry' : 'incompatible protected handoff'}${uncertain ? ', unknown old result' : ''})`, {timeout:90_000}, async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-activation-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');
  fs.mkdirSync(workspace);copyPackage(prepared,packageRoot);
  fs.copyFileSync(path.join(import.meta.dirname,'../../fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
  const marker=path.join(packageRoot,'build/fixture-version.json');fs.writeFileSync(marker,JSON.stringify({version:'old'}));
  const contractsFile=path.join(packageRoot,'build/runtime-contracts.json'),contracts=fs.readFileSync(contractsFile,'utf8');
  if(!parallel)fs.writeFileSync(contractsFile,JSON.stringify({...JSON.parse(contracts),parallelCompatibility:2}));
  const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='activation-test',scope=executionScopeKey({sourceId:'minimal',id:'directory'});
  let main:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
  t.after(()=>cleanupProcessFixture({root,dataRoot,profileId,host:main,observer}));
  main=await actor({dataRoot,profileId,runtime,workspace});observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});
  const old=await observer.lifecycle.identity(),connection=await main.call('connections.read',['first']);
  await main.call('connections.connect',['first',{expectedRevision:connection.revision}]);
  let selection={};
  const account=await main.call('models.accounts.add',[{provider:'fixture-model'}]),checked=await main.call('models.accounts.check',[account.id]);await main.call('models.accounts.preferences',[account.id,{expectedRevision:checked.revision,models:[{id:'fixture',enabled:true}]}]);
  if(modelBound)selection={modelAccountId:account.id,model:'fixture'};
  const start=async(text:string)=>{
    const chat:ConversationView=await main!.call('conversations.create',[scope,{}]),draft={expectedRevision:chat.revision,connectionId:'first',...selection,text};
    const preview=await main!.call('conversations.prepareSend',[scope,chat.id,draft]);
    await main!.call('conversations.send',[scope,chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()}]);
    return until(()=>observer!.operations.conversations.read(scope,chat.id),view=>view.run?.accepted===true);
  };
  const oldText=uncertain?'uncertain-ended':'hold',oldStatus=uncertain?'unknown':'running';
  const held=await start(oldText);
  if(uncertain)await until(()=>observer!.operations.conversations.read(scope,held.id),view=>view.run?.status==='unknown');
  fs.writeFileSync(contractsFile,contracts);
  fs.writeFileSync(marker,JSON.stringify({version:'new'}));
  const gate=path.join(dataRoot,'allow-upgrade');
  fs.writeFileSync(path.join(packageRoot,'build/activate.mjs'),`import fs from 'node:fs';const b=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));if(!fs.existsSync(b.dataRoot+'/allow-upgrade'))throw Error('startup blocked');await import('./process-fixture.mjs');\n`);
  const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/activate.mjs'});
  if(parallel){
    await assert.rejects(connectAgentProcess({dataRoot,profileId,runtime:next,sourceId:'minimal',requireRuntime:true}),{code:'agent_process_activation_failed'});
    assert.ok(isLive(old.pid));assert.equal((await observer.operations.conversations.read(scope,held.id)).run?.status,oldStatus);
    const controls=await connectAgentProcess({dataRoot,profileId,runtime:next,sourceId:'minimal'});
    try {
      assert.equal((await controls.operations.conversations.read(scope,held.id)).run?.status,oldStatus,'a failed activation must not block a new control client');
      await until(()=>controls.lifecycle.status(),status=>Boolean(status.diagnostic));
      await assert.rejects(controls.operations.conversations.prepareSend(scope,held.id,{expectedRevision:held.revision,connectionId:'first',...selection,text:'must not send'}),{code:'agent_process_activation_failed'});
    } finally {await controls.disconnect();}
    fs.writeFileSync(gate,'yes');
    const ordinary=await connectAgentProcess({dataRoot,profileId,runtime:next,sourceId:'minimal'});
    let fresh:ConversationView;
    try {
      // A normal send through the existing host must observe readiness and route
      // to the successor, without a separate activation or user retry.
      const draftId=randomUUID(),draft=await ordinary.operations.conversations.readDraft(scope,draftId);
      const result=await main!.call('conversations.startDraft',[scope,draftId,{connectionId:'first',...selection,text:'new work',clientRequestId:randomUUID(),expectedDraftRevision:draft.revision}]);
      fresh=await until(()=>observer!.operations.conversations.read(scope,result.conversation.id),view=>view.run?.accepted===true);
    } finally { await ordinary.disconnect(); }
    const adopted=await observer.lifecycle.status();
    assert.equal(adopted.identity.runtime.digest,next.digest);assert.equal(adopted.accepting,true);assert.ok(isLive(old.pid));
    assert.equal(fresh.run?.generation,adopted.identity.generation);
    await until(()=>observer!.operations.conversations.read(scope,fresh.id),view=>view.run?.status==='completed'&&(!modelBound||view.run.resourcesReleased===true));
    assert.equal((await observer.operations.conversations.read(scope,held.id)).run?.status,oldStatus);
  }else{
    fs.writeFileSync(gate,'yes');
    await assert.rejects(connectAgentProcess({dataRoot,profileId,runtime:next,sourceId:'minimal',requireRuntime:true,activationTimeoutMs:100}),{code:'agent_process_activation_pending'});
    assert.equal((await observer.lifecycle.identity()).generation,old.generation);assert.ok(isLive(old.pid));
    const ordinary=await connectAgentProcess({dataRoot,profileId,runtime:next,sourceId:'minimal',activationTimeoutMs:100});
    try {
      await assert.rejects(ordinary.operations.conversations.prepareSend(scope,held.id,{expectedRevision:held.revision,connectionId:'first',text:'must not send'}),{code:'agent_process_activation_pending'});
    } finally {await ordinary.disconnect();}
  }
  if(uncertain){const current=await observer.operations.conversations.read(scope,held.id);await observer.operations.conversations.stop(scope,held.id,{expectedRevision:current.revision,runId:current.run!.id,participantId:current.run!.participantId,generation:current.run!.generation});}
  fs.writeFileSync(path.join(dataRoot,'release'),'yes');
  const adopted=await until(()=>observer!.lifecycle.status(),value=>value.identity.runtime.digest===next.digest&&value.accepting);
  assert.equal(adopted.retiring,false);
  await until(()=>observer!.operations.conversations.read(scope,held.id),view=>view.run?.status===(uncertain?'stopped':'completed'));
  await until(async()=>!isLive(old.pid),Boolean);
  const sent=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(sent.filter(value=>value.text===oldText).length,1);
  assert.equal(sent.filter(value=>value.text==='must not send').length,0);
  if(parallel)assert.equal(sent.filter(value=>value.text==='new work').length,1);
  if(parallel)assert.equal(sent.find(value=>value.text==='new work')?.version,'new');
});
