import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentOperationsApplication } from '../../src/modules/agent-operations/application/agent-operations-application.ts';
import { createAgentOperationsHttpContribution } from '../../src/modules/agent-operations/interfaces/http/agent-operations-http.ts';
import { AGENT_OPERATIONS_HTTP_SCHEMAS, AGENT_OPERATIONS_HTTP_VALIDATORS } from '../../src/modules/agent-operations/interfaces/http/agent-operations-http-contracts.ts';
import type { AgentRegistration, AgentRunView } from '../../src/modules/agent-operations/domain/agent-operations.ts';

const outputSchema = { type: 'object', additionalProperties: false, properties: { commitMessage: { type: 'string' } }, required: ['commitMessage'] };
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
type ProviderState = { alive: boolean; closes: number; generations: number; onClose?: () => Promise<void>; onStart?: () => Promise<void>; onGenerate?: () => Promise<void> };
function fixture(t: test.TestContext, options: { idleMs?: number } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-codex-remove-')), dataRoot = path.join(root, 'profile');
  const homes = [path.join(root, 'codex-a'), path.join(root, 'codex-b'), path.join(root, 'dsh')], appPath = path.join(root, 'ChatGPT.app');
  for (const directory of [...homes, appPath]) fs.mkdirSync(directory);
  const states = new Map<string, ProviderState>(), created: string[] = [], events: string[] = [], cleanup: (() => void)[] = [];
  const inspectEntry = (input: { executable: string; codexHome?: string; label?: string }) => ({ executable: process.execPath, codexHome: input.codexHome ?? homes[0], label: input.label ?? 'Codex', version: 'test' });
  const app = new AgentOperationsApplication({
    dataRoot, closeWaitMs: 40, available: () => true, inspectEntry, idleMs: options.idleMs,
    inspectDshEntry: input => ({ executable: process.execPath, dshHome: input.dshHome ?? homes[2], label: 'DSH', version: 'test' }),
    discoverCodex: registrations => {
      const registered = registrations.find(record => record.codexHome === homes[0]);
      return [{ entry: inspectEntry({ executable: process.execPath }), installation: { appPath, appVersion: '1' }, identity: 'same-installation', view: { id: 'candidate-a', label: 'Codex', version: 'test', installationLabel: 'Codex 桌面', configurationLabel: '测试配置', source: 'desktop-bundled', registeredAgentId: registered?.id ?? null, desktopAvailable: true, generationAvailability: 'available', safeReason: null } }];
    },
    providerFactory: registration => {
      created.push(registration.id);
      const state = states.get(registration.id) ?? { alive: false, closes: 0, generations: 0 }; states.set(registration.id, state);
      return { get alive() { return state.alive; }, start: async () => { await state.onStart?.(); state.alive = true; }, generate: async input => { state.generations++; input.onRunning(); await state.onGenerate?.(); return { commitMessage: 'feat: retained result' }; }, close: async () => { state.closes++; events.push('close:' + registration.id); if (state.onClose) await state.onClose(); else state.alive = false; } };
    },
  });
  t.after(async () => { for (const release of cleanup) release(); try { await app.close(); } catch { /* Fault fixtures own no OS process. */ } fs.rmSync(root, { recursive: true, force: true }); });
  const a = app.registerCodex({ executable: process.execPath, codexHome: homes[0], label: 'Codex（ChatGPT）', expectedRevision: app.listRegistry().revision }).defaultAgentId!;
  const b = app.registerCodex({ executable: process.execPath, codexHome: homes[1], label: 'Other Codex', expectedRevision: app.listRegistry().revision }).agents.find(record => record.id !== a)!.id;
  const dsh = app.registerDsh({ executable: process.execPath, dshHome: homes[2], expectedRevision: app.listRegistry().revision }).agents.find(record => record.kind === 'dsh')!.id;
  const disconnects: string[] = [];
  app.bindCodexDesktopConnector({ connect: async registration => ({ id: 'desktop-a', agentId: registration.id, label: 'Codex', installationLabel: 'Codex 桌面', configurationLabel: '测试配置', status: 'configured', safeReason: null }), disconnect: id => { events.push('disconnect:' + id); disconnects.push(id); } });
  const generate = (agentId = a) => app.startGeneration({ agentId, cwd: root, prompt: 'Supplied changes only.', outputSchema });
  const remove = (agentId = a) => app.removeCodex({ agentId, expectedRevision: app.listRegistry().revision });
  const connect = () => app.connectCodex({ candidateId: 'candidate-a', expectedDiscoveryRevision: app.listCodexDiscovery().revision, expectedRevision: app.listRegistry().revision, existingAgentId: a, makeDefault: false });
  return { app, root, dataRoot, homes, states, created, events, cleanup, a, b, dsh, disconnects, generate, remove, connect };
}
async function settled(app: AgentOperationsApplication, id: string): Promise<AgentRunView> {
  const end = Date.now() + 1500;
  while (Date.now() < end) { const run = app.getRun(id); if (['succeeded', 'failed', 'cancelled'].includes(run.status)) { await new Promise(resolve => setTimeout(resolve, 5)); return app.getRun(id); } await new Promise(resolve => setTimeout(resolve, 5)); }
  throw Error('Fixture generation did not settle.');
}

