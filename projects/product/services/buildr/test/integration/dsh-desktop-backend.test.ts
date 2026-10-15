import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { AgentOperationsApplication } from '../../src/modules/agent-operations/application/agent-operations-application.ts';
import { DshDesktopApplication } from '../../src/modules/dsh-desktop/application/dsh-desktop-application.ts';
import { DshDesktopTransport, readDesktopDiscovery } from '../../src/modules/agent-operations/infrastructure/dsh-desktop-transport.ts';
import { discoverDshInstallations } from '../../src/modules/agent-operations/infrastructure/dsh-discovery.ts';
import { DSH_DESKTOP_BRIDGE_SCHEMA, type DshDesktopDiscovery } from '../../src/modules/agent-operations/contracts/dsh-desktop-bridge.ts';
import { createAgentOperationsCliContributions } from '../../src/modules/agent-operations/interfaces/cli/agent-operations-cli.ts';
import { createAgentOperationsHttpContribution } from '../../src/modules/agent-operations/interfaces/http/agent-operations-http.ts';
const code = (value: string) => (error: unknown) => (error as { code?: string }).code === value;
const outputSchema = { type: 'object', additionalProperties: false, properties: { commitMessage: { type: 'string', minLength: 1 } }, required: ['commitMessage'] };
async function wait(check: () => boolean) { const deadline = Date.now() + 4000; while (!check()) { if (Date.now() > deadline) throw new Error('Condition not observed.'); await new Promise(r => setTimeout(r, 5)); } }
async function fixture(t: test.TestContext, old = false) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dsh-desktop-'))), dshHome = path.join(root, '.dsh'), dataRoot = path.join(root, 'buildr'), appPath = path.join(root, 'DeepSeek Harness.app'), executable = path.join(appPath, 'Contents/Resources/runtime/cli/bin/dsh');
  fs.mkdirSync(path.dirname(executable), { recursive: true }); fs.writeFileSync(executable, '#!/bin/sh\nexit 99\n', { mode: 0o755 });
  fs.writeFileSync(path.join(appPath, 'Contents/Info.plist'), '<plist><key>CFBundleShortVersionString</key><string>0.2.0-rc.2</string></plist>');
  fs.mkdirSync(dshHome, { mode: 0o700 }); fs.mkdirSync(path.join(dshHome, 'buildr'), { mode: 0o700 });
  const dir = path.join(dshHome, 'buildr/desktop-bridges'); fs.mkdirSync(dir, { mode: 0o700 });
  const sockets = new Set<net.Socket>(), generated: any[] = [], cancelled: string[] = [], calls: any[] = [], active = new Map<string, { socket: net.Socket; id: string }>();
  let lightweight: boolean | undefined = true;
  let output = JSON.stringify({ commitMessage: 'feat: desktop result' }), model = 'desktop-one', slow = false, fault = '';
  const server = net.createServer(socket => {
    sockets.add(socket); let buffer = '', authenticated = false;
    const send = (value: unknown) => { if (!socket.destroyed) socket.write(JSON.stringify(value) + '\n'); };
    socket.on('data', chunk => { buffer += chunk.toString(); let index: number; while ((index = buffer.indexOf('\n')) >= 0) {
      const request = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1); calls.push(request);
      const result = (value: unknown) => send({ id: request.id, type: 'result', output: value });
      const inspection = () => ({ ...identity(), capabilities: { generate: true, ...(lightweight === undefined ? {} : { lightweightGeneration: lightweight }), currentSession: true, openSession: true, openTask: true }, modelConfig: { model, modelProvider: 'desktop-provider', reasoningEffort: 'max' }, clients: [{ clientId: 'desktop-client', sessionId: 'existing-chat', desktop: true }] });
      if (request.method === 'hello') { authenticated = request.params.credential === discovery.credential && request.params.hostInstanceId === discovery.hostInstanceId; if (!authenticated) socket.destroy(); else result(inspection()); continue; }
      if (!authenticated) { socket.destroy(); continue; }
      if (request.method === 'inspect') { result(inspection()); continue; }
      if (request.method === 'generate') { generated.push(request); if (fault === 'leak') { send({ id: request.id, type: 'error', error: { code: 'agent_dsh_request_failed', message: discovery.credential + ' private prompt' } }); continue; } if (fault !== 'no-config') send({ id: request.id, type: 'configured', config: { model, modelProvider: 'desktop-provider', reasoningEffort: request.params.reasoningEffort === 'lowest-supported' ? 'medium' : 'max' } }); if (fault === 'duplicate-config') send({ id: request.id, type: 'configured', config: { model: 'conflict', modelProvider: 'other', reasoningEffort: 'low' } }); send({ id: request.id, type: 'running' }); if (slow) active.set(request.id, { socket, id: request.id }); else result(output); continue; }
      if (request.method === 'cancel') { const pending = active.get(request.params.requestId); if (fault === 'ack-only') { result({ requestId: request.params.requestId, cancelled: true, settled: true }); continue; } if (pending?.socket === socket) { cancelled.push(pending.id); active.delete(pending.id); send({ id: pending.id, type: 'error', error: { code: 'agent_run_cancelled', message: '本次生成已取消。' } }); } result({ requestId: request.params.requestId, cancelled: !!pending, settled: true }); continue; }
      if (request.method === 'openSession' || request.method === 'openTask') { if (fault === 'navigation-hang') { active.set(request.id, { socket, id: request.id }); continue; } result({ clientId: 'desktop-client', sessionId: request.params.sessionId, opened: true, ...(request.params.taskUrl ? { taskUrl: request.params.taskUrl } : {}) }); continue; }
    }});
    socket.on('error', () => {}); socket.on('close', () => { sockets.delete(socket); for (const [id, item] of active) if (item.socket === socket) active.delete(id); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const discovery: DshDesktopDiscovery = { schemaVersion: DSH_DESKTOP_BRIDGE_SCHEMA, channel: 'development', profileKey: dshHome, hostInstanceId: crypto.randomUUID(), hostPid: process.pid, dshVersion: '0.2.0-rc.2', pluginVersion: '0.1.0-rc.1', appPath, executable, address: { host: '127.0.0.1', port: (server.address() as net.AddressInfo).port }, credential: crypto.randomBytes(32).toString('hex') };
  const identity = () => { const { credential: _c, address: _a, ...value } = discovery; return value; };
  const file = path.join(dir, 'development.json'); fs.writeFileSync(file, JSON.stringify(discovery), { mode: 0o600 });
  const agentId = 'agent-' + crypto.randomUUID(), codexId = 'agent-' + crypto.randomUUID();
  if (old) { fs.mkdirSync(dataRoot); fs.writeFileSync(path.join(dataRoot, 'agent-registrations.json'), JSON.stringify({ schemaVersion: 'buildr.agent-registrations/v1', defaultAgentId: agentId, agents: [{ id: codexId, kind: 'codex', label: 'My Codex', executable: process.execPath, codexHome: root, version: 'test' }, { id: agentId, kind: 'dsh', label: 'My DSH', executable, dshHome, version: '0.2.0-rc.2' }] })); }
  const application = new AgentOperationsApplication({ dataRoot, idleMs: 40, discoverDsh: registrations => discoverDshInstallations({ registrations, channel: 'development', env: { DSH_HOME: dshHome }, homeDirectory: root, applicationRoots: [root] }) });
  const desktop = new DshDesktopApplication({ dataRoot, readRegistrationActive: id => application.hasDshRegistration(id), readOrigin: () => 'http://127.0.0.1:4458' }); application.bindDshDesktopConnector(desktop);
  t.after(async () => { await application.close(); for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }); });
  const connect = async () => { const observed = application.listDshDiscovery(); return application.connectDsh({ candidateId: observed.candidates[0].id, expectedDiscoveryRevision: observed.revision, expectedRevision: application.listRegistry().revision, ...(old ? { existingAgentId: agentId } : {}) }); };
  const generate = (extra = {}) => application.startGeneration({ cwd: root, prompt: 'Supplied changes only', outputSchema, execution: { reasoningEffort: 'low', timeoutMs: 2000 }, ...extra });
  const finish = async (id: string) => { await wait(() => ['succeeded', 'failed', 'cancelled'].includes(application.getRun(id).status)); return application.getRun(id); };
  return { root, file, discovery, application, desktop, connect, generate, finish, generated, cancelled, calls, active, agentId, codexId, change: (value: { output?: string; model?: string; slow?: boolean; fault?: string; lightweight?: boolean | null }) => { if (value.lightweight !== undefined) lightweight = value.lightweight ?? undefined; if (value.output !== undefined) output = value.output; if (value.model !== undefined) model = value.model; if (value.slow !== undefined) slow = value.slow; if (value.fault !== undefined) fault = value.fault; } };
}

