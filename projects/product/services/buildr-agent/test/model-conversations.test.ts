import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createAgentService} from '../src/index.ts';
import type {AgentExecutor,ExecutorItem,ExecutorOpenOptions} from '../src/contracts.ts';
import type {ModelProvider} from '../src/model-access/contracts.ts';

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
    await service.models.accounts.check(first.id);await service.models.accounts.check(second.id);
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
  }finally{await service.close();rmSync(root,{recursive:true,force:true});}
});
