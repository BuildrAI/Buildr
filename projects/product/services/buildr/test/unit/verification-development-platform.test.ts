import assert from 'node:assert/strict';
import test from 'node:test';

import { createDevelopmentPlatformPlan, createVerificationAdmissionPlan, createVerificationPlan } from '../verification/planner.ts';
import { verificationSteps } from '../verification/registry.ts';

test('Windows development projection is empty for non-platform paths and does not attach Fast admission', () => {
  const plan: any = createDevelopmentPlatformPlan({ runner: 'windows', paths: ['README.md', 'src/modules/task/application/task-record.ts', 'services/buildr-web/package.json', 'test/integration-candidate-release/release-operation.test.ts'] });
  assert.equal(plan.source, 'development-platform');
  assert.deepEqual(plan.steps, []);
  assert.equal('admissionStepIds' in plan, false);
});

test('Windows development projection selects only the explicit platform owner for sensitive paths', () => {
  for (const input of [
    'src/infrastructure/process.ts',
    'src/infrastructure/filesystem/filesystem-path-identity.ts',
    'test/platform/windows-boundaries.test.ts',
  ]) {
    const plan: any = createDevelopmentPlatformPlan({ runner: 'windows', paths: [input] });
    assert.deepEqual(plan.steps.map((step: any) => step.id), ['system-windows-platform'], input);
    assert.deepEqual(plan.steps[0].developmentRunners, ['windows']);
    assert.deepEqual(plan.steps[0].resources, ['app-runtime']);
    assert.match(plan.steps[0].reasons.at(-1), /windows development owner/);
  }
});

test('platform projection rejects unknown runners and admission remains an explicit caller decision', () => {
  assert.throws(() => createDevelopmentPlatformPlan({ runner: 'linux', paths: ['README.md', 'src/modules/task/application/task-record.ts', 'services/buildr-web/package.json', 'test/integration-candidate-release/release-operation.test.ts'] }), /Unknown development verification runner/);
  const projected: any = createDevelopmentPlatformPlan({ runner: 'windows', paths: ['src/infrastructure/process.ts'] });
  const withAdmission: any = createVerificationAdmissionPlan(projected);
  assert.ok(withAdmission.steps.some((step: any) => step.id === 'unit'));
  assert.deepEqual(verificationSteps.filter((step: any) => step.developmentRunners.length > 0).map((step: any) => step.id), ['system-macos-platform', 'system-windows-platform']);
});

test('macOS development projection selects its native descriptor boundary without adding common checks', () => {
  const plan = createDevelopmentPlatformPlan({ runner: 'macos', paths: ['test/platform/macos-readonly-boundaries.test.ts'] });
  assert.deepEqual(plan.steps.map((step: any) => step.id), ['system-macos-platform']);
  assert.deepEqual(plan.steps[0].developmentRunners, ['macos']);
});

test('dedicated Windows tests are explicitly delegated in ordinary selection and executed by the Windows projection', () => {
  const paths = ['test/platform/windows-boundaries.test.ts'];
  const ordinary = createVerificationPlan({ paths });
  assert.equal(ordinary.status, 'ready');
  assert.ok(ordinary.delegated.some((item: any) => item.owners.includes('product.windows-platform')));
  assert.deepEqual(createDevelopmentPlatformPlan({ runner: 'windows', paths }).steps.map((step: any) => step.id), ['system-windows-platform']);
});