test('old DSH migrates in place only after authenticated desktop confirmation, preserving names, default and Codex', async t => {
  const f = await fixture(t, true), previous = f.application.listRegistry(), before = fs.readFileSync(path.join(f.root, 'buildr/agent-registrations.json'), 'utf8');
  assert.deepEqual(f.generated, []); assert.equal(previous.agents[1].availability, 'unavailable');
  const discovery = f.application.listDshDiscovery();
  await assert.rejects(f.application.connectDsh({ candidateId: discovery.candidates[0].id, expectedDiscoveryRevision: discovery.revision, expectedRevision: 'stale', existingAgentId: f.agentId }), code('agent_registry_changed'));
  assert.equal(fs.readFileSync(path.join(f.root, 'buildr/agent-registrations.json'), 'utf8'), before);
  const connected = await f.connect();
  assert.equal(connected.agentId, f.agentId); assert.equal(connected.registry.defaultAgentId, f.agentId); assert.deepEqual(connected.registry.agents.map(r => [r.id, r.label]), [[f.codexId, 'My Codex'], [f.agentId, 'My DSH']]);
  assert.ok(connected.desktop); assert.equal((await f.connect()).desktop?.id, connected.desktop?.id);
  const command = createAgentOperationsCliContributions(f.application).find(c => c.key === 'agent register')!;
  const stdout = t.mock.method(process.stdout, 'write', () => true);
  const cli = await command.run({}, { argv: ['node', 'buildr', 'agent', 'register', 'dsh', '--executable', f.discovery.executable, '--dsh-home', f.discovery.profileKey, '--label', 'Attempted rename', '--expected-revision', f.application.listRegistry().revision, '--json'] }) as ReturnType<AgentOperationsApplication['listRegistry']>;
  stdout.mock.restore(); assert.equal(cli.defaultAgentId, f.agentId); assert.equal(cli.agents[1].id, f.agentId);
  assert.equal(cli.agents[1].label, 'My DSH'); assert.equal((await f.desktop.listConnections()).connections[0].label, 'My DSH');
  assert.equal(JSON.stringify(connected).includes(f.discovery.credential), false); assert.equal(f.generated.length, 0);
  const fresh = f.application.listDshDiscovery(); await assert.rejects(f.application.connectDsh({ candidateId: fresh.candidates[0].id, expectedDiscoveryRevision: fresh.revision, expectedRevision: f.application.listRegistry().revision }), code('agent_dsh_already_connected'));
});

