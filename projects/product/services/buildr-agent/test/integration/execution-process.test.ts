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

const prepared=path.resolve(import.meta.dirname,'../../../buildr/node_modules/@buildr-ai/buildr-agent');
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
    view=await main.call('conversations.read',[scope,view.id]);
    const draft={expectedRevision:view.revision,connectionId:'first',text:'hold'},preview=await main.call('conversations.prepareSend',[scope,view.id,draft]),requestId=randomUUID();
    await main.call('conversations.send',[scope,view.id,{...draft,previewToken:preview.token,clientRequestId:requestId}]);
    view=await until(()=>observer!.operations.conversations.read(scope,view.id),value=>value.run?.accepted===true);
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
