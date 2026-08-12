import assert from 'node:assert/strict';
import test from 'node:test';

import { runVerificationCapabilities } from '../../src/application/verification/capability-runner.mjs';

function capability(id) {
  return { id, title: id, resourceClaims: [] };
}

test('production runner 并发执行显式 capability 集合且失败不建立 DAG authority', async () => {
  let active = 0;
  let maximum = 0;
  const started = [];
  const result = await runVerificationCapabilities([capability('a'), capability('b'), capability('after')], {
    concurrency: 2,
    execute: async (item) => {
      started.push(item.id);
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return { status: item.id === 'a' ? 'failed' : 'passed', exitCode: item.id === 'a' ? 1 : 0, signal: null, durationMs: 10, stdout: '', stderr: '' };
    },
  });
  assert.equal(maximum, 2);
  assert.deepEqual(started, ['a', 'b', 'after']);
  assert.deepEqual(result.map((entry) => entry.status), ['failed', 'passed', 'passed']);
  assert.ok(result.every((entry) => entry.queuedAt && entry.startedAt && entry.finishedAt));
});

test('production runner 拒绝空集合和非法并发参数', async () => {
  await assert.rejects(runVerificationCapabilities([], { execute: async () => ({}) }), /at least one capability/);
  await assert.rejects(runVerificationCapabilities([capability('a')], { concurrency: 0, execute: async () => ({}) }), /integer from 1 to 32/);
});
