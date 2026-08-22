import assert from 'node:assert/strict';
import test from 'node:test';

import { createDevelopmentPlatformPlan, createVerificationAdmissionPlan } from '../verification/planner.mjs';
import { verificationSteps } from '../verification/registry.mjs';

test('Windows development projection is empty for non-platform paths and does not attach Fast admission', () => {
  const plan = createDevelopmentPlatformPlan({ runner: 'windows', paths: ['README.md'] });
  assert.equal(plan.source, 'development-platform');
  assert.deepEqual(plan.steps, []);
  assert.equal('admissionStepIds' in plan, false);
});

test('Windows development projection selects only the explicit platform owner for sensitive paths', () => {
  for (const input of [
    'src/agent-assets/infrastructure/runtime/node-runtime.mjs',
    'src/task/infrastructure/worktree-application.mjs',
    'services/buildr-web/package.json',
  ]) {
    const plan = createDevelopmentPlatformPlan({ runner: 'windows', paths: [input] });
    assert.deepEqual(plan.steps.map((step) => step.id), ['system-windows-platform'], input);
    assert.deepEqual(plan.steps[0].developmentRunners, ['windows']);
    assert.deepEqual(plan.steps[0].resources, ['workspace-saturating', 'task-lifecycle-heavy']);
    assert.match(plan.steps[0].reasons.at(-1), /windows development owner/);
  }
});

test('platform projection rejects unknown runners and admission remains an explicit caller decision', () => {
  assert.throws(() => createDevelopmentPlatformPlan({ runner: 'macos', paths: ['README.md'] }), /Unknown development verification runner/);
  const projected = createDevelopmentPlatformPlan({ runner: 'windows', paths: ['src/agent-assets/infrastructure/runtime/node-runtime.mjs'] });
  const withAdmission = createVerificationAdmissionPlan(projected);
  assert.ok(withAdmission.steps.some((step) => step.id === 'unit'));
  assert.deepEqual(verificationSteps.filter((step) => step.developmentRunners.length > 0).map((step) => step.id), ['system-windows-platform']);
});
