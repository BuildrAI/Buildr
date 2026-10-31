import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { executionScopeKey } from '../../../../src/index.ts';
import type { AgentProcessConnection, ConversationView } from '../../../../src/index.ts';
import { readProcessInstances } from '../../../../src/process/ownership.ts';
import { request } from '../../../../src/process/transport.ts';
import { isLive, until, actor, prepareAgentRuntime, connectAgentProcess, copyPackage, prepared, cleanupProcessFixture } from '../../../support/process-fixture.ts';

for(const legacy of [false,true])test('observe releases a durably finished old round and dispatches its queue once without stopping another round; legacy='+legacy, {timeout:90000}, async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-observe-release-')),dataRoot=path.join(root,'profile'),workspace=path.join(root,'work'),packageRoot=path.join(root,'package');
  fs.mkdirSync(workspace);copyPackage(prepared,packageRoot);
  fs.copyFileSync(path.join(import.meta.dirname,'../../fixtures/agent-process-entry.mjs'),path.join(packageRoot,'build/process-fixture.mjs'));
  const marker=path.join(packageRoot,'build/fixture-version.json');fs.writeFileSync(marker,JSON.stringify({version:'old'}));
  const serverFile=path.join(packageRoot,'build/process/server.js'),serverCode=fs.readFileSync(serverFile,'utf8');
  if(legacy){assert.ok(serverCode.includes('if (input.observe === true)'));fs.writeFileSync(serverFile,serverCode.replace('if (input.observe === true)','if (false && input.observe === true)'));}
  const runtime=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'}),profileId='observe-test',scope=executionScopeKey({sourceId:'minimal',id:'directory'});
  let main:Awaited<ReturnType<typeof actor>>|undefined,observer:AgentProcessConnection|undefined;
  t.after(() => cleanupProcessFixture({root,dataRoot,profileId,host:main,observer:observer}));
  {
    main=await actor({dataRoot,profileId,runtime,workspace});observer=await connectAgentProcess({dataRoot,profileId,runtime,sourceId:'minimal'});
    const old=await observer.lifecycle.identity();let c=await main.call('connections.read',['first']);await main.call('connections.connect',['first',{expectedRevision:c.revision}]);
    const account=await main.call('models.accounts.add',[{provider:'fixture-model'}]),checked=await main.call('models.accounts.check',[account.id]);
    await main.call('models.accounts.preferences',[account.id,{expectedRevision:checked.revision,models:[{id:'fixture',enabled:true}]}]);
    const choice={connectionId:'first',modelAccountId:account.id,model:'fixture'};
    const start=async(text:string)=>{const chat:ConversationView=await main!.call('conversations.create',[scope,{}]);const draft={...choice,text,expectedRevision:chat.revision};const preview=await main!.call('conversations.prepareSend',[scope,chat.id,draft]);await main!.call('conversations.send',[scope,chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()}]);return await until(()=>observer!.operations.conversations.read(scope,chat.id),v=>v.run?.accepted===true);};
    let target=await start('lost-observation'),other=await start('hold:other');target=await until(()=>observer!.operations.conversations.read(scope,target.id),v=>v.run?.status==='unknown');
    const originalRun=target.run!.id,requestId=randomUUID();
    fs.writeFileSync(serverFile,serverCode);fs.writeFileSync(marker,JSON.stringify({version:'new'}));const next=prepareAgentRuntime({dataRoot,packageRoot,entry:'build/process-fixture.mjs'});
    await observer.lifecycle.requestRuntime({expectedGeneration:old.generation,runtime:next});const adopted=await until(()=>observer!.lifecycle.status(),v=>v.identity.runtime.digest===next.digest);
    await observer.operations.conversations.queueSend(scope,target.id,{...choice,text:'continue saved work',expectedRevision:target.revision,clientRequestId:requestId,previousRunId:originalRun});
    await main.call('conversations.read',[scope,target.id]); // Attach the live host to the adopted unit.
    const retained=readProcessInstances(dataRoot).find(v=>v.identity.generation===old.generation)!;
    if(legacy){const state=await request(retained.origin,retained.token,'/conversation-state',{sourceId:'minimal',scope,id:target.id,observe:true,runId:originalRun,generation:old.generation});assert.equal(state.observed,undefined);assert.equal(state.busy,true);}
    else await assert.rejects(request(retained.origin,retained.token,'/conversation-state',{sourceId:'minimal',scope,id:target.id,observe:true,runId:originalRun,generation:'wrong-generation'}),{code:'agent_control_stale'});
    target=await until(()=>observer!.operations.conversations.read(scope,target.id),v=>v.run?.generation===adopted.identity.generation&&v.run?.status==='completed'&&!v.pendingSend);
    assert.equal(target.retainedRuns?.find(run=>run.id===originalRun)?.status,'unknown','the new instruction does not resolve or replay the old operation');
    // The fixture native store is authoritative; finish the exact request without an event.
    const walk=(dir:string):string[]=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
    const filename=walk(path.join(dataRoot,'agent-service','connections')).find(file=>{try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v.kind==='lost-observation'&&v.executionRef;}catch{return false;}});assert.ok(filename);
    const native=JSON.parse(fs.readFileSync(filename,'utf8'));native.status='idle';native.items.push({id:'finished-answer',kind:'message',role:'assistant',text:'original result retained',executionId:native.executionRef.id,status:'completed'});fs.writeFileSync(filename,JSON.stringify(native));
    const retainedRun=target.retainedRuns!.find(run=>run.id===originalRun)!;
    await observer.operations.conversations.observeRun(scope,target.id,{expectedRevision:target.revision,runId:retainedRun.id,participantId:retainedRun.participantId,generation:retainedRun.generation});
    target=await until(()=>observer!.operations.conversations.read(scope,target.id),v=>v.run?.generation===adopted.identity.generation&&v.run?.status==='completed'&&!v.pendingSend);
    await Promise.all([observer.operations.conversations.observe(scope,target.id),observer.operations.conversations.observe(scope,target.id)]);
    assert.ok(target.entries.some(e=>e.text==='original result retained'));
    const sent=fs.readFileSync(path.join(dataRoot,'native-sends.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));assert.equal(sent.filter(v=>v.text==='continue saved work').length,1);assert.equal(sent.find(v=>v.text==='continue saved work').version,'new');
    other=await observer.operations.conversations.read(scope,other.id);assert.equal(other.run?.status,'running');assert.equal(other.run?.generation,old.generation);assert.ok(isLive(old.pid));
    fs.writeFileSync(path.join(dataRoot,'release-other'),'yes');await until(()=>observer!.operations.conversations.read(scope,other.id),v=>v.run?.status==='completed');
  }});
