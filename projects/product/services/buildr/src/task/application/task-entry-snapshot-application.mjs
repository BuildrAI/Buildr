import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { taskRecordEffectiveProjectCodes } from '../domain/record/task-record.mjs';
import { TASK_DEVELOPMENT_ACTIONS } from './task-development-operation-contracts.mjs';
import { compactTaskDevelopmentOperationResult } from './task-development-result-projection.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../application/json-contracts.mjs';
import { resolveCapabilityRoute } from '../../agent-assets/infrastructure/runtime/skills/capabilities.mjs';

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizedChanges(values) {
  return (values || []).map((item) => ({ project: item.project, change: item.change })).sort((left, right) => `${left.project}/${left.change}`.localeCompare(`${right.project}/${right.change}`));
}

function ownerFor(error) {
  const code = error?.code || '';
  if (code.startsWith('task_environment_')) return 'task-environment';
  if (code.startsWith('task_development_')) return 'task-development';
  if (code.includes('capability') || code.includes('binding') || code.includes('provider')) return 'capability-routing';
  return 'task-manager';
}

function requiredNext(owner, action, capability, summary) {
  return { mode: 'required', owner, action, capability, summary, route: null };
}

function taskSummary(inspected) {
  return {
    taskId: inspected.record.taskId,
    status: inspected.record.status,
    recordDigest: inspected.recordDigest || null,
    updatedAt: inspected.record.updatedAt,
    scope: inspected.record.scope,
    changes: normalizedChanges(inspected.record.changes),
  };
}

function environmentSummary(execution) {
  if (!execution?.ready) return { status: 'not-ready', observedAt: execution?.observedAt || null, receiptSchema: null, execution: null, runtimeInvocation: null, controllerInvocation: null, cliInvocation: null };
  return {
    status: 'ready',
    observedAt: execution.observedAt,
    receiptSchema: execution.receiptSchema,
    execution: {
      workdir: execution.environmentRoot,
      roots: execution.executionRoots,
      allowedRoots: execution.allowedExecutionRoots,
    },
    runtimeInvocation: execution.runtimeInvocation || null,
    controllerInvocation: execution.controllerInvocation,
    cliInvocation: execution.cliInvocation,
  };
}

function commandRoute(next, execution, taskId) {
  if (!execution?.ready || !next) return null;
  const controller = execution.controllerInvocation;
  const publicArgs = {
    'planning-review': ['task', 'review', 'inspect', taskId, '--target', execution.workspaceRoot, '--json'],
    'refresh-parent-planning': ['task', 'parent', 'refresh-planning', taskId, '--target', execution.workspaceRoot, '--json'],
    'accept-parent': ['task', 'parent', 'inspect', taskId, '--target', execution.workspaceRoot, '--json'],
    verify: ['task', 'verification', 'inspect', taskId, '--target', execution.workspaceRoot, '--json'],
    finish: ['task', 'finish', 'run', '--task', taskId, '--target', execution.workspaceRoot, '--json'],
  }[next.action] || null;
  const internalArgs = next.owner === 'task-development' && TASK_DEVELOPMENT_ACTIONS.includes(next.action)
    ? ['__internal', 'task-development', next.action, '--task', taskId, '--target', execution.workspaceRoot]
    : null;
  const args = publicArgs || internalArgs;
  return {
    writer: next.owner === 'agent' ? 'agent' : 'retained-controller',
    invocation: controller,
    argv: args ? [...controller.argsPrefix, ...args] : null,
  };
}

function profileEntry(startedAt, reads, attempts, status) {
  return { wallClockMs: performance.now() - startedAt, ownerReads: reads, attempts: { ...attempts, blocked: status === 'blocked' ? 1 : 0 } };
}

