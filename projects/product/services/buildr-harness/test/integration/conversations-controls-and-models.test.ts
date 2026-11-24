import { dispatchOperation } from '../../src/process/operations.ts';
import { body } from '../../src/process/transport.ts';
import { opaqueReference } from '../../src/executors/native-process.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import { AgentServiceError } from '../../src/domain/agent-state.ts';
import type { AgentExecutor, AgentRuntime } from '../../src/contracts.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { fake, fixture, connected, waitUntil, send, gatewayProviders, sharedAccount, sendWithAccount, continueDraft } from '../support/conversations-fixture.ts';

test('Qoder expired preparation retains the account-switch action for native and shared models', async () => {
  const native=fake('qoder'),open=native.executor.open;
  native.executor.open=async input=>({...await open(input),inspectAccount:async()=>({status:'expired'})});
  const f=fixture([native.executor],{modelProviders:[]});
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

test('local stop records cancellation before yielding and ignores buffered model output',async()=>{
 const native=fake('local',{hold:true}),f=fixture([native.executor]);
 try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','hold');
  const running=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.accepted===true);
  const run=running.run!,stopping=f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:running.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
  assert.equal(f.service.conversations.read('workspace-one',chat.id).run!.stopRequested,true,'stop intent must be durable before the first asynchronous wait');
  native.sends[0]!.onEvent({type:'item',item:{id:'late-output',kind:'message',role:'assistant',text:'buffered output after stop',status:'running'}});
  assert.equal(f.service.conversations.read('workspace-one',chat.id).entries.some(entry=>entry.text==='buffered output after stop'),false);
  assert.equal((await stopping).run!.status,'stopped');
 }finally{await f.close();}
});

