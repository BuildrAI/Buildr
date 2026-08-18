import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTaskFinishRepositoryStates,
  normalizeTaskFinishRepositorySet,
  singletonApplicableTaskFinishRepository,
  singletonTaskFinishRepositoryState,
  taskFinishCarrierSetIdentity,
  taskFinishDeliverySetIdentity,
  taskFinishRepositorySetIdentity,
} from '../../src/application/task-finish/task-finish-repository-set.mjs';

function contribution(identity, beforeTree, afterTree = beforeTree) {
  return {
    schemaVersion: 'buildr.git-task-contribution/v1',
    identity,
    originalBaseline: { head: `${identity}-baseline`, tree: beforeTree },
    source: { head: `${identity}-source`, tree: afterTree },
  };
}

function plan(overrides = {}) {
  return {
    selector: 'service:product/example',
    sourcePath: 'projects/product/services/example',
    retainedRoot: '/workspace/projects/product/services/example',
    taskRoot: '/workspace/.worktrees/task/projects/product/services/example',
    environmentBranch: 'codex/task',
    targetBranch: 'dev',
    remote: 'origin',
    disposition: 'applicable',
    reason: null,
    taskContribution: contribution('sha256-contribution', 'tree-before', 'tree-after'),
    ...overrides,
  };
}

test('repository set 按 selector 稳定排序并保留 no-contribution disposition', () => {
  const repositories = normalizeTaskFinishRepositorySet([
    plan(),
    plan({
      selector: 'workspace', sourcePath: '.', retainedRoot: '/workspace', taskRoot: '/workspace/.worktrees/task',
      remote: null, disposition: 'not-applicable', reason: 'no-contribution',
      taskContribution: contribution('sha256-workspace', 'workspace-tree'),
    }),
  ]);
  assert.deepEqual(repositories.map((repository) => repository.selector), ['service:product/example', 'workspace']);
  assert.match(taskFinishRepositorySetIdentity(repositories), /^sha256-[0-9a-f]{64}$/);
  assert.equal(repositories[1].leaseTargetIdentity, null);
  assert.equal(singletonApplicableTaskFinishRepository({ repositories }).selector, 'service:product/example');

  const states = createTaskFinishRepositoryStates(repositories);
  assert.equal(singletonTaskFinishRepositoryState({ identity: { repositories }, repositories: states }).selector, 'service:product/example');
  assert.equal(states.find((repository) => repository.selector === 'workspace').deliveryCarrier, null);
});

test('target lease identity 跨不同 Task worktree 对同一 retained target 保持相同', () => {
  const first = normalizeTaskFinishRepositorySet([plan({ taskRoot: '/workspace/.worktrees/task-a/service' })])[0];
  const second = normalizeTaskFinishRepositorySet([plan({ taskRoot: '/workspace/.worktrees/task-b/service', environmentBranch: 'codex/task-b' })])[0];
  assert.notEqual(first.repositoryIdentity, second.repositoryIdentity);
  assert.equal(first.leaseTargetIdentity, second.leaseTargetIdentity);
});

test('carrier set 与 delivery set 只聚合已形成的 repository facts', () => {
  const states = createTaskFinishRepositoryStates(normalizeTaskFinishRepositorySet([plan()]));
  assert.equal(taskFinishCarrierSetIdentity(states), null);
  assert.equal(taskFinishDeliverySetIdentity(states), null);
  states[0].deliveryCarrier = { identity: 'sha256-carrier' };
  states[0].delivery = { finalRemoteRef: '0123456789012345678901234567890123456789' };
  assert.match(taskFinishCarrierSetIdentity(states), /^sha256-[0-9a-f]{64}$/);
  assert.match(taskFinishDeliverySetIdentity(states), /^sha256-[0-9a-f]{64}$/);
});

test('repository set 对无 remote contribution 与伪 no-contribution fail closed', () => {
  assert.throws(() => normalizeTaskFinishRepositorySet([plan({ remote: null })]), /requires remote/);
  assert.throws(() => normalizeTaskFinishRepositorySet([plan({ disposition: 'not-applicable', reason: 'no-contribution', taskContribution: contribution('sha256-invalid', 'before', 'after') })]), /trees do not match/);
});
