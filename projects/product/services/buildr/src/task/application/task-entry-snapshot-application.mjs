import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { taskRecordEffectiveProjectCodes } from '../domain/task-record.mjs';
import { TASK_DEVELOPMENT_ACTIONS } from './task-development-operation-contracts.mjs';
import { compactTaskDevelopmentOperationResult } from './task-development-result-projection.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.mjs';

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
  if (code.startsWith('task_finish') || code.startsWith('task-finish')) return 'task-finish';
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
  if (!args) return null;
  return {
    writer: next.owner === 'agent' ? 'agent' : 'retained-controller',
    invocation: controller,
    argv: [...controller.argsPrefix, ...args],
  };
}

const CLOSEOUT_HEAVY_ACTIONS = new Set(['verify', 'verify-or-reconcile', 'finish', 'finish-recovery']);
const CLOSEOUT_STATUS = Object.freeze({ READY: 'ready-for-finish', REPAIR: 'repair-before-finish', WAITING: 'waiting-on-execution', DECISION: 'blocked-by-user-decision' });

function closeoutCheck(axis, status, owner, code, summary, identity = null) {
  return { axis, status, owner, code, summary, identity };
}

function closeoutNext(owner, action, summary) {
  return { owner, action, summary };
}

function closeoutAdmissionAvailable(runtime) {
  return typeof runtime.listTaskExecutionRecordView === 'function';
}

