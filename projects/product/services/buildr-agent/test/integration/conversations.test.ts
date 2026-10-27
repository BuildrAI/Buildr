import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import type { AgentExecutor, AgentRuntime, ContextRef, ExecutorItem, ExecutorObservation, ExecutorOpenOptions, ExecutorSendInput, ExecutorTitleInput, LoginObservation } from '../../src/contracts.ts';

type Context = { items: ExecutorItem[]; observation: ExecutorObservation; unblock?: () => void };
function fake(id = 'local', options: { hold?: boolean; unknown?: boolean; images?: boolean; request?: boolean; coldUnknown?: boolean; beforeAccepted?: Promise<void>; replyAfterTerminal?: boolean; toolSurvives?: boolean; toolInput?: boolean; failure?: string; summary?:(input:ExecutorTitleInput)=>Promise<string|undefined> } = {}) {
  const contexts = new Map<string, Context>(); const sends: ExecutorSendInput[] = []; const opens: ExecutorOpenOptions[] = [];
  let loginUpdate: ((value: LoginObservation) => void) | undefined;
  const capabilities = { text: true, images: Boolean(options.images), approval: true, questions: true, stop: true, resume: true, maxInputBytes: 128 * 1024 };
  const get = (ref: ContextRef) => { const context = contexts.get(ref.id); assert.ok(context, 'exact context must be restored'); return context; };
  const executor: AgentExecutor = { descriptor: { id, label: id, capabilities }, async open(input) {
    opens.push(input);
    let didSend = false;
    const runtime: AgentRuntime = {
      bindingIdentity: `${id}:${input.configRoot}`, capabilities,
      async inspectAccount() { return { status: 'ready', label: 'local account' }; },
      async models() { return [{ id: 'test-model', label: 'test-model' }]; },
      async beginLogin(update) { loginUpdate = update; update({ state: 'waiting-browser', url: 'https://example.test/official?secret=temporary' }); },
      async cancelLogin() {},
      async createContext() { const ref = { id: randomUUID() }; contexts.set(ref.id, { items: [], observation: { status: 'idle', tools: [] } }); return ref; },
      async resumeContext({ contextRef }) { get(contextRef); },
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
        if (options.request) input.onEvent({ type: 'request', request: { id: 'permit-one', kind: 'approval', title: 'Write a file?', options: [{ id: 'allow-once', label: 'Allow once' }, { id: 'deny', label: 'Deny' }] } });
        if (options.hold || options.request) await new Promise<void>(resolve => { context.unblock = resolve; });
        if (context.observation.status === 'stopped') { input.onEvent({ type: 'completed', status: 'stopped' }); return; }
        if (options.toolInput) {
          const invocation:ExecutorItem={id:`tool-${sends.length}`,kind:'tool',role:'system',name:'read',input:'{"file_path":"src/example.ts"}',text:'read\n{"file_path":"src/example.ts"}',executionId:executionRef.id,status:'running'};
          input.onEvent({type:'item',item:invocation});
          const result:ExecutorItem={id:invocation.id,kind:'tool',role:'system',text:'file content',executionId:executionRef.id,status:'completed'};
          context.items.push(result);input.onEvent({type:'item',item:result});
        }
        const item: ExecutorItem = { id: `answer-${sends.length}`, kind: 'message', role: 'assistant', text: `answer from ${id}`, executionId: executionRef.id, status: 'completed' };
        context.items.push(item); input.onEvent({ type: 'item', item });
        context.observation = options.toolSurvives ? { status: 'tools-active', executionRef, tools: [{ id: 'own-tool', label: 'owned command', status: 'running', canStop: true }] } : { status: 'idle', executionRef, tools: [] };
        input.onEvent({ type: 'completed', status: options.failure ? 'failed' : 'completed', ...(options.failure ? {diagnostic:options.failure} : {}) });
      },
      async observe({ contextRef }) { return options.coldUnknown && !didSend ? { status: 'unknown', tools: [] } : structuredClone(get(contextRef).observation); },
      async reply({ contextRef, answer }) { assert.equal(answer, 'allow-once'); const context = get(contextRef); context.unblock?.(); if (options.replyAfterTerminal) await new Promise(resolve => setTimeout(resolve, 25)); },
      async stop({ contextRef }) { const context = get(contextRef); context.observation = { ...context.observation, status: 'stopped', tools: [] }; context.unblock?.(); return context.observation; },
      summarizeHandoff:options.summary,
      async close() {},
    };
    return runtime;
  } };
  return { executor, contexts, sends, opens, loginUpdate: () => loginUpdate };
}
function fixture(executors: AgentExecutor[], settings: { autoContinueInterrupted?: boolean; shutdownTimeoutMs?: number; now?: () => Date } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-agent-core-'));
  const workspace = path.join(root, 'workspace'); fs.mkdirSync(workspace);
  const options = { ...settings, dataRoot: path.join(root, 'profile'), executors, resolveWorkspace(id: string) { assert.equal(id, 'workspace-one'); return { rootPath: workspace }; }, assertTask(_id: string, taskId: string) { assert.equal(taskId, 'task-one'); } };
  const service = createAgentService(options);
  return { root, workspace, options, service, async close() { await service.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}
async function connected(service: ReturnType<typeof createAgentService>, id: string) { return service.connections.connect(id, { expectedRevision: service.connections.read(id).revision }); }
async function waitUntil<T>(read: () => T, predicate: (value: T) => boolean): Promise<T> {
  for (let i = 0; i < 500; i++) { const value = read(); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 2)); }
  assert.fail('observable state did not settle');
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
    const changed = f.service.conversations.update('workspace-one', created.id, { expectedRevision: completed.revision, title: 'changed' });
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
    const before = f.service.conversations.update('workspace-one', created.id, { expectedRevision: created.revision, title: 'before subscription' });
    const subscription = f.service.conversations.subscribe('workspace-one', created.id);
    const iterator = subscription.events[Symbol.asyncIterator]();
    try {
      const snapshot = (await iterator.next()).value!;
      assert.equal(snapshot.type, 'snapshot'); assert.equal(snapshot.revision, before.revision);
      assert.equal(snapshot.payload.conversation!.title, 'before subscription'); assert.equal(snapshot.generation, f.service.generation);
      f.service.conversations.update('workspace-one', another.id, { expectedRevision: another.revision, title: 'unrelated change' });
      const after = f.service.conversations.update('workspace-one', created.id, { expectedRevision: before.revision, title: 'after subscription' });
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
    for (let index = 1; index < 32; index++) upload();
    const before = f.service.conversations.read('workspace-one', created.id);
    assert.throws(upload, { code: 'agent_attachment_capacity', status: 413 });
    assert.equal(f.service.conversations.read('workspace-one', created.id).revision, before.revision);
    assert.equal(fs.readdirSync(path.join(f.options.dataRoot, 'agent-service', 'attachments', created.id)).length, 33, '32 temporary files plus the submitted image remain');
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
    const named = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.title === '供应商入驻审核流程梳理');
    assert.equal(named.run!.status, 'completed'); assert.equal(titles.length, 1); assert.deepEqual(JSON.parse(titles[0].description), { messages: [{ role: 'user', text: '请梳理供应商入驻业务' }, { role: 'assistant', text: 'answer from local' }] });
    assert.equal(native.sends.length, 1); assert.equal(named.entries.filter(entry => entry.role === 'user').length, 1);
    send(f.service, view.id, 'local', '继续检查'); await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    assert.equal(titles.length, 1);
    await f.service.close(); const restored = createAgentService(f.options); try { await restored.conversations.observe('workspace-one', view.id); assert.equal(titles.length, 1); } finally { await restored.close(); }
  } finally { await f.close(); }
});

