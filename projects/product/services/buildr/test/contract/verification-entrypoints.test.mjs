import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { PACKAGE_VERIFIERS, selectPackageVerifiers } from '../../src/application/package-maintenance/verification-registry.mjs';
import { createVerificationPlan } from '../../test/verification/planner.mjs';
import { verificationSteps } from '../../test/verification/registry.mjs';
import { workspaceSuites } from '../../test/verification/workspace/suites.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(productRoot, relative), 'utf8');

test('product verification exposes three gates, direct layers, and one focus entry', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts.test, './scripts/verify-buildr-product-fast');
  assert.equal(scripts['test:fast'], './scripts/verify-buildr-product-fast');
  assert.equal(scripts['test:unit'], 'node --test test/unit/*.test.mjs');
  assert.equal(scripts['test:contract'], 'node --test test/contract/*.test.mjs');
  assert.equal(scripts['test:integration:fast'], 'node --test test/integration-fast/*.test.mjs');
  assert.equal(scripts['test:browser:smoke'], 'node --test test/browser-smoke/*.test.mjs');
  assert.equal(scripts['test:integration:candidate:recovery'], 'node --test test/integration-candidate-recovery/*.test.mjs');
  assert.equal(scripts['test:integration:candidate:release'], 'node --test test/integration-candidate-release/*.test.mjs');
  assert.equal(scripts['coverage:unit'], 'node test/verification/unit-coverage.mjs');
  assert.equal(scripts['test:changed'], 'node test/verification/changed.mjs');
  assert.equal(scripts['test:focus'], 'node test/verification/focus.mjs');
  assert.equal(scripts['test:candidate'], './scripts/verify-buildr-product');
  assert.equal(scripts['test:release'], 'node test/verification/release/release-smoke.mjs');
  for (const removed of ['test:affected', 'test:package', 'test:workspace', 'test:coverage:unit']) assert.equal(scripts[removed], undefined);

  const fast = read('scripts/verify-buildr-product-fast');
  assert.match(fast, /verification\/profile\.mjs" fast/);
  const fastIds = createVerificationPlan({ profiles: ['fast'] }).steps.map((step) => step.id);
  assert.deepEqual(fastIds, ['unit', 'contract', 'integration-fast', 'cli-architecture', 'openspec-spec-quality', 'openspec-strict', 'runtime-adapter-contract']);
  for (const forbidden of ['npm pack', 'npm install', 'verification/workspace/run.mjs', 'release-smoke.mjs']) {
    assert.equal(fast.includes(forbidden), false, `fast verifier must exclude ${forbidden}`);
  }
});

test('browser smoke 以 v2 optional capability 声明真实环境、范围与资源', () => {
  const declaration = YAML.parse(fs.readFileSync(path.resolve(productRoot, '../..', 'verification.yml'), 'utf8'));
  const browser = declaration.capabilities.find((capability) => capability.id === 'product.browser-smoke');
  assert.ok(browser);
  assert.equal(declaration.schemaVersion, 'buildr.project-verification/v2');
  assert.deepEqual(browser.scope, { project: 'product', services: ['buildr'] });
  assert.deepEqual(browser.invocation, { kind: 'command', argv: ['npm', 'run', 'test:browser:smoke'], cwd: 'services/buildr' });
  assert.equal(browser.requiredForDelivery, false);
  assert.deepEqual(browser.applicability.paths, ['services/buildr/src/interfaces/local-app/**', 'services/buildr/test/browser-smoke/**']);
  assert.deepEqual(browser.environment.requires, ['node', 'npm', 'chrome']);
  assert.deepEqual(browser.effects.externalSystems, []);
  assert.equal(browser.effects.authorization, 'implicit');
  assert.deepEqual(browser.resourceClaims, ['browser']);
  assert.deepEqual(declaration.resources.find((resource) => resource.id === 'browser'), { id: 'browser', title: 'Local browser capacity', strategy: 'coordinated', capacity: 1, authorization: 'implicit' });
});