test('stop and authorization respond while send is still waiting; concurrent conversations stay independent', async () => {
  const native = fake('local', { request: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'permission');
    const waiting = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.requests.length === 1);
    assert.equal(f.service.conversations.prepareSend('workspace-one', created.id, { expectedRevision: waiting.revision, connectionId: 'local', text: 'next' }).participantId,undefined);
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

test('model completion does not count as stopped while the exact tool remains active', async () => {
  const native = fake('local', { toolSurvives: true }); const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const created = await f.service.conversations.create('workspace-one', {});
    send(f.service, created.id, 'local', 'leave a command');
    const active = await waitUntil(() => f.service.conversations.read('workspace-one', created.id), view => view.run?.status === 'tools-active');
    assert.equal(active.run!.tools[0]!.id, 'own-tool');
    assert.equal(f.service.conversations.prepareSend('workspace-one',created.id,{expectedRevision:active.revision,connectionId:'local',text:'switch'}).participantId,undefined);
    const stopped = await f.service.conversations.stop('workspace-one', created.id, { expectedRevision: active.revision, runId: active.run!.id, participantId: active.run!.participantId, generation: active.run!.generation, toolId: 'own-tool' });
    assert.equal(stopped.run!.status, 'stopped');
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

test('changing only the reasoning effort reuses the native session and delivers just the new requirement', async () => {
  const native = fake(); const open = native.executor.open;
  native.executor.open = async input => ({ ...await open(input), async models() { return [
    { id: 'small', label: 'Small', isDefault: true, reasoningEfforts: [{ id: 'low', label: 'Fast' }, { id: 'high', label: 'Deep' }], defaultReasoningEffort: 'low' },
  ]; } });
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {});
    const first = { expectedRevision: view.revision, connectionId: 'local', model: 'small', text: 'first requirement', reasoningEffort: 'low' };
    const preview = f.service.conversations.prepareSend('workspace-one', view.id, first);
    f.service.conversations.send('workspace-one', view.id, { ...first, previewToken: preview.token, clientRequestId: randomUUID() });
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    const contextId = done.participants[0]!.contextId;
    const second = { expectedRevision: done.revision, connectionId: 'local', model: 'small', text: 'second requirement', reasoningEffort: 'high' };
    const next = f.service.conversations.prepareSend('workspace-one', view.id, second);
    assert.equal(next.switching, false, '思考深度不是执行组合变化');
    assert.deepEqual(next.handoff?.changes, []); assert.equal(next.reasoningEffort, 'high');
    const started = f.service.conversations.send('workspace-one', view.id, { ...second, clientRequestId: randomUUID() });
    assert.equal(started.run!.reasoningEffort, 'high');
    const after = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed' && value.run.id !== done.run!.id);
    assert.equal(after.participants.length, 1, '同一原生会话不因思考深度新增参与者');
    assert.equal(after.participants[0]!.contextId, contextId);
    assert.equal(after.entries.some(entry => entry.kind === 'handoff'), false, '不生成交接记录');
    assert.equal(native.sends.length, 2);
    assert.equal(native.sends[1]!.contextRef.id, contextId, '新要求送达同一原生会话');
    assert.equal(native.sends[1]!.reasoningEffort, 'high');
    assert.equal(native.sends[1]!.text, 'second requirement', '只交付新要求，不重新注入交接资料');
  } finally { await f.close(); }
});

test('changing only the permission mode reuses the native session and delivers just the new requirement', async () => {
  const native = fake();
  native.executor.descriptor.capabilities.permissionModes = ['default', 'full-access'];
  const open = native.executor.open;
  native.executor.open = async input => { const runtime = await open(input); runtime.capabilities.permissionModes = ['default', 'full-access']; return runtime; };
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local'); const view = await f.service.conversations.create('workspace-one', {});
    const first = { expectedRevision: view.revision, connectionId: 'local', text: 'first requirement', permissionMode: 'default' as const };
    const preview = f.service.conversations.prepareSend('workspace-one', view.id, first);
    f.service.conversations.send('workspace-one', view.id, { ...first, previewToken: preview.token, clientRequestId: randomUUID() });
    const done = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed');
    const contextId = done.participants[0]!.contextId;
    const second = { expectedRevision: done.revision, connectionId: 'local', text: 'second requirement', permissionMode: 'full-access' as const };
    const next = f.service.conversations.prepareSend('workspace-one', view.id, second);
    assert.equal(next.switching, false, '权限不是执行组合变化');
    assert.deepEqual(next.handoff?.changes, []); assert.equal(next.permissionMode, 'full-access');
    const started = f.service.conversations.send('workspace-one', view.id, { ...second, previewToken: next.token, clientRequestId: randomUUID() });
    assert.equal(started.run!.permissionMode, 'full-access');
    const after = await waitUntil(() => f.service.conversations.read('workspace-one', view.id), value => value.run?.status === 'completed' && value.run.id !== done.run!.id);
    assert.equal(after.participants.length, 1, '同一原生会话不因权限新增参与者');
    assert.equal(after.participants[0]!.contextId, contextId);
    assert.equal(after.entries.some(entry => entry.kind === 'handoff'), false, '不生成交接记录');
    assert.equal(native.sends.length, 2);
    assert.equal(native.sends[1]!.contextRef.id, contextId, '新要求送达同一原生会话');
    assert.equal(native.sends[1]!.permissionMode, 'full-access');
    assert.equal(native.sends[1]!.text, 'second requirement', '只交付新要求，不重新注入交接资料');
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
    const first = { expectedRevision: chat.revision, connectionId: 'a', text: 'first' };
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
    const newChat = await f.service.conversations.create('workspace-one', {}); assert.equal(f.service.conversations.prepareSend('workspace-one', newChat.id, { expectedRevision: newChat.revision, connectionId: 'a', text: 'fresh' }).permissionMode, 'full-access');
    f.service.conversations.send('workspace-one', newChat.id, { expectedRevision: newChat.revision, connectionId: 'b', text: 'direct omitted mode', clientRequestId: randomUUID() });
    const freshDone = await waitUntil(() => f.service.conversations.read('workspace-one', newChat.id), value => value.run?.status === 'completed');
    assert.equal(freshDone.run!.permissionMode, 'full-access');
    await f.service.close(); const restored = createAgentService(f.options);
    try {
      assert.equal(restored.conversations.read('workspace-one', chat.id).run!.permissionMode, 'full-access');
      const observationStart = resumes.length; done = await restored.conversations.observe('workspace-one', chat.id);
      assert.equal(done.run!.permissionMode, 'full-access'); assert.deepEqual(resumes.slice(observationStart), [{ provider: 'a', permissionMode: undefined }, { provider: 'b', permissionMode: undefined }]);
      const defaultDraft = { expectedRevision: done.revision, connectionId: 'a', text: 'default again', permissionMode: 'default' as const }; const reset = restored.conversations.prepareSend('workspace-one', chat.id, defaultDraft); assert.equal(reset.permissionMode, 'default');
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
      assert.equal(f.service.conversations.prepareSend('workspace-one',chat.id,{expectedRevision:unknown.revision,connectionId:'local',text:'new issue, no replay'}).participantId,undefined);
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
    assert.throws(() => f.service.conversations.send('workspace-one', chat.id, { expectedRevision: done.revision, connectionId: 'local', text: 'legacy accepted input', clientRequestId: 'legacy-mode-request' }), { code: 'agent_request_conflict' });
    const repeated = f.service.conversations.send('workspace-one', chat.id, { expectedRevision: done.revision, connectionId: 'local', text: 'legacy accepted input', permissionMode: 'default', previewToken: 'not-used-for-an-already-accepted-request', clientRequestId: 'legacy-mode-request' });
    assert.equal(repeated.run.id, done.run!.id); assert.equal(repeated.run.permissionMode, undefined); assert.equal(native.sends.length, 1);
    const preview = f.service.conversations.prepareSend('workspace-one', chat.id, { expectedRevision: done.revision, connectionId: 'local', text: 'new input' }); assert.equal(preview.permissionMode, 'default');
  } finally { await f.close(); }
});

test('stopping an unresolved submission without a native execution identity ends the round and persists cancellation',async()=>{
  const native=fake('local',{unknown:true}),f=fixture([native.executor],{autoContinueInterrupted:true});
  let cold:ReturnType<typeof createAgentService>|undefined;
  try {
    await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','do not replay this');
    const before=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='unknown');
    const run=before.run!;
    const stopped=await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:before.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
    assert.equal(stopped.run!.status,'stopped');assert.equal(stopped.run!.stopRequested,true);assert.notEqual(stopped.run!.resourcesReleased,true);
    assert.match(stopped.run!.diagnostic!,/已结束本轮等待.*是否送达仍未知/);
    await f.service.close();
    const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));
    assert.equal(repository.readConversation(chat.id)!.interruption?.cancelled,true);
    cold=createAgentService(f.options);await cold.conversations.recoverInterrupted();
    assert.equal(native.sends.length,1);assert.equal(cold.conversations.read('workspace-one',chat.id).run!.status,'stopped');
  } finally {await cold?.close();await f.close();}
});

