import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { createBuildrApplicationTest } from '../context/buildr-node-test.mjs';

const test = createBuildrApplicationTest('integration-task-development-driver-profile');

const DRIVER = path.resolve(import.meta.dirname, '../../src/task/interfaces/internal/task-development-driver.mjs');

function fixture(t, runtime) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-development-profile-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Profile fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1
id: 123e4567-e89b-42d3-a456-426614174001
name: Profile fixture
description: Task Development profile fixture
runtime:
  node:
    version: ${process.versions.node}
`);
  runtime.createTaskRecord(root, { taskId: 'profile-driver', title: 'Profile driver', intent: 'Measure internal stages.', projects: [], services: [], changes: [] });
  return root;
}

function run(root, flags = [], expectedStatus = 0) {
  const result = spawnSync(process.execPath, [DRIVER, 'inspect', '--task', 'profile-driver', '--target', root, ...flags], { encoding: 'utf8' });
  assert.equal(result.status, expectedStatus, result.stderr);
  if (expectedStatus !== 0) return JSON.parse(result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('Task Development driver profile为opt-in response evidence', (t) => {
  const runtime = t.buildrContexts.application;
  const root = fixture(t, runtime);
  const ordinary = run(root);
  assert.equal(ordinary.schemaVersion, 'buildr.task-development-operation-result/v1');
  assert.equal(ordinary.operation, 'inspect');

  const profiled = run(root, ['--profile']);
  assert.equal(profiled.schemaVersion, 'buildr.task-development-driver-profile/v1');
  assert.equal(profiled.action, 'inspect');
  assert.equal(profiled.result.schemaVersion, 'buildr.task-development-operation-result/v1');
  assert.deepEqual(Object.keys(profiled.timing), ['moduleLoadMs', 'compositionMs', 'applicationMs', 'serializationMs', 'totalMs']);
  for (const value of Object.values(profiled.timing)) assert.equal(Number.isFinite(value) && value >= 0, true);
  assert.equal(profiled.timing.totalMs, profiled.timing.moduleLoadMs + profiled.timing.compositionMs + profiled.timing.applicationMs + profiled.timing.serializationMs);
  assert.equal(runtime.readTaskDevelopmentPersistence(root, 'profile-driver', { optional: true }), null);

  const compact = run(root, ['--compact']);
  assert.equal(compact.schemaVersion, 'buildr.task-development-driver-compact/v1');
  assert.equal(compact.operation, 'inspect');
  assert.equal(compact.current, null);
  assert.match(compact.nextActions[0], /begin/);
  assert.equal(Object.hasOwn(compact, 'development'), false);

  const ambiguous = run(root, ['--compact', '--profile'], 2);
  assert.equal(ambiguous.diagnostic.code, 'task_development_driver_usage_invalid');
  assert.match(ambiguous.diagnostic.message, /不能同时使用/);
  assert.equal(runtime.readTaskDevelopmentPersistence(root, 'profile-driver', { optional: true }), null);
});
