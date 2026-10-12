import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createCodexDesktopCliContributions } from '../../src/modules/codex-desktop/interfaces/cli/codex-desktop-cli.ts';
import { createCodexDesktopHttpContribution } from '../../src/modules/codex-desktop/interfaces/http/codex-desktop-http.ts';
import { codexFixture, seedLegacyRequests, workspaceId, sessionA } from '../helpers/codex-desktop-fixture.ts';

const retired = { code: 'codex_plugin_retired', status: 410 };
test('retired application calls preserve connections, old requests and durable relations byte for byte', async t => {
  const f = codexFixture(t), connection = await f.connect(); f.link(connection.id); seedLegacyRequests(f, connection.id);
  const connectionBytes = fs.readFileSync(f.connectionsFile, 'utf8'), relationBytes = fs.readFileSync(f.sessionsFile, 'utf8'), native = f.nativeSnapshot();
  for (const operation of ['connectorStarted', 'connectorStopped', 'createBinding', 'bindingReceipt', 'pendingBindings', 'completeBinding', 'createHandoff', 'handoffReceipt', 'acknowledgeHandoff'] as const) assert.throws(() => f.application[operation]({ workspaceId, connectionId: connection.id, nativeSessionId: sessionA }), retired);
  assert.throws(() => f.application.sessionRelations(workspaceId, { bindingRequestId: 'legacy-request' }), retired);
  assert.equal(fs.readFileSync(f.connectionsFile, 'utf8'), connectionBytes); assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), relationBytes); assert.deepEqual(f.nativeSnapshot(), native);
});
test('retired CLI entrypoints give 410 without opening a tool service and are absent from public help', async t => {
  const f = codexFixture(t), connection = await f.connect(); f.link(connection.id);
  const commands = createCodexDesktopCliContributions(f.application, () => workspaceId), before = fs.readFileSync(f.sessionsFile, 'utf8');
  assert.deepEqual(commands.map(c => c.key), ['codex connections', 'codex link', 'codex sessions', 'codex']);
  assert.doesNotMatch(commands[0].help.join('\n'), /codex serve|complete-binding|acknowledge-handoff/);
  for (const action of ['serve', 'complete-binding', 'acknowledge-handoff']) {
    const command = commands.find(c => c.match({ domain: 'codex', action })); assert.ok(command);
    await assert.rejects(() => command.run(null, { argv: ['node', 'buildr', 'codex', action] }), retired);
  }
  assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), before);
});
test('retired HTTP binding actions are explicit, authorized and write no requests', async t => {
  const f = codexFixture(t), connection = await f.connect(); f.link(connection.id); seedLegacyRequests(f, connection.id);
  const http = createCodexDesktopHttpContribution(f.application, () => workspaceId), before = fs.readFileSync(f.sessionsFile, 'utf8');
  let authorized = 0, bodies = 0;
  const context = { root: f.root, searchParams: new URLSearchParams(), authorizeWrite() { authorized++; }, async readJsonBody() { bodies++; return {}; } };
  for (const [method, suffix] of [['POST', '/codex/bindings'], ['GET', '/codex/bindings/legacy-request']]) await assert.rejects(() => http.handle({ ...context, request: { method }, suffix }), retired);
  await assert.rejects(() => http.handle({ ...context, request: { method: 'POST' }, suffix: '/codex/bindings', authorizeWrite() { throw Object.assign(new Error('denied'), { status: 403 }); } }), { status: 403 });
  assert.equal(authorized, 1); assert.equal(bodies, 0); assert.equal(fs.readFileSync(f.sessionsFile, 'utf8'), before);
});
test('distributed plugin resources, installation implementation and MCP service are absent', () => {
  for (const target of ['../../resources/codex-desktop/plugin.json', '../../resources/codex-desktop/panel.html', '../../resources/codex-desktop/skills/buildr-desktop/SKILL.md', '../../src/modules/codex-desktop/infrastructure/codex-plugin-installation.ts', '../../src/modules/codex-desktop/interfaces/mcp/codex-mcp-server.ts']) assert.equal(fs.existsSync(new URL(target, import.meta.url)), false, target);
});
