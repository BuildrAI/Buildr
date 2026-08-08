import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeTaskEnvironmentReceipt,
  TASK_ENVIRONMENT_RECEIPT_SCHEMA,
  taskEnvironmentReadModel,
} from '../../src/domain/task-environment/task-environment.mjs';
import { normalizePreparationStepDefinition, normalizeTaskEnvironmentPlan, taskEnvironmentPlanDigest } from '../../src/domain/task-environment/task-environment-plan.mjs';

function receipt(overrides = {}) {
  const step = normalizePreparationStepDefinition({
    id: 'install', cwd: '.', executable: { kind: 'workspace-foundation', name: 'npm' }, args: ['ci'],
    inputs: ['package.json', 'package-lock.json'], outputs: [{ path: 'node_modules', kind: 'directory' }], required: true, timeoutMs: 180_000,
  }, 'fixture', 0);
  const recipePayload = { project: 'product', id: 'install-buildr', title: null, scope: { kind: 'service', service: 'buildr' }, required: true, steps: [step] };
  const recipe = { id: recipePayload.id, title: null, required: true, steps: [step], identity: taskEnvironmentPlanDigest(recipePayload) };
  const planPayload = {
    schemaVersion: 'buildr.task-environment-plan/v2',
    projects: [{
      project: 'product', source: { kind: 'task-inline', path: null, identity: null },
      scopes: [
        { selector: 'project:product', disposition: 'not-applicable', reason: 'No Project-wide preparation.', recipes: [] },
        { selector: 'service:product/buildr', disposition: 'required', reason: 'Buildr dependencies are required.', recipes: [recipe] },
      ],
    }],
  };
  const plan = normalizeTaskEnvironmentPlan({ ...planPayload, identity: taskEnvironmentPlanDigest(planPayload) }, { scopeSelectors: ['project:product', 'service:product/buildr'] });
  const scopeProbe = {
    runtime: { status: 'ready', identity: 'node-23', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
    cli: { status: 'ready', identity: 'cli-one', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
    preparation: { status: 'ready', identity: 'plan-one', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
    projection: { status: 'ready', identity: 'projection-one', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
  };
  return {
    schemaVersion: TASK_ENVIRONMENT_RECEIPT_SCHEMA,
    taskId: 'demo-task',
    workspace: { id: 'workspace-id', root: '/tmp/workspace' },
    controller: { sourceRoot: '/opt/buildr', cliSource: '/opt/buildr/bin/buildr.mjs', identity: 'sha256-controller', adapter: 'codex' },
    status: 'ready',
    scopes: [{
      selector: 'workspace', kind: 'workspace', project: null, service: null, sourcePath: '.',
      executionRoot: '/tmp/workspace/.worktrees/demo-task', validationRoot: '/tmp/workspace/.worktrees/demo-task', shared: false,
      provider: { capability: 'buildr.git-worktree-provider/v1', selector: 'workspace', evidence: '/tmp/workspace/.git/buildr/task-worktrees/demo-task.json' },
      ...scopeProbe,
    }, {
      selector: 'project:product', kind: 'project', project: 'product', service: null, sourcePath: 'projects/product',
      executionRoot: '/tmp/workspace/.worktrees/demo-task/projects/product', validationRoot: '/tmp/workspace/.worktrees/demo-task', shared: false, provider: null, ...scopeProbe,
    }, {
      selector: 'service:product/buildr', kind: 'service', project: 'product', service: 'buildr', sourcePath: 'projects/product/services/buildr',
      executionRoot: '/tmp/workspace/.worktrees/demo-task/projects/product/services/buildr', validationRoot: '/tmp/workspace/.worktrees/demo-task', shared: false, provider: null, ...scopeProbe,
    }],
    preparationPlan: plan,
    preparationDeclarations: [{ project: 'product', source: 'task-inline', path: null, identity: null, preparedIdentity: null, status: 'ready', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null }],
    preparationScopes: [
      { selector: 'project:product', disposition: 'not-applicable', status: 'not-applicable', recipeIds: [], observedAt: '2026-08-02T00:00:00.000Z', diagnostic: 'No Project-wide preparation.' },
      { selector: 'service:product/buildr', disposition: 'required', status: 'ready', recipeIds: ['service:product/buildr/install-buildr'], observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
    ],
    preparationRecipes: [{
      id: 'service:product/buildr/install-buildr', project: 'product', scope: 'service:product/buildr', recipe: 'install-buildr', source: 'task-inline', required: true,
      identity: recipe.identity, preparedIdentity: recipe.identity, status: 'ready', stepIds: ['service:product/buildr/install-buildr/install'], observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null,
    }],
    preparationSteps: [{
      id: 'service:product/buildr/install-buildr/install', scope: 'service:product/buildr', recipe: 'install-buildr', required: true, executed: true,
      cwd: '/tmp/workspace/.worktrees/demo-task/projects/product/services/buildr', executable: '/opt/node/bin/npm',
      executableIdentity: 'sha256-npm', preparedExecutableIdentity: 'sha256-npm',
      inputs: [
        { path: '/tmp/workspace/.worktrees/demo-task/projects/product/services/buildr/package.json', identity: 'sha256-manifest', preparedIdentity: 'sha256-manifest' },
        { path: '/tmp/workspace/.worktrees/demo-task/projects/product/services/buildr/package-lock.json', identity: 'sha256-lock', preparedIdentity: 'sha256-lock' },
      ],
      outputs: [{ path: '/tmp/workspace/.worktrees/demo-task/projects/product/services/buildr/node_modules', kind: 'directory', status: 'ready', diagnostic: null }],
      status: 'ready', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null,
    }],
    resources: [{
      id: 'preview-demo', kind: 'preview', scope: 'workspace', provider: 'local-app-preview', handle: { instance: 'demo' }, status: 'running',
      identity: { productCheckout: '/workspace/projects/product/services/buildr', url: 'http://127.0.0.1:4321', port: 4321, pid: 1234, providerIdentity: 'preview-demo-1234' },
      probe: { status: 'ready', identity: 'preview-one', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
      registeredAt: '2026-08-02T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z',
    }],
    latest: { ready: { status: 'ready', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null }, cleanup: null },
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
    ...overrides,
  };
}

test('Environment Receipt v5规范化Declaration、Plan、Recipe/Step、实际scope和资源事实', () => {
  assert.deepEqual(normalizeTaskEnvironmentReceipt(receipt()), receipt());
  assert.throws(() => normalizeTaskEnvironmentReceipt(receipt(), { expectedTaskId: 'other-task' }), (error) => error.code === 'task_environment_identity_mismatch');
  assert.throws(() => normalizeTaskEnvironmentReceipt(receipt(), { expectedWorkspaceRoot: '/tmp/other' }), (error) => error.code === 'task_environment_workspace_mismatch');
});

test('legacy Environment Receipt v2 保持只读兼容且 read model 明确标记 legacy', () => {
  const legacy = receipt({ schemaVersion: 'buildr.task-environment-receipt/v2' });
  delete legacy.preparationPlan;
  delete legacy.preparationDeclarations;
  delete legacy.preparationScopes;
  delete legacy.preparationRecipes;
  delete legacy.preparationSteps;
  legacy.scopes = legacy.scopes.map(({ preparation, ...scope }) => ({ ...scope, dependencies: preparation }));
  assert.deepEqual(normalizeTaskEnvironmentReceipt(legacy), legacy);
  assert.equal(taskEnvironmentReadModel(legacy).legacy, true);
  assert.deepEqual(taskEnvironmentReadModel(legacy).dependencyRoots, []);
});

test('Environment Receipt 是 closed schema，拒绝 Task Record、session、凭证和任意 cleanup 命令', () => {
  for (const field of ['title', 'intent', 'taskStatus', 'branch', 'session', 'credential', 'cleanupCommand', 'revision']) {
    assert.throws(() => normalizeTaskEnvironmentReceipt({ ...receipt(), [field]: 'forbidden' }), (error) => error.code === 'task_environment_field_forbidden' && error.details.field === field, field);
  }
  const withCommand = receipt({ resources: [{ ...receipt().resources[0], handle: { instance: 'demo', command: 'kill -9 1' } }] });
  assert.throws(() => normalizeTaskEnvironmentReceipt(withCommand), (error) => error.code === 'task_environment_field_forbidden' && error.details.field === 'resources[0].handle.command');
  const unknownProvider = receipt({ resources: [{ ...receipt().resources[0], provider: 'arbitrary-shell' }] });
  assert.throws(() => normalizeTaskEnvironmentReceipt(unknownProvider), (error) => error.code === 'task_environment_resource_provider_unknown');
});

test('公开 Environment read model 保留判断事实但不暴露 cleanup handle 或 controller CLI path', () => {
  const model = taskEnvironmentReadModel(receipt());
  assert.equal(model.resources[0].handle, undefined);
  assert.equal(model.controller.cliSource, undefined);
  assert.equal(model.scopes[0].provider.capability, 'buildr.git-worktree-provider/v1');
  assert.equal(model.scopes[0].projection.identity, 'projection-one');
  assert.equal(model.preparationSteps[0].scope, 'service:product/buildr');
  assert.equal(model.preparationPlan.projects[0].scopes[1].recipes[0].steps[0].executable.name, 'npm');
  assert.equal(model.preparationRecipes[0].recipe, 'install-buildr');
  assert.equal(model.legacy, false);
});
