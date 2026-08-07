import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { TASK_ENVIRONMENT_RECEIPT_SCHEMA } from '../../src/domain/task-environment/task-environment.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-environment-repository-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'projects'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), [
    'schemaVersion: buildr.workspace/v1',
    'id: fixture-workspace',
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
    schemaVersion: 'buildr.task-record/v1', taskId: 'demo-task', title: 'Demo', intent: 'Verify Environment repository',
    scope: { projects: [], services: [] }, changes: [], status: 'active', result: null,
    createdAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z',
  });
  return fs.realpathSync(root);
}

function receipt(root, status = 'ready') {
  return {
    schemaVersion: TASK_ENVIRONMENT_RECEIPT_SCHEMA,
    taskId: 'demo-task',
    workspace: { id: 'fixture-workspace', root },
    controller: { sourceRoot: '/opt/buildr', cliSource: '/opt/buildr/bin/buildr.mjs', identity: 'sha256-controller', adapter: 'codex' },
    status,
    scopes: [{
      selector: 'workspace', kind: 'workspace', project: null, service: null, sourcePath: '.', executionRoot: root, validationRoot: root, shared: true, provider: null,
      runtime: { status: 'ready', identity: 'node', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
      cli: { status: 'ready', identity: 'cli', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
      dependencies: { status: 'not-applicable', identity: 'none', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
      projection: { status: 'ready', identity: 'projection', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
    }],
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
  assert.throws(() => runtime.writeTaskEnvironmentPersistence(root, { ...receipt(root), workspace: { id: 'fixture-workspace', root: '/tmp/other' } }), (error) => error.code === 'task_environment_workspace_mismatch');
  assert.equal(runtime.readTaskEnvironmentPersistence(root, 'demo-task', { optional: true }), null);
});

test('Environment repository 写入失败保留最后一份有效 current', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  runtime.writeTaskEnvironmentPersistence(root, receipt(root));
  assert.throws(() => runtime.writeTaskEnvironmentPersistence(root, { ...receipt(root), updatedAt: '2026-08-01T00:00:00.000Z' }), /updatedAt 不能早于 createdAt/);
  assert.equal(runtime.readTaskEnvironmentPersistence(root, 'demo-task').receipt.status, 'ready');
});

test('受控迁移把合法 v2 environment.json 导入 SQLite，并保留旧文件但不再读取它', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  const legacyFile = path.join(root, '.buildr', 'tasks', 'demo-task', 'environment.json');
  fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
  fs.writeFileSync(legacyFile, `${JSON.stringify(receipt(root), null, 2)}\n`);

  const planned = runtime.migrateTaskEnvironmentCurrentFiles(root, { apply: false });
  assert.equal(planned.status, 'planned');
  assert.deepEqual(planned.counts, { total: 1, importable: 1, alreadyCurrent: 0, inertLegacy: 0, D: 0 });
  const migrated = runtime.migrateTaskEnvironmentCurrentFiles(root, { apply: true });
  assert.equal(migrated.status, 'migrated');
  assert.equal(migrated.effects[0].locator, 'workspace-sqlite:task-environment/demo-task');
  assert.equal(fs.existsSync(legacyFile), true);
  assert.equal(runtime.inspectTaskEnvironment(root, 'demo-task').status, 'ready');

  runtime.writeTaskEnvironmentPersistence(root, { ...receipt(root), status: 'blocked' });
  const conflict = runtime.migrateTaskEnvironmentCurrentFiles(root, { apply: false });
  assert.equal(conflict.status, 'blocked');
  assert.equal(conflict.entries[0].classification, 'D');
  assert.equal(fs.existsSync(legacyFile), true);
});
