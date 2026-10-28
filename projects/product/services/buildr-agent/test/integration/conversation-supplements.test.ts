import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAgentService, ExecutorInputRejected, type AgentExecutor, type AgentRuntime, type ExecutorEvent, type ExecutorItem, type ExecutorObservation, type ExecutorSupplementInput } from '../../build/index.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=', 'base64');
function gate() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function wait(read: () => boolean) { for (let i = 0; i < 400; i++) { if (read()) return; await new Promise(resolve => setTimeout(resolve, 2)); } assert.fail('state did not settle'); }
async function fixture(options: { beforeSupplement?: Promise<void>; delivery?: 'rejected' | 'unknown'; supported?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-supplement-')), ending = gate();
  const calls: ExecutorSupplementInput[] = [], items: ExecutorItem[] = []; let emit: (event: ExecutorEvent) => void = () => {};
  let observation: ExecutorObservation = { status: 'idle', tools: [] };
  const capabilities = { supplement: options.supported !== false, text: true, images: true, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 65536 };
  const runtime: AgentRuntime = {
    capabilities, bindingIdentity: 'fixture-binding', async inspectAccount() { return { status: 'ready' }; }, async models() { return [{ id: 'fixture-model', label: 'Fixture model' }]; }, async beginLogin() {}, async cancelLogin() {},
    async createContext() { return { id: 'native-context' }; }, async resumeContext() {}, async readHistory() { return structuredClone(items); },
    async send(input) {
      emit = input.onEvent; observation = { status: 'running', executionRef: { id: 'native-run' }, tools: [] };
      emit({ type: 'accepted', executionRef: observation.executionRef!, inputItemId: input.clientRequestId });
      const item: ExecutorItem = { id: input.clientRequestId, clientRequestId: input.clientRequestId, kind: 'message', role: 'user', text: input.text, executionId: 'native-run' }; items.push(item); emit({ type: 'item', item });
      await ending.promise; observation = { status: 'idle', executionRef: { id: 'native-run' }, tools: [] }; emit({ type: 'completed', status: 'completed' });
    },
    async supplement(input) {
      calls.push(input); await options.beforeSupplement;
      if (options.delivery === 'rejected') throw new ExecutorInputRejected('proven rejection');
      if (options.delivery === 'unknown') throw new Error('receipt lost');
      const item: ExecutorItem = { id: 'native-' + input.clientRequestId, clientRequestId: input.clientRequestId, kind: 'message', role: 'user', text: input.text, executionId: input.executionRef.id };
      items.push(item); emit({ type: 'item', item }); return { executionRef: input.executionRef, inputItemId: item.id };
    },
    async observe() { return structuredClone(observation); }, async reply() {}, async stop() { observation = { status: 'stopped', tools: [] }; ending.resolve(); return observation; }, async close() { ending.resolve(); },
  };
  const executor: AgentExecutor = { descriptor: { id: 'fixture', label: 'Fixture', capabilities }, async open() { return runtime; } };
  const service = createAgentService({ dataRoot: path.join(root, 'private'), executors: [executor], modelProviders: [], resolveWorkspace() { return { rootPath: root }; } });
  await service.connections.connect('fixture', { expectedRevision: service.connections.read('fixture').revision });
  let view = await service.conversations.create('workspace', {});
  const draft = { expectedRevision: view.revision, connectionId: 'fixture', text: 'initial' };
  const preview = service.conversations.prepareSend('workspace', view.id, draft);
  service.conversations.send('workspace', view.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
  await wait(() => service.conversations.read('workspace', view.id).run?.status === 'running');
  const read = () => service.conversations.read('workspace', view.id);
  const input = (text: string, clientRequestId = randomUUID()) => { const run = read().run!; return { runId: run.id, participantId: run.participantId, generation: run.generation, text, clientRequestId }; };
  return { service, read, input, calls, emit: (event: ExecutorEvent) => emit(event), async close() { ending.resolve(); await service.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

test('multiple supplementary inputs retain exact identity, ordering and idempotency within one execution', async () => {
  const f = await fixture(); try {
    const runId = f.read().run!.id, one = f.input('first'), two = f.input('second');
    assert.equal((await f.service.conversations.supplement('workspace', f.read().id, one)).delivery, 'accepted');
    assert.equal((await f.service.conversations.supplement('workspace', f.read().id, two)).delivery, 'accepted');
    await f.service.conversations.supplement('workspace', f.read().id, one);
    assert.equal(f.calls.length, 2); assert.equal(f.read().run!.id, runId);
    assert.deepEqual(f.read().entries.filter(entry => entry.role === 'user').map(entry => [entry.text, entry.status]), [['initial', 'accepted'], ['first', 'accepted'], ['second', 'accepted']]);
    await f.service.conversations.observe('workspace', f.read().id); assert.equal(f.read().entries.filter(entry => entry.role === 'user').length, 3);
    await assert.rejects(async () => f.service.conversations.supplement('workspace', f.read().id, { ...one, text: 'different' }), /相同请求身份/);
  } finally { await f.close(); }
});
test('in-flight repeats share admission and late receipt preserves concurrent record changes', async () => {
  const before = gate(), f = await fixture({ beforeSupplement: before.promise }); try {
    const input = f.input('delayed'), a = f.service.conversations.supplement('workspace', f.read().id, input), b = f.service.conversations.supplement('workspace', f.read().id, input);
    await assert.rejects(async () => f.service.conversations.supplement('workspace', f.read().id, { ...input, text: 'conflicting in flight' }), /相同请求身份/);
    await wait(() => f.calls.length === 1);
    f.service.conversations.update('workspace', f.read().id, { expectedRevision: f.read().revision, title: 'renamed concurrently' });
    f.emit({ type: 'item', item: { id: 'tool-new', kind: 'tool', role: 'system', text: 'new output', executionId: 'native-run', status: 'completed' } });
    before.resolve(); assert.equal((await a).delivery, 'accepted'); assert.equal((await b).delivery, 'accepted');
    assert.equal(f.calls.length, 1); assert.equal(f.read().title, 'renamed concurrently'); assert.ok(f.read().entries.some(entry => entry.id && entry.text === 'new output'));
  } finally { before.resolve(); await f.close(); }
});
test('rejection and unknown supplementary delivery preserve the original execution and never replay', async () => {
  for (const delivery of ['rejected', 'unknown'] as const) {
    const f = await fixture({ delivery }); try {
      const input = f.input(delivery); const result = await f.service.conversations.supplement('workspace', f.read().id, input);
      assert.equal(result.delivery, delivery); assert.equal(f.read().run!.status, 'running'); assert.equal(f.read().entries.at(-1)!.status, delivery === 'rejected' ? 'failed' : 'unknown');
      await f.service.conversations.observe('workspace', f.read().id); await f.service.conversations.supplement('workspace', f.read().id, input); assert.equal(f.calls.length, 1);
      if (delivery === 'unknown') {
        f.emit({ type: 'item', item: { id: 'observed-native-input', clientRequestId: input.clientRequestId, kind: 'message', role: 'user', text: input.text, executionId: 'native-run' } });
        assert.equal((await f.service.conversations.supplement('workspace', f.read().id, input)).delivery, 'accepted');
      }
    } finally { await f.close(); }
  }
});
test('wrong execution and unavailable capability reject without appending or dispatching input', async () => {
  const f = await fixture({ supported: false }); try {
    await assert.rejects(async () => f.service.conversations.supplement('workspace', f.read().id, { ...f.input('wrong'), runId: 'other-run' }), /原执行已变化/);
    await assert.rejects(async () => f.service.conversations.supplement('workspace', f.read().id, f.input('unsupported')), /尚不支持/);
    assert.equal(f.calls.length, 0); assert.equal(f.read().entries.length, 1);
  } finally { await f.close(); }
});
test('supplementing while approval is pending does not answer or replace the request', async () => {
  const f = await fixture(); try {
    f.emit({ type: 'request', request: { id: 'native-approval', kind: 'approval', title: 'Allow write?' } }); const pending = f.read().requests[0];
    await f.service.conversations.supplement('workspace', f.read().id, f.input('additional context'));
    assert.equal(f.read().run!.status, 'waiting-approval'); assert.equal(f.read().requests[0].id, pending.id);
  } finally { await f.close(); }
});
test('image admission has its own observed revision and never overwrites streamed entries', async () => {
  const f = await fixture(); try {
    const before = f.read(); f.emit({ type: 'item', item: { id: 'streamed', kind: 'message', role: 'assistant', text: 'new text', executionId: 'native-run', status: 'running' } });
    const image = f.service.conversations.addAttachment('workspace', before.id, { expectedRevision: before.revision, expectedAttachmentRevision: before.attachmentRevision, mimeType: 'image/png', bytes: png });
    assert.ok(f.read().entries.some(entry => entry.text === 'new text')); assert.notEqual(image.attachmentRevision, before.attachmentRevision);
    const result = await f.service.conversations.supplement('workspace', before.id, { ...f.input(''), attachmentIds: [image.id] }); assert.equal(result.delivery, 'accepted'); assert.equal(f.calls[0].images[0].id, image.id);
    assert.throws(() => f.service.conversations.addAttachment('workspace', before.id, { expectedAttachmentRevision: before.attachmentRevision, mimeType: 'image/png', bytes: png }), /内容已变化/);
    const current = f.read(); assert.ok(f.service.conversations.addAttachment('workspace', current.id, { expectedRevision: current.revision, mimeType: 'image/png', bytes: png }).id);
  } finally { await f.close(); }
});