test('an unconfirmed stop permits same-selection new input without an internal handoff confirmation or replay',async()=>{
 const native=fake('local',{hold:true}),open=native.executor.open;
 native.executor.open=async options=>{const runtime=await open(options);return {...runtime,stop:async()=>{throw new Error('original stop channel unavailable');}};};
 const f=fixture([native.executor]);try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','old requirement');
  const before=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.accepted===true);
  const result=await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:before.revision,runId:before.run!.id,participantId:before.run!.participantId,generation:before.run!.generation});
  assert.equal(result.run!.stopRequested,true);assert.equal(result.run!.status,'unknown');
  const stopped=f.service.conversations.read('workspace-one',chat.id);assert.equal(stopped.run!.stopRequested,true);assert.equal(stopped.run!.status,'unknown');
  const draft={expectedRevision:stopped.revision,connectionId:'local',text:'new requirement',clientRequestId:randomUUID()};
  f.service.conversations.send('workspace-one',chat.id,draft);
  const next=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.id!==before.run!.id&&view.run?.accepted===true);
  assert.equal(next.retainedRuns?.[0]?.id,before.run!.id);assert.equal(next.retainedRuns?.[0]?.status,'unknown');assert.equal(next.retainedRuns?.[0]?.stopRequested,true);
  assert.notEqual(next.run!.participantId,before.run!.participantId);assert.equal(native.sends.length,2);assert.equal(native.contexts.size,2);
 }finally{await f.close();}
});

for(const replacement of ['local','other'])test('retained tools allow a new instruction with '+replacement+' and preserve exact old stop',async()=>{
  const old=fake('local',{toolSurvives:true}),other=fake('other');const f=fixture([old.executor,other.executor]);
  try{
    await connected(f.service,'local');await connected(f.service,'other');const chat=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,'local','start helper');const before=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='tools-active');
    const unconfirmed={expectedRevision:before.revision,connectionId:replacement,text:'handle the new requirement',clientRequestId:randomUUID()};
    if(replacement==='local')f.service.conversations.send('workspace-one',chat.id,unconfirmed);
    else{
      assert.throws(()=>f.service.conversations.send('workspace-one',chat.id,unconfirmed),{code:'agent_session_confirmation_required'});
      send(f.service,chat.id,replacement,'handle the new requirement');
    }
    const next=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.id!==before.run!.id&&['completed','tools-active'].includes(view.run?.status??''));
    assert.equal(next.retainedRuns?.[0]?.id,before.run!.id);assert.notEqual(next.run!.participantId,before.run!.participantId);
    assert.equal(old.contexts.size,replacement==='local'?2:1,'new work cannot overwrite an unfinished native context');
    assert.equal(next.retainedRuns?.[0]?.status,'tools-active');
    assert.equal(Boolean(next.retainedRuns?.[0]?.supersededBy),false);
    if(replacement==='local')assert.equal(next.entries.filter(entry=>entry.kind==='handoff'&&!entry.nativeSession).length,0,'internal control diagnostics do not create a user-selected handoff');
    await assert.rejects(f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:before.revision,runId:before.run!.id,participantId:before.run!.participantId,generation:before.run!.generation}),{code:'agent_revision_conflict'});
    const stopped=await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:next.revision,runId:before.run!.id,participantId:before.run!.participantId,generation:before.run!.generation,toolId:'own-tool'});
    assert.equal(stopped.retainedRuns?.[0]?.status,'stopped');assert.equal(stopped.run!.id,next.run!.id);assert.equal(stopped.run!.status,next.run!.status);
    assert.equal((replacement==='local'?old:other).sends.at(-1)!.text.includes('retainedExecutions'),true);
    assert.equal(old.sends.filter(input=>input.text==='start helper').length,1);
  }finally{await f.close();}
});

