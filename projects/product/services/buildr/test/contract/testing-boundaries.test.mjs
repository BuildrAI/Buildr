import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { inspectTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const forbiddenNodeBoundaries = new Set([
  'child_process', 'cluster', 'dgram', 'fs', 'http', 'http2', 'https', 'net', 'tls', 'worker_threads',
]);
const taskLifecycleContextConsumers = [
  'task-review-product.test.mjs',
  'task-verification-product.test.mjs',
  'verification-run-cli.test.mjs',
];
const taskRecordContextConsumers = [
  'task-record-product.test.mjs',
  'task-record-change-resolver.test.mjs',
  'task-record-local-app.test.mjs',
];
const fullIsolationOwners = [
  'install-buildr-cli-runtime.test.mjs',
  'project-product.test.mjs',
  'public-json-contracts.test.mjs',
  'service-product.test.mjs',
  'task-environment-migration.test.mjs',
  'task-finish-product-journey.test.mjs',
  'workspace-product.test.mjs',
  'worktree-create.test.mjs',
];

function directBoundaryImports(layer) {
  const directory = path.join(productRoot, 'test', layer);
  const violations = [];
  for (const file of fs.readdirSync(directory).filter((entry) => entry.endsWith('.test.mjs')).sort()) {
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)['"]node:([^/'"]+)/g)) {
      if (forbiddenNodeBoundaries.has(match[1])) violations.push(`${layer}/${file}: node:${match[1]}`);
    }
  }
  return violations;
}

test('Unit 与 Component 不直接穿过真实进程、网络或文件系统边界', () => {
  assert.deepEqual(directBoundaryImports('unit'), []);
  assert.deepEqual(directBoundaryImports('component'), []);
});

test('Task lifecycle System context 只共享不可变基线并保留全生命周期测试的独立 owner', () => {
  const helper = fs.readFileSync(path.join(productRoot, 'test', 'helpers', 'task-lifecycle-system-context.mjs'), 'utf8');
  const runner = fs.readFileSync(path.join(productRoot, 'test', 'verification', 'system.mjs'), 'utf8');
  assert.match(helper, /TASK_LIFECYCLE_CONTEXT_ID = 'task-lifecycle\/v1'/);
  assert.match(helper, /if \(provided\) return inspectTaskLifecycleSystemContext\(provided\)/, 'an invalid suite context must not fall back to a local context');
  assert.match(helper, /fs\.cpSync\(context\.workspaceRoot, root, \{ recursive: true \}\)/, 'test cases must receive copied sandboxes');
  assert.match(helper, /actualIdentity !== marker\.identity/, 'shared baseline must be identity checked');
  assert.match(helper, /runtime\.initBuildr/);
  assert.match(helper, /runtime\.createProject/);
  assert.match(helper, /runtime\.createService/);
  assert.doesNotMatch(helper, /spawnSync/, 'fixture-only setup must not pay public CLI cold starts');
  assert.match(runner, /prepareTaskLifecycleSystemContext/);
  assert.match(runner, /\[TASK_LIFECYCLE_CONTEXT_ENV\]: context\.contextRoot/);
  assert.match(runner, /finally \{[\s\S]*context\.cleanup\(\)/);
  assert.match(runner, /--test-reporter=dot/, 'successful System output must stay compact while dot reporter retains failure details');
  assert.match(runner, /const startFirst = \[[\s\S]*worktree-create\.test\.mjs[\s\S]*task-record-product\.test\.mjs/,
    'the bounded System runner must start known long owners before alphabetic tail scheduling');
  assert.match(runner, /startRank\.get\(left\)[\s\S]*left\.localeCompare\(right\)/,
    'start-first ordering must retain deterministic alphabetic fallback');
  assert.match(runner, /Unknown start-first System owner/,
    'a stale start-first owner must fail closed instead of silently losing the intended ordering');

  for (const file of taskLifecycleContextConsumers) {
    const source = fs.readFileSync(path.join(productRoot, 'test', 'system', file), 'utf8');
    assert.match(source, /copyTaskLifecycleWorkspace/, `${file} must consume the shared immutable context through its helper`);
  }
  const taskRecordFixture = fs.readFileSync(path.join(productRoot, 'test', 'helpers', 'task-record-system-fixture.mjs'), 'utf8');
  assert.match(taskRecordFixture, /copyTaskLifecycleWorkspace/, 'split Task Record owners must share one fixture helper');
  for (const file of taskRecordContextConsumers) {
    const source = fs.readFileSync(path.join(productRoot, 'test', 'system', file), 'utf8');
    assert.match(source, /task-record-system-fixture\.mjs/, `${file} must not duplicate Task Record baseline setup`);
  }
  for (const file of fullIsolationOwners) {
    const source = fs.readFileSync(path.join(productRoot, 'test', 'system', file), 'utf8');
    assert.doesNotMatch(source, /copyTaskLifecycleWorkspace/, `${file} validates initialization or a full lifecycle and must remain isolated`);
  }

  assert.throws(
    () => inspectTaskLifecycleSystemContext(path.join(productRoot, 'test', '.missing-task-lifecycle-context')),
    (error) => error.code === 'system_test_context_root_invalid',
    'a missing suite context must fail with a stable context diagnostic',
  );
});
