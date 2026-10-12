import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CodexDesktopApplication } from '../../src/modules/codex-desktop/application/codex-desktop-application.ts';
import { createCodexDesktopHttpContribution } from '../../src/modules/codex-desktop/interfaces/http/codex-desktop-http.ts';
import { createCodexDesktopCliContributions } from '../../src/modules/codex-desktop/interfaces/cli/codex-desktop-cli.ts';

import { codexFixture as fixture, seedLegacyRequests, workspaceId, sessionA, sessionB } from '../helpers/codex-desktop-fixture.ts';
test('task/session many-to-many is idempotent and has independent unlink versions', async t => {
  const f = fixture(t), { id } = await f.connect();
  const bind = (taskId: string, nativeSessionId: string) => {
    return f.application.linkSession(workspaceId, { connectionId: id, taskId, nativeSessionId });
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
  assert.equal(f.application.listConnections().connections[0].status, 'configured');
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
test('direct linking preserves legacy requests and returns the durable relation independently', async t => {
  const f = fixture(t), { id } = await f.connect();
  seedLegacyRequests(f, id);
  const previous = f.repository.readWorkspace(f.root, workspaceId);
  const linked = f.application.linkSession(workspaceId, { taskId: 'first-task', nativeSessionId: sessionA });
  const current = f.repository.readWorkspace(f.root, workspaceId);
  assert.deepEqual(current.bindings, previous.bindings); assert.deepEqual(current.handoffs, previous.handoffs);
  assert.equal(f.application.sessionRelations(workspaceId, { taskId: 'first-task' }).relations[0].id, linked.relation.id);
});
test('direct linking rejects absent or ambiguous Codex selection and accepts an explicit active connection', async t => {
  const f = fixture(t), input = { taskId: 'first-task', nativeSessionId: sessionA };
  assert.throws(() => f.application.linkSession(workspaceId, input), { code: 'codex_connection_missing' });
  await f.connect();
  const secondHome = path.join(f.base, 'codex-second'); fs.mkdirSync(secondHome);
  const secondRegistration = { ...f.registration, id: 'agent-' + crypto.randomUUID(), codexHome: secondHome }; f.active.add(secondRegistration.id);
  const second = await f.application.connect(secondRegistration, { appPath: path.join(f.base, 'ChatGPT.app'), appVersion: '1' });
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
test('same installation reconnect stays stable; observed account change never retargets old relations', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.home, 'auth.json'), JSON.stringify({ tokens: { account_id: 'one', access_token: 'secret-not-persisted' } }));
  const original = await f.connect();
  assert.equal((await f.connect()).id, original.id);
  f.link(original.id);
  fs.writeFileSync(path.join(f.home, 'auth.json'), JSON.stringify({ tokens: { account_id: 'two' } }));
  assert.throws(() => f.link(original.id), { code: 'codex_connection_scope_changed' });
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
  assert.throws(() => f.link(id), { code: 'codex_storage_scope_invalid' });
  assert.deepEqual(fs.readdirSync(outside), []);
});
test('HTTP core relation writes require authorization and reject unknown or repeated fields', async t => {
  const f = fixture(t), { id } = await f.connect(), relation = f.link(id).relation;
  const http = createCodexDesktopHttpContribution(f.application, () => workspaceId);
  let authorized = 0;
  const context = { request: { method: 'POST' }, suffix: '/codex/sessions/unlink', searchParams: new URLSearchParams(), root: f.root, authorizeWrite: () => { authorized++; }, readJsonBody: async () => ({ relationId: relation.id, expectedRevision: relation.revision }) };
  await assert.rejects(() => http.handle({ ...context, readJsonBody: async () => ({ relationId: relation.id, expectedRevision: relation.revision, nativeSessionId: sessionA }) }), { code: 'codex_request_invalid' });
  await assert.rejects(() => http.handle({ ...context, request: { method: 'GET' }, suffix: '/codex/sessions', searchParams: new URLSearchParams('taskId=first-task&taskId=second-task') }), { code: 'codex_request_invalid' });
  assert.equal((await http.handle(context))?.status, 200); assert.equal(authorized, 2);
});
test('sessions CLI reverse lookup remains available after removal without modifying history', async t => {
  const f = fixture(t), connection = await f.connect(); f.link(connection.id); f.link(connection.id, 'second-task');
  f.active.clear(); f.application.disconnect(f.registration.id);
  const before = fs.readFileSync(f.sessionsFile, 'utf8'), command = createCodexDesktopCliContributions(f.application, root => { assert.equal(root, f.root); return workspaceId; }).find(c => c.key === 'codex sessions')!;
  let output = '';
  const stdout = t.mock.method(process.stdout, 'write', (chunk: unknown) => { output += String(chunk); return true; });
  try { await command.run(null, { argv: ['node', 'buildr', 'codex', 'sessions', '--target', f.root, '--native-session-id', sessionA, '--connection-id', connection.id, '--json'] }); }
  finally { stdout.mock.restore(); }
  assert.deepEqual(JSON.parse(output).relations.map((r: { taskId: string }) => r.taskId), ['first-task', 'second-task']);
  assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), before);
});
