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
  assert.equal(payload.workspaceNode.actualVersion, process.versions.node);
  assert.equal(payload.workspaceNode.identity.version, process.versions.node);
  assert.match(payload.workspaceNode.identity.digest, /^sha256-/);
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

test('verification runner 用 Workspace Node 替换 argv 中的 PATH Node', (t) => {
  const root = fixture(t);
  const fakeBin = path.join(root, 'fake-bin');
  const fakeNode = path.join(fakeBin, 'node');
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(fakeNode, '#!/bin/sh\necho 18.20.0\nexit 18\n');
  fs.chmodSync(fakeNode, 0o755);
  const projectRoot = path.join(root, 'projects', 'demo');
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v2', resources: [],
    capabilities: [declaredCapability('demo.node', 'void 0', {
      invocation: { kind: 'command', argv: [fakeNode, '-e', 'if (process.versions.node !== process.env.BUILDR_WORKSPACE_NODE_VERSION) process.exit(9)'], cwd: '.' },
    })],
  }));
  const result = runBuildr(runArgs(root, ['demo.node']));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.checks[0].exitCode, 0);
  assert.equal(payload.workspaceNode.identity.version, process.versions.node);
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
  assert.match(JSON.parse(result.stdout).error.message, /Explicit authorization is required/);

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
  assert.match(payload.error.message, /task verification inspect\|record/);
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
