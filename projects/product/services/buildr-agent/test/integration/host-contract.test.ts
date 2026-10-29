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
  let available=true,wrong=false,revision='one';
  const host:AgentHostCapabilities={
    async resolveExecutionScope({ref}) {if(!available)throw new AgentServiceError('agent_host_unavailable','authority unavailable',503);return{ref:wrong?{...ref,id:'other'}:ref,revision,rootPath:ref.sourceId==='alpha'?a:b};},
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
    revision='two';view=service.conversations.read(alpha,created.id);
    const staleDraft={expectedRevision:view.revision,connectionId:'second',text:'must revalidate'},stalePreview=service.conversations.prepareSend(alpha,view.id,staleDraft);
    service.conversations.send(alpha,view.id,{...staleDraft,previewToken:stalePreview.token,clientRequestId:randomUUID()});
    await settled(()=>service.conversations.read(alpha,view.id).run?.status==='failed');assert.equal(sends.length,2);revision='one';
    available=false;assert.equal(service.conversations.read(alpha,created.id).run?.status,'failed');
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