test('DSH uses the same desktop model with declared lightweight effort, validates output and recycles only its socket', async t => {
  const f = await fixture(t); await f.connect();
  const first = await f.generate(), one = await f.finish(first.id); assert.equal(one.status, 'succeeded'); assert.equal(one.executionConfig?.reasoningEffort, 'medium'); assert.equal(one.executionConfig?.model, 'desktop-one');
  f.change({ model: 'desktop-two' }); const second = await f.generate(), two = await f.finish(second.id); assert.equal(two.executionConfig?.model, 'desktop-two'); assert.equal(one.executionConfig?.model, 'desktop-one');
  for (const request of f.generated) { assert.equal(request.params.sessionId, undefined); assert.equal(request.params.reasoningEffort, 'lowest-supported'); }
  f.change({ output: 'invalid' }); const invalid = await f.generate(); assert.equal((await f.finish(invalid.id)).error?.code, 'agent_output_invalid'); assert.equal(f.generated.length, 3, 'No repair model request');
  f.change({ output: '{"wrong":true}' }); const wrong = await f.generate(); assert.equal((await f.finish(wrong.id)).error?.code, 'agent_output_invalid');
  await wait(() => f.application.listRegistry().agents[0].runtimeStatus === 'stopped'); assert.equal(f.discovery.hostPid, process.pid); assert.equal(process.kill(process.pid, 0), true);
});

test('ordinary DSH generation inherits desktop effort and old plugins reject only lightweight calls', async t => {
  const f = await fixture(t); f.change({ lightweight: null }); await f.connect();
  const ordinary = await f.generate({ execution: { timeoutMs: 2000 } });
  assert.equal((await f.finish(ordinary.id)).executionConfig?.reasoningEffort, 'max');
  assert.equal(f.generated[0].params.reasoningEffort, undefined);
  const lightweight = await f.generate();
  const failed = await f.finish(lightweight.id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error?.code, 'agent_dsh_lightweight_unavailable');
  assert.match(failed.error!.message, /更新插件/);
  assert.equal(f.generated.length, 1, 'Unsupported request never reaches the old plugin');
  assert.equal(f.application.listRegistry().agents[0].availability, 'available');
  assert.equal(f.application.listRegistry().defaultAgentId, ordinary.agentId);
});

