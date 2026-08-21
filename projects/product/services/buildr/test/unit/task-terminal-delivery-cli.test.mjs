import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import { parseTaskTerminalDeliveryCli, taskTerminalDeliveryInspectCommand } from '../../src/task/interfaces/cli/task-terminal-delivery.mjs';

function projection(status, delivery = null) {
  return {
    schemaVersion: 'buildr.task-terminal-delivery/v1',
    taskId: 'delivery-task',
    taskStatus: status === 'delivered' ? 'completed' : 'active',
    status,
    delivered: status === 'delivered',
    delivery,
    snapshot: null,
    associations: { planning: null, completion: null, verification: null },
    diagnostics: [],
    development: {},
    reviews: {},
    verification: {},
  };
}

test('Terminal Delivery CLI parser只接受Task ID、target和json', () => {
  const targetRoot = path.join(os.tmpdir(), 'buildr-terminal-delivery-cli');
  assert.deepEqual(parseTaskTerminalDeliveryCli(['delivery-task', '--target', targetRoot, '--json']), {
    taskId: 'delivery-task',
    targetRoot: path.resolve(targetRoot),
    json: true,
  });
  for (const args of [[], ['one', 'two'], ['one', '--run', 'run-1'], ['one', '--json', '--json']]) {
    assert.throws(() => parseTaskTerminalDeliveryCli(args), (error) => error.code === 'task_terminal_delivery_cli.syntax');
  }
});

test('Terminal Delivery CLI仅委托既有Application并原样公开delivered、current与无run状态', (t) => {
  let stdout = '';
  t.mock.method(process.stdout, 'write', (chunk) => { stdout += chunk; return true; });
  const calls = [];
  const outputs = [
    projection('delivered', { runId: 'run-delivered', finalRemoteRef: 'abc123', cleanup: { status: 'cleaned' } }),
    projection('cleanup-pending', { runId: 'run-current', phase: 'cleanup', nextAction: 'buildr task finish run --run run-current --resume token' }),
    projection('active'),
  ];
  const runtime = {
    inspectTaskTerminalDelivery(targetRoot, taskId) {
      calls.push({ targetRoot, taskId });
      return outputs[calls.length - 1];
    },
  };
  for (const expected of outputs) {
    stdout = '';
    const actual = taskTerminalDeliveryInspectCommand(runtime, ['delivery-task', '--target', '/workspace', '--json']);
    assert.deepEqual(actual, expected);
    assert.deepEqual(JSON.parse(stdout), expected);
  }
  assert.deepEqual(calls, [
    { targetRoot: '/workspace', taskId: 'delivery-task' },
    { targetRoot: '/workspace', taskId: 'delivery-task' },
    { targetRoot: '/workspace', taskId: 'delivery-task' },
  ]);
});

test('Terminal Delivery人类输出只呈现紧凑恢复摘要', (t) => {
  const lines = [];
  t.mock.method(console, 'log', (line) => { lines.push(line); });
  const runtime = { inspectTaskTerminalDelivery: () => projection('delivered', { runId: 'run-1', finalRemoteRef: 'abc123', cleanup: { status: 'cleaned' } }) };
  taskTerminalDeliveryInspectCommand(runtime, ['delivery-task', '--target', '/workspace']);
  assert.deepEqual(lines, [
    'Task delivery-task delivery: delivered',
    'Run: run-1',
    'Final remote ref: abc123',
    'Cleanup: cleaned',
  ]);
});
