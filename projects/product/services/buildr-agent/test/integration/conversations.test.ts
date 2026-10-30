import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import type { AgentExecutor, AgentRuntime, AgentServiceOptions, ContextRef, ConversationEntry, ExecutorItem, ExecutorObservation, ExecutorOpenOptions, ExecutorSendInput, ExecutorTitleInput, LoginObservation } from '../../src/contracts.ts';
import { NativeRequestError } from '../../src/domain/error-diagnostic.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';

type Context = { items: ExecutorItem[]; observation: ExecutorObservation; unblock?: () => void };
function fake(id = 'local', options: { hold?: boolean; disconnect?: 'stopped'|'running'|'unknown'|'tool'; disconnectError?: string; beforeDisconnect?: Promise<void>; disconnectAlways?: boolean; disconnectOn?: number; beforeResume?: Promise<void>; unknown?: boolean; images?: boolean; noAnswer?: boolean; multipleModels?: boolean; request?: boolean; question?: boolean; coldUnknown?: boolean; beforeAccepted?: Promise<void>; replyAfterTerminal?: boolean; toolSurvives?: boolean; toolInput?: boolean; failure?: string | ((attempt: number) => string | undefined); prepareFailures?: number; unknownCreate?: boolean; beforeObservation?: Promise<void>; wrongObservation?: boolean; summary?:(input:ExecutorTitleInput)=>Promise<string|undefined> } = {}) {
  const contexts = new Map<string, Context>(); const sends: ExecutorSendInput[] = []; const replies: unknown[] = []; const opens: ExecutorOpenOptions[] = [];
  let preparations = 0;
  let loginUpdate: ((value: LoginObservation) => void) | undefined;
  const capabilities = { text: true, images: Boolean(options.images), approval: true, questions: true, stop: true, resume: true, maxInputBytes: 128 * 1024 };
  const get = (ref: ContextRef) => { const context = contexts.get(ref.id); assert.ok(context, 'exact context must be restored'); return context; };
  const executor: AgentExecutor = { descriptor: { id, label: id, capabilities }, async open(input) {
    opens.push(input);
    let didSend = false; let closed = false;
    const runtime: AgentRuntime = {
      bindingIdentity: `${id}:${input.configRoot}`, capabilities, get closed() { return closed; },
      async inspectAccount() { return { status: 'ready', label: 'local account' }; },
      async models() { return [{ id: 'test-model', label: 'test-model' }, ...(options.multipleModels ? [{id:'other-model',label:'other-model'}] : [])]; },
      async beginLogin(update) { loginUpdate = update; update({ state: 'waiting-browser', url: 'https://example.test/official?secret=temporary' }); },
      async cancelLogin() {},
      async createContext() { if (++preparations <= (options.prepareFailures ?? 0)) throw options.unknownCreate ? new Error('agent_native_timeout') : new NativeRequestError('service temporarily unavailable'); const ref = { id: randomUUID() }; contexts.set(ref.id, { items: [], observation: { status: 'idle', tools: [] } }); return ref; },
      async resumeContext({ contextRef }) { if (opens.length > 1) await options.beforeResume; get(contextRef); },
      async readHistory({ contextRef }) { return structuredClone(get(contextRef).items); },
      async send(input) {
        didSend = true;
        sends.push(input); const context = get(input.contextRef); const executionRef = { id: `execution-${sends.length}` };
        await options.beforeAccepted;
        if (options.unknown) { context.observation = { status: 'unknown', tools: [] }; throw new Error('acceptance reply lost'); }
        context.observation = { status: 'running', executionRef, tools: [] };
        input.onEvent({ type: 'accepted', executionRef, inputItemId: `input-${sends.length}` });
        const user: ExecutorItem = { id: `input-${sends.length}`, kind: 'message', role: 'user', text: input.text, executionId: executionRef.id };
        context.items.push(user); input.onEvent({ type: 'item', item: user });
        if(options.request||options.question)context.observation={status:'waiting',executionRef,tools:[]};
        if(options.question)input.onEvent({type:'request',request:{id:'question-one',kind:'question',title:'处理范围',questions:[{id:'scope',label:'具体范围',allowOther:true,options:[{id:'yes',label:'确认'}]}]}});
        if (options.request) input.onEvent({ type: 'request', request: { id: 'permit-one', kind: 'approval', title: 'Write a file?', options: [{ id: 'allow-once', label: 'Allow once' }, { id: 'deny', label: 'Deny' }] } });
        if (options.disconnect && (sends.length === (options.disconnectOn ?? 1) || options.disconnectAlways)) {
          await options.beforeDisconnect;
          closed = true;
          context.observation = { status: options.disconnect === 'tool' ? 'stopped' : options.disconnect, executionRef,
            tools: options.disconnect === 'tool' ? [{id:'uncertain-tool',label:'write',status:'unknown',canStop:false}] : [] };
          throw new Error(options.disconnectError ?? 'codex_execution_observation_lost');
        }
        if (options.hold || options.request || options.question) await new Promise<void>(resolve => { context.unblock = resolve; });
        if (context.observation.status === 'stopped') { input.onEvent({ type: 'completed', status: 'stopped' }); return; }
        if (options.toolInput) {
          const invocation:ExecutorItem={id:`tool-${sends.length}`,kind:'tool',role:'system',name:'read',input:'{"file_path":"src/example.ts"}',text:'read\n{"file_path":"src/example.ts"}',executionId:executionRef.id,status:'running'};
          input.onEvent({type:'item',item:invocation});
          const result:ExecutorItem={id:invocation.id,kind:'tool',role:'system',text:'file content',executionId:executionRef.id,status:'completed'};
          context.items.push(result);input.onEvent({type:'item',item:result});
        }
        const item: ExecutorItem = { id: `answer-${sends.length}`, kind: 'message', role: 'assistant', text: `answer from ${id}`, executionId: executionRef.id, status: 'completed' };
        if (!options.noAnswer) { context.items.push(item); input.onEvent({ type: 'item', item }); }
        context.observation = options.toolSurvives ? { status: 'tools-active', executionRef, tools: [{ id: 'own-tool', label: 'owned command', status: 'running', canStop: true }] } : { status: 'idle', executionRef, tools: [] };
        const failure = typeof options.failure === 'function' ? options.failure(sends.length) : options.failure;
        input.onEvent({ type: 'completed', status: failure ? 'failed' : 'completed', ...(failure ? {diagnostic:failure} : {}) });
      },
      async observe({ contextRef }) { await options.beforeObservation; if (options.wrongObservation) return {...structuredClone(get(contextRef).observation), executionRef:{id:'wrong-execution'}}; return options.coldUnknown && !didSend ? { status: 'unknown', tools: [] } : structuredClone(get(contextRef).observation); },
      async reply({ contextRef, answer }) { if(!options.question)assert.equal(answer, 'allow-once'); replies.push(answer); const context = get(contextRef); context.unblock?.(); if (options.replyAfterTerminal) await new Promise(resolve => setTimeout(resolve, 25)); },
      async stop({ contextRef }) { const context = get(contextRef); context.observation = { ...context.observation, status: 'stopped', tools: [] }; context.unblock?.(); return context.observation; },
      summarizeHandoff:options.summary,
      async close() {},
    };
    return runtime;
  } };
  return { executor, contexts, sends, replies, opens, loginUpdate: () => loginUpdate };
}
function fixture(executors: AgentExecutor[], settings: { modelProviders?: AgentServiceOptions['modelProviders']; autoContinueInterrupted?: boolean; shutdownTimeoutMs?: number; now?: () => Date } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-agent-core-'));
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
  const options = { ...settings, dataRoot: path.join(root, 'profile'), executors, resolveWorkspace(id: string) { assert.equal(id, 'workspace-one'); return { rootPath: workspace }; }, assertTask(_id: string, taskId: string) { assert.equal(taskId, 'task-one'); } };
  const service = createAgentService(options);
  return { root, workspace, options, service, async close() { await service.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

test('Qoder expired preparation retains the account-switch action for native and shared models', async () => {
  const native=fake('qoder'),open=native.executor.open;
  native.executor.open=async input=>({...await open(input),inspectAccount:async()=>({status:'expired'})});
  const f=fixture([native.executor]);
  try {
    await f.service.connections.connect('qoder',{expectedRevision:'unconfigured'});
    const conversation=await f.service.conversations.create('workspace-one',{});
    for(const modelAccountId of [undefined,'shared-source']){
      assert.throws(()=>f.service.conversations.prepareSend('workspace-one',conversation.id,{expectedRevision:conversation.revision,connectionId:'qoder',modelAccountId,model:'fixture-model',text:'preserve this draft'}),(error:any)=>{
        assert.equal(error.code,'qoder_platform_login_expired');
        assert.match(error.message,/团队账号额度已用尽.*更换有额度/);return true;
      });
    }
    assert.equal(native.sends.length,0);
  } finally {await f.close();}
});
async function connected(service: ReturnType<typeof createAgentService>, id: string) { return service.connections.connect(id, { expectedRevision: service.connections.read(id).revision }); }
async function waitUntil<T>(read: () => T, predicate: (value: T) => boolean): Promise<T> {
  for (let i = 0; i < 500; i++) { const value = read(); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 2)); }
  assert.fail('observable state did not settle: ' + JSON.stringify(read()).slice(-1800));
}
function send(service: ReturnType<typeof createAgentService>, id: string, connectionId: string, text: string, clientRequestId: string = randomUUID()) {
  const view = service.conversations.read('workspace-one', id);
  const draft = { expectedRevision: view.revision, connectionId, text };
  const preview = service.conversations.prepareSend('workspace-one', id, draft);
  return service.conversations.send('workspace-one', id, { ...draft, previewToken: preview.token, clientRequestId });
}

test('a detailed model failure survives public reads, observation and a cold service restart without replay',async()=>{
  const diagnostic='DSH · 工具调用后：Devin · 工具结果接续 / 响应流：permission_denied: MCP configuration issue.';
  const native=fake('local',{toolInput:true,failure:diagnostic}),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
    send(f.service,created.id,'local','inspect');
    const failed=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),view=>view.run?.status==='failed');
    assert.equal(failed.run?.diagnostic,diagnostic);assert.ok(failed.entries.some(item=>item.text==='file content'));
    assert.equal((await f.service.conversations.observe('workspace-one',created.id)).run?.diagnostic,diagnostic);
    await f.service.close();const cold=createAgentService(f.options);
    try{const view=cold.conversations.read('workspace-one',created.id);assert.equal(view.run?.status,'failed');assert.equal(view.run?.diagnostic,diagnostic);assert.equal(native.sends.length,1);}finally{await cold.close();}
  }finally{await f.close();}
});

test('read-only discovery creates no profile and a non-CLI executor needs no vendor account files', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    assert.equal(f.service.connections.list().connections[0]!.status, 'disconnected');
    assert.deepEqual(f.service.conversations.list('workspace-one').conversations, []);
    assert.equal(fs.existsSync(f.options.dataRoot), false);
    const view = await f.service.conversations.create('workspace-one', {});
    assert.equal(view.cwd, fs.realpathSync(f.workspace)); assert.equal(native.sends.length, 0);
    assert.throws(() => f.service.connections.read('unregistered'), { code: 'agent_provider_unavailable' });
    assert.throws(() => f.service.conversations.read('another-workspace', view.id), { code: 'agent_conversation_missing' });
  } finally { await f.close(); }
});

test('one accepted request remains one native execution, stable user entries and replayed history deduplicate', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', { taskId: 'task-one' });
    const draft = { expectedRevision: created.revision, connectionId: 'local', text: 'same request' };
    const preview = f.service.conversations.prepareSend('workspace-one', created.id, draft);
    const input = { ...draft, previewToken: preview.token, clientRequestId: 'request-one' };
    f.service.conversations.send('workspace-one', created.id, input);
    const complete = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
    assert.equal(complete.entries.filter(item => item.role === 'user').length, 1);
    assert.equal(native.sends.length, 1);
    f.service.conversations.send('workspace-one', created.id, input); assert.equal(native.sends.length, 1);
    assert.throws(() => f.service.conversations.send('workspace-one', created.id, { ...input, text: 'different' }), { code: 'agent_request_conflict' });
    const observed = await f.service.conversations.observe('workspace-one', created.id);
    assert.equal(observed.entries.length, complete.entries.length);
  } finally { await f.close(); }
});

test('manual A to B to C to A resumes exact contexts and sends only missing visible changes', async () => {
  const a = fake('a'); const b = fake('b'); const c = fake('c'); const f = fixture([a.executor, b.executor, c.executor]);
  try {
    for (const id of ['a', 'b', 'c']) await connected(f.service, id);
    const created = await f.service.conversations.create('workspace-one', {});
    for (const id of ['a', 'b', 'c']) { send(f.service, created.id, id, `work-${id}`); await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed'); }
    const before = f.service.conversations.read('workspace-one', created.id);
    const ref = before.participants.find(p => p.provider === 'a')!.contextId;
    const preview = f.service.conversations.prepareSend('workspace-one', created.id, { expectedRevision: before.revision, connectionId: 'a', text: 'return' });
    assert.equal(preview.history.some(item => item.text === 'answer from a'), false);
    assert.equal(preview.history.some(item => item.text === 'answer from b'), true);
    send(f.service, created.id, 'a', 'return');
    const after = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
    assert.equal(after.participants.length, 3); assert.equal(after.participants.find(p => p.provider === 'a')!.contextId, ref);
    assert.equal(a.contexts.size, 1); assert.equal(a.sends[1]!.contextRef.id, ref);
    assert.equal(after.entries.filter(item => item.role === 'user' && item.kind === 'message').length, 4);
  } finally { await f.close(); }
});

test('acceptance loss remains unknown through process restart and never retries input', async () => {
  const native = fake('local', { unknown: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'write once');
    await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'unknown');
    const cold = createAgentService(f.options);
    try {
      await cold.conversations.observe('workspace-one', created.id);
      assert.equal(cold.conversations.read('workspace-one', created.id).run?.status, 'unknown');
      assert.equal(native.sends.length, 1);
      assert.throws(() => send(cold, created.id, 'local', 'do it again'), { code: 'agent_conversation_busy' });
    } finally { await cold.close(); }
  } finally { await f.close(); }
});

test('stop and authorization respond while send is still waiting; concurrent conversations stay independent', async () => {
  const native = fake('local', { request: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'permission');
    const waiting = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.requests.length === 1);
    assert.throws(() => f.service.conversations.prepareSend('workspace-one', created.id, { expectedRevision: waiting.revision, connectionId: 'local', text: 'next' }), { code: 'agent_conversation_busy' });
    assert.equal(f.service.conversations.pending().conversations[0]!.id, created.id);
    await f.service.conversations.reply('workspace-one', created.id, waiting.requests[0]!.id, { expectedRevision: waiting.revision, runId: waiting.run!.id, participantId: waiting.run!.participantId, generation: waiting.run!.generation, answer: 'allow-once' });
    await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
    const another = await f.service.conversations.create('workspace-one', {}); send(f.service, another.id, 'local', 'stop');
    const running = await waitUntil(() => f.service.conversations.read('workspace-one', another.id), view => Boolean(view.requests.length));
    const stopped = await f.service.conversations.stop('workspace-one', another.id, { expectedRevision: running.revision, runId: running.run!.id, participantId: running.run!.participantId, generation: running.run!.generation });
    assert.equal(stopped.run!.status, 'stopped');
    await assert.rejects(f.service.conversations.reply('workspace-one', another.id, running.requests[0]!.id, { expectedRevision: stopped.revision, runId: running.run!.id, participantId: running.run!.participantId, generation: running.run!.generation, answer: 'allow-once' }), { code: 'agent_request_stale' });
    assert.equal(f.service.conversations.read('workspace-one', created.id).run!.status, 'completed');
  } finally { await f.close(); }
});

test('preview revision binds the local source range and legacy summaries cannot replace it', async () => {
  const a = fake('a'); const b = fake('b'); b.executor.descriptor.capabilities.maxInputBytes = 300;
  const f = fixture([a.executor, b.executor]);
  try {
    await connected(f.service, 'a'); await connected(f.service, 'b'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'a', 'x'.repeat(1000));
    const completed = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
    const draft = { expectedRevision: completed.revision, connectionId: 'b', text: 'continue' };
    const tooLarge = f.service.conversations.prepareSend('workspace-one', created.id, draft); assert.equal(tooLarge.fits, false);
    assert.throws(() => f.service.conversations.send('workspace-one', created.id, { ...draft, previewToken: tooLarge.token, clientRequestId: 'too-large' }), { code: 'agent_handoff_capacity' });
    assert.equal(b.sends.length, 0);
    const changed = await f.service.conversations.update('workspace-one', created.id, { expectedRevision: completed.revision, title: 'changed' });
    assert.throws(() => f.service.conversations.prepareSend('workspace-one', created.id, draft), { code: 'agent_revision_conflict' });
    const summary = f.service.conversations.prepareSend('workspace-one', created.id, { ...draft, expectedRevision: changed.revision, handoffSummary: 'user chosen scope' });
    assert.equal(summary.history[0]!.text,'x'.repeat(1000));assert.ok(summary.handoff!.body.includes('user chosen scope'));
    assert.ok(f.service.conversations.read('workspace-one', created.id).entries.some(item => item.text.length === 1000));
  } finally { await f.close(); }
});

test('official navigation is ephemeral and cancelled login callbacks cannot resurrect a completed attempt', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local');
    const login = f.service.connections.login('local', { expectedRevision: f.service.connections.read('local').revision });
    const waiting = await waitUntil(() => f.service.connections.loginAttempt('local', login.loginAttempt!.id), view => Boolean(view.loginAttempt?.url));
    assert.ok(waiting.loginAttempt!.url!.includes('secret=temporary'));
    const db = new DatabaseSync(path.join(f.options.dataRoot, 'agent-service/conversations.sqlite'), { readOnly: true });
    try { assert.equal(JSON.stringify(db.prepare('SELECT body FROM connections').all()).includes('secret=temporary'), false); } finally { db.close(); }
    const cancelled = await f.service.connections.cancelLogin('local', waiting.loginAttempt!.id, { expectedRevision: waiting.revision });
    native.loginUpdate()?.({ state: 'completed' });
    assert.equal(f.service.connections.read('local').loginAttempt!.state, 'cancelled');
    assert.equal(cancelled.loginAttempt!.url, undefined);
  } finally { await f.close(); }
});

test('real image bytes and ownership are checked, source profile and credentials do not leak into executor environment', async () => {
  const native = fake('local', { images: true }); const f = fixture([native.executor]);
  try {
    const isolated = createAgentService({ ...f.options, environment: { PATH: '/usr/bin', HOME: f.root, HTTPS_PROXY: 'http://127.0.0.1:1234', OPENAI_API_KEY: 'secret', CODEX_HOME: '/outside', DSH_HOME: '/outside', QODER_CONFIG_DIR: '/outside', CODEX_DESKTOP_TOKEN: 'secret' } });
    try {
      await connected(isolated, 'local');
      assert.deepEqual(Object.keys((native.opens.at(-1)!.environment as object)).sort(), ['HOME', 'HTTPS_PROXY', 'PATH']);
      const created = await isolated.conversations.create('workspace-one', {});
      assert.throws(() => isolated.conversations.addAttachment('workspace-one', created.id, { expectedRevision: created.revision, mimeType: 'image/png', bytes: Buffer.from('not png') }), { code: 'agent_image_invalid' });
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
      const attached = isolated.conversations.addAttachment('workspace-one', created.id, { expectedRevision: created.revision, mimeType: 'image/png', bytes: png });
      assert.deepEqual(isolated.conversations.readAttachment('workspace-one', created.id, attached.id).bytes, png);
      const another = await isolated.conversations.create('workspace-one', {});
      assert.throws(() => isolated.conversations.readAttachment('workspace-one', another.id, attached.id), { code: 'agent_attachment_missing' });
    } finally { await isolated.close(); }
  } finally { await f.close(); }
});

