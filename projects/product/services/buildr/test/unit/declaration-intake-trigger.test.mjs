import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyDeclarationMaintenance, declarationIntakeGapNextAction, declarationIntakeNextAction } from '../../src/infrastructure/contracts/declaration-intake.mjs';

test('Declaration Intake trigger稳定表达Project-only与多Service只读边界', () => {
  const projectOnly = declarationIntakeNextAction({ trigger: 'first-task-scope', project: 'demo' });
  assert.match(projectOnly, /scope: project:demo/);
  assert.doesNotMatch(projectOnly, /service:demo/);
  assert.match(projectOnly, /只读检查 preparation\.yml 与 verification\.yml/);
  assert.match(projectOnly, /routine-maintenance或user-decision-required/);
  assert.match(projectOnly, /改变长期适用性时请求用户确认/);

  const services = declarationIntakeNextAction({ trigger: 'service-registered', project: 'demo', services: ['web', 'api', 'web'] });
  assert.match(services, /project:demo、service:demo\/api、service:demo\/web/);
  const gap = declarationIntakeGapNextAction({ kind: 'verification', project: 'demo', services: ['web'], scopes: ['service:demo/web'] });
  assert.match(gap, /trigger: verification-gap/);
  assert.match(gap, /gap: service:demo\/web/);
});

test('Declaration Intake只把已确认且不改变长期适用性的diff分类为routine maintenance', () => {
  assert.deepEqual(classifyDeclarationMaintenance({ evidenceConfirmed: true }), {
    classification: 'routine-maintenance',
    requiresUserDecision: false,
    reasons: [],
  });
  assert.deepEqual(classifyDeclarationMaintenance({ evidenceConfirmed: true, requirednessChanged: true, externalEffectsChanged: true }), {
    classification: 'user-decision-required',
    requiresUserDecision: true,
    reasons: ['requirednessChanged', 'externalEffectsChanged'],
  });
  assert.deepEqual(classifyDeclarationMaintenance({}), {
    classification: 'user-decision-required',
    requiresUserDecision: true,
    reasons: ['evidence-unconfirmed'],
  });
});

test('Declaration Intake trigger拒绝无Project或无trigger输入', () => {
  assert.throws(() => declarationIntakeNextAction({ trigger: '', project: 'demo' }), /trigger is required/);
  assert.throws(() => declarationIntakeNextAction({ trigger: 'explicit-refresh', project: '' }), /project is required/);
});
