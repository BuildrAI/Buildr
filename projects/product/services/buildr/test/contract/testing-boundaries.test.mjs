import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { inspectTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.mjs';
import { verificationSteps } from '../verification/registry.mjs';
import { SYSTEM_SUITES, validateSystemSuiteRegistry } from '../verification/system-suites.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contractRoot = path.join(productRoot, 'test', 'contract');
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
  'project-product.test.mjs',
  'public-json-contracts.test.mjs',
  'service-product.test.mjs',
  'task-finish-product-journey.test.mjs',
  'workspace-manifest-registry.test.mjs',
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

test('Quick Contract 只保留只读静态契约并拒绝可变环境测试', () => {
  const forbiddenImports = /from\s+['"]node:(?:child_process|cluster|dgram|http|http2|https|net|tls|worker_threads)['"]/u;
  const mutatingFilesystem = /\bfs\.(?:appendFileSync|cpSync|mkdirSync|mkdtempSync|renameSync|rmSync|unlinkSync|writeFileSync)\s*\(/u;
  for (const file of fs.readdirSync(contractRoot).filter((name) => name.endsWith('.test.mjs') && name !== 'testing-boundaries.test.mjs')) {
    const source = fs.readFileSync(path.join(contractRoot, file), 'utf8');
    assert.doesNotMatch(source, forbiddenImports, `${file} must move real process/network boundaries to Integration`);
    assert.doesNotMatch(source, mutatingFilesystem, `${file} must move mutable filesystem fixtures to Integration`);
  }

  const contract = verificationSteps.find((step) => step.id === 'contract');
  assert.equal(contract.testing.executionBoundary, 'Static');
  assert.deepEqual(contract.testing.environment, { footprints: ['filesystem'], isolation: 'read-only' });
  assert.equal(contract.testing.resetBurden, 'none');
});

test('Quick registry membership 由环境足迹与重置负担约束', () => {
  const quick = verificationSteps.filter((step) => step.profiles.includes('fast'));
  for (const step of quick) {
    assert.notEqual(step.testing.environment.isolation, 'shared', step.id);
    assert.equal(['repeated-cleanup', 'lifecycle'].includes(step.testing.resetBurden), false, step.id);
  }
  const runtimeAdapter = verificationSteps.find((step) => step.id === 'runtime-adapter-contract');
  assert.equal(runtimeAdapter.profiles.includes('fast'), false);
  assert.deepEqual(runtimeAdapter.testing.environment.footprints, ['filesystem']);
  assert.equal(runtimeAdapter.testing.resetBurden, 'repeated-cleanup');
});

test('Candidate 的网络协议仅使用本机回环 fixture', () => {
  const candidate = verificationSteps.filter((step) => step.profiles.includes('candidate'));
  for (const step of candidate) {
    assert.equal(step.testing.environment.footprints.includes('network'), false, step.id);
  }
  const remoteSkill = verificationSteps.find((step) => step.id === 'remote-skill-timeout');
  assert.deepEqual(remoteSkill.testing.environment.footprints, ['loopback-network']);
  const source = fs.readFileSync(path.join(productRoot, remoteSkill.executor.file), 'utf8');
  assert.match(source, /http:\/\/127\.0\.0\.1:/);
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
  assert.match(runner, /--test-reporter-destination=stdout/);
  assert.match(runner, /system-file-timing-reporter\.mjs/);
  assert.match(runner, /--test-reporter-destination=stderr/,
    'file timing must remain transient process diagnostics instead of portable Verification Result data');
  assert.match(runner, /validateSystemSuiteRegistry\(discovered\)/,
    'the System runner must fail closed when a file has no primary owner');
  assert.match(runner, /--owner/,
    'Candidate must be able to schedule one bounded System owner');
  const systemFiles = fs.readdirSync(path.join(productRoot, 'test', 'system'))
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => `test/system/${name}`).sort();
  const registry = validateSystemSuiteRegistry(systemFiles);
  assert.equal(registry.ok, true, JSON.stringify(registry.findings));
  assert.equal(new Set(SYSTEM_SUITES.flatMap((suite) => suite.files)).size, systemFiles.length);
  assert.equal(fs.existsSync(path.join(productRoot, 'test', 'system', 'workspace-product.test.mjs')), false);
  for (const owner of ['system-verification-admission', 'system-verification-contracts', 'system-workspace-lifecycle', 'system-runtime-recovery', 'system-local-app-http', 'system-app-process', 'system-task-finish', 'system-fresh-build']) {
    assert.ok(SYSTEM_SUITES.some((suite) => suite.id === owner), `missing System owner ${owner}`);
  }
  assert.equal(SYSTEM_SUITES.find((suite) => suite.id === 'system-runtime-recovery')?.innerConcurrency, 1,
    'runtime recovery copies and replaces a full local distribution on Windows and must remain sequential');
  const workspaceSuite = fs.readFileSync(path.join(productRoot, 'test', 'helpers', 'workspace-product-suite.mjs'), 'utf8');
  assert.match(workspaceSuite, /BUILDR_NODE_RUNTIME_SOURCE_ROOT: windowsRuntimeSource/,
    'Windows runtime recovery must reuse the verified local distribution instead of depending on public network');

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
