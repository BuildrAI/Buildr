import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { CodexDesktopApplication } from '../../src/modules/codex-desktop/application/codex-desktop-application.ts';
import { CodexDesktopRepository } from '../../src/modules/codex-desktop/persistence/codex-desktop-repository.ts';
import { runCodexMcpServer } from '../../src/modules/codex-desktop/interfaces/mcp/codex-mcp-server.ts';

const workspaceId = '30000000-0000-4000-8000-000000000001', nativeSessionId = '30000000-0000-4000-8000-000000000002';
type Installed = { pluginVersion: string; status: 'awaiting-desktop'; safeReason: string | null };
function fixture(t: test.TestContext, installPlugin: () => Promise<Installed> = async () => ({ pluginVersion: '1.0.0', status: 'awaiting-desktop', safeReason: '待桌面加载' })) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-codex-disconnect-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace'), home = path.join(base, 'codex'), appPath = path.join(base, 'ChatGPT.app'), dataRoot = path.join(base, 'profile');
  for (const directory of [root, home, appPath, dataRoot]) fs.mkdirSync(directory);
  for (const [file, content] of Object.entries({ 'config.toml': 'model="fixture"\n', 'memories/state.txt': 'original memory\n', 'plugins/native.json': '{"preserved":true}\n', 'sessions/original.json': '{"chat":"unchanged"}\n' })) { const target = path.join(home, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
  const registration = { kind: 'codex' as const, id: 'agent-' + crypto.randomUUID(), label: 'Codex', executable: process.execPath, version: 'fixture', codexHome: home };
  const registry = path.join(base, 'active-registration-ids.json');
  const setActive = (ids: string[]) => fs.writeFileSync(registry, JSON.stringify(ids)); setActive([registration.id]);
  const dependencies = { dataRoot, resolveWorkspace: (id: string) => { assert.equal(id, workspaceId); return { rootPath: root, workspace: { id, name: '测试' } }; }, listWorkspaces: () => ({ workspaces: [{ status: 'ready', workspace: { id: workspaceId } }] }),
    readTaskIdentity: (_root: string, id: string) => id === 'preserved-task' ? { taskId: id, title: '保留任务', revision: 'sha256-original-task' } : null,
    installPlugin, readRegistrationActive: (id: string) => (JSON.parse(fs.readFileSync(registry, 'utf8')) as string[]).includes(id), readOrigin: () => 'http://127.0.0.1:12345' };
  const application = new CodexDesktopApplication(dependencies), connect = () => application.connect(registration, { appPath, appVersion: 'fixture' });
  const bind = (connectionId: string) => {
    const binding = application.createBinding(workspaceId, { connectionId, taskId: 'preserved-task' });
    application.completeBinding(workspaceId, { connectionId, bindingRequestId: binding.id, nativeSessionId });
    return binding;
  };
  const nativeSnapshot = () => ['config.toml', 'memories/state.txt', 'plugins/native.json', 'sessions/original.json'].map(file => fs.readFileSync(path.join(home, file), 'utf8'));
  return { base, root, home, appPath, dataRoot, application, registration, setActive, connect, bind, nativeSnapshot, anotherProcess: () => new CodexDesktopApplication(dependencies), sessionsFile: path.join(root, '.buildr/local/codex-desktop-sessions.json'), connectionsFile: path.join(dataRoot, 'codex-desktop/connections.json') };
}

test('disconnect stops every desktop connection for one registration and preserves chats, configuration and task history', async t => {
  const f = fixture(t), connection = await f.connect(), binding = f.bind(connection.id);
  const pending = f.application.createBinding(workspaceId, { connectionId: connection.id });
  const handoff = f.application.createHandoff(workspaceId, { bindingRequestId: binding.id, taskId: 'preserved-task' });
  f.application.connectorStarted(connection.id, '1.0.0');
  const secondApp = path.join(f.base, 'OtherChatGPT.app'); fs.mkdirSync(secondApp);
  await f.application.connect(f.registration, { appPath: secondApp, appVersion: 'fixture' });
  const originalHistory = fs.readFileSync(f.sessionsFile, 'utf8'), originalNative = f.nativeSnapshot();
  f.setActive([]); f.application.disconnect(f.registration.id);
  assert.equal(f.application.listConnections().connections.length, 2);
  assert.equal(f.application.listConnections().connections.every(value => value.status === 'disconnected'), true);
  const stored = new CodexDesktopRepository(f.dataRoot).readConnections();
  assert.equal(stored.connections.every(value => value.status === 'disconnected' && value.connectorPid === null && value.preparationId === null), true);
  const denied = { code: 'codex_connection_disconnected', status: 409 };
  assert.throws(() => f.application.connectorStarted(connection.id, '1.0.0'), denied);
  assert.throws(() => f.application.createBinding(workspaceId, { connectionId: connection.id }), denied);
  assert.throws(() => f.application.completeBinding(workspaceId, { connectionId: connection.id, bindingRequestId: pending.id, nativeSessionId }), denied);
  assert.throws(() => f.application.createHandoff(workspaceId, { bindingRequestId: binding.id, taskId: 'preserved-task' }), denied);
  assert.throws(() => f.application.acknowledgeHandoff(workspaceId, { connectionId: connection.id, handoffRequestId: handoff.id, nativeSessionId }), denied);
  await assert.rejects(f.connect(), denied);
  f.application.connectorStopped(connection.id, process.pid);
  assert.equal(f.application.listConnections().connections[0].status, 'disconnected');
  assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), originalHistory);
  assert.deepEqual(f.nativeSnapshot(), originalNative);
  assert.equal(f.application.bindingReceipt(workspaceId, pending.id).status, 'pending');
  assert.equal(f.application.handoffReceipt(workspaceId, handoff.id).status, 'pending');
  const relation = f.application.sessionRelations(workspaceId).relations[0];
  assert.equal(relation.sessionUrl, 'codex://threads/' + nativeSessionId);

  const renewedRegistration = { ...f.registration, id: 'agent-' + crypto.randomUUID() };
  f.setActive([renewedRegistration.id]);
  const renewed = await f.application.connect(renewedRegistration, { appPath: f.appPath, appVersion: 'fixture' });
  assert.equal(renewed.id, connection.id); assert.equal(renewed.status, 'awaiting-desktop');
  assert.equal(f.application.sessionRelations(workspaceId).relations[0].id, relation.id);
  f.application.connectorStarted(connection.id, '1.0.0');
  assert.equal(f.application.listConnections().connections.find(value => value.id === connection.id)?.status, 'ready');
  assert.equal(f.application.listConnections().connections.filter(value => value.status === 'disconnected').length, 1);
  assert.deepEqual(f.nativeSnapshot(), originalNative);
});

