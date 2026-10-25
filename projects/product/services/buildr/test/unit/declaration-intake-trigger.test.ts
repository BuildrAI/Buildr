import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyDeclarationMaintenance, declarationIntakeGapNextAction, declarationIntakeNextAction } from '../../src/infrastructure/contracts/declaration-intake.ts';

test('声明指引直接分配建设与准备职责并保持项目范围', () => {
  const projectOnly: any = declarationIntakeNextAction({ trigger: 'first-task-scope', project: 'demo' });
  assert.match(projectOnly, /scope: project:demo/);
  assert.doesNotMatch(projectOnly, /service:demo/);
  assert.match(projectOnly, /verification\.yml 直接由 project-testing/);
  assert.match(projectOnly, /已有授权内普通维护直接完成/);
  assert.match(projectOnly, /授权缺失或业务取舍反馈用户决定/);

  const services: any = declarationIntakeNextAction({ trigger: 'service-registered', project: 'demo', services: ['web', 'api', 'web'] });
  assert.match(services, /project:demo、service:demo\/api、service:demo\/web/);
  const gap: any = declarationIntakeGapNextAction({ kind: 'verification', project: 'demo', services: ['web'], scopes: ['service:demo/web'] });
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