test('newer private storage is preserved and no workspace database is created', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    const dir = path.join(f.options.dataRoot, 'agent-service'); fs.mkdirSync(dir, { recursive: true });
    const filename = path.join(dir, 'conversations.sqlite'); const db = new DatabaseSync(filename); db.exec('PRAGMA user_version=99'); db.close();
    const before = fs.readFileSync(filename);
    assert.throws(() => f.service.conversations.list('workspace-one'), { code: 'agent_storage_newer' });
    assert.deepEqual(fs.readFileSync(filename), before);
    assert.equal(fs.existsSync(path.join(f.workspace, '.buildr')), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('cold observation cannot revoke persisted completion when a vendor has no recovered live-query state', async () => {
  const native = fake('local', { coldUnknown: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'first');
    const complete = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
    await f.service.close();
    const cold = createAgentService(f.options);
    try {
      const restored = await cold.conversations.observe('workspace-one', created.id);
      assert.equal(restored.run!.status, 'completed');
      assert.equal(restored.participants[0]!.contextId, complete.participants[0]!.contextId);
      send(cold, created.id, 'local', 'next');
      await waitUntil(() => cold.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
      assert.equal(native.sends.length, 2); assert.equal(native.contexts.size, 1);
    } finally { await cold.close(); }
  } finally { await f.close(); }
});

test('late authorization acknowledgment preserves a terminal event already observed', async () => {
  const native = fake('local', { request: true, replyAfterTerminal: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'ask');
    const waiting = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.requests.length === 1);
    const result = await f.service.conversations.reply('workspace-one', created.id, waiting.requests[0]!.id, { expectedRevision: waiting.revision, runId: waiting.run!.id, participantId: waiting.run!.participantId, generation: waiting.run!.generation, answer: 'allow-once' });
    assert.equal(result.run!.status, 'completed');
  } finally { await f.close(); }
});

test('a stop received before the vendor acceptance identity stops the eventual exact execution', async () => {
  let accept!: () => void; const gate = new Promise<void>(resolve => { accept = resolve; });
  const native = fake('local', { hold: true, beforeAccepted: gate }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'hold acceptance');
    await waitUntil(() => native.sends.length, value => value === 1);
    const starting = f.service.conversations.read('workspace-one', created.id);
    const stopping = await f.service.conversations.stop('workspace-one', created.id, { expectedRevision: starting.revision, runId: starting.run!.id, participantId: starting.run!.participantId, generation: starting.run!.generation });
    assert.equal(stopping.run!.status, 'stopping');
    accept();
    const stopped = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'stopped');
    assert.equal(stopped.entries.some(item => item.role === 'assistant'), false);
  } finally { accept(); await f.close(); }
});

test('normal running tools do not imply an interrupted model or override a pending approval', async () => {
  const native=fake('local',{hold:true}),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','run command');
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.accepted===true);
    const input=native.sends[0]!,context=native.contexts.get(input.contextRef.id)!;
    context.observation={...context.observation,status:'running',tools:[{id:'command',label:'command',status:'running'}]};
    input.onEvent({type:'observation',observation:context.observation});
    assert.equal(f.service.conversations.read('workspace-one',chat.id).run?.status,'running');
    assert.equal((await f.service.conversations.observe('workspace-one',chat.id)).run?.status,'running');
    input.onEvent({type:'request',request:{id:'permission',kind:'approval',title:'Continue?'}});
    context.observation={...context.observation,status:'waiting'};
    input.onEvent({type:'observation',observation:context.observation});
    const waiting=f.service.conversations.read('workspace-one',chat.id);assert.equal(waiting.run?.status,'waiting-approval');assert.equal(waiting.requests.length,1);
    await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:waiting.revision,runId:waiting.run!.id,participantId:waiting.run!.participantId,generation:waiting.run!.generation});
  }finally{await f.close();}
});

test('model completion does not count as stopped while the exact tool remains active', async () => {
  const native = fake('local', { toolSurvives: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'leave a command');
    const active = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'tools-active');
    assert.equal(active.run!.tools[0]!.id, 'own-tool');
    assert.throws(() => send(f.service, created.id, 'local', 'switch'), { code: 'agent_conversation_busy' });
    const stopped = await f.service.conversations.stop('workspace-one', created.id, { expectedRevision: active.revision, runId: active.run!.id, participantId: active.run!.participantId, generation: active.run!.generation, toolId: 'own-tool' });
    assert.equal(stopped.run!.status, 'stopped');
  } finally { await f.close(); }
});

test('shutdown releases the owned runtime and stream when a native stop never returns', { timeout: 2_000 }, async () => {
  const native = fake('local', { toolSurvives: true });
  let stopCalls = 0; let closeCalls = 0;
  const executor: AgentExecutor = { ...native.executor, async open(input) {
    const runtime = await native.executor.open(input);
    return { ...runtime,
      async stop() { stopCalls++; return new Promise<ExecutorObservation>(() => {}); },
      async close() { closeCalls++; },
    };
  } };
  const f = fixture([executor], { shutdownTimeoutMs: 100 });
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'leave a command');
    await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'tools-active');
    const subscription = f.service.conversations.subscribe('workspace-one', created.id);
    const iterator = subscription.events[Symbol.asyncIterator]();
    assert.equal((await iterator.next()).value!.type, 'snapshot');
    await f.service.close();
    assert.equal(stopCalls, 1); assert.equal(closeCalls, 1, 'resource release must not wait for an unresponsive vendor stop');
    while (!(await iterator.next()).done) { /* Shutdown observations already queued remain readable. */ }
    assert.ok(['stopping', 'unknown'].includes(f.service.conversations.read('workspace-one', created.id).run!.status), 'an unconfirmed stop must not become a completed execution');
    await f.service.close(); assert.equal(closeCalls, 1, 'repeated shutdown must not close the native runtime twice');
    await assert.rejects(connected(f.service, 'local'), { code: 'agent_service_closing' });
  } finally { await f.close(); }
});

test('late native request resolution preserves each already observed terminal state', async t => {
  for (const status of ['completed', 'stopped', 'failed'] as const) await t.test(status, async () => {
    const native = fake('local', { request: true }); const f = fixture([native.executor]);
    try {
      await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
      send(f.service, created.id, 'local', 'ask permission');
      const waiting = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.requests.length === 1);
      if (status === 'stopped') {
        await f.service.conversations.stop('workspace-one', created.id, { expectedRevision: waiting.revision, runId: waiting.run!.id, participantId: waiting.run!.participantId, generation: waiting.run!.generation });
      } else {
        if (status === 'failed') native.sends[0]!.onEvent({ type: 'completed', status: 'failed', diagnostic: 'native failure after asking' });
        const context = native.contexts.values().next().value!;
        context.observation = { status: 'idle', tools: [] }; context.unblock!();
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      const terminal = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === status);
      native.sends[0]!.onEvent({ type: 'request-resolved', requestId: 'permit-one' });
      const after = f.service.conversations.read('workspace-one', created.id);
      assert.equal(after.run!.id, terminal.run!.id); assert.equal(after.run!.status, status);
      assert.deepEqual(after.requests, []); assert.equal(native.sends.length, 1);
    } finally { await f.close(); }
  });
});

test('a conversation stream begins with the current snapshot and observes only later matching changes', async () => {
  const f = fixture([]);
  try {
    const created = await f.service.conversations.create('workspace-one', {});
    const another = await f.service.conversations.create('workspace-one', {});
    const before = await f.service.conversations.update('workspace-one', created.id, { expectedRevision: created.revision, title: 'before subscription' });
    const subscription = f.service.conversations.subscribe('workspace-one', created.id);
    const iterator = subscription.events[Symbol.asyncIterator]();
    try {
      const snapshot = (await iterator.next()).value!;
      assert.equal(snapshot.type, 'snapshot'); assert.equal(snapshot.revision, before.revision);
      assert.equal(snapshot.payload.conversation!.title, 'before subscription'); assert.equal(snapshot.generation, f.service.generation);
      await f.service.conversations.update('workspace-one', another.id, { expectedRevision: another.revision, title: 'unrelated change' });
      const after = await f.service.conversations.update('workspace-one', created.id, { expectedRevision: before.revision, title: 'after subscription' });
      const change = (await iterator.next()).value!;
      assert.equal(change.type, 'conversation'); assert.equal(change.conversationId, created.id);
      assert.equal(change.revision, after.revision); assert.equal(change.payload.conversation!.title, 'after subscription');
      assert.ok(change.cursor > snapshot.cursor); assert.equal(change.generation, snapshot.generation);
    } finally { subscription.close(); await iterator.return?.(); }
  } finally { await f.close(); }
});

test('late native permission and acceptance callbacks cannot reopen an execution already confirmed stopped', async () => {
  const native = fake('local', { request: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'ask permission');
    const waiting = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.requests.length === 1);
    await f.service.conversations.stop('workspace-one', created.id, { expectedRevision: waiting.revision, runId: waiting.run!.id, participantId: waiting.run!.participantId, generation: waiting.run!.generation });
    await new Promise<void>(resolve => setImmediate(resolve));
    native.sends[0]!.onEvent({ type: 'request', request: { id: 'late-permit', kind: 'approval', title: 'A queued permission request', options: [{ id: 'allow-once', label: 'Allow once' }] } });
    let after = f.service.conversations.read('workspace-one', created.id);
    assert.equal(after.run!.status, 'stopped'); assert.deepEqual(after.requests, []);
    native.sends[0]!.onEvent({ type: 'accepted', executionRef: { id: 'late-execution' }, inputItemId: 'late-input' });
    after = f.service.conversations.read('workspace-one', created.id);
    assert.equal(after.run!.status, 'stopped'); assert.deepEqual(after.requests, []);
  } finally { await f.close(); }
});

test('temporary image expiry and capacity preserve every image referenced by a submitted message', async () => {
  const native = fake('local', { images: true }); let now = new Date('2026-10-23T00:00:00Z');
  const f = fixture([native.executor], { now: () => now });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    const upload = () => f.service.conversations.addAttachment('workspace-one', created.id, { expectedRevision: f.service.conversations.read('workspace-one', created.id).revision, mimeType: 'image/png', bytes: png });
    const retained = upload();
    const draft = { expectedRevision: retained.revision, connectionId: 'local', text: 'inspect this image', attachmentIds: [retained.id] };
    const preview = f.service.conversations.prepareSend('workspace-one', created.id, draft);
    f.service.conversations.send('workspace-one', created.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
    await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
    const temporary = upload(); now = new Date(now.getTime() + 25 * 60 * 60 * 1_000);
    upload();
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one', created.id, retained.id).bytes, png);
    assert.throws(() => f.service.conversations.readAttachment('workspace-one', created.id, temporary.id), { code: 'agent_attachment_missing' });
    assert.equal(fs.existsSync(path.join(f.options.dataRoot, 'agent-service', 'attachments', created.id, temporary.id)), false);
    for (let index = 1; index < 64; index++) upload();
    const before = f.service.conversations.read('workspace-one', created.id);
    assert.throws(upload, { code: 'agent_attachment_capacity', status: 413 });
    assert.equal(f.service.conversations.read('workspace-one', created.id).revision, before.revision);
    assert.equal(fs.readdirSync(path.join(f.options.dataRoot, 'agent-service', 'attachments', created.id)).length, 65, '64 temporary files plus the submitted image remain');
  } finally { await f.close(); }
});

test('a delayed account check cannot overwrite a completed disconnect', async t => {
  for (const outcome of ['models', 'failure'] as const) await t.test(outcome, async () => {
    const native = fake(); let defer = false; let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    let resolveModels!: (value: Awaited<ReturnType<AgentRuntime['models']>>) => void; let rejectModels!: (error: Error) => void;
    const models = new Promise<Awaited<ReturnType<AgentRuntime['models']>>>((resolve, reject) => { resolveModels = resolve; rejectModels = reject; });
    const executor: AgentExecutor = { ...native.executor, async open(input) {
      const runtime = await native.executor.open(input);
      return { ...runtime, async models() { if (!defer) return runtime.models(); entered(); return models; } };
    } };
    const f = fixture([executor]);
    try {
      await connected(f.service, 'local'); defer = true;
      const pending = f.service.connections.check('local', { expectedRevision: f.service.connections.read('local').revision });
      await started;
      const disconnected = await f.service.connections.disconnect('local', { expectedRevision: f.service.connections.read('local').revision });
      if (outcome === 'models') resolveModels([{ id: 'late-model', label: 'late model' }]); else rejectModels(new Error('late model failure'));
      const result = await pending;
      assert.equal(result.revision, disconnected.revision); assert.equal(result.enabled, false); assert.equal(result.status, 'disconnected');
      assert.deepEqual(f.service.connections.read('local'), disconnected);
    } finally { resolveModels([]); await f.close(); }
  });
});

test('a rejected persistence transaction dispatches no input and removes a newly written unreferenced image', async () => {
  const native = fake('local', { images: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    const before = f.service.conversations.read('workspace-one', created.id);
    const db = new DatabaseSync(path.join(f.options.dataRoot, 'agent-service/conversations.sqlite'));
    try { db.exec("CREATE TRIGGER reject_conversation_update BEFORE UPDATE ON conversations BEGIN SELECT RAISE(ABORT,'fixture-write-rejected'); END"); } finally { db.close(); }
    const draft = { expectedRevision: created.revision, connectionId: 'local', text: 'must not be delivered' };
    const preview = f.service.conversations.prepareSend('workspace-one', created.id, draft);
    assert.throws(() => f.service.conversations.send('workspace-one', created.id, { ...draft, previewToken: preview.token, clientRequestId: 'rejected-write' }), /fixture-write-rejected/);
    assert.equal(native.sends.length, 0); assert.equal(native.contexts.size, 0);
    assert.deepEqual(f.service.conversations.read('workspace-one', created.id), before);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
    assert.throws(() => f.service.conversations.addAttachment('workspace-one', created.id, { expectedRevision: created.revision, mimeType: 'image/png', bytes: png }), /fixture-write-rejected/);
    assert.deepEqual(fs.readdirSync(path.join(f.options.dataRoot, 'agent-service/attachments', created.id)), []);
    assert.deepEqual(f.service.conversations.read('workspace-one', created.id), before);
  } finally { await f.close(); }
});

test('failure to persist native acceptance keeps delivery unknown and never repeats a possibly delivered input', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    const db = new DatabaseSync(path.join(f.options.dataRoot, 'agent-service/conversations.sqlite'));
    try { db.exec("CREATE TRIGGER reject_acceptance BEFORE UPDATE ON conversations WHEN json_extract(NEW.body,'$.view.run.accepted')=1 BEGIN SELECT RAISE(ABORT,'fixture-acceptance-write-rejected'); END"); } finally { db.close(); }
    const draft = { expectedRevision: created.revision, connectionId: 'local', text: 'may have been delivered' };
    const preview = f.service.conversations.prepareSend('workspace-one', created.id, draft);
    const input = { ...draft, previewToken: preview.token, clientRequestId: 'acceptance-write-rejected' };
    f.service.conversations.send('workspace-one', created.id, input);
    const unknown = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'unknown');
    assert.equal(unknown.run!.accepted, false); assert.equal(unknown.entries[0]!.status, 'unknown');
    assert.ok(unknown.participants[0]!.contextId); assert.equal(native.sends.length, 1);
    assert.equal(f.service.conversations.send('workspace-one', created.id, input).run.id, unknown.run!.id);
    assert.equal(native.sends.length, 1);
    assert.throws(() => send(f.service, created.id, 'local', 'retry uncertain input'), { code: 'agent_conversation_busy' });
  } finally { await f.close(); }
});

test('cold recovery rejects prior-generation replies and cannot release an unknown run from another execution observation', async () => {
  const native = fake('local', { request: true }); let opened = 0;
  const executor: AgentExecutor = { ...native.executor, async open(input) {
    const runtime = await native.executor.open(input); const ordinal = ++opened;
    return ordinal === 1 ? runtime : { ...runtime, async observe() { return { status: 'idle', executionRef: { id: 'another-execution' }, tools: [] }; } };
  } };
  const f = fixture([executor]); let cold: ReturnType<typeof createAgentService> | undefined;
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'request before process loss');
    const waiting = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.requests.length === 1);
    cold = createAgentService(f.options);
    await assert.rejects(cold.conversations.reply('workspace-one', created.id, waiting.requests[0]!.id, { expectedRevision: waiting.revision, runId: waiting.run!.id, participantId: waiting.run!.participantId, generation: waiting.run!.generation, answer: 'allow-once' }), { code: 'agent_control_stale' });
    const observed = await cold.conversations.observe('workspace-one', created.id);
    assert.equal(observed.run!.status, 'unknown');
    assert.deepEqual(observed.requests, [], 'old request handles must not be revived by a new service generation');
    assert.throws(() => send(cold!, created.id, 'local', 'must wait'), { code: 'agent_conversation_busy' });
    assert.equal(native.sends.length, 1);
  } finally {
    for (const context of native.contexts.values()) { context.observation = { status: 'stopped', tools: [] }; context.unblock?.(); }
    await new Promise<void>(resolve => setImmediate(resolve)); await cold?.close(); await f.close();
  }
});

test('reconnect performs a fresh runtime check rather than adopting a delayed check from a closed runtime', async () => {
  const native = fake(); let calls = 0; let entered!: () => void; let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
  const executor: AgentExecutor = { ...native.executor, async open(input) {
    const runtime = await native.executor.open(input); const ordinal = native.opens.length;
    return { ...runtime, async models() {
      if (ordinal === 1 && ++calls > 1) { entered(); await gate; }
      return [{ id: `runtime-${ordinal}`, label: `runtime ${ordinal}` }];
    } };
  } };
  const f = fixture([executor]);
  try {
    await connected(f.service, 'local'); const pending = f.service.connections.check('local'); await started;
    await f.service.connections.disconnect('local', { expectedRevision: f.service.connections.read('local').revision });
    const reconnect = connected(f.service, 'local'); release();
    const [, current] = await Promise.all([pending, reconnect]);
    assert.equal(native.opens.length, 2); assert.deepEqual(current.models, [{ id: 'runtime-2', label: 'runtime 2' }]);
    assert.equal(current.enabled, true); assert.equal(current.status, 'ready');
  } finally { release(); await f.close(); }
});

test('expired image cleanup refuses a replaced attachment directory before deleting files outside its owned directory', async () => {
  const native = fake('local', { images: true }); let now = new Date('2026-10-23T00:00:00Z');
  const f = fixture([native.executor], { now: () => now });
  try {
    const created = await f.service.conversations.create('workspace-one', {});
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
    const attached = f.service.conversations.addAttachment('workspace-one', created.id, { expectedRevision: created.revision, mimeType: 'image/png', bytes: png });
    const directory = path.join(f.options.dataRoot, 'agent-service/attachments', created.id);
    const foreign = path.join(f.root, 'other-owner'); fs.mkdirSync(foreign); fs.writeFileSync(path.join(foreign, attached.id), 'foreign-owned-file');
    fs.renameSync(directory, `${directory}.retained`); fs.symlinkSync(foreign, directory, 'dir');
    now = new Date(now.getTime() + 25 * 60 * 60 * 1_000);
    assert.throws(() => f.service.conversations.addAttachment('workspace-one', created.id, { expectedRevision: attached.revision, mimeType: 'image/png', bytes: png }), { code: 'agent_attachment_unsafe' });
    assert.equal(fs.readFileSync(path.join(foreign, attached.id), 'utf8'), 'foreign-owned-file');
    assert.equal(f.service.conversations.read('workspace-one', created.id).revision, attached.revision);
  } finally { await f.close(); }
});