test('registration absence disables old and newly created application instances even when disconnect persistence fails', async t => {
  const f = fixture(t), connection = await f.connect(), binding = f.bind(connection.id);
  f.application.connectorStarted(connection.id, '1.0.0');
  const before = fs.readFileSync(f.connectionsFile, 'utf8'), history = fs.readFileSync(f.sessionsFile, 'utf8');
  f.setActive([]);
  const lock = f.connectionsFile + '.lock';
  fs.writeFileSync(lock, JSON.stringify({ schemaVersion: 'buildr.exclusive-file-lock/v1', pid: process.pid, token: '0'.repeat(32), createdAt: new Date().toISOString(), target: f.connectionsFile }));
  try {
    assert.throws(() => f.application.disconnect(f.registration.id), { code: 'codex_local_state_busy' });
    for (const application of [f.application, f.anotherProcess()]) {
      assert.equal(application.listConnections().connections[0].status, 'disconnected');
      assert.throws(() => application.connectorStarted(connection.id, '1.0.0'), { code: 'codex_connection_disconnected' });
      assert.throws(() => application.completeBinding(workspaceId, { connectionId: connection.id, bindingRequestId: binding.id, nativeSessionId }), { code: 'codex_connection_disconnected' });
      assert.throws(() => application.createBinding(workspaceId, { connectionId: connection.id }), { code: 'codex_connection_disconnected' });
    }
    assert.equal(fs.readFileSync(f.connectionsFile, 'utf8'), before);
    assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), history);
  } finally { fs.rmSync(lock, { force: true }); }
  const relation = f.application.sessionRelations(workspaceId).relations[0];
  f.application.unlinkSession(workspaceId, { relationId: relation.id, expectedRevision: relation.revision });
  assert.deepEqual(f.application.sessionRelations(workspaceId).relations, []);
});

