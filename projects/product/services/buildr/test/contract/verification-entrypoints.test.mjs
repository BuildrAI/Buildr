import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { PACKAGE_VERIFIERS, selectPackageVerifiers } from '../../src/application/package-maintenance/verification-registry.mjs';
import { createVerificationPlan } from '../../test/verification/planner.mjs';
import { VERIFICATION_DELEGATED_INPUTS, VERIFICATION_EXECUTION_PROFILES, verificationSteps } from '../../test/verification/registry.mjs';
import { workspaceSuites } from '../../test/verification/workspace/suites.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(productRoot, relative), 'utf8');

test('product verification exposes three gates, direct layers, and one focus entry', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts.test, './scripts/verify-buildr-product-fast');
  assert.equal(scripts['test:fast'], './scripts/verify-buildr-product-fast');
  assert.equal(scripts['test:unit'], 'node --test test/unit/*.test.mjs');
  assert.equal(scripts['test:component'], 'node --test test/component/*.test.mjs');
  assert.equal(scripts['test:contract'], 'node --test test/contract/*.test.mjs');
  assert.equal(scripts['test:integration'], 'node --test test/integration/*.test.mjs');
  assert.equal(scripts['test:system'], 'node test/verification/system.mjs');
  assert.equal(scripts['test:integration:fast'], undefined);
  assert.equal(scripts['test:browser:smoke'], 'node --test test/browser-smoke/*.test.mjs');
  assert.equal(scripts['test:browser:changed'], 'node test/verification/browser-selector-dispatcher.mjs --run');
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
  assert.deepEqual(fastIds, ['unit', 'component', 'contract', 'cli-architecture', 'openspec-spec-quality', 'openspec-strict']);
  assert.equal(fastIds.includes('system'), false);
  for (const forbidden of ['npm pack', 'npm install', 'verification/workspace/run.mjs', 'release-smoke.mjs']) {
    assert.equal(fast.includes(forbidden), false, `fast verifier must exclude ${forbidden}`);
  }
});

test('Product 声明唯一 delivery、显式完整回归与单一 Browser 交付能力', () => {
  const declaration = YAML.parse(fs.readFileSync(path.resolve(productRoot, '../..', 'verification.yml'), 'utf8'));
  const fast = declaration.capabilities.find((capability) => capability.id === 'product.fast');
  const delivery = declaration.capabilities.find((capability) => capability.id === 'product.delivery');
  const fullRegression = declaration.capabilities.find((capability) => capability.id === 'product.full-regression');
  const browser = declaration.capabilities.find((capability) => capability.id === 'product.browser-smoke');
  assert.equal(declaration.schemaVersion, 'buildr.project-verification/v2');
  const fastPlan = createVerificationPlan({ profiles: ['fast'] });
  assert.deepEqual([...new Set(fastPlan.steps.map((step) => step.testing.executionBoundary))].sort(), ['Component', 'Static', 'Unit']);
  assert.deepEqual(fast.proves, ['低成本 Unit、Component 与 Static Conformance 通过']);
  assert.deepEqual(delivery.invocation, { kind: 'command', argv: ['npm', 'run', 'test:changed', '--', '--base', 'origin/dev'], cwd: 'services/buildr' });
  assert.equal(delivery.requiredForDelivery, true);
  assert.deepEqual(delivery.environment.requires, ['node', 'npm', 'git']);
  assert.deepEqual(delivery.applicability.paths, ['**']);
  assert.deepEqual(fullRegression.invocation, { kind: 'command', argv: ['npm', 'run', 'test:candidate', '--', '--base', 'origin/dev'], cwd: 'services/buildr' });
  assert.equal(fullRegression.requiredForDelivery, false);
  assert.deepEqual(fullRegression.environment.requires, ['node', 'npm', 'git']);
  assert.deepEqual(fullRegression.applicability.paths, ['**']);
  assert.equal(declaration.capabilities.some((capability) => ['product.task-affected', 'product.candidate'].includes(capability.id)), false);
  assert.deepEqual(browser.scope, { project: 'product', services: ['buildr'] });
  assert.deepEqual(browser.invocation, { kind: 'command', argv: ['npm', 'run', 'test:browser:changed'], cwd: 'services/buildr' });
  assert.equal(browser.requiredForDelivery, true);
  assert.deepEqual(browser.applicability.paths, ['services/buildr/src/interfaces/local-app/web/**', 'services/buildr/src/interfaces/local-app/runtime/**', 'services/buildr/test/browser-smoke/**']);
  assert.deepEqual(browser.environment.requires, ['node', 'npm', 'chrome']);
  assert.deepEqual(browser.effects.externalSystems, []);
  assert.equal(browser.effects.authorization, 'implicit');
  assert.deepEqual(browser.resourceClaims, ['browser']);
  const browserDelegation = VERIFICATION_DELEGATED_INPUTS.find((item) => item.owner === 'product.browser-smoke');
  assert.ok(browserDelegation);
  for (const input of browserDelegation.inputs) assert.ok(browser.applicability.paths.includes(`services/buildr/${input}`));
  assert.deepEqual(declaration.resources.find((resource) => resource.id === 'browser'), { id: 'browser', title: 'Local browser capacity', strategy: 'coordinated', capacity: 1, authorization: 'implicit' });
});

