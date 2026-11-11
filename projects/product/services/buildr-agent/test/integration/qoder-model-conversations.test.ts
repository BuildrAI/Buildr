import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import type { AgentExecutor, ExecutorOpenOptions } from '../../src/contracts.ts';
import type { ModelProvider } from '../../src/model-access/contracts.ts';

for (const programStatus of ['not-authenticated', 'expired'] as const) test(`Qoder CN uses its independent model login despite stale program status: ${programStatus}`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-cn-account-route-'));
  const accountRoot = join(root, 'agent-service/model-access/accounts/native-qoder-cn');
  const opens: ExecutorOpenOptions[] = [];
  const capabilities = { text: true, images: false, approval: false, questions: false, stop: true, resume: false, maxInputBytes: 65536 };
  let accountReady = true, accepted = 0;
  const executor: AgentExecutor = { descriptor: { id: 'qoder-cn', label: 'Qoder CN', capabilities }, async open(options) {
    opens.push(options);
    let execution = '';
    return {
      bindingIdentity: 'cn-fixture', capabilities,
      inspectAccount: async () => ({ status: programStatus }), models: async () => [],
      beginLogin: async () => {}, cancelLogin: async () => {},
      async createContext() {
        // Native admission reads the same account-owned config, never a copy
        // under connections/. A cached model observation cannot replace it.
        assert.equal(options.nativeAccountConfigRoot, accountRoot);
        assert.equal(await readFile(join(options.nativeAccountConfigRoot!, 'qoder-cn-config/.auth/user'), 'utf8'), 'fixture-login');
        return { id: randomUUID() };
      },
      resumeContext: async () => {}, readHistory: async () => [],
      async send(input) {
        accepted++;
        execution = input.clientRequestId;
        input.onEvent({ type: 'accepted', executionRef: { id: input.clientRequestId } });
        input.onEvent({ type: 'completed', status: 'completed' });
      },
      observe: async () => ({ status: 'idle', tools: [], executionRef: { id: execution } }), reply: async () => {}, stop: async () => ({ status: 'stopped', tools: [] }), close: async () => {},
    };
  }};
  const provider: ModelProvider = { id: 'native-qoder-cn', label: 'Qoder CN', linked: true, async open(input) {
    assert.equal(input.configRoot, accountRoot);
    return { protocol: 'chat-completions',
      inspect: async () => ({ status: accountReady ? 'ready' : 'not-authenticated', identity: 'cn-user', models: accountReady ? [{ id: 'qwen', label: 'Qwen', tools: true, images: false }] : [] }),
      beginLogin: async () => {}, cancelLogin: async () => {}, infer: async () => { throw new Error('no paid inference'); }, close: async () => {},
    };
  }};
  const service = createAgentService({ dataRoot: root, executors: [executor], modelProviders: [provider], resolveWorkspace: () => ({ rootPath: root }), assertTask() {} });
  try {
    await mkdir(join(accountRoot, 'qoder-cn-config/.auth'), { recursive: true });
    await writeFile(join(accountRoot, 'qoder-cn-config/.auth/user'), 'fixture-login');
    await service.models.catalog.list({ refresh: true });
    const account = await service.models.accounts.check('native-qoder-cn');
    await service.models.accounts.preferences(account.id, { expectedRevision: account.revision, models: [{ id: 'qwen', enabled: true }] });
    // Login happened before program preparation, just like the reported failure.
    const prepareProgram = { expectedRevision: 'unconfigured', programOnly: true };
    await service.connections.connect('qoder-cn', prepareProgram);
    assert.equal(service.models.accounts.read(account.id).status, 'ready');
    await service.connections.check('qoder-cn');
    assert.equal(service.models.accounts.read(account.id).status, 'ready');
    const chat = await service.conversations.create('workspace', {});
    const draft = { expectedRevision: chat.revision, connectionId: 'qoder-cn', modelAccountId: account.id, model: 'qwen', text: 'account route regression' };
    const preview = service.conversations.prepareSend('workspace', chat.id, draft);
    service.conversations.send('workspace', chat.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
    for (let i = 0; i < 200 && !['completed', 'failed'].includes(service.conversations.read('workspace', chat.id).run?.status ?? ''); i++) await new Promise(resolve => setTimeout(resolve, 5));
    const result = service.conversations.read('workspace', chat.id);
    assert.equal(result.run?.status, 'completed', result.run?.diagnostic);
    assert.equal(accepted, 1);
    assert.ok(opens.length > 0);
    assert.ok(opens.some(options => options.gateway));
    assert.ok(opens.filter(options => options.gateway).every(options => options.nativeAccountConfigRoot === accountRoot));
    assert.ok(opens.filter(options => !options.gateway).every(options => options.nativeAccountConfigRoot === undefined), 'keep existing program bindings unchanged');
    const connection = service.connections.read('qoder-cn');
    await service.connections.disconnect('qoder-cn', { expectedRevision: connection.revision });
    assert.equal(service.models.accounts.read(account.id).status, 'ready', 'disconnecting a program must not revoke its independent model account');
    const disabledChat = await service.conversations.create('workspace', {});
    assert.throws(() => service.conversations.prepareSend('workspace', disabledChat.id, { ...draft, expectedRevision: disabledChat.revision }), /准备智能体程序/);
    await service.connections.connect('qoder-cn', { ...prepareProgram, expectedRevision: service.connections.read('qoder-cn').revision });
    accountReady = false;
    await service.models.accounts.check(account.id);
    const missingChat = await service.conversations.create('workspace', {});
    assert.throws(() => service.conversations.prepareSend('workspace', missingChat.id, { ...draft, expectedRevision: missingChat.revision }), /登录|套餐尚未连接/);
    assert.equal(accepted, 1, 'a genuinely missing login must not dispatch');
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('failed source initialization releases its owner so the same conversation can retry',async()=>{
 const root=await mkdtemp(join(tmpdir(),'buildr-source-owner-'));let failOpen=true,execution='';
 const capabilities={text:true,images:false,approval:false,questions:false,stop:true,resume:true,maxInputBytes:65536};
 const executor:AgentExecutor={descriptor:{id:'codex',label:'Codex',capabilities},async open(options){
  if(options.gateway&&failOpen)throw new Error('fixture source runtime unavailable');
  return{bindingIdentity:'fixture',capabilities,inspectAccount:async()=>({status:'ready'}),models:async()=>[{id:'fixture',label:'Fixture'}],beginLogin:async()=>{},cancelLogin:async()=>{},createContext:async()=>({id:randomUUID()}),resumeContext:async()=>{},readHistory:async()=>[],send:async input=>{execution=input.clientRequestId;input.onEvent({type:'accepted',executionRef:{id:execution}});input.onEvent({type:'completed',status:'completed'});},observe:async()=>({status:'idle',tools:[],executionRef:{id:execution}}),reply:async()=>{},stop:async()=>({status:'stopped',tools:[]}),close:async()=>{}};
 }};
 const provider:ModelProvider={id:'fixture',label:'Fixture',async open(){return{protocol:'chat-completions',inspect:async()=>({status:'ready',models:[{id:'fixture',label:'Fixture',images:false,tools:false}]}),beginLogin:async()=>{},cancelLogin:async()=>{},infer:async()=>{throw new Error('no paid calls');},close:async()=>{}};}};
 const service=createAgentService({dataRoot:root,executors:[executor],modelProviders:[provider],resolveWorkspace:()=>({rootPath:root}),assertTask(){}});
 try{
  await service.connections.connect('codex',{expectedRevision:'unconfigured'});const added=await service.models.accounts.add({provider:'fixture'}),account=await service.models.accounts.check(added.id);await service.models.accounts.preferences(account.id,{expectedRevision:account.revision,models:[{id:'fixture',enabled:true}]});
  const chat=await service.conversations.create('workspace',{}),draft={expectedRevision:chat.revision,connectionId:'codex',modelAccountId:account.id,model:'fixture',text:'original goal'},preview=service.conversations.prepareSend('workspace',chat.id,draft);service.conversations.send('workspace',chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
  let current=service.conversations.read('workspace',chat.id);for(let n=0;n<200&&current.run?.status!=='failed';n++){await new Promise(resolve=>setTimeout(resolve,5));current=service.conversations.read('workspace',chat.id);}assert.equal(current.run?.status,'failed');assert.equal(service.retainsConversationSource('workspace',chat.id),false);
  failOpen=false;const retry={...draft,text:'',expectedRevision:current.revision,continueRunId:current.run!.id},next=service.conversations.prepareSend('workspace',chat.id,retry);service.conversations.send('workspace',chat.id,{...retry,previewToken:next.token,clientRequestId:randomUUID()});
  for(let n=0;n<200&&service.conversations.read('workspace',chat.id).run?.status!=='completed';n++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(service.conversations.read('workspace',chat.id).run?.status,'completed');
 }finally{await service.close();await rm(root,{recursive:true,force:true});}
});

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
    const foreign=await service.conversations.create('workspace',{title:'外部来源回归'});
    const foreignDraft={expectedRevision:foreign.revision,connectionId:'qoder',modelAccountId:external.id,model:'qmodel_38max',text:'external source must be refused',permissionMode:'default' as const};
    assert.throws(()=>service.conversations.prepareSend('workspace',foreign.id,foreignDraft),error=>{
      const value=error as {code?:string;status?:number};
      assert.equal(value.code,'agent_model_source_unsupported');
      assert.equal(value.status,409);
      return true;
    });
    const bound=opens.filter(input=>input.gateway);assert.equal(bound.length,2);
    assert.deepEqual(bound[0].gateway!.nativeModel,{provider:'qoder',id:'qmodel_38max',accountIdentity:service.models.accounts.read('native-qoder').identity});
    assert.equal(bound[1].gateway!.nativeModel,undefined);
    assert.ok(sent.every(input=>input.model?.startsWith('buildr-')),'public model names remain separate from leased execution routes');
  } finally {await service.close();await rm(root,{recursive:true,force:true});}
});
