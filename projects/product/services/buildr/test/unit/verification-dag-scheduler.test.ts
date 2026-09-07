import assert from 'node:assert/strict';
import test from 'node:test';
import { createVerificationSchedulingPriorities, parseVerificationSchedulingMode, runVerificationDag } from '../../test/verification/dag-scheduler.ts';

const step: any = (id: any, dependsOn: any = [], concurrencyClass: any = 'default', schedulingCostMs: any) => ({
  id, name: id, dependsOn, concurrencyClass, ...(schedulingCostMs == null ? {} : { schedulingCostMs }),
});
const plan: any = (steps: any) => ({ steps });

test('scheduler 遵守全局与 class 上限并按 plan 顺序返回', async () => {
  let active: any = 0;
  let peak: any = 0;
  const started: any[] = [];
  const results: any = await runVerificationDag(plan([step('a'), step('b'), step('c')]), {
    concurrency: { global: 2, classes: { default: 2, exclusive: 1 } },
    onStart: (item: any) => started.push(item.id),
    execute: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve: any) => setTimeout(resolve, 15));
      active -= 1;
      return { status: 'passed', exitCode: 0, durationMs: 15 };
    },
  });
  assert.equal(peak, 2);
  assert.deepEqual(started, ['a', 'b', 'c']);
  assert.deepEqual(results.map((item: any) => item.id), ['a', 'b', 'c']);
});

test('scheduler 将失败依赖的传递后续标记 blocked 并保留无关结果', async () => {
  const results: any = await runVerificationDag(plan([
    step('root'), step('child', ['root']), step('grandchild', ['child']), step('independent'),
  ]), {
    concurrency: { global: 4, classes: { default: 4, exclusive: 1 } },
    execute: async (item: any) => ({ status: item.id === 'root' ? 'failed' : 'passed', exitCode: item.id === 'root' ? 7 : 0, durationMs: 1 }),
  });
  assert.deepEqual(results.map((item: any) => item.status), ['failed', 'blocked', 'blocked', 'passed']);
  assert.equal(results[1].blockedBy, 'root');
  assert.equal(results[2].blockedBy, 'child');
  assert.match(results[1].queuedAt, /^\d{4}-/);
  assert.match(results[1].blockedAt, /^\d{4}-/);
  assert.equal(results[1].durationMs, 0);
  assert.equal('startedAt' in results[1], false);
  assert.equal('finishedAt' in results[1], false);
});

test('scheduler 记录 queued、started、finished 与 queue duration', async () => {
  let timestamp: any = 1000;
  const results: any = await runVerificationDag(plan([step('root'), step('child', ['root'])]), {
    concurrency: { global: 1, classes: { default: 1, exclusive: 1 } },
    now: () => {
      const current: any = timestamp;
      timestamp += 10;
      return current;
    },
    execute: async () => ({ status: 'passed', exitCode: 0, durationMs: 5 }),
  });
  assert.deepEqual(results.map((item: any) => ({
    queuedAt: item.queuedAt,
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
    queueDurationMs: item.queueDurationMs,
  })), [
    {
      queuedAt: '1970-01-01T00:00:01.000Z',
      startedAt: '1970-01-01T00:00:01.010Z',
      finishedAt: '1970-01-01T00:00:01.020Z',
      queueDurationMs: 10,
    },
    {
      queuedAt: '1970-01-01T00:00:01.000Z',
      startedAt: '1970-01-01T00:00:01.030Z',
      finishedAt: '1970-01-01T00:00:01.040Z',
      queueDurationMs: 30,
    },
  ]);
});

test('scheduler 优先启动高成本 ready step、稳定处理同成本并按 plan 顺序返回', async () => {
  const started: any[] = [];
  const results: any = await runVerificationDag(plan([
    step('low', [], 'default', 1),
    step('high-a', [], 'default', 10),
    step('high-b', [], 'default', 10),
  ]), {
    concurrency: { global: 1, classes: { default: 1, exclusive: 1 } },
    schedulingMode: 'cost',
    onStart: (item: any) => started.push(item.id),
    execute: async () => ({ status: 'passed', exitCode: 0, durationMs: 1 }),
  });
  assert.deepEqual(started, ['high-a', 'high-b', 'low']);
  assert.deepEqual(results.map((item: any) => item.id), ['low', 'high-a', 'high-b']);
});