function closeoutAdmission(targetRoot, task, execution, developmentResult, next, finishFacts, runtime) {
  if (!CLOSEOUT_HEAVY_ACTIONS.has(next?.action)) return null;
  if (!closeoutAdmissionAvailable(runtime)) {
    return {
      schemaVersion: PUBLIC_JSON_SCHEMAS.taskCloseoutAdmission,
      status: CLOSEOUT_STATUS.REPAIR,
      applicable: true,
      checks: [closeoutCheck('provider', 'unknown', 'task-entry-snapshot', 'closeout_provider_unavailable', '收尾准入所需的只读 owner provider 不可用。')],
      blockers: [{ axis: 'provider', owner: 'task-entry-snapshot', code: 'closeout_provider_unavailable', summary: '恢复收尾准入只读 provider 后重新读取 task next。', nextAction: closeoutNext('task-entry-snapshot', 'inspect', '恢复收尾准入只读 provider 后重新读取 task next。') }],
      nextAction: closeoutNext('task-entry-snapshot', 'inspect', '恢复收尾准入只读 provider 后重新读取 task next。'),
      effects: [],
    };
  }

  const checks = [];
  const blockers = [];
  let waiting = null;
  let decision = null;
  const addBlocker = (axis, owner, code, summary, action = 'inspect-or-reconcile') => blockers.push({ axis, owner, code, summary, nextAction: closeoutNext(owner, action, summary) });

  const changeReferences = task.changeReferences;
  if (!Array.isArray(changeReferences)) {
    checks.push(closeoutCheck('openspec', 'unknown', 'openspec', 'closeout_openspec_facts_unavailable', '当前 Task 的 scoped OpenSpec Change facts 不可用。'));
    addBlocker('openspec', 'openspec', 'closeout_openspec_facts_unavailable', '先读取当前 Task-scoped OpenSpec Change facts。');
  } else {
    const unavailable = changeReferences.find((item) => item.availability !== 'available');
    const incomplete = changeReferences.find((item) => item.workingCopy?.change?.progress?.exists === false);
    if (unavailable) {
      checks.push(closeoutCheck('openspec', 'blocked', 'openspec', unavailable.diagnostic?.code || 'closeout_openspec_change_unavailable', 'Task-scoped OpenSpec Change 不可用。'));
      addBlocker('openspec', 'openspec', unavailable.diagnostic?.code || 'closeout_openspec_change_unavailable', '修复或重新读取当前 Task-scoped OpenSpec Change。');
    } else if (incomplete) {
      checks.push(closeoutCheck('openspec', 'blocked', 'openspec', 'closeout_openspec_artifacts_incomplete', 'OpenSpec Change artifacts 尚未完整。', incomplete.workingCopy.change.code));
      addBlocker('openspec', 'openspec', 'closeout_openspec_artifacts_incomplete', '完成 Change artifacts 后重新读取准入。');
    } else checks.push(closeoutCheck('openspec', 'ready', 'openspec', null, 'Task-scoped OpenSpec Change facts current。'));
  }

  if (next.route?.readiness === 'blocked') {
    checks.push(closeoutCheck('owner', 'blocked', 'capability-routing', next.route.reason || 'closeout_owner_route_blocked', '当前重型动作的 selected Owner route 不可用。'));
    addBlocker('owner', 'capability-routing', next.route.reason || 'closeout_owner_route_blocked', '修复 selected Owner binding 后重新读取准入。');
  } else checks.push(closeoutCheck('owner', 'ready', next.owner || 'agent', null, '当前重型动作的 Owner route 可用。'));

  if (execution?.ready) checks.push(closeoutCheck('environment', 'ready', 'task-environment', null, 'matching Task Environment current 且 ready。', execution.receiptSchema));
  else {
    checks.push(closeoutCheck('environment', 'blocked', 'task-environment', 'closeout_environment_not_ready', 'matching Task Environment 尚未 ready。'));
    addBlocker('environment', 'task-environment', 'closeout_environment_not_ready', '准备或恢复 matching Task Environment。', 'prepare');
  }

  const development = developmentResult?.development;
  const applicability = development?.applicability || {};
  const targetReady = next.action.startsWith('finish')
    ? applicability.handoff === 'current'
    : applicability.contentTarget === 'current' && applicability.policy === 'current';
  const targetIdentity = development?.identities?.contentTarget || development?.receipt?.contentTarget?.identity || null;
  if (targetReady) checks.push(closeoutCheck('target', 'ready', 'task-development', null, 'Task Development target/handoff current。', targetIdentity));
  else {
    checks.push(closeoutCheck('target', 'blocked', 'task-development', 'closeout_target_not_current', 'Task Development target/handoff 尚未 current。'));
    addBlocker('target', 'task-development', 'closeout_target_not_current', '刷新 Task Development target/handoff 后重新读取准入。', 'inspect-or-reconcile');
  }

  let records = null;
  try { records = runtime.listTaskExecutionRecordView(targetRoot, task.record.taskId, { view: 'all' }); }
  catch (error) {
    checks.push(closeoutCheck('execution-record', 'unknown', 'task-execution-record', error.code || 'closeout_execution_record_unavailable', 'Execution Record facts 不可用。'));
    addBlocker('execution-record', 'task-execution-record', error.code || 'closeout_execution_record_unavailable', '读取同一 Task Execution Record authority。', 'inspect');
  }
  const activeRecord = records?.records?.find((record) => record.lifecycleStatus === 'open' || record.outcome === 'running');
  if (activeRecord) {
    checks.push(closeoutCheck('execution-record', 'waiting', activeRecord.owner, 'closeout_execution_already_active', '已有 matching execution 正在运行或等待。', activeRecord.recordId));
    waiting = { owner: activeRecord.owner, recordId: activeRecord.recordId, action: 'inspect', summary: '读取已有 Execution Record，不重复启动。' };
  } else if (records) checks.push(closeoutCheck('execution-record', 'ready', 'task-execution-record', null, '没有发现需要重复启动的 active Execution Record。'));

  const finishBlockers = Array.isArray(finishFacts?.blockers) ? finishFacts.blockers : [];
  const resourceBlocker = finishBlockers.find((item) => /resource|capacity|waiting|occupied|lease/i.test(`${item.code || ''} ${item.message || ''}`));
  if (finishFacts?.recovery || resourceBlocker) {
    const source = resourceBlocker || finishFacts.recovery;
    checks.push(closeoutCheck('resources', 'waiting', source.owner || 'task-finish', source.code || 'closeout_execution_waiting', '已有 Finish recovery 或共享资源等待事实。', source.recordId || null));
    waiting = waiting || { owner: source.owner || 'task-finish', recordId: source.recordId || null, action: 'inspect', summary: '读取已有 recovery/resource authority，不重复启动。' };
  } else checks.push(closeoutCheck('resources', 'ready', 'task-finish', null, '没有发现已有 recovery 或共享资源等待。'));

  const deterministic = [
    ...(developmentResult?.formalVerificationReadiness?.status === 'blocked' ? (developmentResult.formalVerificationReadiness.reasons || []) : []),
    ...(applicability.reasons || []).filter((item) => ['required-facts-incomplete', 'task-context-changed', 'content-target-changed', 'declarations-changed', 'policy-missing'].includes(item.code)),
    ...(finishFacts?.requiredPrerequisites || []),
  ];
  for (const reason of deterministic) {
    const owner = reason.owner || (reason.axis === 'environment' ? 'task-environment' : 'task-development');
    addBlocker(reason.axis || 'integrity', owner, reason.code || 'closeout_deterministic_prerequisite', reason.summary || '先恢复确定性的 authority/identity/完整性前置。');
  }
  const decisionBlocker = finishBlockers.find((item) => /strategy|decision|risk|authorization|approve|choose/i.test(`${item.code || ''} ${item.message || ''}`));
  if (decisionBlocker) decision = { owner: decisionBlocker.module || 'task-finish', code: decisionBlocker.code || 'closeout_finish_decision_required', summary: decisionBlocker.message || 'Finish 仍需要 Agent/用户选择处理策略。' };
  for (const blocker of finishBlockers.filter((item) => item !== resourceBlocker && item !== decisionBlocker)) {
    const owner = blocker.module === 'development' ? 'task-development' : blocker.module === 'environment' ? 'task-environment' : 'task-finish';
    addBlocker('finish', owner, blocker.code || 'closeout_finish_blocker', blocker.message || 'Finish 存在未解决的确定性前置。');
  }

  const status = decision ? CLOSEOUT_STATUS.DECISION : blockers.length ? CLOSEOUT_STATUS.REPAIR : waiting ? CLOSEOUT_STATUS.WAITING : CLOSEOUT_STATUS.READY;
  const nextAction = waiting
    ? closeoutNext(waiting.owner, waiting.action, waiting.summary)
    : decision
      ? closeoutNext(decision.owner, 'decide-or-repair', decision.summary)
      : blockers[0]?.nextAction || closeoutNext(next.owner || 'agent', next.action, '准入通过后由 Agent 选择继续 Candidate/Finish 或其他合法动作。');
  return {
    schemaVersion: PUBLIC_JSON_SCHEMAS.taskCloseoutAdmission,
    status,
    applicable: true,
    checks,
    blockers: blockers.slice(0, 8),
    nextAction,
    effects: [],
  };
}