test('default history pages retain five rounds including dense tools and in-round answers, with exact earlier cursors', async t => {
  for (const mode of ['named', 'legacy', 'mixed']) await t.test(`${mode} round identities`, async () => {
    const f = fixture([]);
    try {
      const created = await f.service.conversations.create('workspace-one', {});
      const entries: ConversationEntry[] = [];
      for (let round = 1; round <= 12; round++) {
        const append = (kind: ConversationEntry['kind'], role: ConversationEntry['role'], text: string) => entries.push({ id: `entry-${entries.length + 1}`, sequence: entries.length + 1, createdAt: created.updatedAt, kind, role, text, ...(mode === 'legacy' || mode === 'mixed' && (kind !== 'message' || round % 2 === 0 && role === 'user') ? {} : {runId:`run-${round}`}) });
        append('message', 'user', `request ${round}`);
        append('notice', 'user', `answer to approval ${round}`);
        for (let tool = 0; tool < (round === 12 ? 120 : 2); tool++) append('tool', 'system', `tool ${round}/${tool}`);
        append('message', 'assistant', `reply ${round}`);
      }
      const repository = new ConversationRepository(path.join(f.options.dataRoot, 'agent-service'));
      const stored = repository.readConversation(created.id)!;
      const revision = stored.view.revision;
      stored.view.entries = entries; stored.view.revision = randomUUID();
      repository.saveConversation(stored, revision);
      const recent = f.service.conversations.read('workspace-one', created.id);
      assert.ok(recent.entries.length > 100, 'a tool-heavy round must not displace the latest five rounds');
      const pages: ConversationEntry[] = []; let page = recent;
      for (const rounds of [[8, 9, 10, 11, 12], [3, 4, 5, 6, 7], [1, 2]]) {
        assert.deepEqual(page.entries.filter(entry => entry.kind === 'message' && entry.role === 'user').map(entry => entry.text), rounds.map(round => `request ${round}`));
        assert.equal(page.entries.filter(entry => entry.kind === 'notice').length, rounds.length);
        pages.unshift(...page.entries);
        if (page.nextEntryCursor === undefined) break;
        assert.equal(page.nextEntryCursor, page.entries[0]!.sequence);
        page = f.service.conversations.read('workspace-one', created.id, {before:page.nextEntryCursor});
      }
      assert.equal(page.nextEntryCursor, undefined);
      assert.deepEqual(pages, entries);
      assert.equal(new Set(pages.map(entry => entry.id)).size, entries.length);
      const explicit = f.service.conversations.read('workspace-one', created.id, {limit:100});
      assert.deepEqual(explicit.entries, entries.slice(-100), 'explicit entry-count callers retain their existing semantics');
      assert.equal(explicit.nextEntryCursor, explicit.entries[0]!.sequence);
      const subscription = f.service.conversations.subscribe('workspace-one', created.id);
      const iterator = subscription.events[Symbol.asyncIterator]();
      try {
        const snapshot = (await iterator.next()).value!;
        assert.deepEqual(snapshot.payload.conversation!.entries, recent.entries);
        assert.equal(snapshot.payload.conversation!.nextEntryCursor, recent.nextEntryCursor);
      } finally { subscription.close(); await iterator.return?.(); }
    } finally { await f.close(); }
  });
});

test('default round pages split oversized rounds by bytes without dropping durable entries', async () => {
  const f = fixture([]);
  try {
    const created = await f.service.conversations.create('workspace-one', {});
    const entries: ConversationEntry[] = Array.from({length:10}, (_, index) => ({id:`large-${index}`,sequence:index + 1,createdAt:created.updatedAt,kind:'tool',role:'system',runId:'large-round',text:'x'.repeat(700 * 1024)}));
    const repository = new ConversationRepository(path.join(f.options.dataRoot, 'agent-service'));
    const stored = repository.readConversation(created.id)!;
    const revision = stored.view.revision;
    stored.view.entries = entries; stored.view.revision = randomUUID();
    repository.saveConversation(stored, revision);
    const recovered: ConversationEntry[] = [];
    let page = f.service.conversations.read('workspace-one', created.id);
    assert.ok(page.nextEntryCursor);
    for (;;) {
      assert.ok(page.entries.length > 0);
      assert.ok(Buffer.byteLength(JSON.stringify(page.entries)) <= 4 * 1024 * 1024);
      recovered.unshift(...page.entries);
      if (page.nextEntryCursor === undefined) break;
      const next = f.service.conversations.read('workspace-one', created.id, {before:page.nextEntryCursor});
      assert.ok(next.entries.at(-1)!.sequence < page.entries[0]!.sequence);
      page = next;
    }
    assert.deepEqual(recovered, entries);
    assert.deepEqual(repository.readConversation(created.id)!.view.entries, entries);
  } finally { await f.close(); }
});

test('large native items remain durable while the handoff carries actions and readable local sources', async () => {
  const a = fake('a'); const b = fake('b'); const f = fixture([a.executor, b.executor]);
  try {
    await connected(f.service, 'a'); await connected(f.service, 'b');
    const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'a', 'read large tool output');
    const completed = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'completed');
    const context = a.contexts.values().next().value!;
    for (let index = 0; index < 10; index++) {
      const item: ExecutorItem = { id: `large-tool-${index}`, kind: 'tool', role: 'assistant', text: `${index}:` + 'x'.repeat(700 * 1024), executionId: 'execution-1', status: 'completed' };
      context.items.push(item); a.sends[0]!.onEvent({ type: 'item', item });
    }
    const recent = f.service.conversations.read('workspace-one', created.id, { limit: 100 });
    assert.ok(recent.entries.length < 10); assert.ok(recent.nextEntryCursor);
    const pages = []; let page = recent;
    for (;;) {
      assert.ok(page.entries.length > 0); assert.ok(Buffer.byteLength(JSON.stringify(page.entries)) <= 4 * 1024 * 1024);
      pages.unshift(...page.entries);
      if (page.nextEntryCursor === undefined) break;
      const next = f.service.conversations.read('workspace-one', created.id, { before: page.nextEntryCursor, limit: 100 });
      assert.ok(next.entries.at(-1)!.sequence < page.entries[0]!.sequence); page = next;
    }
    assert.deepEqual(pages.map(entry => entry.sequence), Array.from({ length: 12 }, (_, index) => index + 1));
    assert.equal(new Set(pages.map(entry => entry.id)).size, 12);
    assert.deepEqual(pages.filter(entry => entry.kind === 'tool').map(entry => entry.text), context.items.filter(item => item.kind === 'tool').map(item => item.text));
    const db = new DatabaseSync(path.join(f.options.dataRoot, 'agent-service/conversations.sqlite'), { readOnly: true });
    try {
      const row = db.prepare('SELECT body FROM conversations WHERE id=?').get(created.id) as { body: string };
      assert.deepEqual(JSON.parse(row.body).view.entries, pages, 'pagination must not truncate the durable record');
    } finally { db.close(); }
    const subscription = f.service.conversations.subscribe('workspace-one', created.id);
    const iterator = subscription.events[Symbol.asyncIterator]();
    try {
      const snapshot = (await iterator.next()).value!;
      assert.equal(snapshot.type, 'snapshot'); assert.deepEqual(snapshot.payload.conversation!.entries, recent.entries);
      assert.equal(snapshot.payload.conversation!.nextEntryCursor, recent.nextEntryCursor);
      assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 8 * 1024 * 1024);
    } finally { subscription.close(); await iterator.return?.(); }
    const draft = { expectedRevision: recent.revision, connectionId: 'b', text: 'continue' };
    const preview = f.service.conversations.prepareSend('workspace-one', created.id, draft);
    assert.equal(preview.history.length,12);assert.equal(preview.fits,true);assert.ok(preview.inputBytes<preview.maxInputBytes);
    assert.ok(!preview.handoff!.body.includes('x'.repeat(1000)));
    const index=JSON.parse(fs.readFileSync(preview.handoff!.sourcePath!,'utf8'));
    const original=JSON.parse(fs.readFileSync(index.rounds[0].path,'utf8'));assert.equal(original.records.filter((e:any)=>e.kind==='tool').length,10);
    f.service.conversations.send('workspace-one',created.id,{...draft,previewToken:preview.token,clientRequestId:'indexed-handoff'});
    await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed');assert.equal(b.sends.length,1);
  } finally { await f.close(); }
});

test('the public login expires after fifteen minutes and late completion cannot revive the expired attempt', async t => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local');
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const started = f.service.connections.login('local', { expectedRevision: f.service.connections.read('local').revision });
    await new Promise<void>(resolve => setImmediate(resolve));
    const waiting = f.service.connections.loginAttempt('local', started.loginAttempt!.id);
    const lateCompletion = native.loginUpdate()!;
    assert.equal(waiting.loginAttempt!.state, 'waiting-browser'); assert.ok(waiting.loginAttempt!.url);
    t.mock.timers.tick(15 * 60 * 1_000 - 1);
    assert.equal(f.service.connections.loginAttempt('local', waiting.loginAttempt!.id).loginAttempt!.state, 'waiting-browser');
    t.mock.timers.tick(1);
    await new Promise<void>(resolve => setImmediate(resolve));
    const expired = f.service.connections.loginAttempt('local', waiting.loginAttempt!.id);
    assert.equal(expired.loginAttempt!.state, 'expired'); assert.equal(expired.loginAttempt!.url, undefined);
    lateCompletion({ state: 'completed' });
    assert.equal(f.service.connections.loginAttempt('local', waiting.loginAttempt!.id).loginAttempt!.state, 'expired');
    const retry = f.service.connections.login('local', { expectedRevision: expired.revision });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.notEqual(retry.loginAttempt!.id, waiting.loginAttempt!.id);
    lateCompletion({ state: 'completed' });
    assert.equal(f.service.connections.loginAttempt('local', retry.loginAttempt!.id).loginAttempt!.state, 'waiting-browser');
  } finally { t.mock.timers.reset(); await f.close(); }
});

test('actual model effort resolves in preview, persists across restart and rejects unsupported selections before dispatch', async () => {
  const native = fake(); const open = native.executor.open;
  native.executor.open = async input => ({ ...await open(input), async models() { return [
    { id: 'small', label: 'Small', isDefault: true, reasoningEfforts: [{ id: 'low', label: 'Fast' }, { id: 'high', label: 'Deep' }], defaultReasoningEffort: 'low' },
    { id: 'plain', label: 'Plain' },
  ]; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {});
    const raw = { expectedRevision: view.revision, connectionId: 'local', text: 'check current facts', reasoningEffort: 'high' };
    const preview = f.service.conversations.prepareSend('workspace-one', view.id, raw);
    assert.equal(preview.model, 'small'); assert.equal(preview.reasoningEffort, 'high');
    assert.throws(() => f.service.conversations.prepareSend('workspace-one', view.id, { ...raw, model: 'plain' }), { code: 'agent_reasoning_unavailable' });
    assert.throws(() => f.service.conversations.prepareSend('workspace-one', view.id, { ...raw, model: 'missing' }), { code: 'agent_model_unavailable' });
    assert.throws(() => f.service.conversations.send('workspace-one', view.id, { ...raw, reasoningEffort: 'low', previewToken: preview.token, clientRequestId: 'effort-request' }), { code: 'agent_preview_stale' });
    assert.equal(native.sends.length, 0);
    f.service.conversations.send('workspace-one', view.id, { ...raw, previewToken: preview.token, clientRequestId: 'effort-request' });
    await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    assert.equal(native.sends[0]!.model, 'small'); assert.equal(native.sends[0]!.reasoningEffort, 'high');
    assert.throws(() => f.service.conversations.send('workspace-one', view.id, { ...raw, reasoningEffort: 'low', previewToken: preview.token, clientRequestId: 'effort-request' }), { code: 'agent_request_conflict' });
    await f.service.close(); const restored = createAgentService(f.options);
    try { const run = restored.conversations.read('workspace-one', view.id).run!; assert.equal(run.model, 'small'); assert.equal(run.reasoningEffort, 'high'); }
    finally { await restored.close(); }
  } finally { await f.close(); }
});

test('observed native model selection refreshes the private default and reaches the active conversation SSE', async () => {
  const native = fake(); const open = native.executor.open; let selected = 'a';
  const models = () => ['a', 'b'].map(id => ({ id, label: id, isDefault: id === selected, reasoningEfforts: [{ id: 'low', label: 'Low' }], defaultReasoningEffort: 'low' }));
  native.executor.open = async input => { const runtime = await open(input); return { ...runtime, async models() { return models(); }, async send(input) { selected = input.model!; input.onEvent({ type: 'models', models: models() }); return runtime.send(input); } }; };
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {});
    const subscription = f.service.conversations.subscribe('workspace-one', view.id); const iterator = subscription.events[Symbol.asyncIterator](); await iterator.next();
    const raw = { expectedRevision: view.revision, connectionId: 'local', model: 'b', text: 'use b' };
    const preview = f.service.conversations.prepareSend('workspace-one', view.id, raw);
    f.service.conversations.send('workspace-one', view.id, { ...raw, previewToken: preview.token, clientRequestId: randomUUID() });
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    let found = false; for (let i = 0; i < 15; i++) { const event = (await iterator.next()).value!; if (event.type === 'connection') { assert.equal(event.workspaceId, 'workspace-one'); assert.equal(event.conversationId, view.id); assert.equal(event.payload.connection.models.find((model: any) => model.isDefault).id, 'b'); found = true; break; } }
    assert.equal(found, true); subscription.close();
    const defaultDraft = { expectedRevision: done.revision, connectionId: 'local', text: 'use the native default' };
    const next = f.service.conversations.prepareSend('workspace-one', view.id, defaultDraft); assert.equal(next.model, 'b'); assert.equal(next.reasoningEffort, 'low');
  } finally { await f.close(); }
});

test('automatic title uses one separate bounded summary and never inserts a title instruction into work history', async () => {
  const native = fake(); const open = native.executor.open; const titles: any[] = [];
  native.executor.open = async input => ({ ...await open(input), async generateTitle(input) { titles.push(input); return '供应商入驻审核流程梳理'; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', '请梳理供应商入驻业务');
    const named = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.title === '供应商入驻审核流程梳理' && value.run?.status === 'completed');
    assert.equal(named.run!.status, 'completed'); assert.equal(named.titleState?.status,'generated'); assert.equal(titles.length, 1); assert.deepEqual(JSON.parse(titles[0].description), { messages: [{ role: 'user', text: '请梳理供应商入驻业务' }] });
    assert.equal(native.sends.length, 1); assert.equal(named.entries.filter(entry => entry.role === 'user').length, 1);
    send(f.service, view.id, 'local', '继续检查'); await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    assert.equal(titles.length, 1);
    await f.service.close(); const restored = createAgentService(f.options); try { await restored.conversations.observe('workspace-one', view.id); assert.equal(titles.length, 1); } finally { await restored.close(); }
  } finally { await f.close(); }
});

test('a running run already receives its generated title while the first round is still in flight', async () => {
  const native = fake('local', { hold: true }); const open = native.executor.open; const titles: any[] = [];
  native.executor.open = async input => ({ ...await open(input), async generateTitle(input) { titles.push(input); return '执行中已回填的标题'; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', '请在执行开始时就给出名字');
    await waitUntil(() => native.sends[0]?.contextRef && native.contexts.get(native.sends[0].contextRef.id), Boolean);
    const running = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'running' && value.title === '执行中已回填的标题');
    assert.equal(titles.length, 1); assert.deepEqual(JSON.parse(titles[0].description), { messages: [{ role: 'user', text: '请在执行开始时就给出名字' }] });
    for (const context of native.contexts.values()) context.unblock?.();
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    assert.equal(done.title, '执行中已回填的标题'); assert.equal(titles.length, 1);
  } finally { await f.close(); }
});

test('a failed early title falls back to the completed-run attempt, then the automatic budget is spent', async () => {
  const native = fake('local', { hold: true }); const open = native.executor.open; let calls = 0;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { calls++; throw new Error('agent_title_failed'); } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', 'start work');
    await waitUntil(() => calls, Boolean); for (const context of native.contexts.values()) context.unblock?.();
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    await waitUntil(() => calls === 2, Boolean); assert.equal(done.title, '新对话');
    send(f.service, view.id, 'local', 'next'); await waitUntil(() => native.sends.length > 1, Boolean); for (const context of native.contexts.values()) context.unblock?.();
    await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    assert.equal(calls, 2);
  } finally { await f.close(); }
});

test('conversation task association can be set, replaced and cleared with the observed revision', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {});
    assert.equal(view.taskId, undefined);
    let current = await f.service.conversations.update('workspace-one', view.id, { expectedRevision: view.revision, taskId: 'task-one' });
    assert.equal(current.taskId, 'task-one');
    assert.equal(f.service.conversations.read('workspace-one', view.id).taskId, 'task-one');
    assert.equal(f.service.conversations.list('workspace-one', { taskId: 'task-one' }).conversations.length, 0, '任务关联不使空草稿进入列表');
    send(f.service, view.id, 'local', 'start associated work');
    current = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    assert.equal(f.service.conversations.list('workspace-one', { taskId: 'task-one' }).conversations[0]?.id, view.id);
    await assert.rejects(f.service.conversations.update('workspace-one', view.id, { expectedRevision: current.revision, taskId: 'task-two' }));
    assert.equal(f.service.conversations.read('workspace-one', view.id).taskId, 'task-one');
    current = await f.service.conversations.update('workspace-one', view.id, { expectedRevision: current.revision, taskId: null });
    assert.equal(current.taskId, undefined); assert.equal(f.service.conversations.list('workspace-one', { taskId: 'task-one' }).conversations.length, 0);
    await assert.rejects(f.service.conversations.update('workspace-one', view.id, { expectedRevision: view.revision, taskId: 'task-one' }), { code: 'agent_revision_conflict' });
  } finally { await f.close(); }
});

test('manual rename wins over a delayed automatic title and failed summaries do not consume another work turn', async () => {
  const native = fake(); const open = native.executor.open; let release!: (title: string) => void; let started = false; let calls = 0;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { started = true; calls++; return await new Promise<string>(resolve => { release = resolve; }); } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', 'first work');
    await waitUntil(() => started, Boolean); const current = f.service.conversations.read('workspace-one', view.id); assert.equal(current.titleState?.status,'generating');
    await f.service.conversations.update('workspace-one', view.id, { expectedRevision: current.revision, title: '我的手动标题' }); release('延迟生成的标题');
    await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(f.service.conversations.read('workspace-one', view.id).titleState?.status,'manual'); assert.equal(f.service.conversations.read('workspace-one', view.id).title, '我的手动标题'); assert.equal(native.sends.length, 1);
    send(f.service, view.id, 'local', 'second work'); await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed'); assert.equal(calls, 1);
  } finally { await f.close(); }
});

test('explicit title action summarizes a legacy/manual name with exact revision and preserves a concurrent rename', async () => {
  const native = fake(); const open = native.executor.open; let release!: (title: string) => void; let calls = 0; let delayed = false;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { calls++; return delayed ? await new Promise<string>(resolve => { release = resolve; }) : '供应商入驻异常处理梳理'; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', { title: '旧版首句截取而来的一个很长很长的对话标题' }); send(f.service, view.id, 'local', 'inspect supplier');
    let current = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed'); assert.equal(calls, 0);
    await assert.rejects(f.service.conversations.generateTitle('workspace-one', view.id, { expectedRevision: view.revision }), { code: 'agent_revision_conflict' });
    current = await f.service.conversations.generateTitle('workspace-one', view.id, { expectedRevision: current.revision }); assert.equal(current.title, '供应商入驻异常处理梳理'); assert.equal(native.sends.length, 1);
    delayed = true; const pending = f.service.conversations.generateTitle('workspace-one', view.id, { expectedRevision: current.revision });
    await waitUntil(() => Boolean(release), Boolean); current = f.service.conversations.read('workspace-one', view.id); await f.service.conversations.update('workspace-one', view.id, { expectedRevision: current.revision, title: '保留我的最新命名' }); release('不能覆盖的新名字');
    await assert.rejects(pending, { code: 'agent_revision_conflict' }); assert.equal(f.service.conversations.read('workspace-one', view.id).title, '保留我的最新命名');
  } finally { await f.close(); }
});

