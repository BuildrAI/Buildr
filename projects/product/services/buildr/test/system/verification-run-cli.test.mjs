import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';
import YAML from 'yaml';

import { cleanupLocalTaskLifecycleSystemContext, copyTaskLifecycleWorkspace } from '../helpers/task-lifecycle-system-context.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');

function runBuildr(args) {
  return spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
}

after(() => cleanupLocalTaskLifecycleSystemContext());

function fixture(t) {
  return copyTaskLifecycleWorkspace(t, 'verification-run-cli').root;
}

function declaredCapability(id, script, overrides = {}) {
  return {
    id,
    title: id,
    scope: { project: 'demo', services: [] },
    invocation: { kind: 'command', argv: [process.execPath, '-e', script], cwd: '.' },
    applicability: { paths: ['**'], conditions: [] },
    proves: [id],
    requiredForDelivery: true,
    environment: { requires: ['node'] },
    effects: { writes: [], externalSystems: [], authorization: 'implicit' },
    resourceClaims: [],
    ...overrides,
  };
}

function runArgs(root, capabilities) {
  return ['verification', 'run', '--project', 'demo', ...capabilities.flatMap((id) => ['--capability', id]), '--target-identity', 'target:demo', '--target', root, '--json'];
}

test('verification run help将retry限定为同invocation独立执行', () => {
  const result = runBuildr(['verification', 'run', '--help']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /active或terminal record/);
  assert.match(result.stdout, /只有显式--retry创建同invocation的独立run\/record/);
  assert.match(result.stdout, /identity输入变化仍创建首次执行/);
});

test('verification run 并发执行显式 v2 capabilities 并只产生 transient execution evidence', (t) => {
  const root = fixture(t);
  const projectRoot = path.join(root, 'projects', 'demo');
  const declaration = {
    schemaVersion: 'buildr.project-verification/v2',
    resources: [],
    capabilities: [
      declaredCapability('demo.first', 'setTimeout(() => {}, 40)'),
      declaredCapability('demo.second', 'setTimeout(() => {}, 40)'),
    ],
  };
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify(declaration));
  const result = runBuildr(runArgs(root, ['demo.first', 'demo.second']));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, 'buildr.verification-execution/v1');
  assert.equal(payload.status, 'passed');
  assert.equal(payload.target.identity, 'target:demo');
  assert.equal(Object.hasOwn(payload, 'workspaceNode'), false);
  assert.match(payload.executionIdentity, /^sha256-/);
  assert.deepEqual(payload.evidenceLifecycle, {
    schemaVersion: 'buildr.verification-evidence-lifecycle/v1',
    runId: payload.runId,
    evidenceRetention: 'transient',
    cleanupAfter: 'all-consumers-complete',
    cleanupStatus: 'retained',
    cleanupReference: path.dirname(payload.evidenceReference),
    summaryPath: payload.evidenceReference,
  });
  assert.equal(payload.checks.length, 2);
  const [first, second] = payload.checks;
  assert.equal(Object.hasOwn(first, 'stdout'), false);
  assert.equal(Object.hasOwn(first, 'stderr'), false);
  assert.equal(first.failureSummary, null);
  assert.ok(Date.parse(first.startedAt) < Date.parse(second.finishedAt) && Date.parse(second.startedAt) < Date.parse(first.finishedAt));
  assert.equal(JSON.parse(fs.readFileSync(payload.evidenceReference, 'utf8')).executionIdentity, payload.executionIdentity);
  const cleanup = runBuildr(['verification', 'cleanup', '--summary', payload.evidenceReference, '--json']);
  assert.equal(cleanup.status, 0, cleanup.stderr || cleanup.stdout);
  assert.equal(JSON.parse(cleanup.stdout).code, 'cleanup.removed');
  assert.equal(fs.existsSync(payload.evidenceLifecycle.cleanupReference), false);
  const repeated = runBuildr(['verification', 'cleanup', '--summary', payload.evidenceReference, '--json']);
  assert.equal(repeated.status, 0, repeated.stderr || repeated.stdout);
  assert.equal(JSON.parse(repeated.stdout).code, 'cleanup.already_absent');
});

test('verification runner 直接执行声明中的 executable，不做 Workspace Node 替换', (t) => {
  const root = fixture(t);
  const fakeBin = path.join(root, 'fake-bin');
  const fakeNode = path.join(fakeBin, 'node');
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(fakeNode, '#!/bin/sh\nexit 18\n');
  fs.chmodSync(fakeNode, 0o755);
  const projectRoot = path.join(root, 'projects', 'demo');
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v2', resources: [],
    capabilities: [declaredCapability('demo.node', 'void 0', {
      invocation: { kind: 'command', argv: [fakeNode], cwd: '.' },
    })],
  }));
  const result = runBuildr(runArgs(root, ['demo.node']));
  assert.notEqual(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'failed');
  assert.equal(payload.checks[0].exitCode, 18);
  assert.deepEqual(payload.checks[0].failureSummary, {
    code: 'verification.capability_failed',
    message: 'Capability demo.node failed with exit code 18.',
  });
  assert.equal(Object.hasOwn(payload, 'workspaceNode'), false);
});