test('cancel, queued expiry and shutdown affect only owned requests and never publish late results', async t => {
  const f = await fixture(t); await f.connect(); f.change({ slow: true });
  const other = new DshDesktopTransport(f.discovery); await other.start();
  const otherAbort = new AbortController(); const otherRequest = other.generate({ prompt: 'Other caller', outputSchema, signal: otherAbort.signal, onConfigured: () => {}, onRunning: () => {} }).catch(() => 'cancelled');
  const first = await f.generate(); await wait(() => f.generated.length === 2);
  const queued = await f.generate({ execution: { timeoutMs: 15 } }); await f.finish(queued.id); assert.equal(f.application.getRun(queued.id).error?.code, 'agent_generation_timeout'); assert.equal(f.cancelled.length, 0);
  await assert.rejects(f.application.removeDsh({ agentId: first.agentId, expectedRevision: f.application.listRegistry().revision }), code('agent_dsh_busy'));
  f.application.cancelRun(first.id); await wait(() => f.cancelled.length === 1); assert.equal(f.application.getRun(first.id).output, null); assert.equal(f.active.size, 1, 'Other connection remains active');
  await f.application.close(); assert.equal(f.active.size, 1);
  otherAbort.abort(); await otherRequest; await other.close(); assert.equal(process.kill(process.pid, 0), true);
});

test('private discovery rejects broad permissions and stale scope, never starts a fallback', async t => {
  const f = await fixture(t); const original = fs.readFileSync(f.file, 'utf8');
  if (process.platform !== 'win32') { fs.chmodSync(f.file, 0o644); assert.throws(() => readDesktopDiscovery(f.discovery.profileKey, 'development'), code('agent_dsh_desktop_unavailable')); fs.chmodSync(f.file, 0o600); }
  fs.writeFileSync(f.file, JSON.stringify({ ...f.discovery, profileKey: f.root })); assert.throws(() => readDesktopDiscovery(f.discovery.profileKey, 'development'), code('agent_dsh_desktop_unavailable'));
  fs.writeFileSync(f.file, original); await f.connect(); fs.rmSync(f.file);
  const run = await f.generate(); assert.equal((await f.finish(run.id)).status, 'failed'); assert.equal(f.generated.length, 0);
});

test('DSH remove keeps persistent connection identity and native history, exact navigation returns observed target', async t => {
  const f = await fixture(t); const connected = await f.connect(), id = connected.desktop!.id;
  assert.deepEqual(await f.desktop.openSession(id, 'existing-chat'), { opened: true, nativeSessionId: 'existing-chat' });
  const url = 'http://127.0.0.1:4458/workspaces/' + crypto.randomUUID() + '/tasks/example';
  assert.equal((await f.desktop.openTask(id, 'existing-chat', url)).taskUrl, url);
  await assert.rejects(f.desktop.openTask(id, 'existing-chat', 'https://other.invalid/tasks/example'), code('agent_dsh_task_url_invalid'));
  const removed = await f.application.removeDsh({ agentId: connected.agentId, expectedRevision: f.application.listRegistry().revision }); assert.equal(removed.registry.defaultAgentId, null); assert.deepEqual(removed.registry.agents, []);
  assert.equal((await f.desktop.listConnections()).connections[0].id, id); await assert.rejects(f.desktop.openSession(id, 'existing-chat'), code('agent_dsh_connection_disconnected'));
  assert.equal(fs.existsSync(f.file), true); assert.equal(f.generated.length, 0);
});

test('DSH HTTP validates strict confirmation and removal writes, discovery exposes no bridge credential', async t => {
  const f = await fixture(t), http = createAgentOperationsHttpContribution(f.application); let authorized = 0;
  const call = (method: string, action: string, body: unknown = {}) => http.handleTopLevel({ request: { method }, pathname: '/api/v1/app/agents/dsh/' + action, searchParams: new URLSearchParams(), authorizeWrite: () => { authorized++; }, readJsonBody: async () => body });
  const discovery = await call('GET', 'discovery'); assert.equal(discovery?.status, 200); assert.equal(JSON.stringify(discovery).includes(f.discovery.credential), false);
  await assert.rejects(call('POST', 'connect', { candidateId: 'one', expectedDiscoveryRevision: 'one', expectedRevision: 'one', credential: 'forbidden' }), code('agent_request_invalid')); assert.equal(authorized, 1);
  const observed = f.application.listDshDiscovery(); const connected = await call('POST', 'connect', { candidateId: observed.candidates[0].id, expectedDiscoveryRevision: observed.revision, expectedRevision: f.application.listRegistry().revision }); assert.equal(connected?.status, 200);
  const current = f.application.listRegistry(); assert.equal((await call('POST', 'remove', { agentId: current.defaultAgentId, expectedRevision: current.revision }))?.status, 200);
});


