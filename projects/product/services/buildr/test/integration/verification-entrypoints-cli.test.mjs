import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PACKAGE_VERIFIERS } from '../../src/agent-assets/application/package-maintenance/verification-registry.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectRoot = path.resolve(productRoot, '../..');

function defaultPlanningEnvironment() {
  const environment = { ...process.env };
  delete environment.BUILDR_VERIFICATION_PROFILE;
  return environment;
}

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
  const environment = defaultPlanningEnvironment();
  const planned = spawnSync(process.execPath, [runner, '--json'], { cwd: productRoot, encoding: 'utf8', maxBuffer: 1024 * 1024, env: environment });
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
    'system-buildr-web-http', 'system-app-process', 'system-task-finish-cli', 'system-fresh-build', 'docs-quality',
  ]) {
    assert.equal(payload.steps.filter((step) => step.id === id).length, 1);
  }
  assert.equal(payload.steps.some((step) => step.id === 'system'), false);
  const changed = spawnSync(process.execPath, [runner, '--base', 'HEAD^', '--json'], { cwd: productRoot, encoding: 'utf8', env: environment });
  assert.equal(changed.status, 1);
  assert.match(changed.stderr, /Unknown test:candidate option: --base/);
  const unknown = spawnSync(process.execPath, [runner, '--unknown'], { cwd: productRoot, encoding: 'utf8', env: environment });
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown test:candidate option/);
  assert.doesNotMatch(`${unknown.stdout}${unknown.stderr}`, /\[verify-product\]/);
});

test('core full plan uses the daily core profile without Candidate-only owners', () => {
  const runner = path.join(productRoot, 'test', 'verification', 'candidate.mjs');
  const planned = spawnSync(process.execPath, [runner, '--profile', 'core', '--json'], { cwd: productRoot, encoding: 'utf8', maxBuffer: 1024 * 1024, env: defaultPlanningEnvironment() });
  assert.equal(planned.status, 0, planned.stderr);
  const payload = JSON.parse(planned.stdout);
  assert.equal(payload.schemaVersion, 'buildr.verification-full-plan/v1');
  assert.equal(payload.source, 'core-profile');
  assert.equal(payload.scope.mode, 'full');
  assert.equal(payload.estimate.declaredBudgetMs, 360_000);
  assert.equal(payload.estimate.feasible, true);
  for (const id of ['candidate-tarball', 'application-payload-release', 'npm-launcher-candidate', 'package-static', 'cli-package-parity', 'system-fresh-build', 'init-onboarding', 'release-tarball-smoke']) {
    assert.equal(payload.steps.some((step) => step.id === id), false, id);
  }
});