test('verification run公共JSON不回传capability原始输出', (t) => {
  const root = fixture(t);
  const projectRoot = path.join(root, 'projects', 'demo');
  const marker = 'verification-public-output-must-not-leak';
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v2', resources: [],
    capabilities: [declaredCapability('demo.output', `process.stdout.write(${JSON.stringify(marker.repeat(4096))}); process.stderr.write(${JSON.stringify(marker)}); process.exit(7)`)],
  }));
  const result = runBuildr(runArgs(root, ['demo.output']));
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'failed');
  assert.equal(Object.hasOwn(payload.checks[0], 'stdout'), false);
  assert.equal(Object.hasOwn(payload.checks[0], 'stderr'), false);
  assert.equal(JSON.stringify(payload).includes(marker), false);
  assert.equal(payload.checks[0].failureSummary.code, 'verification.capability_failed');
  assert.ok(result.stdout.length < 20_000);
});

test('verification run 对 explicit capability effects 要求精确授权', (t) => {
  const root = fixture(t);
  const projectRoot = path.join(root, 'projects', 'demo');
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v2', resources: [],
    capabilities: [declaredCapability('demo.explicit', 'void 0', {
      effects: { writes: ['approved-output'], externalSystems: [], authorization: 'explicit' },
    })],
  }));
  let result = runBuildr(runArgs(root, ['demo.explicit']));
  assert.equal(result.status, 2);
  const blocked = JSON.parse(result.stdout);
  assert.match(blocked.error.message, /Explicit authorization is required/);
  assert.deepEqual(blocked.admission.gaps.map((gap) => [gap.category, gap.owner, gap.recoverable]), [['authorization', 'user-authorization', false]]);
  assert.equal(blocked.admission.recovery, null);

  const args = runArgs(root, ['demo.explicit']);
  args.splice(-1, 0, '--authorize-capability', 'demo.explicit');
  result = runBuildr(args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout).authorization, { capabilities: ['demo.explicit'], resources: [] });
});

test('verification run 不再提供 caller-managed evidence writer', (t) => {
  const root = fixture(t);
  const projectRoot = path.join(root, 'projects', 'demo');
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v2', resources: [], capabilities: [declaredCapability('demo.only', 'void 0')],
  }));
  const output = path.join(root, 'verification-summary.json');
  const args = runArgs(root, ['demo.only']);
  args.splice(-1, 0, '--output', output);
  const run = runBuildr(args);
  assert.equal(run.status, 2);
  assert.match(JSON.parse(run.stdout).error.message, /Unknown argument: --output/);
  assert.equal(fs.existsSync(output), false);
});

test('verification run rejects declaration-root before starting a capability', (t) => {
  const root = fixture(t);
  const projectRoot = path.join(root, 'projects', 'demo');
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v2', resources: [], capabilities: [declaredCapability('demo.only', 'require("fs").writeFileSync("started.txt", "no")')],
  }));
  const args = runArgs(root, ['demo.only']);
  args.splice(-1, 0, '--declaration-root', root);
  const result = runBuildr(args);
  assert.equal(result.status, 2);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.error.code, 'verification.run_declaration_root_unsupported');
  assert.match(payload.error.message, /task verification record/);
  assert.equal(fs.existsSync(path.join(projectRoot, 'started.txt')), false);
});

test('verification run reports target drift separately from a passed capability', (t) => {
  const root = fixture(t);
  const projectRoot = path.join(root, 'projects', 'demo');
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v2', resources: [], capabilities: [declaredCapability('demo.drift', 'require("fs").writeFileSync("drift.txt", "changed")')],
  }));
  const result = runBuildr(runArgs(root, ['demo.drift']));
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'failed');
  assert.equal(payload.target.stable, false);
  assert.equal(payload.checks[0].status, 'passed');
  assert.deepEqual(payload.target.drift.addedPaths, ['projects/demo/drift.txt']);
  assert.deepEqual(payload.target.drift.removedPaths, []);
});

test('verification run 对无 capability/target 的请求返回单一 JSON envelope', (t) => {
  const root = fixture(t);
  const result = runBuildr(['verification', 'run', '--project', 'demo', '--target', root, '--json']);
  assert.equal(result.status, 2);
  assert.equal(result.stderr, '');
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, 'buildr.verification-execution/v1');
  assert.equal(payload.status, 'failed');
  assert.equal(payload.error.code, 'verification.invalid_request');
});
