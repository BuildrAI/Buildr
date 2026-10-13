import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NativeSessionLinksApplication } from '../../src/modules/native-session-links/application/native-session-links-application.ts';
import { createNativeSessionLinksHttpContribution } from '../../src/modules/native-session-links/interfaces/http/native-session-links-http.ts';
import { createDshSessionLinksCliContributions } from '../../src/modules/native-session-links/interfaces/cli/dsh-session-links-cli.ts';
import { NATIVE_SESSION_LINKS_HTTP_SCHEMAS, NATIVE_SESSION_LINKS_HTTP_VALIDATORS } from '../../src/modules/native-session-links/interfaces/http/native-session-links-http-contracts.ts';
import { codexFixture, seedLegacyRequests, workspaceId, sessionA, sessionB } from '../helpers/codex-desktop-fixture.ts';

function fixture(t: test.TestContext) {
  const codex = codexFixture(t), application = new NativeSessionLinksApplication(codex.dependencies);
  application.bindCodexDesktop(codex.application);
  const connectionId = 'dsh-fixture-connection', opened: { connectionId: string; nativeSessionId: string }[] = [], openedTasks: { connectionId: string; nativeSessionId: string; taskUrl: string }[] = [];
  let active = true, wrongReceipt = false;
  const assertActive = () => { if (!active) throw Object.assign(new Error('DSH 接入已移除。'), { code: 'dsh_connection_disconnected', status: 409 }); };
  application.bindDshDesktop({
    resolveLinkConnection(id) { assertActive(); assert.ok(id === undefined || id === connectionId); return { id: connectionId, label: 'DSH' }; },
    assertConnectionActive(id) { assert.equal(id, connectionId); assertActive(); },
    async openSession(id, nativeSessionId) { assertActive(); opened.push({ connectionId: id, nativeSessionId }); return { opened: true, nativeSessionId: wrongReceipt ? 'another-session' : nativeSessionId }; },
    async openTask(id, nativeSessionId, taskUrl) { assertActive(); openedTasks.push({ connectionId: id, nativeSessionId, taskUrl }); return { opened: true, nativeSessionId }; },
  });
  const link = (taskId = 'first-task', nativeSessionId = sessionA) => application.linkDshSession(workspaceId, { taskId, nativeSessionId });
  return { ...codex, links: application, linkDsh: link, dshFile: path.join(codex.root, '.buildr/local/dsh-desktop-sessions.json'), opened, openedTasks, disconnect: () => { active = false; }, wrongReceipt: () => { wrongReceipt = true; } };
}

test('mixed provider many-to-many preserves original Codex bytes, retained fields and relation revisions', async t => {
  const f = fixture(t), connection = await f.connect(), nativeBefore = f.nativeSnapshot();
  seedLegacyRequests(f, connection.id);
  const original = f.link(connection.id).relation, bytes = fs.readFileSync(f.sessionsFile, 'utf8');
  const dsh = f.linkDsh().relation;
  assert.equal(f.linkDsh().alreadyLinked, true);
  f.linkDsh('second-task'); f.linkDsh('first-task', 'session-legacy-native-id');
  const all = f.links.sessionRelations(workspaceId, { taskId: 'first-task' });
  assert.equal(all.relations.length, 3);
  assert.deepEqual(all.diagnostics, []);
  const old = all.relations.find(r => r.provider === 'codex')!;
  assert.equal(old.id, original.id); assert.equal(old.revision, original.revision);
  assert.equal(old.sessionUrl, `codex://threads/${sessionA}`);
  assert.equal(old.taskUrl, `/workspaces/${workspaceId}/codex#/tasks/first-task`);
  assert.equal(dsh.sessionUrl, null);
  assert.equal(dsh.taskUrl, `/workspaces/${workspaceId}/tasks/first-task`);
  assert.equal(dsh.nativeSessionId, old.nativeSessionId, 'Provider distinguishes equal native identifiers.');
  assert.equal(f.links.dshSessionRelations(workspaceId, { nativeSessionId: sessionA }).relations.length, 2);
  const legacyReverse = f.links.sessionRelations(workspaceId, { nativeSessionId: 'session-legacy-native-id' });
  assert.deepEqual(legacyReverse.diagnostics, []);
  assert.deepEqual(legacyReverse.relations.map(r => [r.provider, r.nativeSessionId]), [['dsh', 'session-legacy-native-id']]);
  assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), bytes);
  assert.throws(() => f.links.unlinkSession(workspaceId, { provider: 'dsh', relationId: dsh.id, expectedRevision: 'stale' }), { code: 'dsh_relation_changed' });
  assert.throws(() => f.links.unlinkSession(workspaceId, { provider: 'dsh', relationId: old.id, expectedRevision: old.revision }), { code: 'dsh_relation_missing' });
  f.links.unlinkSession(workspaceId, { provider: 'dsh', relationId: dsh.id, expectedRevision: dsh.revision });
  assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), bytes);
  const state = JSON.parse(fs.readFileSync(f.dshFile, 'utf8'));
  assert.equal(state.schemaVersion, 'buildr.dsh-workspace-sessions/v1');
  assert.equal(state.relations.length, 2);
  assert.deepEqual(f.nativeSnapshot(), nativeBefore);
});