test('focus verification de-duplicates groups without attaching fast', () => {
  const plan = createVerificationPlan({ groups: ['public', 'release', 'public'] });
  assert.equal(plan.steps.filter((step) => step.id === 'unit').length, 0);
  assert.equal(plan.steps.filter((step) => step.id === 'open-source-candidate').length, 1);
  assert.equal(plan.steps.filter((step) => step.id === 'candidate-tarball').length, 1);
});

test('candidate verification retains necessary Candidate facts without Browser and Release-only owners', () => {
  const wrapper = read('scripts/verify-buildr-product');
  const candidate = read('test/verification/candidate.mjs');
  assert.ok(wrapper.includes('test/verification/candidate.mjs'));
  assert.ok(wrapper.includes('"$@"'));
  assert.ok(candidate.includes("profiles: ['candidate']"));
  assert.ok(candidate.includes('createVerificationPreflightPlan'));
  assert.ok(candidate.includes('BUILDR_VERIFICATION_SCHEDULING'));
  assert.ok(candidate.includes('schedulingMode'));
  assert.ok(candidate.split(/\r?\n/).length < 100);
  const candidatePlan = createVerificationPlan({ profiles: ['candidate'] });
  for (const stage of [
    'fine-grained unit tests',
    'bounded component tests',
    'technical boundary integration tests',
    'Task Development lifecycle integration',
    'repository contract tests',
    'public CLI and Workspace system tests',
    'Candidate integration: builtin recovery and migration',
    'Concurrent task workflow acceptance',
    'CLI modular architecture',
    'OpenSpec canonical spec quality',
    'openspec strict validation',
    'candidate npm tarball',
    'open-source candidate',
    'OpenSpec contract candidate audit',
    'managed mutations',
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
  for (const excluded of [
    'integration-candidate-release', 'repository-onboarding',
    'browser-shell', 'browser-project', 'browser-service', 'browser-task', 'browser-change',
  ]) assert.equal(candidatePlan.steps.some((step) => step.id === excluded), false, `candidate verifier must exclude ${excluded}`);
  assert.equal(verificationSteps.some((step) => step.id.startsWith('browser-')), false);
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
  const system = candidatePlan.steps.find((step) => step.id === 'system');
  assert.equal(system.executor.file, 'test/verification/system.mjs');
  for (const helper of ['test/helpers/task-lifecycle-system-context.mjs', 'test/helpers/task-record-system-fixture.mjs']) {
    assert.ok(system.inputs.includes(helper), `${helper} must map to the System owner`);
  }
  assert.deepEqual(candidatePlan.steps.filter((step) => step.resources?.includes('workspace-saturating')).map((step) => step.id), [
    'integration-task-development', 'system-local-app-http', 'system', 'integration-candidate-recovery', 'concurrent-task-acceptance', 'openspec-convergence-recovery', 'runtime-adapter-parity',
  ]);
  assert.equal(VERIFICATION_EXECUTION_PROFILES.local.resources['workspace-saturating'], 2);
  assert.equal(VERIFICATION_EXECUTION_PROFILES.ci.resources['workspace-saturating'], 2);
  assert.equal(VERIFICATION_EXECUTION_PROFILES['ci-workspace-limited'].resources['workspace-saturating'], 1);
  assert.equal(VERIFICATION_EXECUTION_PROFILES.local.resources['task-lifecycle-heavy'], 1);
  assert.equal(VERIFICATION_EXECUTION_PROFILES.ci.resources['task-lifecycle-heavy'], 1);
  assert.equal(VERIFICATION_EXECUTION_PROFILES['ci-workspace-limited'].resources['task-lifecycle-heavy'], 1);
  assert.deepEqual(VERIFICATION_EXECUTION_PROFILES.local.innerConcurrency, {
    integration: 6, system: 8, 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 3,
  });
  assert.deepEqual(VERIFICATION_EXECUTION_PROFILES['ci-workspace-limited'].innerConcurrency, {
    integration: 3, system: 6, 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 2,
  });
  assert.ok(verificationSteps.find((step) => step.id === 'system').schedulingCostMs >= 60_000);
});

test('双任务并发验收输出完整的组合证据并执行归属清理', () => {
  const source = read('test/verification/concurrency/task-acceptance.mjs');
  for (const phrase of [
    'buildr.concurrent-task-acceptance/v1', 'cliInvocation', 'app', 'preview',
    'previewRegistrationFailure', 'resourceCoordination', 'environmentPreparation', 'portableResults', 'phases',
    'target-race', 'cleanup', 'retainedDoctor', 'durationMs',
  ]) assert.ok(source.includes(phrase), phrase);
  assert.ok(source.includes('processesOverlap(prepareResults[0], prepareResults[1])'));
  assert.ok(source.includes("'task', 'verification', 'record'"));
  assert.equal(source.includes("'task', 'verification', 'inspect'"), false);
  assert.equal(source.includes('taskChangeResolution'), false);
  assert.equal(source.includes('candidate-only'), false);
  assert.equal(source.includes('RESOURCE_WORKER'), false);
  assert.ok(source.includes("profiles: ['candidate']") === false);
  const entry = verificationSteps.find((step) => step.id === 'concurrent-task-acceptance');
  assert.equal(entry.executor.file, 'test/verification/concurrency/task-acceptance.mjs');
  assert.deepEqual(entry.profiles, ['candidate']);
  assert.ok(entry.resources.includes('workspace-saturating'));
  assert.ok(entry.budgetMs > 0);
});

test('OpenSpec fixture Candidate owners use disjoint complete suites', () => {
  const owners = Object.fromEntries(verificationSteps
    .filter((step) => ['openspec-contract-fixtures', 'openspec-convergence-recovery'].includes(step.id))
    .map((step) => [step.id, step.executor.args]));
  assert.deepEqual(owners, {
    'openspec-contract-fixtures': ['--suite', 'contract'],
    'openspec-convergence-recovery': ['--suite', 'recovery'],
  });
});

test('CLI package parity owns representative equivalence without lifecycle duplication', () => {
  const source = read('test/verification/cli/package-parity.mjs');
  assert.match(source, /representative output and init mutation/);
  for (const forbidden of [
    'spawnAsync',
    'verification.yml',
    'taskParity',
    'taskIds',
    "'project', 'create'",
    "'sync', 'codex'",
    "'doctor', '--agent'",
  ]) assert.equal(source.includes(forbidden), false, `package parity must not duplicate ${forbidden}`);
  assert.equal(verificationSteps.find((step) => step.id === 'cli-package-parity').testing.executionBoundary, 'Integration');
});

test('package verifier selectors are stable, focused, and fail closed', () => {
  assert.deepEqual(selectPackageVerifiers('static,runtime').map((step) => step.id), ['static', 'runtime']);
  assert.throws(() => selectPackageVerifiers('unknown'), /Unknown package verifier/);

});
