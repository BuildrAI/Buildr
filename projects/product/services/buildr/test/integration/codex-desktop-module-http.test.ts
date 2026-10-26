import '../register-development-entry.ts';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createRuntime, runtimeContributions, runtimeProvide } from '../helpers/runtime-harness.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { CODEX_DESKTOP_APPLICATION } from '../../src/modules/codex-desktop/module.ts';
import type { CodexDesktopApplication } from '../../src/modules/codex-desktop/application/codex-desktop-application.ts';
import { CODEX_DESKTOP_HTTP_SCHEMAS, CODEX_DESKTOP_HTTP_VALIDATORS } from '../../src/modules/codex-desktop/interfaces/http/codex-desktop-http-contracts.ts';
import { NATIVE_SESSION_LINKS_HTTP_SCHEMAS, NATIVE_SESSION_LINKS_HTTP_VALIDATORS } from '../../src/modules/native-session-links/interfaces/http/native-session-links-http-contracts.ts';
import { TASK_QUERY_APPLICATION } from '../../src/modules/task/module.ts';
import { WORKSPACE_APPLICATION, WORKSPACE_QUERY } from '../../src/modules/workspace/module.ts';
import { AGENT_OPERATIONS_APPLICATION, type AgentOperationsApplication } from '../../src/modules/agent-operations/module.ts';

