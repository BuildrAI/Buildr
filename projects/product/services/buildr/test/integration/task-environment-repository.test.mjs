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
  fs.mkdirSync(path.join(root, '.buildr', 'tasks', 'demo-task'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# fixture\n');
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

test('Environment repository 只原子替换 environment.json 并保留 Task sibling files', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  const taskDirectory = path.join(root, '.buildr', 'tasks', 'demo-task');
  const reviewsDirectory = path.join(taskDirectory, 'reviews');
  fs.mkdirSync(reviewsDirectory);
  const siblings = new Map([
    [path.join(taskDirectory, 'review.yml'), 'owner: user-defined-sibling\n'],
    [path.join(reviewsDirectory, 'planning.yml'), 'slot: planning\n'],
    [path.join(reviewsDirectory, 'completion.yml'), 'slot: completion\n'],
  ]);
  for (const [file, content] of siblings) fs.writeFileSync(file, content);
  const written = runtime.writeTaskEnvironmentPersistence(root, receipt(root));
  assert.equal(written.file, path.join(root, '.buildr', 'tasks', 'demo-task', 'environment.json'));
  assert.equal(written.receipt.status, 'ready');
  for (const [file, content] of siblings) assert.equal(fs.readFileSync(file, 'utf8'), content);

  const original = fs.readFileSync(written.file, 'utf8');
  const atomicWriteJson = runtime.atomicWriteJson;
  runtime.atomicWriteJson = () => { throw new Error('injected atomic failure'); };
  assert.throws(() => runtime.writeTaskEnvironmentPersistence(root, { ...receipt(root), status: 'blocked', latest: { ready: { status: 'blocked', observedAt: '2026-08-02T00:01:00.000Z', diagnostic: 'blocked' }, cleanup: null }, updatedAt: '2026-08-02T00:01:00.000Z' }), /injected atomic failure/);
  runtime.atomicWriteJson = atomicWriteJson;
  assert.equal(fs.readFileSync(written.file, 'utf8'), original);
  for (const [file, content] of siblings) assert.equal(fs.readFileSync(file, 'utf8'), content);
});

test('Environment repository 要求正式 Task、canonical Workspace 和匹配 identity', (t) => {
  const root = fixture(t);
  const runtime = createRuntime();
  assert.throws(() => runtime.writeTaskEnvironmentPersistence(root, { ...receipt(root), taskId: 'missing-task' }), (error) => error.code === 'task_record_not_found');
  assert.throws(() => runtime.writeTaskEnvironmentPersistence(root, { ...receipt(root), workspace: { id: 'fixture-workspace', root: '/tmp/other' } }), (error) => error.code === 'task_environment_workspace_mismatch');
  assert.equal(runtime.readTaskEnvironmentPersistence(root, 'demo-task', { optional: true }), null);
});
