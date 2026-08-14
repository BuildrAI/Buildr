#!/usr/bin/env node

import process from 'node:process';
import { performance } from 'node:perf_hooks';

import {
  TASK_DEVELOPMENT_ACTIONS,
  taskDevelopmentActionContract,
  taskDevelopmentDriverExample,
  taskDevelopmentDriverHelp,
  taskDevelopmentDriverSchema,
} from '../../application/task-development/task-development-operation-contracts.mjs';
import { compactTaskDevelopmentOperationResult } from '../../application/task-development/task-development-result-projection.mjs';

function option(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

function input(args) {
  const raw = option(args, '--input-json', '{}');
  let value;
  try { value = JSON.parse(raw); } catch (error) { throw new Error(`Invalid --input-json: ${error.message}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('--input-json must be a JSON object.');
  return value;
}

const args = process.argv.slice(2);
const action = args[0] && !args[0].startsWith('--') ? args[0] : null;
const discoveryFlags = ['--help', '--schema', '--example'].filter((flag) => args.includes(flag));

function usageError(message) {
  console.error(JSON.stringify({
    schemaVersion: 'buildr.task-development-driver-error/v1',
    status: 'blocked',
    diagnostic: { code: 'task_development_driver_usage_invalid', message },
    nextActions: ['运行 task-development-driver.mjs --help 查看受支持 action 与发现方式。'],
  }, null, 2));
  process.exit(2);
}

if (discoveryFlags.length > 1) usageError('每次只能选择 --help、--schema 或 --example 中的一种发现模式。');
if (discoveryFlags.length === 1) {
  const mode = discoveryFlags[0];
  if (!action && mode !== '--help') usageError(`${mode} 需要一个受支持的 Task Development action。`);
  if (action && !taskDevelopmentActionContract(action)) usageError(`未知 Task Development action：${action}。`);
  const output = mode === '--help'
    ? taskDevelopmentDriverHelp(action)
    : mode === '--schema'
      ? taskDevelopmentDriverSchema(action)
      : taskDevelopmentDriverExample(action);
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

if (args.includes('--compact') && args.includes('--profile')) usageError('--compact 与 --profile 不能同时使用。');

const taskId = option(args, '--task');
const targetRoot = option(args, '--target');

if (!TASK_DEVELOPMENT_ACTIONS.includes(action) || !taskId || !targetRoot) usageError('普通 action 需要受支持的 action、--task 与 --target。');

try {
  const moduleLoadStartedAt = performance.now();
  const { createRuntime } = await import('../../application/compose-runtime.mjs');
  const moduleLoadMs = performance.now() - moduleLoadStartedAt;
  const compositionStartedAt = performance.now();
  const runtime = createRuntime();
  const compositionMs = performance.now() - compositionStartedAt;
  const payload = input(args);
  const operations = {
    inspect: () => runtime.inspectTaskDevelopment(targetRoot, taskId),
    begin: () => runtime.beginTaskDevelopment(targetRoot, taskId, payload),
    planning: () => runtime.recordTaskDevelopmentPlanning(targetRoot, taskId, payload),
    observe: () => runtime.observeTaskDevelopment(targetRoot, taskId, payload),
    policy: () => runtime.recordTaskDevelopmentPolicy(targetRoot, taskId, payload),
    gate: () => runtime.recordTaskDevelopmentGate(targetRoot, taskId, payload),
    freeze: () => runtime.freezeTaskDevelopmentCandidate(targetRoot, taskId, payload),
    decide: () => runtime.decideTaskDevelopment(targetRoot, taskId, payload),
    handoff: () => runtime.createTaskDevelopmentHandoff(targetRoot, taskId, payload),
    carrier: () => runtime.assertTaskDevelopmentCarrier(targetRoot, taskId, payload),
  };
  const applicationStartedAt = performance.now();
  const result = operations[action]();
  const applicationMs = performance.now() - applicationStartedAt;
  const serializationStartedAt = performance.now();
  const output = args.includes('--compact') ? compactTaskDevelopmentOperationResult(result) : result;
  const serialized = JSON.stringify(output, null, 2);
  const serializationMs = performance.now() - serializationStartedAt;
  if (args.includes('--profile')) {
    const timing = {
      moduleLoadMs,
      compositionMs,
      applicationMs,
      serializationMs,
      totalMs: moduleLoadMs + compositionMs + applicationMs + serializationMs,
    };
    console.log(JSON.stringify({ schemaVersion: 'buildr.task-development-driver-profile/v1', action, result, timing }, null, 2));
  } else {
    console.log(serialized);
  }
} catch (error) {
  console.error(JSON.stringify({
    schemaVersion: 'buildr.task-development-driver-error/v1',
    status: 'blocked',
    diagnostic: { code: error.code || 'task_development_driver_failed', message: error.message, details: error.details },
    nextActions: error.nextAction ? [error.nextAction] : [],
  }, null, 2));
  process.exitCode = 1;
}