test('DSH relation reads do not require an active desktop and unlink preserves tasks after removal', t => {
  const f = fixture(t), relation = f.linkDsh().relation, task = structuredClone([...f.tasks]);
  f.disconnect();
  assert.equal(f.links.dshSessionRelations(workspaceId).relations[0].id, relation.id);
  assert.throws(() => f.linkDsh('second-task'), { code: 'dsh_connection_disconnected' });
  f.links.unlinkSession(workspaceId, { provider: 'dsh', relationId: relation.id, expectedRevision: relation.revision });
  assert.deepEqual(f.links.dshSessionRelations(workspaceId).relations, []);
  assert.deepEqual([...f.tasks], task);
  assert.deepEqual(f.opened, []);
});

test('open uses the observed relation and exact configured connection, rejects stale or wrong receipts', async t => {
  const f = fixture(t), relation = f.linkDsh().relation;
  const action = { provider: 'dsh' as const, relationId: relation.id, expectedRevision: relation.revision };
  await assert.rejects(() => f.links.openSession(workspaceId, { ...action, expectedRevision: 'stale' }), { code: 'dsh_relation_changed' });
  assert.deepEqual(f.opened, []);
  const result = await f.links.openSession(workspaceId, action);
  assert.deepEqual(result, { provider: 'dsh', opened: true, nativeSessionId: sessionA });
  assert.deepEqual(f.opened, [{ connectionId: relation.connectionId, nativeSessionId: sessionA }]);
  f.wrongReceipt();
  await assert.rejects(() => f.links.openSession(workspaceId, action), { code: 'dsh_session_open_unconfirmed' });
  f.disconnect();
  await assert.rejects(() => f.links.openSession(workspaceId, action), { code: 'dsh_connection_disconnected' });
  assert.equal(f.opened.length, 2);
});

test('corrupt DSH state returns local diagnostics and leaves Codex query and unlink available', async t => {
  const f = fixture(t), connection = await f.connect(), relation = f.link(connection.id).relation;
  fs.writeFileSync(f.dshFile, '{"invalid":true}\n');
  const view = f.links.sessionRelations(workspaceId, { taskId: 'first-task' });
  assert.deepEqual(view.relations.map(r => r.provider), ['codex']);
  assert.deepEqual(view.diagnostics.map(d => [d.provider, d.code]), [['dsh', 'dsh_local_state_invalid']]);
  const after = f.links.unlinkSession(workspaceId, { provider: 'codex', relationId: relation.id, expectedRevision: relation.revision });
  assert.equal(after.relations.length, 0); assert.equal(after.diagnostics.length, 1);
  assert.equal(fs.readFileSync(f.dshFile, 'utf8'), '{"invalid":true}\n');
});

test('DSH relationship storage refuses symlink directories and malformed native identities without outside writes', t => {
  const f = fixture(t), outside = path.join(f.base, 'outside'); fs.mkdirSync(outside);
  fs.mkdirSync(path.join(f.root, '.buildr'));
  fs.symlinkSync(outside, path.join(f.root, '.buildr/local'));
  assert.throws(() => f.linkDsh(), { code: 'dsh_storage_scope_invalid' });
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.throws(() => f.linkDsh('first-task', ''), { code: 'dsh_native_session_invalid' });
  assert.throws(() => f.linkDsh('first-task', 'native\nother'), { code: 'dsh_native_session_invalid' });
});

test('DSH CLI explicitly captures native identity and never consumes inherited session or desktop focus', async t => {
  const f = fixture(t), commands = createDshSessionLinksCliContributions(f.links, root => { assert.equal(root, f.root); return workspaceId; });
  const link = commands.find(c => c.key === 'dsh link')!, sessions = commands.find(c => c.key === 'dsh sessions')!;
  const inherited = process.env.DSH_SESSION_ID; process.env.DSH_SESSION_ID = sessionB;
  try {
    await assert.rejects(() => link.run(null, { argv: ['node', 'buildr', 'dsh', 'link', '--target', f.root, '--task', 'first-task'] }), { code: 'dsh_cli_invalid' });
    await assert.rejects(() => link.run(null, { argv: ['node', 'buildr', 'dsh', 'link', '--target', f.root, '--task', 'first-task', '--native-session-id', sessionA, '--task', 'second-task'] }), { code: 'dsh_cli_invalid' });
    let output = ''; const write = t.mock.method(process.stdout, 'write', (chunk: unknown) => { output += String(chunk); return true; });
    try {
      await link.run(null, { argv: ['node', 'buildr', 'dsh', 'link', '--target', f.root, '--task', 'first-task', '--native-session-id', sessionA, '--json'] });
      assert.equal(JSON.parse(output).relation.nativeSessionId, sessionA); output = '';
      await sessions.run(null, { argv: ['node', 'buildr', 'dsh', 'sessions', '--target', f.root, '--native-session-id', sessionA, '--json'] });
      assert.deepEqual(JSON.parse(output).relations.map((r: { nativeSessionId: string }) => r.nativeSessionId), [sessionA]);
    } finally { write.mock.restore(); }
    assert.deepEqual(f.links.dshSessionRelations(workspaceId, { nativeSessionId: sessionB }).relations, []);
  } finally { if (inherited === undefined) delete process.env.DSH_SESSION_ID; else process.env.DSH_SESSION_ID = inherited; }
});

