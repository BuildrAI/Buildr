import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import { qoderExecutorDescriptor } from '../../src/executors/qoder/index.ts';
import { opaqueReference } from '../../src/executors/native-process.ts';
import type { AgentExecutor, ExecutorOpenOptions } from '../../src/contracts.ts';
import type { ModelProvider } from '../../src/model-access/contracts.ts';

for (const programStatus of ['not-authenticated', 'expired'] as const) test(`Qoder CN uses its independent model login despite stale program status: ${programStatus}`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-cn-account-route-'));
  const accountRoot = join(root, 'agent-service/model-access/accounts/native-qoder-cn');
  const opens: ExecutorOpenOptions[] = [];
  const capabilities = { text: true, images: false, approval: false, questions: false, stop: true, resume: false, maxInputBytes: 65536 };
  let accountReady = true, accepted = 0;
  const executor: AgentExecutor = { descriptor: { id: 'qoder-cn', label: 'Qoder CN', capabilities, modelPolicy: qoderExecutorDescriptor('qoder-cn').modelPolicy }, async open(options) {
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
    const presented = service.connections.read('qoder-cn');
    assert.equal(presented.status, 'ready', 'the independent account owns the execution login');
    assert.deepEqual(presented.models.map(model => model.id), ['qwen']);
    const chat = await service.conversations.create('workspace', {});
    const draft = { expectedRevision: chat.revision, connectionId: 'qoder-cn', modelAccountId: account.id, model: 'qwen', text: 'account route regression' };
    const preview = service.conversations.prepareSend('workspace', chat.id, draft);
    service.conversations.send('workspace', chat.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
    for (let i = 0; i < 200 && !['completed', 'failed'].includes(service.conversations.read('workspace', chat.id).run?.status ?? ''); i++) await new Promise(resolve => setTimeout(resolve, 5));
    const result = service.conversations.read('workspace', chat.id);
    assert.equal(result.run?.status, 'completed', result.run?.diagnostic);
    assert.equal(accepted, 1);
    const nativeChat = await service.conversations.create('workspace', {});
    const nativeDraft = { expectedRevision: nativeChat.revision, connectionId: 'qoder-cn', model: 'qwen', text: 'native account default route' };
    const nativePreview = service.conversations.prepareSend('workspace', nativeChat.id, nativeDraft);
    assert.equal(nativePreview.modelAccountId, account.id, 'omitted modelAccountId binds the independent account');
    service.conversations.send('workspace', nativeChat.id, { ...nativeDraft, previewToken: nativePreview.token, clientRequestId: randomUUID() });
    for (let i = 0; i < 200 && !['completed', 'failed'].includes(service.conversations.read('workspace', nativeChat.id).run?.status ?? ''); i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(service.conversations.read('workspace', nativeChat.id).run?.status, 'completed');
    assert.equal(accepted, 2);
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
    const offline = service.connections.read('qoder-cn');
    assert.equal(offline.status, 'not-authenticated');
    assert.deepEqual(offline.models, []);
    const missingChat = await service.conversations.create('workspace', {});
    assert.throws(() => service.conversations.prepareSend('workspace', missingChat.id, { ...draft, expectedRevision: missingChat.revision }), /登录|套餐尚未连接/);
    assert.equal(accepted, 2, 'a genuinely missing login must not dispatch');
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
  const executors: AgentExecutor[] = ['qoder','codex'].map(id=>({descriptor:{id,label:id,capabilities:{...capabilities,permissionModes:[...capabilities.permissionModes]},...(id==='qoder'?{modelPolicy:qoderExecutorDescriptor('qoder').modelPolicy}:{})},async open(options) {
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

test('Qoder standalone account shares models with Codex without preparing Qoder agent, and works regardless of Qoder connection status', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-standalone-route-'));
  const accountRoot = join(root, 'agent-service/model-access/accounts/native-qoder');
  const opens: ExecutorOpenOptions[] = [];
  const capabilities = { text: true, images: false, approval: false, questions: false, stop: true, resume: false, maxInputBytes: 65536 };
  let qoderAccepted = 0, codexAccepted = 0;
  const qoderExecutor: AgentExecutor = { descriptor: { id: 'qoder', label: 'Qoder', capabilities, modelPolicy: qoderExecutorDescriptor('qoder').modelPolicy }, async open(options) {
    opens.push(options);
    let execution = '';
    return {
      bindingIdentity: 'qoder-fixture', capabilities,
      inspectAccount: async () => ({ status: 'not-authenticated' }), models: async () => [],
      beginLogin: async () => {}, cancelLogin: async () => {},
      async createContext() {
        assert.equal(options.nativeAccountConfigRoot, accountRoot);
        assert.equal(await readFile(join(options.nativeAccountConfigRoot!, 'qoder-config/.auth/user'), 'utf8'), 'fixture-login');
        return { id: randomUUID() };
      },
      resumeContext: async () => {}, readHistory: async () => [],
      async send(input) {
        qoderAccepted++;
        execution = input.clientRequestId;
        input.onEvent({ type: 'accepted', executionRef: { id: input.clientRequestId } });
        input.onEvent({ type: 'completed', status: 'completed' });
      },
      observe: async () => ({ status: 'idle', tools: [], executionRef: { id: execution } }), reply: async () => {}, stop: async () => ({ status: 'stopped', tools: [] }), close: async () => {},
    };
  }};
  const codexExecutor: AgentExecutor = { descriptor: { id: 'codex', label: 'Codex', capabilities }, async open(options) {
    opens.push(options);
    let execution = '';
    return {
      bindingIdentity: 'codex-fixture', capabilities,
      inspectAccount: async () => ({ status: 'ready' }), models: async () => [],
      beginLogin: async () => {}, cancelLogin: async () => {},
      createContext: async () => ({ id: randomUUID() }), resumeContext: async () => {}, readHistory: async () => [],
      async send(input) {
        codexAccepted++;
        execution = input.clientRequestId;
        input.onEvent({ type: 'accepted', executionRef: { id: input.clientRequestId } });
        input.onEvent({ type: 'completed', status: 'completed' });
      },
      observe: async () => ({ status: 'idle', tools: [], executionRef: { id: execution } }), reply: async () => {}, stop: async () => ({ status: 'stopped', tools: [] }), close: async () => {},
    };
  }};
  const provider: ModelProvider = { id: 'native-qoder', label: 'Qoder', linked: true, async open(input) {
    assert.equal(input.configRoot, accountRoot);
    return { protocol: 'chat-completions',
      inspect: async () => ({ status: 'ready', identity: 'qoder-user', models: [{ id: 'qoder-max', label: 'Qoder Max', tools: true, images: false }] }),
      beginLogin: async () => {}, cancelLogin: async () => {}, infer: async () => { throw new Error('no paid inference'); }, close: async () => {},
    };
  }};
  const service = createAgentService({ dataRoot: root, executors: [qoderExecutor, codexExecutor], modelProviders: [provider], resolveWorkspace: () => ({ rootPath: root }), assertTask() {} });
  try {
    await mkdir(join(accountRoot, 'qoder-config/.auth'), { recursive: true });
    await writeFile(join(accountRoot, 'qoder-config/.auth/user'), 'fixture-login');
    await service.models.catalog.list({ refresh: true });
    const account = await service.models.accounts.check('native-qoder');
    assert.equal(account.connectionId, undefined);
    await service.models.accounts.preferences(account.id, { expectedRevision: account.revision, models: [{ id: 'qoder-max', enabled: true }] });
    // Even before Qoder agent is prepared or connected, Codex can already use Qoder's model source.
    const prepareCodex = { expectedRevision: 'unconfigured', programOnly: true };
    await service.connections.connect('codex', prepareCodex);
    const codexChat = await service.conversations.create('workspace', {});
    const codexDraft = { expectedRevision: codexChat.revision, connectionId: 'codex', modelAccountId: account.id, model: 'qoder-max', text: 'codex uses standalone qoder' };
    const codexPreview = service.conversations.prepareSend('workspace', codexChat.id, codexDraft);
    service.conversations.send('workspace', codexChat.id, { ...codexDraft, previewToken: codexPreview.token, clientRequestId: randomUUID() });
    for (let i = 0; i < 200 && !['completed', 'failed'].includes(service.conversations.read('workspace', codexChat.id).run?.status ?? ''); i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(service.conversations.read('workspace', codexChat.id).run?.status, 'completed');
    assert.equal(codexAccepted, 1);

    // Preparing Qoder program lets Qoder execute via the standalone model account even though program account reports not-authenticated.
    const prepareQoder = { expectedRevision: 'unconfigured', programOnly: true };
    await service.connections.connect('qoder', prepareQoder);
    assert.equal(service.connections.read('qoder').status, 'ready');
    const qoderChat = await service.conversations.create('workspace', {});
    const qoderDraft = { expectedRevision: qoderChat.revision, connectionId: 'qoder', model: 'qoder-max', text: 'qoder runs standalone' };
    const qoderPreview = service.conversations.prepareSend('workspace', qoderChat.id, qoderDraft);
    assert.equal(qoderPreview.modelAccountId, account.id);
    service.conversations.send('workspace', qoderChat.id, { ...qoderDraft, previewToken: qoderPreview.token, clientRequestId: randomUUID() });
    for (let i = 0; i < 200 && !['completed', 'failed'].includes(service.conversations.read('workspace', qoderChat.id).run?.status ?? ''); i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(service.conversations.read('workspace', qoderChat.id).run?.status, 'completed');
    assert.equal(qoderAccepted, 1);

    // Disconnecting Qoder agent preserves the ready standalone Qoder model account.
    await service.connections.disconnect('qoder', { expectedRevision: service.connections.read('qoder').revision });
    assert.equal(service.models.accounts.read(account.id).status, 'ready');

    // Reconnect Qoder agent and delete the shared standalone Qoder model account:
    // credentials are removed and the Qoder connection immediately presents as not-authenticated.
    await service.connections.connect('qoder', { ...prepareQoder, expectedRevision: service.connections.read('qoder').revision });
    assert.equal(service.connections.read('qoder').status, 'ready');
    const latestAccount = service.models.accounts.read(account.id);
    await service.models.accounts.remove(account.id, { expectedRevision: latestAccount.revision });
    const afterDelete = service.connections.read('qoder');
    assert.equal(afterDelete.status, 'not-authenticated');
    assert.deepEqual(afterDelete.models, []);
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('pre-upgrade Qoder conversation keeps reading legacy tool details and smoothly starts a fresh session with handoff', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-preupgrade-'));
  const legacySessionId = '33333333-4444-4555-8666-777777777777';
  const legacyConfig = join(root, 'agent-service/connections/qoder/qoder-config');
  const accountRoot = join(root, 'agent-service/model-access/accounts/native-qoder');
  const capabilities = { text: true, images: false, approval: false, questions: false, stop: true, resume: true, maxInputBytes: 65536 };
  let conversationId = '';
  let followupSentText = '';
  let phaseTwoOpens = 0;

  const { createQoderNativeContent } = await import('../../src/executors/qoder/content.ts');
  // Phase 1: Pre-upgrade Qoder runtime & connection-owned native-qoder provider
  {
    const preExecutor: AgentExecutor = {
      descriptor: {
        id: 'qoder', label: 'Qoder', capabilities,
        modelPolicy: { account: 'native', gateway: { protocol: 'chat-completions' }, native: { sourceProviders: ['qoder', 'native-qoder'], exclusive: true, binding: 'gateway-lease', platformLogin: 'required-for-sources' } },
      },
      nativeContent: createQoderNativeContent('qoder'),
      async open() {
        let execution = '';
        return {
          bindingIdentity: 'qoder-binding',
          bindingData: { config: legacyConfig },
          capabilities,
          inspectAccount: async () => ({ status: 'ready' }),
          models: async () => [{ id: 'qmodel', label: 'Qoder Model' }],
          beginLogin: async () => {}, cancelLogin: async () => {},
          async createContext(input) { return { id: legacySessionId, data: { native: opaqueReference('qoder', legacySessionId, input.cwd, 'qoder-binding') } }; },
          async resumeContext() {}, async readHistory() { return []; },
          async send(input) {
            execution = input.clientRequestId;
            await mkdir(join(legacyConfig, 'projects/proj'), { recursive: true });
            await writeFile(join(legacyConfig, 'projects/proj', `${legacySessionId}.jsonl`), [
              JSON.stringify({ type: 'user', uuid: 'u1', promptId: 'p1', sessionId: legacySessionId, cwd: input.cwd, isSidechain: false, message: { content: [{ type: 'text', text: input.text }] } }),
              JSON.stringify({ type: 'assistant', uuid: 'a1', promptId: 'p1', sessionId: legacySessionId, cwd: input.cwd, isSidechain: false, message: { content: [{ type: 'tool_use', id: 'legacy-tool-1', name: 'Bash', input: { command: 'echo legacy' } }] } }),
              JSON.stringify({ type: 'user', uuid: 'tr1', promptId: 'p1', sessionId: legacySessionId, cwd: input.cwd, isSidechain: false, sourceToolAssistantUUID: 'a1', toolUseResult: { stdout: 'legacy-stdout' }, message: { content: [{ type: 'tool_result', tool_use_id: 'legacy-tool-1', content: 'ok' }] } }),
            ].join('\n') + '\n');
            input.onEvent({ type: 'accepted', executionRef: { id: execution, data: { resourceContext: legacySessionId } } });
            input.onEvent({ type: 'item', item: { id: 'legacy-tool-1', kind: 'tool', role: 'system', name: 'command', status: 'completed', text: '', executionId: execution, nativeTool: true } });
            input.onEvent({ type: 'completed', status: 'completed' });
          },
          observe: async () => ({ status: 'idle', tools: [], executionRef: { id: execution } }),
          reply: async () => {}, stop: async () => ({ status: 'stopped', tools: [] }), close: async () => {},
        };
      },
    };
    const preProvider: ModelProvider = {
      id: 'native-qoder', label: 'Qoder', connectionId: 'qoder',
      async open() {
        return {
          protocol: 'chat-completions',
          inspect: async () => ({ status: 'ready', identity: 'qoder:legacy-user', models: [{ id: 'qmodel', label: 'Qoder Model', tools: true, images: false }] }),
          beginLogin: async () => {}, cancelLogin: async () => {}, infer: async () => Response.json({}), close: async () => {},
        };
      },
    };
    const service1 = createAgentService({ dataRoot: root, executors: [preExecutor], modelProviders: [preProvider], resolveWorkspace: () => ({ rootPath: root }), assertTask() {} });
    try {
      await service1.connections.connect('qoder', { expectedRevision: 'unconfigured' });
      await service1.models.catalog.list({ refresh: true });
      const acc = await service1.models.accounts.check('native-qoder');
      await service1.models.accounts.preferences(acc.id, { expectedRevision: acc.revision, models: [{ id: 'qmodel', enabled: true }] });
      const chat = await service1.conversations.create('workspace', {});
      conversationId = chat.id;
      const draft = { expectedRevision: chat.revision, connectionId: 'qoder', modelAccountId: acc.id, model: 'qmodel', text: 'turn 1 legacy' };
      const preview = service1.conversations.prepareSend('workspace', chat.id, draft);
      service1.conversations.send('workspace', chat.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
      for (let i = 0; i < 200 && service1.conversations.read('workspace', chat.id).run?.status !== 'completed'; i++) await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal(service1.conversations.read('workspace', chat.id).run?.status, 'completed');
    } finally { await service1.close(); }
  }

  // Phase 2: Post-upgrade standalone native-qoder + model-account scoped qoder executor
  {
    const postExecutor: AgentExecutor = {
      descriptor: { id: 'qoder', label: 'Qoder', capabilities, modelPolicy: qoderExecutorDescriptor('qoder').modelPolicy },
      nativeContent: createQoderNativeContent('qoder'),
      async open(options) {
        phaseTwoOpens++;
        let execution = '';
        return {
          bindingIdentity: 'qoder-binding',
          bindingData: { config: join(accountRoot, 'qoder-config') },
          capabilities,
          inspectAccount: async () => ({ status: 'not-authenticated' }),
          models: async () => [],
          beginLogin: async () => {}, cancelLogin: async () => {},
          async createContext(input) {
            assert.equal(options.nativeAccountConfigRoot, accountRoot);
            const id = randomUUID();
            return { id, data: { native: opaqueReference('qoder', id, input.cwd, 'qoder-binding') } };
          },
          async resumeContext() { throw new Error('must not resume pre-upgrade legacy context'); },
          async readHistory() { return []; },
          async send(input) {
            execution = input.clientRequestId;
            followupSentText = input.text;
            input.onEvent({ type: 'accepted', executionRef: { id: execution } });
            input.onEvent({ type: 'completed', status: 'completed' });
          },
          observe: async () => ({ status: 'idle', tools: [], executionRef: { id: execution } }),
          reply: async () => {}, stop: async () => ({ status: 'stopped', tools: [] }), close: async () => {},
        };
      },
    };
    const postProvider: ModelProvider = {
      id: 'native-qoder', label: 'Qoder', linked: true,
      async open(input) {
        assert.equal(input.configRoot, accountRoot);
        return {
          protocol: 'chat-completions',
          inspect: async () => ({ status: 'ready', identity: 'qoder:legacy-user', models: [{ id: 'qmodel', label: 'Qoder Model', tools: true, images: false }] }),
          beginLogin: async () => {}, cancelLogin: async () => {}, infer: async () => Response.json({}), close: async () => {},
        };
      },
    };
    const service2 = createAgentService({ dataRoot: root, executors: [postExecutor], modelProviders: [postProvider], resolveWorkspace: () => ({ rootPath: root }), assertTask() {} });
    try {
      // Migrated account drops connectionId and re-authenticates standalone
      const migrated = service2.models.accounts.read('native-qoder');
      assert.equal(migrated.connectionId, undefined);
      const checked = await service2.models.accounts.check('native-qoder');
      assert.equal(checked.status, 'ready');
      await service2.models.accounts.preferences(checked.id, { expectedRevision: checked.revision, models: [{ id: 'qmodel', enabled: true }] });
      const prepareProgram = { expectedRevision: service2.connections.read('qoder').revision, programOnly: true };
      await service2.connections.connect('qoder', prepareProgram);

      // Old conversation keeps reading tool details stored under connections/qoder/qoder-config
      const legacyView = service2.conversations.read('workspace', conversationId, { compactTools: true });
      const toolEntry = legacyView.entries.find(entry => entry.kind === 'tool');
      assert.ok(toolEntry?.detail?.revision, 'tool entry has persisted native reference');
      const detail = service2.conversations.readEntry('workspace', conversationId, toolEntry.id, toolEntry.detail.revision);
      assert.ok(detail);
      assert.equal(detail.input, '{"command":"echo legacy"}');
      assert.equal(detail.text, 'legacy-stdout');

      // Follow-up send smoothly previews & starts a new session with handoff rather than failing with 409 agent_binding_changed
      const current = service2.conversations.read('workspace', conversationId);
      const draft = { expectedRevision: current.revision, connectionId: 'qoder', model: 'qmodel', text: 'follow up after upgrade' };
      const preview = service2.conversations.prepareSend('workspace', conversationId, draft);
      assert.equal(preview.fits, true);
      assert.match(preview.diagnostic ?? '', /本轮将开启新的 Qoder 会话/);
      service2.conversations.send('workspace', conversationId, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
      for (let i = 0; i < 200 && service2.conversations.read('workspace', conversationId).run?.status !== 'completed'; i++) await new Promise(resolve => setTimeout(resolve, 5));
      const updated = service2.conversations.read('workspace', conversationId);
      assert.equal(updated.run?.status, 'completed', updated.run?.diagnostic);
      assert.ok(phaseTwoOpens >= 1);
      assert.match(followupSentText, /follow up after upgrade/);
    } finally { await service2.close(); }
  }
  await rm(root, { recursive: true, force: true });
});
