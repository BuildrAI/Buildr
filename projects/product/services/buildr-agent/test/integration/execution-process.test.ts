import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { connectAgentProcess, prepareAgentRuntime, stopAgentProcess, executionScopeKey } from '../../src/index.ts';
import type { AgentProcessConnection, AgentRuntimeUnit, ConversationView } from '../../src/index.ts';
import { canRunParallel } from '../../src/process/runtime-unit.ts';
import {readProcessInstances} from '../../src/process/ownership.ts';
import {request} from '../../src/process/transport.ts';

const prepared=path.resolve(import.meta.dirname,'../../../buildr/node_modules/@buildr-ai/buildr-agent');
const isLive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function until<T>(read:()=>Promise<T>,accept:(value:T)=>boolean):Promise<T>{let last:unknown;for(let n=0;n<200;n++){try{const value=await read();if(accept(value))return value;last=value;}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,50));}assert.fail('state did not settle: '+JSON.stringify(last));}
async function actor(options:{dataRoot:string;profileId:string;runtime:AgentRuntimeUnit;workspace:string}){
  const child=fork(path.join(import.meta.dirname,'fixtures/agent-host-process.mjs'),[path.join(options.runtime.directory,'build/index.js'),JSON.stringify(options)],{execPath:options.runtime.node,stdio:['ignore','pipe','pipe','ipc']});
  let output='';child.stderr?.on('data',value=>{output+=value;});
  const waiting=new Map<string,{resolve(value:any):void;reject(error:Error):void}>();
  let readyResolve:(value:any)=>void,readyReject:(error:Error)=>void;
  const ready=new Promise<any>((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  child.on('message',(message:any)=>{if(message.ready){readyResolve(message);return;}const pending=waiting.get(message.id);if(pending){waiting.delete(message.id);if(message.error)pending.reject(Object.assign(new Error(message.error.message),{code:message.error.code}));else pending.resolve(message.result);}});
  child.once('exit',()=>{readyReject(new Error('host exited: '+output));for(const pending of waiting.values())pending.reject(new Error('host exited: '+output));});
  const timer=setTimeout(()=>{child.kill('SIGTERM');readyReject(new Error('host start timeout: '+output));},20000);let info:any;try{info=await ready;}finally{clearTimeout(timer);}
  const call=(operation:string,args:unknown[]=[])=>new Promise<any>((resolve,reject)=>{const id=randomUUID();waiting.set(id,{resolve,reject});child.send({id,operation,args});});
  return{child,info,call,async close(){if(child.exitCode!==null||child.signalCode!==null)return;const exited=once(child,'exit');const id=randomUUID();child.send({id,action:'close'});await exited;}};
}

test('independent process survives real host exits, preserves approvals and hands off only when idle', {timeout:90000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-process-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work');fs.mkdirSync(workspace);
  const packageRoot=path.join(root,'package');fs.cpSync(prepared,packageRoot,{recursive:true});
  fs.copyFileSync(path.join(import.meta.dirname,'fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
  // Keep the original no-parallel handshake as a real first-upgrade regression.
  const contractsFile=path.join(packageRoot,'build/runtime-contracts.json');
  const contracts=JSON.parse(fs.readFileSync(contractsFile,'utf8'));delete contracts.parallelCompatibility;fs.writeFileSync(contractsFile,JSON.stringify(contracts));
  const marker=path.join(packageRoot,'build/fixture-version.json');fs.writeFileSync(marker,JSON.stringify({version:'one'}));
  const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='isolated-test';
  const options={dataRoot,profileId,runtime,workspace};
  let main:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
  const scope=executionScopeKey({sourceId:'minimal',id:'directory'});
  try{
    const outcomes=await Promise.allSettled([actor(options),actor(options)]);
    const initial=outcomes.flatMap(value=>value.status==='fulfilled'?[value.value]:[]);
    main=initial[0];const failure=outcomes.find(value=>value.status==='rejected');
    if(failure?.status==='rejected'){await initial[1]?.close();throw failure.reason;}
    assert.ok(main);const firstIdentity=main.info.identity;
    assert.equal(initial[1].info.identity.instanceId,firstIdentity.instanceId);await initial[1].close();
    const isolatedRoot=path.join(root,'other-profile');
    const isolatedRuntime=prepareAgentRuntime({dataRoot:isolatedRoot,packageRoot,entry:'build/process-fixture.mjs'});
    const isolated=await actor({...options,dataRoot:isolatedRoot,runtime:isolatedRuntime});
    try{assert.notEqual(isolated.info.identity.pid,firstIdentity.pid);}finally{await isolated.close();await stopAgentProcess({dataRoot:isolatedRoot,profileId});}
    observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});
    await assert.rejects(connectAgentProcess({dataRoot,profileId:'another-profile',runtime,sourceId:'minimal'}),{code:'agent_process_identity_mismatch'});
    const privateRecord=JSON.parse(fs.readFileSync(path.join(dataRoot,'agent-service/process/instance.json'),'utf8'));
    const unauthenticated=await fetch(privateRecord.origin+'/identity');assert.equal(unauthenticated.status,401);
    assert.ok(!(await unauthenticated.text()).includes(privateRecord.token));
    const draftId=randomUUID(),emptyDraft=await observer.operations.conversations.readDraft(scope,draftId);
    const staged=await observer.operations.conversations.addDraftImage(scope,draftId,{expectedRevision:emptyDraft.revision,name:'draft.png',mimeType:'image/png',bytes:Buffer.from([137,80,78,71,13,10,26,10])});
    assert.equal(staged.images.length,1);
    assert.deepEqual((await observer.operations.conversations.readDraftImage(scope,draftId,staged.images[0]!.id)).bytes,Buffer.from([137,80,78,71,13,10,26,10]));
    assert.equal((await observer.operations.conversations.removeDraftImage(scope,draftId,{expectedRevision:staged.revision,attachmentId:staged.images[0]!.id})).images.length,0);
    const frame=await observer.operations.conversations.addDraftImage(scope,draftId,{expectedRevision:(await observer.operations.conversations.readDraft(scope,draftId)).revision,name:'frame.png',mimeType:'image/png',bytes:Buffer.from([137,80,78,71,13,10,26,10]),frame:true});
    const recording=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
    const stagedVideo=await observer.operations.conversations.addDraftImage(scope,draftId,{expectedRevision:frame.revision,name:'recording.mp4',mimeType:'video/mp4',bytes:recording,video:{duration:2,frames:[{id:frame.images[0]!.id,time:0}]}});
    assert.equal(stagedVideo.images[0]!.frame,true);const stagedOriginal=stagedVideo.images.find(image=>image.video)!;assert.equal(stagedOriginal.video!.frames[0]!.id,frame.images[0]!.id);
    assert.deepEqual((await observer.operations.conversations.readDraftImage(scope,draftId,stagedOriginal.id)).bytes,recording);
    assert.deepEqual((await observer.operations.conversations.removeDraftImage(scope,draftId,{expectedRevision:stagedVideo.revision,attachmentId:stagedOriginal.id})).images,[]);
    const added=await observer.operations.models.accounts.add({provider:'fixture-model'});
    let account=await observer.operations.models.accounts.check(added.id);
    account=await observer.operations.models.accounts.preferences(account.id,{expectedRevision:account.revision,models:[{id:'fixture',enabled:true}]});
    const controller=new AbortController();
    const generating=observer.operations.models.generate({accountId:account.id,modelId:'fixture',expectedIdentity:account.identity,expectedRevision:account.revision,agentId:'commit-message',conversationId:'single-generation',runId:'single-generation',prompt:'bounded request',signal:controller.signal});
    const cancelled=assert.rejects(generating);
    await until(async()=>fs.existsSync(path.join(dataRoot,'model-started')),Boolean);
    assert.ok((await observer.lifecycle.status()).activity.busy);
    controller.abort();await cancelled;
    await until(async()=>fs.existsSync(path.join(dataRoot,'model-aborted')),Boolean);
    let read=await main.call('connections.read',['first']);await main.call('connections.connect',['first',{expectedRevision:read.revision}]);
    let view:ConversationView=await main.call('conversations.create',[scope,{}]);
    await assert.rejects(main.call('conversations.create',[scope,{undeclared:true}]),{code:'agent_process_input_invalid'});
    const png=Buffer.from('89504e470d0a1a0a','hex');
    const attachment=await observer.operations.conversations.addAttachment(scope,view.id,{expectedRevision:view.revision,mimeType:'image/png',bytes:png});
    assert.deepEqual((await observer.operations.conversations.readAttachment(scope,view.id,attachment.id)).bytes,png);
    const videoBytes=Buffer.alloc(13*1024*1024);Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex').copy(videoBytes);
    const video=await observer.operations.conversations.addAttachment(scope,view.id,{expectedRevision:attachment.revision,mimeType:'video/mp4',bytes:videoBytes,video:{duration:2,frames:[{id:attachment.id,time:0}]}});
    const videoRead=await observer.operations.conversations.readAttachment(scope,view.id,video.id);assert.equal(videoRead.mimeType,'video/mp4');assert.deepEqual(videoRead.bytes,videoBytes);

    view=await main.call('conversations.read',[scope,view.id]);
    const draft={expectedRevision:view.revision,connectionId:'first',text:'hold'},preview=await main.call('conversations.prepareSend',[scope,view.id,draft]),requestId=randomUUID();
    await main.call('conversations.send',[scope,view.id,{...draft,previewToken:preview.token,clientRequestId:requestId}]);
    view=await until(()=>observer!.operations.conversations.read(scope,view.id),value=>value.run?.accepted===true);
    const supplementary={runId:view.run!.id,participantId:view.run!.participantId,generation:view.run!.generation,clientRequestId:randomUUID(),text:'additional context'};
    const received=await observer.operations.conversations.supplement(scope,view.id,supplementary);assert.equal(received.delivery,'accepted');
    assert.equal((await observer.operations.conversations.supplement(scope,view.id,supplementary)).conversation.entries.filter(entry=>entry.text==='additional context').length,1);
    const runId=view.run!.id;await main.close();main=undefined;
    assert.equal((await observer.lifecycle.identity()).generation,firstIdentity.generation);
    assert.equal((await observer.operations.conversations.read(scope,view.id)).run?.id,runId);
    await assert.rejects(observer.operations.conversations.create(scope,{}),{code:'agent_host_unavailable'});
    main=await actor(options);assert.equal(main.info.identity.instanceId,firstIdentity.instanceId);
    fs.writeFileSync(path.join(dataRoot,'release'),'yes');
    view=await until(()=>observer!.operations.conversations.read(scope,view.id),value=>value.run?.status==='completed');
    assert.equal(fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').length,1);
    assert.equal((await observer.operations.conversations.lookupRequest(scope,view.id,requestId)).runId,runId);

    // An authorization handle belongs to the execution process, not to a host connection.
    view=await main.call('conversations.read',[scope,view.id]);
    const approval={expectedRevision:view.revision,connectionId:'first',text:'approval'},ap=await main.call('conversations.prepareSend',[scope,view.id,approval]);
    await main.call('conversations.send',[scope,view.id,{...approval,previewToken:ap.token,clientRequestId:randomUUID()}]);
    view=await until(()=>observer!.operations.conversations.read(scope,view.id),value=>value.requests.length===1);
    const permit=view.requests[0]!.id;await main.close();main=undefined;
    assert.equal((await observer.operations.conversations.read(scope,view.id)).requests[0]!.id,permit);

    fs.writeFileSync(marker,JSON.stringify({version:'two'}));
    const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'});
    assert.notEqual(next.digest,runtime.digest);assert.ok(fs.existsSync(runtime.entry));
    const pending=await observer.lifecycle.requestRuntime({expectedGeneration:firstIdentity.generation,runtime:next});
    assert.equal(pending.identity.instanceId,firstIdentity.instanceId);assert.ok(pending.activity.busy);
    main=await actor(options);
    view=await main.call('conversations.read',[scope,view.id]);const run=view.run!;
    await main.call('conversations.reply',[scope,view.id,permit,{expectedRevision:view.revision,runId:run.id,participantId:run.participantId,generation:run.generation,answer:'allow'}]);
    await until(()=>observer!.lifecycle.status(),value=>value.identity.runtime.digest===next.digest);
    const second=await observer.lifecycle.identity();assert.notEqual(second.instanceId,firstIdentity.instanceId);
    await main.close();main=undefined;await observer.disconnect();observer=undefined;
    main=await actor({...options,runtime:next});
    let secondConnection=await main.call('connections.read',['second']);await main.call('connections.connect',['second',{expectedRevision:secondConnection.revision}]);
    view=await main.call('conversations.read',[scope,view.id]);
    const handoff={expectedRevision:view.revision,connectionId:'second',text:'continue'},hp=await main.call('conversations.prepareHandoff',[scope,view.id,handoff]);assert.ok(hp.handoff);
    await main.call('conversations.send',[scope,view.id,{...handoff,previewToken:hp.token,clientRequestId:randomUUID()}]);
    await until(()=>main!.call('conversations.read',[scope,view.id]),value=>value.run?.status==='completed');
    await main.close();main=undefined;
    observer=await connectAgentProcess({dataRoot,profileId,runtime:next,sourceId:'minimal'});
    // A broken successor must leave the retained old unit and data usable.
    fs.writeFileSync(path.join(packageRoot,'build/broken.mjs'),'throw new Error("fixture startup failure");\n');
    const broken=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/broken.mjs'});
    await until(()=>observer!.lifecycle.status(),value=>!value.activity.busy);
    await observer.lifecycle.requestRuntime({expectedGeneration:second.generation,runtime:broken});
    const restored=await until(()=>observer!.lifecycle.status(),value=>value.identity.instanceId!==second.instanceId && value.identity.runtime.digest===next.digest && !!value.diagnostic);
    assert.equal(restored.pendingRuntime?.digest,broken.digest);
    assert.equal((await observer.operations.conversations.read(scope,view.id)).run?.status,'completed');
    // Interrupt the short-lived coordinator while the exact old owner drains.
    fs.writeFileSync(marker,JSON.stringify({version:'three'}));
    const afterInterruption=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'});
    fs.writeFileSync(path.join(dataRoot,'slow-close'),'yes');
    await observer.lifecycle.requestRuntime({expectedGeneration:restored.identity.generation,runtime:afterInterruption});
    const switching=await until(async()=>JSON.parse(fs.readFileSync(path.join(dataRoot,'agent-service/process/pending.json'),'utf8')),value=>value.state==='switching'&&!!value.coordinatorPid);
    process.kill(switching.coordinatorPid,'SIGTERM');
    await until(()=>observer!.lifecycle.status(),value=>value.identity.runtime.digest===afterInterruption.digest);
    assert.equal((await observer.operations.conversations.read(scope,view.id)).run?.status,'completed');
    const compatibility=path.join(packageRoot,'build/runtime-contracts.json'),original=fs.readFileSync(compatibility);
    fs.writeFileSync(compatibility,JSON.stringify({contracts:{},storageVersion:2}));
    assert.throws(()=>prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),{code:'agent_runtime_contract_incompatible'});
    fs.writeFileSync(compatibility,original);
    fs.writeFileSync(compatibility,JSON.stringify({...JSON.parse(original.toString()),storageVersion:1}));
    assert.throws(()=>prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),{code:'agent_storage_newer'});
    fs.writeFileSync(compatibility,original);
  }finally{
    if(main)await main.close().catch(()=>{main?.child.kill('SIGTERM');});await observer?.disconnect();
    await stopAgentProcess({dataRoot,profileId}).catch(()=>{});
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('parallel versions retain old controls, dispatch durable next instructions per conversation, and reap the drained runtime', {timeout:90000}, async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-parallel-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');
  fs.mkdirSync(workspace);fs.cpSync(prepared,packageRoot,{recursive:true});
  fs.copyFileSync(path.join(import.meta.dirname,'fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
  const marker=path.join(packageRoot,'build/fixture-version.json');fs.writeFileSync(marker,JSON.stringify({version:'old'}));
  const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='parallel-test',scope=executionScopeKey({sourceId:'minimal',id:'directory'});
  assert.equal(runtime.parallelCompatibility,2);
  assert.equal(canRunParallel(runtime,{...runtime,parallelCompatibility:1}),false,'old versions retain native writers and must drain before adopting this version');
  assert.equal(canRunParallel({...runtime,parallelCompatibility:1},runtime),false);
  assert.equal(canRunParallel(runtime,runtime),true);
  let main:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
  try{
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
    first=await observer.operations.conversations.queueSend(scope,first.id,{expectedRevision:first.revision,connectionId:'first',...sourceChoice,text:'saved during failed update',clientRequestId:failedRequest,previousRunId:first.run!.id});
    fs.writeFileSync(path.join(packageRoot,'build/parallel-broken.mjs'),'throw new Error("parallel startup failure");\n');
    const broken=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/parallel-broken.mjs'});
    await observer.lifecycle.requestRuntime({expectedGeneration:firstIdentity.generation,runtime:broken});
    const failed=await until(()=>observer!.lifecycle.status(),value=>Boolean(value.diagnostic));
    assert.equal(failed.identity.generation,firstIdentity.generation);assert.equal(failed.pendingRuntime?.digest,broken.digest);assert.ok(isLive(firstIdentity.pid));
    first=await observer.operations.conversations.read(scope,first.id);
    assert.equal(first.run?.generation,firstIdentity.generation);assert.equal(first.pendingSend?.id,failedRequest);assert.equal(first.pendingSend?.state,'waiting');
    await observer.operations.conversations.cancelPendingSend(scope,first.id,{expectedPendingRevision:first.pendingSend!.revision});
    fs.writeFileSync(marker,JSON.stringify({version:'new'}));
    const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'});
    await observer.lifecycle.requestRuntime({expectedGeneration:firstIdentity.generation,runtime:next});
    const adopted=await until(()=>observer!.lifecycle.status(),value=>value.identity.runtime.digest===next.digest);
    assert.notEqual(adopted.identity.generation,firstIdentity.generation);
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
    first=await observer.operations.conversations.stop(scope,first.id,{expectedRevision:first.revision,runId:first.run!.id,participantId:first.run!.participantId,generation:first.run!.generation});
    assert.equal(first.run?.status,'tools-active');
    const requestId=randomUUID(),draft={expectedRevision:first.revision,connectionId:'first',...sourceChoice,text:'queued original'};
    first=await observer.operations.conversations.queueSend(scope,first.id,{...draft,clientRequestId:requestId,previousRunId:first.run!.id});
    assert.equal(first.pendingSend?.state,'waiting');
    const queuedRevision=first.pendingSend!.revision;
    assert.equal((await observer.operations.conversations.queueSend(scope,first.id,{...draft,clientRequestId:requestId})).pendingSend?.id,requestId);
    await main.close();main=undefined;await observer.disconnect();observer=undefined;
    main=await actor({dataRoot,profileId,runtime:next,workspace});
    observer=await connectAgentProcess({dataRoot,profileId,runtime:next,sourceId:'minimal'});
    first=await main.call('conversations.read',[scope,first.id]);assert.equal(first.pendingSend?.id,requestId);
    first=await observer.operations.conversations.queueSend(scope,first.id,{...draft,expectedRevision:first.revision,text:'queued revised',clientRequestId:requestId,expectedPendingRevision:first.pendingSend!.revision});
    await assert.rejects(observer.operations.conversations.cancelPendingSend(scope,first.id,{expectedPendingRevision:queuedRevision}),{code:'agent_pending_conflict'});
    assert.equal(fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').split('\n').filter(line=>line.includes('queued')).length,0);
    fs.writeFileSync(path.join(dataRoot,'finish-stop'),'yes');
    first=await until(()=>observer!.operations.conversations.read(scope,first.id),value=>value.run?.generation===adopted.identity.generation&&value.run?.status==='completed'&&!value.pendingSend);
    const sent=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(sent.filter(value=>value.text==='queued revised').length,1);assert.equal(sent.find(value=>value.text==='queued revised').version,'new');
    assert.equal(sent.filter(value=>value.text==='queued original').length,0);
    // A response lost before the edit must not recreate its initial submission.
    await observer.operations.conversations.queueSend(scope,first.id,{...draft,clientRequestId:requestId});
    assert.equal((await observer.operations.conversations.lookupRequest(scope,first.id,requestId)).runId,first.run!.id);
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
    await until(async()=>!isLive(firstIdentity.pid)&&!fs.existsSync(runtime.directory),Boolean);
    assert.ok(fs.existsSync(next.entry));assert.ok(fs.existsSync(path.join(dataRoot,'agent-service/conversations.sqlite')));
    assert.equal(fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').split('\n').filter(line=>line.includes('cancel this')).length,0);
  }finally{
    if(main)await main.close().catch(()=>main?.child.kill('SIGTERM'));
    await observer?.disconnect();await stopAgentProcess({dataRoot,profileId}).catch(()=>{});
    fs.rmSync(root,{recursive:true,force:true});
  }
});


for(const legacy of [false,true])test('observe releases a durably finished old round and dispatches its queue once without stopping another round; legacy='+legacy, {timeout:90000}, async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-observe-release-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');
  fs.mkdirSync(workspace);fs.cpSync(prepared,packageRoot,{recursive:true});
  fs.copyFileSync(path.join(import.meta.dirname,'fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
  const marker=path.join(packageRoot,'build/fixture-version.json');fs.writeFileSync(marker,JSON.stringify({version:'old'}));
  const serverFile=path.join(packageRoot,'build/process/server.js'),serverCode=fs.readFileSync(serverFile,'utf8');
  if(legacy){assert.ok(serverCode.includes('if (input.observe === true)'));fs.writeFileSync(serverFile,serverCode.replace('if (input.observe === true)','if (false && input.observe === true)'));}
  const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='observe-test',scope=executionScopeKey({sourceId:'minimal',id:'directory'});
  let main:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
  try{
    main=await actor({dataRoot,profileId,runtime,workspace});observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});
    const old=await observer.lifecycle.identity();let c=await main.call('connections.read',['first']);await main.call('connections.connect',['first',{expectedRevision:c.revision}]);
    const account=await main.call('models.accounts.add',[{provider:'fixture-model'}]),checked=await main.call('models.accounts.check',[account.id]);
    await main.call('models.accounts.preferences',[account.id,{expectedRevision:checked.revision,models:[{id:'fixture',enabled:true}]}]);
    const choice={connectionId:'first',modelAccountId:account.id,model:'fixture'};
    const start=async(text:string)=>{const chat:ConversationView=await main!.call('conversations.create',[scope,{}]);const draft={...choice,text,expectedRevision:chat.revision};const preview=await main!.call('conversations.prepareSend',[scope,chat.id,draft]);await main!.call('conversations.send',[scope,chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()}]);return await until(()=>observer!.operations.conversations.read(scope,chat.id),v=>v.run?.accepted===true);};
    let target=await start('lost-observation'),other=await start('hold:other');target=await until(()=>observer!.operations.conversations.read(scope,target.id),v=>v.run?.status==='unknown');
    const originalRun=target.run!.id,requestId=randomUUID();
    await observer.operations.conversations.queueSend(scope,target.id,{...choice,text:'continue saved work',expectedRevision:target.revision,clientRequestId:requestId,previousRunId:originalRun});
    fs.writeFileSync(serverFile,serverCode);fs.writeFileSync(marker,JSON.stringify({version:'new'}));const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'});
    await observer.lifecycle.requestRuntime({expectedGeneration:old.generation,runtime:next});const adopted=await until(()=>observer!.lifecycle.status(),v=>v.identity.runtime.digest===next.digest);
    await main.call('conversations.read',[scope,target.id]); // Attach the live host to the adopted unit.
    const retained=readProcessInstances(dataRoot).find(v=>v.identity.generation===old.generation)!;
    if(legacy){const state=await request(retained.origin,retained.token,'/conversation-state',{sourceId:'minimal',scope,id:target.id,observe:true,runId:originalRun,generation:old.generation});assert.equal(state.observed,undefined);assert.equal(state.busy,true);}
    else await assert.rejects(request(retained.origin,retained.token,'/conversation-state',{sourceId:'minimal',scope,id:target.id,observe:true,runId:originalRun,generation:'wrong-generation'}),{code:'agent_control_stale'});
    await observer.operations.conversations.observe(scope,target.id);
    assert.equal(fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').includes('continue saved work'),false,'unknown original cannot be replayed');
    // The fixture native store is authoritative; finish the exact request without an event.
    const walk=(dir:string):string[]=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
    const filename=walk(path.join(dataRoot,'agent-service','connections')).find(file=>{try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v.kind==='lost-observation'&&v.executionRef;}catch{return false;}});assert.ok(filename);
    const native=JSON.parse(fs.readFileSync(filename,'utf8'));native.status='idle';native.items.push({id:'finished-answer',kind:'message',role:'assistant',text:'original result retained',executionId:native.executionRef.id,status:'completed'});fs.writeFileSync(filename,JSON.stringify(native));
    await observer.operations.conversations.observe(scope,target.id);
    target=await until(()=>observer!.operations.conversations.read(scope,target.id),v=>v.run?.generation===adopted.identity.generation&&v.run?.status==='completed'&&!v.pendingSend);
    await Promise.all([observer.operations.conversations.observe(scope,target.id),observer.operations.conversations.observe(scope,target.id)]);
    assert.ok(target.entries.some(e=>e.text==='original result retained'));
    const sent=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(sent.filter(v=>v.text==='continue saved work').length,1);assert.equal(sent.find(v=>v.text==='continue saved work').version,'new');
    other=await observer.operations.conversations.read(scope,other.id);assert.equal(other.run?.status,'running');assert.equal(other.run?.generation,old.generation);assert.ok(isLive(old.pid));
    fs.writeFileSync(path.join(dataRoot,'release-other'),'yes');await until(()=>observer!.operations.conversations.read(scope,other.id),v=>v.run?.status==='completed');
  }finally{fs.writeFileSync(path.join(dataRoot,'release-other'),'yes');await main?.close();await observer?.disconnect();await stopAgentProcess({dataRoot,profileId,mode:'stop-owned'}).catch(()=>{});fs.rmSync(root,{recursive:true,force:true});}
});