test('Codex removal closes only its owned idle provider, clears its default and preserves user data and other registrations', async t => {
  const f = fixture(t);
  for (const id of [f.a, f.b, f.dsh]) assert.equal((await settled(f.app, (await f.generate(id)).id)).status, 'succeeded');
  const retained = new Map<string, string>();
  for (const relative of ['codex-a/config.toml', 'codex-a/memories.md', 'codex-a/chat-history.json', 'workspace-task.json']) { const file = path.join(f.root, relative); const body = 'user-owned-' + relative; fs.writeFileSync(file, body); retained.set(file, body); }
  const before = f.app.listRegistry(), result = await f.remove();
  assert.equal(result.removedAgentId, f.a); assert.equal(result.registry.defaultAgentId, null); assert.equal(result.desktopWarning, null);
  assert.equal(f.app.hasCodexRegistration(f.a), false); assert.equal(f.app.hasCodexRegistration(f.b), true); assert.equal(f.app.hasCodexRegistration(f.dsh), false);
  assert.deepEqual(result.registry.agents, before.agents.filter(record => record.id !== f.a));
  assert.equal(f.states.get(f.a)?.alive, false); assert.equal(f.states.get(f.a)?.closes, 1);
  assert.equal(f.states.get(f.b)?.alive, true); assert.equal(f.states.get(f.b)?.closes, 0); assert.equal(f.states.get(f.dsh)?.alive, true); assert.equal(f.states.get(f.dsh)?.closes, 0);
  assert.deepEqual(f.events, ['close:' + f.a, 'disconnect:' + f.a]); assert.deepEqual(f.disconnects, [f.a]);
  for (const [file, body] of retained) assert.equal(fs.readFileSync(file, 'utf8'), body);
  assert.equal(AGENT_OPERATIONS_HTTP_VALIDATORS.validate(AGENT_OPERATIONS_HTTP_SCHEMAS.remove.$id, result).valid, true);
  await assert.rejects(f.generate(f.a), code('agent_not_registered'));
});

test('non-default Codex removal keeps the selected DSH and the legacy Codex read-only label projection', async t => {
  const f = fixture(t); f.app.selectAgent({ agentId: f.dsh, expectedRevision: f.app.listRegistry().revision });
  const result = await f.remove(f.b);
  assert.equal(result.registry.defaultAgentId, f.dsh); assert.equal(result.registry.agents.find(record => record.id === f.a)?.label, 'Codex');
  const stored = JSON.parse(fs.readFileSync(path.join(f.dataRoot, 'agent-registrations.json'), 'utf8')) as { agents: AgentRegistration[] };
  assert.equal(stored.agents.find(record => record.id === f.a)?.label, 'Codex（ChatGPT）');
  const before = f.app.listRegistry();
  await assert.rejects(f.remove(f.dsh), code('agent_kind_unsupported')); assert.deepEqual(f.app.listRegistry(), before);
});

