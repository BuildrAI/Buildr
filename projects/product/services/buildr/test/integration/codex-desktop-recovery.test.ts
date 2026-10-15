import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { codexFixture, seedLegacyRequests, workspaceId } from '../helpers/codex-desktop-fixture.ts';

for (const status of ['pending', 'awaiting-desktop', 'ready', 'unavailable'] as const) {
  test(`legacy ${status} projects current configuration without plugin liveness checks or writes`, async t => {
    const f = codexFixture(t), connection = await f.connect(); f.link(connection.id); seedLegacyRequests(f, connection.id);
    f.repository.mutateConnections(state => Object.assign(state.connections[0], { status, pluginVersion: '1.0.1', pluginEntryIdentity: 'sha256-' + 'f'.repeat(64), connectorPid: process.pid, lastSeenAt: new Date().toISOString(), safeReason: '旧扩展等待加载' }));
    const leaseFile = path.join(f.dataRoot, 'codex-desktop/connector-leases.json'); fs.writeFileSync(leaseFile, 'old damaged lease state');
    const connectionBytes = fs.readFileSync(f.connectionsFile, 'utf8'), history = fs.readFileSync(f.sessionsFile, 'utf8'), native = f.nativeSnapshot();
    const view = f.application.listConnections().connections[0];
    assert.equal(view.status, 'configured'); assert.equal(view.safeReason, null); assert.equal('pluginVersion' in view, false); assert.equal('lastSeenAt' in view, false);
    assert.equal(fs.readFileSync(f.connectionsFile, 'utf8'), connectionBytes);
    const maintained = await f.connect(); assert.equal(maintained.id, connection.id); assert.equal(maintained.agentId, connection.agentId);
    assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), history); assert.deepEqual(f.nativeSnapshot(), native); assert.equal(fs.readFileSync(leaseFile, 'utf8'), 'old damaged lease state');
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(f.connectionsFile, 'utf8')).connections[0]).sort(), Object.keys(JSON.parse(connectionBytes).connections[0]).sort());
  });
}
test('same-path configuration replacement rejects the old scope without retargeting existing relations', async t => {
  const f = codexFixture(t), original = await f.connect(); f.link(original.id);
  const history = fs.readFileSync(f.sessionsFile, 'utf8'); fs.renameSync(f.home, path.join(f.base, 'previous-home')); fs.mkdirSync(f.home);
  assert.equal(f.application.listConnections().connections[0].status, 'unavailable');
  assert.throws(() => f.link(original.id), { code: 'codex_connection_scope_changed' });
  const next = await f.connect(); assert.notEqual(next.id, original.id);
  assert.equal(f.application.sessionRelations(workspaceId).relations[0].connectionId, original.id); assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), history);
});
test('missing installation is unavailable, preserves stable registration and cannot create a new relation', async t => {
  const f = codexFixture(t), connection = await f.connect(); f.link(connection.id); const history = fs.readFileSync(f.sessionsFile, 'utf8');
  fs.renameSync(f.appPath, path.join(f.base, 'previous-app'));
  assert.equal(f.application.listConnections().connections[0].status, 'unavailable'); assert.throws(() => f.link(connection.id), { code: 'codex_connection_scope_changed' });
  assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), history);
});
for (const change of [ (state: any) => { state.relations[0].revision = 'invalid'; }, (state: any) => { state.bindings[0].status = 'invalid'; }, (state: any) => { state.relations.push(state.relations[0]); } ]) {
  test('damaged local history is retained and fails only local relation operations', async t => {
    const f = codexFixture(t), connection = await f.connect(); f.link(connection.id); seedLegacyRequests(f, connection.id);
    const state = JSON.parse(fs.readFileSync(f.sessionsFile, 'utf8')); change(state); fs.writeFileSync(f.sessionsFile, JSON.stringify(state)); const before = fs.readFileSync(f.sessionsFile, 'utf8');
    assert.throws(() => f.application.sessionRelations(workspaceId), { code: 'codex_local_state_invalid' }); assert.throws(() => f.link(connection.id), { code: 'codex_local_state_invalid' });
    assert.equal(f.application.listConnections().connections[0].status, 'configured'); assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), before);
  });
}
