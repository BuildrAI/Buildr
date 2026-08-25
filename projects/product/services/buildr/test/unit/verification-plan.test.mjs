import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertVerificationPlan,
  createVerificationPlan,
  createVerificationRequest,
} from '../../src/verification/domain/verification-plan.mjs';

function capability(id, services, sources, overrides = {}) {
  return {
    id,
    scope: { project: 'freshx', services },
    proves: [`${id} behavior`],
    evidence: ['unit'],
    usableFor: ['task-delivery', 'product-candidate'],
    discovery: { sources },
    invocation: {
      affected: { kind: 'command', argv: ['mvn', `-Dtest=${id}`, 'test'], cwd: '.' },
      full: { kind: 'command', argv: ['mvn', 'test'], cwd: '.' },
    },
    resourceClaims: [],
    ...overrides,
  };
}

function declaration(capabilities) {
  return { schemaVersion: 'buildr.project-verification/v3', resources: [], capabilities };
}

function request(overrides = {}) {
  return createVerificationRequest({
    project: 'freshx',
    services: ['freshx-pigs', 'business-common'],
    target: { kind: 'task-delivery', identity: 'target:freshx' },
    selection: { scope: 'affected' },
    changedPaths: ['services/freshx-pigs/src/main/java/Evaluation.java'],
    risks: [],
    declarations: [{ project: 'freshx', identity: 'sha256-declaration' }],
    dependencies: [],
    ...overrides,
  });
}

test('FreshX affected plan记录direct选择和affected execution unit', () => {
  const plan = createVerificationPlan({
    request: request(),
    declaration: declaration([capability('freshx-pigs.evaluation', ['freshx-pigs'], ['services/freshx-pigs/**'])]),
  });
  assert.equal(plan.status, 'ready');
  assert.equal(plan.selectedItems[0].selection.kind, 'direct');
  assert.equal(plan.selectedItems[0].selection.trigger, 'services/freshx-pigs/src/main/java/Evaluation.java');
  assert.equal(plan.executionUnits[0].scope, 'affected');
  assertVerificationPlan(plan);
});

test('Foundation consumer依赖以dependency parent扩张而不复制DAG', () => {
  const plan = createVerificationPlan({
    request: request({ dependencies: [{ from: 'business-common.api', to: 'freshx-pigs.consumer', reason: 'maven-consumer-edge' }], changedPaths: ['services/business-common/src/main/java/EvaluationApi.java'] }),
    declaration: declaration([
      capability('business-common.api', ['business-common'], ['services/business-common/**']),
      capability('freshx-pigs.consumer', ['freshx-pigs'], ['services/freshx-pigs/**']),
    ]),
  });
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.selectedItems.map((item) => [item.id, item.selection.kind, item.selection.parent]), [
    ['business-common.api', 'direct', null],
    ['freshx-pigs.consumer', 'dependency', 'business-common.api'],
  ]);
  assert.equal(Object.hasOwn(plan, 'dag'), false);
});

test('Pig无测试owner与显式unknown owner都失败关闭', () => {
  const plan = createVerificationPlan({
    request: request({ services: [], changedPaths: ['services/pig-customer/src/App.tsx'], risks: ['unknown-owner'] }),
    declaration: declaration([]),
  });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.selectedItems.length, 0);
  assert.ok(plan.coverageGaps.some((gap) => gap.code === 'unknown-owner'));
  assert.ok(plan.coverageGaps.some((gap) => gap.code === 'no-usable-capability'));
});

test('缺少affected入口或选择authority变化时显式扩大full', () => {
  const fullOnly = capability('freshx-pigs.full', ['freshx-pigs'], ['services/freshx-pigs/**'], {
    invocation: { full: { kind: 'command', argv: ['mvn', 'test'], cwd: '.' } },
  });
  const fallback = createVerificationPlan({ request: request(), declaration: declaration([fullOnly]) });
  assert.equal(fallback.selectedItems[0].selection.scope, 'full');
  assert.equal(fallback.selectedItems[0].selection.reasonCode, 'affected-entry-unavailable');

  const forced = createVerificationPlan({
    request: request({ risks: ['selection-authority-change'] }),
    declaration: declaration([capability('freshx-pigs.evaluation', ['freshx-pigs'], ['services/freshx-pigs/**'])]),
  });
  assert.equal(forced.selectedItems[0].selection.kind, 'full');
  assert.equal(forced.fullReasons[0].code, 'selection-authority-change');
});

test('Plan identity绑定closed内容且篡改后拒绝', () => {
  const plan = createVerificationPlan({
    request: request(),
    declaration: declaration([capability('freshx-pigs.evaluation', ['freshx-pigs'], ['services/freshx-pigs/**'])]),
  });
  assertVerificationPlan(plan);
  assert.throws(() => assertVerificationPlan({ ...plan, status: 'blocked' }), /identity does not match/);
});
