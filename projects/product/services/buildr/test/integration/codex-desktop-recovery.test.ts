import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CodexDesktopApplication } from '../../src/modules/codex-desktop/application/codex-desktop-application.ts';
import type { CodexWorkspaceSessions } from '../../src/modules/codex-desktop/domain/codex-desktop.ts';
import { CodexDesktopRepository } from '../../src/modules/codex-desktop/persistence/codex-desktop-repository.ts';

const workspaceId = '20000000-0000-0000-0000-000000000001';
const nativeSessionId = '20000000-0000-0000-0000-000000000002';
type Installed = { pluginVersion: string; status: 'awaiting-desktop'; safeReason: string | null };
function fixture(t: test.TestContext, installPlugin: () => Promise<Installed> = async () => ({ pluginVersion: '1.0.0', status: 'awaiting-desktop', safeReason: '待桌面加载' })) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-codex-recovery-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace'), home = path.join(base, 'codex'), appPath = path.join(base, 'ChatGPT.app'), dataRoot = path.join(base, 'profile');
  for (const directory of [root, home, appPath, dataRoot]) fs.mkdirSync(directory);
  const task = { taskId: 'first-task', title: '保留任务事实' };
  const secondTask = { taskId: 'second-task', title: '其他任务事实' };
  const application = new CodexDesktopApplication({
    dataRoot, resolveWorkspace: id => { assert.equal(id, workspaceId); return { rootPath: root, workspace: { id } }; },
    listWorkspaces: () => ({ workspaces: [{ status: 'ready', workspace: { id: workspaceId } }] }),
    readTaskIdentity: (_root, id) => [task.taskId, secondTask.taskId].includes(id) ? { ...(id === task.taskId ? task : secondTask), revision: 'sha256-observed-task' } : null,
    installPlugin, readOrigin: () => 'http://127.0.0.1:12345',
  });
  const registration = { kind: 'codex' as const, id: 'agent-' + crypto.randomUUID(), label: 'Codex', executable: process.execPath, version: 'test', codexHome: home };
  const connect = () => application.connect(registration, { appPath, appVersion: '1' });
  const bind = (connectionId: string, taskId = task.taskId, sessionId = nativeSessionId) => {
    const request = application.createBinding(workspaceId, { connectionId, taskId });
    application.completeBinding(workspaceId, { bindingRequestId: request.id, connectionId, nativeSessionId: sessionId });
    return request;
  };
  const sessionsFile = path.join(root, '.buildr/local/codex-desktop-sessions.json');
  return { base, root, home, dataRoot, application, task, secondTask, connect, bind, sessionsFile };
}

test('same-path configuration replacement without account metadata rejects the old connection and preserves relations', async t => {
  const f = fixture(t), original = await f.connect();
  f.bind(original.id);
  f.application.connectorStarted(original.id, '1.0.0');
  assert.equal(f.application.listConnections().connections[0].status, 'ready');
  assert.equal(fs.existsSync(path.join(f.home, 'auth.json')), false);
  const relations = fs.readFileSync(f.sessionsFile, 'utf8');
  fs.renameSync(f.home, path.join(f.base, 'previous-home')); fs.mkdirSync(f.home);
  const unavailable = f.application.listConnections().connections[0];
  assert.equal(unavailable.status, 'unavailable'); assert.ok(unavailable.safeReason);
  assert.throws(() => f.application.connectorStarted(original.id, '1.0.0'), { code: 'codex_connection_scope_changed' });
  assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), relations);
  const next = await f.connect();
  assert.notEqual(next.id, original.id);
  assert.equal(f.application.sessionRelations(workspaceId).relations[0].connectionId, original.id);
  assert.equal(f.task.title, '保留任务事实');
});

test('retrying an uncertain binding creation with the same client request returns the original pending receipt', async t => {
  const f = fixture(t), connection = await f.connect();
  const input = { connectionId: connection.id, taskId: f.task.taskId, bindingRequestId: crypto.randomUUID() };
  const first = f.application.createBinding(workspaceId, input);
  assert.equal(first.id, input.bindingRequestId);
  const repeated = f.application.createBinding(workspaceId, input);
  assert.deepEqual(repeated, first);
  assert.equal((JSON.parse(fs.readFileSync(f.sessionsFile, 'utf8')) as CodexWorkspaceSessions).bindings.length, 1);
  assert.deepEqual(f.application.sessionRelations(workspaceId).relations, []);
});

