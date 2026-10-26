import assert from 'node:assert/strict';
import test from 'node:test';

import { validateVerificationRegistry } from '../verification/planner.ts';
import { verificationSteps } from '../verification/registry.ts';

const unit: any = verificationSteps.find((step: any) => step.id === 'unit');

function registryStep(testing: any, profiles: any = [], overrides: any = {}): any  {
  return [{
    ...unit,
    id: 'sample',
    profiles,
    testing: { ...testing, primaryEvidenceOwner: 'sample' },
    ...overrides,
  }];
}

function findingCodes(steps: any): any  {
  return validateVerificationRegistry(steps).findings.map((finding: any) => finding.code);
}

test('current verification registry 声明完整环境足迹与重置负担', () => {
  assert.deepEqual(validateVerificationRegistry(), { ok: true, findings: [] });
});

test('registry 拒绝缺失环境足迹或重置负担的 step', () => {
  const { environment: _environment, resetBurden: _resetBurden, ...incomplete }: any = unit.testing;
  assert.deepEqual(findingCodes(registryStep(incomplete)).sort(), ['invalid_reset_burden', 'missing_testing_environment']);
});

test('Unit rejects real external boundaries and cleanup obligations', () => {
  for (const footprint of ['filesystem', 'cli', 'git', 'network', 'workspace-lifecycle']) {
    const testing = { ...unit.testing, environment: { footprints: [footprint], isolation: 'unique-temporary-root' }, resetBurden: 'single-cleanup' };
    assert.ok(findingCodes(registryStep(testing)).includes('unit_external_boundary'), footprint);
  }
  assert.ok(findingCodes(registryStep({ ...unit.testing, resetBurden: 'single-cleanup' })).includes('unit_external_boundary'));
  assert.deepEqual(findingCodes(registryStep(unit.testing)), []);
});

test('Integration admits isolated real boundaries without a duration admission gate', () => {
  const testing = { ...unit.testing, executionBoundary: 'Integration', environment: { footprints: ['filesystem', 'git'], isolation: 'unique-temporary-root' }, resetBurden: 'repeated-cleanup' };
  assert.deepEqual(validateVerificationRegistry(registryStep(testing)), { ok: true, findings: [] });
});

test('registry accepts the four test classes and rejects an unrecognized class', () => {
  for (const executionBoundary of ['Static', 'Unit', 'Integration', 'E2E']) {
    assert.deepEqual(findingCodes(registryStep({ ...unit.testing, executionBoundary })), []);
  }
  assert.ok(findingCodes(registryStep({ ...unit.testing, executionBoundary: 'Unknown' })).includes('invalid_testing_boundary'));
});

test('registry在执行前闭合验证Context、隔离/reset、并行安全和数值需求', () => {
  const invalid: any = registryStep(unit.testing, [], {
    contexts: ['missing/v1'],
    isolationMode: 'shared-mutable',
    resetStrategy: 'magic',
    parallelSafety: 'unbounded',
    resourceDemand: { workers: 0, processes: 99, gpu: 1 },
  });
  const codes: any = findingCodes(invalid);
  assert.ok(codes.includes('unknown_context'));
  assert.ok(codes.includes('invalid_isolation_mode'));
  assert.ok(codes.includes('invalid_reset_strategy'));
  assert.ok(codes.includes('invalid_parallel_safety'));
  assert.ok(codes.includes('invalid_resource_demand'));
  assert.ok(codes.includes('unsatisfied_resource_demand'));
  assert.ok(codes.includes('unknown_resource_demand'));
});