test('unknown retained stop is local to that execution and never replays or ends the new run',async()=>{
  const old=fake('local',{toolSurvives:true}),other=fake('other'),open=old.executor.open;
  old.executor.open=async input=>({...await open(input),async stop(){throw new Error('stop receipt lost');}});
  const f=fixture([old.executor,other.executor]);try{
    await connected(f.service,'local');await connected(f.service,'other');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','one operation');
    const before=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='tools-active');
    send(f.service,chat.id,'other','new direction');const next=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
    const stopped=await f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:next.revision,runId:before.run!.id,participantId:before.run!.participantId,generation:before.run!.generation});
    assert.equal(stopped.retainedRuns?.find(run=>run.id===before.run!.id)?.stopRequested,true);
    const after=f.service.conversations.read('workspace-one',chat.id);assert.equal(after.run!.id,next.run!.id);assert.equal(after.run!.status,'completed');assert.equal(after.retainedRuns?.[0]?.status,'unknown');
    assert.equal(old.sends.length,1);assert.equal(other.sends.length,1);
    assert.equal(f.service.conversationBusy('workspace-one',chat.id),true);assert.equal(f.service.conversationInputBusy('workspace-one',chat.id),false);
  }finally{await f.close();}
});

for(const blocked of ['none','stop','live-owner','unreleased','conflict'] as const)test('cold old control release preserves unknown outcomes and clears hidden activity: '+blocked,async()=>{
 const native=fake('local'),f=fixture([native.executor]);let observer:ReturnType<typeof createAgentService>|undefined;
 try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','finish');
  await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const repo=new ConversationRepository(path.join(f.options.dataRoot,'agent-service')),record=repo.readConversation(chat.id)!,prior=record.view.revision;
  record.view.hidden=true;record.view.retainedRuns=[{...record.view.run!,id:'old-run',generation:'old-generation',status:'unknown',executionState:'unknown',resourcesReleased:false,tools:[]}];
  record.attempts.push({...record.attempts[0]!,runId:'old-run'});record.view.revision=randomUUID();repo.saveConversation(record,prior);
  const opens=native.opens.length,sends=native.sends.length;
  native.executor.readReleasedControl=async()=>{
   if(blocked==='conflict'){const changed=repo.readConversation(chat.id)!,revision=changed.view.revision;changed.view.title='concurrent rename';changed.view.revision=randomUUID();repo.saveConversation(changed,revision);}
   return blocked!=='unreleased';
  };
  observer=createAgentService({...f.options,generationAlive:()=>blocked==='live-owner'});
  const before=observer.conversations.read('workspace-one',chat.id),run=before.retainedRuns![0]!;
  await assert.rejects(observer.conversations.observeRun('workspace-one',chat.id,{expectedRevision:'stale',runId:run.id,participantId:run.participantId,generation:run.generation}),{code:'agent_revision_conflict'});
  const input={expectedRevision:before.revision,runId:run.id,participantId:run.participantId,generation:run.generation};
  if(blocked==='none'||blocked==='stop'){
   const after=blocked==='stop'?await observer.conversations.stop('workspace-one',chat.id,input):await observer.conversations.observeRun('workspace-one',chat.id,input);
   assert.equal(after.retainedRuns![0]!.resourcesReleased,true);assert.equal(after.retainedRuns![0]!.status,'unknown');assert.equal(after.retainedRuns![0]!.executionState,'unknown');assert.equal(after.activity!.active,false);
   const stopped=await observer.conversations.stop('workspace-one',chat.id,{...input,expectedRevision:after.revision});assert.equal(stopped.retainedRuns![0]!.stopRequested,true);
  }else{
   await assert.rejects(observer.conversations.observeRun('workspace-one',chat.id,input),{code:'agent_control_stale'});
   assert.equal(observer.conversations.read('workspace-one',chat.id).retainedRuns![0]!.resourcesReleased,false);
  }
  assert.equal(native.opens.length,opens);assert.equal(native.sends.length,sends);
 }finally{await observer?.close();await f.close();}
});