test('focus verification de-duplicates groups without attaching fast', () => {
  const plan = createVerificationPlan({ groups: ['public', 'release', 'public'] });
  assert.equal(plan.steps.filter((step) => step.id === 'unit').length, 0);
  assert.equal(plan.steps.filter((step) => step.id === 'open-source-candidate').length, 1);
  assert.equal(plan.steps.filter((step) => step.id === 'candidate-tarball').length, 1);
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

test('candidate verification retains every release gate and split package steps', () => {
  const wrapper = read('scripts/verify-buildr-product');
  const candidate = read('test/verification/candidate.mjs');
  assert.ok(wrapper.includes('test/verification/candidate.mjs'));
  assert.ok(candidate.includes("profiles: ['candidate']"));
  assert.ok(candidate.includes('BUILDR_VERIFICATION_SCHEDULING'));
  assert.ok(candidate.includes('schedulingMode'));
  const invalidScheduling = spawnSync(process.execPath, [path.join(productRoot, 'test', 'verification', 'candidate.mjs')], {
    cwd: productRoot,
    encoding: 'utf8',
    env: { ...process.env, BUILDR_VERIFICATION_SCHEDULING: 'unknown' },
  });
  assert.equal(invalidScheduling.status, 1);
  assert.match(invalidScheduling.stderr, /Invalid verification scheduling mode/);
  assert.doesNotMatch(`${invalidScheduling.stdout}${invalidScheduling.stderr}`, /\[verify-product\]/);
  const invalidProfile = spawnSync(process.execPath, [path.join(productRoot, 'test', 'verification', 'candidate.mjs')], {
    cwd: productRoot,
    encoding: 'utf8',
    env: { ...process.env, BUILDR_VERIFICATION_PROFILE: 'unknown' },
  });
  assert.equal(invalidProfile.status, 1);
  assert.match(invalidProfile.stderr, /Unknown verification execution profile/);
  assert.doesNotMatch(`${invalidProfile.stdout}${invalidProfile.stderr}`, /\[verify-product\]/);
  assert.ok(candidate.split(/\r?\n/).length < 100);
  const candidatePlan = createVerificationPlan({ profiles: ['candidate'] });
  for (const stage of [
    'fine-grained unit tests',
    'static contract tests',
    'fast integration tests',
    'Candidate integration: builtin recovery and migration',
    'Candidate integration: release Git convergence',
    'Concurrent task workflow acceptance',
    'CLI modular architecture',
    'OpenSpec canonical spec quality',
    'openspec strict validation',
    'candidate npm tarball',
    'open-source candidate',
    'OpenSpec contract candidate audit',
    'managed mutations',
    'repository onboarding from a clean checkout',
    'single-command init onboarding',
    'CLI compatibility',
    'CLI package parity',
    'runtime adapter contract',
    'runtime adapter implementation-family parity',
    'capability CLI integration',
    'Service branch contract',
    'remote Skill timeout contract',
    'release tarball smoke',
    'managed data integrity',
    'OpenSpec contract fixtures',
    'documentation quality',
  ]) assert.ok(candidatePlan.steps.some((step) => step.name === stage), `candidate verifier must retain ${stage}`);
  assert.equal(candidatePlan.steps.some((step) => step.id === 'runtime-adapter-smoke-workspace'), false);
  assert.equal(candidatePlan.steps.some((step) => step.name === 'runtime adapter smoke workspace generator'), false);
  assert.equal(fs.existsSync(path.join(productRoot, 'test/verification/runtime/adapter-smoke-workspace.mjs')), false);
  assert.equal(fs.existsSync(path.join(productRoot, 'test/verification/runtime/adapter-smoke-workspace.test.mjs')), false);
  assert.deepEqual(PACKAGE_VERIFIERS.map((step) => step.id), ['static', 'workspace', 'commands', 'rules', 'skills', 'runtime']);
  assert.equal(verificationSteps.filter((step) => step.executor.type === 'candidate-artifact').length, 1);
  assert.equal(candidate.includes('createCandidatePackage'), false);
  for (const suite of ['workspace-lifecycle', 'ownership-recovery', 'runtime-reconciliation']) {
    assert.ok(workspaceSuites.some((step) => step.id === suite), `Workspace E2E registry must retain ${suite}`);
  }
  assert.ok(candidatePlan.steps.some((step) => step.executor.file === 'test/capability-cli.integration.mjs'));
  assert.deepEqual(candidatePlan.steps.filter((step) => step.resources?.includes('workspace-saturating')).map((step) => step.id), [
    'integration-candidate-recovery', 'integration-candidate-release', 'concurrent-task-acceptance', 'openspec-convergence-recovery', 'runtime-adapter-parity',
  ]);
});

test('双任务并发验收输出完整的组合证据并执行归属清理', () => {
  const source = read('test/verification/concurrency/task-acceptance.mjs');
  for (const phrase of [
    'buildr.concurrent-task-acceptance/v1', 'cliInvocation', 'app', 'preview',
    'resourceCoordination', 'target-race', 'cleanup', 'retainedDoctor', 'durationMs',
  ]) assert.ok(source.includes(phrase), phrase);
  assert.ok(source.includes("profiles: ['candidate']") === false);
  const entry = verificationSteps.find((step) => step.id === 'concurrent-task-acceptance');
  assert.equal(entry.executor.file, 'test/verification/concurrency/task-acceptance.mjs');
  assert.deepEqual(entry.profiles, ['candidate']);
  assert.ok(entry.resources.includes('workspace-saturating'));
  assert.ok(entry.budgetMs > 0);
});

test('package verifier selectors are stable, focused, and fail closed', () => {
  assert.deepEqual(selectPackageVerifiers('static,runtime').map((step) => step.id), ['static', 'runtime']);
  assert.throws(() => selectPackageVerifiers('unknown'), /Unknown package verifier/);

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
