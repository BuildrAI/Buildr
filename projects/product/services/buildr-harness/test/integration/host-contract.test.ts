import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAgentService, executionScopeKey, AgentServiceError } from '../../src/index.ts';
import type { AgentExecutor, AgentHostCapabilities, ExecutorSendInput } from '../../src/index.ts';

function executor(id: string, sends: ExecutorSendInput[], hold = false): AgentExecutor {
  const capabilities = { text:true,images:false,approval:false,questions:false,stop:true,resume:true,maxInputBytes:65536 };
  return { descriptor:{id,label:id,capabilities}, async open({configRoot}) {
    let executionRef:{id:string}|undefined;
    let stopped = false, release: (()=>void)|undefined;
    return { bindingIdentity:id+configRoot,capabilities,
      inspectAccount:async()=>({status:'ready' as const}),models:async()=>[{id:'fixture',label:'fixture'}],beginLogin:async()=>{},cancelLogin:async()=>{},
      createContext:async()=>({id:randomUUID()}),resumeContext:async()=>{},readHistory:async()=>[],
      async send(input) { sends.push(input);executionRef={id:randomUUID()};input.onEvent({type:'accepted',executionRef});if(hold)await new Promise<void>(resolve=>{release=resolve;});input.onEvent({type:'item',item:{id:randomUUID(),kind:'message',role:'assistant',text:'finished',status:'completed'}});input.onEvent({type:'completed',status:stopped?'stopped':'completed'}); },
      observe:async()=>({status:stopped?'stopped' as const:'idle' as const,tools:[],executionRef}),reply:async()=>{},stop:async()=>{stopped=true;release?.();return{status:'stopped' as const,tools:[],executionRef};},close:async()=>{release?.();},
    };
  } };
}
async function settled(read:()=>boolean) { for(let n=0;n<200;n++){if(read())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('state did not settle'); }

test('a host with no Buildr business modules supports separate sources, handoff and unavailable authority',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-host-contract-')),a=path.join(root,'a'),b=path.join(root,'b');fs.mkdirSync(a);fs.mkdirSync(b);
  let available=true,wrong=false,moved=false,revision='one';
  const host:AgentHostCapabilities={
    async resolveExecutionScope({ref}) {if(!available)throw new AgentServiceError('agent_host_unavailable','authority unavailable',503);return{ref:wrong?{...ref,id:'other'}:ref,revision,rootPath:moved?b:ref.sourceId==='alpha'?a:b};},
    async verifyWorkObject({ref}) {return{ref,revision:'one'};},
    async listExecutionScopes({sourceId}) {return{refs:[{sourceId,id:'same-id'}],revision:'one'};},
  };
  const sends:ExecutorSendInput[]=[],service=createAgentService({dataRoot:path.join(root,'profile'),host,executors:[executor('first',sends),executor('second',sends)],modelProviders:[]});
  try {
    const alpha=executionScopeKey({sourceId:'alpha',id:'same-id'}),beta=executionScopeKey({sourceId:'beta',id:'same-id'});
    const created=await service.conversations.create(alpha,{}),other=await service.conversations.create(beta,{});
    assert.equal(created.cwd,fs.realpathSync(a));assert.equal(other.cwd,fs.realpathSync(b));assert.notEqual(created.workspaceId,other.workspaceId);
    assert.throws(()=>service.conversations.read(beta,created.id),{code:'agent_conversation_missing'});
    for(const id of ['first','second'])await service.connections.connect(id,{expectedRevision:service.connections.read(id).revision});
    let view=created;
    for(const connectionId of ['first','second']) {
      view=service.conversations.read(alpha,created.id);
      const draft={expectedRevision:view.revision,connectionId,text:'continue my goal'},preview=await service.conversations.prepareHandoff(alpha,view.id,draft);
      service.conversations.send(alpha,view.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
      try { await settled(()=>service.conversations.read(alpha,view.id).run?.status==='completed'); } catch { assert.fail(JSON.stringify(service.conversations.read(alpha,view.id))); }
    }
    assert.equal(sends.length,2);assert.match(sends[1]!.text,/continue my goal/);
    // The observation version also carries environment facts that legitimately change across a
    // restart. The same scope continues and records the newer version instead of refusing work.
    revision='two';view=service.conversations.read(alpha,created.id);
    const driftDraft={expectedRevision:view.revision,connectionId:'second',text:'continue after restart'},driftPreview=service.conversations.prepareSend(alpha,view.id,driftDraft);
    service.conversations.send(alpha,view.id,{...driftDraft,previewToken:driftPreview.token,clientRequestId:randomUUID()});
    await settled(()=>service.conversations.read(alpha,view.id).run?.status==='completed');assert.equal(sends.length,3);
    // A different location for the same scope stays fatal: stored history is not silently re-bound.
    moved=true;view=service.conversations.read(alpha,created.id);
    const movedDraft={expectedRevision:view.revision,connectionId:'second',text:'must not run after move'},movedPreview=service.conversations.prepareSend(alpha,view.id,movedDraft);
    service.conversations.send(alpha,view.id,{...movedDraft,previewToken:movedPreview.token,clientRequestId:randomUUID()});
    await settled(()=>service.conversations.read(alpha,view.id).run?.status==='failed');assert.equal(sends.length,3);
    moved=false;revision='one';available=false;
    await assert.rejects(service.conversations.create(alpha,{}),{code:'agent_host_unavailable'});
    available=true;wrong=true;await assert.rejects(service.conversations.create(alpha,{}),{code:'agent_scope_binding_changed'});
  }finally{await service.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('authority loss after native acceptance does not cancel work or block its exact stop',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-host-loss-'));let available=true;
  const host:AgentHostCapabilities={resolveExecutionScope:async({ref})=>{if(!available)throw new AgentServiceError('agent_host_unavailable','offline',503);return{ref,rootPath:root,revision:'one'};},verifyWorkObject:async({ref})=>({ref,revision:'one'}),listExecutionScopes:async()=>({refs:[],revision:'one'})};
  const sends:ExecutorSendInput[]=[],service=createAgentService({dataRoot:path.join(root,'profile'),host,executors:[executor('held',sends,true)],modelProviders:[]});
  const scope=executionScopeKey({sourceId:'minimal',id:'directory'});
  try{
    await service.connections.connect('held',{expectedRevision:service.connections.read('held').revision});
    const view=await service.conversations.create(scope,{}),draft={expectedRevision:view.revision,connectionId:'held',text:'hold'},preview=service.conversations.prepareSend(scope,view.id,draft),clientRequestId=randomUUID();
    service.conversations.send(scope,view.id,{...draft,previewToken:preview.token,clientRequestId});
    await settled(()=>service.conversations.read(scope,view.id).run?.accepted===true);available=false;
    const current=service.conversations.read(scope,view.id),run=current.run!;
    assert.equal(service.conversations.lookupRequest(scope,view.id,clientRequestId).accepted,true);
    await service.conversations.stop(scope,view.id,{expectedRevision:current.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
    await settled(()=>service.conversations.read(scope,view.id).run?.status==='stopped');assert.equal(sends.length,1);
  }finally{await service.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('participation records only admitted sends, preserves policy context lineage, and optional source failure cannot fail work',async t=>{
 const {instructionParticipation}=await import('../../src/domain/participation.ts');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'participation-host-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sends:ExecutorSendInput[]=[],base=executor('fixture',sends),policy=instructionParticipation('fixture-policy','exact configured text');
 const adapter:AgentExecutor={...base,async open(options){return {...await base.open(options),participationInstruction:policy};}};
 let observeCalls=0;
 const host:AgentHostCapabilities={resolveExecutionScope:async({ref})=>({ref,rootPath:root,revision:'binding'}),verifyWorkObject:async({ref})=>({ref,revision:'one'}),listExecutionScopes:async({sourceId})=>({refs:[{sourceId,id:'scope'}],revision:'one'}),async observeParticipation(){observeCalls++;if(observeCalls===1)throw new Error('offline');return {version:1,coverage:'partial',gaps:['implicit-consumption-unavailable'],sources:[{identity:'buildr:skill:fixture',name:'fixture',kind:'skill',providedBy:'buildr',status:'confirmed',offeredVersion:'v1'}]};}};
 const service=createAgentService({dataRoot:path.join(root,'data'),host,executors:[adapter],modelProviders:[]});t.after(()=>service.close());
 const scope=executionScopeKey({sourceId:'fixture',id:'scope'});const chat=await service.conversations.create(scope,{});
 await service.connections.connect('fixture',{expectedRevision:service.connections.read('fixture').revision});
 const prepare=async()=>{const view=service.conversations.read(scope,chat.id),draft={expectedRevision:view.revision,connectionId:'fixture',text:'unchanged user text'};return {draft,preview:await service.conversations.prepareHandoff(scope,chat.id,draft)};};
 const first=await prepare();assert.equal(sends.length,0);assert.equal(observeCalls,0);
 service.conversations.send(scope,chat.id,{...first.draft,previewToken:first.preview.token,clientRequestId:randomUUID()});
 await settled(()=>service.conversations.read(scope,chat.id).run?.status==='completed');const firstRun=service.conversations.read(scope,chat.id).run!.id;
 const firstFacts=service.conversations.participation(scope,chat.id,{runId:firstRun});assert.equal(firstFacts.contextConfiguration,'new');assert.equal(firstFacts.items.filter(item=>item.identity===policy.identity).length,1);assert.equal(sends.length,1);assert.equal(sends[0]!.text,'unchanged user text');
 const second=await prepare();service.conversations.send(scope,chat.id,{...second.draft,previewToken:second.preview.token,clientRequestId:randomUUID()});
 await settled(()=>service.conversations.read(scope,chat.id).run?.status==='completed'&&service.conversations.read(scope,chat.id).run?.id!==firstRun);
 const secondRun=service.conversations.read(scope,chat.id).run!.id;await settled(()=>service.conversations.participation(scope,chat.id,{runId:secondRun}).items.some(item=>item.action==='available'));
 const facts=service.conversations.participation(scope,chat.id,{runId:secondRun});assert.equal(facts.contextConfiguration,'inherited');assert.equal(facts.items.filter(item=>item.identity===policy.identity).length,0);assert.equal(sends.length,2);
});

test('a later unmeasured legacy tool update invalidates earlier metrics without losing the private original revision',async t=>{
 const {nativeParticipation}=await import('../../src/domain/participation.ts');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'participation-legacy-update-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let emit:ExecutorSendInput['onEvent']|undefined;const executionRef={id:'native-fixture'};const base=executor('fixture',[]);
 const adapter:AgentExecutor={...base,async open(options){return {...await base.open(options),async send(input){emit=input.onEvent;input.onEvent({type:'accepted',executionRef});input.onEvent({type:'item',item:{id:'t',kind:'tool',role:'system',name:'command',input:'buildr task list',text:'first output',status:'completed',executionId:executionRef.id,participation:nativeParticipation('buildr task list','first output','unknown')}});input.onEvent({type:'completed',status:'completed'});},observe:async()=>({status:'idle' as const,tools:[],executionRef})};}};
 const service=createAgentService({dataRoot:path.join(root,'data'),executors:[adapter],resolveWorkspace:()=>({rootPath:root}),assertTask(){},modelProviders:[]});t.after(()=>service.close());
 const chat=await service.conversations.create('scope',{});await service.connections.connect('fixture',{expectedRevision:service.connections.read('fixture').revision});
 const draft={expectedRevision:chat.revision,connectionId:'fixture',text:'fixture'},preview=await service.conversations.prepareHandoff('scope',chat.id,draft);service.conversations.send('scope',chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});await settled(()=>service.conversations.read('scope',chat.id).run?.status==='completed');
 const runId=service.conversations.read('scope',chat.id).run!.id;
 assert.equal(service.conversations.participation('scope',chat.id,{runId}).items.filter(item=>item.action==='requested').length,1);
 emit!({type:'item',item:{id:'t',kind:'tool',role:'system',text:'later native text without measurement',status:'completed',executionId:executionRef.id}});
 const result=service.conversations.participation('scope',chat.id,{runId});assert.ok(result.gaps.includes('tool-observation-stale'));assert.equal(result.items.filter(item=>item.action==='requested').length,0);
 assert.equal(service.conversations.read('scope',chat.id).entries.find(entry=>entry.kind==='tool')?.text,'later native text without measurement');
});