test('DSH stop releases the exact exited cold host without opening it and accepts the next instruction',async()=>{
 const {spawn}=await import('node:child_process');
 const {createDshExecutor}=await import('../../src/executors/dsh/index.ts');
 const native=fake('dsh'),f=fixture([native.executor]);let observer:ReturnType<typeof createAgentService>|undefined;
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
 await new Promise<void>(resolve=>child.once('spawn',resolve));
 try{
  await connected(f.service,'dsh');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'dsh','original');
  await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const repo=new ConversationRepository(path.join(f.options.dataRoot,'agent-service')),record=repo.readConversation(chat.id)!,prior=record.view.revision;
  const run=record.view.run!,participant=record.participants.find(p=>p.id===run.participantId)!,attempt=record.attempts.find(a=>a.runId===run.id)!;
  participant.contextRef!.data={native:opaqueReference('dsh',participant.contextRef!.id,record.view.cwd,participant.bindingIdentity!)};
  attempt.executionRef!.data={resourceGroup:child.pid!,resourceContext:participant.contextRef!.id,resourceBinding:participant.bindingIdentity!,backgroundWork:true};
  Object.assign(run,{generation:'departed-owner',status:'tools-active',executionState:'active',resourcesReleased:false,interrupted:true,tools:[{id:'uncertain-command',label:'bash',status:'running'}]});
  record.interruption={runId:run.id,awaitingUser:false};record.view.revision=randomUUID();repo.saveConversation(record,prior);
  native.executor.readReleasedControl=createDshExecutor().readReleasedControl;
  const open=native.executor.open;let forbidOpen=true;
  native.executor.open=async input=>{if(forbidOpen)throw Error('must_not_open_old_connection');return open(input);};
  observer=createAgentService({...f.options,generationAlive:()=>false});
  const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill();await exited;
  const before=observer.conversations.read('workspace-one',chat.id),entries=before.entries.length,sends=native.sends.length;
  const stopped=await observer.conversations.stop('workspace-one',chat.id,{expectedRevision:before.revision,runId:run.id,participantId:run.participantId,generation:run.generation});
  assert.equal(stopped.run!.resourcesReleased,true);assert.equal(stopped.run!.stopRequested,true);
  assert.equal(stopped.run!.status,'unknown');assert.equal(stopped.run!.executionState,'unknown');assert.equal(stopped.run!.tools[0].status,'unknown');
  assert.equal(stopped.entries.length,entries);assert.equal(native.sends.length,sends);assert.ok(stopped.run!.tools.every(tool=>tool.status!=='running'));
  forbidOpen=false;
  // Stop must return without replay; only this explicit new request can send.
  const draft={expectedRevision:stopped.revision,connectionId:'dsh',text:'new instruction after stop'};
  await observer.conversations.send('workspace-one',chat.id,{...draft,clientRequestId:randomUUID()});
  const completed=await waitUntil(()=>observer!.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  assert.equal(native.sends.length,sends+1);assert.ok(completed.entries.some(e=>e.text==='new instruction after stop'));
  assert.equal(completed.retainedRuns!.find(r=>r.id===run.id)!.resourcesReleased,true);
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill();await observer?.close();await f.close();}
});

for(const accepted of [true,false])test('explicit stop escape isolates unknown work and preserves exact controls; accepted='+accepted,async()=>{
 const native=fake('local',{disconnect:'unknown'}),f=fixture([native.executor]);
 const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));
 try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'local','preserve my goal');
  await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='unknown');
  const record=repository.readConversation(chat.id)!,revision=record.view.revision,old=record.view.run!;
  old.stopRequested=true;old.accepted=accepted;old.resourcesReleased=false;old.executionState='unknown';
  old.tools=[{id:'unknown-command',label:'command',status:'unknown'}];
  record.view.revision=randomUUID();repository.saveConversation(record,revision);
  const draft=continueDraft(f.service,chat.id),preview=f.service.conversations.prepareSend('workspace-one',chat.id,draft);
  assert.equal(preview.participantId,undefined,'stop escape must not reuse the old native context');
  const request={...draft,previewToken:preview.token,clientRequestId:randomUUID()};
  const first=f.service.conversations.send('workspace-one',chat.id,request);
  const repeated=f.service.conversations.send('workspace-one',chat.id,request);
  assert.equal(repeated.run.id,first.run.id,'duplicate click keeps the exact new execution');
  const done=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.status==='completed');
  assert.equal(native.sends.length,2);
  assert.notEqual(native.sends[0]!.contextRef.id,native.sends[1]!.contextRef.id);
  assert.match(native.sends[1]!.text,/旧命令可能仍在运行/);
  const retained=done.retainedRuns!.find(run=>run.id===old.id)!;
  assert.equal(retained.participantId,old.participantId);assert.equal(retained.generation,old.generation);
  assert.equal(retained.status,'unknown');assert.equal(retained.resourcesReleased,false);
  assert.throws(()=>f.service.conversations.prepareSend('workspace-one',chat.id,{...draft,expectedRevision:done.revision}),/原执行已变化/);
 }finally{repository.stopReadModels();await f.close();}
});

