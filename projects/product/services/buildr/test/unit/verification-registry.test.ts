import assert from 'node:assert/strict';
import test from 'node:test';

import { validateVerificationRegistry } from '../../test/verification/planner.ts';
import { verificationSteps } from '../../test/verification/registry.ts';

const unit: any = verificationSteps.find((step: any) => step.id === 'unit');

function registryStep(testing: any, profiles: any = ['fast'], overrides: any = {}): any  {
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

test('Component 不得穿过真实 filesystem 或承担 cleanup', () => {
  const testing: any = {
    ...unit.testing,
    executionBoundary: 'Component',
    environment: { footprints: ['filesystem'], isolation: 'unique-temporary-root' },
    resetBurden: 'single-cleanup',
  };
  assert.ok(findingCodes(registryStep(testing)).includes('component_environment_boundary'));
});

test('Quick 拒绝重复重置并只允许无重置的隔离 Integration 例外', () => {
  const integration: any = {
    ...unit.testing,
    executionBoundary: 'Integration',
    environment: { footprints: ['filesystem'], isolation: 'unique-temporary-root' },
    resetBurden: 'repeated-cleanup',
  };
  const rejected: any = findingCodes(registryStep(integration));
  assert.ok(rejected.includes('quick_reset_burden'));
  assert.ok(rejected.includes('quick_integration_not_isolated'));

  const admitted: any = {
    ...integration,
    environment: { footprints: ['cli'], isolation: 'read-only' },
    resetBurden: 'none',
  };
  assert.deepEqual(validateVerificationRegistry(registryStep(admitted)), { ok: true, findings: [] });
});

test('Quick Integration 拒绝 Git、network、Workspace lifecycle 或共享环境', () => {
  for (const footprint of ['git', 'network', 'workspace-lifecycle']) {
    const testing: any = {
      ...unit.testing,
      executionBoundary: 'Integration',
      environment: { footprints: [footprint], isolation: 'unique-temporary-root' },
      resetBurden: 'none',
    };
    assert.ok(findingCodes(registryStep(testing)).includes('quick_integration_not_isolated'), footprint);
  }
});

test('registry在执行前闭合验证Context、隔离/reset、并行安全和数值需求', () => {
  const invalid: any = registryStep(unit.testing, ['fast'], {
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