function profileEntry(startedAt, reads, attempts, status) {
  return { wallClockMs: performance.now() - startedAt, ownerReads: reads, attempts: { ...attempts, blocked: status === 'blocked' ? 1 : 0 } };
}

export function registerTaskEntrySnapshotApplication(runtime) {
  const capabilityRoute = (...args) => runtime.resolveTaskEntryCapabilityRoute(...args);

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
    let finishFacts = null;
    try {
      inspected = measured('task-manager', () => runtime.inspectTaskRecord(targetRoot, taskId));
      if (inspected.record.status !== 'active') return finish({ status: 'blocked', task: taskSummary(inspected), environment: null, development: null, blockers: [{ axis: 'task', owner: 'task-manager', code: 'task_entry_task_not_active' }], next: requiredNext('task-manager', 'inspect', { id: 'buildr.task-record', version: 2 }, `Task ${taskId} 已是 ${inspected.record.status}，不能继续正式研发。`), diagnostic: { code: 'task_entry_task_not_active', owner: 'task-manager', message: `Task ${taskId} 不是 active。` }, effects: [] });

      execution = measured('task-environment', () => runtime.resolveTaskEnvironmentExecution(targetRoot, taskId));
      if (!execution?.ready) {
        const diagnostic = execution?.blocked || { code: 'task_environment_not_ready', message: `Task Environment 未ready：${taskId}。` };
        const developmentResult = measured('task-development', () => runtime.inspectTaskDevelopmentCurrent(targetRoot, taskId, { inspectedTask: inspected }));
        development = compactTaskDevelopmentOperationResult(developmentResult).current;
        const unavailable = ['task_environment_no_receipt', 'task_environment_snapshot_missing', 'task_environment_plan_missing'].includes(diagnostic.code);
        const directWorkAvailable = unavailable && developmentResult.status === 'missing';
        const next = directWorkAvailable
          ? { mode: 'recommended', owner: 'task-environment', action: 'prepare', capability: { id: 'buildr.task-environment', version: 1 }, summary: '如需Buildr受管checkout、Preparation、正式证据或资源，准备matching Task Environment。', route: null }
          : requiredNext('task-environment', 'prepare', { id: 'buildr.task-environment', version: 1 }, '准备或恢复matching Task Environment。');
        const route = measured('capability-routing', () => capabilityRoute(targetRoot, taskRecordEffectiveProjectCodes(inspected.record), next.capability.id, next.capability.version, { runtime: options.runtime || 'codex' }));
        next.route = route;
        if (route.readiness === 'blocked') next.mode = 'required';
        return finish({
          status: route.readiness === 'blocked' || !directWorkAvailable ? 'blocked' : 'ready',
          task: taskSummary(inspected),
          environment: environmentSummary(execution),
          development,
          blockers: directWorkAvailable ? [] : [{ axis: 'environment', owner: 'task-environment', code: diagnostic.code }],
          next,
          diagnostic: directWorkAvailable ? null : diagnostic,
          effects: [],
        });
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
      if (!identityBlocker && next?.action === 'finish' && typeof runtime.inspectTaskFinishCurrentFacts === 'function') {
        finishFacts = measured('task-finish', () => runtime.inspectTaskFinishCurrentFacts(targetRoot, taskId, {
          agent: execution.controller?.adapter || options.runtime || 'codex',
        }));
        if (finishFacts?.recovery) next = {
          ...next,
          action: 'finish-recovery',
          summary: 'Task Finish已有current recovery现场；读取Finish facts并由Agent选择rollover、resume、reconcile、Git/PR、Development或放弃。',
        };
      }
      if (next?.capability) {
        next = { ...next, route: measured('capability-routing', () => capabilityRoute(targetRoot, taskRecordEffectiveProjectCodes(inspected.record), next.capability.id, next.capability.version, { runtime: execution.controller?.adapter || options.runtime || 'codex' })) };
        if (next.route.readiness === 'blocked') next = { ...next, mode: 'required' };
      } else if (next) next = { ...next, route: null };
      if (next) next = { ...next, command: commandRoute(next, execution, taskId) };
      const routeBlocked = next?.route?.readiness === 'blocked';
      const finishRequired = (finishFacts?.requiredPrerequisites || []).length > 0;
      const finishBlockers = finishFacts?.blockers || [];
      const closeout = closeoutAdmission(targetRoot, inspected, execution, developmentResult, next, finishFacts, runtime);
      return finish({
        status: routeBlocked || identityBlocker || finishRequired ? 'blocked' : 'ready',
        task: taskSummary(inspected),
        environment: environmentSummary(execution),
        development,
        parent,
        finish: finishFacts,
        closeoutAdmission: closeout,
        blockers: identityBlocker ? [identityBlocker] : routeBlocked ? [{ axis: 'capability', owner: 'capability-routing', code: next.route.reason }] : [...(parent?.blockers || []), ...finishBlockers],
        next,
        diagnostic: identityBlocker ? { code: identityBlocker.code, owner: identityBlocker.owner, message: identityBlocker.message } : routeBlocked ? { code: `task_entry_${next.route.reason}`, owner: 'capability-routing', message: `当前capability route不可用：${next.capability.id}@${next.capability.version}。` } : finishRequired ? { code: 'task_entry_finish_safety_prerequisite', owner: 'task-finish', message: 'Task Finish存在必须先恢复的authority或identity安全前置。', details: finishFacts.requiredPrerequisites } : null,
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
