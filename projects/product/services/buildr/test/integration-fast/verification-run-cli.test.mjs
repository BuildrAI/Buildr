import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');

function runBuildr(args) {
  return spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(runBuildr(['init', '--target', root, '--name', 'Verification', '--description', 'Verification fixture']).status, 0);
  const created = runBuildr(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Demo verification']);
  assert.equal(created.status, 0, created.stderr);
  return root;
}

function declaredCapability(id, script, overrides = {}) {
  return {
    id,
    title: id,
    command: { argv: [process.execPath, '-e', script], cwd: '.' },
    maturity: 'stable',
    stages: ['candidate'],
    enforcement: { candidate: 'required' },
    applicability: { paths: ['**'], risks: [] },
    coverage: { kind: 'test', owns: [id] },
    environment: { requires: ['node'], services: [] },
    effects: { level: 'local-temporary', writes: [], externalSystems: false },
    authorization: 'implicit',
    resourceClaims: [],
    dependsOn: [],
    supersedes: [],
    sources: ['verification-run-cli.test.mjs'],
    ...overrides,
  };
}

test('verification run executes Project Candidate concurrently and emits identity-bound JSON', (t) => {
  const root = fixture(t);
  const projectRoot = path.join(root, 'projects', 'demo');
  const declaration = {
    schemaVersion: 'buildr.project-verification/v1',
    mode: 'authoritative',
    resources: [{ id: 'task-temp', title: 'Task temp', strategy: 'isolated', cleanup: 'provider-owned', authorization: 'implicit' }],
    capabilities: [
      declaredCapability('demo.first', 'setTimeout(() => {}, 40)', { resourceClaims: ['task-temp'] }),
      declaredCapability('demo.second', 'setTimeout(() => {}, 40)', { resourceClaims: ['task-temp'] }),
    ],
  };
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify(declaration));
  const result = runBuildr(['verification', 'run', '--project', 'demo', '--level', 'candidate', '--target', root, '--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, 'buildr.verification-run/v1');
  assert.equal(payload.status, 'passed');
  assert.equal(payload.candidateCompleteness, 'confirmed');
  assert.match(payload.evidenceIdentity, /^sha256-/);
  assert.deepEqual(payload.evidenceLifecycle, {
    schemaVersion: 'buildr.verification-evidence-lifecycle/v1',
    runId: payload.runId,
    evidenceRetention: 'transient',
    cleanupAfter: 'all-consumers-complete',
    cleanupStatus: 'retained',
    cleanupReference: path.dirname(payload.evidenceReference),
    summaryPath: payload.evidenceReference,
  });
  assert.equal(payload.evidenceRetention, undefined);
  assert.equal(payload.cleanupReference, undefined);
  assert.equal(payload.checks.length, 2);
  const [first, second] = payload.checks;
  assert.ok(Date.parse(first.startedAt) < Date.parse(second.finishedAt) && Date.parse(second.startedAt) < Date.parse(first.finishedAt));
  assert.equal(JSON.parse(fs.readFileSync(payload.evidenceReference, 'utf8')).evidenceIdentity, payload.evidenceIdentity);
  const cleanup = runBuildr(['verification', 'cleanup', '--summary', payload.evidenceReference, '--json']);
  assert.equal(cleanup.status, 0, cleanup.stderr || cleanup.stdout);
  assert.equal(JSON.parse(cleanup.stdout).code, 'cleanup.removed');
  assert.equal(fs.existsSync(payload.evidenceLifecycle.cleanupReference), false);
  const repeated = runBuildr(['verification', 'cleanup', '--summary', payload.evidenceReference, '--json']);
  assert.equal(repeated.status, 0, repeated.stderr || repeated.stdout);
  assert.equal(JSON.parse(repeated.stdout).code, 'cleanup.already_absent');
});

test('verification cleanup preserves caller-managed evidence', (t) => {
  const root = fixture(t);
  const projectRoot = path.join(root, 'projects', 'demo');
  fs.writeFileSync(path.join(projectRoot, 'verification.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-verification/v1', mode: 'authoritative', resources: [],
    capabilities: [declaredCapability('demo.only', 'void 0')],
  }));
  const output = path.join(root, 'verification-summary.json');
  const run = runBuildr(['verification', 'run', '--project', 'demo', '--level', 'candidate', '--target', root, '--output', output, '--json']);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(JSON.parse(run.stdout).evidenceLifecycle.evidenceRetention, 'caller-managed');
  const cleanup = runBuildr(['verification', 'cleanup', '--summary', output, '--json']);
  assert.equal(cleanup.status, 1);
  assert.equal(JSON.parse(cleanup.stdout).code, 'retention.not_transient');
  assert.equal(fs.existsSync(output), true);
});

test('verification run returns one JSON envelope for invalid requests', (t) => {
  const root = fixture(t);
  const result = runBuildr(['verification', 'run', '--project', 'demo', '--level', 'candidate', '--target', root, '--json']);
  assert.equal(result.status, 2);
  assert.equal(result.stderr, '');
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, 'buildr.verification-run/v1');
  assert.equal(payload.status, 'failed');
  assert.equal(payload.error.code, 'verification.invalid_request');
});