test('daily-full public entry and core compatibility select one registry evidence set', () => {
  const runner = path.join(productRoot, 'test', 'verification', 'candidate.mjs');
  const environment = defaultPlanningEnvironment();
  const daily = spawnSync(process.execPath, [runner, '--profile', 'daily-full', '--json'], { cwd: productRoot, encoding: 'utf8', maxBuffer: 1024 * 1024, env: environment });
  const compatibility = spawnSync(process.execPath, [runner, '--profile', 'core', '--json'], { cwd: productRoot, encoding: 'utf8', maxBuffer: 1024 * 1024, env: environment });
  assert.equal(daily.status, 0, daily.stderr);
  assert.equal(compatibility.status, 0, compatibility.stderr);
  const dailyPlan = JSON.parse(daily.stdout);
  const compatibilityPlan = JSON.parse(compatibility.stdout);
  assert.equal(dailyPlan.source, 'daily-full-entry');
  assert.deepEqual(dailyPlan.model, {
    verificationTarget: 'task-or-current-source',
    selection: 'full',
    evidenceSet: 'daily-full',
    compatibilityProfile: 'core',
  });
  assert.equal(compatibilityPlan.source, 'core-profile');
  assert.deepEqual(compatibilityPlan.model, dailyPlan.model);
  assert.deepEqual(dailyPlan.steps, compatibilityPlan.steps);
  assert.deepEqual(dailyPlan.estimate, compatibilityPlan.estimate);
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
  const environment = defaultPlanningEnvironment();
  const json = spawnSync(process.execPath, [runner, '--json', 'docs/buildr-product.md'], { cwd: productRoot, encoding: 'utf8', env: environment });
  assert.equal(json.status, 0, json.stderr);
  const payload = JSON.parse(json.stdout);
  assert.equal(payload.schemaVersion, 'buildr.verification-plan/v1');
  assert.equal(payload.status, 'ready');
  assert.deepEqual(payload.paths, ['docs/buildr-product.md']);
  assert.equal(payload.scope.mode, 'affected');
  assert.deepEqual(payload.scope.reasons.map((reason) => reason.code), ['affected-owner']);
  assert.deepEqual(payload.unmapped, []);
  assert.deepEqual(payload.admissionStepIds, ['typecheck', 'unit', 'component', 'contract', 'cli-architecture', 'openspec-spec-quality', 'openspec-strict']);
  assert.deepEqual(payload.steps.map((step) => step.id), [...payload.admissionStepIds, 'docs-quality']);
  assert.deepEqual(payload.selectionAudit.directMappings, [{
    code: 'affected-owner', path: 'docs/buildr-product.md', owners: ['docs-quality'],
  }]);
  assert.deepEqual(payload.selectionAudit.layerCounts, { Static: 6, Unit: 1, Component: 1, Integration: 0, System: 0 });
  assert.equal(payload.selectionAudit.stepSelections.find((step) => step.stepId === 'docs-quality').selectionKinds.includes('direct-owner'), true);
  assert.equal(payload.selectionAudit.stepSelections.find((step) => step.stepId === 'typecheck').selectionKinds.includes('admission'), true);

  const full = spawnSync(process.execPath, [runner, '--json', 'test/verification/ownership.mjs'], { cwd: productRoot, encoding: 'utf8', maxBuffer: 1024 * 1024, env: environment });
  assert.equal(full.status, 0, full.stderr);
  const fullPayload = JSON.parse(full.stdout);
  assert.equal(fullPayload.scope.mode, 'full');
  assert.equal(fullPayload.scope.reasons[0].code, 'ownership-authority-change');
  assert.equal(fullPayload.scope.reasons[0].pattern, 'test/verification/ownership.mjs');
  assert.match(fullPayload.scope.reasons[0].explanation, /ownership/u);
  assert.ok(fullPayload.selectionAudit.stepSelections.every((step) => step.selectionKinds.includes('full-scope') || step.selectionKinds.includes('admission')));

  const fallback = spawnSync(process.execPath, [runner, '--json', 'new-area/contract.bin'], { cwd: productRoot, encoding: 'utf8', env: environment });
  assert.equal(fallback.status, 1, fallback.stderr);
  const fallbackPayload = JSON.parse(fallback.stdout);
  assert.equal(fallbackPayload.status, 'blocked');
  assert.equal(fallbackPayload.scope.mode, 'blocked');
  assert.equal(fallbackPayload.diagnostic.code, 'verification-owner-gap');
  assert.deepEqual(fallbackPayload.diagnostic.unmapped, ['new-area/contract.bin']);
  assert.deepEqual(fallbackPayload.unmapped, ['new-area/contract.bin']);
  assert.deepEqual(fallbackPayload.admissionStepIds, []);
  assert.deepEqual(fallbackPayload.steps, []);
  assert.doesNotMatch(fallback.stdout, /\[verify-changed\]/);
  const unknown = spawnSync(process.execPath, [runner, '--unknown'], { cwd: productRoot, encoding: 'utf8', env: environment });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown test:changed option/);
  assert.doesNotMatch(unknown.stderr, /\[verify\]/);
});