test('manual rename wins over a delayed automatic title and failed summaries do not consume another work turn', async () => {
  const native = fake(); const open = native.executor.open; let release!: (title: string) => void; let started = false; let calls = 0;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { started = true; calls++; return await new Promise<string>(resolve => { release = resolve; }); } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', 'first work');
    await waitUntil(() => started, Boolean); const current = f.service.conversations.read('workspace-one', view.id);
    f.service.conversations.update('workspace-one', view.id, { expectedRevision: current.revision, title: '我的手动标题' }); release('延迟生成的标题');
    await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(f.service.conversations.read('workspace-one', view.id).title, '我的手动标题'); assert.equal(native.sends.length, 1);
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
    await waitUntil(() => Boolean(release), Boolean); current = f.service.conversations.read('workspace-one', view.id); f.service.conversations.update('workspace-one', view.id, { expectedRevision: current.revision, title: '保留我的最新命名' }); release('不能覆盖的新名字');
    await assert.rejects(pending, { code: 'agent_revision_conflict' }); assert.equal(f.service.conversations.read('workspace-one', view.id).title, '保留我的最新命名');
  } finally { await f.close(); }
});

test('oversized or failed title inference preserves the neutral name and reserves automatic budget across restart', async () => {
  const native = fake(); const open = native.executor.open; let calls = 0;
  native.executor.open = async input => ({ ...await open(input), async generateTitle() { calls++; return '这是一段超过二十四个汉字的冗长描述标题而不是精短标题必须拒绝'; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {}); send(f.service, view.id, 'local', 'first');
    await waitUntil(() => calls, Boolean); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(f.service.conversations.read('workspace-one', view.id).title, '新对话');
    await f.service.close(); const restored = createAgentService(f.options);
    try { send(restored, view.id, 'local', 'after restart'); await waitUntil(() => restored.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed'); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(calls, 1); assert.equal(native.sends.length, 2); }
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
    let current = f.service.conversations.read('workspace-one', view.id); assert.equal(current.entries.length, done.entries.length); current = f.service.conversations.update('workspace-one', view.id, { expectedRevision: current.revision, title: '手动标题' });
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
  await started;f.service.conversations.update('workspace-one',chat.id,{expectedRevision:done.revision,title:'new title'});release('summary');
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
