import {readProcessInstances} from '../../../../src/process/ownership.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { executionScopeKey } from '../../../../src/index.ts';
import type { AgentProcessConnection, ConversationView } from '../../../../src/index.ts';
import { canRunParallel } from '../../../../src/process/runtime-unit.ts';
import { retainedRuntimeCandidates } from '../../../../src/process/cleanup.ts';
import { observeStorageUse } from '../../../../src/storage/files.ts';
import { isLive, until, actor, prepareAgentRuntime, connectAgentProcess, copyPackage, prepared, cleanupProcessFixture } from '../../../support/process-fixture.ts';

test('parallel versions retain old controls, dispatch durable next instructions per conversation, and reap the drained runtime', {timeout:90000}, async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-parallel-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');
  fs.mkdirSync(workspace);copyPackage(prepared,packageRoot);
  fs.copyFileSync(path.join(import.meta.dirname,'../../fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
  const marker=path.join(packageRoot,'build/fixture-version.json');fs.writeFileSync(marker,JSON.stringify({version:'old'}));
  const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='parallel-test',scope=executionScopeKey({sourceId:'minimal',id:'directory'});
  assert.equal(runtime.parallelCompatibility,3);
  assert.equal(canRunParallel(runtime,{...runtime,parallelCompatibility:1}),false,'old versions retain native writers and must drain before adopting this version');
  assert.equal(canRunParallel({...runtime,parallelCompatibility:1},runtime),false);
  assert.equal(canRunParallel(runtime,runtime),true);
  let main:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
  t.after(() => cleanupProcessFixture({root,dataRoot,profileId,host:main,observer:observer}));
  {
    main=await actor({dataRoot,profileId,runtime,workspace});
    observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});
    const firstIdentity=await observer.lifecycle.identity();
    const connection=await main.call('connections.read',['first']);await main.call('connections.connect',['first',{expectedRevision:connection.revision}]);
    const added=await main.call('models.accounts.add',[{provider:'fixture-model'}]);
    const checked=await main.call('models.accounts.check',[added.id]);
    await main.call('models.accounts.preferences',[added.id,{expectedRevision:checked.revision,models:[{id:'fixture',enabled:true}]}]);
    const sourceChoice={modelAccountId:added.id,model:'fixture'};
    const start=async(text:string)=>{
      const chat:ConversationView=await main!.call('conversations.create',[scope,{}]);
      const draft={expectedRevision:chat.revision,connectionId:'first',...sourceChoice,text};
      const preview=await main!.call('conversations.prepareSend',[scope,chat.id,draft]);
      await main!.call('conversations.send',[scope,chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()}]);
      return await until(()=>observer!.operations.conversations.read(scope,chat.id),value=>value.run?.accepted===true);
    };
    let first=await start('hold:slow'),second=await start('hold:second'),approval=await start('approval');
    const failedRequest=randomUUID();
    fs.writeFileSync(path.join(packageRoot,'build/parallel-broken.mjs'),'throw new Error("parallel startup failure");\n');
    const broken=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/parallel-broken.mjs'});
    await observer.lifecycle.requestRuntime({expectedGeneration:firstIdentity.generation,runtime:broken});
    const failed=await until(()=>observer!.lifecycle.status(),value=>Boolean(value.diagnostic));
    assert.equal(failed.identity.generation,firstIdentity.generation);assert.equal(failed.pendingRuntime?.digest,broken.digest);assert.ok(isLive(firstIdentity.pid));
    first=await observer.operations.conversations.read(scope,first.id);
    first=await observer.operations.conversations.queueSend(scope,first.id,{expectedRevision:first.revision,connectionId:'first',...sourceChoice,text:'saved during failed update',clientRequestId:failedRequest,previousRunId:first.run!.id});
    assert.equal(first.run?.generation,firstIdentity.generation);assert.equal(first.pendingSend?.id,failedRequest);assert.equal(first.pendingSend?.state,'waiting');
    await observer.operations.conversations.cancelPendingSend(scope,first.id,{expectedPendingRevision:first.pendingSend!.revision});
    fs.writeFileSync(marker,JSON.stringify({version:'new'}));
    const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'});
    await observer.lifecycle.requestRuntime({expectedGeneration:firstIdentity.generation,runtime:next});
    const adopted=await until(()=>observer!.lifecycle.status(),value=>value.identity.runtime.digest===next.digest);
    assert.notEqual(adopted.identity.generation,firstIdentity.generation);
    const changed=readProcessInstances(dataRoot).find(record=>record.identity.generation===adopted.identity.generation)?.backendChange;
    assert.equal(changed?.reason,'runtime-content-changed');assert.equal(changed?.fromGeneration,firstIdentity.generation);assert.equal(changed?.fromDigest,runtime.digest);assert.equal(changed?.toDigest,next.digest);assert.ok(Number.isFinite(Date.parse(changed!.detectedAt)));
    assert.ok(isLive(firstIdentity.pid));assert.ok(fs.existsSync(runtime.entry));
    approval=await until(()=>main!.call('conversations.read',[scope,approval.id]),value=>value.requests.length===1);
    const activity=await observer.operations.conversations.listAll([scope],{activityState:'running'});
    assert.equal(activity.activityCounts.running,2);assert.equal(activity.activityCounts.waiting,1);assert.equal(activity.activityCounts.unknown,0);
    assert.deepEqual(activity.conversations.map(view=>view.id).sort(),[first.id,second.id].sort(),'retained live rounds remain in running counts and filters');
    await main.call('conversations.reply',[scope,approval.id,approval.requests[0]!.id,{expectedRevision:approval.revision,runId:approval.run!.id,participantId:approval.run!.participantId,generation:approval.run!.generation,answer:'allow'}]);
    await until(()=>observer!.operations.conversations.read(scope,approval.id),value=>value.run?.status==='completed');
    first=await main.call('conversations.read',[scope,first.id]);
    assert.equal(first.run?.generation,firstIdentity.generation);assert.equal(first.run?.status,'running');assert.ok(!first.run?.interrupted);
    const supplement=await observer.operations.conversations.supplement(scope,first.id,{runId:first.run!.id,participantId:first.run!.participantId,generation:first.run!.generation,clientRequestId:randomUUID(),text:'continue original execution'});
    assert.equal(supplement.delivery,'accepted');first=supplement.conversation;
    assert.equal(first.run?.generation,firstIdentity.generation);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataRoot,'native-inputs.jsonl'),'utf8').trim()),{text:'continue original execution',version:'old'},'new clients route supplementary input to the original runtime');
    const fresh=await start('new independent work');
    assert.equal(fresh.run?.generation,adopted.identity.generation);
    const aggregateStopId=randomUUID(),oldRunId=first.run!.id;
    first=await observer.operations.conversations.stopAll(scope,first.id,{expectedRevision:first.revision,clientRequestId:aggregateStopId});
    assert.equal(first.stopRequest?.id,aggregateStopId);assert.deepEqual(first.stopRequest?.runIds,[oldRunId]);
    assert.equal((await observer.operations.conversations.read(scope,second.id)).run?.status,'running','aggregate stop routes to the exact old owner and keeps its other conversation');
    first=await until(()=>observer!.operations.conversations.read(scope,first.id),value=>value.run?.status==='tools-active');
    assert.equal(first.run?.status,'tools-active');
    const original=first.run!;
    await main.close();main=undefined;
    const requestId=randomUUID(),draft={expectedRevision:first.revision,connectionId:'first',...sourceChoice,text:'queued original'};
    first=await observer.operations.conversations.queueSend(scope,first.id,{...draft,clientRequestId:requestId,previousRunId:first.run!.id});
    assert.equal(first.pendingSend?.state,'waiting');
    const queuedRevision=first.pendingSend!.revision;
    assert.equal((await observer.operations.conversations.queueSend(scope,first.id,{...draft,clientRequestId:requestId})).pendingSend?.id,requestId);
    await observer.disconnect();observer=undefined;
    observer=await connectAgentProcess({dataRoot,profileId,runtime:next,sourceId:'minimal'});
    first=await observer.operations.conversations.read(scope,first.id);assert.equal(first.pendingSend?.id,requestId);
    for(let attempt=0;;attempt++){
      first=await observer.operations.conversations.read(scope,first.id);
      assert.equal(first.pendingSend?.id,requestId);
      assert.equal(first.pendingSend?.draft.text,'queued original','a background reason update is not an edit');
      try{
        first=await observer.operations.conversations.queueSend(scope,first.id,{...draft,expectedRevision:first.revision,text:'queued revised',clientRequestId:requestId,expectedPendingRevision:first.pendingSend!.revision});
        break;
      }catch(error){
        // The no-host pump can update its reason after the observation. Retry
        // only an explicitly rejected edit, never an uncertain send.
        if(attempt>=2||!['agent_pending_conflict','agent_revision_conflict'].includes((error as {code?:string}).code??''))throw error;
      }
    }
    await assert.rejects(observer.operations.conversations.cancelPendingSend(scope,first.id,{expectedPendingRevision:queuedRevision}),{code:'agent_pending_conflict'});
    assert.equal(fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').split('\n').filter(line=>line.includes('queued')).length,0);
    main=await actor({dataRoot,profileId,runtime:next,workspace});
    await main.call('conversations.read',[scope,first.id]);
    // The retained old control cannot take the queued instruction, so the
    // saved draft is withdrawn and delivered through an explicit confirmed
    // send instead of opening a replacement session silently.
    first=await observer.operations.conversations.read(scope,first.id);
    // A no-host pump may update the saved instruction between the read and the
    // withdrawal. Re-read the documented conflict instead of failing the whole
    // handoff proof on a transient pending revision.
    for(let attempt=0;first.pendingSend;attempt++){
      try{
        // The withdrawal itself advances the conversation revision. Keep the
        // returned view so the following explicit send is prepared against the
        // observation it actually produced instead of the pre-cancel revision.
        first=await observer.operations.conversations.cancelPendingSend(scope,first.id,{expectedPendingRevision:first.pendingSend.revision});
        break;
      }catch(error){
        if(attempt>=2||!['agent_pending_conflict','agent_revision_conflict'].includes((error as {code?:string}).code??''))throw error;
        first=await main.call('conversations.read',[scope,first.id]);
      }
    }
    const confirmedRequestId=randomUUID();
    for(let attempt=0;;attempt++){
      const confirmed={expectedRevision:first.revision,connectionId:'first',...sourceChoice,text:'queued revised'};
      try{
        const confirmedPreview=await main.call('conversations.prepareSend',[scope,first.id,confirmed]);
        await main.call('conversations.send',[scope,first.id,{...confirmed,previewToken:confirmedPreview.token,clientRequestId:confirmedRequestId}]);
        break;
      }catch(error){
        // The no-host pump may advance the saved instruction between the read
        // and preview. Retry only an explicit optimistic-concurrency rejection;
        // the fixed request identity keeps the actual send idempotent.
        if(attempt>=2||!['agent_pending_conflict','agent_revision_conflict'].includes((error as {code?:string}).code??''))throw error;
        first=await main.call('conversations.read',[scope,first.id]);
      }
    }
    first=await until(()=>observer!.operations.conversations.read(scope,first.id),value=>value.run?.generation===adopted.identity.generation&&value.run?.status==='completed');
    const sent=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(sent.filter(value=>value.text==='queued revised').length,1,`queued revised sends: ${JSON.stringify(sent.filter(value=>value.text==='queued revised'))}`);
    assert.equal(sent.find(value=>value.text==='queued revised').version,'new');
    assert.equal(sent.filter(value=>value.text==='queued original').length,0,`queued original sends: ${JSON.stringify(sent.filter(value=>value.text==='queued original'))}`);
    assert.equal(first.retainedRuns?.find(run=>run.id===original.id)?.status,'tools-active','delivery must not wait for the old stop');
    fs.writeFileSync(path.join(dataRoot,'finish-stop'),'yes');
    // Withdrawing the saved instruction never replays it behind the explicit send.
    assert.equal((await observer.operations.conversations.lookupRequest(scope,first.id,requestId)).runId,undefined);
    second=await observer.operations.conversations.read(scope,second.id);
    assert.equal(second.run?.generation,firstIdentity.generation);assert.equal(second.run?.status,'running');assert.ok(isLive(firstIdentity.pid));
    second=await observer.operations.conversations.queueSend(scope,second.id,{expectedRevision:second.revision,connectionId:'first',...sourceChoice,text:'cancel this',clientRequestId:randomUUID(),previousRunId:second.run!.id});
    const cancelled=await observer.operations.conversations.cancelPendingSend(scope,second.id,{expectedPendingRevision:second.pendingSend!.revision});assert.ok(!cancelled.pendingSend);
    // A still-open old client must restart the latest adopted unit, not roll it
    // back to the binary that happened to create that client.
    const stale=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});
    try{
      process.kill(adopted.identity.pid,'SIGTERM');await until(async()=>!isLive(adopted.identity.pid),Boolean);
      const restarted=await until(()=>stale.lifecycle.status(),value=>value.identity.instanceId!==adopted.identity.instanceId);
      assert.equal(restarted.identity.runtime.digest,next.digest);
      await main.call('conversations.read',[scope,second.id]);
      assert.equal((await observer.operations.conversations.read(scope,second.id)).run?.generation,firstIdentity.generation);
    }finally{await stale.disconnect();}
    fs.writeFileSync(path.join(dataRoot,'release-second'),'yes');
    await until(()=>observer!.operations.conversations.read(scope,second.id),value=>value.run?.status==='completed');
    await until(async()=>!isLive(firstIdentity.pid),Boolean);
    assert.ok(fs.existsSync(runtime.directory),'the old host still executes the retained Node, even after its backend drains');
    await main.close(); main=undefined;
    const oldNode=fs.statSync(runtime.node,{throwIfNoEntry:false}),currentNode=fs.statSync(next.node);
    const sharedNode=oldNode?.dev===currentNode.dev&&oldNode?.ino===currentNode.ino;
    // The stable runner hard-links its immutable Node input across generations.
    // lsof then sees the live successor using the same underlying file: retain
    // ambiguous disk resources rather than weakening production cleanup proof.
    if(process.platform==='darwin'&&!sharedNode){
      try{await until(async()=>!fs.existsSync(runtime.directory),Boolean);}
      catch(error){
        const use=observeStorageUse();
        const candidate=retainedRuntimeCandidates(dataRoot,use,next,Date.now(),true).find(item=>item.path===runtime.directory);
        // Native release does not prove that unrelated system readers have
        // closed these files. Do not demand deletion contrary to storage safety.
        // The storage lifecycle test separately proves removal after release.
        assert.equal(use.complete,true,JSON.stringify({error:String(error),diagnostic:use.diagnostic}));
        assert.equal(candidate?.reason,'storage_in_use',JSON.stringify({error:String(error),candidate}));
        assert.ok(use.paths.some(file=>file.startsWith(runtime.directory+path.sep)));
        t.diagnostic('Drained runtime safely retained: system file observation still reports an open file.');
      }
    }
    else assert.ok(fs.existsSync(runtime.directory),'shared or incompletely observed runtime files stay protected');
    assert.ok(fs.existsSync(next.entry));assert.ok(fs.existsSync(path.join(dataRoot,'agent-service/conversations.sqlite')));
    assert.equal(fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').split('\n').filter(line=>line.includes('cancel this')).length,0);
  }});