test('stale or missing removal cannot stop a provider or mutate any registration', async t => {
  const f = fixture(t), before = f.app.listRegistry();
  await assert.rejects(f.app.removeCodex({ agentId: f.a, expectedRevision: 'stale' }), code('agent_registry_changed'));
  await assert.rejects(f.app.removeCodex({ agentId: 'agent-missing', expectedRevision: before.revision }), code('agent_not_registered'));
  assert.deepEqual(f.app.listRegistry(), before); assert.deepEqual(f.events, []);
});

test('queued and cancelled-but-unsettled work rejects removal without cancelling or partly removing it', async t => {
  const f = fixture(t), gate = deferred(); f.cleanup.push(gate.resolve);
  f.states.set(f.a, { alive: false, closes: 0, generations: 0, onGenerate: () => gate.promise });
  const generation = f.generate();
  const before = f.app.listRegistry();
  await assert.rejects(f.remove(), code('agent_codex_busy'));
  const run = await generation;
  f.app.cancelRun(run.id);
  await assert.rejects(f.remove(), code('agent_codex_busy'));
  assert.equal(f.app.hasCodexRegistration(f.a), true); assert.equal(f.app.listRegistry().revision, before.revision); assert.deepEqual(f.disconnects, []);
  gate.resolve(); await settled(f.app, run.id); await f.remove();
  assert.equal(f.app.hasCodexRegistration(f.a), false);
});

test('starting work and desktop preparation are busy until their existing operations settle', async t => {
  const f = fixture(t), start = deferred(); f.cleanup.push(start.resolve);
  f.states.set(f.a, { alive: false, closes: 0, generations: 0, onStart: () => start.promise });
  const run = await f.generate();
  await assert.rejects(f.remove(), code('agent_codex_busy'));
  start.resolve(); await settled(f.app, run.id);
  const preparation = deferred(); f.cleanup.push(preparation.resolve);
  f.app.bindCodexDesktopConnector({ connect: async registration => { await preparation.promise; return { id: 'desktop-a', agentId: registration.id, label: 'Codex', installationLabel: 'Codex 桌面', configurationLabel: '测试配置', status: 'configured', safeReason: null }; }, disconnect: id => f.disconnects.push(id) });
  const pending = f.connect();
  await assert.rejects(f.remove(), code('agent_codex_busy')); assert.equal(f.states.get(f.a)?.closes, 0);
  preparation.resolve(); await pending; await f.remove(); assert.deepEqual(f.disconnects, [f.a]);
});

test('one completed connection preparation does not hide another pending preparation of the same entry', async t => {
  const f = fixture(t), first = deferred(), second = deferred(); f.cleanup.push(first.resolve, second.resolve); let count = 0;
  f.app.bindCodexDesktopConnector({ connect: async registration => { await (++count === 1 ? first.promise : second.promise); return { id: 'desktop-a', agentId: registration.id, label: 'Codex', installationLabel: 'Codex 桌面', configurationLabel: '测试配置', status: 'configured', safeReason: null }; }, disconnect: id => f.disconnects.push(id) });
  const one = f.connect(), two = f.connect();
  first.resolve(); await one;
  await assert.rejects(f.remove(), code('agent_codex_busy')); assert.equal(f.app.hasCodexRegistration(f.a), true);
  second.resolve(); await two; await f.remove(); assert.deepEqual(f.disconnects, [f.a]);
});

