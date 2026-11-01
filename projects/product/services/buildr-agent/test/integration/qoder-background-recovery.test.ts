import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createAgentService } from '../../src/index.ts';
import { createQoderExecutor } from '../../src/executors/qoder/index.ts';
import type { ModelProvider } from '../../src/model-access/contracts.ts';

async function until<T>(read: () => T, check: (value: T) => boolean): Promise<T> {
  for (let i = 0; i < 500; i++) { const value = read(); if (check(value)) return value; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.fail('Qoder service conversation did not converge');
}

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'buildr-qoder-service-recovery-')));
  const executable = join(root, 'qoder.mjs');
  await writeFile(executable, await readFile(new URL('./executors/fixtures/qoder-conversation-cli.mjs', import.meta.url)));
  const native = createQoderExecutor();
  const provider: ModelProvider = { id: 'fixture', label: 'Fixture', async open() { return {
    protocol: 'chat-completions', inspect: async () => ({ status: 'ready', models: [{ id: 'fixture-model', label: 'Fixture', tools: true, images: false }] }),
    beginLogin: async () => {}, cancelLogin: async () => {}, infer: async () => { throw Error('No paid inference in fixture'); }, close: async () => {},
  }; } };
  const open = (generationAlive?: (generation: string) => boolean) => createAgentService({ generationAlive, dataRoot: root, resolveWorkspace: () => ({ rootPath: root }), assertTask() {}, modelProviders: [provider],
    executors: [{ ...native, async open(options) { const runtime = await native.open(options); runtime.generateTitle = async () => undefined; return runtime; } }],
    programManager: { async discover() { return { candidates: [{ executable, source: 'configured', label: 'Fixture', version: '1.1.75', compatible: true }], installation: { label: 'Fixture', version: '1.1.75', url: 'https://fixture.invalid', canInstall: false } }; }, async install() { return executable; } },
  });
  return { root, executable, open };
}

test('Qoder native background continuation converges through conversation storage and automatic exact resource release', { timeout: 15000 }, async () => {
  const { root, executable, open } = await fixture(), service = open();
  try {
    await service.connections.connect('qoder', { expectedRevision: 'unconfigured', executable });
    const added = await service.models.accounts.add({ provider: 'fixture' }), checked = await service.models.accounts.check(added.id);
    await service.models.accounts.preferences(added.id, { expectedRevision: checked.revision, models: [{ id: 'fixture-model', enabled: true }] });
    const chat = await service.conversations.create('workspace', {});
    const draft = { expectedRevision: chat.revision, connectionId: 'qoder', modelAccountId: added.id, model: 'fixture-model', text: 'background-continue-error' };
    const preview = service.conversations.prepareSend('workspace', chat.id, draft);
    service.conversations.send('workspace', chat.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
    const read = () => service.conversations.read('workspace', chat.id);
    const before = await until(read, value => value.run?.accepted === true && value.run?.tools.some(tool => tool.id === 'continued-tool') === true);
    const runId = before.run!.id;
    await until(read, value => value.run?.status === 'tools-active');
    assert.equal(read().run?.resourcesReleased, undefined);
    const config = join(root, 'agent-service/connections/qoder/qoder-config');
    await writeFile(join(config, 'continue-background'), 'yes');
    await until(read, value => value.run?.status === 'running' && value.run.tools.some(tool => tool.id === 'continuation-tool'));
    assert.equal(read().run?.id, runId);
    assert.equal(service.retainsConversationSource('workspace', chat.id), true);
    await writeFile(join(config, 'complete-continuation'), 'yes');
    const final = await until(read, value => value.run?.status === 'completed' && value.run.resourcesReleased === true);
    assert.equal(final.run!.id, runId);
    assert.equal(final.run!.executionState, 'ended');
    assert.ok(final.entries.some(entry => entry.text === 'continued final answer' && entry.runId === runId));
    assert.equal(final.entries.filter(entry => entry.kind === 'message' && entry.role === 'user').length, 1);
    assert.equal(service.retainsConversationSource('workspace', chat.id), false);
    const inputs = (await readFile(join(config, 'native-inputs.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(inputs.length, 1, 'no retry or replay during native continuation');
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

test('Qoder legacy lost-result recovery releases only exited exact controls and retains unknown outcomes without replay', { timeout: 15000 }, async () => {
  const { root, executable, open } = await fixture(), old = open();
  let next: ReturnType<typeof open> | undefined, ownerAlive = true;
  try {
    await old.connections.connect('qoder', { expectedRevision: 'unconfigured', executable });
    const added = await old.models.accounts.add({ provider: 'fixture' }), checked = await old.models.accounts.check(added.id);
    await old.models.accounts.preferences(added.id, { expectedRevision: checked.revision, models: [{ id: 'fixture-model', enabled: true }] });
    const chat = await old.conversations.create('workspace', {});
    const draft = { expectedRevision: chat.revision, connectionId: 'qoder', modelAccountId: added.id, model: 'fixture-model', text: 'legacy-late-unknown' };
    const preview = old.conversations.prepareSend('workspace', chat.id, draft);
    old.conversations.send('workspace', chat.id, { ...draft, previewToken: preview.token, clientRequestId: randomUUID() });
    const prior = await until(() => old.conversations.read('workspace', chat.id), value => value.run?.status === 'unknown');
    const runId = prior.run!.id, generation = prior.run!.generation;
    await old.freezeMetadata();
    next = open(value => ownerAlive && value === generation);
    const protectedView = await next.conversations.observe('workspace', chat.id);
    assert.equal(protectedView.run?.generation, generation);
    assert.equal(protectedView.run?.resourcesReleased, undefined, 'a live old owner cannot be bypassed');
    await old.close(); ownerAlive = false;
    await next.conversations.observe('workspace', chat.id);
    const final = await until(() => next!.conversations.read('workspace', chat.id), value => value.run?.resourcesReleased === true);
    assert.equal(final.run!.id, runId);
    assert.notEqual(final.run!.generation, generation);
    assert.equal(final.run!.status, 'unknown');
    assert.equal(final.run!.executionState, 'unknown', 'a final answer and closed controls do not prove operation success');
    const inputs = (await readFile(join(root, 'agent-service/connections/qoder/qoder-config/native-inputs.jsonl'), 'utf8')).trim().split('\n');
    assert.equal(inputs.length, 1, 'reading and releasing must never replay work');
    assert.equal(next.allowsReleasedContinuation('workspace', chat.id, { ...draft, modelAccountIdentity: final.run!.modelAccountIdentity, serviceTier: final.run!.serviceTier, reasoningEffort: final.run!.reasoningEffort, permissionMode: final.run!.permissionMode, text: '', continueRunId: runId, expectedRevision: final.revision }), true);
  } finally { await next?.close(); await old.close(); await rm(root, { recursive: true, force: true }); }
});
