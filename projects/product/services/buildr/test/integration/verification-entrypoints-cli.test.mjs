import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PACKAGE_VERIFIERS } from '../../src/application/package-maintenance/verification-registry.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(productRoot, '../..');

test('documentation quality ignores trailing whitespace', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(projectRoot, 'openspec', '.docs-quality-'));
  const document = path.join(temporaryRoot, 'trailing-whitespace.md');
  const relativeDocument = path.relative(projectRoot, document).split(path.sep).join('/');
  fs.writeFileSync(document, '# Example  \n\nbody  \n', 'utf8');
  try {
    const runner = path.join(productRoot, 'test', 'verification', 'docs', 'quality.mjs');
    const result = spawnSync(process.execPath, [runner], {
      cwd: productRoot,
      encoding: 'utf8',
      env: { ...process.env, BUILDR_CHANGED_PATHS_JSON: JSON.stringify([relativeDocument]) },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Documentation quality passed: 1 file\(s\)\./);
    assert.equal(result.stderr, '');
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('focus verification lists selectors and rejects unknown values before execution', () => {
  const runner = path.join(productRoot, 'test', 'verification', 'focus.mjs');
  const help = spawnSync(process.execPath, [runner, '--help'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /step-id\|group/);
  const listed = spawnSync(process.execPath, [runner, '--list'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /group:package/);
  assert.match(listed.stdout, /workspace-lifecycle/);
  const unknown = spawnSync(process.execPath, [runner, 'unknown'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown verification step/);
  assert.doesNotMatch(`${unknown.stdout}${unknown.stderr}`, /\[focus\]/);
});

test('candidate rejects invalid scheduling and execution profiles before verification', () => {
  const runner = path.join(productRoot, 'test', 'verification', 'candidate.mjs');
  const invalidScheduling = spawnSync(process.execPath, [runner], {
    cwd: productRoot, encoding: 'utf8', env: { ...process.env, BUILDR_VERIFICATION_SCHEDULING: 'unknown' },
  });
  assert.equal(invalidScheduling.status, 1);
  assert.match(invalidScheduling.stderr, /Invalid verification scheduling mode/);
  assert.doesNotMatch(`${invalidScheduling.stdout}${invalidScheduling.stderr}`, /\[verify-product\]/);
  const invalidProfile = spawnSync(process.execPath, [runner], {
    cwd: productRoot, encoding: 'utf8', env: { ...process.env, BUILDR_VERIFICATION_PROFILE: 'unknown' },
  });
  assert.equal(invalidProfile.status, 1);
  assert.match(invalidProfile.stderr, /Unknown verification execution profile/);
  assert.doesNotMatch(`${invalidProfile.stdout}${invalidProfile.stderr}`, /\[verify-product\]/);
});

test('candidate full plan only uses Candidate profile and rejects changed-path options', () => {
  const runner = path.join(productRoot, 'test', 'verification', 'candidate.mjs');
  const planned = spawnSync(process.execPath, [runner, '--json'], { cwd: productRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  assert.equal(planned.status, 0, planned.stderr);
  const payload = JSON.parse(planned.stdout);
  assert.equal(payload.schemaVersion, 'buildr.verification-full-plan/v1');
  assert.equal(payload.base, null);
  assert.equal(payload.source, 'candidate-profile');
  assert.deepEqual(payload.paths, []);
  assert.deepEqual(payload.preflightSteps, []);
  assert.ok(payload.admissionStepIds.includes('system-verification-admission'));
  assert.ok(payload.admissionStepIds.includes('integration-verification'));
  assert.equal(new Set(payload.steps.map((step) => step.id)).size, payload.steps.length);
  assert.equal(payload.steps.some((step) => step.id === 'repository-onboarding'), false);
  for (const id of [
    'system-verification-admission', 'system-verification-contracts', 'system-public-json-contracts', 'system-openspec-contract-audit',
    'system-workspace-lifecycle', 'system-task-lifecycle', 'system-worktree-lifecycle', 'system-runtime-recovery',
    'system-local-app-http', 'system-app-process', 'system-task-finish', 'system-task-finish-cli', 'system-fresh-build', 'docs-quality',
  ]) {
    assert.equal(payload.steps.filter((step) => step.id === id).length, 1);
  }
  assert.equal(payload.steps.some((step) => step.id === 'system'), false);
  const changed = spawnSync(process.execPath, [runner, '--base', 'HEAD^', '--json'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(changed.status, 1);
  assert.match(changed.stderr, /Unknown test:candidate option: --base/);
  const unknown = spawnSync(process.execPath, [runner, '--unknown'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown test:candidate option/);
  assert.doesNotMatch(`${unknown.stdout}${unknown.stderr}`, /\[verify-product\]/);
});

test('OpenSpec fixture runner lists disjoint suites and rejects unknown suites', () => {
  const runner = path.join(productRoot, 'test', 'verification', 'openspec', 'contract.mjs');
  const listed = spawnSync(process.execPath, [runner, '--list-suites'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  const suites = JSON.parse(listed.stdout);
  assert.equal(suites.contract.filter((name) => suites.recovery.includes(name)).length, 0);
  assert.deepEqual([...new Set([...suites.contract, ...suites.recovery])].sort(), [...suites.all].sort());
  const unknown = spawnSync(process.execPath, [runner, '--suite', 'unknown'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown OpenSpec fixture suite/);
});

test('package verifier CLI exposes stable selectors and rejects unknown selectors', () => {
  const runner = path.join(productRoot, 'test', 'verification', 'package', 'run.mjs');
  const help = spawnSync(process.execPath, [runner, '--help'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  for (const step of PACKAGE_VERIFIERS) assert.match(help.stdout, new RegExp(`\\b${step.id}\\b`));
  const unknown = spawnSync(process.execPath, [runner, 'unknown'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown package verifier/);
});

test('changed verification exposes plan/json and rejects unknown options before execution', () => {
  const runner = path.join(productRoot, 'test', 'verification', 'changed.mjs');
  const json = spawnSync(process.execPath, [runner, '--json', 'docs/buildr-product.md'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(json.status, 0, json.stderr);
  const payload = JSON.parse(json.stdout);
  assert.equal(payload.schemaVersion, 'buildr.verification-plan/v1');
  assert.deepEqual(payload.paths, ['docs/buildr-product.md']);
  assert.equal(payload.scope.mode, 'affected');
  assert.deepEqual(payload.scope.reasons.map((reason) => reason.code), ['affected-owner']);
  assert.deepEqual(payload.unmapped, []);
  assert.deepEqual(payload.admissionStepIds, ['typecheck', 'unit', 'component', 'contract', 'cli-architecture', 'openspec-spec-quality', 'openspec-strict']);
  assert.deepEqual(payload.steps.map((step) => step.id), [...payload.admissionStepIds, 'docs-quality']);

  const fallback = spawnSync(process.execPath, [runner, '--json', 'new-area/contract.bin'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(fallback.status, 0, fallback.stderr);
  const fallbackPayload = JSON.parse(fallback.stdout);
  assert.equal(fallbackPayload.scope.mode, 'full');
  assert.deepEqual(fallbackPayload.scope.reasons, [{ code: 'unknown-path-full-fallback', path: 'new-area/contract.bin', owners: [] }]);
  assert.deepEqual(fallbackPayload.unmapped, ['new-area/contract.bin']);
  assert.equal(new Set(fallbackPayload.steps.map((step) => step.id)).size, fallbackPayload.steps.length);
  const unknown = spawnSync(process.execPath, [runner, '--unknown'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown test:changed option/);
  assert.doesNotMatch(unknown.stderr, /\[verify\]/);
});