test('removal joins a pending idle close and deletes only after that owned service exit is confirmed', async t => {
  const f = fixture(t, { idleMs: 5 }), closing = deferred(); f.cleanup.push(closing.resolve);
  const state: ProviderState = { alive: false, closes: 0, generations: 0, onClose: async () => { await closing.promise; state.alive = false; } };
  f.states.set(f.a, state);
  await settled(f.app, (await f.generate()).id);
  const deadline = Date.now() + 1000;
  while (!state.closes && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 2));
  assert.ok(state.closes);
  const pending = f.remove();
  assert.equal(f.app.hasCodexRegistration(f.a), true); assert.deepEqual(f.disconnects, []);
  closing.resolve(); await pending;
  assert.equal(state.alive, false); assert.equal(f.app.hasCodexRegistration(f.a), false); assert.deepEqual(f.disconnects, [f.a]);
});

test('application shutdown during removal retains registration instead of publishing a late deletion', async t => {
  const f = fixture(t); await settled(f.app, (await f.generate()).id);
  const closing = deferred(); f.cleanup.push(closing.resolve);
  const state = f.states.get(f.a)!; state.onClose = async () => { await closing.promise; state.alive = false; };
  const pending = f.remove(), shutdown = f.app.close();
  closing.resolve(); await assert.rejects(pending, code('agent_operations_closed')); await shutdown;
  assert.equal(f.app.hasCodexRegistration(f.a), true); assert.deepEqual(f.disconnects, []);
});

test('pending removal excludes the same entry new actions and a second removal while leaving other agents usable', async t => {
  const f = fixture(t); await settled(f.app, (await f.generate()).id);
  const closing = deferred(); f.cleanup.push(closing.resolve);
  const state = f.states.get(f.a)!; state.onClose = async () => { await closing.promise; state.alive = false; };
  const pending = f.remove();
  await assert.rejects(f.generate(), code('agent_removal_in_progress'));
  assert.throws(() => f.app.registerCodex({ executable: process.execPath, codexHome: f.homes[0], expectedRevision: f.app.listRegistry().revision }), code('agent_removal_in_progress'));
  await assert.rejects(f.connect(), code('agent_removal_in_progress'));
  await assert.rejects(f.remove(), code('agent_removal_in_progress'));
  assert.throws(() => f.app.selectAgent({ agentId: f.a, expectedRevision: f.app.listRegistry().revision }), code('agent_removal_in_progress'));
  assert.equal((await settled(f.app, (await f.generate(f.dsh)).id)).status, 'succeeded');
  closing.resolve(); await pending;
  assert.equal(f.app.hasCodexRegistration(f.a), false); assert.equal(f.app.hasCodexRegistration(f.b), true);
});

test('registration CAS drift during confirmed close retains the entry and the later default without disconnecting it', async t => {
  const f = fixture(t); await settled(f.app, (await f.generate()).id);
  const closing = deferred(); f.cleanup.push(closing.resolve);
  const state = f.states.get(f.a)!; state.onClose = async () => { await closing.promise; state.alive = false; };
  const pending = f.remove();
  const selected = f.app.selectAgent({ agentId: f.dsh, expectedRevision: f.app.listRegistry().revision });
  closing.resolve(); await assert.rejects(pending, code('agent_registry_changed'));
  assert.equal(f.app.hasCodexRegistration(f.a), true); assert.equal(f.app.listRegistry().revision, selected.revision); assert.equal(f.app.listRegistry().defaultAgentId, f.dsh); assert.deepEqual(f.disconnects, []);
  state.onClose = undefined;
  assert.equal((await settled(f.app, (await f.generate()).id)).status, 'succeeded', 'the failed CAS must release its entry exclusion after exit is confirmed');
});

