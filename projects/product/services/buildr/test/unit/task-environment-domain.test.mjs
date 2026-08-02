import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeTaskEnvironmentReceipt,
  TASK_ENVIRONMENT_RECEIPT_SCHEMA,
  taskEnvironmentReadModel,
} from '../../src/domain/task-environment/task-environment.mjs';

function receipt(overrides = {}) {
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
      runtime: { status: 'ready', identity: 'node-23', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
      cli: { status: 'ready', identity: 'cli-one', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
      dependencies: { status: 'ready', identity: 'lock-one', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
      projection: { status: 'ready', identity: 'projection-one', observedAt: '2026-08-02T00:00:00.000Z', diagnostic: null },
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

test('Environment Receipt v2 规范化唯一 Task/Workspace、实际 scope、执行基础和资源事实', () => {
  assert.deepEqual(normalizeTaskEnvironmentReceipt(receipt()), receipt());
  assert.throws(() => normalizeTaskEnvironmentReceipt(receipt(), { expectedTaskId: 'other-task' }), (error) => error.code === 'task_environment_identity_mismatch');
  assert.throws(() => normalizeTaskEnvironmentReceipt(receipt(), { expectedWorkspaceRoot: '/tmp/other' }), (error) => error.code === 'task_environment_workspace_mismatch');
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
});