test('a binding request id cannot be reused for another task or desktop connection', async t => {
  const f = fixture(t), firstConnection = await f.connect();
  const input = { connectionId: firstConnection.id, taskId: f.task.taskId, bindingRequestId: crypto.randomUUID() };
  f.application.createBinding(workspaceId, input);
  const before = fs.readFileSync(f.sessionsFile, 'utf8');
  assert.throws(() => f.application.createBinding(workspaceId, { ...input, taskId: undefined }), { status: 409 });
  fs.writeFileSync(path.join(f.home, 'auth.json'), JSON.stringify({ tokens: { account_id: 'second-confirmed-account' } }));
  const secondConnection = await f.connect();
  assert.notEqual(secondConnection.id, firstConnection.id);
  assert.throws(() => f.application.createBinding(workspaceId, { ...input, connectionId: secondConnection.id }), { status: 409 });
  assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), before);
});

test('repeated bound creation returns its receipt without re-creating an explicitly removed relation', async t => {
  const f = fixture(t), connection = await f.connect();
  const input = { connectionId: connection.id, taskId: f.task.taskId, bindingRequestId: crypto.randomUUID() };
  f.application.createBinding(workspaceId, input);
  const bound = f.application.completeBinding(workspaceId, { connectionId: connection.id, bindingRequestId: input.bindingRequestId, nativeSessionId });
  assert.deepEqual(f.application.createBinding(workspaceId, input), bound);
  const relation = f.application.sessionRelations(workspaceId).relations[0];
  f.application.unlinkSession(workspaceId, { relationId: relation.id, expectedRevision: relation.revision });
  assert.deepEqual(f.application.createBinding(workspaceId, input), bound);
  assert.deepEqual(f.application.sessionRelations(workspaceId).relations, []);
  assert.equal((JSON.parse(fs.readFileSync(f.sessionsFile, 'utf8')) as CodexWorkspaceSessions).bindings.length, 1);
});

test('uncertain handoff creation is idempotent for one goal/task/session and rejects reuse for a different target', async t => {
  const f = fixture(t), connection = await f.connect(), binding = f.bind(connection.id);
  const input = { bindingRequestId: binding.id, taskId: f.task.taskId, goal: '检查当前任务结果', handoffRequestId: crypto.randomUUID() };
  const first = f.application.createHandoff(workspaceId, input);
  assert.equal(first.id, input.handoffRequestId); assert.equal(first.status, 'pending');
  assert.deepEqual(f.application.createHandoff(workspaceId, input), first);
  assert.throws(() => f.application.createHandoff(workspaceId, { ...input, goal: '执行另一个工作目标' }), { code: 'codex_handoff_scope_changed', status: 409 });
  const secondTaskBinding = f.bind(connection.id, f.secondTask.taskId);
  assert.throws(() => f.application.createHandoff(workspaceId, { ...input, bindingRequestId: secondTaskBinding.id, taskId: f.secondTask.taskId }), { code: 'codex_handoff_scope_changed', status: 409 });
  const secondSessionBinding = f.bind(connection.id, f.task.taskId, '20000000-0000-0000-0000-000000000003');
  assert.throws(() => f.application.createHandoff(workspaceId, { ...input, bindingRequestId: secondSessionBinding.id }), { code: 'codex_handoff_scope_changed', status: 409 });
  const stored = JSON.parse(fs.readFileSync(f.sessionsFile, 'utf8')) as CodexWorkspaceSessions;
  assert.equal(stored.handoffs.length, 1); assert.equal(stored.handoffs[0].status, 'pending');
  assert.deepEqual(f.application.handoffReceipt(workspaceId, first.id), first);
});

test('cached old component handshake cannot mark a newly installed version ready', async t => {
  let version = '1.0.0';
  const f = fixture(t, async () => ({ pluginVersion: version, status: 'awaiting-desktop', safeReason: '待桌面加载' }));
  const original = await f.connect();
  f.application.connectorStarted(original.id, '1.0.0');
  assert.equal(f.application.listConnections().connections[0].status, 'ready');
  version = '2.0.0';
  assert.equal((await f.connect()).id, original.id);
  assert.throws(() => f.application.connectorStarted(original.id, '1.0.0'), { code: 'codex_plugin_version_changed' });
  const waiting = f.application.listConnections().connections[0];
  assert.equal(waiting.pluginVersion, '2.0.0'); assert.equal(waiting.status, 'awaiting-desktop');
  f.application.connectorStarted(original.id, '2.0.0');
  assert.equal(f.application.listConnections().connections[0].status, 'ready');
});