test('a ready successor adopts the released native session after the old round ends',{timeout:60000},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-session-adoption-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');
 fs.mkdirSync(workspace);copyPackage(prepared,packageRoot);
 fs.copyFileSync(path.join(import.meta.dirname,'../../fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
 const marker=path.join(packageRoot,'build/fixture-version.json');fs.writeFileSync(marker,JSON.stringify({version:'old'}));
 const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='session-adoption',scope=executionScopeKey({sourceId:'minimal',id:'directory'});
 let main:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
 t.after(()=>cleanupProcessFixture({root,dataRoot,profileId,host:main,observer}));
 main=await actor({dataRoot,profileId,runtime,workspace});observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});
 const old=await observer.lifecycle.identity(),connection=await main.call('connections.read',['first']),executable=path.join(root,'dummy-native');
 fs.writeFileSync(executable,'// never executed');fs.chmodSync(executable,0o700);
 await main.call('connections.connect',['first',{expectedRevision:connection.revision,executable}]);
 const account=await main.call('models.accounts.add',[{provider:'fixture-model'}]),checked=await main.call('models.accounts.check',[account.id]);
 await main.call('models.accounts.preferences',[account.id,{expectedRevision:checked.revision,models:[{id:'fixture',enabled:true}]}]);
 const choice={connectionId:'first',modelAccountId:account.id,model:'fixture'};
 let chat:ConversationView=await main.call('conversations.create',[scope,{}]);
 const dispatch=async(text:string)=>{
  chat=await observer!.operations.conversations.read(scope,chat.id);
  const input={...choice,text,expectedRevision:chat.revision},preview=await observer!.operations.conversations.prepareSend(scope,chat.id,input);
  await observer!.operations.conversations.send(scope,chat.id,{...input,previewToken:preview.token,clientRequestId:randomUUID()});
  chat=await until(()=>observer!.operations.conversations.read(scope,chat.id),view=>view.run?.status==='completed');
 };
 await dispatch('first round');const contextId=chat.participants.at(-1)!.contextId;
 fs.writeFileSync(marker,JSON.stringify({version:'new'}));const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'});
 for(let attempt=0;;attempt++){
   try{await observer.lifecycle.requestRuntime({expectedGeneration:old.generation,runtime:next});break;}
   catch(error){
     // The old round is complete, but its exact process can still be releasing
     // ownership. Only the documented transient is retried; other errors stay.
     if((error as {code?:string}).code!=='agent_process_owned'||attempt>=19)throw error;
     await new Promise(resolve=>setTimeout(resolve,100));
   }
 }
 const adopted=await until(()=>observer!.lifecycle.status(),value=>value.identity.runtime.digest===next.digest);
 await until(async()=>!isLive(old.pid),Boolean);
 await main.call('conversations.read',[scope,chat.id]);
 await dispatch('second round');
 assert.equal(chat.participants.length,1);assert.equal(chat.participants[0].contextId,contextId);assert.equal(chat.run?.generation,adopted.identity.generation);
 const receipt=chat.entries.find(entry=>entry.nativeSession?.reason==='backend-adoption');
 assert.equal(receipt?.nativeSession?.from.generation,old.generation);assert.equal(receipt?.nativeSession?.to.contextId,contextId);assert.equal(receipt?.status,'accepted');
 const sent=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(sent.length,2);
});