test('same-path DSH home replacement cannot reuse the old connection or migrate existing relationships', async t => {
  const f = await fixture(t, true), connected = await f.connect(), observed = f.application.listDshDiscovery();
  const previous = f.discovery.profileKey + '-retained'; fs.renameSync(f.discovery.profileKey, previous);
  fs.mkdirSync(f.discovery.profileKey, { mode: 0o700 }); fs.mkdirSync(path.join(f.discovery.profileKey, 'buildr'), { mode: 0o700 }); fs.mkdirSync(path.join(f.discovery.profileKey, 'buildr/desktop-bridges'), { mode: 0o700 }); fs.copyFileSync(path.join(previous, 'buildr/desktop-bridges/development.json'), f.file); fs.chmodSync(f.file, 0o600);
  assert.throws(() => f.desktop.resolveLinkConnection(connected.desktop!.id), code('agent_dsh_connection_scope_changed'));
  await assert.rejects(f.application.connectDsh({ candidateId: observed.candidates[0].id, expectedDiscoveryRevision: observed.revision, expectedRevision: f.application.listRegistry().revision, existingAgentId: f.agentId }), code('agent_discovery_changed'));
  const now = f.application.listDshDiscovery(); await assert.rejects(f.application.connectDsh({ candidateId: now.candidates[0].id, expectedDiscoveryRevision: now.revision, expectedRevision: f.application.listRegistry().revision, existingAgentId: f.agentId }), code('agent_dsh_connection_mismatch'));
  assert.equal(f.application.listRegistry().defaultAgentId, f.agentId); assert.equal(f.generated.length, 0);
});

for (const fault of ['no-config', 'duplicate-config', 'leak']) test('desktop invalid response ' + fault + ' cannot publish or disclose request material', async t => {
  const f = await fixture(t); await f.connect(); f.change({ fault });
  const run = await f.generate(), result = await f.finish(run.id); assert.equal(result.status, 'failed'); assert.equal(result.output, null);
  assert.equal(result.error?.code, fault === 'leak' ? 'agent_dsh_request_failed' : 'agent_dsh_model_unconfirmed'); assert.equal(JSON.stringify(result).includes(f.discovery.credential), false); assert.equal(JSON.stringify(result).includes('private prompt'), false);
});

test('acknowledged cancellation without original settlement closes only its socket within the cancel bound', async t => {
  const f = await fixture(t); await f.connect(); f.change({ fault: 'ack-only', slow: true });
  const client = new DshDesktopTransport(f.discovery); await client.start();
  const controller = new AbortController(); const pending = client.generate({ prompt: 'bounded cancellation', outputSchema, signal: controller.signal, onConfigured: () => {}, onRunning: () => {} });
  await wait(() => f.active.size === 1); const started = Date.now(); controller.abort(); await assert.rejects(pending); assert.ok(Date.now() - started < 6500); assert.equal(client.alive, false); await client.close();
});

test('shutdown during idle DSH removal retains the observed registration', async t => {
  const f = await fixture(t), connected = await f.connect(); const run = await f.generate(); await f.finish(run.id);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const pool = (f.application as unknown as { pools: Map<string, { client: { close(): Promise<void> } }> }).pools.get(connected.agentId)!;
  t.mock.method(pool.client, 'close', async () => { await gate; });
  const removing = f.application.removeDsh({ agentId: connected.agentId, expectedRevision: f.application.listRegistry().revision });
  const closed = f.application.close(); release(); await closed; await assert.rejects(removing, code('agent_operations_closed'));
  assert.equal(f.application.listRegistry().agents[0].id, connected.agentId);
});

test('desktop close releases its pending navigation while another caller and the Host remain available', async t => {
  const f = await fixture(t), connected = await f.connect();
  f.change({ slow: true, fault: 'navigation-hang' });
  const other = new DshDesktopTransport(f.discovery), otherAbort = new AbortController();
  t.after(async () => { otherAbort.abort(); await other.close(); });
  const otherCall = other.generate({ prompt: 'Independent caller', outputSchema, signal: otherAbort.signal, onConfigured() {}, onRunning() {} }).catch(() => null);
  await wait(() => f.active.size === 1);
  const navigation = f.desktop.openSession(connected.desktop!.id, crypto.randomUUID());
  const rejected = assert.rejects(navigation, code('agent_dsh_desktop_disconnected'));
  await wait(() => f.active.size === 2);
  await f.desktop.close(); await rejected;
  await wait(() => f.active.size === 1);
  assert.equal(other.alive, true);
  assert.equal(process.kill(f.discovery.hostPid, 0), true);
  await assert.rejects(f.desktop.listConnections(), code('agent_operations_closed'));
  await f.desktop.close();
  otherAbort.abort(); await otherCall; await other.close();
});
