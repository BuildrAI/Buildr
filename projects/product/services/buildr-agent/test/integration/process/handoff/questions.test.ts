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

for(const answer of [false,true])test('waiting question handoff crosses retained generations and never replies to the old model; answer='+answer,{timeout:90000},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-question-process-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');
  fs.mkdirSync(workspace);copyPackage(prepared,packageRoot);
  fs.copyFileSync(path.join(import.meta.dirname,'../../fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
  const marker=path.join(packageRoot,'build/fixture-version.json');fs.writeFileSync(marker,JSON.stringify({version:'old'}));
  const serverFile=path.join(packageRoot,'build/process/server.js'),serverCode=fs.readFileSync(serverFile,'utf8');
  if(!answer){
    // A retained old version can report historical ownership even after the
    // exact round's release acknowledgement was durably written.
    assert.ok(serverCode.includes('busy: !released'));
    assert.ok(serverCode.includes('busy: service.conversationBusy(input.scope, input.id)'));
    fs.writeFileSync(serverFile,serverCode.replace('busy: !released','busy: true').replace('busy: service.conversationBusy(input.scope, input.id)','busy: retiring || service.conversationBusy(input.scope, input.id)'));
  }
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
    const draft={expectedRevision:target.revision,connectionId:'second',...source,text:answer?'':'handle a new instruction',...(answer?{continueRunId:original.id}:{}),waitingHandoff:{runId:original.id,participantId:original.participantId,generation:original.generation,requestIds:[question.id],...(answer?{answers:[{requestId:question.id,answer:{scope:'later'}}]}:{})}};
    target=await observer.operations.conversations.queueSend(scope,target.id,{...draft,clientRequestId:requestId});
    assert.equal(target.pendingSend?.waitingQuestions?.[0]?.id,question.id);
    main=await actor({dataRoot,profileId,runtime:next,workspace});await main.call('conversations.read',[scope,target.id]);
    target=await until(()=>observer!.operations.conversations.read(scope,target.id),view=>!view.pendingSend&&view.run?.generation===adopted.identity.generation&&view.run?.status==='completed');
    assert.equal(target.requests.filter(request=>request.runId===target.run?.id).length,0);assert.equal(target.retainedRuns?.[0]?.id,original.id);assert.ok(target.entries.some(entry=>entry.id.startsWith('waiting-handoff-')&&entry.text.includes('Choose next work')));
    assert.equal(fs.existsSync(path.join(dataRoot,'native-replies.jsonl')),false);
    await observer.operations.conversations.queueSend(scope,target.id,{...draft,clientRequestId:requestId});
    const sent=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(sent.filter(value=>value.version==='new').length,1);assert.match(sent.find(value=>value.version==='new').prompt,answer?/"回答":\{"scope":"later"\}/:/未回答/);
    assert.equal((await observer.operations.conversations.read(scope,other.id)).run?.status,'running');assert.ok(isLive(old.pid));
  }});