test('Codex desktop production module composes registered Workspace/Task identities and HTTP relations', async t => {
  if (!process.env.BUILDR_SMOKE_ROOT) {
    const output = execFileSync(process.execPath, [path.resolve(import.meta.dirname, '../../tools/development/run-isolated-workspace-check.ts'), '--script', import.meta.filename], { encoding: 'utf8', timeout: 60_000 });
    assert.match(output, /"status":"passed"/); assert.match(output, /"cleanup":"cleaned"/); return;
  }
  const base = process.env.BUILDR_SMOKE_ROOT!, root = process.env.BUILDR_SMOKE_WORKSPACE_ROOT!;
  for (const directory of [root, process.env.BUILDR_APP_DATA_DIR!, process.env.BUILDR_PRODUCT_DATA_DIR!]) {
    assert.equal(path.isAbsolute(directory), true);
    assert.equal(path.relative(base, directory).startsWith('..'), false, 'All runtime state stays inside the runner boundary.');
  }
  const runtime = createRuntime();
  const log = console.log; console.log = () => {};
  try { runtime.initBuildr(['--target', root, '--name', 'Codex module HTTP', '--description', 'Isolated production composition fixture', '--profile', 'team']); }
  finally { console.log = log; }
  runtime.createTask(root, { taskId: 'codex-module-one', title: '原聊天关联', intent: '验证真实模块装配及关系', projects: [], services: [], changes: [] });
  runtime.createTask(root, { taskId: 'codex-module-two', title: '另一个任务', intent: '验证同聊天多个任务', projects: [], services: [], changes: [] });
  const desktop = runtimeProvide(runtime, CODEX_DESKTOP_APPLICATION) as CodexDesktopApplication;
  const operations = runtimeProvide(runtime, AGENT_OPERATIONS_APPLICATION) as AgentOperationsApplication;
  const workspace = runtimeProvide(runtime, WORKSPACE_APPLICATION), workspaceQuery = runtimeProvide(runtime, WORKSPACE_QUERY), taskQuery = runtimeProvide(runtime, TASK_QUERY_APPLICATION);
  const before = taskQuery.inspectTaskSummaryView(root, 'codex-module-one');
  assert.equal(before.record.taskId, 'codex-module-one');
  assert.match(before.recordDigest, /^sha256-[a-f0-9]{64}$/u);

  // The real HTTP router serves a controlled index; React behavior is verified separately.
  const staticRoot = path.join(base, 'http-static'); fs.mkdirSync(staticRoot);
  fs.writeFileSync(path.join(staticRoot, 'index.html'), '<!doctype html><html><body>codex-module-route<script>window.__token="__BUILDR_SESSION_TOKEN__";</script></body></html>\n');
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root, staticRoot });
  t.after(async () => { await instance.shutdown(); });
  const { url, initialWorkspaceId: workspaceId, sessionToken } = await instance.ready;
  assert.equal(workspaceQuery.getWorkspace(root).workspace.id, workspaceId);
  assert.equal(workspace.resolveRegisteredWorkspace(workspaceId, { touch: false }).workspace.workspace.id, workspaceId);
  const endpoint = `${url}/api/v1/workspaces/${workspaceId}`;
  const headers = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const get = async (suffix: string) => { const response = await fetch(endpoint + suffix); return { status: response.status, body: await response.json() as any }; };
  const post = async (suffix: string, body: unknown, selectedHeaders = headers) => { const response = await fetch(endpoint + suffix, { method: 'POST', headers: selectedHeaders, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() as any }; };
  const validate = (name: keyof typeof CODEX_DESKTOP_HTTP_SCHEMAS, value: unknown) => {
    const result = CODEX_DESKTOP_HTTP_VALIDATORS.validate(CODEX_DESKTOP_HTTP_SCHEMAS[name].$id, value);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  };

  for (const target of [`/workspaces/${workspaceId}/codex`, `/workspaces/${workspaceId}/tasks/codex-module-one`, `/workspaces/${workspaceId}/tasks/codex-module-one/document?project=fixture&file=brief.md`]) {
    const response = await fetch(url + target);
    assert.equal(response.status, 200, target);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/u);
    const body = await response.text(); assert.match(body, /codex-module-route/u); assert.equal(body.includes('__BUILDR_SESSION_TOKEN__'), false);
  }

  const home = path.join(base, 'fixture-codex-home'), appPath = path.join(base, 'FixtureChatGPT.app'), executable = path.join(base, 'fixture-codex');
  fs.mkdirSync(home); fs.mkdirSync(appPath);
  const called = path.join(home, 'unexpected-execution');
  fs.writeFileSync(executable, `#!${process.execPath}\nconst a=process.argv.slice(2);if(a[0]==='--version'){console.log('codex-cli 0.162.0');}else if(a[0]==='app-server'&&a[1]==='--help'){console.log('app-server --listen stdio://');}else{require('node:fs').writeFileSync(${JSON.stringify(called)},'unexpected model or plugin execution');process.exit(77);}\n`, { mode: 0o755 });
  const preserved = new Map(['config.toml', 'memory.md', 'chat.jsonl'].map(file => {
    const content = `isolated existing ${file}\n`; fs.writeFileSync(path.join(home, file), content); return [file, content];
  }));
  const registered = operations.registerCodex({ executable, codexHome: home, label: 'Fixture desktop', expectedRevision: operations.listRegistry().revision });
  const agentId = registered.defaultAgentId!;
  // The maintenance field is accepted by the production HTTP schema, while
  // changing the default is rejected before discovery or desktop preparation.
  const maintenanceInput = {candidateId: 'fixture-not-probed', expectedDiscoveryRevision: 'fixture-not-probed', expectedRevision: registered.revision, existingAgentId: agentId, makeDefault: true};
  const maintenanceResponse = await fetch(url + '/api/v1/app/agents/codex/connect', {method: 'POST', headers, body: JSON.stringify(maintenanceInput)});
  assert.equal(maintenanceResponse.status, 400);
  assert.match((await maintenanceResponse.json() as any).error.message, /已有连接维护不能改变默认项/u);
  const invalidMaintenance = await fetch(url + '/api/v1/app/agents/codex/connect', {method: 'POST', headers, body: JSON.stringify({...maintenanceInput, existingAgentId: 1, makeDefault: false})});
  assert.equal(invalidMaintenance.status, 400);
  const unauthorizedMaintenance = await fetch(url + '/api/v1/app/agents/codex/connect', {method: 'POST', headers: {...headers, 'x-buildr-session': 'invalid'}, body: JSON.stringify({...maintenanceInput, makeDefault: false})});
  assert.equal(unauthorizedMaintenance.status, 403);
  assert.equal(operations.listRegistry().revision, registered.revision);
  assert.equal(fs.existsSync(called), false);
  const connection = await desktop.connect({ id: agentId, kind: 'codex', label: 'Fixture desktop', executable, codexHome: home, version: '0.162.0' }, { appPath, appVersion: 'fixture' });
  assert.equal(connection.status, 'configured'); // Scope confirmation must not install a plugin.
  assert.equal(fs.existsSync(called), false);
  const connectionsResponse = await fetch(url + '/api/v1/app/codex/connections');
  assert.equal(connectionsResponse.status, 200);
  const connections = await connectionsResponse.json() as any; validate('connections', connections); assert.equal(connections.connections[0].id, connection.id);

  const denied = await post('/codex/bindings', { connectionId: connection.id, taskId: 'codex-module-one' }, { origin: url, 'content-type': 'application/json', 'x-buildr-session': 'invalid' });
  assert.equal(denied.status, 403);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'local', 'codex-desktop-sessions.json')), false);
  const nativeOne = crypto.randomUUID(), nativeTwo = crypto.randomUUID();
  const linkCommand = runtimeContributions(runtime, 'cli').find((command: { key: string }) => command.key === 'codex link');
  assert.ok(linkCommand);
  const linkArgs = ['node', 'buildr', 'codex', 'link', '--target', root, '--task', 'codex-module-one', '--native-session-id', nativeOne, '--json'];
  let cliOutput = '';
  const stdout = t.mock.method(process.stdout, 'write', (chunk: unknown) => { cliOutput += String(chunk); return true; });
  try {
    await linkCommand.run(runtime, { argv: linkArgs });
  } finally { stdout.mock.restore(); }
  const linked = JSON.parse(cliOutput);
  assert.equal(linked.relation.nativeSessionId, nativeOne);
  assert.equal(linked.relation.workspaceId, workspaceId);
  assert.equal(linked.sessionUrl, `codex://threads/${nativeOne}`);
  assert.equal(linked.taskUrl, `/workspaces/${workspaceId}/codex#/tasks/codex-module-one`);
  assert.equal(taskQuery.inspectTaskSummaryView(root, 'codex-module-one').recordDigest, before.recordDigest);
  const copiedRoot = path.join(base, 'unregistered-copy'); fs.cpSync(root, copiedRoot, { recursive: true });
  assert.equal(workspaceQuery.getWorkspace(copiedRoot).workspace.id, workspaceId);
  const relationsFile = path.join(root, '.buildr', 'local', 'codex-desktop-sessions.json'), relationBytes = fs.readFileSync(relationsFile, 'utf8');
  await assert.rejects(() => linkCommand.run(runtime, { argv: linkArgs.map(value => value === root ? copiedRoot : value) }), { code: 'codex_workspace_target_changed' });
  assert.equal(fs.readFileSync(relationsFile, 'utf8'), relationBytes);
  assert.equal(fs.readFileSync(path.join(copiedRoot, '.buildr', 'local', 'codex-desktop-sessions.json'), 'utf8'), relationBytes);
  assert.equal(fs.existsSync(called), false, 'Linking never invokes a model or installs a plugin.');
  desktop.linkSession(workspaceId, { connectionId: connection.id, taskId: 'codex-module-one', nativeSessionId: nativeTwo });
  desktop.linkSession(workspaceId, { connectionId: connection.id, taskId: 'codex-module-two', nativeSessionId: nativeOne });
  assert.equal(desktop.linkSession(workspaceId, { connectionId: connection.id, taskId: 'codex-module-one', nativeSessionId: nativeOne }).alreadyLinked, true);
  const byTask = await get('/codex/sessions?taskId=codex-module-one');
  assert.equal(byTask.status, 200); validate('sessions', byTask.body); assert.equal(byTask.body.workspaceId, workspaceId); assert.equal(byTask.body.relations.length, 2);
  assert.deepEqual(new Set(byTask.body.relations.map((relation: any) => relation.nativeSessionId)), new Set([nativeOne, nativeTwo]));
  for (const relation of byTask.body.relations) {
    assert.equal(relation.taskUrl, `/workspaces/${workspaceId}/codex#/tasks/codex-module-one`);
    assert.equal(relation.sessionUrl, `codex://threads/${relation.nativeSessionId}`);
  }
  const bySession = await get(`/codex/sessions?connectionId=${connection.id}&nativeSessionId=${nativeOne}`);
  assert.equal(bySession.status, 200); assert.deepEqual(new Set(bySession.body.relations.map((relation: any) => relation.taskId)), new Set(['codex-module-one', 'codex-module-two']));
  const unified = await get('/agent-sessions?taskId=codex-module-one');
  assert.equal(unified.status, 200);
  assert.equal(NATIVE_SESSION_LINKS_HTTP_VALIDATORS.validate(NATIVE_SESSION_LINKS_HTTP_SCHEMAS.sessions.$id, unified.body).valid, true);
  assert.deepEqual(unified.body.diagnostics, []);
  assert.deepEqual(unified.body.relations.map(({ provider, ...relation }: any) => { assert.equal(provider, 'codex'); return relation; }), byTask.body.relations);
  assert.deepEqual((await get('/agent-sessions?provider=dsh')).body.relations, []);
  const unifiedRelation = unified.body.relations[0];
  assert.equal((await post('/agent-sessions/unlink', { provider: 'codex', relationId: unifiedRelation.id, expectedRevision: 'stale' })).status, 409);
  assert.equal((await post('/agent-sessions/open', { provider: 'dsh', relationId: crypto.randomUUID(), expectedRevision: 'stale' })).status, 404);
  assert.equal((await get('/codex/sessions?root=/etc')).status, 400);
  assert.equal((await get('/codex/sessions?taskId=codex-module-one&taskId=codex-module-two')).status, 400);

  const sessionsCommand = runtimeContributions(runtime, 'cli').find((command: { key: string }) => command.key === 'codex sessions');
  assert.ok(sessionsCommand);
  let sessionsOutput = '';
  const queryOutput = t.mock.method(process.stdout, 'write', (chunk: unknown) => { sessionsOutput += String(chunk); return true; });
  try { await sessionsCommand.run(runtime, { argv: ['node', 'buildr', 'codex', 'sessions', '--target', root, '--native-session-id', nativeOne, '--json'] }); }
  finally { queryOutput.mock.restore(); }
  assert.deepEqual(new Set(JSON.parse(sessionsOutput).relations.map((r: any) => r.taskId)), new Set(['codex-module-one', 'codex-module-two']));
  assert.equal(taskQuery.inspectTaskSummaryView(root, 'codex-module-one').recordDigest, before.recordDigest);

  const relation = byTask.body.relations[0];
  assert.equal((await post('/codex/sessions/unlink', { relationId: relation.id, expectedRevision: 'sha256-' + '0'.repeat(64) })).status, 409);
  const removed = await post('/codex/sessions/unlink', { relationId: relation.id, expectedRevision: relation.revision });
  assert.equal(removed.status, 200); validate('sessions', removed.body); assert.equal(removed.body.relations.length, 2);
  assert.equal(taskQuery.inspectTaskSummaryView(root, 'codex-module-one').recordDigest, before.recordDigest);
  const retainedRelations = desktop.sessionRelations(workspaceId);
  const remove = async (body: unknown, selectedHeaders = headers) => {
    const response = await fetch(url + '/api/v1/app/agents/codex/remove', { method: 'POST', headers: selectedHeaders, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  const observedRegistry = operations.listRegistry();
  assert.equal((await remove({ agentId, expectedRevision: observedRegistry.revision }, { ...headers, 'x-buildr-session': 'invalid' })).status, 403);
  assert.equal((await remove({ agentId, expectedRevision: observedRegistry.revision, root: '/etc' })).status, 400);
  assert.equal((await remove({ agentId, expectedRevision: 'sha256-' + '0'.repeat(64) })).status, 409);
  assert.equal(operations.hasCodexRegistration(agentId), true);
  const removal = await remove({ agentId, expectedRevision: observedRegistry.revision });
  assert.equal(removal.status, 200, JSON.stringify(removal.body));
  assert.equal(removal.body.removedAgentId, agentId);
  assert.equal(removal.body.registry.defaultAgentId, null);
  assert.equal(removal.body.registry.agents.some((entry: { id: string }) => entry.id === agentId), false);
  assert.equal(operations.hasCodexRegistration(agentId), false);
  assert.equal(desktop.listConnections().connections[0].status, 'disconnected');
  assert.deepEqual(desktop.sessionRelations(workspaceId), retainedRelations);
  assert.throws(() => desktop.linkSession(workspaceId, { connectionId: connection.id, taskId: 'codex-module-one', nativeSessionId: nativeOne }), { code: 'codex_connection_disconnected' });
  assert.equal(taskQuery.inspectTaskSummaryView(root, 'codex-module-one').recordDigest, before.recordDigest);
  for (const [file, content] of preserved) assert.equal(fs.readFileSync(path.join(home, file), 'utf8'), content);
  const reRegistered = operations.registerCodex({ executable, codexHome: home, label: 'Fixture desktop', expectedRevision: operations.listRegistry().revision });
  assert.notEqual(reRegistered.defaultAgentId, agentId);
  const reconnected = await desktop.connect({ id: reRegistered.defaultAgentId!, kind: 'codex', label: 'Fixture desktop', executable, codexHome: home, version: '0.162.0' }, { appPath, appVersion: 'fixture' });
  assert.equal(reconnected.id, connection.id, 'Explicit same-scope reconnection preserves the desktop relation identity.');
  assert.deepEqual(desktop.sessionRelations(workspaceId), retainedRelations);
  assert.equal(fs.existsSync(called), false, 'Only the isolated CLI version/help fixture ran; no model or desktop-plugin execution occurred.');
});
