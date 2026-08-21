import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { TASK_ENVIRONMENT_RECEIPT_SCHEMA } from '../../src/domain/task-environment/task-environment.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-environment-repository-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), [
    'schemaVersion: buildr.workspace/v1',
    'id: 22222222-2222-4222-8222-222222222222',
    'name: Fixture',
    'description: Fixture Workspace',
    'runtime:',
    '  node:',
    `    version: ${process.versions.node}`,
    'kind: organization',
    'profile: team',
    '',
  ].join('\n'));
  createRuntime().createTaskRecordPersistence(root, {
    schemaVersion: 'buildr.task-record/v2', taskId: 'demo-task', title: 'Demo', intent: 'Verify Environment repository',
    scope: { projects: [], services: [] }, changes: [], parentTaskId: null, childTaskIds: [], retrospectiveSourceTaskIds: [], status: 'active', result: null,
    createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z',
  });
  return fs.realpathSync(root);
}

function receipt(root, status = 'ready') {
  const controllerRoot = path.resolve('opt', 'buildr');
  return {
    schemaVersion: TASK_ENVIRONMENT_RECEIPT_SCHEMA,
    taskId: 'demo-task',
    workspace: { id: '22222222-2222-4222-8222-222222222222', root },
    controller: { sourceRoot: controllerRoot, cliSource: path.join(controllerRoot, 'bin', 'buildr.mjs'), identity: 'sha256-controller', adapter: 'codex' },
    runtimeInvocation: { kind: 'node', executable: process.execPath, version: process.version, identity: 'sha256-runtime', searchPrefix: path.dirname(process.execPath), source: 'stable-controller' },
    status,
    scopes: [{
      selector: 'workspace', kind: 'workspace', project: null, service: null, sourcePath: '.', executionRoot: root, validationRoot: root, shared: true, provider: null,
      runtime: { status: 'ready', identity: 'node', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
      cli: { status: 'ready', identity: 'cli', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
      preparation: { status: 'not-applicable', identity: null, observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
      projection: { status: 'ready', identity: 'projection', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
    }],
    preparationPlan: null,
    preparationDeclarations: [],
    preparationScopes: [],
    preparationRecipes: [],
    preparationSteps: [],
    resources: [],
    latest: { ready: { status: 'ready', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null }, cleanup: null },
    createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z',
  };
}

test('Environment repository 只替换 SQLite current row，不创建 environment.json', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  const written = runtime.writeTaskEnvironmentPersistence(root, receipt(root));
  assert.equal(written.file, 'workspace-sqlite:task-environment/demo-task');
  assert.equal(written.receipt.status, 'ready');
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'tasks', 'demo-task', 'environment.json')), false);
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
  const row = opened.database.prepare('SELECT status, receipt_json, updated_at FROM task_environment_current WHERE task_id = ?').get('demo-task');
  assert.equal(row.status, 'ready');
  assert.equal(JSON.parse(row.receipt_json).taskId, 'demo-task');
  assert.equal(row.updated_at, '2026-08-02T00:00:00.000Z');
  opened.database.close();
  assert.equal(runtime.readTaskEnvironmentPersistence(root, 'demo-task').receipt.status, 'ready');
});

test('Environment repository 要求正式 Task、canonical Workspace 和匹配 identity', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  assert.throws(() => runtime.writeTaskEnvironmentPersistence(root, { ...receipt(root), taskId: 'missing-task' }), (error) => error.code === 'task_record_not_found');
  assert.throws(() => runtime.writeTaskEnvironmentPersistence(root, { ...receipt(root), workspace: { id: 'fixture-workspace', root: path.resolve('other') } }), (error) => error.code === 'task_environment_workspace_mismatch');
  assert.equal(runtime.readTaskEnvironmentPersistence(root, 'demo-task', { optional: true }), null);
});

test('Environment repository 写入失败保留最后一份有效 current', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  runtime.writeTaskEnvironmentPersistence(root, receipt(root));
  assert.throws(() => runtime.writeTaskEnvironmentPersistence(root, { ...receipt(root), updatedAt: '2026-08-01T00:00:00.000Z' }), /updatedAt 不能早于 createdAt/);
  assert.equal(runtime.readTaskEnvironmentPersistence(root, 'demo-task').receipt.status, 'ready');
});

test('cleanup context 只读取保存的 ownership facts，不要求执行 foundations ready', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  const blocked = receipt(root, 'blocked');
  blocked.scopes[0].projection = { status: 'blocked', identity: 'projection', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: 'Runtime projection is stale.' };
  blocked.latest.ready = { status: 'blocked', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: 'Runtime projection is stale.' };
  runtime.writeTaskEnvironmentPersistence(root, blocked);

  const context = runtime.resolveTaskEnvironmentCleanupContext(root, 'demo-task');
  assert.equal(context.ready, true);
  assert.equal(context.workspaceRoot, root);
  assert.equal(context.environmentRoot, root);
  assert.equal(context.controllerInvocation.sourceRoot, path.resolve('opt', 'buildr'));
  assert.deepEqual(context.repositories, []);
});
