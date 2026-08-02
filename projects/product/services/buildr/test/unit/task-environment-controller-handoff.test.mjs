import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { registerTaskEnvironmentApplication } from '../../src/application/task-environment/task-environment-application.mjs';

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-controller-handoff-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const controllerRoot = path.join(root, 'projects', 'product', 'services', 'buildr');
  fs.mkdirSync(path.join(controllerRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(controllerRoot, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(controllerRoot, 'package'), { recursive: true });
  fs.writeFileSync(path.join(controllerRoot, 'src', 'controller.mjs'), 'export const controller = true;\n');
  fs.writeFileSync(path.join(controllerRoot, 'bin', 'buildr.mjs'), '#!/usr/bin/env node\n');
  fs.writeFileSync(path.join(controllerRoot, 'package.json'), '{"name":"fixture"}\n');
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.name', 'Buildr Test']);
  git(root, ['config', 'user.email', 'buildr-test@example.com']);
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'baseline']);
  const head = git(root, ['rev-parse', 'HEAD']);
  const timestamp = new Date().toISOString();
  let receipt = {
    schemaVersion: 'buildr.task-environment-receipt/v2',
    taskId: 'controller-handoff',
    workspace: { id: 'workspace-fixture', root },
    controller: { sourceRoot: controllerRoot, cliSource: path.join(controllerRoot, 'bin', 'buildr.mjs'), identity: 'sha256-stale', adapter: 'codex' },
    status: 'ready',
    scopes: [{
      selector: 'workspace', kind: 'workspace', project: null, service: null, sourcePath: '.', executionRoot: root, validationRoot: root, shared: true, provider: null,
      runtime: { status: 'ready', identity: 'runtime', observedAt: timestamp, diagnostic: null },
      cli: { status: 'ready', identity: 'cli', observedAt: timestamp, diagnostic: null },
      dependencies: { status: 'ready', identity: 'dependencies', observedAt: timestamp, diagnostic: null },
      projection: { status: 'ready', identity: 'projection', observedAt: timestamp, diagnostic: null },
    }],
    resources: [],
    latest: { ready: { status: 'ready', observedAt: timestamp, diagnostic: null }, cleanup: null },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const runtime = {
    productRoot: () => controllerRoot,
    assertCanonicalTaskWorkspace: () => root,
    readTaskRecordPersistence: () => ({ record: { taskId: 'controller-handoff', status: 'active' } }),
    readTaskEnvironmentPersistence: () => ({ root, directory: root, file: path.join(root, 'environment.json'), receipt }),
    writeTaskEnvironmentPersistence: (_target, value) => {
      receipt = structuredClone(value);
      return { root, directory: root, file: path.join(root, 'environment.json'), receipt };
    },
  };
  registerTaskEnvironmentApplication(runtime);
  return { root, controllerRoot, head, runtime, receipt: () => receipt };
}

test('Finish 已交付 commit 仍在 retained 历史中时可以确定性接管升级后的 controller identity', async (t) => {
  const current = fixture(t);
  fs.writeFileSync(path.join(current.root, 'README.md'), 'retained target advanced\n');
  git(current.root, ['add', 'README.md']);
  git(current.root, ['commit', '-m', 'advance retained target']);
  const result = await current.runtime.cleanupTaskEnvironment(current.root, 'controller-handoff', {
    type: 'finish', deliveries: { workspace: 'dev' }, candidateRef: current.head,
  });
  assert.equal(result.status, 'cleaned', JSON.stringify(result, null, 2));
  assert.equal(current.receipt().status, 'cleaned');
  assert.notEqual(current.receipt().controller.identity, 'sha256-stale');
  assert.deepEqual(result.effects.map((effect) => effect.type), ['controller-handoff', 'shared-scope-retained', 'receipt-finalized']);
  assert.equal(result.effects[0].candidateRef, current.head);
});

test('不能证明 candidate 位于 retained 历史或 controller source dirty 时继续拒绝接管', async (t) => {
  await t.test('candidate ref 不匹配', async (subtest) => {
    const current = fixture(subtest);
    const result = await current.runtime.cleanupTaskEnvironment(current.root, 'controller-handoff', {
      type: 'finish', deliveries: { workspace: 'dev' }, candidateRef: '0'.repeat(40),
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostic.code, 'task_environment_controller_drift');
    assert.equal(current.receipt().controller.identity, 'sha256-stale');
  });
  await t.test('controller source 有未交付修改', async (subtest) => {
    const current = fixture(subtest);
    fs.appendFileSync(path.join(current.controllerRoot, 'src', 'controller.mjs'), 'export const dirty = true;\n');
    const result = await current.runtime.cleanupTaskEnvironment(current.root, 'controller-handoff', {
      type: 'finish', deliveries: { workspace: 'dev' }, candidateRef: current.head,
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostic.code, 'task_environment_controller_drift');
    assert.equal(current.receipt().controller.identity, 'sha256-stale');
  });
});