for (const rejectInstallation of [false, true]) {
  test('late installation ' + (rejectInstallation ? 'failure' : 'success') + ' cannot overwrite an explicit disconnect', async t => {
    let complete!: (value: Installed) => void, reject!: (reason: Error) => void;
    const f = fixture(t, () => new Promise<Installed>((resolve, fail) => { complete = resolve; reject = fail; }));
    const connecting = f.connect(), connection = f.application.listConnections().connections[0];
    assert.equal(connection.status, 'pending');
    f.application.createBinding(workspaceId, { connectionId: connection.id });
    const history = fs.readFileSync(f.sessionsFile, 'utf8');
    f.setActive([]); f.application.disconnect(f.registration.id);
    if (rejectInstallation) reject(new Error('late failure')); else complete({ pluginVersion: '2.0.0', status: 'awaiting-desktop', safeReason: 'late success' });
    assert.equal((await connecting).status, 'disconnected');
    const stored = new CodexDesktopRepository(f.dataRoot).readConnections().connections[0];
    assert.equal(stored.status, 'disconnected'); assert.equal(stored.preparationId, null); assert.equal(stored.pluginVersion, null);
    assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), history);
  });
}

test('an already initialized MCP process reads current registration for every business call and exposes only disabled status after removal', async t => {
  const f = fixture(t), connection = await f.connect(), binding = f.bind(connection.id), history = fs.readFileSync(f.sessionsFile, 'utf8');
  const input = new PassThrough(), waiting = new Map<number, (value: any) => void>();
  const output = new Writable({ write(chunk, _encoding, callback) { const response = JSON.parse(chunk.toString()); waiting.get(response.id)?.(response); waiting.delete(response.id); callback(); } });
  const running = runCodexMcpServer(f.application, { connectionId: connection.id, input, output });
  const request = (id: number, method: string, params: unknown = {}) => new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MCP response timed out')), 2000);
    waiting.set(id, value => { clearTimeout(timer); resolve(value); }); input.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  try {
    assert.ok((await request(1, 'initialize')).result);
    f.setActive([]); // A different process can remove the registration without touching this MCP process.
    const blocked = await request(2, 'tools/call', { name: 'buildr_codex_complete_binding', arguments: { workspaceId, bindingRequestId: binding.id, connectionId: connection.id, nativeSessionId } });
    assert.equal(blocked.result.isError, true); assert.equal(blocked.result.structuredContent.connection.status, 'disconnected');
    const status = await request(3, 'tools/call', { name: 'buildr_codex_connection_status', arguments: {} });
    assert.equal(status.result.structuredContent.connection.status, 'disconnected');
    const panel = await request(4, 'tools/call', { name: 'buildr_codex_panel', arguments: {} });
    assert.equal(panel.result.structuredContent.connection.status, 'disconnected'); assert.deepEqual(panel.result.structuredContent.workspaces, []); assert.equal(panel.result.structuredContent.origin, null);
    assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), history);
  } finally { input.end(); await running; }
  assert.equal(f.application.listConnections().connections[0].status, 'disconnected');
});
