import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PACKAGE_VERIFIERS } from '../../src/application/package-maintenance/verification-registry.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

test('candidate full plan unions changed owners once and rejects unknown options before execution', () => {
  const runner = path.join(productRoot, 'test', 'verification', 'candidate.mjs');
  const planned = spawnSync(process.execPath, [runner, '--base', 'HEAD^', '--json'], { cwd: productRoot, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  assert.equal(planned.status, 0, planned.stderr);
  const payload = JSON.parse(planned.stdout);
  assert.equal(payload.schemaVersion, 'buildr.verification-full-plan/v1');
  assert.equal(new Set(payload.steps.map((step) => step.id)).size, payload.steps.length);
  for (const id of ['system', 'docs-quality']) assert.equal(payload.steps.filter((step) => step.id === id).length, 1);
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
  assert.deepEqual(payload.steps.map((step) => step.id), ['docs-quality']);
  const unknown = spawnSync(process.execPath, [runner, '--unknown'], { cwd: productRoot, encoding: 'utf8' });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown test:changed option/);
  assert.doesNotMatch(unknown.stderr, /\[verify\]/);
});