test('oversized or failed title inference preserves the neutral name and reserves automatic budget across restart', async () => {
  const native = fake(); const open = native.executor.open; let calls = 0;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { calls++; return '这是一段超过二十四个汉字的冗长描述标题而不是精短标题必须拒绝'; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', 'first');
    await waitUntil(() => calls === 2, Boolean); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(f.service.conversations.read('workspace-one', view.id).titleState?.status,'failed'); assert.equal(f.service.conversations.read('workspace-one', view.id).title, '新对话');
    await f.service.close(); const restored = createAgentService(f.options);
    try { send(restored, view.id, 'local', 'after restart'); await waitUntil(() => restored.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed'); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(calls, 2); assert.equal(native.sends.length, 2); }
    finally { await restored.close(); }
  } finally { await f.close(); }
});

test('legacy records with the neutral default string do not imply automatic-title consent', async () => {
  const native = fake(); const open = native.executor.open; let calls = 0;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { calls++; return '明确授权后生成的精短标题'; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {});
    const db = new DatabaseSync(path.join(f.options.dataRoot, 'agent-service/conversations.sqlite'));
    try { db.prepare("UPDATE conversations SET body=json_remove(body,'$.titleOrigin') WHERE id=?").run(view.id); } finally { db.close(); }
    send(f.service, view.id, 'local', 'legacy neutral title');
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(calls, 0); assert.equal(done.title, '新对话');
    const named = await f.service.conversations.generateTitle('workspace-one', view.id, { expectedRevision: done.revision }); assert.equal(named.title, '明确授权后生成的精短标题'); assert.equal(calls, 1);
  } finally { await f.close(); }
});

test('native late title metadata updates the unified stream but cannot overwrite a manual title', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', 'first');
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    const subscription = f.service.conversations.subscribe('workspace-one', view.id); const iterator = subscription.events[Symbol.asyncIterator](); await iterator.next();
    native.sends[0]!.onEvent({ type: 'title', title: '原生延迟生成的业务标题' });
    const event = (await iterator.next()).value!; assert.equal(event.type, 'conversation'); assert.equal(event.payload.conversation.title, '原生延迟生成的业务标题'); subscription.close();
    let current = f.service.conversations.read('workspace-one', view.id); assert.equal(current.entries.length, done.entries.length); current = await f.service.conversations.update('workspace-one', view.id, { expectedRevision: current.revision, title: '手动标题' });
    native.sends[0]!.onEvent({ type: 'title', title: '不能覆盖手动名的原生标题' }); assert.equal(f.service.conversations.read('workspace-one', view.id).title, '手动标题');
  } finally { await f.close(); }
});


test('explicit title input retains the original topic and recent exchange with a bounded text-only budget', async () => {
  const native = fake(); const open = native.executor.open; let description = '';
  native.executor.open = async input => ({ ...await open(input), async generateTitle(input) { description = input.description; return '本地服务运行架构重构'; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', { title: '保留旧标题直到明确生成' });
    send(f.service, view.id, 'local', '重构本地服务运行架构' + '资料'.repeat(1500)); await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    send(f.service, view.id, 'local', '继续'); const done = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    await f.service.conversations.generateTitle('workspace-one', view.id, { expectedRevision: done.revision });
    const messages = JSON.parse(description).messages; assert.equal(messages.length, 4); assert.equal(messages[0].role, 'user'); assert.match(messages[0].text, /^重构本地服务运行架构/); assert.equal(messages[2].text, '继续'); assert.ok(Buffer.byteLength(description) < 8 * 1024); assert.ok(messages.every((entry: any) => ['user', 'assistant'].includes(entry.role) && Buffer.byteLength(entry.text) <= 1024));
  } finally { await f.close(); }
});

test('a delayed check cannot replace a newer native default with an older catalog or a late catalog failure', async t => {
  for (const outcome of ['older-catalog', 'catalog-failure'] as const) await t.test(outcome, async () => {
    const native = fake(); const open = native.executor.open; let defer = false; let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    let finish!: (models: Awaited<ReturnType<AgentRuntime['models']>>) => void; let reject!: (error: Error) => void;
    const pendingModels = new Promise<Awaited<ReturnType<AgentRuntime['models']>>>((resolve, fail) => { finish = resolve; reject = fail; });
    const catalog = (selected: string) => ['a', 'b'].map(id => ({ id, label: id, isDefault: id === selected, reasoningEfforts: [{ id: 'low', label: 'Low' }, { id: 'high', label: 'High' }], defaultReasoningEffort: id === 'b' && selected === 'b' ? 'high' : 'low' }));
    native.executor.open = async input => { const runtime = await open(input); return { ...runtime,
      async models() { if (!defer) return catalog('a'); entered(); return pendingModels; },
      async send(input) { input.onEvent({ type: 'models', models: catalog(input.model!) }); return runtime.send(input); },
    }; };
    const f = fixture([native.executor]);
    try {
      await connected(f.service, 'local'); defer = true;
      const check = f.service.connections.check('local', { expectedRevision: f.service.connections.read('local').revision }); await started;
      const view = await f.service.conversations.create('workspace-one', {});
      const draft = { expectedRevision: view.revision, connectionId: 'local', text: 'select b', model: 'b', reasoningEffort: 'high' };
      const preview = f.service.conversations.prepareSend('workspace-one', view.id, draft);
      f.service.conversations.send('workspace-one', view.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
      const done = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
      assert.equal(f.service.connections.read('local').models.find(model => model.isDefault)!.id, 'b');
      if (outcome === 'older-catalog') finish(catalog('a')); else reject(new Error('stale catalog request failed'));
      const result = await check; assert.equal(result.status, 'ready'); assert.equal(result.diagnostic, undefined);
      assert.equal(result.models.find(model => model.isDefault)!.id, 'b'); assert.equal(result.models.find(model => model.isDefault)!.defaultReasoningEffort, 'high');
      const next = f.service.conversations.prepareSend('workspace-one', view.id, { expectedRevision: done.revision, connectionId: 'local', text: 'use current default' });
      assert.equal(next.model, 'b'); assert.equal(next.reasoningEffort, 'high'); assert.equal(native.sends.length, 1);
    } finally { finish([]); await f.close(); }
  });
});

test('permission intent is preview-bound, capability-gated and persisted; switching and restore cannot inherit another turn permission', async () => {
  const a = fake('a'); const b = fake('b');
  const resumes: Array<{ provider: string; permissionMode: unknown }> = [];
  for (const native of [a, b]) {
    native.executor.descriptor.capabilities.permissionModes = ['default', 'full-access']; const open = native.executor.open;
    native.executor.open = async input => { const runtime = await open(input); runtime.capabilities.permissionModes = ['default', 'full-access']; return { ...runtime, async resumeContext(input) { resumes.push({ provider: native.executor.descriptor.id, permissionMode: input.permissionMode }); return runtime.resumeContext(input); } }; };
  }
  const f = fixture([a.executor, b.executor]);
  try {
    await connected(f.service, 'a'); await connected(f.service, 'b'); const chat = await f.service.conversations.create('workspace-one', {});
    const first = { expectedRevision: chat.revision, connectionId: 'a', text: 'first', permissionMode: 'full-access' as const };
    const preview = f.service.conversations.prepareSend('workspace-one', chat.id, first); assert.equal(preview.permissionMode, 'full-access');
    assert.throws(() => f.service.conversations.prepareSend('workspace-one', chat.id, { ...first, permissionMode: 'silent' as any }), { code: 'agent_permission_invalid' });
    assert.throws(() => f.service.conversations.send('workspace-one', chat.id, { ...first, permissionMode: 'default', previewToken: preview.token, clientRequestId: 'mode-request' }), { code: 'agent_preview_stale' }); assert.equal(a.sends.length, 0);
    f.service.conversations.send('workspace-one', chat.id, { ...first, previewToken: preview.token, clientRequestId: 'mode-request' });
    let done = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), value => value.run?.status === 'completed');
    assert.equal(done.run!.permissionMode, 'full-access'); assert.equal(a.sends[0]!.permissionMode, 'full-access');
    const firstObservationStart = resumes.length; done = await f.service.conversations.observe('workspace-one', chat.id);
    assert.equal(done.run!.permissionMode, 'full-access'); assert.deepEqual(resumes.slice(firstObservationStart), [{ provider: 'a', permissionMode: undefined }]);
    assert.throws(() => f.service.conversations.send('workspace-one', chat.id, { ...first, permissionMode: 'default', previewToken: preview.token, clientRequestId: 'mode-request' }), { code: 'agent_request_conflict' });
    const switchDraft = { expectedRevision: done.revision, connectionId: 'b', text: 'switch', permissionMode: done.run!.permissionMode };
    const switched = f.service.conversations.prepareSend('workspace-one', chat.id, switchDraft); f.service.conversations.send('workspace-one', chat.id, { ...switchDraft, previewToken: switched.token, clientRequestId: randomUUID() });
    done = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), value => value.run?.status === 'completed'); assert.equal(b.sends[0]!.permissionMode, 'full-access');
    const newChat = await f.service.conversations.create('workspace-one', {}); assert.equal(f.service.conversations.prepareSend('workspace-one', newChat.id, { expectedRevision: newChat.revision, connectionId: 'a', text: 'fresh' }).permissionMode, 'default');
    await f.service.close(); const restored = createAgentService(f.options);
    try {
      assert.equal(restored.conversations.read('workspace-one', chat.id).run!.permissionMode, 'full-access');
      const observationStart = resumes.length; done = await restored.conversations.observe('workspace-one', chat.id);
      assert.equal(done.run!.permissionMode, 'full-access'); assert.deepEqual(resumes.slice(observationStart), [{ provider: 'a', permissionMode: undefined }, { provider: 'b', permissionMode: undefined }]);
      const defaultDraft = { expectedRevision: done.revision, connectionId: 'a', text: 'default again' }; const reset = restored.conversations.prepareSend('workspace-one', chat.id, defaultDraft); assert.equal(reset.permissionMode, 'default');
      restored.conversations.send('workspace-one', chat.id, { ...defaultDraft, previewToken: reset.token, clientRequestId: randomUUID() });
      done = await waitUntil(() => restored.conversations.read('workspace-one', chat.id), value => value.run?.status === 'completed'); assert.equal(done.run!.permissionMode, 'default'); assert.equal(a.sends[1]!.permissionMode, 'default'); assert.equal(a.sends[1]!.contextRef.id, a.sends[0]!.contextRef.id);
      assert.ok(resumes.some(value => value.provider === 'a' && value.permissionMode === 'default'));
    } finally { await restored.close(); }
  } finally { await f.close(); }
});

test('undeclared permission capabilities remain default-only and rejection never dispatches a work instruction', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    const draft = { expectedRevision: chat.revision, connectionId: 'local', text: 'work' };
    assert.equal(f.service.conversations.prepareSend('workspace-one', chat.id, draft).permissionMode, 'default');
    assert.throws(() => f.service.conversations.prepareSend('workspace-one', chat.id, { ...draft, permissionMode: 'full-access' }), { code: 'agent_permission_unavailable' });
    assert.equal(native.sends.length, 0); assert.equal(native.contexts.size, 0);
  } finally { await f.close(); }
});

test('a native permission readback failure before prompt is a failed delivery, not an ambiguous execution', async () => {
  const { AgentServiceError } = await import('../../src/index.ts'); const native = fake(); const open = native.executor.open;
  native.executor.open = async input => ({ ...await open(input), async send() { throw new AgentServiceError('agent_permission_unverified', '本次工作指令尚未交付。', 409); } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {}); send(f.service, chat.id, 'local', 'do not send before permissions verified');
    const failed = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), value => value.run?.status === 'failed'); assert.equal(failed.run!.accepted, false); assert.equal(failed.entries[0]!.status, 'failed'); assert.equal(native.sends.length, 0);
    assert.equal(f.service.conversations.prepareSend('workspace-one', chat.id, { expectedRevision: failed.revision, connectionId: 'local', text: 'corrected explicit retry' }).permissionMode, 'default');
  } finally { await f.close(); }
});

test('a typed reasoning rejection before acceptance fails delivery and allows choosing a supported level', async () => {
  const { AgentServiceError } = await import('../../src/index.ts'); const native = fake(); const open = native.executor.open;
  native.executor.open = async input => {
    const runtime = await open(input);
    return { ...runtime, async models() { return [{ id: 'test-model', label: 'Model', reasoningEfforts: [{ id: 'high', label: 'High' }, { id: 'ultra', label: 'Ultra' }] }]; }, async send(input) {
      if (input.reasoningEffort === 'ultra') throw new AgentServiceError('agent_reasoning_unavailable', 'This level cannot be delivered to the native prompt.');
      return runtime.send(input);
    } };
  };
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    const submit = (reasoningEffort: string) => {
      const view = f.service.conversations.read('workspace-one', chat.id), draft = { expectedRevision: view.revision, connectionId: 'local', model: 'test-model', text: 'read with the selected level', reasoningEffort };
      const preview = f.service.conversations.prepareSend('workspace-one', chat.id, draft);
      return f.service.conversations.send('workspace-one', chat.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
    };
    submit('ultra');
    const rejected = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), value => value.run?.status === 'failed' || value.run?.status === 'unknown');
    assert.equal(rejected.run!.status, 'failed'); assert.equal(rejected.run!.accepted, false); assert.equal(rejected.entries[0]!.status, 'failed'); assert.equal(native.sends.length, 0);
    submit('high');
    const completed = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), value => value.run?.status === 'completed');
    assert.equal(completed.run!.accepted, true); assert.equal(completed.run!.reasoningEffort, 'high'); assert.equal(native.sends.length, 1); assert.equal(native.sends[0]!.reasoningEffort, 'high');
  } finally { await f.close(); }
});

test('accepted or untyped reasoning errors remain ambiguous and cannot authorize a retry', async t => {
  const { AgentServiceError } = await import('../../src/index.ts');
  for (const accepted of [false, true]) await t.test(accepted ? 'accepted typed error' : 'unaccepted untyped error', async () => {
    const native = fake(); const open = native.executor.open;
    native.executor.open = async input => ({ ...await open(input), async send(input) {
      if (accepted) input.onEvent({ type: 'accepted', executionRef: { id: 'accepted-before-error' } });
      throw accepted ? new AgentServiceError('agent_reasoning_unavailable', 'The accepted turn later failed.') : new Error('agent_reasoning_unavailable');
    } });
    const f = fixture([native.executor]);
    try {
      await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {}); send(f.service, chat.id, 'local', 'possibly delivered input');
      const unknown = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), value => value.run?.status === 'unknown');
      assert.equal(unknown.run!.accepted, accepted); assert.equal(unknown.entries[0]!.status, accepted ? 'accepted' : 'unknown');
      assert.throws(() => send(f.service, chat.id, 'local', 'do not resend uncertain input'), { code: 'agent_conversation_busy' });
    } finally { await f.close(); }
  });
});

test('unsupported or rejected individual tool stop preserves the whole-run state and trusted tool observations', async t => {
  for (const support of [undefined, false, true]) await t.test(String(support), async () => {
    const native = fake('local', { toolSurvives: true }); const open = native.executor.open; let stopCalls = 0;
    native.executor.open = async input => { const runtime = await open(input); return { ...runtime, async observe(input) { const observation = await runtime.observe(input); observation.tools = observation.tools.map(tool => ({ ...tool, canStop: support })); return observation; }, async stop() { stopCalls++; throw new Error('cannot stop exact native tool'); } }; };
    const f = fixture([native.executor]);
    try {
      await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {}); send(f.service, chat.id, 'local', 'background tool');
      const before = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), value => value.run?.status === 'tools-active');
      await assert.rejects(f.service.conversations.stop('workspace-one', chat.id, { expectedRevision: before.revision, runId: before.run!.id, participantId: before.run!.participantId, generation: before.run!.generation, toolId: 'own-tool' }), { code: support === true ? 'agent_tool_stop_failed' : 'agent_tool_stop_unavailable' });
      assert.deepEqual(f.service.conversations.read('workspace-one', chat.id), before); assert.equal(stopCalls, support === true ? 1 : 0);
    } finally { await f.close(); }
  });
});


test('legacy runs and accepted request digests without a mode stay default-compatible without reexecution', async () => {
  const native = fake(); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {}); send(f.service, chat.id, 'local', 'legacy accepted input', 'legacy-mode-request');
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), value => value.run?.status === 'completed');
    const db = new DatabaseSync(path.join(f.options.dataRoot, 'agent-service/conversations.sqlite'));
    try {
      const row = db.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id) as { body: string }; const record = JSON.parse(row.body); delete record.view.run.permissionMode;
      record.attempts[0].inputDigest = createHash('sha256').update(JSON.stringify({ connectionId: 'local', text: 'legacy accepted input', attachmentIds: [] })).digest('hex');
      db.prepare('UPDATE conversations SET body=? WHERE id=?').run(JSON.stringify(record), chat.id);
    } finally { db.close(); }
    const repeated = f.service.conversations.send('workspace-one', chat.id, { expectedRevision: done.revision, connectionId: 'local', text: 'legacy accepted input', permissionMode: 'default', previewToken: 'not-used-for-an-already-accepted-request', clientRequestId: 'legacy-mode-request' });
    assert.equal(repeated.run.id, done.run!.id); assert.equal(repeated.run.permissionMode, undefined); assert.equal(native.sends.length, 1);
    const preview = f.service.conversations.prepareSend('workspace-one', chat.id, { expectedRevision: done.revision, connectionId: 'local', text: 'new input' }); assert.equal(preview.permissionMode, 'default');
  } finally { await f.close(); }
});

test('context usage stores the latest executor observation and ignores invalid counts', async () => {
  const native=fake('local',{hold:true});const f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
    await send(f.service,created.id,'local','usage observation');
    await waitUntil(()=>native.sends.length,value=>value===1);
    native.sends[0]!.onEvent({type:'context-usage',usedTokens:12000,windowTokens:500000});
    assert.deepEqual(f.service.conversations.read('workspace-one',created.id).run?.contextUsage,{usedTokens:12000,windowTokens:500000});
    native.sends[0]!.onEvent({type:'context-usage',usedTokens:-1});
    assert.equal(f.service.conversations.read('workspace-one',created.id).run?.contextUsage?.usedTokens,12000);
  } finally {await f.close();}
});

test('tool result updates preserve original invocation input and name across history reconciliation', async () => {
  const native=fake('local',{toolInput:true}),f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
    send(f.service,created.id,'local','read file');
    await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),view=>view.run?.status==='completed');
    const view=await f.service.conversations.observe('workspace-one',created.id);
    const tool=view.entries.find(entry=>entry.kind==='tool');
    assert.equal(tool?.name,'read');assert.equal(tool?.input,'{"file_path":"src/example.ts"}');assert.equal(tool?.text,'file content');
    assert.equal(view.entries.filter(entry=>entry.kind==='tool').length,1);
  } finally { await f.close(); }
});


test('only long material invokes isolated old-model summarization; payload and receipt freeze the same body',async()=>{
 let calls=0;const a=fake('a',{summary:async()=>{calls++;return 'unique auxiliary summary: verify the directory';}}),b=fake('b'),c=fake('c');
 b.executor.descriptor.capabilities.maxInputBytes=8192;
 const f=fixture([a.executor,b.executor,c.executor]);
 try{
  for(const id of ['a','b','c'])await connected(f.service,id);
  const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','x'.repeat(12000));const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const draft={expectedRevision:done.revision,connectionId:'b',text:'continue'};
  const skipped=await f.service.conversations.prepareHandoff('workspace-one',chat.id,{...draft,skipHandoffSummary:true});assert.equal(skipped.handoff!.mode,'indexed');assert.equal(calls,0);
  const preview=await f.service.conversations.prepareHandoff('workspace-one',chat.id,draft);
  assert.equal(preview.handoff!.mode,'summary');assert.equal(calls,1);assert.equal(a.sends.length,1,'summary must not enter the work context');
  f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:'summarized'});
  const second=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  assert.equal(b.sends[0]!.text,preview.handoff!.body);assert.equal(second.entries.find(e=>e.kind==='handoff')!.handoff!.body,b.sends[0]!.text);
  assert.equal(second.entries.find(e=>e.kind==='handoff')!.status,'accepted');assert.equal(calls,1);
  const next=await f.service.conversations.prepareHandoff('workspace-one',chat.id,{expectedRevision:second.revision,connectionId:'c',text:'continue again'});
  assert.ok(!next.handoff!.body.includes('unique auxiliary summary'),'next material must derive from local originals, not the previous packet');
  assert.equal(calls,1);
 }finally{await f.close();}
});

