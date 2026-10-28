import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import type { AgentExecutor, ExecutorOpenOptions } from '../../src/contracts.ts';
import type { ModelProvider } from '../../src/model-access/contracts.ts';

test('only Qoder consuming its own linked account gets a native model route, with resumable source-bound contexts', async () => {
  const root = await mkdtemp(join(tmpdir(),'buildr-native-qoder-conversation-'));
  const opens: ExecutorOpenOptions[] = [], sent: Array<{context:string;model?:string;mode?:string}> = [], contexts = new Map<string,string>();
  const capabilities = {text:true,images:false,approval:false,questions:false,stop:true,resume:true,maxInputBytes:65536,permissionModes:['default','full-access'] as const};
  const executors: AgentExecutor[] = ['qoder','codex'].map(id=>({descriptor:{id,label:id,capabilities:{...capabilities,permissionModes:[...capabilities.permissionModes]}},async open(options) {
    opens.push(options);let execution='';
    return {bindingIdentity:options.gateway?.identity??id,capabilities:{...capabilities,permissionModes:[...capabilities.permissionModes]},
      inspectAccount:async()=>({status:'ready'}),models:async()=>[{id:'qmodel_38max',label:'Qwen3.8-Max'}],beginLogin:async()=>{},cancelLogin:async()=>{},
      async createContext(){const ref={id:randomUUID()};contexts.set(ref.id,options.gateway?.identity??id);return ref;},
      async resumeContext({contextRef}){assert.equal(contexts.get(contextRef.id),options.gateway?.identity??id);},readHistory:async()=>[],
      async send(input){execution=input.clientRequestId;sent.push({context:input.contextRef.id,model:input.model,mode:input.permissionMode});input.onEvent({type:'accepted',executionRef:{id:execution}});input.onEvent({type:'completed',status:'completed'});},
      observe:async()=>({status:'idle',tools:[],executionRef:{id:execution}}),reply:async()=>{},stop:async()=>({status:'stopped',tools:[]}),close:async()=>{},
    };
  }}));
  const provider = (id:string,connectionId?:string): ModelProvider => ({id,label:id,connectionId,async open(){return {protocol:'chat-completions',inspect:async()=>({status:'ready',identity:id+':user',models:[{id:'qmodel_38max',label:'Qwen3.8-Max',tools:true,images:false,contextWindow:500000}]}),beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>{throw new Error('no paid inference in this test');},close:async()=>{}};}});
  const service = createAgentService({dataRoot:root,executors,modelProviders:[provider('native-qoder','qoder'),provider('external')],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
  try {
    for(const id of ['qoder','codex'])await service.connections.connect(id,{expectedRevision:'unconfigured'});
    await service.models.catalog.list({refresh:true});
    const external = await service.models.accounts.add({provider:'external'});
    for(const id of ['native-qoder',external.id]){const account=await service.models.accounts.check(id);await service.models.accounts.preferences(id,{expectedRevision:account.revision,models:[{id:'qmodel_38max',enabled:true}]});}
    const send = async (connectionId:string,accountId:string,id:string,permissionMode:'default'|'full-access') => {
      const view=service.conversations.read('workspace',id),draft={expectedRevision:view.revision,connectionId,modelAccountId:accountId,model:'qmodel_38max',text:'continue exact model',permissionMode};
      const preview=service.conversations.prepareSend('workspace',id,draft);
      service.conversations.send('workspace',id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
      for(let i=0;i<200&&!['completed','failed','unknown'].includes(service.conversations.read('workspace',id).run?.status??'');i++)await new Promise(resolve=>setTimeout(resolve,5));
      const result=service.conversations.read('workspace',id);assert.equal(result.run?.status,'completed',result.run?.diagnostic);assert.equal(result.run?.model,'qmodel_38max');
    };
    const native=await service.conversations.create('workspace',{title:'原生来源回归'});
    await send('qoder','native-qoder',native.id,'full-access');await send('qoder','native-qoder',native.id,'default');
    assert.equal(sent[0].context,sent[1].context);assert.deepEqual(sent.slice(0,2).map(input=>input.mode),['full-access','default']);
    const shared=await service.conversations.create('workspace',{title:'跨执行方来源回归'});await send('codex','native-qoder',shared.id,'default');
    const foreign=await service.conversations.create('workspace',{title:'外部来源回归'});await send('qoder',external.id,foreign.id,'default');
    const bound=opens.filter(input=>input.gateway);assert.equal(bound.length,3);
    assert.deepEqual(bound[0].gateway!.nativeModel,{provider:'qoder',id:'qmodel_38max',accountIdentity:service.models.accounts.read('native-qoder').identity});
    assert.equal(bound[1].gateway!.nativeModel,undefined);assert.equal(bound[2].gateway!.nativeModel,undefined);
    assert.ok(sent.every(input=>input.model?.startsWith('buildr-')),'public model names remain separate from leased execution routes');
  } finally {await service.close();await rm(root,{recursive:true,force:true});}
});