test('critical-path 模式优先启动低成本 producer 以提前解锁长尾', async () => {
  const verificationPlan: any = plan([
    step('independent', [], 'default', 80),
    step('chain-root', [], 'default', 10),
    step('chain-tail', ['chain-root'], 'default', 100),
    step('filler', [], 'default', 70),
  ]);
  const priorities: any = createVerificationSchedulingPriorities(verificationPlan);
  assert.deepEqual(priorities.get('chain-root'), {
    stepCostMs: 10,
    remainingCostMs: 110,
    directDependentCount: 1,
  });
  const started: any[] = [];
  const results: any = await runVerificationDag(verificationPlan, {
    concurrency: { global: 1, classes: { default: 1, exclusive: 1 } },
    schedulingMode: 'critical-path',
    onStart: (item: any) => started.push(item.id),
    execute: async () => ({ status: 'passed', exitCode: 0, durationMs: 1 }),
  });
  assert.deepEqual(started, ['chain-root', 'chain-tail', 'independent', 'filler']);
  assert.deepEqual(results.find((result: any) => result.id === 'chain-root').scheduling, {
    mode: 'critical-path',
    stepCostMs: 10,
    remainingCostMs: 110,
    directDependentCount: 1,
    demand: { workers: 1, processes: 1 },
    grant: { workers: 1, processes: 1 },
  });
});

test('scheduler按数值容量发放完整grant并阻止outer乘inner过度订阅', async () => {
  let activeWorkers: any = 0;
  let peakWorkers: any = 0;
  const grants: any[] = [];
  const heavy: any = (id: any) => ({ ...step(id), resourceDemand: { workers: 3, processes: 2, git: 1 } });
  await runVerificationDag(plan([heavy('a'), heavy('b'), heavy('c')]), {
    concurrency: { global: 3, classes: { default: 3 }, resources: {}, capacities: { workers: 6, processes: 4, git: 2 } },
    execute: async (_item: any, context: any) => {
      grants.push(context.resourceGrant);
      activeWorkers += context.resourceGrant.workers;
      peakWorkers = Math.max(peakWorkers, activeWorkers);
      await new Promise((resolve: any) => setTimeout(resolve, 5));
      activeWorkers -= context.resourceGrant.workers;
      return { status: 'passed', exitCode: 0, durationMs: 5 };
    },
  });
  assert.equal(peakWorkers, 6);
  assert.deepEqual(grants, [
    { workers: 3, processes: 2, git: 1 },
    { workers: 3, processes: 2, git: 1 },
    { workers: 3, processes: 2, git: 1 },
  ]);
});

test('scheduler在启动step前拒绝超过profile容量的需求', async () => {
  let calls: any = 0;
  await assert.rejects(runVerificationDag(plan([{ ...step('too-heavy'), resourceDemand: { workers: 5, processes: 1 } }]), {
    concurrency: { global: 1, classes: { default: 1 }, resources: {}, capacities: { workers: 4, processes: 2 } },
    execute: async () => { calls += 1; return { status: 'passed', exitCode: 0, durationMs: 1 }; },
  }), /Unsatisfied workers resource demand/);
  assert.equal(calls, 0);
});

test('critical-path 同分时优先 fan-out producer，再按自身成本和声明顺序稳定回退', async () => {
  const started: any[] = [];
  await runVerificationDag(plan([
    step('plain', [], 'default', 10),
    step('producer', [], 'default', 10),
    step('child-a', ['producer'], 'default', 0),
    step('child-b', ['producer'], 'default', 0),
  ]), {
    concurrency: { global: 1, classes: { default: 1, exclusive: 1 } },
    schedulingMode: 'critical-path',
    onStart: (item: any) => started.push(item.id),
    execute: async () => ({ status: 'passed', exitCode: 0, durationMs: 1 }),
  });
  assert.deepEqual(started, ['producer', 'plain', 'child-a', 'child-b']);
});

