import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizePreparationStepDefinition,
  normalizeTaskEnvironmentPlan,
  normalizeTaskEnvironmentPlanRequest,
  taskEnvironmentPlanDigest,
} from '../../src/task/domain/task-environment-plan.mjs';

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

test('Plan Request覆盖Project/Service scope，resolved Plan绑定Declaration与Recipe identity', () => {
  const selectors = ['project:product', 'service:product/buildr'];
  const request = normalizeTaskEnvironmentPlanRequest({
    schemaVersion: 'buildr.task-environment-plan-request/v1',
    projects: [{
      project: 'product', source: { kind: 'project-declaration', identity: 'sha256-declaration' },
      scopes: [
        { selector: 'project:product', disposition: 'not-applicable', reason: 'No Project-wide preparation.' },
        { selector: 'service:product/buildr', disposition: 'required', reason: 'Buildr preparation is required.', recipeIds: ['buildr.npm-ci'] },
      ],
    }],
  }, { scopeSelectors: selectors });
  assert.equal(request.projects[0].source.identity, 'sha256-declaration');

  const step = normalizePreparationStepDefinition(service('service:product/buildr').steps[0], 'fixture', 0);
  const recipePayload = { project: 'product', id: 'buildr.npm-ci', title: null, scope: { kind: 'service', service: 'buildr' }, required: true, steps: [step] };
  const payload = {
    schemaVersion: 'buildr.task-environment-plan/v2',
    projects: [{
      project: 'product', source: { kind: 'project-declaration', path: 'projects/product/preparation.yml', identity: 'sha256-declaration' },
      scopes: [
        { selector: 'project:product', disposition: 'not-applicable', reason: 'No Project-wide preparation.', recipes: [] },
        { selector: 'service:product/buildr', disposition: 'required', reason: 'Buildr preparation is required.', recipes: [{ id: 'buildr.npm-ci', title: null, required: true, steps: [step], identity: taskEnvironmentPlanDigest(recipePayload) }] },
      ],
    }],
  };
  const plan = normalizeTaskEnvironmentPlan({ ...payload, identity: taskEnvironmentPlanDigest(payload) }, { scopeSelectors: selectors });
  assert.equal(plan.projects[0].source.identity, 'sha256-declaration');
  assert.match(plan.projects[0].scopes[1].recipes[0].identity, /^sha256-/);
  assert.throws(() => normalizeTaskEnvironmentPlanRequest({ ...request, projects: [{ ...request.projects[0], scopes: request.projects[0].scopes.slice(1) }] }, { scopeSelectors: selectors }), (error) => error.code === 'task_environment_plan_scope_incomplete');
});

test('Plan v3分离Task基础scope、capability辅助准备、typed path与executable authority', () => {
  const selectors = ['project:product', 'service:product/buildr'];
  const step = normalizePreparationStepDefinition(service('service:product/buildr-web').steps[0], 'fixture', 0);
  step.executable = { kind: 'project', name: null, path: 'services/buildr/tools/development/run-development-npm' };
  const recipeIdentity = taskEnvironmentPlanDigest({ project: 'product', id: 'buildr-web.npm-ci', title: null, scope: { kind: 'service', service: 'buildr-web' }, required: true, steps: [step] });
  const plan = normalizeTaskEnvironmentPlan({
    schemaVersion: 'buildr.task-environment-plan/v3',
    projects: [{
      project: 'product', source: { kind: 'project-declaration', path: 'projects/product/preparation.yml', identity: 'sha256-declaration' },
      scopes: [
        { selector: 'project:product', disposition: 'not-applicable', reason: 'No Project-wide preparation.', recipes: [] },
        { selector: 'service:product/buildr', disposition: 'not-applicable', reason: 'No base preparation.', recipes: [] },
      ],
    }],
    capabilityPreparation: [{
      capability: 'product.browser-smoke', capabilityIdentity: 'sha256-capability', project: 'product', selector: 'service:product/buildr-web',
      recipe: { id: 'buildr-web.npm-ci', title: null, required: true, steps: [step], identity: recipeIdentity },
    }],
  }, { scopeSelectors: selectors });
  assert.match(plan.identity, /^sha256-/);
  assert.equal(plan.projects.flatMap((project) => project.scopes).some((scope) => scope.selector.endsWith('/buildr-web')), false);
  assert.deepEqual(plan.capabilityPreparation[0].recipe.steps[0].pathReferences.cwd, { base: 'service', selector: 'service:product/buildr-web', path: '.' });
  assert.deepEqual(plan.capabilityPreparation[0].recipe.steps[0].executableAuthority, { kind: 'project-wrapper', project: 'product', path: 'services/buildr/tools/development/run-development-npm' });
  assert.deepEqual(normalizeTaskEnvironmentPlan(plan, { scopeSelectors: selectors }), plan);
  const drifted = structuredClone(plan);
  drifted.capabilityPreparation[0].recipe.steps[0].pathReferences.cwd.base = 'workspace';
  assert.throws(() => normalizeTaskEnvironmentPlan(drifted, { scopeSelectors: selectors }), (error) => error.code === 'task_environment_plan_path_reference_invalid');
});