for(const provider of ['codex','dsh','qoder','qoder-cn'])test(`${provider} conversation-wide stop ends retained work when the latest round already ended, without stopping another conversation`,async()=>{
  const native=fake(provider,{hold:true}),f=fixture([native.executor]);
  try{
    await connected(f.service,provider);
    const chat=await f.service.conversations.create('workspace-one',{}),brother=await f.service.conversations.create('workspace-one',{});
    send(f.service,chat.id,provider,'old retained work');send(f.service,brother.id,provider,'independent work');
    const running=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.run?.accepted===true);
    await waitUntil(()=>f.service.conversations.read('workspace-one',brother.id),view=>view.run?.accepted===true);
    const repository=new ConversationRepository(path.join(f.options.dataRoot,'agent-service'));
    const record=repository.readConversation(chat.id)!,prior=record.view.revision,old=record.view.run!;
    record.view.retainedRuns=[old];record.view.run={...old,id:randomUUID(),status:'stopped',accepted:false,tools:[]};record.view.revision=randomUUID();repository.saveConversation(record,prior);
    const current=f.service.conversations.read('workspace-one',chat.id);
    const stopId=randomUUID();const stopped=await f.service.conversations.stopAll('workspace-one',chat.id,{expectedRevision:current.revision,clientRequestId:stopId});
    assert.equal(stopped.retainedRuns?.find(run=>run.id===running.run!.id)?.status,'stopped');
    assert.deepEqual(stopped.stopRequest?.runIds,[old.id]);assert.equal(stopped.stopRequest?.id,stopId);
    assert.equal(f.service.conversations.read('workspace-one',brother.id).run?.status,'running');
    const replay=await f.service.conversations.stopAll('workspace-one',chat.id,{expectedRevision:'stale',clientRequestId:stopId});assert.equal(replay.stopRequest?.id,stopId);
    const live=f.service.conversations.read('workspace-one',brother.id);await f.service.conversations.stopAll('workspace-one',brother.id,{expectedRevision:live.revision,clientRequestId:randomUUID()});
  }finally{for(const context of native.contexts.values()){context.observation={status:'stopped',tools:[]};context.unblock?.();}await f.close();}
});

test('conversation stop prevents late answers when the original native cancellation is unconfirmed',async()=>{
 const native=fake('local',{question:true}),f=fixture([native.executor],{controlSupersededRun:async()=>{throw new Error('original owner unavailable');}});
 try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});send(f.service,chat.id,'local','question');
  const waiting=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),view=>view.requests.length>0);
  const stopped=await f.service.conversations.stopAll('workspace-one',chat.id,{expectedRevision:waiting.revision,clientRequestId:randomUUID()});
  const request=waiting.requests[0],run=waiting.run!;
  await assert.rejects(f.service.conversations.reply('workspace-one',chat.id,request.id,{expectedRevision:stopped.revision,runId:run.id,participantId:run.participantId,generation:run.generation,answer:'yes'}),{code:'agent_request_stale'});
  assert.equal(native.replies.length,0);
 }finally{for(const context of native.contexts.values()){context.observation={status:'stopped',tools:[]};context.unblock?.();}await f.close();}
});

test('queue-only conversation stop publishes its committed cancellation and preserves the submitted draft',async()=>{
 const native=fake('local'),f=fixture([native.executor]);
 try{
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
  const queued=f.service.conversations.queueSend('workspace-one',chat.id,{expectedRevision:chat.revision,connectionId:'local',text:'keep cancelled input',clientRequestId:randomUUID()});
  const subscription=f.service.conversations.subscribe('workspace-one',chat.id),iterator=subscription.events[Symbol.asyncIterator]();await iterator.next();
  try{
   const stopped=await f.service.conversations.stopAll('workspace-one',chat.id,{expectedRevision:queued.revision,clientRequestId:randomUUID()});
   assert.equal(stopped.pendingSend,undefined);assert.equal(stopped.stopRequest?.cancelledSend?.draft.text,'keep cancelled input');
   const event=await iterator.next();assert.equal(event.value.payload.conversation.pendingSend,undefined);assert.equal(native.sends.length,0);
  }finally{subscription.close();}
 }finally{await f.close();}
});

