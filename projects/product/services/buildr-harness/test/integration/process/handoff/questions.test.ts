import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { executionScopeKey } from '../../../../src/index.ts';
import type { AgentProcessConnection } from '../../../../src/index.ts';
import { request } from '../../../../src/process/transport.ts';
import { isLive, until, actor, prepareAgentRuntime, connectAgentProcess, copyPackage, prepared, cleanupProcessFixture } from '../../../support/process-fixture.ts';

test('a waiting question keeps its original round instead of handing off to a retained generation',{timeout:90000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-question-process-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');
  fs.mkdirSync(workspace);copyPackage(prepared,packageRoot);
  fs.copyFileSync(path.join(import.meta.dirname,'../../fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
  const marker=path.join(packageRoot,'build/fixture-version.json');fs.writeFileSync(marker,JSON.stringify({version:'old'}));
  const serverFile=path.join(packageRoot,'build/process/server.js'),serverCode=fs.readFileSync(serverFile,'utf8');
  // A retained old version can report historical ownership even after the
  // exact round's release acknowledgement was durably written.
  assert.ok(serverCode.includes('busy: !released'));
  assert.ok(serverCode.includes('busy: service.conversationBusy(input.scope, input.id)'));
  fs.writeFileSync(serverFile,serverCode.replace('busy: !released','busy: true').replace('busy: service.conversationBusy(input.scope, input.id)','busy: retiring || service.conversationBusy(input.scope, input.id)'));
  const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='question-handoff',scope=executionScopeKey({sourceId:'minimal',id:'directory'});
  let main:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
  t.after(() => cleanupProcessFixture({root,dataRoot,profileId,host:main,observer:observer}));
  {
    main=await actor({dataRoot,profileId,runtime,workspace});observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});const old=await observer.lifecycle.identity();
    for(const id of ['first','second']){const connection=await main.call('connections.read',[id]);await main.call('connections.connect',[id,{expectedRevision:connection.revision}]);}
    const added=await main.call('models.accounts.add',[{provider:'fixture-model'}]),checked=await main.call('models.accounts.check',[added.id]);await main.call('models.accounts.preferences',[added.id,{expectedRevision:checked.revision,models:[{id:'fixture',enabled:true}]}]);
    const source={modelAccountId:added.id,model:'fixture'};
    const start=async(text:string)=>{const chat=await main!.call('conversations.create',[scope,{}]),draft={expectedRevision:chat.revision,connectionId:'first',...source,text},preview=await main!.call('conversations.prepareSend',[scope,chat.id,draft]);await main!.call('conversations.send',[scope,chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()}]);return await until(()=>observer!.operations.conversations.read(scope,chat.id),view=>view.run?.accepted===true);};
    let target=await start('question');const other=await start('hold:other');target=await until(()=>observer!.operations.conversations.read(scope,target.id),view=>view.run?.status==='waiting-question');
    const original=target.run!,question=target.requests[0]!,requestId=randomUUID();
    fs.writeFileSync(serverFile,serverCode);fs.writeFileSync(marker,JSON.stringify({version:'new'}));const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'});
    await observer.lifecycle.requestRuntime({expectedGeneration:old.generation,runtime:next});const adopted=await until(()=>observer!.lifecycle.status(),status=>status.identity.runtime.digest===next.digest);
    await main.close();main=undefined; // Content remains durable while no host can admit new work.
    target=await observer.operations.conversations.read(scope,target.id);
    const draft={expectedRevision:target.revision,connectionId:'second',...source,text:'handle a new instruction',waitingHandoff:{runId:original.id,participantId:original.participantId,generation:original.generation,requestIds:[question.id],answers:[{requestId:question.id,answer:{scope:'later'}}]}};
    // A pending card cannot be abandoned by a durable handoff: the refusal must
    // keep the original round, its question and every native input untouched.
    await assert.rejects(observer.operations.conversations.queueSend(scope,target.id,{...draft,clientRequestId:requestId}),{code:'agent_pending_response'});
    const preserved=await observer.operations.conversations.read(scope,target.id);
    assert.equal(preserved.pendingSend,undefined);assert.equal(preserved.run?.id,original.id);assert.deepEqual(preserved.requests.map(value=>value.id),[question.id]);
    assert.equal(fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').length,2,'the two original starts are the only native sends');
    assert.equal(fs.existsSync(path.join(dataRoot,'native-replies.jsonl')),false);
    // The card itself stays the only authority: an explicit answer reaches the
    // original model in the original round, and no replacement generation runs.
    main=await actor({dataRoot,profileId,runtime:next,workspace});await main.call('conversations.read',[scope,target.id]);
    await main.call('conversations.reply',[scope,target.id,question.id,{expectedRevision:preserved.revision,runId:original.id,participantId:original.participantId,generation:original.generation,answer:{scope:'later'}}]);
    target=await until(()=>observer!.operations.conversations.read(scope,target.id),view=>view.run?.id===original.id&&view.run?.status==='completed'&&view.requests.length===0);
    assert.equal(target.pendingSend,undefined);assert.equal(target.run?.generation,old.generation);
    assert.equal(target.entries.some(entry=>entry.kind==='handoff'&&entry.nativeSession),false);
    assert.equal(fs.readFileSync(path.join(dataRoot,'native-replies.jsonl'),'utf8').trim(),'reply');
    const sent=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(sent.filter(value=>value.version==='new').length,0,'answering a card never starts a replacement native session');
    const otherState=await observer.operations.conversations.read(scope,other.id);assert.equal(otherState.run?.status,'running',JSON.stringify(otherState.run));assert.ok(isLive(old.pid));
    assert.notEqual(adopted.identity.generation,old.generation);
  }
});
