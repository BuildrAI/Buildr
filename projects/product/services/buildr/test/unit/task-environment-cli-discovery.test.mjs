import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TASK_ENVIRONMENT_PLAN_REQUEST_EXAMPLE,
  TASK_ENVIRONMENT_PLAN_REQUEST_INPUT_SCHEMA,
  normalizeTaskEnvironmentPlanRequest,
} from '../../src/task/domain/task-environment-plan.mjs';
import { taskEnvironmentPlanCommand } from '../../src/task/interfaces/cli/task-environment.mjs';

async function capture(args) {
  let output = '';
  const original = process.stdout.write;
  process.stdout.write = (value) => { output += value; return true; };
  try {
    const runtime = new Proxy({}, { get() { throw new Error('discovery must not access runtime'); } });
    const result = await taskEnvironmentPlanCommand(runtime, 'record', args);
    return { result, output: JSON.parse(output) };
  } finally {
    process.stdout.write = original;
  }
}

test('Environment Plan record schema与实际request normalizer同模块导出', async () => {
  const { result, output } = await capture(['--schema']);
  assert.equal(result.operation, 'discover-schema');
  assert.deepEqual(output.inputSchema, TASK_ENVIRONMENT_PLAN_REQUEST_INPUT_SCHEMA);
  assert.equal(output.inputSchema.additionalProperties, false);
  assert.equal(output.effects.length, 0);
});

test('Environment Plan record example通过实际request normalizer且discovery零runtime访问', async () => {
  const { output } = await capture(['--example']);
  assert.deepEqual(output.input, TASK_ENVIRONMENT_PLAN_REQUEST_EXAMPLE);
  assert.deepEqual(
    normalizeTaskEnvironmentPlanRequest(output.input, { scopeSelectors: ['service:product/buildr'] }),
    {
      ...TASK_ENVIRONMENT_PLAN_REQUEST_EXAMPLE,
      projects: [{
        ...TASK_ENVIRONMENT_PLAN_REQUEST_EXAMPLE.projects[0],
        source: { ...TASK_ENVIRONMENT_PLAN_REQUEST_EXAMPLE.projects[0].source },
        scopes: [{ ...TASK_ENVIRONMENT_PLAN_REQUEST_EXAMPLE.projects[0].scopes[0], recipes: null }],
      }],
    },
  );
  assert.equal(output.effects.length, 0);
});

test('Environment Plan record discovery flags互斥且不能混用record输入', async () => {
  await assert.rejects(() => capture(['--schema', '--example']), /exactly one/u);
  await assert.rejects(() => capture(['--schema', '--input', 'plan.json']), /accepts only/u);
});
