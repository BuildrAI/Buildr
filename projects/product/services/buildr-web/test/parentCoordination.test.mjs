import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildContributionProgressGroups,
  contributionDispositionLabel,
  startupBlockerLabel,
} from '../src/pages/task-detail/parentCoordination.ts';

function contribution(id, eligibility, actual = 'unassigned') {
  return {
    id,
    priority: 'P1',
    title: id,
    objective: `${id} objective`,
    directions: [],
    boundaries: [],
    dependencies: [],
    expectation: { status: 'none', child: null },
    eligibility: { status: eligibility, blockers: [] },
    actual: { status: actual },
    actualChild: null,
  };
}

test('迁移进度组顺序固定且每个贡献项只进入一组', () => {
  const contributions = [
    contribution('active', 'not-eligible', 'active'),
    contribution('startable', 'eligible'),
    contribution('waiting', 'waiting-dependency'),
  ];
  const groups = buildContributionProgressGroups(contributions, [{
    taskId: 'child-active',
    title: '进行中的子任务',
    status: 'active',
    boundContributions: ['active'],
    deliveryProven: false,
    delivery: null,
  }]);

  assert.deepEqual(groups.map((group) => group.label), ['进行中 / 已交付', '可启动', '等待依赖']);
  assert.deepEqual(groups.map((group) => group.items.map((item) => item.contribution.id)), [['active'], ['startable'], ['waiting']]);
});

test('子任务 completed 不会替代贡献交接证明', () => {
  const groups = buildContributionProgressGroups([contribution('unproven', 'not-eligible', 'unproven')], [{
    taskId: 'child-completed',
    title: '已完成子任务',
    status: 'completed',
    boundContributions: ['unproven'],
    deliveryProven: false,
    delivery: null,
  }]);

  assert.equal(groups[0].items[0].groupId, 'active-delivered');
  assert.equal(groups[0].items[0].deliveryProven, false);
});

test('只有保存的贡献交接才形成交付证明', () => {
  const groups = buildContributionProgressGroups([contribution('delivered', 'not-eligible', 'delivered')], [{
    taskId: 'child-delivered',
    title: '已交付子任务',
    status: 'completed',
    boundContributions: ['delivered'],
    deliveryProven: true,
    delivery: {
      handoffIdentity: 'sha256-handoff',
      delivered: ['delivered'],
      extra: [],
      residual: [],
      superseded: [],
      affected: [],
      nextAction: '继续父任务集成。',
    },
  }]);

  assert.equal(groups[0].items[0].deliveryProven, true);
});

test('未知状态与阻塞码不向界面泄漏英文枚举', () => {
  assert.equal(contributionDispositionLabel('future-status'), '未知状态');
  assert.equal(startupBlockerLabel({ axis: 'future', code: 'future_blocker' }), '存在尚未解除的启动阻塞。');
});
