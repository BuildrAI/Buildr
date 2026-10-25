import assert from 'node:assert/strict';
import test from 'node:test';

import { createDevelopmentPlatformPlan, createVerificationPlan } from '../verification/planner.ts';
import { verificationSteps } from '../verification/registry.ts';

test('native execution projection ignores unrelated source changes', () => {
  const plan: any = createDevelopmentPlatformPlan({ runner: 'windows', paths: ['README.md', 'src/modules/task/application/task-record.ts', 'services/buildr-web/package.json', 'test/integration/release-operation.test.ts'] });
  assert.equal(plan.source, 'development-platform');
  assert.deepEqual(plan.steps, []);
  assert.equal('admissionStepIds' in plan, false);
});

test('Windows development projection selects only the explicit platform owner for sensitive paths', () => {
  for (const input of [
    'src/infrastructure/process.ts',
    'src/infrastructure/filesystem/filesystem-path-identity.ts',
    'test/integration/windows-boundaries.test.ts',
  ]) {
    const plan: any = createDevelopmentPlatformPlan({ runner: 'windows', paths: [input] });
    assert.deepEqual(plan.steps.map((step: any) => step.id), ['integration-windows-native'], input);
    assert.deepEqual(plan.steps[0].developmentRunners, ['windows']);
    assert.deepEqual(plan.steps[0].resources, ['app-runtime']);
    assert.match(plan.steps[0].reasons.at(-1), /windows development owner/);
  }
});

test('native execution projection rejects unknown operating systems', () => {
  assert.throws(() => createDevelopmentPlatformPlan({ runner: 'linux', paths: ['README.md', 'src/modules/task/application/task-record.ts', 'services/buildr-web/package.json', 'test/integration/release-operation.test.ts'] }), /Unknown development verification runner/);
  const projected: any = createDevelopmentPlatformPlan({ runner: 'windows', paths: ['src/infrastructure/process.ts'] });
  assert.deepEqual(projected.steps.map((step: any) => step.id), ['integration-windows-native']);
  assert.deepEqual(verificationSteps.filter((step: any) => step.developmentRunners.length > 0).map((step: any) => step.id), ['integration-macos-native', 'integration-windows-native']);
});

test('macOS development projection selects its native descriptor boundary without adding common checks', () => {
  const plan = createDevelopmentPlatformPlan({ runner: 'macos', paths: ['test/integration/macos-readonly-boundaries.test.ts'] });
  assert.deepEqual(plan.steps.map((step: any) => step.id), ['integration-macos-native']);
  assert.deepEqual(plan.steps[0].developmentRunners, ['macos']);
});

test('ordinary related selection retains the same native check and its actual operating-system requirement', () => {
  const paths = ['test/integration/windows-boundaries.test.ts'];
  const ordinary = createVerificationPlan({ paths });
  assert.equal(ordinary.status, 'ready');
  assert.ok(ordinary.steps.some((item: any) => item.id === 'integration-windows-native'));
  assert.deepEqual(createDevelopmentPlatformPlan({ runner: 'windows', paths }).steps.map((step: any) => step.id), ['integration-windows-native']);
});