test('out-of-order concurrent installation replies cannot overwrite the latest version or active handshake', async t => {
  const replies: ((value: Installed) => void)[] = [];
  const f = fixture(t, () => new Promise<Installed>(resolve => replies.push(resolve)));
  const older = f.connect(), newer = f.connect();
  assert.equal(replies.length, 2);
  replies[1]({ pluginVersion: '2.0.0', status: 'awaiting-desktop', safeReason: '新版本待加载' });
  const latest = await newer;
  f.application.connectorStarted(latest.id, '2.0.0');
  replies[0]({ pluginVersion: '1.0.0', status: 'awaiting-desktop', safeReason: '旧版本迟到' });
  const staleReply = await older, stored = f.application.listConnections().connections[0];
  assert.equal(staleReply.id, latest.id); assert.equal(staleReply.pluginVersion, '2.0.0'); assert.equal(staleReply.status, 'ready');
  assert.equal(stored.pluginVersion, '2.0.0'); assert.equal(stored.status, 'ready'); assert.equal(stored.safeReason, null);
});

test('connection directory symlink is rejected before reading foreign state while workspace queries remain available', async t => {
  const f = fixture(t); await f.connect();
  const owned = path.join(f.dataRoot, 'codex-desktop'), foreign = path.join(f.base, 'foreign-state');
  fs.renameSync(owned, foreign); fs.symlinkSync(foreign, owned);
  const file = path.join(foreign, 'connections.json'), before = fs.readFileSync(file, 'utf8');
  assert.throws(() => f.application.listConnections(), { code: 'codex_storage_scope_invalid' });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(f.application.sessionRelations(workspaceId).relations, []);
  assert.equal(f.task.title, '保留任务事实');
});

test('oversized UTF-8 handoff storage rejects only the new write and keeps existing relations readable', async t => {
  const f = fixture(t), connection = await f.connect(), binding = f.bind(connection.id);
  const handoff = f.application.createHandoff(workspaceId, { bindingRequestId: binding.id, taskId: f.task.taskId, goal: '继续'.repeat(1000) });
  const before = fs.readFileSync(f.sessionsFile, 'utf8');
  const repository = new CodexDesktopRepository(f.dataRoot);
  assert.throws(() => repository.mutateWorkspace(f.root, workspaceId, state => {
    state.handoffs = Array.from({ length: 512 }, () => ({ ...handoff, status: 'pending' as const, id: crypto.randomUUID() }));
  }), { code: 'codex_local_state_full', status: 409 });
  assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), before);
  assert.equal(f.application.sessionRelations(workspaceId).relations.length, 1);
  assert.equal(f.application.handoffReceipt(workspaceId, handoff.id).id, handoff.id);
  const relation = f.application.sessionRelations(workspaceId).relations[0];
  f.application.unlinkSession(workspaceId, { relationId: relation.id, expectedRevision: relation.revision });
  assert.deepEqual(f.application.sessionRelations(workspaceId).relations, []);
});

const corruptions: [string, (state: CodexWorkspaceSessions) => void][] = [
  ['native session identity', state => { state.relations[0].nativeSessionId = 'shared-root-not-a-native-thread'; }],
  ['binding status', state => { (state.bindings[0] as unknown as { status: string }).status = 'ready'; }],
  ['duplicate relation tuple', state => { state.relations.push({ ...state.relations[0], id: crypto.randomUUID() }); }],
  ['relation revision', state => { state.relations[0].revision = 'not-an-observed-version'; }],
];
for (const [name, corrupt] of corruptions) {
  test('damaged local ' + name + ' fails only session operations and retains the original file', async t => {
    const f = fixture(t), connection = await f.connect(); f.bind(connection.id);
    const state = JSON.parse(fs.readFileSync(f.sessionsFile, 'utf8')) as CodexWorkspaceSessions;
    corrupt(state);
    const damaged = JSON.stringify(state, null, 2) + '\n';
    fs.writeFileSync(f.sessionsFile, damaged);
    assert.throws(() => f.application.sessionRelations(workspaceId), { code: 'codex_local_state_invalid' });
    assert.throws(() => f.application.createBinding(workspaceId, { connectionId: connection.id }), { code: 'codex_local_state_invalid' });
    assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), damaged, 'diagnosis must not repair, delete or replace the user file');
    assert.equal(f.application.listConnections().connections[0].id, connection.id);
    assert.equal(f.application.listWorkspaces().workspaces[0].id, workspaceId);
    assert.equal(f.task.title, '保留任务事实');
  });
}
