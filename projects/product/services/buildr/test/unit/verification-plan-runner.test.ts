import assert from 'node:assert/strict';
import test from 'node:test';

import { executePlan, FULL_PLAN_RESOURCE_ID, FULL_PLAN_WAIT_TIMEOUT_MS } from '../verification/plan-runner.ts';

function emptyPlan(mode: any): any  {
  return { scope: { mode }, steps: [], paths: [], delegated: [] };
}

function coordinator(events: any): any  {
  return {
    root: '/verification-coordination',
    async acquire(resources: any, options: any): Promise<any>  {
      events.push(['acquire', resources, options]);
      return {
        waitDurationMs: 17,
        async release(): Promise<any>  {
          events.push(['release', resources]);
          return resources.map((resource: any) => ({ resource, slot: 0, status: 'released' }));
        },
      };
    },
  };
}

const silentExecutor: any = () => async () => ({ status: 'passed', durationMs: 0 });

test('Full plan 持有跨 Task 共享容量直到整个 DAG 结束', async () => {
  const events: any[] = [];
  const output: any[] = [];
  const result: any = await executePlan(emptyPlan('full'), {
    productRoot: process.cwd(),
    resourceCoordinator: coordinator(events),
    executorFactory: silentExecutor,
    stream: { write: (value: any) => output.push(value) },
    errorStream: { write(): any  {} },
  });

  assert.deepEqual(events, [
    ['acquire', [FULL_PLAN_RESOURCE_ID], { signal: undefined, waitTimeoutMs: FULL_PLAN_WAIT_TIMEOUT_MS }],
    ['release', [FULL_PLAN_RESOURCE_ID]],
  ]);
  assert.deepEqual(result.fullPlanCoordination, {
    waitDurationMs: 17,
    release: [{ resource: FULL_PLAN_RESOURCE_ID, slot: 0, status: 'released' }],
  });
  assert.match(output.join(''), /waiting: product-full-execution/);
  assert.match(output.join(''), /acquired: product-full-execution wait=17ms/);
});

test('Affected plan 不占用 Full 共享容量', async () => {
  const events: any[] = [];
  const result: any = await executePlan(emptyPlan('affected'), {
    productRoot: process.cwd(),
    resourceCoordinator: coordinator(events),
    executorFactory: silentExecutor,
    stream: { write(): any  {} },
    errorStream: { write(): any  {} },
  });

  assert.deepEqual(events, []);
  assert.equal(result.fullPlanCoordination, null);
});
