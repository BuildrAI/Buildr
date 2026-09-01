import { performance } from 'node:perf_hooks';

import {
  TASK_DEVELOPMENT_ACTIONS,
  taskDevelopmentActionContract,
  taskDevelopmentDriverExample,
  taskDevelopmentDriverHelp,
  taskDevelopmentDriverSchema,
} from '../../application/task-development-operation-contracts.mjs';
import { compactTaskDevelopmentOperationResult } from '../../application/task-development-result-projection.mjs';

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

function serialized(value) {
  return JSON.stringify(value, null, 2);
}

function usageError(message, stderr) {
  stderr(serialized({
    schemaVersion: 'buildr.task-development-driver-error/v1',
    status: 'blocked',
    diagnostic: { code: 'task_development_driver_usage_invalid', message },
    nextActions: ['通过matching retained controller运行 __internal task-development --help 查看受支持 action 与发现方式。'],
  }));
  return 2;
}

export async function runTaskDevelopmentDriver(args, options = {}) {
  const stdout = options.stdout || ((value) => console.log(value));
  const stderr = options.stderr || ((value) => console.error(value));
  const action = args[0] && !args[0].startsWith('--') ? args[0] : null;
  const discoveryFlags = ['--help', '--schema', '--example'].filter((flag) => args.includes(flag));

  if (discoveryFlags.length > 1) return usageError('每次只能选择 --help、--schema 或 --example 中的一种发现模式。', stderr);
  if (discoveryFlags.length === 1) {
    const mode = discoveryFlags[0];
    if (!action && mode !== '--help') return usageError(`${mode} 需要一个受支持的 Task Development action。`, stderr);
    if (action && !taskDevelopmentActionContract(action)) return usageError(`未知 Task Development action：${action}。`, stderr);
    const output = mode === '--help'
      ? taskDevelopmentDriverHelp(action)
      : mode === '--schema'
        ? taskDevelopmentDriverSchema(action)
        : taskDevelopmentDriverExample(action);
    stdout(serialized(output));
    return 0;
  }

  if (args.includes('--compact') && args.includes('--profile')) return usageError('--compact 与 --profile 不能同时使用。', stderr);
  if (args.includes('--plan')) return usageError('--plan 已从 Task Development 退役；测试选择由 Task Verification Skill 指导 Agent 完成。', stderr);

  const taskId = option(args, '--task');
  const targetRoot = option(args, '--target');
  if (!TASK_DEVELOPMENT_ACTIONS.includes(action) || !taskId || !targetRoot) return usageError('普通 action 需要受支持的 action、--task 与 --target。', stderr);

  try {
    const moduleLoadStartedAt = performance.now();
    const { createRuntime } = await import('../../../bootstrap/runtime.mjs');
    const moduleLoadMs = performance.now() - moduleLoadStartedAt;
    const compositionStartedAt = performance.now();
    const runtime = createRuntime();
    const compositionMs = performance.now() - compositionStartedAt;
    const payload = input(args);
    const operations = {
      inspect: () => runtime.inspectTaskDevelopment(targetRoot, taskId),
      discover: () => runtime.discoverTaskDevelopmentInput(targetRoot, taskId, payload),
      begin: () => runtime.beginTaskDevelopment(targetRoot, taskId, payload),
      planning: () => runtime.recordTaskDevelopmentPlanning(targetRoot, taskId, payload),
      observe: () => runtime.observeTaskDevelopment(targetRoot, taskId, payload),
      knowledge: () => runtime.recordTaskDevelopmentKnowledge(targetRoot, taskId, payload),
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
    const outputJson = serialized(output);
    const serializationMs = performance.now() - serializationStartedAt;
    if (args.includes('--profile')) {
      const timing = {
        moduleLoadMs,
        compositionMs,
        applicationMs,
        serializationMs,
        totalMs: moduleLoadMs + compositionMs + applicationMs + serializationMs,
      };
      stdout(serialized({ schemaVersion: 'buildr.task-development-driver-profile/v1', action, result, timing }));
    } else {
      stdout(outputJson);
    }
    return 0;
  } catch (error) {
    stderr(serialized({
      schemaVersion: 'buildr.task-development-driver-error/v1',
      status: 'blocked',
      diagnostic: { code: error.code || 'task_development_driver_failed', message: error.message, details: error.details },
      nextActions: error.nextAction ? [error.nextAction] : [],
    }));
    return 1;
  }
}