test('scheduler 不为尚未 ready 的高成本 step 空置容量', async () => {
  const started: any[] = [];
  await runVerificationDag(plan([
    step('root', [], 'default', 1),
    step('high', ['root'], 'default', 100),
    step('ready', [], 'default', 50),
  ]), {
    concurrency: { global: 1, classes: { default: 1, exclusive: 1 } },
    schedulingMode: 'cost',
    onStart: (item: any) => started.push(item.id),
    execute: async () => ({ status: 'passed', exitCode: 0, durationMs: 1 }),
  });
  assert.deepEqual(started, ['ready', 'root', 'high']);
});

test('declaration 模式复现 plan 启动顺序并拒绝未知模式', async () => {
  const started: any[] = [];
  await runVerificationDag(plan([
    step('first', [], 'default', 1), step('second', [], 'default', 100),
  ]), {
    concurrency: { global: 1, classes: { default: 1, exclusive: 1 } },
    schedulingMode: 'declaration',
    onStart: (item: any) => started.push(item.id),
    execute: async () => ({ status: 'passed', exitCode: 0, durationMs: 1 }),
  });
  assert.deepEqual(started, ['first', 'second']);
  assert.equal(parseVerificationSchedulingMode(), 'cost');
  assert.throws(() => parseVerificationSchedulingMode('unknown'), /Invalid verification scheduling mode/);
});

test('exclusive step 不与其他 step 重叠', async () => {
  const events: any[] = [];
  await runVerificationDag(plan([step('a'), step('exclusive', [], 'exclusive'), step('b')]), {
    concurrency: { global: 3, classes: { default: 3, exclusive: 1 } },
    execute: async (item: any) => {
      events.push(`start:${item.id}`);
      await new Promise((resolve: any) => setTimeout(resolve, 5));
      events.push(`end:${item.id}`);
      return { status: 'passed', exitCode: 0, durationMs: 5 };
    },
  });
  const exclusiveStart: any = events.indexOf('start:exclusive');
  const exclusiveEnd: any = events.indexOf('end:exclusive');
  for (const id of ['a', 'b']) {
    const start: any = events.indexOf(`start:${id}`);
    const end: any = events.indexOf(`end:${id}`);
    assert.ok(end < exclusiveStart || start > exclusiveEnd, `${id} overlapped exclusive`);
  }
});

test('scheduler 对饱和型资源应用独立上限', async () => {
  let active: any = 0;
  let peak: any = 0;
  const saturated: any = (id: any) => ({ ...step(id, [], 'default'), resources: ['workspace-saturating'] });
  await runVerificationDag(plan([saturated('a'), saturated('b')]), {
    concurrency: { global: 2, classes: { default: 2 }, resources: { 'workspace-saturating': 1 } },
    execute: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve: any) => setTimeout(resolve, 5));
      active -= 1;
      return { status: 'passed', exitCode: 0, durationMs: 5 };
    },
  });
  assert.equal(peak, 1);
});

test('scheduler 在启动 verifier 前拒绝非法并发上限', async () => {
  let calls: any = 0;
  await assert.rejects(runVerificationDag(plan([step('a')]), {
    concurrency: { global: 0, classes: { default: 1 } },
    execute: async () => { calls += 1; return { status: 'passed', exitCode: 0, durationMs: 1 }; },
  }), /Invalid global concurrency limit/);
  assert.equal(calls, 0);
});

test('critical-path priority 在非法 cycle 上 fail closed', () => {
  assert.throws(() => createVerificationSchedulingPriorities(plan([
    step('a', ['b'], 'default', 1),
    step('b', ['a'], 'default', 1),
  ])), /Verification scheduling priority cycle/);
});