for (const failure of ['rejected', 'pending', 'alive-after-close']) {
  test('unconfirmed owned exit (' + failure + ') is bounded, preserves registration and forbids replacement', async t => {
    const f = fixture(t); await settled(f.app, (await f.generate()).id);
    const state = f.states.get(f.a)!;
    const gate = deferred(); f.cleanup.push(() => { gate.resolve(); state.onClose = undefined; });
    state.onClose = async () => {
      if (failure === 'rejected') throw Object.assign(Error('exit unknown'), { code: 'agent_close_timeout' });
      if (failure === 'pending') { await gate.promise; state.alive = false; }
    };
    const before = f.app.listRegistry();
    await assert.rejects(f.remove(), code('agent_close_timeout'));
    assert.equal(f.app.hasCodexRegistration(f.a), true); assert.equal(f.app.listRegistry().revision, before.revision); assert.equal(f.app.listRegistry().defaultAgentId, f.a); assert.deepEqual(f.disconnects, []);
    if (failure === 'pending') { gate.resolve(); await new Promise(resolve => setTimeout(resolve, 5)); }
    const next = await f.generate(); assert.equal((await settled(f.app, next.id)).status, 'failed');
    assert.equal(f.created.filter(id => id === f.a).length, 1);
    assert.equal((await settled(f.app, (await f.generate(f.b)).id)).status, 'succeeded');
  });
}

test('disconnect persistence failure returns partial warning with registration absence as the business authority', async t => {
  const f = fixture(t); let observed = true;
  f.app.bindCodexDesktopConnector({ connect: async () => { throw Error('unused'); }, disconnect: id => { observed = f.app.hasCodexRegistration(id); throw Error('private filesystem detail'); } });
  const result = await f.remove();
  assert.equal(observed, false); assert.equal(f.app.hasCodexRegistration(f.a), false); assert.equal(result.desktopWarning?.code, 'agent_desktop_disconnect_unconfirmed');
  assert.equal(JSON.stringify(result).includes('private filesystem'), false); assert.equal(result.registry.defaultAgentId, null);
});

test('lost response is resolved by reading current registry; repeated requests cannot disconnect twice or affect remaining agents', async t => {
  const f = fixture(t), observed = f.app.listRegistry();
  await f.app.removeCodex({ agentId: f.a, expectedRevision: observed.revision });
  const current = f.app.listRegistry();
  assert.equal(current.agents.some(record => record.id === f.a), false);
  await assert.rejects(f.app.removeCodex({ agentId: f.a, expectedRevision: observed.revision }), code('agent_registry_changed'));
  await assert.rejects(f.app.removeCodex({ agentId: f.a, expectedRevision: current.revision }), code('agent_not_registered'));
  assert.deepEqual(f.disconnects, [f.a]); assert.deepEqual(f.app.listRegistry(), current);
});

test('Codex remove HTTP is strictly authorized and cannot accept extra target fields or delete DSH', async t => {
  const f = fixture(t), http = createAgentOperationsHttpContribution(f.app); let authorized = 0;
  const body = () => ({ agentId: f.a, expectedRevision: f.app.listRegistry().revision });
  const call = (value: unknown, query = '', allow = true) => http.handleTopLevel({ request: { method: 'POST' }, pathname: '/api/v1/app/agents/codex/remove', searchParams: new URLSearchParams(query), authorizeWrite: () => { authorized++; if (!allow) throw Object.assign(Error('not authorized'), { code: 'forbidden' }); }, readJsonBody: async () => value });
  const before = f.app.listRegistry();
  await assert.rejects(call(body(), '', false), code('forbidden'));
  await assert.rejects(call({ ...body(), executable: process.execPath }), code('agent_request_invalid'));
  await assert.rejects(call(body(), 'agentId=other'), code('agent_request_invalid'));
  await assert.rejects(call({ agentId: f.dsh, expectedRevision: before.revision }), code('agent_kind_unsupported'));
  assert.deepEqual(f.app.listRegistry(), before);
  const result = await call(body()); assert.equal(result?.status, 200); assert.equal(authorized, 5);
});
