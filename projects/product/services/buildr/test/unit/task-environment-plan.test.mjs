import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTaskEnvironmentPlan } from '../../src/domain/task-environment/task-environment-plan.mjs';

function service(selector, id = 'prepare') {
  return {
    selector,
    disposition: 'required',
    steps: [{
      id, cwd: '.', executable: { kind: 'workspace-foundation', name: 'npm' }, args: ['ci'],
      inputs: ['package.json', 'package-lock.json'], outputs: [{ path: 'node_modules', kind: 'directory' }], required: true, timeoutMs: 180_000,
    }],
  };
}

test('Plan恰好覆盖多个Task Service并形成稳定identity', () => {
  const input = { schemaVersion: 'buildr.task-environment-plan/v1', services: [service('service:product/buildr'), service('service:product/buildr-web')] };
  const normalized = normalizeTaskEnvironmentPlan(input, { serviceSelectors: ['service:product/buildr-web', 'service:product/buildr'] });
  assert.match(normalized.identity, /^sha256-[a-f0-9]{64}$/);
  assert.deepEqual(normalizeTaskEnvironmentPlan(normalized, { serviceSelectors: ['service:product/buildr', 'service:product/buildr-web'] }), normalized);
});

test('Plan拒绝scope缺失、scope越权、shell/env和路径越界', () => {
  assert.throws(() => normalizeTaskEnvironmentPlan({ schemaVersion: 'buildr.task-environment-plan/v1', services: [service('service:product/buildr')] }, { serviceSelectors: ['service:product/buildr', 'service:product/buildr-web'] }), (error) => error.code === 'task_environment_plan_scope_incomplete');
  assert.throws(() => normalizeTaskEnvironmentPlan({ schemaVersion: 'buildr.task-environment-plan/v1', services: [service('service:product/other')] }, { serviceSelectors: ['service:product/buildr'] }), (error) => error.code === 'task_environment_plan_scope_incomplete');
  const withShell = service('service:product/buildr');
  withShell.steps[0].shell = true;
  assert.throws(() => normalizeTaskEnvironmentPlan({ schemaVersion: 'buildr.task-environment-plan/v1', services: [withShell] }, { serviceSelectors: ['service:product/buildr'] }), (error) => error.code === 'task_environment_plan_field_forbidden');
  const escaped = service('service:product/buildr');
  escaped.steps[0].cwd = '../buildr-web';
  assert.throws(() => normalizeTaskEnvironmentPlan({ schemaVersion: 'buildr.task-environment-plan/v1', services: [escaped] }, { serviceSelectors: ['service:product/buildr'] }), (error) => error.code === 'task_environment_plan_path_invalid');
});

test('无Service Task与not-applicable Service都必须显式说明', () => {
  const empty = normalizeTaskEnvironmentPlan({ schemaVersion: 'buildr.task-environment-plan/v1', notApplicableReason: 'Documentation-only Task.', services: [] }, { serviceSelectors: [] });
  assert.equal(empty.notApplicableReason, 'Documentation-only Task.');
  const notApplicable = normalizeTaskEnvironmentPlan({ schemaVersion: 'buildr.task-environment-plan/v1', services: [{ selector: 'service:docs/site', disposition: 'not-applicable', reason: 'No local technical preparation.', steps: [] }] }, { serviceSelectors: ['service:docs/site'] });
  assert.equal(notApplicable.services[0].disposition, 'not-applicable');
  assert.throws(() => normalizeTaskEnvironmentPlan({ schemaVersion: 'buildr.task-environment-plan/v1', services: [] }, { serviceSelectors: [] }), (error) => error.code === 'task_environment_plan_scope_incomplete');
});