test('unified HTTP contracts authorize mutations, reject extra identities and keep provider failures explicit', async t => {
  const f = fixture(t), relation = f.linkDsh().relation, http = createNativeSessionLinksHttpContribution(f.links, () => workspaceId);
  let authorized = 0;
  const context = { request: { method: 'POST' }, suffix: '/agent-sessions/open', searchParams: new URLSearchParams(), root: f.root, authorizeWrite() { authorized++; }, readJsonBody: async () => ({ provider: 'dsh', relationId: relation.id, expectedRevision: relation.revision }) };
  await assert.rejects(() => http.handle({ ...context, authorizeWrite() { throw Object.assign(new Error('denied'), { code: 'denied' }); } }), { code: 'denied' });
  await assert.rejects(() => http.handle({ ...context, readJsonBody: async () => ({ provider: 'dsh', relationId: relation.id, expectedRevision: relation.revision, nativeSessionId: sessionB }) }), { code: 'native_session_request_invalid' });
  await assert.rejects(() => http.handle({ ...context, request: { method: 'GET' }, suffix: '/agent-sessions', searchParams: new URLSearchParams('taskId=first-task&taskId=second-task') }), { code: 'native_session_request_invalid' });
  assert.deepEqual(f.opened, []);
  const opened = await http.handle(context); assert.equal(opened?.status, 200);
  assert.equal(NATIVE_SESSION_LINKS_HTTP_VALIDATORS.validate(NATIVE_SESSION_LINKS_HTTP_SCHEMAS.open.$id, opened?.body).valid, true);
  const listed = await http.handle({ ...context, request: { method: 'GET' }, suffix: '/agent-sessions', searchParams: new URLSearchParams('taskId=first-task') });
  assert.equal(NATIVE_SESSION_LINKS_HTTP_VALIDATORS.validate(NATIVE_SESSION_LINKS_HTTP_SCHEMAS.sessions.$id, listed?.body).valid, true);
  assert.equal(authorized, 2);
});

test('DSH chat-to-task navigation derives the current-channel URL from an exact existing relation', async t => {
  const f = fixture(t), input = { taskId: 'first-task', nativeSessionId: sessionA };
  await assert.rejects(() => f.links.openDshTask(workspaceId, input), { code: 'dsh_relation_missing' });
  assert.deepEqual(f.openedTasks, []);
  const relation = f.linkDsh().relation, bytes = fs.readFileSync(f.dshFile, 'utf8');
  const command = createDshSessionLinksCliContributions(f.links, () => workspaceId).find(c => c.key === 'dsh open-task')!;
  await assert.rejects(() => command.run(null, { argv: ['node', 'buildr', 'dsh', 'open-task', 'first-task', '--target', f.root, '--native-session-id', sessionA, '--url', 'https://external.test'] }), { code: 'dsh_cli_invalid' });
  let result: unknown; const output = t.mock.method(process.stdout, 'write', () => true);
  try { result = await command.run(null, { argv: ['node', 'buildr', 'dsh', 'open-task', 'first-task', '--target', f.root, '--native-session-id', sessionA, '--json'] }); }
  finally { output.mock.restore(); }
  assert.deepEqual(result, { opened: true, nativeSessionId: sessionA, provider: 'dsh', taskUrl: `/workspaces/${workspaceId}/tasks/first-task`, taskHref: `http://127.0.0.1:12345/workspaces/${workspaceId}/tasks/first-task` });
  assert.deepEqual(f.openedTasks, [{ connectionId: relation.connectionId, nativeSessionId: sessionA, taskUrl: `http://127.0.0.1:12345/workspaces/${workspaceId}/tasks/first-task` }]);
  assert.equal(fs.readFileSync(f.dshFile, 'utf8'), bytes);
  f.disconnect();
  await assert.rejects(() => f.links.openDshTask(workspaceId, input), { code: 'dsh_connection_disconnected' });
  assert.equal(f.openedTasks.length, 1);
});
