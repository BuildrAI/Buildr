import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CodexDesktopApplication } from '../../src/modules/codex-desktop/application/codex-desktop-application.ts';
import { createCodexDesktopHttpContribution } from '../../src/modules/codex-desktop/interfaces/http/codex-desktop-http.ts';
import { createCodexDesktopCliContributions } from '../../src/modules/codex-desktop/interfaces/cli/codex-desktop-cli.ts';

const workspaceId = '10000000-0000-0000-0000-000000000001';
const sessionA = '10000000-0000-0000-0000-000000000002', sessionB = '10000000-0000-0000-0000-000000000003';
function fixture(t: { after(callback: () => void): void }) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-codex-relations-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace'), home = path.join(base, 'codex'), appPath = path.join(base, 'ChatGPT.app'), dataRoot = path.join(base, 'profile');
  for (const dir of [root, home, appPath, dataRoot]) fs.mkdirSync(dir);
  const tasks = new Map([['first-task', { taskId: 'first-task', title: '任务一' }], ['second-task', { taskId: 'second-task', title: '任务二' }]]);
  let now = Date.now();
  const application = new CodexDesktopApplication({ dataRoot, now: () => now,
    resolveWorkspace: id => { assert.equal(id, workspaceId); return { rootPath: root, workspace: { id, name: '测试' } }; },
    listWorkspaces: () => ({ workspaces: [{ status: 'ready', workspace: { id: workspaceId, name: '测试' } }] }),
    readTaskIdentity: (_root, id) => tasks.has(id) ? { ...tasks.get(id)!, revision: 'sha256-current-task' } : null,
    installPlugin: async () => ({ pluginVersion: '1.0.0', status: 'awaiting-desktop', safeReason: '待加载' }), readOrigin: () => 'http://127.0.0.1:12345',
  });
  const registration = { kind: 'codex' as const, id: 'agent-' + crypto.randomUUID(), label: 'Codex', executable: process.execPath, version: 'test', codexHome: home };
  const connect = () => application.connect(registration, { appPath, appVersion: '1' });
  return { application, connect, root, home, base, registration, advance: (ms: number) => { now += ms; }, tasks };
}
test('task/session many-to-many is idempotent and has independent unlink versions', async t => {
  const f = fixture(t), { id } = await f.connect();
  const bind = (taskId: string, nativeSessionId: string) => {
    const b = f.application.createBinding(workspaceId, { connectionId: id, taskId });
    return f.application.completeBinding(workspaceId, { bindingRequestId: b.id, connectionId: id, nativeSessionId });
  };
  bind('first-task', sessionA); bind('first-task', sessionB); bind('second-task', sessionA); bind('first-task', sessionA);
  const first = f.application.sessionRelations(workspaceId, { taskId: 'first-task' });
  assert.equal(first.relations.length, 2);
  assert.equal(f.application.sessionRelations(workspaceId, { connectionId: id, nativeSessionId: sessionA }).relations.length, 2);
  assert.match(first.relations[0].taskUrl, /\/codex#\/tasks\/first-task$/);
  assert.equal(first.relations[0].sessionUrl, 'codex://threads/' + sessionA);
  assert.throws(() => f.application.unlinkSession(workspaceId, { relationId: first.relations[0].id, expectedRevision: 'stale' }), { code: 'codex_relation_changed' });
  f.application.unlinkSession(workspaceId, { relationId: first.relations[0].id, expectedRevision: first.relations[0].revision });
  assert.equal(f.application.sessionRelations(workspaceId, { taskId: 'first-task' }).relations.length, 1);
  assert.equal(f.tasks.get('first-task')?.title, '任务一');
});
test('direct chat linking needs no pending request or ready panel and preserves many-to-many identities', async t => {
  const f = fixture(t), { id } = await f.connect();
  assert.equal(f.application.listConnections().connections[0].status, 'awaiting-desktop');
  const first = f.application.linkSession(workspaceId, { taskId: 'first-task', nativeSessionId: sessionA });
  f.application.linkSession(workspaceId, { taskId: 'first-task', nativeSessionId: sessionB });
  f.application.linkSession(workspaceId, { taskId: 'second-task', nativeSessionId: sessionA });
  const replay = f.application.linkSession(workspaceId, { taskId: 'first-task', nativeSessionId: sessionA, connectionId: id });
  assert.equal(first.alreadyLinked, false);
  assert.equal(replay.alreadyLinked, true);
  assert.deepEqual(replay.relation, first.relation);
  assert.equal(first.sessionUrl, `codex://threads/${sessionA}`);
  assert.equal(first.taskUrl, `/workspaces/${workspaceId}/codex#/tasks/first-task`);
  assert.equal(first.taskHref, `http://127.0.0.1:12345${first.taskUrl}`);
  assert.equal(f.application.sessionRelations(workspaceId, { taskId: 'first-task' }).relations.length, 2);
  assert.equal(f.application.sessionRelations(workspaceId, { nativeSessionId: sessionA }).relations.length, 2);
  const state = JSON.parse(fs.readFileSync(path.join(f.root, '.buildr/local/codex-desktop-sessions.json'), 'utf8'));
  assert.deepEqual(state.bindings, []); assert.deepEqual(state.handoffs, []);
  assert.equal(f.tasks.get('first-task')?.title, '任务一');
});
test('direct linking leaves an old pending request unchanged and does not hide the durable relation', async t => {
  const f = fixture(t), { id } = await f.connect();
  const pending = f.application.createBinding(workspaceId, { connectionId: id, taskId: 'first-task' });
  const linked = f.application.linkSession(workspaceId, { taskId: 'first-task', nativeSessionId: sessionA });
  assert.deepEqual(f.application.bindingReceipt(workspaceId, pending.id), pending);
  assert.equal(f.application.sessionRelations(workspaceId, { taskId: 'first-task' }).relations[0].id, linked.relation.id);
});
test('direct linking rejects absent or ambiguous Codex selection and accepts an explicit active connection', async t => {
  const f = fixture(t), input = { taskId: 'first-task', nativeSessionId: sessionA };
  assert.throws(() => f.application.linkSession(workspaceId, input), { code: 'codex_connection_missing' });
  await f.connect();
  const secondHome = path.join(f.base, 'codex-second'); fs.mkdirSync(secondHome);
  const second = await f.application.connect({ ...f.registration, id: 'agent-' + crypto.randomUUID(), codexHome: secondHome }, { appPath: path.join(f.base, 'ChatGPT.app'), appVersion: '1' });
  assert.throws(() => f.application.linkSession(workspaceId, input), { code: 'codex_connection_ambiguous' });
  assert.equal(f.application.sessionRelations(workspaceId).relations.length, 0);
  assert.equal(f.application.linkSession(workspaceId, { ...input, connectionId: second.id }).relation.connectionId, second.id);
});
test('direct linking rejects invalid identity, missing task, changed scope and removed access without changing relations', async t => {
  const f = fixture(t), { id } = await f.connect(), input = { taskId: 'first-task', nativeSessionId: sessionA, connectionId: id };
  assert.throws(() => f.application.linkSession(workspaceId, { ...input, nativeSessionId: 'shared-root' }), { code: 'codex_native_session_invalid' });
  assert.throws(() => f.application.linkSession('not-a-workspace', input), { code: 'codex_workspace_invalid' });
  assert.throws(() => f.application.linkSession(workspaceId, { ...input, taskId: 'missing-task' }), { code: 'codex_task_missing' });
  assert.equal(f.application.sessionRelations(workspaceId).relations.length, 0);
  const original = f.application.linkSession(workspaceId, input).relation;
  fs.writeFileSync(path.join(f.home, 'auth.json'), JSON.stringify({ tokens: { account_id: 'changed' } }));
  assert.throws(() => f.application.linkSession(workspaceId, input), { code: 'codex_connection_scope_changed' });
  fs.rmSync(path.join(f.home, 'auth.json'));
  f.application.disconnect(f.registration.id);
  assert.throws(() => f.application.linkSession(workspaceId, input), { code: 'codex_connection_disconnected' });
  assert.deepEqual(f.application.sessionRelations(workspaceId).relations, [original]);
});
test('direct link CLI requires an explicit task, target and identity and never falls back to inherited chat environment', async t => {
  const f = fixture(t); await f.connect();
  const targets: string[] = [];
  const command = createCodexDesktopCliContributions(f.application, target => { targets.push(target); assert.equal(target, f.root); return workspaceId; }).find(c => c.key === 'codex link')!;
  const run = (args: string[]) => command.run(null, { argv: ['node', 'buildr', 'codex', 'link', ...args] });
  const inherited = process.env.CODEX_THREAD_ID;
  process.env.CODEX_THREAD_ID = sessionB;
  try {
    await assert.rejects(() => run(['--target', f.root, '--task', 'first-task', '--json']), { code: 'codex_cli_invalid' });
    await assert.rejects(() => run(['--task', 'first-task', '--native-session-id', sessionA]), { code: 'codex_cli_invalid' });
    await assert.rejects(() => run(['--target', f.root, '--native-session-id', sessionA]), { code: 'codex_cli_invalid' });
    await assert.rejects(() => run(['--target', f.root, '--task', 'first-task', '--native-session-id', sessionA, '--task', 'second-task']), { code: 'codex_cli_invalid' });
    await assert.rejects(() => run(['--target', f.root, '--task', 'first-task', '--native-session-id', sessionA, '--workspace-id', workspaceId]), { code: 'codex_cli_invalid' });
    assert.deepEqual(targets, []);
    let output = '';
    const write = process.stdout.write;
    process.stdout.write = ((chunk: unknown) => { output += String(chunk); return true; }) as typeof process.stdout.write;
    try {
      const result = await run(['--target', f.root, '--task', 'first-task', '--native-session-id', sessionA, '--json']);
      assert.equal((result as ReturnType<CodexDesktopApplication['linkSession']>).relation.nativeSessionId, sessionA);
    } finally { process.stdout.write = write; }
    assert.equal(JSON.parse(output).sessionUrl, `codex://threads/${sessionA}`);
    assert.deepEqual(targets, [f.root]);
    assert.equal(f.application.sessionRelations(workspaceId, { nativeSessionId: sessionB }).relations.length, 0);
  } finally {
    if (inherited === undefined) delete process.env.CODEX_THREAD_ID; else process.env.CODEX_THREAD_ID = inherited;
  }
});
test('old bound request replay cannot resurrect an explicitly unlinked relation', async t => {
  const f = fixture(t), { id } = await f.connect();
  const b = f.application.createBinding(workspaceId, { connectionId: id, taskId: 'first-task' });
  const input = { bindingRequestId: b.id, connectionId: id, nativeSessionId: sessionA };
  f.application.completeBinding(workspaceId, input);
  const relation = f.application.sessionRelations(workspaceId).relations[0];
  f.application.unlinkSession(workspaceId, { relationId: relation.id, expectedRevision: relation.revision });
  f.application.completeBinding(workspaceId, input);
  assert.equal(f.application.sessionRelations(workspaceId).relations.length, 0);
  const fresh = f.application.createBinding(workspaceId, { connectionId: id, taskId: 'first-task' });
  f.application.completeBinding(workspaceId, { ...input, bindingRequestId: fresh.id });
  assert.notEqual(f.application.sessionRelations(workspaceId).relations[0].revision, relation.revision);
});
test('binding expiry and target mismatch preserve long-lived relations', async t => {
  const f = fixture(t), { id } = await f.connect();
  const b = f.application.createBinding(workspaceId, { connectionId: id, taskId: 'first-task' });
  assert.equal(f.application.sessionRelations(workspaceId).relations.length, 0);
  assert.throws(() => f.application.completeBinding(workspaceId, { bindingRequestId: b.id, connectionId: id, nativeSessionId: 'shared-root' }), { code: 'codex_native_session_invalid' });
  f.application.completeBinding(workspaceId, { bindingRequestId: b.id, connectionId: id, nativeSessionId: sessionA });
  assert.throws(() => f.application.completeBinding(workspaceId, { bindingRequestId: b.id, connectionId: id, nativeSessionId: sessionB }), { code: 'codex_binding_target_changed' });
  f.advance(31 * 60_000);
  assert.equal(f.application.bindingReceipt(workspaceId, b.id).status, 'expired');
  assert.equal(f.application.sessionRelations(workspaceId).relations.length, 1);
  assert.throws(() => f.application.createHandoff(workspaceId, { bindingRequestId: b.id, taskId: 'first-task' }), { code: 'codex_binding_unconfirmed' });
});
test('accurate handoff receipts distinguish delivery from duplicate and wrong chat', async t => {
  const f = fixture(t), { id } = await f.connect();
  const b = f.application.createBinding(workspaceId, { connectionId: id, taskId: 'first-task' });
  f.application.completeBinding(workspaceId, { bindingRequestId: b.id, connectionId: id, nativeSessionId: sessionA });
  const h = f.application.createHandoff(workspaceId, { bindingRequestId: b.id, taskId: 'first-task' });
  assert.equal(h.status, 'pending');
  assert.match(h.message, /buildr_codex_acknowledge_handoff/);
  assert.throws(() => f.application.acknowledgeHandoff(workspaceId, { handoffRequestId: h.id, connectionId: id, nativeSessionId: sessionB }), { code: 'codex_handoff_wrong_session' });
  assert.equal(f.application.handoffReceipt(workspaceId, h.id).status, 'pending');
  const input = { handoffRequestId: h.id, connectionId: id, nativeSessionId: sessionA };
  assert.equal(f.application.acknowledgeHandoff(workspaceId, input).alreadyReceived, false);
  assert.equal(f.application.acknowledgeHandoff(workspaceId, input).alreadyReceived, true);
  assert.equal(f.application.handoffReceipt(workspaceId, h.id).status, 'received');
});
test('same installation reconnect stays stable; observed account change never retargets old relations', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.home, 'auth.json'), JSON.stringify({ tokens: { account_id: 'one', access_token: 'secret-not-persisted' } }));
  const original = await f.connect();
  assert.equal((await f.connect()).id, original.id);
  const b = f.application.createBinding(workspaceId, { connectionId: original.id, taskId: 'first-task' });
  f.application.completeBinding(workspaceId, { bindingRequestId: b.id, connectionId: original.id, nativeSessionId: sessionA });
  fs.writeFileSync(path.join(f.home, 'auth.json'), JSON.stringify({ tokens: { account_id: 'two' } }));
  assert.throws(() => f.application.connectorStarted(original.id, '1'), { code: 'codex_connection_scope_changed' });
  const next = await f.connect();
  assert.notEqual(next.id, original.id);
  assert.equal(f.application.sessionRelations(workspaceId).relations[0].connectionId, original.id);
  assert.doesNotMatch(fs.readFileSync(path.join(f.base, 'profile/codex-desktop/connections.json'), 'utf8'), /secret-not-persisted|account_id/);
});
test('invalid workspace local storage is retained and symlink write is rejected', async t => {
  const f = fixture(t), { id } = await f.connect();
  fs.mkdirSync(path.join(f.root, '.buildr'), { recursive: true });
  const outside = path.join(f.base, 'outside'); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(f.root, '.buildr/local'));
  assert.throws(() => f.application.createBinding(workspaceId, { connectionId: id }), { code: 'codex_storage_scope_invalid' });
  assert.deepEqual(fs.readdirSync(outside), []);
});
test('HTTP contract rejects unknown or repeated fields and authorizes binding writes', async t => {
  const f = fixture(t), { id } = await f.connect();
  const http = createCodexDesktopHttpContribution(f.application, () => workspaceId);
  let authorized = 0;
  const context = { request: { method: 'POST' }, suffix: '/codex/bindings', searchParams: new URLSearchParams(), root: f.root, authorizeWrite: () => { authorized++; }, readJsonBody: async () => ({ connectionId: id, taskId: 'first-task' }) };
  const response = await http.handle(context);
  assert.equal(authorized, 1); assert.equal(response?.status, 200);
  await assert.rejects(() => http.handle({ ...context, readJsonBody: async () => ({ connectionId: id, nativeSessionId: sessionA }) }), { code: 'codex_request_invalid' });
  await assert.rejects(() => http.handle({ ...context, request: { method: 'GET' }, suffix: '/codex/sessions', searchParams: new URLSearchParams('taskId=first-task&taskId=second-task') }), { code: 'codex_request_invalid' });
});
