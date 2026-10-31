import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import type { AgentExecutor, ExecutorItem, ExecutorObservation, ExecutorSendInput } from '../../src/contracts.ts';
import type { ModelProvider } from '../../src/model-access/contracts.ts';

async function fixture({ release = true, question = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-goal-recovery-'));
  const first = path.join(root, 'first-result.txt'), remaining = path.join(root, 'remaining-result.txt');
  const sends: ExecutorSendInput[] = [], contexts = new Map<string, { items: ExecutorItem[]; observation: ExecutorObservation }>();
  const capabilities = { text: true, images: false, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 65536, permissionModes: ['default', 'full-access'] as Array<'default'|'full-access'> };
  let firstWrites = 0;
  const executor: AgentExecutor = { descriptor: { id: 'local', label: 'Local', capabilities }, async open(options) {
    let closed = false;
    return { get closed() { return closed; }, bindingIdentity: 'goal-fixture:' + options.configRoot, capabilities,
      inspectAccount: async () => ({ status: 'ready' }), models: async () => [{ id: 'model', label: 'Model' }], beginLogin: async () => {}, cancelLogin: async () => {},
      async createContext() { const ref = { id: randomUUID() }; contexts.set(ref.id, { items: [], observation: { status: 'idle', tools: [] } }); return ref; },
      async resumeContext({ contextRef }) { assert.ok(contexts.has(contextRef.id)); },
      readHistory: async ({ contextRef }) => structuredClone(contexts.get(contextRef.id)!.items),
      async send(input) {
        sends.push(input); const context = contexts.get(input.contextRef.id)!, executionRef = { id: input.clientRequestId };
        input.onEvent({ type: 'accepted', executionRef, inputItemId: input.clientRequestId });
        const user: ExecutorItem = { id: input.clientRequestId, kind: 'message', role: 'user', text: input.text, executionId: input.clientRequestId };
        context.items.push(user); input.onEvent({ type: 'item', item: user });
        if (sends.length === 1) {
          fs.writeFileSync(first, 'already applied'); firstWrites++;
          const tool: ExecutorItem = { id: 'uncertain-write', kind: 'tool', role: 'system', name: 'write', text: 'write receipt lost', status: 'unknown', executionId: input.clientRequestId };
          context.items.push(tool); input.onEvent({ type: 'item', item: tool });
          if (question) input.onEvent({ type: 'request', request: { id: 'needed', kind: 'question', title: 'Choose scope', questions: [{ id: 'scope', label: 'Scope', options: [{ id: 'yes', label: 'Yes' }] }] } });
          context.observation = { status: 'unknown', executionRef, tools: [{ id: 'uncertain-write', label: 'write', status: 'unknown' }] };
          closed = true; throw new Error('qoder_execution_observation_lost');
        }
        // This collaborator acts on the recovery instruction: inspect actual output, then finish only missing work.
        assert.match(input.text, /系统自动恢复/); assert.match(input.text, /未知|不确定/);
        assert.equal(fs.readFileSync(first, 'utf8'), 'already applied');
        fs.writeFileSync(remaining, 'continued goal');
        const answer: ExecutorItem = { id: 'final-answer', kind: 'message', role: 'assistant', text: 'both results verified', status: 'completed', executionId: input.clientRequestId };
        context.items.push(answer); input.onEvent({ type: 'item', item: answer });
        context.observation = { status: 'idle', executionRef, tools: [] };
        input.onEvent({ type: 'completed', status: 'completed' });
      },
      observe: async ({ contextRef }) => structuredClone(contexts.get(contextRef.id)!.observation),
      async canRelease({ contextRef, executionRef }) { const state = contexts.get(contextRef.id)!; return release && state.observation.executionRef?.id === executionRef.id ? { executionState: state.observation.status === 'idle' ? 'ended' as const : 'unknown' as const } : false; },
      reply: async () => {}, stop: async () => ({ status: 'stopped', tools: [] }), async close() { closed = true; },
    };
  } };
  const provider: ModelProvider = { id: 'fixture', label: 'Fixture', async open() { return { protocol: 'chat-completions', inspect: async () => ({ status: 'ready', identity: 'same-user', models: [{ id: 'model', label: 'Model', tools: true, images: false }] }), beginLogin: async () => {}, cancelLogin: async () => {}, infer: async () => { throw Error('paid calls forbidden'); }, close: async () => {} }; } };
  const service = createAgentService({ dataRoot: root, executors: [executor], modelProviders: [provider], autoContinueInterrupted: true, resolveWorkspace: () => ({ rootPath: root }), assertTask() {} });
  await service.connections.connect('local', { expectedRevision: 'unconfigured' });
  const account = await service.models.accounts.add({ provider: 'fixture' }), checked = await service.models.accounts.check(account.id);
  await service.models.accounts.preferences(account.id, { expectedRevision: checked.revision, models: [{ id: 'model', enabled: true }] });
  const chat = await service.conversations.create('workspace', {});
  const draft = { expectedRevision: chat.revision, connectionId: 'local', modelAccountId: account.id, model: 'model', permissionMode: 'full-access' as const, text: 'Create and verify both result files' };
  const preview = service.conversations.prepareSend('workspace', chat.id, draft);
  service.conversations.send('workspace', chat.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
  return { root, first, remaining, service, sends, chat, read: () => service.conversations.read('workspace', chat.id), firstWrites: () => firstWrites,
    async close() { await service.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}
async function until(check: () => boolean) { for (let n = 0; n < 500; n++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('goal did not continue automatically'); }

test('released unknown operation automatically resumes the same goal from real results without human input or replay', async () => {
  const f = await fixture();
  try {
    await until(() => f.read().run?.status === 'completed');
    const view = f.read();
    assert.equal(fs.readFileSync(f.remaining, 'utf8'), 'continued goal');
    assert.equal(f.firstWrites(), 1); assert.equal(f.sends.length, 2);
    assert.equal(view.entries.filter(entry => entry.kind === 'message' && entry.role === 'user').length, 1);
    assert.equal(view.entries.filter(entry => entry.kind === 'handoff').length, 0);
    assert.equal(view.run!.permissionMode, 'full-access');
    assert.equal(f.sends[0]!.model, f.sends[1]!.model);
    assert.notEqual(f.sends[0]!.contextRef.id, f.sends[1]!.contextRef.id);
    assert.equal(view.retainedRuns?.[0]?.status, 'unknown'); assert.equal(view.retainedRuns?.[0]?.resourcesReleased, true);
    assert.equal(view.retainedRuns?.[0]?.tools[0]?.status, 'unknown');
  } finally { await f.close(); }
});

for (const blocked of ['control', 'decision']) test('automatic goal recovery protects ' + blocked, async () => {
  const f = await fixture(blocked === 'control' ? { release: false } : { question: true });
  try {
    await until(() => f.read().run?.status === 'unknown');
    await f.service.conversations.recoverInterrupted();
    assert.equal(f.sends.length, 1); assert.equal(fs.existsSync(f.remaining), false); assert.equal(f.firstWrites(), 1);
  } finally { await f.close(); }
});