test('quota failure preserves long local source records and still permits handoff',async()=>{
 let calls=0;const a=fake('a',{summary:async()=>{calls++;throw new Error('quota exhausted');}}),b=fake('b');b.executor.descriptor.capabilities.maxInputBytes=8192;
 const f=fixture([a.executor,b.executor]);
 try{
  await connected(f.service,'a');await connected(f.service,'b');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','user original '.repeat(1500));const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const draft={expectedRevision:done.revision,connectionId:'b',text:'continue'};const preview=await f.service.conversations.prepareHandoff('workspace-one',chat.id,draft);
  assert.equal(preview.handoff!.mode,'indexed');assert.equal(preview.fits,true);assert.equal(calls,1);
  const index=JSON.parse(fs.readFileSync(preview.handoff!.sourcePath!,'utf8'));const source=JSON.parse(fs.readFileSync(index.rounds[0].path,'utf8'));
  assert.equal(source.records[0].text,'user original '.repeat(1500));
  f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:'quota-fallback'});
  await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');assert.equal(b.sends.length,1);
 }finally{await f.close();}
});

test('a delayed summary cannot bypass a changed conversation revision',async()=>{
 let release!:(text:string)=>void;let entered!:()=>void;const started=new Promise<void>(resolve=>entered=resolve);
 const a=fake('a',{summary:async()=>{entered();return new Promise(resolve=>release=resolve);}}),b=fake('b');b.executor.descriptor.capabilities.maxInputBytes=8192;
 const f=fixture([a.executor,b.executor]);
 try{
  await connected(f.service,'a');await connected(f.service,'b');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','x'.repeat(12000));const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const pending=f.service.conversations.prepareHandoff('workspace-one',chat.id,{expectedRevision:done.revision,connectionId:'b',text:'continue'});
  await started;await f.service.conversations.update('workspace-one',chat.id,{expectedRevision:done.revision,title:'new title'});release('summary');
  await assert.rejects(pending,{code:'agent_revision_conflict'});assert.equal(b.sends.length,0);
 }finally{await f.close();}
});


test('answers retain the original question and run when another executor takes over',async()=>{
 const a=fake('a',{request:true}),b=fake('b'),f=fixture([a.executor,b.executor]);
 try{
  await connected(f.service,'a');await connected(f.service,'b');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','make the approved change');
  const waiting=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='waiting-approval');
  const request=waiting.requests[0]!,run=waiting.run!;
  await f.service.conversations.reply('workspace-one',chat.id,request.id,{expectedRevision:waiting.revision,runId:run.id,participantId:run.participantId,generation:run.generation,answer:'allow-once'});
  const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const answer=done.entries.find(e=>e.id==='reply-'+request.id)!;assert.equal(answer.runId,run.id);assert.equal(answer.status,'accepted');
  const preview=f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:done.revision,connectionId:'b',text:'continue'});
  assert.equal(preview.handoff!.rounds.length,1);assert.equal(preview.handoff!.rounds[0]!.userInputs.length,2);
  assert.ok(preview.handoff!.body.includes('Write a file?'));assert.ok(preview.handoff!.body.includes('allow-once'));assert.ok(preview.handoff!.body.includes('一次性'));
 }finally{await f.close();}
});


test('historical images have readable references and do not permanently block text-only handoff',async()=>{
 const a=fake('a',{images:true}),b=fake('b'),f=fixture([a.executor,b.executor]);
 try{
  await connected(f.service,'a');await connected(f.service,'b');const chat=await f.service.conversations.create('workspace-one',{});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
  const image=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:chat.revision,mimeType:'image/png',bytes:png});
  const draft={expectedRevision:image.revision,connectionId:'a',text:'read the image',attachmentIds:[image.id]},p=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
  f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:p.token,clientRequestId:'image'});
  const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const next={expectedRevision:done.revision,connectionId:'b',text:'continue with the textual findings'},preview=f.service.conversations.prepareSend('workspace-one',chat.id,next);
  assert.equal(preview.fits,true);assert.ok(preview.handoff!.body.includes('historicalImages'));assert.ok(preview.handoff!.body.includes(image.id));
  f.service.conversations.send('workspace-one',chat.id,{...next,previewToken:preview.token,clientRequestId:'text-handoff'});
  await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');assert.equal(b.sends[0]!.images.length,0);
 }finally{await f.close();}
});


test('the third executor still sees the first run failure after a later successful run',async()=>{
 const a=fake('a',{failure:'first run failed after work'}),b=fake('b'),c=fake('c'),f=fixture([a.executor,b.executor,c.executor]);
 try{
  for(const id of ['a','b','c'])await connected(f.service,id);const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','first attempt');await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='failed');
  send(f.service,chat.id,'b','continue carefully');const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const preview=f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:done.revision,connectionId:'c',text:'continue'});
  const first=preview.handoff!.rounds[0]!;assert.equal(first.state,'failed');assert.equal(first.diagnostic,'first run failed after work');assert.equal(first.provider,'a');
  assert.ok(preview.handoff!.body.includes('first run failed after work'));
 }finally{await f.close();}
});

test('an uncertain handoff receipt stays uncertain and repeated submission never starts a second execution',async()=>{
 const a=fake('a'),b=fake('b',{unknown:true}),f=fixture([a.executor,b.executor]);
 try{
  await connected(f.service,'a');await connected(f.service,'b');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','inspect first');const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const draft={expectedRevision:done.revision,connectionId:'b',text:'continue'},p=f.service.conversations.prepareSend('workspace-one',chat.id,draft),input={...draft,previewToken:p.token,clientRequestId:'uncertain-handoff'};
  f.service.conversations.send('workspace-one',chat.id,input);const unknown=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='unknown');
  const receipt=unknown.entries.find(e=>e.kind==='handoff')!;assert.equal(receipt.status,'unknown');assert.equal(receipt.handoff!.body,b.sends[0]!.text);
  f.service.conversations.send('workspace-one',chat.id,input);assert.equal(b.sends.length,1);assert.equal(f.service.conversations.read('workspace-one',chat.id).run!.accepted,false);
  assert.throws(()=>f.service.conversations.prepareSend('workspace-one',chat.id,{...draft,expectedRevision:unknown.revision}),{code:'agent_conversation_busy'});
 }finally{await f.close();}
});


test('correcting a failed question response retains both user inputs and the accepted answer',async()=>{
 const a=fake('a',{request:true}),b=fake('b'),f=fixture([a.executor,b.executor]);
 try{
  await connected(f.service,'a');await connected(f.service,'b');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'a','continue after my answer');
  const waiting=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='waiting-approval'),run=waiting.run!,req=waiting.requests[0]!;
  const identity={runId:run.id,participantId:run.participantId,generation:run.generation};
  await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,req.id,{...identity,expectedRevision:waiting.revision,answer:'invalid-option'}));
  const current=f.service.conversations.read('workspace-one',chat.id);
  await f.service.conversations.reply('workspace-one',chat.id,req.id,{...identity,expectedRevision:current.revision,answer:'allow-once'});
  const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const replies=done.entries.filter(e=>e.id.startsWith('reply-'+req.id));assert.equal(replies.length,2);assert.equal(replies[0]!.status,'unknown');assert.equal(replies[1]!.status,'accepted');assert.ok(replies[1]!.text.includes('allow-once'));
  const next=f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:done.revision,connectionId:'b',text:'continue'});assert.equal(next.handoff!.rounds[0]!.userInputs.length,3);
 }finally{await f.close();}
});

test('host shutdown records its own interruption without relabelling a user stop or replaying work',async()=>{
 for(const userStop of [false,true]){const native=fake('local',{hold:true}),f=fixture([native.executor]);try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work once');
  const running=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.accepted===true);
  if(userStop)await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:running.revision,runId:running.run!.id,participantId:running.run!.participantId,generation:running.run!.generation});
  await f.service.close();const db=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'),{readOnly:true});try{const row=db.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id) as {body:string};const record=JSON.parse(row.body);if(userStop)assert.ok(!record.view.run.diagnostic?.includes('宿主退出'));else assert.match(record.view.run.diagnostic,/宿主退出/);}finally{db.close();}assert.equal(native.sends.length,1);
 }finally{await f.close();}}
});


test('development startup continues a confirmed host interruption once; released startup leaves unfinished work visible',async()=>{
  for(const development of [false,true]){
    const native=fake('local',{hold:true}),f=fixture([native.executor],{autoContinueInterrupted:development});
    let cold:ReturnType<typeof createAgentService>|undefined;
    try{
      await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
      send(f.service,created.id,'local','finish the goal');
      await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),view=>view.run?.accepted===true);
      await f.service.close();cold=createAgentService(f.options);
      await Promise.all([cold.conversations.recoverInterrupted(),cold.conversations.recoverInterrupted()]);
      const view=cold.conversations.read('workspace-one',created.id);
      if(development){
        await waitUntil(()=>native.sends.length,count=>count===2);
        assert.equal(view.entries.filter(entry=>entry.role==='user').length,1);
        assert.ok(view.entries.some(entry=>entry.role==='system'&&entry.text.startsWith('系统自动恢复')));
        assert.equal(native.sends[1]!.contextRef.id,native.sends[0]!.contextRef.id);
        assert.equal(native.sends[1]!.clientRequestId.startsWith('host-recovery:'),true);
      }else{
        assert.equal(native.sends.length,1);assert.equal(view.run?.interrupted,true);assert.match(view.run!.diagnostic!,/执行未完成/);
      }
    }finally{await cold?.close();await f.close();}
  }
});

test('startup never continues user stops, unresolved approvals or unconfirmed native identities',async()=>{
  for(const kind of ['user-stop','approval','unknown'] as const){
    const native=fake('local',{hold:true,request:kind==='approval',coldUnknown:kind==='unknown'}),f=fixture([native.executor],{autoContinueInterrupted:true});
    let cold:ReturnType<typeof createAgentService>|undefined;
    try{
      await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
      send(f.service,created.id,'local','work');
      const running=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),view=>view.run?.accepted===true);
      if(kind==='user-stop')await f.service.conversations.stop('workspace-one',created.id,{expectedRevision:running.revision,runId:running.run!.id,participantId:running.run!.participantId,generation:running.run!.generation});
      await f.service.close();cold=createAgentService(f.options);await cold.conversations.recoverInterrupted();
      assert.equal(native.sends.length,1);
      if(kind!=='user-stop')assert.equal(cold.conversations.read('workspace-one',created.id).run?.interrupted,true);
    }finally{await cold?.close();await f.close();}
  }
});


test('recovery observes live work without resending and refuses active or uncertain tools',async()=>{
  for(const observed of ['running','tools-active','unknown-tool'] as const){
    const native=fake('local',{hold:true}),f=fixture([native.executor],{autoContinueInterrupted:true});
    let cold:ReturnType<typeof createAgentService>|undefined;
    try{
      await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});send(f.service,created.id,'local','work');
      await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),view=>view.run?.accepted===true);
      await f.service.close();const context=[...native.contexts.values()][0]!;
      context.observation={...context.observation,status:observed==='running'?'running':'stopped',tools:observed==='running'?[]:[{id:'tool',label:'work',status:observed==='tools-active'?'running':'unknown',canStop:false}]};
      cold=createAgentService(f.options);await cold.conversations.recoverInterrupted();
      assert.equal(native.sends.length,1);const view=cold.conversations.read('workspace-one',created.id);
      assert.equal(view.run?.interrupted,observed==='running'?undefined:true);
    }finally{await cold?.close();await f.close();}
  }
});


test('live transport loss reopens the same binding and continues once without a host restart', async () => {
  const native = fake('local', {disconnect:'stopped'}), f = fixture([native.executor], {autoContinueInterrupted:true});
  try {
    await connected(f.service,'local'); const chat = await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','finish my work');
    const done = await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
    await Promise.all([f.service.conversations.recoverInterrupted(),f.service.conversations.observe('workspace-one',chat.id)]);
    assert.equal(native.sends.length,2);
    assert.equal(native.opens.length,2);
    assert.equal(native.opens[0]!.configRoot,native.opens[1]!.configRoot);
    assert.equal(native.sends[0]!.contextRef.id,native.sends[1]!.contextRef.id);
    assert.match(native.sends[1]!.text,/系统自动恢复.*执行观察中断/);
    assert.equal(done.entries.filter(e=>e.role==='user').length,1);
  } finally { await f.close(); }
});

test('live recovery never resends active work, unknown tools, pending decisions or release-profile work', async () => {
  for (const disconnectError of ['codex_execution_observation_lost','dsh_execution_observation_lost','qoder_execution_observation_lost']) for (const kind of ['running','unknown','tool','approval','release'] as const) {
    const native=fake('local',{disconnectError,disconnect:kind==='approval'||kind==='release'?'stopped':kind,request:kind==='approval'});
    const f=fixture([native.executor],{autoContinueInterrupted:kind!=='release'});
    try {
      await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work');
      await waitUntil(()=>native.opens.length,n=>n===2);
      await Promise.all([f.service.conversations.recoverInterrupted(),f.service.conversations.recoverInterrupted()]);
      const view=f.service.conversations.read('workspace-one',chat.id);
      assert.equal(native.sends.length,1);
      if(kind==='running')assert.equal(view.run?.status,'running');
      else assert.equal(view.run?.interrupted,true);
    } finally { await f.close(); }
  }
});

test('a user stop before transport loss cannot turn into automatic continuation', async () => {
  let release!:()=>void;const beforeDisconnect=new Promise<void>(resolve=>{release=resolve;});
  const native=fake('local',{disconnect:'stopped',beforeDisconnect}),f=fixture([native.executor],{autoContinueInterrupted:true});
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work');
    const view=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.accepted===true),run=view.run!;
    await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:view.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
    release();await f.service.conversations.recoverInterrupted();
    assert.equal(native.sends.length,1);
  } finally {release();await f.close();}
});


test('a failed automatic continuation has no unbounded transport retry chain', async () => {
  const native=fake('local',{disconnect:'stopped',disconnectAlways:true}),f=fixture([native.executor],{autoContinueInterrupted:true});
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work');
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>native.sends.length===2&&v.run?.status==='unknown');
    await Promise.all([f.service.conversations.recoverInterrupted(),f.service.conversations.recoverInterrupted()]);
    assert.equal(native.sends.length,2);
  }finally{await f.close();}
});

test('legacy accepted unknown runs are reconciled at startup without inventing continuation consent', async () => {
  const native=fake('local',{hold:true}),f=fixture([native.executor],{autoContinueInterrupted:true});let cold:ReturnType<typeof createAgentService>|undefined;
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work');
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.accepted===true);
    await f.service.close();
    const db=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'));
    try {
      const row=db.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id) as {body:string};const record=JSON.parse(row.body);
      delete record.interruption;record.view.run.status='unknown';record.view.run.diagnostic='原生智能体连接未完成，请检查程序、独立登录及兼容版本。';
      db.prepare('UPDATE conversations SET body=? WHERE id=?').run(JSON.stringify(record),chat.id);
    }finally{db.close();}
    cold=createAgentService(f.options);await cold.conversations.recoverInterrupted();
    const view=cold.conversations.read('workspace-one',chat.id);
    assert.equal(view.run?.status,'stopped');assert.equal(native.sends.length,1);
    assert.match(view.run!.diagnostic!,/已确认停止/);
    assert.doesNotThrow(()=>cold!.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:view.revision,connectionId:'local',text:'continue'}));
  }finally{await cold?.close();await f.close();}
});


test('model-account transport recovery replaces both caches without changing account or participant', async () => {
  const native=fake('codex',{disconnect:'stopped'});
  const f=fixture([native.executor],{autoContinueInterrupted:true,modelProviders:[{id:'fixture',label:'Fixture',async open(){return{protocol:'chat-completions',async inspect(){return{status:'ready',models:[{id:'test-model',label:'Test',images:false,tools:true}]};},async beginLogin(){},async cancelLogin(){},async infer(){throw Error('unused');},async close(){}};}}]});
  try {
    await connected(f.service,'codex');const account=await f.service.models.accounts.add({provider:'fixture'}),checked=await f.service.models.accounts.check(account.id);
    await f.service.models.accounts.preferences(account.id,{expectedRevision:checked.revision,models:[{id:'test-model',enabled:true}]});
    const chat=await f.service.conversations.create('workspace-one',{}),draft={expectedRevision:chat.revision,connectionId:'codex',modelAccountId:account.id,model:'test-model',text:'finish once'};
    const preview=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
    f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:'model-recovery'});
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
    assert.equal(native.sends.length,2);assert.equal(done.participants.length,1);assert.equal(done.run?.modelAccountId,account.id);
    assert.equal(native.sends[0]!.contextRef.id,native.sends[1]!.contextRef.id);
    const gateways=native.opens.filter(input=>input.gateway);assert.equal(gateways.length,2);assert.equal(gateways[0]!.configRoot,gateways[1]!.configRoot);assert.equal(gateways[0]!.gateway!.identity,gateways[1]!.gateway!.identity);
  }finally{await f.close();}
});

test('a user stop during reconnection cancels the pending automatic continuation', async () => {
  let release!:()=>void;const beforeResume=new Promise<void>(resolve=>{release=resolve;});
  const native=fake('local',{disconnect:'stopped',beforeResume}),f=fixture([native.executor],{autoContinueInterrupted:true});
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','work');
    await waitUntil(()=>native.opens.length,n=>n===2);
    const view=f.service.conversations.read('workspace-one',chat.id),run=view.run!;
    await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:view.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
    release();await f.service.conversations.recoverInterrupted();assert.equal(native.sends.length,1);
  }finally{release();await f.close();}
});


test('a later exact stopped observation releases uncertain recovery once',async()=>{
  const native=fake('local',{disconnect:'unknown'}),f=fixture([native.executor],{autoContinueInterrupted:true});
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','finish');
    await waitUntil(()=>native.opens.length,n=>n===2);await f.service.conversations.recoverInterrupted();assert.equal(native.sends.length,1);
    const context=[...native.contexts.values()][0]!;context.observation={...context.observation,status:'stopped',tools:[]};
    await Promise.all([f.service.conversations.observe('workspace-one',chat.id),f.service.conversations.observe('workspace-one',chat.id)]);
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');assert.equal(native.sends.length,2);
  }finally{await f.close();}
});


test('a pinned database reader cannot block conversation event persistence',async()=>{
  const native=fake('local'),f=fixture([native.executor]);let reader:DatabaseSync|undefined;
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    reader=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'),{readOnly:true});
    reader.exec('BEGIN');reader.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id);
    const updated=await f.service.conversations.update('workspace-one',chat.id,{expectedRevision:chat.revision,title:'updated while native tool reads'});
    assert.equal(updated.title,'updated while native tool reads');
    const old=JSON.parse((reader.prepare('SELECT body FROM conversations WHERE id=?').get(chat.id) as {body:string}).body);
    assert.equal(old.view.title,'新对话');reader.exec('ROLLBACK');reader.close();reader=undefined;
    assert.equal(f.service.conversations.read('workspace-one',chat.id).title,updated.title);
  }finally{reader?.close();await f.close();}
});

