import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';

const DRIVER = path.resolve(import.meta.dirname, '../../src/interfaces/internal/task-development-driver.mjs');

function fixture(t) {
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
  createRuntime().createTaskRecord(root, { taskId: 'profile-driver', title: 'Profile driver', intent: 'Measure internal stages.', projects: [], services: [], changes: [] });
  return root;
}

function run(root, profile = false) {
  const result = spawnSync(process.execPath, [DRIVER, 'inspect', '--task', 'profile-driver', '--target', root, ...(profile ? ['--profile'] : [])], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('Task Development driver profile为opt-in response evidence', (t) => {
  const root = fixture(t);
  const ordinary = run(root);
  assert.equal(ordinary.schemaVersion, 'buildr.task-development-operation-result/v1');
  assert.equal(ordinary.operation, 'inspect');

  const profiled = run(root, true);
  assert.equal(profiled.schemaVersion, 'buildr.task-development-driver-profile/v1');
  assert.equal(profiled.action, 'inspect');
  assert.equal(profiled.result.schemaVersion, 'buildr.task-development-operation-result/v1');
  assert.deepEqual(Object.keys(profiled.timing), ['moduleLoadMs', 'compositionMs', 'applicationMs', 'serializationMs', 'totalMs']);
  for (const value of Object.values(profiled.timing)) assert.equal(Number.isFinite(value) && value >= 0, true);
  assert.equal(profiled.timing.totalMs, profiled.timing.moduleLoadMs + profiled.timing.compositionMs + profiled.timing.applicationMs + profiled.timing.serializationMs);
  assert.equal(createRuntime().readTaskDevelopmentPersistence(root, 'profile-driver', { optional: true }), null);
});
