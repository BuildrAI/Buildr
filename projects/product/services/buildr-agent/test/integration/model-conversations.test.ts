import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAgentService} from '../../src/index.ts';
import type {AgentExecutor,ExecutorItem,ExecutorOpenOptions} from '../../src/contracts.ts';
import type {ModelOffering,ModelProvider} from '../../src/model-access/contracts.ts';

test('Codex Devin participants bind permission modes and hand off visible history without mixing native instructions',async()=>{
 for(const providerId of ['devin','fixture']){
  const root=mkdtempSync(join(tmpdir(),'buildr-permission-context-')),contexts=new Map<string,string>(),sent:Array<{context:string;mode:string;text:string}>=[];let execution='';
  const capabilities={text:true,images:false,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536,permissionModes:['default','full-access'] as Array<'default'|'full-access'>};
  const executor:AgentExecutor={descriptor:{id:'codex',label:'Codex',capabilities},async open(){return{bindingIdentity:'same-binding',capabilities,async inspectAccount(){return{status:'not-authenticated'};},async models(){return[];},async beginLogin(){},async cancelLogin(){},async createContext({permissionMode}){const id=randomUUID();contexts.set(id,permissionMode??'default');return{id};},async resumeContext({contextRef}){assert.ok(contexts.has(contextRef.id));},async readHistory(){return[];},async send(input){execution=input.clientRequestId;sent.push({context:input.contextRef.id,mode:input.permissionMode??'default',text:input.text});if(providerId==='devin')assert.equal(contexts.get(input.contextRef.id),input.permissionMode);input.onEvent({type:'accepted',executionRef:{id:execution}});input.onEvent({type:'item',item:{id:execution,kind:'message',role:'assistant',text:'confirmed '+input.permissionMode,status:'completed'}});input.onEvent({type:'completed',status:'completed'});},async observe(){return{status:'idle',executionRef:{id:execution},tools:[]};},async reply(){},async stop(){return{status:'stopped',tools:[]};},async close(){}};}};
  const provider:ModelProvider={id:providerId,label:'Plan',async open(){return{protocol:'chat-completions',async inspect(){return{status:'ready',models:[{id:'swe-2',label:'SWE-2',images:false,tools:true}]};},async beginLogin(){},async cancelLogin(){},async infer(){throw new Error('unused fixture inference');},async close(){}};}};
  const service=createAgentService({dataRoot:root,executors:[executor],modelProviders:[provider],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
  try{
   await service.connections.connect('codex',{expectedRevision:'unconfigured'});const added=await service.models.accounts.add({provider:providerId}),checked=await service.models.accounts.check(added.id);await service.models.accounts.preferences(added.id,{expectedRevision:checked.revision,models:[{id:'swe-2',enabled:true}]});const conversation=await service.conversations.create('workspace',{});
   for(const [index,permissionMode]of (['default','full-access','full-access','default'] as const).entries()){
    const view=service.conversations.read('workspace',conversation.id),draft={expectedRevision:view.revision,connectionId:'codex',modelAccountId:added.id,model:'swe-2',permissionMode,text:'explicit current request '+index};const preview=service.conversations.prepareSend('workspace',view.id,draft);
    if(index===1&&providerId==='devin'){assert.equal(preview.participantId,undefined);assert.ok(preview.history.some(entry=>entry.text==='explicit current request 0'));}
    service.conversations.send('workspace',view.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});for(let i=0;i<200&&service.conversations.read('workspace',view.id).run?.status!=='completed';i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(service.conversations.read('workspace',view.id).run?.status,'completed');
   }
   assert.equal(contexts.size,providerId==='devin'?2:1);assert.equal(sent[1].context,sent[2].context);assert.equal(sent[0].context,sent[3].context);if(providerId==='devin'){assert.notEqual(sent[0].context,sent[1].context);assert.ok(sent[1].text.includes('不新增授权'));}
  }finally{await service.close();rmSync(root,{recursive:true,force:true});}
 }
});

test('a prepared executor without its own model login uses the selected account, tools and isolated resumable contexts',async()=>{
  const root=mkdtempSync(join(tmpdir(),'buildr-shared-model-')),workspace=join(root,'workspace');mkdirSync(workspace);
  const calls:Array<{account:string;body:Record<string,any>}>=[],opens:ExecutorOpenOptions[]=[],contexts=new Map<string,ExecutorItem[]>(), executions=new Map<string,string>();
  const provider:ModelProvider={id:'fixture',label:'Fixture plan',async open({accountId}){return {protocol:'chat-completions',async inspect(){return {status:'ready',label:accountId,models:[{id:'same-model',label:'Shared model',images:false,tools:true}]};},async beginLogin(){},async cancelLogin(){},async infer(input){calls.push({account:accountId,body:input.body});const toolResult=(input.body.messages as any[])?.some(message=>message.role==='tool');return Response.json({id:'response',object:'chat.completion',model:input.modelId,choices:[{index:0,message:toolResult?{role:'assistant',content:'done'}:{role:'assistant',content:null,tool_calls:[{id:'tool-1',type:'function',function:{name:'read_fixture',arguments:'{}'}}]},finish_reason:toolResult?'stop':'tool_calls'}]});},async close(){}};}};
  const capabilities={text:true,images:false,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536};
  const executor:AgentExecutor={descriptor:{id:'local',label:'Local',capabilities},async open(input){opens.push(input);return {bindingIdentity:'binding:'+input.configRoot,capabilities,async inspectAccount(){return {status:'not-authenticated'};},async models(){return [];},async beginLogin(){},async cancelLogin(){},async createContext(){const id=randomUUID();contexts.set(id,[]);return {id};},async resumeContext({contextRef}){assert.ok(contexts.has(contextRef.id));},async readHistory({contextRef}){return contexts.get(contextRef.id)!;},async send(value){executions.set(value.contextRef.id,value.clientRequestId);assert.ok(input.gateway);value.onEvent({type:'accepted',executionRef:{id:value.clientRequestId}});const headers={Authorization:'Bearer '+input.gateway.apiKey,'Content-Type':'application/json'};const messages:any[]=[{role:'user',content:value.text}];const first=await fetch(input.gateway.baseUrl+'/chat/completions',{method:'POST',headers,body:JSON.stringify({model:value.model,messages,tools:[{type:'function',function:{name:'read_fixture',parameters:{type:'object'}}}]})});assert.equal(first.status,200);const tool=(await first.json()).choices[0].message;assert.equal(tool.tool_calls[0].id,'tool-1');messages.push(tool,{role:'tool',tool_call_id:'tool-1',content:'fixture result'});const second=await fetch(input.gateway.baseUrl+'/chat/completions',{method:'POST',headers,body:JSON.stringify({model:value.model,messages})});assert.equal(second.status,200);assert.equal((await second.json()).choices[0].message.content,'done');const item:ExecutorItem={id:value.clientRequestId,kind:'message',role:'assistant',text:'done',status:'completed'};contexts.get(value.contextRef.id)!.push(item);value.onEvent({type:'item',item});value.onEvent({type:'completed',status:'completed'});},async observe({contextRef}){return {status:'idle',executionRef:{id:executions.get(contextRef.id)!},tools:[]};},async reply(){},async stop(){return {status:'stopped',tools:[]};},async close(){}};}};
  const service=createAgentService({dataRoot:join(root,'profile'),executors:[executor],modelProviders:[provider],resolveWorkspace:()=>({rootPath:workspace}),assertTask(){}});
  try{
    const native=await service.connections.connect('local',{expectedRevision:'unconfigured'});assert.equal(native.status,'not-authenticated');
    const first=await service.models.accounts.add({provider:'fixture'}),second=await service.models.accounts.add({provider:'fixture'});
    for(const account of [first,second]){const checked=await service.models.accounts.check(account.id);await service.models.accounts.preferences(account.id,{expectedRevision:checked.revision,models:checked.models.map(model=>({id:model.id,enabled:true}))});}
    const conversation=await service.conversations.create('workspace',{});
    for(const account of [first,second,first]){
      const view=service.conversations.read('workspace',conversation.id);
      const input={expectedRevision:view.revision,connectionId:'local',modelAccountId:account.id,model:'same-model',text:'use selected plan'};
      const preview=service.conversations.prepareSend('workspace',view.id,input);assert.equal(preview.modelAccountId,account.id);
      const send={...input,previewToken:preview.token,clientRequestId:randomUUID()};service.conversations.send('workspace',view.id,send);
      for(let i=0;i<200;i++){const state=service.conversations.read('workspace',view.id);if(state.run?.status==='completed')break;if(state.run?.status==='failed'||state.run?.status==='unknown')assert.fail(state.run.diagnostic);await new Promise(resolve=>setTimeout(resolve,5));}
      assert.equal(service.conversations.read('workspace',view.id).run?.status,'completed');
      service.conversations.send('workspace',view.id,send);
    }
    assert.deepEqual(calls.map(call=>call.account),[first.id,first.id,second.id,second.id,first.id,first.id]);
    const final=service.conversations.read('workspace',conversation.id);assert.equal(final.participants.length,2);assert.equal(final.run?.modelAccountId,first.id);assert.equal(contexts.size,2);
    assert.equal(opens.filter(input=>input.gateway).length,2);assert.ok(opens.filter(input=>input.gateway).every(input=>input.configRoot.includes('model-bindings')));
    assert.equal(JSON.stringify(final).includes('apiKey'),false);
    const account=service.models.accounts.read(first.id);
    const adjusted=await service.models.accounts.preferences(first.id,{expectedRevision:account.revision,models:[{id:'same-model',contextWindow:128000}]});
    const current=service.conversations.read('workspace',conversation.id),next={expectedRevision:current.revision,connectionId:'local',modelAccountId:first.id,model:'same-model',text:'use adjusted context'};
    const preview=service.conversations.prepareSend('workspace',current.id,next);assert.equal(preview.participantId,undefined);
    service.conversations.send('workspace',current.id,{...next,previewToken:preview.token,clientRequestId:randomUUID()});
    for(let i=0;i<200&&service.conversations.read('workspace',current.id).run?.status!=='completed';i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(service.conversations.read('workspace',current.id).run?.status,'completed');assert.equal(contexts.size,3);assert.equal(opens.filter(input=>input.gateway).at(-1)!.gateway!.models[0].contextWindow,128000);
    await service.models.accounts.preferences(first.id,{expectedRevision:adjusted.revision,models:[{id:'same-model',enabled:false}]});
    assert.throws(()=>service.conversations.prepareSend('workspace',current.id,{...next,expectedRevision:service.conversations.read('workspace',current.id).revision}),/已停用/);
  }finally{await service.close();rmSync(root,{recursive:true,force:true});}
});

test('an unrelated account change does not invalidate a conversation using another account',async()=>{
  const root=mkdtempSync(join(tmpdir(),'buildr-account-isolation-'));mkdirSync(join(root,'workspace'));
  const models=new Map<string,ModelOffering[]>();const provider:ModelProvider={id:'fixture',label:'Fixture plan',async open({accountId}){return{protocol:'chat-completions',async inspect(){return{status:'ready' as const,models:structuredClone(models.get(accountId)??[{id:'source-model',label:'Shared model',images:false,tools:true}])};},async beginLogin(){},async cancelLogin(){},async infer(){return Response.json({});},async close(){}};}};
  const capabilities={text:true,images:false,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536};
  const executor:AgentExecutor={descriptor:{id:'local',label:'Local',capabilities},async open(){return{bindingIdentity:'binding',capabilities,async inspectAccount(){return{status:'not-authenticated'};},async models(){return[];},async beginLogin(){},async cancelLogin(){},async createContext(){return{id:randomUUID()};},async resumeContext(){},async readHistory(){return[];},async send(){},async observe(){return{status:'idle',tools:[]};},async reply(){},async stop(){return{status:'stopped',tools:[]};},async close(){}};}};
  const service=createAgentService({dataRoot:join(root,'profile'),executors:[executor],modelProviders:[provider],resolveWorkspace:()=>({rootPath:join(root,'workspace')}),assertTask(){}});
  try{
    await service.connections.connect('local',{expectedRevision:'unconfigured'});
    const first=await service.models.accounts.add({provider:'fixture'}),second=await service.models.accounts.add({provider:'fixture'});
    models.set(first.id,[{id:'source-model',label:'Shared model',images:false,tools:true}]);
    for(const account of [first,second]){const checked=await service.models.accounts.check(account.id);await service.models.accounts.preferences(account.id,{expectedRevision:checked.revision,models:[{id:'source-model',enabled:true}]});}
    const firstBefore=service.models.accounts.read(first.id),current=service.models.accounts.read(second.id),conversation=await service.conversations.create('workspace',{}),view=service.conversations.read('workspace',conversation.id);
    models.set(first.id,[{id:'source-model',label:'Shared model',images:false,tools:true},{id:'extra-model',label:'Extra',images:false,tools:true}]);
    await service.models.accounts.check(first.id);
    assert.notEqual(service.models.accounts.read(first.id).revision,current.revision,'the changed account rotates its own revision');
    assert.equal(service.models.accounts.read(second.id).revision,current.revision,'the selected account keeps its revision');
    const preview=service.conversations.prepareSend('workspace',view.id,{expectedRevision:view.revision,connectionId:'local',modelAccountId:second.id,modelAccountRevision:current.revision,model:'source-model',text:'continue with the unchanged account'});
    assert.equal(preview.modelAccountId,second.id);assert.equal(preview.modelAccountRevision,current.revision);
    const refreshed=service.conversations.read('workspace',conversation.id);
    const staleRevisionPreview=service.conversations.prepareSend('workspace',refreshed.id,{expectedRevision:refreshed.revision,connectionId:'local',modelAccountId:first.id,modelAccountRevision:firstBefore.revision,model:'source-model',text:'the selected model remains valid'});
    assert.equal(staleRevisionPreview.modelAccountId,first.id);assert.notEqual(staleRevisionPreview.modelAccountRevision,firstBefore.revision,'the preview adopts the current account observation');
  }finally{await service.close();rmSync(root,{recursive:true,force:true});}
});

test('the current executor rejects unverified Devin model-source combinations before execution',async()=>{
  const root=mkdtempSync(join(tmpdir(),'buildr-model-compatibility-')),workspace=join(root,'workspace');mkdirSync(workspace);
  const capabilities={text:true,images:false,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536,permissionModes:['default'] as Array<'default'>};
  const executor=(id:string):AgentExecutor=>({descriptor:{id,label:id,capabilities},async open(){return{bindingIdentity:id,capabilities,async inspectAccount(){return{status:'ready'};},async models(){return[];},async beginLogin(){},async cancelLogin(){},async createContext(){return{id:randomUUID()};},async resumeContext(){},async readHistory(){return[];},async send(){},async observe(){return{status:'idle',tools:[]};},async reply(){},async stop(){return{status:'stopped',tools:[]};},async close(){}};}});
  const provider:ModelProvider={id:'devin',label:'Devin',async open(){return{protocol:'chat-completions',async inspect(){return{status:'ready',identity:'devin-account',models:[{id:'swe-2',label:'SWE-2',images:false,tools:true},{id:'other-model',label:'Other',images:false,tools:true}]};},async beginLogin(){},async cancelLogin(){},async infer(){return Response.json({});},async close(){}};}};
  const service=createAgentService({dataRoot:join(root,'profile'),executors:['qoder','dsh','codex'].map(executor),modelProviders:[provider],resolveWorkspace:()=>({rootPath:workspace}),assertTask(){}});
  try{
    for(const id of ['qoder','dsh','codex'])await service.connections.connect(id,{expectedRevision:'unconfigured'});
    const added=await service.models.accounts.add({provider:'devin'}),checked=await service.models.accounts.check(added.id);
    await service.models.accounts.preferences(added.id,{expectedRevision:checked.revision,models:checked.models.map(model=>({id:model.id,enabled:true}))});
    const conversation=await service.conversations.create('workspace',{});
    const draft={expectedRevision:conversation.revision,modelAccountId:added.id,modelAccountIdentity:checked.identity,text:'compatibility probe',permissionMode:'default' as const};
    for(const [connectionId,model] of [['qoder','swe-2'],['codex','other-model']])assert.throws(()=>service.conversations.prepareSend('workspace',conversation.id,{...draft,connectionId,model}),/Devin 当前暂不兼容/);
    for(const [connectionId,model] of [['dsh','swe-2'],['dsh','other-model'],['codex','swe-2']])service.conversations.prepareSend('workspace',conversation.id,{...draft,connectionId,model});
  }finally{await service.close();rmSync(root,{recursive:true,force:true});}
});