test('unavailable title generation is recorded once and a restart recovers interrupted title metadata without resending', async () => {
  const native=fake(),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const view=await f.service.conversations.create('workspace-one',{});send(f.service,view.id,'local','work');
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',view.id),value=>value.titleState?.status==='unavailable');
    assert.equal(done.title,'新对话');assert.ok(done.titleState?.reason);assert.equal(native.sends.length,1);
    await f.service.close();
    const db=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'));
    db.prepare("UPDATE conversations SET body=json_set(body,'$.view.titleState.status','generating') WHERE id=?").run(view.id);db.close();
    const restored=createAgentService(f.options);
    try{await restored.conversations.recoverInterrupted();const recovered=restored.conversations.read('workspace-one',view.id);assert.equal(recovered.titleState?.status,'failed');assert.match(recovered.titleState?.reason??'',/重启/);assert.equal(native.sends.length,1);}finally{await restored.close();}
  }finally{await f.close();}
});

test('a delayed early title failure after work completion still runs exactly one completion fallback', async () => {
  const native=fake('local',{hold:true}),open=native.executor.open;
  let rejectEarly!: (error:Error)=>void;let calls=0;
  native.executor.open=async input=>({...await open(input),async generateTitle(){calls++;if(calls===1)return await new Promise<string>((_,reject)=>{rejectEarly=reject;});return '完成后可靠回填的标题';}});
  const f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
    send(f.service,created.id,'local','准备标题时工作先完成');
    await waitUntil(()=>calls,n=>n===1);
    for(const context of native.contexts.values())context.unblock?.();
    await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed');
    assert.equal(calls,1);rejectEarly(new Error('agent_title_timeout'));
    const named=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.title==='完成后可靠回填的标题');
    assert.equal(calls,2);assert.equal(named.titleState?.status,'generated');assert.equal(native.sends.length,1);
    const db=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'),{readOnly:true});
    const stored=JSON.parse((db.prepare('select body from conversations where id=?').get(created.id) as {body:string}).body);db.close();
    assert.equal(stored.titleDiagnostics[0].code,'agent_title_timeout');assert.equal(stored.titleDiagnostics[0].phase,'early');
    assert.equal(stored.earlyTitleAttempted,true);assert.equal(stored.titleAttempted,true);
  }finally{rejectEarly?.(new Error('agent_title_cancelled'));await f.close();}
});

test('early title failures are visible, safe and persistent without replaying work',async()=>{
  const native=fake('local',{hold:true}),open=native.executor.open;
  native.executor.open=async input=>({...await open(input),async generateTitle(){throw new Error('agent_title_isolation_unverified');}});
  const f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});send(f.service,created.id,'local','独立标题失败不影响工作');
    const failed=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.titleState?.status==='failed');
    assert.match(failed.titleState!.reason!,/agent_title_isolation_unverified/);assert.match(failed.titleState!.reason!,/隔离权限/);assert.equal(failed.title,'新对话');
    await waitUntil(()=>native.sends.length,n=>n===1);
    const db=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'),{readOnly:true});
    const stored=JSON.parse((db.prepare('select body from conversations where id=?').get(created.id) as {body:string}).body);db.close();
    assert.equal(stored.titleDiagnostics.length,1);assert.equal(stored.titleDiagnostics[0].runId,failed.run!.id);assert.ok(stored.titleDiagnostics[0].at);
    assert.equal(stored.titleAttempted,undefined);assert.equal(stored.earlyTitleAttempted,true);
    await f.service.close();const restored=createAgentService(f.options);try{assert.match(restored.conversations.read('workspace-one',created.id).titleState!.reason!,/隔离权限/);}finally{await restored.close();}
    assert.equal(native.sends.length,1);
  }finally{await f.close();}
});


test('manual title refresh failure leaves a persisted safe reason and preserves the existing title',async()=>{
  const native=fake(),open=native.executor.open;
  native.executor.open=async input=>({...await open(input),async generateTitle(){throw new Error('Bearer private-secret arbitrary vendor error');}});
  const f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{title:'用户的名字'});send(f.service,chat.id,'local','工作');
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
    await assert.rejects(f.service.conversations.generateTitle('workspace-one',chat.id,{expectedRevision:done.revision}));
    const current=f.service.conversations.read('workspace-one',chat.id);assert.equal(current.title,'用户的名字');assert.equal(current.titleState?.status,'failed');
    assert.match(current.titleState!.reason!,/agent_title_failed/);assert.doesNotMatch(current.titleState!.reason!,/private-secret|Bearer|vendor/);assert.equal(native.sends.length,1);
    const db=new DatabaseSync(path.join(f.options.dataRoot,'agent-service/conversations.sqlite'),{readOnly:true});
    const body=(db.prepare('select body from conversations where id=?').get(chat.id) as {body:string}).body;db.close();
    assert.doesNotMatch(body,/private-secret|Bearer|vendor/);assert.equal(JSON.parse(body).titleDiagnostics[0].phase,'manual');
  }finally{await f.close();}
});

test('video keeps original bytes, timed visual inputs, history sources and referenced frames across expiry and restart', async () => {
  const native=fake('visual',{images:true}),reader=fake('reader');let now=new Date('2026-10-28T00:00:00Z');
  const f=fixture([native.executor,reader.executor],{now:()=>now});
  const png=Buffer.from('89504e470d0a1a0a','hex'),mp4=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
  try {
    await connected(f.service,'visual');await connected(f.service,'reader');
    const chat=await f.service.conversations.create('workspace-one',{});
    const upload=(mimeType:string,bytes:Buffer,video?:{duration:number;frames:Array<{id:string;time:number}>})=>f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:f.service.conversations.read('workspace-one',chat.id).revision,mimeType,bytes,video});
    const frames=Array.from({length:8},(_,i)=>({id:upload('image/png',png).id,time:i*2}));
    const video=upload('video/mp4',mp4,{duration:14.4,frames});
    const draft={expectedRevision:video.revision,connectionId:'visual',text:'inspect the recording',attachmentIds:[video.id]};
    const preview=f.service.conversations.prepareSend('workspace-one',chat.id,draft);assert.equal(preview.fits,true);
    f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:'video-input'});
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
    assert.deepEqual(native.sends[0].images.map(image=>image.id),frames.map(frame=>frame.id));
    assert.match(native.sends[0].text,/抽样画面，不含音轨/);assert.match(native.sends[0].text,/"time":14/);assert.ok(native.sends[0].text.includes(video.id));
    const original=f.service.conversations.read('workspace-one',chat.id).entries.find(entry=>entry.role==='user');assert.equal(original?.text,'inspect the recording');assert.deepEqual(original?.attachments,[video.id]);
    now=new Date(now.getTime()+25*60*60*1000);upload('image/png',png);
    for(const frame of frames)assert.deepEqual(f.service.conversations.readAttachment('workspace-one',chat.id,frame.id).bytes,png);
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one',chat.id,video.id).bytes,mp4);
    const current=f.service.conversations.read('workspace-one',chat.id),handoff=f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:current.revision,connectionId:'reader',text:'continue'});
    assert.equal(handoff.fits,true,'historical video never blocks a later text-only executor');
    const index=JSON.parse(fs.readFileSync(handoff.handoff!.sourcePath!,'utf8'));
    const source=index.images.find((image:any)=>image.id===video.id);assert.equal(source.mimeType,'video/mp4');assert.equal(source.video.frames.length,8);assert.ok(fs.existsSync(source.video.frames[0].path));
    await f.service.close();const cold=createAgentService(f.options);
    try{assert.deepEqual(cold.conversations.readAttachment('workspace-one',chat.id,video.id).bytes,mp4);assert.deepEqual(cold.conversations.readAttachment('workspace-one',chat.id,frames[0].id).bytes,png);}finally{await cold.close();}
  } finally {await f.close();}
});

test('video ownership, metadata, bytes, revision and visual capability reject incomplete input without dispatch',async()=>{
  const native=fake('text'),f=fixture([native.executor]);
  const png=Buffer.from('89504e470d0a1a0a','hex'),mp4=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
  try{
    await connected(f.service,'text');const chat=await f.service.conversations.create('workspace-one',{}),other=await f.service.conversations.create('workspace-one',{});
    const frame=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:chat.revision,mimeType:'image/png',bytes:png});
    const input={mimeType:'video/mp4',bytes:mp4,video:{duration:2,frames:[{id:frame.id,time:0}]}};
    assert.throws(()=>f.service.conversations.addAttachment('workspace-one',other.id,{...input,expectedRevision:other.revision}),{code:'agent_attachment_missing'});
    assert.throws(()=>f.service.conversations.addAttachment('workspace-one',chat.id,{...input,expectedRevision:chat.revision}),{code:'agent_revision_conflict'});
    const upload=(extra:Record<string,unknown>)=>f.service.conversations.addAttachment('workspace-one',chat.id,{...input,expectedRevision:f.service.conversations.read('workspace-one',chat.id).revision,...extra});
    assert.throws(()=>upload({bytes:Buffer.from('bad')}),{code:'agent_video_invalid'});
    assert.throws(()=>upload({bytes:Buffer.alloc(32*1024*1024+1)}),{code:'agent_video_invalid',status:413});
    assert.throws(()=>upload({video:{duration:2,frames:[]}}),{code:'agent_video_invalid'});
    assert.throws(()=>upload({video:{duration:2,frames:[{id:frame.id,time:3}]}}),{code:'agent_video_invalid'});
    const video=upload({});
    const preview=f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:video.revision,connectionId:'text',text:'',attachmentIds:[video.id]});
    assert.equal(preview.fits,false);assert.match(preview.diagnostic!,/无法接收这些图片/);assert.equal(native.sends.length,0);
  }finally{await f.close();}
});

function fastRetries(t: import('node:test').TestContext) {
  t.mock.method(globalThis, 'setTimeout', new Proxy(setTimeout, { apply(target, receiver, args) {
    if ([2000, 5000, 10000].includes(args[1])) args[1] = 1;
    return Reflect.apply(target, receiver, args);
  } }));
}

test('temporary preparation failures retry the original input without creating duplicate user turns', async t => {
  fastRetries(t);
  const native = fake('local', {prepareFailures: 2}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    const initial = send(f.service, chat.id, 'local', 'inspect current work');
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'completed');
    assert.equal(done.run?.id, initial.run.id); assert.equal(native.sends.length, 1);
    assert.equal(native.sends[0].text, 'inspect current work');
    assert.equal(done.entries.filter(entry => entry.role === 'user').length, 1);
  } finally { await f.close(); }
});

test('capacity failure continues the exact context as a system retry and retains original failure', async t => {
  fastRetries(t);
  const native = fake('local', {failure: n => n === 1 ? 'Selected model is at capacity. Please try a different model.' : undefined}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    const initial = send(f.service, chat.id, 'local', 'finish the change');
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'completed');
    assert.equal(native.sends.length, 2); assert.equal(native.sends[0].contextRef.id, native.sends[1].contextRef.id);
    assert.equal(native.sends[0].model, native.sends[1].model); assert.equal(native.sends[0].permissionMode, native.sends[1].permissionMode);
    assert.match(native.sends[1].text, /系统自动重试/);
    assert.equal(done.entries.filter(entry => entry.role === 'user').length, 1);
    assert.ok(done.entries.some(entry => entry.role === 'system' && entry.kind === 'notice' && entry.status === 'accepted'));
    assert.equal(new ConversationRepository(path.join(f.options.dataRoot, 'agent-service')).readConversation(chat.id)?.runOutcomes?.[initial.run.id]?.status, 'failed');
  } finally { await f.close(); }
});

test('persistent capacity errors stop after three automatic attempts', async t => {
  fastRetries(t);
  const native = fake('local', {failure: 'Selected model is at capacity.'}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => native.sends.length === 4 && view.run?.status === 'failed');
    assert.equal(new Set(native.sends.map(input => input.clientRequestId)).size, 4);
    assert.equal(native.contexts.size, 1);
  } finally { await f.close(); }
});

test('stop cancels a retry wait and concurrent observations do not start a second execution', async () => {
  const native = fake('local', {failure: 'Selected model is at capacity.'}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => Boolean(view.run?.diagnostic?.includes('自动重试')));
    await Promise.all([f.service.conversations.observe('workspace-one', chat.id), f.service.conversations.observe('workspace-one', chat.id)]);
    const pending = f.service.conversations.read('workspace-one', chat.id), run = pending.run!;
    const stopped = await f.service.conversations.stop('workspace-one', chat.id, {expectedRevision: pending.revision, runId: run.id, participantId: run.participantId, generation: run.generation});
    assert.equal(stopped.run?.status, 'stopped');
    await new Promise(resolve => setImmediate(resolve)); assert.equal(native.sends.length, 1);
  } finally { await f.close(); }
});

test('quota, authentication, unknown delivery and unfinished tools are not automatically retried', async t => {
  fastRetries(t);
  for (const options of [{failure: 'at capacity; daily quota exhausted'}, {failure: 'unauthorized: temporary failure'}, {failure: 'at capacity', toolSurvives: true}, {unknown: true}]) {
    const native = fake('local', options), f = fixture([native.executor]);
    try {
      await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
      send(f.service, chat.id, 'local', 'finish');
      const ended = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => ['failed', 'tools-active', 'unknown'].includes(view.run?.status ?? ''));
      assert.doesNotMatch(ended.run?.diagnostic ?? '', /自动重试/); assert.equal(native.sends.length, 1);
    } finally { await f.close(); }
  }
});

test('host shutdown cancels a retry wait without converting it into host recovery', async () => {
  const native = fake('local', {failure: 'at capacity'}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => Boolean(view.run?.diagnostic?.includes('自动重试')));
    await f.service.close(); const cold = createAgentService(f.options);
    try {
      await cold.conversations.recoverInterrupted();
      assert.equal(cold.conversations.read('workspace-one', chat.id).run?.status, 'failed'); assert.equal(native.sends.length, 1);
    }finally{await cold.close();}
  }finally{await f.close();}
});

test('draft images survive ownership changes and cold reads without creating a conversation', async () => {
  const f = fixture([]), id = randomUUID(), png = Buffer.from([137,80,78,71,13,10,26,10]);
  try {
    const empty = f.service.conversations.readDraft('@default', id);
    assert.deepEqual(empty.images, []); assert.equal(fs.existsSync(f.options.dataRoot), false);
    const added = f.service.conversations.addDraftImage('@default', id, { expectedRevision: empty.revision, name: 'image.png', mimeType: 'image/png', bytes: png });
    assert.equal(added.images.length, 1);
    assert.deepEqual(f.service.conversations.readDraft('workspace-one', id), added);
    assert.equal(new ConversationRepository(path.join(f.options.dataRoot, 'agent-service')).readConversation(id), undefined);
    assert.equal(fs.existsSync(path.join(f.options.dataRoot, 'agent-service/conversations.sqlite')), false);
    assert.throws(() => f.service.conversations.addDraftImage('@default', id, { expectedRevision: empty.revision, name: 'old.png', mimeType: 'image/png', bytes: png }), { code: 'agent_revision_conflict' });
    assert.throws(() => f.service.conversations.addDraftImage('@default', id, { expectedRevision: added.revision, name: 'bad.png', mimeType: 'image/png', bytes: Buffer.from('not an image') }), { code: 'agent_image_invalid' });
    assert.deepEqual(f.service.conversations.readDraftImage('@default', id, added.images[0]!.id).bytes, png);
    const foreign = 'scope:' + Buffer.from(JSON.stringify(['another-host', '@default'])).toString('base64url');
    assert.deepEqual(f.service.conversations.readDraft(foreign, id).images, []);
    await f.service.close(); const cold = createAgentService(f.options);
    try {
      assert.deepEqual(cold.conversations.readDraft('workspace-one', id), added);
      const removed = cold.conversations.removeDraftImage('@default', id, { expectedRevision: added.revision, attachmentId: added.images[0]!.id });
      assert.deepEqual(removed.images, []);
    } finally { await cold.close(); }
  } finally { await f.close(); }
});


test('an explicit stop during terminal observation cancels a not-yet-scheduled retry', async () => {
  let release!: () => void;
  const beforeObservation = new Promise<void>(resolve => {release = resolve;});
  const native = fake('local', {failure: 'at capacity', beforeObservation}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    const failed = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'failed');
    const run = failed.run!;
    await f.service.conversations.stop('workspace-one', chat.id, {expectedRevision:failed.revision, runId:run.id, participantId:run.participantId, generation:run.generation});
    release(); await new Promise(resolve => setImmediate(resolve));
    assert.doesNotMatch(f.service.conversations.read('workspace-one', chat.id).run?.diagnostic ?? '', /自动重试/);
    assert.equal(native.sends.length, 1);
  } finally {release(); await f.close();}
});

test('a terminal observation for a different execution cannot authorize retry', async () => {
  const native = fake('local', {failure: 'at capacity', wrongObservation:true}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'failed');
    await new Promise(resolve => setImmediate(resolve));
    assert.doesNotMatch(f.service.conversations.read('workspace-one', chat.id).run?.diagnostic ?? '', /自动重试/);
    assert.equal(native.sends.length, 1);
  } finally {await f.close();}
});


test('ambiguous context creation is preserved without automatically creating another context', async () => {
  const native = fake('local', {prepareFailures:1, unknownCreate:true}), f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    const failed = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => view.run?.status === 'failed');
    assert.doesNotMatch(failed.run?.diagnostic ?? '', /自动重试/); assert.equal(native.sends.length, 0);
    assert.equal(native.contexts.size, 0);
  } finally {await f.close();}
});


test('transport recovery preserves the temporary-failure retry budget instead of resetting it', async t => {
  fastRetries(t);
  const native = fake('local', {failure:'at capacity', disconnect:'stopped', disconnectOn:2}), f = fixture([native.executor], {autoContinueInterrupted:true});
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {});
    send(f.service, chat.id, 'local', 'finish');
    const ended = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), view => Boolean(view.run?.diagnostic?.includes('已达上限')));
    assert.equal(native.sends.length, 5); // Original + three temporary-failure retries + one transport recovery.
    assert.equal(native.sends.filter(input => input.clientRequestId.startsWith('automatic-retry:')).length, 3);
    assert.equal(native.sends.filter(input => input.clientRequestId.startsWith('host-recovery:')).length, 1);
    assert.equal(ended.run?.status, 'failed');
  } finally {await f.close();}
});


function continueDraft(service: ReturnType<typeof createAgentService>, id:string, connectionId='local', model?:string) {
  const current=service.conversations.read('workspace-one',id);
  return {expectedRevision:current.revision, connectionId, model, text:'', continueRunId:current.run!.id};
}

test('explicit retry restores undelivered text and images without a duplicate user message', async () => {
  const native=fake('local',{images:true,prepareFailures:1,unknownCreate:true}), f=fixture([native.executor]);
  try {
    await connected(f.service,'local'); const chat=await f.service.conversations.create('workspace-one',{});
    const image=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:chat.revision,mimeType:'image/png',bytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});
    const input={expectedRevision:image.revision,connectionId:'local',text:'Inspect the image and finish the original task',attachmentIds:[image.id]};
    const preview=f.service.conversations.prepareSend('workspace-one',chat.id,input);
    const original=f.service.conversations.send('workspace-one',chat.id,{...input,previewToken:preview.token,clientRequestId:randomUUID()});
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='failed');
    const draft=continueDraft(f.service,chat.id), next=f.service.conversations.prepareSend('workspace-one',chat.id,draft), request={...draft,previewToken:next.token,clientRequestId:randomUUID()};
    const started=f.service.conversations.send('workspace-one',chat.id,request);
    assert.equal(f.service.conversations.send('workspace-one',chat.id,request).run.id,started.run.id);
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    assert.equal(native.sends.length,1);assert.match(native.sends[0].text,/Inspect the image/);assert.equal(native.sends[0].images.length,1);
    assert.equal(done.entries.filter(entry=>entry.kind==='message'&&entry.role==='user').length,1);
    assert.ok(done.entries.some(entry=>entry.role==='system'&&entry.text==='已请求重试上次未送达的要求。'));
    assert.equal(new ConversationRepository(path.join(f.options.dataRoot,'agent-service')).readConversation(chat.id)?.attempts.at(-1)?.continuationOf,original.run.id);
    assert.throws(()=>f.service.conversations.prepareSend('workspace-one',chat.id,{...draft,expectedRevision:done.revision}),{code:'agent_continue_stale'});
  } finally {await f.close();}
});

