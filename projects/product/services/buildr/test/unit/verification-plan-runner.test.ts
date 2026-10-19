import assert from 'node:assert/strict';
import test from 'node:test';

import { executePlan, FULL_PLAN_RESOURCE_ID, FULL_PLAN_WAIT_TIMEOUT_MS } from '../verification/plan-runner.ts';
import { verificationSteps } from '../verification/registry.ts';

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

test('long nested and cross-domain owners retain their deadlines while avoiding competing outer owners', () => {
  for (const id of ['system-nested-git-isolation', 'integration']) assert.equal(verificationSteps.find((step: any) => step.id === id).concurrencyClass, 'exclusive');
  assert.equal(verificationSteps.find((step: any) => step.id === 'integration').timeoutMs, 300_000);
});

test('Full plan 持有跨 Task 共享容量直到整个 DAG 结束', async () => {
  const events: any[] = [];
  const output: any[] = [];
  const plan = { ...emptyPlan('full'), steps: [{ id: 'local-check', name: 'local check', dependsOn: [], contexts: [] }] };
  const result: any = await executePlan(plan, {
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

for (const mode of ['affected', 'full']) test(`${mode} 空计划不占用 Full 共享容量`, async () => {
  const events: any[] = [];
  const result: any = await executePlan(emptyPlan(mode), {
    productRoot: process.cwd(),
    resourceCoordinator: coordinator(events),
    executorFactory: silentExecutor,
    stream: { write(): any  {} },
    errorStream: { write(): any  {} },
  });

  assert.deepEqual(events, []);
  assert.equal(result.fullPlanCoordination, null);
});

test('candidate round runs all groups initially and retries only failures after source and environment edits', async t => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const root = mkdtempSync(join(tmpdir(), 'buildr-round-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plan = { ...emptyPlan('affected'), runner: process.platform, steps: ['success', 'failure', 'independent'].map(id => ({ id, name: id, dependsOn: [], contexts: [], platformScope: { kind: 'common' } })) };
  const calls: string[] = []; let fail = true;
  const options = { productRoot: process.cwd(), resourceCoordinator: coordinator([]), reuse: false,
    round: { roundId: 'first', output: join(root, 'round.json') },
    executorFactory: () => async (step: any) => { calls.push(step.id); const passed = step.id !== 'failure' || !fail; return { id: step.id, status: passed ? 'passed' : 'failed', exitCode: passed ? 0 : 1, durationMs: 1 }; } };
  const first = await executePlan(plan, options);
  assert.equal(first.passed, false); assert.deepEqual([...calls].sort(), ['failure', 'independent', 'success']);
  const original = JSON.parse(JSON.stringify(first.sourceBundle.records.find((record: any) => record.identity.stepId === 'success')));
  writeFileSync(join(root, 'source.ts'), 'changed source, assertions and dependencies\n');
  fail = false; calls.length = 0;
  const second = await executePlan({ ...plan, steps: plan.steps.map(step => ({ ...step, executor: { type: 'changed-recipe' } })) }, { ...options, env: { NODE_OPTIONS: 'changed-environment' } });
  assert.equal(second.passed, true); assert.deepEqual(calls, ['failure']);
  assert.deepEqual(second.sourceBundle.records.find((record: any) => record.identity.stepId === 'success'), original);
  calls.length = 0;
  await executePlan(plan, { ...options, round: { roundId: 'next', output: join(root, 'next.json') } });
  assert.equal(calls.length, 3);
});