test('Harness system prompt has durable defaults, optimistic concurrency and validated HTTP/IPC settings',async t=>{
  const native=fake(),f=fixture([native.executor]);t.after(()=>f.close());
  const before=f.service.systemPrompt.read();
  assert.equal(before.enabled,true);assert.ok(before.text.trim(),'the default system prompt is non-empty');
  assert.equal(fs.existsSync(path.join(f.options.dataRoot,'agent-service/system-prompt.json')),false,'reading defaults does not write');
  const saved=f.service.systemPrompt.save({expectedRevision:before.revision,enabled:true,text:'Use concise replies. {{literal}}'});
  assert.notEqual(saved.revision,before.revision);
  assert.throws(()=>f.service.systemPrompt.save({expectedRevision:before.revision,enabled:false,text:'stale'}),{code:'agent_revision_conflict'});
  assert.deepEqual(await dispatchOperation(f.service,'systemPrompt.read',[]),saved);
  await assert.rejects(()=>dispatchOperation(f.service,'systemPrompt.save',[{expectedRevision:saved.revision,enabled:true,text:'x'.repeat(16001)}]));
  const {HarnessSystemPromptSettings}=await import('../../src/application/system-prompt.ts');
  assert.deepEqual(new HarnessSystemPromptSettings(f.options.dataRoot).read(),saved);
  const {createAgentServiceHttpContribution}=await import('../../src/interfaces/http/agent-service-http.ts');
  const http=createAgentServiceHttpContribution(()=>f.service);let reads=0,writes=0;
  const context={pathname:'/api/v1/harness/system-prompt',searchParams:new URLSearchParams(),authorizeRead(){reads++;},authorizeWrite(){writes++;},request:{method:'GET'}};
  const read=await http.handleTopLevel(context);assert.equal(read.status,200);assert.deepEqual(read.body,saved);assert.equal(reads,1);
  const changed=await http.handleTopLevel({...context,request:{method:'POST'},readJsonBody:async()=>({expectedRevision:saved.revision,enabled:false,text:saved.text})});
  assert.equal(changed.body.enabled,false);assert.equal(writes,1);
});

test('Harness prompt changes rebuild only future contexts, preserve old snapshots, and survive switching',async t=>{
  const native=fake('local'),other=fake('other'),f=fixture([native.executor,other.executor]);t.after(()=>f.close());
  native.executor.descriptor.capabilities.systemPrompt={append:true};
  await connected(f.service,'local');await connected(f.service,'other');
  const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'local','first');
  const first=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='completed');
  const old=first.run!.systemPrompt!;assert.equal(old.delivery,'native');
  const saved=f.service.systemPrompt.save({expectedRevision:old.revision,enabled:true,text:'concise-new-version'});
  assert.deepEqual(f.service.conversations.read('workspace-one',chat.id).run!.systemPrompt,old,'saving never rewrites an old run');
  send(f.service,chat.id,'local','second');
  const second=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.id!==first.run!.id&&v.run?.status==='completed');
  assert.equal(second.run!.systemPrompt!.revision,saved.revision);
  assert.notEqual(native.sends[0].contextRef.id,native.sends[1].contextRef.id);
  assert.ok(native.opens.at(-1)!.interaction!.instructions.endsWith(saved.text));
  assert.ok(!native.opens[0].interaction!.instructions.includes(saved.text));
  assert.equal(native.sends.length,2,'no user input is replayed as execution');
  assert.ok(second.entries.some(entry=>entry.nativeSession?.description.includes('交互政策已更新')));
  send(f.service,chat.id,'other','third');
  const third=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.provider==='other'&&v.run.status==='completed');
  assert.equal(third.run!.systemPrompt!.revision,saved.revision);
  assert.equal(third.run!.systemPrompt!.delivery,'unsupported','unknown adapters must not claim native support');
  const disabled=f.service.systemPrompt.save({expectedRevision:saved.revision,enabled:false,text:saved.text});
  send(f.service,chat.id,'local','fourth');
  const fourth=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.provider==='local'&&v.run.status==='completed');
  assert.equal(fourth.run!.systemPrompt!.revision,disabled.revision);assert.equal(fourth.run!.systemPrompt!.enabled,false);
  assert.ok(!native.opens.at(-1)!.interaction!.instructions.includes(saved.text));
});

test('saving a Harness prompt leaves an active execution and its exact stop control intact',async t=>{
  const native=fake('local',{hold:true}),f=fixture([native.executor]);t.after(()=>f.close());
  await connected(f.service,'local');const chat=await f.service.conversations.create('workspace-one',{});
  send(f.service,chat.id,'local','continue until stopped');
  const first=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.accepted===true);
  const prompt=f.service.systemPrompt.read();f.service.systemPrompt.save({expectedRevision:prompt.revision,enabled:true,text:'new preference'});
  const unchanged=f.service.conversations.read('workspace-one',chat.id);assert.equal(unchanged.run!.id,first.run!.id);assert.deepEqual(unchanged.run!.systemPrompt,first.run!.systemPrompt);
  f.service.conversations.stop('workspace-one',chat.id,{expectedRevision:unchanged.revision,runId:first.run!.id,participantId:first.run!.participantId,generation:first.run!.generation});
  await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.status==='stopped');assert.equal(native.sends.length,1);
});