test('manual continuation works with the same selection, another model or another executor', async () => {
  for (const target of ['same','model','executor']) {
    const first=fake('local',{multipleModels:true,failure:n=>n===1?'permission_denied: previous execution failed':undefined}),second=fake('other',{multipleModels:true}),f=fixture([first.executor,second.executor]);
    try {
      await connected(f.service,'local');await connected(f.service,'other');const chat=await f.service.conversations.create('workspace-one',{});
      send(f.service,chat.id,'local','Complete the existing goal');
      await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='failed');
      const draft=continueDraft(f.service,chat.id,target==='executor'?'other':'local',target==='model'?'other-model':undefined);
      const preview=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
      f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
      const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
      const sent=target==='executor'?second.sends[0]:first.sends.at(-1)!;
      assert.match(sent.text,/接着完成原目标/);if(target==='model')assert.equal(sent.model,'other-model');
      assert.equal(done.entries.filter(entry=>entry.kind==='message'&&entry.role==='user').length,1);
      assert.ok(done.entries.some(entry=>entry.role==='system'&&entry.text==='已请求继续上次执行。'));
      if(target==='same')assert.equal(first.sends[0].contextRef.id,sent.contextRef.id);
      else assert.match(sent.text,/Complete the existing goal/);
    } finally {await f.close();}
  }
});

test('an empty completed response can continue, but a normal response or unknown work cannot', async () => {
  for(const options of [{noAnswer:true},{unknown:true},{toolSurvives:true},{}]) {
    const native=fake('local',options),f=fixture([native.executor]);
    try {
      await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','finish');
      await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>['completed','unknown','tools-active'].includes(view.run?.status??''));
      const draft=continueDraft(f.service,chat.id);
      if('noAnswer' in options)assert.ok(f.service.conversations.prepareSend('workspace-one',chat.id,draft).fits);
      else assert.throws(()=>f.service.conversations.prepareSend('workspace-one',chat.id,draft),error=>['agent_conversation_busy','agent_continue_unavailable'].includes((error as any).code));
      assert.throws(()=>f.service.conversations.prepareSend('workspace-one',chat.id,{...draft,text:'unrelated new instruction'}),{code:'agent_continue_input_conflict'});
      assert.throws(()=>f.service.conversations.queueSend('workspace-one',chat.id,{...draft,clientRequestId:randomUUID()}),{code:'agent_continue_unavailable'});
      assert.equal(native.sends.length,1);
    } finally {await f.close();}
  }
});

test('manual continuation can still use bounded automatic retry without replaying the manual action', async t => {
  fastRetries(t);
  const native=fake('local',{failure:n=>n===1?'permission_denied: failed':n===2?'Selected model is at capacity.':undefined}),f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','finish original goal');
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='failed');
    const draft=continueDraft(f.service,chat.id),preview=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
    f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    assert.equal(native.sends.length,3);assert.equal(done.entries.filter(entry=>entry.kind==='message'&&entry.role==='user').length,1);
    assert.equal(done.entries.filter(entry=>entry.text==='已请求继续上次执行。').length,1);
  } finally {await f.close();}
});

test('explicit retry keeps an undelivered video and its timed frames after mainline integration', async () => {
  const native=fake('local',{images:true,prepareFailures:1,unknownCreate:true}),f=fixture([native.executor]);
  const png=Buffer.from('89504e470d0a1a0a','hex'),mp4=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    const frame=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:chat.revision,mimeType:'image/png',bytes:png});
    const video=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:frame.revision,mimeType:'video/mp4',bytes:mp4,video:{duration:2,frames:[{id:frame.id,time:0}]}});
    const input={expectedRevision:video.revision,connectionId:'local',text:'finish reviewing this recording',attachmentIds:[video.id]};
    const preview=f.service.conversations.prepareSend('workspace-one',chat.id,input);
    f.service.conversations.send('workspace-one',chat.id,{...input,previewToken:preview.token,clientRequestId:randomUUID()});
    await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='failed');
    const draft=continueDraft(f.service,chat.id),next=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
    f.service.conversations.send('workspace-one',chat.id,{...draft,previewToken:next.token,clientRequestId:randomUUID()});
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    assert.equal(native.sends.length,1);assert.deepEqual(native.sends[0].images.map(image=>image.id),[frame.id]);assert.match(native.sends[0].text,/抽样画面，不含音轨/);
    assert.equal(done.entries.filter(entry=>entry.role==='user').length,1);assert.deepEqual(f.service.conversations.readAttachment('workspace-one',chat.id,video.id).bytes,mp4);
  } finally {await f.close();}
});

test('first submission persists input and conversation together and is idempotent across restart', async () => {
  const native = fake('local', { images: true }), f = fixture([native.executor]), id = randomUUID();
  try {
    const staged = f.service.conversations.addDraftImage('@default', id, { expectedRevision: f.service.conversations.readDraft('@default', id).revision, name: 'one.png', mimeType: 'image/png', bytes: Buffer.from([137,80,78,71,13,10,26,10]) });
    const input = { connectionId: 'local', text: 'inspect this picture', attachmentIds: staged.images.map(image => image.id), clientRequestId: randomUUID(), expectedDraftRevision: staged.revision };
    await assert.rejects(f.service.conversations.startDraft('workspace-one', id, input), { code: 'agent_account_unavailable' });
    assert.deepEqual(f.service.conversations.readDraft('@default', id), staged);
    assert.equal(f.service.conversations.lookupDraft('workspace-one', id, input.clientRequestId).found, false);
    assert.deepEqual(f.service.conversations.list('workspace-one').conversations, []);
    await connected(f.service, 'local');
    const [first, repeated] = await Promise.all([f.service.conversations.startDraft('workspace-one', id, input), f.service.conversations.startDraft('workspace-one', id, input)]);
    assert.equal(first.conversation.id, repeated.conversation.id);
    assert.equal(first.conversation.entries.filter(entry => entry.role === 'user').length, 1);
    const accepted = await waitUntil(() => f.service.conversations.read('workspace-one', first.conversation.id), view => view.run?.status === 'completed');
    assert.equal(native.sends.length, 1); assert.equal(native.sends[0]!.images?.length, 1);
    assert.deepEqual(f.service.conversations.readDraft('@default', id).images, []);
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one', accepted.id, staged.images[0]!.id).bytes, Buffer.from([137,80,78,71,13,10,26,10]));
    assert.throws(() => f.service.conversations.startDraft('workspace-one', id, { ...input, text: 'different' }), { code: 'agent_request_conflict' });
    await f.service.close(); const cold = createAgentService(f.options);
    try {
      assert.equal(cold.conversations.lookupDraft('workspace-one', id, input.clientRequestId).conversation?.id, accepted.id);
      assert.equal((await cold.conversations.startDraft('workspace-one', id, input)).conversation.id, accepted.id);
      assert.equal(native.sends.length, 1);
    } finally { await cold.close(); }
  } finally { await f.close(); }
});

test('shared video draft keeps original and frames without creating a conversation, then transfers them once', async () => {
  const native=fake('local',{images:true}),f=fixture([native.executor]),id=randomUUID();
  const png=Buffer.from('89504e470d0a1a0a','hex'),mp4=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
  try {
    let staged=f.service.conversations.readDraft('@default',id);
    staged=f.service.conversations.addDraftImage('@default',id,{expectedRevision:staged.revision,name:'frame.png',mimeType:'image/png',bytes:png,frame:true});
    const frame=staged.images[0]!;
    assert.throws(()=>f.service.conversations.addDraftImage('@default',id,{expectedRevision:staged.revision,name:'broken.mp4',mimeType:'video/mp4',bytes:mp4,video:{duration:2,frames:[{id:randomUUID(),time:0}]}}),{code:'agent_video_invalid'});
    staged=f.service.conversations.addDraftImage('@default',id,{expectedRevision:staged.revision,name:'recording.mp4',mimeType:'video/mp4',bytes:mp4,video:{duration:2,frames:[{id:frame.id,time:0}]}});
    const video=staged.images.find(image=>image.video)!;
    assert.deepEqual(f.service.conversations.readDraft('workspace-one',id),staged);
    assert.deepEqual(f.service.conversations.readDraftImage('@default',id,video.id).bytes,mp4);
    assert.deepEqual(f.service.conversations.list('workspace-one').conversations,[]);
    assert.throws(()=>f.service.conversations.removeDraftImage('@default',id,{expectedRevision:staged.revision,attachmentId:frame.id}),{code:'agent_video_invalid'});
    const input={connectionId:'local',text:'inspect recording',attachmentIds:[video.id],expectedDraftRevision:staged.revision,clientRequestId:randomUUID()};
    await assert.rejects(f.service.conversations.startDraft('workspace-one',id,input),{code:'agent_account_unavailable'});
    assert.deepEqual(f.service.conversations.readDraft('@default',id),staged);
    await connected(f.service,'local');
    const accepted=await f.service.conversations.startDraft('workspace-one',id,input);
    await waitUntil(()=>f.service.conversations.read('workspace-one',accepted.conversation.id),view=>view.run?.status==='completed');
    assert.deepEqual(native.sends[0].images.map(image=>image.id),[frame.id]);assert.match(native.sends[0].text,/抽样画面，不含音轨/);
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one',accepted.conversation.id,video.id).bytes,mp4);
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one',accepted.conversation.id,frame.id).bytes,png);
    assert.deepEqual(f.service.conversations.readDraft('@default',id).images,[]);
    assert.equal((await f.service.conversations.startDraft('workspace-one',id,input)).conversation.id,accepted.conversation.id);assert.equal(native.sends.length,1);
    let removable=f.service.conversations.addDraftImage('@default',id,{expectedRevision:f.service.conversations.readDraft('@default',id).revision,name:'frame.png',mimeType:'image/png',bytes:png,frame:true});
    removable=f.service.conversations.addDraftImage('@default',id,{expectedRevision:removable.revision,name:'recording.mp4',mimeType:'video/mp4',bytes:mp4,video:{duration:2,frames:[{id:removable.images[0]!.id,time:0}]}});
    assert.deepEqual(f.service.conversations.removeDraftImage('@default',id,{expectedRevision:removable.revision,attachmentId:removable.images.find(image=>image.video)!.id}).images,[]);
  }finally{await f.close();}
});

function titleFake(id:string,options:{hold?:boolean;title:()=>Promise<string|undefined>}) {
  const native=fake(id,{hold:options.hold}),open=native.executor.open;
  native.executor.open=async input=>({...await open(input),generateTitle:options.title});
  return native;
}

test('title retry belongs to each participant: an empty first executor cannot block the healthy replacement',async()=>{
  let aCalls=0,bCalls=0;const a=titleFake('first',{title:async()=>{aCalls++;return undefined;}}),b=titleFake('second',{hold:true,title:async()=>{bCalls++;return '切换执行方后恢复的标题';}}),f=fixture([a.executor,b.executor]);
  try{
    await connected(f.service,'first');await connected(f.service,'second');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'first','调整对话布局');await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed'&&v.titleState?.status==='failed'&&aCalls===2);
    send(f.service,chat.id,'second','接着完成布局调整');const named=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.title==='切换执行方后恢复的标题');
    assert.equal(named.run?.status,'running');assert.equal(bCalls,1);assert.equal(aCalls,2);assert.equal(a.sends.length,1);assert.equal(b.sends.length,1);
  }finally{for(const c of b.contexts.values())c.unblock?.();await f.close();}
});

test('title retry migrates legacy flags and preserves each participant budget across switching back and restart',async()=>{
  let aCalls=0,bCalls=0;const a=titleFake('first',{title:async()=>{aCalls++;return undefined;}}),b=titleFake('second',{title:async()=>{bCalls++;return undefined;}}),f=fixture([a.executor,b.executor]);let service=f.service;
  try{
    await connected(service,'first');await connected(service,'second');const chat=await service.conversations.create('workspace-one',{});
    send(service,chat.id,'first','原执行方标题失败');await waitUntil(()=>service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed'&&v.titleState?.status==='failed'&&aCalls===2);
    await service.close();
    const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service')),legacy=repository.readConversation(chat.id)!;
    assert.equal(legacy.earlyTitleAttempted,true);assert.equal(legacy.titleAttempted,true);delete legacy.titleAttemptsByParticipant;repository.saveConversation(legacy,legacy.view.revision);
    service=createAgentService(f.options);
    send(service,chat.id,'first','原执行方普通后续消息');await waitUntil(()=>service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');assert.equal(aCalls,2);
    send(service,chat.id,'second','切换执行方获得独立预算');await waitUntil(()=>service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed'&&v.titleState?.status==='failed'&&bCalls===2);
    await service.close();service=createAgentService(f.options);
    send(service,chat.id,'first','切回不重置');await waitUntil(()=>service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
    send(service,chat.id,'second','重启也不重置');await waitUntil(()=>service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
    await service.conversations.observe('workspace-one',chat.id);assert.equal(aCalls,2);assert.equal(bCalls,2);assert.equal(a.sends.length,3);assert.equal(b.sends.length,2);
    const stored=repository.readConversation(chat.id)!;assert.equal(Object.keys(stored.titleAttemptsByParticipant!).length,2);assert.ok(Object.values(stored.titleAttemptsByParticipant!).every(value=>value.early&&value.completion));
  }finally{if(service!==f.service)await service.close();await f.close();}
});

for(const manual of [false,true])test('title retry serializes a late old result and protects current/manual title; manual='+manual,async()=>{
  let release!:(value:string)=>void;const pending=new Promise<string>(resolve=>{release=resolve;});let bCalls=0;
  const a=titleFake('first',{title:async()=>pending}),b=titleFake('second',{hold:true,title:async()=>{bCalls++;return '新执行方的准确标题';}}),f=fixture([a.executor,b.executor]);
  try{
    await connected(f.service,'first');await connected(f.service,'second');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'first','原执行方');await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed'&&v.titleState?.status==='generating');
    send(f.service,chat.id,'second','新执行方继续工作');await waitUntil(()=>b.sends.length,n=>n===1);assert.equal(bCalls,0,'the working turn does not wait for the previous title request');
    if(manual){const current=f.service.conversations.read('workspace-one',chat.id);await f.service.conversations.update('workspace-one',chat.id,{expectedRevision:current.revision,title:'用户手动名称'});}
    release('旧执行方迟到的标题');
    const named=await waitUntil(()=>{const v=f.service.conversations.read('workspace-one',chat.id);return {title:v.title,titleState:v.titleState,bCalls};},v=>v.title===(manual?'用户手动名称':'新执行方的准确标题'));
    assert.equal(named.titleState?.status,manual?'manual':'generated');assert.equal(bCalls,manual?0:1);assert.equal(a.sends.length,1);assert.equal(b.sends.length,1);
  }finally{release?.('结束');for(const c of b.contexts.values())c.unblock?.();await f.close();}
});

test('title retry persists an unavailable new participant before its working turn completes',async()=>{
  let calls=0;const a=titleFake('first',{title:async()=>{calls++;return undefined;}}),b=fake('second',{hold:true}),f=fixture([a.executor,b.executor]);
  try{
    await connected(f.service,'first');await connected(f.service,'second');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'first','先前标题失败');await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed'&&v.titleState?.status==='failed'&&calls===2);
    send(f.service,chat.id,'second','执行方暂不支持独立标题');const running=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='running'&&v.titleState?.status==='unavailable');
    const stored=new ConversationRepository(path.join(f.options.dataRoot,'agent-service')).readConversation(chat.id)!;
    assert.equal(stored.titleAttemptsByParticipant?.[running.run!.participantId]?.early,true);assert.equal(stored.titleAttemptsByParticipant?.[running.run!.participantId]?.completion,undefined);
    assert.equal(a.sends.length,1);assert.equal(b.sends.length,1);
  }finally{for(const c of b.contexts.values())c.unblock?.();await f.close();}
});

test('DSH and Qoder exact stopped transport losses enter the existing single continuation policy',async()=>{
  for(const disconnectError of ['dsh_execution_observation_lost','dsh_event_observation_lost','qoder_execution_observation_lost','qoder_event_observation_lost']){
    const native=fake('local',{disconnect:'stopped',disconnectError}),f=fixture([native.executor],{autoContinueInterrupted:true});
    try{
      await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','finish existing work');
      await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
      await Promise.all([f.service.conversations.recoverInterrupted(),f.service.conversations.observe('workspace-one',chat.id)]);
      assert.equal(native.sends.length,2,disconnectError);assert.equal(native.opens.length,2);
      assert.equal(native.sends[0]!.contextRef.id,native.sends[1]!.contextRef.id);
      assert.equal(native.opens[0]!.configRoot,native.opens[1]!.configRoot);
    }finally{await f.close();}
  }
});

test('reconciliation preserves received terminal tool evidence and supplies exact receipts to the native observer', async () => {
  const native = fake('local', { hold: true }), open = native.executor.open; let received: readonly ExecutorItem[] | undefined;
  native.executor.open = async options => { const runtime = await open(options), observe = runtime.observe.bind(runtime); runtime.observe = async input => { received = input.knownItems; return observe(input); }; return runtime; };
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const chat = await f.service.conversations.create('workspace-one', {}); send(f.service, chat.id, 'local', 'one operation');
    await waitUntil(() => f.service.conversations.read('workspace-one', chat.id).run?.accepted, accepted => accepted === true);
    const sending = native.sends[0]!, context = native.contexts.get(sending.contextRef.id)!;
    const tool: ExecutorItem = { id: 'native-completed-tool', kind: 'tool', role: 'system', text: 'COMMITTED', status: 'completed', executionId: context.observation.executionRef!.id };
    sending.onEvent({ type: 'item', item: tool }); context.items.push({ ...tool, status: 'running' });
    await f.service.conversations.observe('workspace-one', chat.id);
    assert.deepEqual(received?.map(item => [item.id, item.executionId, item.status]), [[tool.id, tool.executionId, 'completed']]);
    const entry = f.service.conversations.read('workspace-one', chat.id).entries.find(item => item.kind === 'tool');
    assert.equal(entry?.status, 'completed'); assert.equal(native.sends.length, 1);
  } finally { await f.close(); }
});


test('settled same-context image backfill preserves the new input and dispatches it exactly once', async () => {
  const native=fake(),f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
    send(f.service,created.id,'local','first');
    await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed');
    const context=[...native.contexts.values()][0]!;
    context.items.push({id:'old-image',kind:'tool',role:'system',name:'view-image',text:'查看图片',status:'completed',executionId:'execution-1'});
    send(f.service,created.id,'local','next');
    const result=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed'||v.run?.status==='failed');
    assert.equal(result.run?.status,'completed');assert.equal(native.sends.length,2);
    assert.equal(result.entries.filter(e=>e.text==='next').length,1);
    const image=result.entries.find(e=>e.name==='view-image')!;assert.ok(image);assert.notEqual(image.runId,result.run?.id);
    await f.service.conversations.observe('workspace-one',created.id);
    assert.equal(native.sends.length,2);assert.equal(f.service.conversations.read('workspace-one',created.id).entries.filter(e=>e.name==='view-image').length,1);
  } finally {await f.close();}
});

test('late backfill cannot mark foreign work or the current unsent input delivered', async () => {
  const a=fake('a'),b=fake('b'),f=fixture([a.executor,b.executor]);
  try {
    await connected(f.service,'a');await connected(f.service,'b');const created=await f.service.conversations.create('workspace-one',{});
    send(f.service,created.id,'a','first');await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed');
    const through=f.service.conversations.read('workspace-one',created.id).participants[0]!.deliveredThrough;
    send(f.service,created.id,'b','foreign');await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed');
    const context=[...a.contexts.values()][0]!;
    context.items.push({id:'unknown-tool',kind:'tool',role:'system',name:'read',text:'unknown execution',status:'completed',executionId:'foreign-execution'});
    send(f.service,created.id,'a','next');
    const failed=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='failed');
    assert.equal(a.sends.length,1);assert.equal(failed.run?.accepted,false);
    assert.equal(failed.participants.find(p=>p.provider==='a')!.deliveredThrough,through);
    assert.match(failed.run?.diagnostic??'',/原生记录有新变化/);
  } finally {await f.close();}
});