export function registerTaskEntrySnapshotApplication(runtime) {
  const capabilityRoute = (...args) => runtime.resolveTaskEntryCapabilityRoute?.(...args) || resolveCapabilityRoute(...args);

  function inspectTaskEntrySnapshot(targetRoot, taskId, options = {}) {
    const startedAt = performance.now();
    const reads = [];
    const attempts = { failed: 0, repeated: 0 };
    const measured = (owner, operation) => {
      const started = performance.now();
      try { return operation(); }
      finally { reads.push({ owner, calls: 1, durationMs: performance.now() - started }); }
    };
    const finish = (payload) => withJsonSchema(PUBLIC_JSON_SCHEMAS.taskEntrySnapshot, {
      operation: 'next',
      ...payload,
      ...(options.profile ? { profile: profileEntry(startedAt, reads, attempts, payload.status) } : {}),
    });
    let inspected = null;
    let execution = null;
    let development = null;
    let parent = null;
    try {
      inspected = measured('task-manager', () => runtime.inspectTaskRecord(targetRoot, taskId));
      if (inspected.record.status !== 'active') return finish({ status: 'blocked', task: taskSummary(inspected), environment: null, development: null, blockers: [{ axis: 'task', owner: 'task-manager', code: 'task_entry_task_not_active' }], next: requiredNext('task-manager', 'inspect', { id: 'buildr.task-record', version: 2 }, `Task ${taskId} 已是 ${inspected.record.status}，不能继续正式研发。`), diagnostic: { code: 'task_entry_task_not_active', owner: 'task-manager', message: `Task ${taskId} 不是 active。` }, effects: [] });

      execution = measured('task-environment', () => runtime.resolveTaskEnvironmentExecution(targetRoot, taskId));
      if (!execution?.ready) {
        const diagnostic = execution?.blocked || { code: 'task_environment_not_ready', message: `Task Environment 未ready：${taskId}。` };
        const next = requiredNext('task-environment', 'prepare', { id: 'buildr.task-environment', version: 1 }, '准备或恢复matching Task Environment。');
        const route = measured('capability-routing', () => capabilityRoute(targetRoot, taskRecordEffectiveProjectCodes(inspected.record), next.capability.id, next.capability.version, { runtime: options.runtime || 'codex' }));
        next.route = route;
        const unavailable = ['task_environment_no_receipt', 'task_environment_snapshot_missing', 'task_environment_plan_missing'].includes(diagnostic.code);
        return finish({ status: route.readiness === 'blocked' || !unavailable ? 'blocked' : 'ready', task: taskSummary(inspected), environment: environmentSummary(execution), development: null, blockers: [{ axis: 'environment', owner: 'task-environment', code: diagnostic.code }], next, diagnostic, effects: [] });
      }

      if (options.executionTarget) {
        let actual;
        try { actual = fs.realpathSync(path.resolve(options.executionTarget)); }
        catch { actual = path.resolve(options.executionTarget); }
        if (!execution.allowedExecutionRoots.includes(actual)) return finish({ status: 'blocked', task: taskSummary(inspected), environment: environmentSummary(execution), development: null, blockers: [{ axis: 'execution-target', owner: 'task-environment', code: 'task_entry_execution_target_mismatch' }], next: requiredNext('task-environment', 'inspect', { id: 'buildr.task-environment', version: 1 }, '使用matching Environment Receipt返回的execution root并重新读取。'), diagnostic: { code: 'task_entry_execution_target_mismatch', owner: 'task-environment', message: '显式execution target不属于matching Task Environment。', details: { actual, allowed: execution.allowedExecutionRoots } }, effects: [] });
      }

      const developmentResult = measured('task-development', () => runtime.inspectTaskDevelopmentCurrent(targetRoot, taskId, { inspectedTask: inspected }));
      const compact = compactTaskDevelopmentOperationResult(developmentResult);
      development = compact.current;
      let next = developmentResult.next;
      let identityBlocker = null;
      if (developmentResult.status === 'missing') next = requiredNext('task-development', 'begin', { id: 'buildr.task-development', version: 2 }, developmentResult.nextActions[0]);
      if (developmentResult.development) {
        const receipt = developmentResult.development.receipt;
        const taskFactsCurrent = receipt.taskContext.taskId === inspected.record.taskId
          && receipt.taskContext.intent === inspected.record.intent
          && same(receipt.taskContext.scope, inspected.record.scope)
          && same(normalizedChanges(receipt.taskContext.changes), normalizedChanges(inspected.record.changes));
        if (!taskFactsCurrent) {
          identityBlocker = { axis: 'task-context', owner: 'task-development', code: 'task_entry_task_context_stale', message: 'Development保存的Task context与current Task Record不一致。' };
          next = requiredNext('task-development', 'planning', { id: 'buildr.task-development', version: 2 }, 'Task context identity已变化；刷新Development planning facts。');
        } else if (receipt.environment.receiptSchema !== execution.receiptSchema) {
          identityBlocker = { axis: 'environment', owner: 'task-development', code: 'task_entry_environment_identity_stale', message: 'Development绑定的Environment Receipt schema与matching current Environment不一致。' };
          next = requiredNext('task-development', 'begin', { id: 'buildr.task-development', version: 2 }, 'Environment identity已变化；由Task Development重新绑定matching Environment。');
        } else if (['stale'].includes(developmentResult.development.applicability.taskContext) || ['stale'].includes(developmentResult.development.applicability.planning)) {
          identityBlocker = { axis: 'development', owner: 'task-development', code: 'task_entry_development_identity_stale', message: 'Development保存的direct applicability已标记stale。' };
        }
      }
      if (!identityBlocker && developmentResult.development?.receipt.parentPlan) {
        const startup = measured('parent-coordination', () => runtime.inspectParentStartupReadiness(targetRoot, taskId, { task: inspected, execution, development: developmentResult }));
        parent = { mode: startup.mode, status: startup.status, checks: startup.checks, blockers: startup.blockers, eligibleContributions: startup.eligibleContributions };
        const parentNext = startup.next;
        if (parentNext) {
          const capability = {
            'planning-review': { id: 'buildr.task-review', version: 1 },
            'refresh-parent-planning': { id: 'buildr.task-development', version: 2 },
            'accept-parent': { id: 'buildr.task-development', version: 2 },
          }[parentNext.action] || null;
          next = { ...parentNext, capability };
        }
      }
      if (next?.capability) {
        next = { ...next, route: measured('capability-routing', () => capabilityRoute(targetRoot, taskRecordEffectiveProjectCodes(inspected.record), next.capability.id, next.capability.version, { runtime: execution.controller?.adapter || options.runtime || 'codex' })) };
        if (next.route.readiness === 'blocked') next = { ...next, mode: 'required' };
      } else if (next) next = { ...next, route: null };
      if (next) next = { ...next, command: commandRoute(next, execution, taskId) };
      const routeBlocked = next?.route?.readiness === 'blocked';
      return finish({
        status: routeBlocked || identityBlocker ? 'blocked' : 'ready',
        task: taskSummary(inspected),
        environment: environmentSummary(execution),
        development,
        parent,
        blockers: identityBlocker ? [identityBlocker] : routeBlocked ? [{ axis: 'capability', owner: 'capability-routing', code: next.route.reason }] : parent?.blockers || [],
        next,
        diagnostic: identityBlocker ? { code: identityBlocker.code, owner: identityBlocker.owner, message: identityBlocker.message } : routeBlocked ? { code: `task_entry_${next.route.reason}`, owner: 'capability-routing', message: `当前capability route不可用：${next.capability.id}@${next.capability.version}。` } : null,
        effects: [],
      });
    } catch (error) {
      attempts.failed += 1;
      const owner = ownerFor(error);
      return finish({ status: 'blocked', task: inspected ? taskSummary(inspected) : null, environment: execution ? environmentSummary(execution) : null, development, parent, blockers: [{ axis: owner, owner, code: error.code || 'task_entry_snapshot_failed' }], next: requiredNext(owner, 'inspect', null, error.nextAction || '由对应owner检查诊断并恢复current facts。'), diagnostic: { code: error.code || 'task_entry_snapshot_failed', owner, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) }, effects: [] });
    }
  }

  Object.assign(runtime, { inspectTaskEntrySnapshot });
  return runtime;
}