test('model-account cached source runtimes keep exact old prompt controls and apply new versions',async t=>{
  const native=fake('codex',{hold:true}),f=fixture([native.executor],{modelProviders:gatewayProviders});t.after(()=>f.close());
  native.executor.descriptor.capabilities.systemPrompt={append:true};
  await connected(f.service,'codex');const account=await sharedAccount(f);
  const chat=await f.service.conversations.create('workspace-one',{});
  sendWithAccount(f,chat.id,account.id,'old work');
  const first=await waitUntil(()=>f.service.conversations.read('workspace-one',chat.id),v=>v.run?.accepted===true);
  const prompt=f.service.systemPrompt.read(),saved=f.service.systemPrompt.save({expectedRevision:prompt.revision,enabled:true,text:'gateway-new-prompt'});
  const sibling=await f.service.conversations.create('workspace-one',{});sendWithAccount(f,sibling.id,account.id,'new independent work');
  const next=await waitUntil(()=>f.service.conversations.read('workspace-one',sibling.id),v=>v.run?.accepted===true);
  assert.equal(next.run!.systemPrompt!.revision,saved.revision);assert.equal(first.run!.systemPrompt!.revision,prompt.revision);
  assert.ok(native.opens.some(open=>open.interaction!.instructions.endsWith(saved.text)));
  for(const id of [chat.id,sibling.id]){const view=f.service.conversations.read('workspace-one',id),run=view.run!;f.service.conversations.stop('workspace-one',id,{expectedRevision:view.revision,runId:run.id,participantId:run.participantId,generation:run.generation});await waitUntil(()=>f.service.conversations.read('workspace-one',id),v=>v.run?.status==='stopped');}
  assert.equal(native.sends.length,2,'settings and exact old controls never dispatch additional input');
});

test('observe forwards permissionMode during unknown reconcile and supplement surfaces readable unknown diagnostic', async () => {
  const resumedModes: Array<string | undefined> = [];
  const native = fake('local');
  native.executor.descriptor.capabilities.permissionModes = ['default', 'full-access'];
  const open = native.executor.open;
  let executionRef = { id: 'execution-1' };
  const unknownDiagnostic = 'Antigravity 正文已结束，但仍有工具缺少完成回执；未报告为完整成功。';
  native.executor.open = async input => {
    const rt = await open(input);
    rt.capabilities.permissionModes = ['default', 'full-access'];
    rt.capabilities.supplement = true;
    return {
      ...rt,
      async resumeContext(args) { resumedModes.push(args.permissionMode); return rt.resumeContext(args); },
      async send(args) {
        executionRef = { id: args.clientRequestId };
        args.onEvent({ type: 'accepted', executionRef });
        args.onEvent({
          type: 'observation',
          observation: {
            status: 'unknown', executionRef,
            tools: [{ id: 'tool-1', label: 'read', status: 'unknown' }],
            diagnostic: unknownDiagnostic,
          },
        });
      },
      async observe() {
        return {
          status: 'unknown', executionRef,
          tools: [{ id: 'tool-1', label: 'read', status: 'unknown' }],
          diagnostic: unknownDiagnostic,
        };
      },
      async supplement() { throw new Error('supplement must not run when unknown'); },
    };
  };
  const f = fixture([native.executor]);
  try {
    await connected(f.service, 'local');
    const chat = await f.service.conversations.create('workspace-one', {});
    const draft = { expectedRevision: chat.revision, connectionId: 'local', model: 'test-model', permissionMode: 'full-access' as const, text: 'unknown test' };
    const preview = f.service.conversations.prepareSend('workspace-one', chat.id, draft);
    f.service.conversations.send('workspace-one', chat.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
    const unknown = await waitUntil(() => f.service.conversations.read('workspace-one', chat.id), v => v.run?.status === 'unknown');
    resumedModes.length = 0;
    const observed = await f.service.conversations.observe('workspace-one', chat.id);
    assert.equal(observed.run?.status, 'unknown');
    assert.ok(resumedModes.includes('full-access'));
    const sup = await f.service.conversations.supplement('workspace-one', chat.id, {
      runId: unknown.run!.id, participantId: unknown.run!.participantId, generation: unknown.run!.generation,
      clientRequestId: randomUUID(), text: 'already open',
    });
    assert.equal(sup.delivery, 'rejected');
    const failedEntry = sup.conversation.entries.findLast(e => e.role === 'user' && e.text === 'already open');
    assert.match(failedEntry?.deliveryDiagnostic ?? '', /仍有工具缺少完成回执/);
    assert.match(failedEntry?.deliveryDiagnostic ?? '', /停止/);
  } finally {
    await f.close();
  }
});
