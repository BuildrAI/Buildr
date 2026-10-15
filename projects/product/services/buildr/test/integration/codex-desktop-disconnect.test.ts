import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { CodexDesktopApplication } from '../../src/modules/codex-desktop/application/codex-desktop-application.ts';
import { codexFixture, seedLegacyRequests, workspaceId, sessionA } from '../helpers/codex-desktop-fixture.ts';

test('removing a Codex registration preserves chats, old requests and relations; explicit same-scope reconnect reuses identity', async t => {
  const f = codexFixture(t), connection = await f.connect(); f.link(connection.id); seedLegacyRequests(f, connection.id);
  const otherApp = path.join(f.base, 'OtherChatGPT.app'); fs.mkdirSync(otherApp);
  await f.application.connect(f.registration, { appPath: otherApp, appVersion: 'fixture' });
  const history = fs.readFileSync(f.sessionsFile, 'utf8'), native = f.nativeSnapshot();
  f.active.clear(); f.application.disconnect(f.registration.id);
  assert.equal(f.application.listConnections().connections.every(c => c.status === 'disconnected'), true);
  assert.throws(() => f.link(connection.id), { code: 'codex_connection_disconnected' });
  await assert.rejects(f.connect(), { code: 'codex_connection_disconnected' });
  assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), history); assert.deepEqual(f.nativeSnapshot(), native);
  const renewed = { ...f.registration, id: 'agent-' + crypto.randomUUID() }; f.active.add(renewed.id);
  const restored = await f.application.connect(renewed, { appPath: f.appPath, appVersion: 'fixture' });
  assert.equal(restored.id, connection.id); assert.equal(restored.agentId, renewed.id); assert.equal(restored.status, 'configured');
  assert.equal(f.application.sessionRelations(workspaceId).relations[0].sessionUrl, `codex://threads/${sessionA}`);
  assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), history); assert.deepEqual(f.nativeSnapshot(), native);
});
test('registration absence disables linking even when disconnect persistence is locked; existing relations remain readable and removable', async t => {
  const f = codexFixture(t), connection = await f.connect(); const relation = f.link(connection.id).relation;
  const before = fs.readFileSync(f.connectionsFile, 'utf8'), history = fs.readFileSync(f.sessionsFile, 'utf8'); f.active.clear();
  const lock = f.connectionsFile + '.lock'; fs.writeFileSync(lock, JSON.stringify({ schemaVersion: 'buildr.exclusive-file-lock/v1', pid: process.pid, token: '0'.repeat(32), createdAt: new Date().toISOString(), target: f.connectionsFile }));
  try {
    assert.throws(() => f.application.disconnect(f.registration.id), { code: 'codex_local_state_busy' });
    for (const app of [f.application, new CodexDesktopApplication(f.dependencies)]) {
      assert.equal(app.listConnections().connections[0].status, 'disconnected');
      assert.throws(() => app.linkSession(workspaceId, { connectionId: connection.id, taskId: 'first-task', nativeSessionId: sessionA }), { code: 'codex_connection_disconnected' });
    }
    assert.equal(fs.readFileSync(f.connectionsFile, 'utf8'), before); assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), history);
  } finally { fs.rmSync(lock, { force: true }); }
  f.application.unlinkSession(workspaceId, { relationId: relation.id, expectedRevision: relation.revision });
  assert.deepEqual(f.application.sessionRelations(workspaceId).relations, []);
});