test('new unmapped native user input still blocks dispatch while preserving the local request', async () => {
  const native=fake(),f=fixture([native.executor]);
  try {
    await connected(f.service,'local');const created=await f.service.conversations.create('workspace-one',{});
    send(f.service,created.id,'local','first');await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='completed');
    [...native.contexts.values()][0]!.items.push({id:'outside-input',kind:'message',role:'user',text:'outside',executionId:'outside'});
    send(f.service,created.id,'local','next');const failed=await waitUntil(()=>f.service.conversations.read('workspace-one',created.id),v=>v.run?.status==='failed');
    assert.equal(native.sends.length,1);assert.equal(failed.entries.filter(e=>e.text==='next').length,1);assert.match(failed.run?.diagnostic??'',/原生用户输入尚不能准确映射/);
  } finally {await f.close();}
});


for(const media of ['image','video'] as const)test('正式材料回答校验同对话文件，保存原件并交付准确原生来源：'+media,async()=>{
  const native=fake('local',{question:true,images:true}),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','检查');
    let waiting=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='waiting-question');
    const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=','base64');
    const frame=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:waiting.revision,mimeType:'image/png',bytes});
    const attachment=media==='image'?frame:f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:frame.revision,mimeType:'video/mp4',bytes:Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex'),video:{duration:2,frames:[{id:frame.id,time:0}]}});
    waiting=f.service.conversations.read('workspace-one',chat.id);const request=waiting.requests[0]!,run=waiting.run!;
    const input={expectedRevision:waiting.revision,runId:run.id,participantId:run.participantId,generation:run.generation};
    await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,request.id,{...input,answer:{scope:{text:'',attachmentIds:[randomUUID()]}}}),{code:'agent_attachment_missing'});
    const other=await f.service.conversations.create('workspace-one',{}),foreign=f.service.conversations.addAttachment('workspace-one',other.id,{expectedRevision:other.revision,mimeType:'image/png',bytes});
    await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,request.id,{...input,answer:{scope:{text:'',attachmentIds:[foreign.id]}}}),{code:'agent_attachment_missing'});
    assert.equal(f.service.conversations.read('workspace-one',chat.id).requests.length,1);assert.equal(native.replies.length,0);
    await f.service.conversations.reply('workspace-one',chat.id,request.id,{...input,answer:{scope:{text:'看截图',attachmentIds:[attachment.id]}}});
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    assert.equal(done.requests.length,0);const reply=done.entries.find(entry=>entry.id==='reply-'+request.id)!;
    assert.deepEqual(reply.attachments,[attachment.id]);assert.deepEqual(JSON.parse(reply.text).显示回答,{scope:'看截图'});assert.match(JSON.parse(reply.text).回答.scope,/未读取不能声称看过/);const delivered=(native.replies[0] as any).scope;assert.match(delivered,/看截图/);
    const sources=JSON.parse(delivered.split('：\n')[1].split('\n\n')[0]);assert.equal(fs.readFileSync(sources[0].path).equals(bytes),true);assert.equal(reply.status,'accepted');assert.equal(done.run!.id,run.id);
    if(media==='video'){assert.match(delivered,/不含音轨/);assert.match(delivered,/不能据此声称连续观看/);const video=JSON.parse(delivered.split('：\n').at(-1)!)[0];assert.equal(video.id,attachment.id);assert.equal(video.frames[0].id,frame.id);assert.equal(video.frames[0].time,0);assert.equal(fs.statSync(video.path).size,24);}
    await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,request.id,{...input,expectedRevision:done.revision,answer:{scope:'yes'}}),{code:'agent_request_stale'});assert.equal(native.replies.length,1);
  }finally{await f.close();}
});

test('准确原生观察已继续时移除旧等待卡片并保留未答事实，未知时不隐藏',async()=>{
  const native=fake('local',{question:true}),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','检查');
    const waiting=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='waiting-question');
    const context=[...native.contexts.values()][0]!;context.observation={...context.observation,status:'unknown'};
    const unknown=await f.service.conversations.observe('workspace-one',chat.id);assert.equal(unknown.requests.length,1);
    context.observation={...context.observation,status:'running'};
    const current=await f.service.conversations.observe('workspace-one',chat.id);assert.equal(current.requests.length,0);assert.equal(native.replies.length,0);
    assert.ok(current.entries.some(entry=>entry.id==='retired-question-'+waiting.requests[0]!.id&&entry.text.includes('不补造答复')));
    await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,waiting.requests[0]!.id,{expectedRevision:current.revision,runId:current.run!.id,participantId:current.run!.participantId,generation:current.run!.generation,answer:{scope:'yes'}}),{code:'agent_request_stale'});
  }finally{await f.close();}
});

for(const visual of [true,false])test('正式材料回答的容量与能力失败不回应原问题：images='+visual,async()=>{
 const native=fake('local',{question:true,images:visual}),f=fixture([native.executor]);try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','检查');
  let waiting=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='waiting-question');
  const ids:string[]=[];for(let n=0;n<5;n++){const attachment=f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:waiting.revision,mimeType:'image/png',bytes:Buffer.from('89504e470d0a1a0a','hex')});ids.push(attachment.id);waiting=f.service.conversations.read('workspace-one',chat.id);}
  const input={expectedRevision:waiting.revision,runId:waiting.run!.id,participantId:waiting.run!.participantId,generation:waiting.run!.generation};
  await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,waiting.requests[0]!.id,{...input,answer:{scope:{text:'',attachmentIds:ids}}}),{code:'agent_question_answer_invalid'});
  await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,waiting.requests[0]!.id,{...input,answer:{scope:{text:'',attachmentIds:[ids[0]],path:'/etc/passwd'}}}),{code:'agent_question_answer_invalid'});
  assert.throws(()=>f.service.conversations.addAttachment('workspace-one',chat.id,{expectedRevision:waiting.revision,mimeType:'image/png',bytes:Buffer.alloc(8*1024*1024+1)}),{code:'agent_image_invalid',status:413});
  if(!visual)await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,waiting.requests[0]!.id,{...input,answer:{scope:{text:'',attachmentIds:[ids[0]]}}}),{code:'agent_capability_unavailable'});
  assert.equal(native.replies.length,0);assert.equal(f.service.conversations.read('workspace-one',chat.id).requests.length,1);
  if(visual){await f.service.conversations.reply('workspace-one',chat.id,waiting.requests[0]!.id,{...input,answer:{scope:{text:'四份材料',attachmentIds:ids.slice(0,4)}}});assert.equal(native.replies.length,1);}
 }finally{await f.close();}
});

test('child conversations freeze all prior rounds and never replay inherited messages as new work',async()=>{
  const native=fake(),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const parent=await f.service.conversations.create('workspace-one',{});
    for(const text of ['早期决定：一次只展开一个','第二轮：使用右上角浮窗']){send(f.service,parent.id,'local',text);await waitUntil(()=>f.service.conversations.read('workspace-one',parent.id),v=>v.run?.status==='completed');}
    const before=f.service.conversations.read('workspace-one',parent.id),calls=native.sends.length;
    const input={expectedRevision:before.revision,clientRequestId:randomUUID()};
    const child=await f.service.conversations.createChild('workspace-one',parent.id,input);
    assert.deepEqual(f.service.conversations.read('workspace-one',parent.id),before);
    assert.equal(native.sends.length,calls);assert.deepEqual(child.entries,[]);assert.deepEqual(child.participants,[]);assert.equal(child.run,undefined);
    assert.equal(child.cwd,before.cwd,'creation inherits only the starting work location');
    assert.equal(child.childOf?.throughSequence,before.entries.at(-1)!.sequence);
    assert.equal(f.service.conversations.listChildren('workspace-one',parent.id).conversations[0]?.id,child.id);
    send(f.service,parent.id,'local','创建后才出现的新消息');await waitUntil(()=>f.service.conversations.read('workspace-one',parent.id),v=>v.run?.status==='completed');
    const untouched=f.service.conversations.read('workspace-one',parent.id);
    const draft={expectedRevision:child.revision,connectionId:'local',text:'新建一个任务，使用独立工作树实现相关改动'};
    const preview=f.service.conversations.prepareSend('workspace-one',child.id,draft);
    assert.match(preview.handoff!.body,/早期决定：一次只展开一个/);assert.match(preview.handoff!.body,/第二轮：使用右上角浮窗/);
    assert.doesNotMatch(preview.handoff!.body,/创建后才出现的新消息/);assert.match(preview.handoff!.body,/不要继续或重复执行主对话任务/);
    assert.match(preview.handoff!.body,/后续任务.*本次用户要求及适用规则安排/);
    assert.match(preview.handoff!.body,/需要时使用已有能力新建任务.*工作树/);
    assert.doesNotMatch(preview.handoff!.body,/子对话不隔离实际文件/);
    f.service.conversations.send('workspace-one',child.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',child.id),v=>v.run?.status==='completed');
    assert.ok(native.sends.at(-1)!.text.includes('本次用户要求：\n'+draft.text),'the executor receives the new task/worktree instruction unchanged');
    assert.equal(done.entries.filter(e=>e.role==='user').length,1);assert.ok(done.entries[0]!.sequence>before.entries.at(-1)!.sequence);
    assert.notEqual(done.participants[0]?.contextId,before.participants[0]?.contextId);assert.deepEqual(f.service.conversations.read('workspace-one',parent.id),untouched);
    const second=f.service.conversations.prepareSend('workspace-one',child.id,{expectedRevision:done.revision,connectionId:'local',text:'继续解释'});
    assert.ok(!second.history.some(entry=>entry.text.includes('早期决定')),'same native participant already received inherited context');
    await f.service.close();const cold=createAgentService(f.options);
    try{assert.equal(cold.conversations.read('workspace-one',child.id).childOf?.conversationId,parent.id);assert.equal((await cold.conversations.createChild('workspace-one',parent.id,input)).id,child.id);assert.equal(native.sends.length,calls+2);}finally{await cold.close();}
  }finally{await f.close();}
});

test('child creation from a waiting parent preserves the parent control and treats questions as background',async()=>{
  const waiting=fake('parent',{question:true}),other=fake('child'),f=fixture([waiting.executor,other.executor]);
  try{
    for(const id of ['parent','child'])await connected(f.service,id);
    const parent=await f.service.conversations.create('workspace-one',{});send(f.service,parent.id,'parent','先确认范围');
    const before=await waitUntil(()=>f.service.conversations.read('workspace-one',parent.id),v=>v.run?.status==='waiting-question');
    const child=await f.service.conversations.createChild('workspace-one',parent.id,{expectedRevision:before.revision,clientRequestId:randomUUID()});
    assert.deepEqual(child.requests,[]);assert.equal(child.childOf?.state,'waiting-question');assert.deepEqual(waiting.replies,[]);
    const preview=f.service.conversations.prepareSend('workspace-one',child.id,{expectedRevision:child.revision,connectionId:'child',text:'解释这个范围问题'});
    assert.match(preview.handoff!.body,/具体范围/);assert.match(preview.handoff!.body,/waiting-question/);
    send(f.service,child.id,'child','解释，不做选择');await waitUntil(()=>f.service.conversations.read('workspace-one',child.id),v=>v.run?.status==='completed');
    assert.deepEqual(f.service.conversations.read('workspace-one',parent.id),before);assert.equal(waiting.replies.length,0);
  }finally{await f.close();}
});

test('child creation is idempotent under concurrency and rejects a changed source version',async()=>{
  const f=fixture([]);
  try{
    const parent=await f.service.conversations.create('workspace-one',{}),input={expectedRevision:parent.revision,clientRequestId:randomUUID()};
    const children=await Promise.all(Array.from({length:4},()=>f.service.conversations.createChild('workspace-one',parent.id,input)));
    assert.equal(new Set(children.map(row=>row.id)).size,1);assert.equal(f.service.conversations.listChildren('workspace-one',parent.id).conversations.length,1);
    assert.equal(f.service.conversations.list('workspace-one').conversations.length,1,'an unsent child is discoverable, not a discarded draft');
    const changed=await f.service.conversations.update('workspace-one',parent.id,{expectedRevision:parent.revision,title:'changed'});
    await assert.rejects(f.service.conversations.createChild('workspace-one',parent.id,{...input,expectedRevision:changed.revision}),{code:'agent_request_conflict'});
    await assert.rejects(f.service.conversations.createChild('workspace-one',parent.id,{...input,clientRequestId:randomUUID()}),{code:'agent_revision_conflict'});
    assert.equal((await f.service.conversations.createChild('workspace-one',parent.id,input)).id,children[0]!.id);
    assert.equal(f.service.conversations.read('workspace-one',children[0]!.id).childOf?.title,'新对话');
    assert.throws(()=>f.service.conversations.listChildren('foreign',parent.id),{code:'agent_conversation_missing'});
  }finally{await f.close();}
});

test('a child independently retains referenced video and frames but not unsent parent media',async()=>{
  let now=new Date('2026-10-29T10:00:00Z');const native=fake('local',{images:true}),f=fixture([native.executor],{now:()=>now});
  try{
    await connected(f.service,'local');const parent=await f.service.conversations.create('workspace-one',{});
    const png=Buffer.from('89504e470d0a1a0a','hex'),mp4=Buffer.from('000000186674797069736f6d0000020069736f6d69736f32','hex');
    const upload=(mimeType:string,bytes:Buffer,video?:any)=>f.service.conversations.addAttachment('workspace-one',parent.id,{expectedRevision:f.service.conversations.read('workspace-one',parent.id).revision,mimeType,bytes,video});
    const frame=upload('image/png',png),video=upload('video/mp4',mp4,{duration:1,frames:[{id:frame.id,time:0}]}),unsent=upload('image/png',png);
    let before=f.service.conversations.read('workspace-one',parent.id);const draft={expectedRevision:before.revision,connectionId:'local',text:'看这个视频',attachmentIds:[video.id]};
    const preview=f.service.conversations.prepareSend('workspace-one',parent.id,draft);f.service.conversations.send('workspace-one',parent.id,{...draft,previewToken:preview.token,clientRequestId:randomUUID()});
    before=await waitUntil(()=>f.service.conversations.read('workspace-one',parent.id),v=>v.run?.status==='completed');
    const child=await f.service.conversations.createChild('workspace-one',parent.id,{expectedRevision:before.revision,clientRequestId:randomUUID()});
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one',child.id,frame.id).bytes,png);
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one',child.id,video.id).bytes,mp4);
    assert.throws(()=>f.service.conversations.readAttachment('workspace-one',child.id,unsent.id),{code:'agent_attachment_missing'});
    const directory=path.join(f.options.dataRoot,'agent-service','attachments');
    assert.notEqual(fs.statSync(path.join(directory,parent.id,video.id)).ino,fs.statSync(path.join(directory,child.id,video.id)).ino);
    fs.unlinkSync(path.join(directory,parent.id,video.id));assert.deepEqual(f.service.conversations.readAttachment('workspace-one',child.id,video.id).bytes,mp4);
    now=new Date(now.getTime()+25*60*60*1000);
    f.service.conversations.addAttachment('workspace-one',child.id,{expectedRevision:child.revision,mimeType:'image/png',bytes:png});
    assert.deepEqual(f.service.conversations.readAttachment('workspace-one',child.id,frame.id).bytes,png);
    const prepared=f.service.conversations.prepareSend('workspace-one',child.id,{expectedRevision:f.service.conversations.read('workspace-one',child.id).revision,connectionId:'local',text:'解释抽样限制'});
    assert.match(prepared.handoff!.body,/不含音轨/);
  }finally{await f.close();}
});

test('long inherited background keeps complete indexed sources and never silently narrows to the latest turn',async()=>{
  const native=fake(),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');const parent=await f.service.conversations.create('workspace-one',{});
    const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service')),record=repository.readConversation(parent.id)!;
    record.view.entries=Array.from({length:8},(_,i)=>({id:randomUUID(),sequence:i+1,kind:'message',role:'user',text:`第${i}轮原始决定：`+'文'.repeat(16000),createdAt:'2026-10-29T00:00:00Z',runId:'round-'+i}));
    repository.saveConversation(record,parent.revision);
    const child=await f.service.conversations.createChild('workspace-one',parent.id,{expectedRevision:record.view.revision,clientRequestId:randomUUID()});
    const preview=f.service.conversations.prepareSend('workspace-one',child.id,{expectedRevision:child.revision,connectionId:'local',text:'只解释第一轮决定'});
    assert.equal(preview.handoff!.mode,'indexed');assert.equal(preview.fits,true);
    assert.match(preview.handoff!.body,/后续任务.*本次用户要求及适用规则安排/);
    const index=JSON.parse(fs.readFileSync(preview.handoff!.sourcePath!,'utf8'));assert.equal(index.rounds.length,8);
    const first=JSON.parse(fs.readFileSync(index.rounds[0].path,'utf8'));assert.equal(first.records[0].text,record.view.entries[0]!.text);
    assert.deepEqual(child.entries,[]);assert.equal(native.sends.length,0);
  }finally{await f.close();}
});

test('missing inherited media rejects only child creation and paginated relation reads retain all children',async()=>{
 const f=fixture([]);
 try{
  const parent=await f.service.conversations.create('workspace-one',{});
  for(let n=0;n<3;n++)await f.service.conversations.createChild('workspace-one',parent.id,{expectedRevision:parent.revision,clientRequestId:'page-'+n});
  const first=f.service.conversations.listChildren('workspace-one',parent.id,{limit:1});assert.equal(first.conversations.length,1);assert.ok(first.nextCursor);
  const second=f.service.conversations.listChildren('workspace-one',parent.id,{limit:1,cursor:first.nextCursor});assert.notEqual(first.conversations[0]!.id,second.conversations[0]!.id);
  const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service')),record=repository.readConversation(parent.id)!;
  record.view.entries.push({id:randomUUID(),sequence:1,kind:'message',role:'user',text:'附件必须可读',attachments:[randomUUID()],createdAt:new Date().toISOString()});
  repository.saveConversation(record,parent.revision);
  await assert.rejects(f.service.conversations.createChild('workspace-one',parent.id,{expectedRevision:record.view.revision,clientRequestId:'missing'}),{code:'agent_attachment_missing'});
  assert.equal(f.service.conversations.listChildren('workspace-one',parent.id).conversations.length,3);assert.equal(f.service.conversations.read('workspace-one',parent.id).revision,record.view.revision);
 }finally{await f.close();}
});

test('child discovery reflects current unread and seen activity without changing conversation revisions',async()=>{
  const native=fake('local'),f=fixture([native.executor]);
  try{
    await connected(f.service,'local');
    const parent=await f.service.conversations.create('workspace-one',{});
    const child=await f.service.conversations.createChild('workspace-one',parent.id,{expectedRevision:parent.revision,clientRequestId:randomUUID()});
    send(f.service,child.id,'local','独立说明');
    const done=await waitUntil(()=>f.service.conversations.read('workspace-one',child.id),value=>value.run?.status==='completed');
    assert.ok(done.activity!.version>done.activity!.seenThrough);
    assert.deepEqual(f.service.conversations.listChildren('workspace-one',parent.id).conversations[0]!.activity,done.activity);
    f.service.conversations.markSeen('workspace-one',child.id,{through:done.activity!.version});
    const seen=f.service.conversations.read('workspace-one',child.id);
    assert.equal(seen.revision,done.revision);
    assert.equal(seen.activity!.seenThrough,seen.activity!.version);
    assert.deepEqual(f.service.conversations.listChildren('workspace-one',parent.id).conversations[0]!.activity,seen.activity);
    assert.deepEqual(f.service.conversations.list('workspace-one').conversations[0]!.activity,seen.activity);
    assert.equal(f.service.conversations.read('workspace-one',parent.id).revision,parent.revision);
  }finally{await f.close();}
});
