import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import type { AgentExecutor, AgentRuntime, ContextRef, ExecutorItem } from '../../src/contracts.ts';
import { dispatchOperation } from '../../src/process/operations.ts';
import type { ModelProvider } from '../../src/model-access/contracts.ts';

function fixture(settings: { remap?: boolean; failFork?: boolean; modelBacked?: boolean; beforeCreated?: () => Promise<void> } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-forks-'));
  const contexts = new Map<string, ExecutorItem[]>(), titles: string[] = [];
  let forks = 0, sends = 0, closes = 0, accountId: string | undefined, release: (() => void) | undefined, hold = false;
  const capabilities = { text:true, images:true, approval:true, questions:true, stop:true, resume:true, maxInputBytes:100_000 };
  const executor: AgentExecutor = { descriptor:{id:'local',label:'Local',capabilities}, async open() {
    const runtime: AgentRuntime = {
      bindingIdentity:'local-test', capabilities,
      async inspectAccount(){return {status:'ready'};}, async models(){return [{id:'model',label:'Model'}];},
      async beginLogin(){}, async cancelLogin(){},
      async createContext(){const ref={id:randomUUID()};contexts.set(ref.id,[]);return ref;},
      async resumeContext({contextRef}){assert.ok(contexts.has(contextRef.id));},
      async readHistory({contextRef}){return structuredClone(contexts.get(contextRef.id)!);},
      async forkContext(input){
        forks++;
        const history = contexts.get(input.contextRef.id)!;
        const boundary = history.findLastIndex(item => item.executionId === input.executionRef.id);
        const ref={id:randomUUID()};contexts.set(ref.id,structuredClone(history.slice(0,boundary+1)).map(item => ({...item,id:settings.remap?randomUUID():item.id})));
        await settings.beforeCreated?.();
        input.onCreated(ref);
        if(settings.failFork)throw new Error('test fork interrupted');
        return ref;
      },
      async send(input){
        sends++;
        const id=randomUUID(), items=contexts.get(input.contextRef.id)!;
        input.onEvent({type:'accepted',executionRef:{id},inputItemId:input.clientRequestId});
        items.push({id:input.clientRequestId,kind:'message',role:'user',text:input.text,executionId:id,status:'completed'});
        if(hold)await new Promise<void>(resolve=>{release=resolve;});
        const item:ExecutorItem={id:randomUUID(),kind:'message',role:'assistant',text:'回答：'+input.text,executionId:id,status:'completed'};
        items.push(item);input.onEvent({type:'item',item});
        input.onEvent({type:'title',title:'不应继承的旧主题'});
        input.onEvent({type:'completed',status:'completed'});
      },
      async generateTitle(input){titles.push(input.description);return '新方向标题';},
      async readTitle(){return '不应继承的旧主题';},
      async observe({executionRef}){return {status:'idle',executionRef,tools:[]};},
      async reply(){},async stop(){release?.();return {status:'stopped',tools:[]};},async close(){closes++;release?.();},
    };
    return runtime;
  }};
  const provider: ModelProvider = {id:'fixture',label:'Fixture',async open(){return {
    protocol:'chat-completions',async inspect(){return {status:'ready',identity:'fixture-account',models:[{id:'model',label:'Model',images:true,tools:true}]};},
    async beginLogin(){},async cancelLogin(){},
    async infer(){throw new Error('no remote model request expected');},async close(){},
  };}};
  const options={dataRoot:path.join(root,'data'),executors:[executor],modelProviders:settings.modelBacked?[provider]:[],resolveWorkspace(){return {rootPath:root};}};
  let service=createAgentService(options);
  const read=(id:string)=>service.conversations.read('workspace',id);
  const settle=async(id:string)=>{
    for(let i=0;i<300;i++){const view=read(id);if(view.run?.status==='completed'&&view.titleState?.status!=='generating')return view;await new Promise(resolve=>setTimeout(resolve,2));}
    assert.fail('conversation did not settle: '+JSON.stringify(read(id)));
  };
  const send=async(id:string,text:string,attachmentIds?:string[])=>{
    const draft={expectedRevision:read(id).revision,connectionId:'local',text,attachmentIds,...(accountId?{modelAccountId:accountId,model:'model'}:{})};
    const preview=service.conversations.prepareSend('workspace',id,draft);
    service.conversations.send('workspace',id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
    return await settle(id);
  };
  return { root,contexts,titles,options,read,send,settle,get service(){return service;},get forks(){return forks;},get sends(){return sends;},get closes(){return closes;},
    async start(){
      await service.connections.connect('local',{expectedRevision:service.connections.read('local').revision});
      if(settings.modelBacked){const account=await service.models.accounts.add({provider:'fixture'}),checked=await service.models.accounts.check(account.id,{expectedRevision:account.revision});await service.models.accounts.preferences(account.id,{expectedRevision:checked.revision,models:[{id:'model',enabled:true}]});accountId=account.id;}
      return await service.conversations.create('workspace',{});
    },
    hold(){hold=true;},release(){hold=false;release?.();},
    async restart(){await service.close();service=createAgentService(options);},
    async close(){await service.close();fs.rmSync(root,{recursive:true,force:true});},
  };
}

test('fork cuts the native history, preserves immutable provenance and media, resumes independently after restart',async()=>{
  const f=fixture({remap:true});
  try{
    const original=await f.start();
    const image=f.service.conversations.addAttachment('workspace',original.id,{expectedRevision:original.revision,mimeType:'image/png',bytes:Buffer.from('89504e470d0a1a0a01020304','hex')});
    const first=await f.send(original.id,'旧主题第一轮',[image.id]), answer=first.entries.findLast(item=>item.role==='assistant')!;
    await f.send(original.id,'不应带入的后续内容');
    const before=f.read(original.id), input={expectedRevision:before.revision,entryId:answer.id,clientRequestId:randomUUID()};
    const child=await dispatchOperation(f.service,'conversations.fork',['workspace',original.id,input]) as ReturnType<typeof f.read>;
    assert.notEqual(child.id,original.id);assert.equal(child.run,undefined);assert.equal(child.requests.length,0);assert.equal(child.title,'新对话');
    assert.deepEqual(child.forkedFrom,{conversationId:original.id,workspaceId:'workspace',entryId:answer.id,runId:answer.runId,throughSequence:first.entries.at(-1)!.sequence,title:before.title,forkedAt:child.forkedFrom!.forkedAt});
    assert.equal(child.forkState?.status,'ready');assert.ok(!JSON.stringify(child.entries).includes('不应带入'));
    assert.equal(f.read(original.id).revision,before.revision);assert.equal(f.forks,1);
    const repeated=await f.service.conversations.fork('workspace',original.id,input);assert.equal(repeated.id,child.id);assert.equal(f.forks,1);
    assert.equal(f.service.conversations.readAttachment('workspace',child.id,image.id).bytes.toString('hex'),'89504e470d0a1a0a01020304');
    await f.restart();
    assert.deepEqual(f.read(child.id).forkedFrom,child.forkedFrom);
    await f.service.connections.check('local',{expectedRevision:f.service.connections.read('local').revision});
    const continued=await f.send(child.id,'全新的分支方向');
    assert.equal(continued.entries.filter(item=>item.role==='user').length,2);
    assert.equal(continued.entries.filter(item=>item.role==='assistant').length,2);
    assert.equal(continued.title,'新方向标题');
    assert.ok(f.titles.at(-1)?.includes('全新的分支方向'));assert.ok(!f.titles.at(-1)?.includes('旧主题'));
    const renamed=await f.service.conversations.update('workspace',original.id,{expectedRevision:f.read(original.id).revision,title:'后来改名',hidden:true});
    assert.equal(renamed.title,'后来改名');assert.equal(f.read(child.id).forkedFrom?.title,before.title);
    const grandchild=await f.service.conversations.fork('workspace',child.id,{expectedRevision:continued.revision,entryId:answer.id,clientRequestId:randomUUID()});
    assert.equal(grandchild.forkedFrom?.conversationId,child.id);assert.equal(grandchild.entries.length,first.entries.length);
  }finally{await f.close();}
});

test('an active later round does not prevent forking a settled earlier reply; stale and nonfinal boundaries reject',async()=>{
  const f=fixture();
  try{
    const original=await f.start(), first=await f.send(original.id,'first'), answer=first.entries.findLast(item=>item.role==='assistant')!;
    await assert.rejects(f.service.conversations.fork('workspace',original.id,{expectedRevision:'stale',entryId:answer.id,clientRequestId:randomUUID()}),/变化/);
    await assert.rejects(f.service.conversations.fork('workspace',original.id,{expectedRevision:first.revision,entryId:first.entries[0].id,clientRequestId:randomUUID()}),/最后一条/);
    f.hold();
    const draft={expectedRevision:first.revision,connectionId:'local',text:'running'};
    const preview=f.service.conversations.prepareSend('workspace',original.id,draft);
    f.service.conversations.send('workspace',original.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
    // Let the original native send start before reading the observed revision.
    await new Promise(resolve=>setTimeout(resolve,10));
    const active=f.read(original.id);assert.equal(active.run?.status,'running');
    const child=await f.service.conversations.fork('workspace',original.id,{expectedRevision:active.revision,entryId:answer.id,clientRequestId:randomUUID()});
    assert.equal(child.forkedFrom?.runId,answer.runId);assert.equal(f.read(original.id).run?.status,'running');
    f.release();await f.settle(original.id);
  }finally{await f.close();}
});

test('partial native success is retained and the same request cannot create another branch or send work',async()=>{
  const f=fixture({failFork:true});
  try{
    const original=await f.start(), first=await f.send(original.id,'source');
    const input={expectedRevision:first.revision,entryId:first.entries.findLast(item=>item.role==='assistant')!.id,clientRequestId:randomUUID()};
    await assert.rejects(f.service.conversations.fork('workspace',original.id,input),/分叉未完成/);
    const children=f.service.conversations.list('workspace').conversations.filter(view=>view.forkedFrom?.conversationId===original.id);
    assert.equal(children.length,1);assert.equal(children[0].forkState?.status,'failed');assert.ok(children[0].participants.at(-1)?.contextId);
    await assert.rejects(f.service.conversations.fork('workspace',original.id,input),/分叉未完成/);assert.equal(f.forks,1);
    assert.throws(()=>f.service.conversations.prepareSend('workspace',children[0].id,{expectedRevision:children[0].revision,connectionId:'local',text:'unsafe'}),/尚未完成/);
    assert.equal(f.sends,1);
  }finally{await f.close();}
});

test('concurrent submissions share one reserved branch and preserve a manual rename while native creation settles',async()=>{
  let started!:()=>void,release!:()=>void;
  const creating=new Promise<void>(resolve=>{started=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const f=fixture({beforeCreated:async()=>{started();await gate;}});
  try{
    const original=await f.start(),source=await f.send(original.id,'original');
    const input={expectedRevision:source.revision,entryId:source.entries.findLast(item=>item.role==='assistant')!.id,clientRequestId:randomUUID()};
    const pending=f.service.conversations.fork('workspace',original.id,input);await creating;
    await assert.rejects(f.service.conversations.fork('workspace',original.id,input),/仍在创建/);
    const candidate=f.service.conversations.list('workspace').conversations.find(view=>view.forkedFrom?.conversationId===original.id)!;
    await f.service.conversations.update('workspace',candidate.id,{expectedRevision:candidate.revision,title:'我的分支名称'});
    release();const child=await pending;
    assert.equal(child.title,'我的分支名称');assert.equal(child.titleState?.status,'manual');assert.equal(child.forkState?.status,'ready');
    assert.equal(f.forks,1);assert.ok(child.participants.at(-1)?.contextId);
    assert.equal((await f.send(child.id,'new direction')).title,'我的分支名称');
  }finally{release();await f.close();}
});

test('an unused model-backed fork releases its idle private process and later resumes the same native context',async()=>{
  const f=fixture({modelBacked:true});
  try{
    const original=await f.start(),source=await f.send(original.id,'source');
    const child=await f.service.conversations.fork('workspace',original.id,{expectedRevision:source.revision,entryId:source.entries.findLast(item=>item.role==='assistant')!.id,clientRequestId:randomUUID()});
    const native=child.participants.at(-1)!.contextId,closed=f.closes;
    await f.service.releaseIdleSources({workspaceId:'workspace',id:child.id});
    assert.equal(f.closes,closed+1);assert.equal(f.read(child.id).run,undefined);
    const continued=await f.send(child.id,'new branch instruction');
    assert.equal(continued.run?.status,'completed');
    assert.equal(continued.participants.at(-1)!.contextId,native);
    assert.equal(continued.entries.filter(item=>item.role==='user').length,2);
    assert.equal(f.read(original.id).revision,source.revision);
  }finally{await f.close();}
});
