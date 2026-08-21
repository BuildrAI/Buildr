import crypto from 'node:crypto';

export const SELF_BOOTSTRAP_CLOSEOUT_RESULT_SCHEMA = 'buildr.self-bootstrap-closeout-result/v1';
export const TASK_FINISH_MAINTENANCE_RESULT_SCHEMA = 'buildr.task-finish-maintenance-reconciliation-result/v1';

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function maintenanceError(code, message, details = null) {
  const error = new Error(message);
  Object.assign(error, { code, details, taskFinishBusiness: true, nextAction: '保留当前 Finish 与 Environment 事实，修复对应 identity 或 Product maintenance writer 后重试。' });
  return error;
}

function closeoutEvidence(result, observedAt) {
  return {
    schemaVersion: result.schemaVersion,
    status: result.status,
    runId: result.runId,
    taskId: result.taskId,
    resultIdentity: digest(result),
    phases: (result.phases || []).map((phase) => ({ id: phase.id, status: phase.status })),
    observedAt,
  };
}

function activationStatus(result) {
  if (result.status === 'passed') return 'passed';
  if (result.status === 'not-applicable') return 'not-applicable';
  return 'attention';
}

function environmentCleanup(runtime, root, taskId) {
  const observed = runtime.readTaskEnvironmentCurrent?.(root, taskId);
  if (!observed) return { status: 'pending', source: 'environment-current-unavailable' };
  if (observed.status === 'cleaned') return { status: 'cleaned', source: 'environment-current', observedAt: observed.environment?.latest?.cleanup?.completedAt || null };
  if (['blocked', 'unavailable'].includes(observed.status)) return { status: 'attention', source: 'environment-current', diagnostic: observed.diagnostic || null };
  return { status: 'pending', source: 'environment-current' };
}

function matchingFinishState(runtime, root, taskId, runId) {
  const current = runtime.readTaskFinishRunPersistence?.(root, runId ? { runId } : { taskId }, { optional: true });
  if (current?.run) {
    if (current.run.identity.task !== taskId || (runId && current.run.runId !== runId)) {
      throw maintenanceError('task_finish.maintenance_identity_conflict', 'Finish current 与 maintenance reconciliation 的 Task/run identity 不匹配。', { taskId, runId, currentTaskId: current.run.identity.task, currentRunId: current.run.runId });
    }
    return { kind: 'run', run: current.run, completion: current.preparedCompletion || current.run.completion || null };
  }
  const terminal = runtime.readTaskFinishCompletionPersistence?.(root, { taskId, ...(runId ? { runId } : {}) }, { optional: true });
  if (!terminal?.completion) throw maintenanceError('task_finish.maintenance_state_missing', 'Matching Finish current 或 terminal completion 不存在。', { taskId, runId });
  if (terminal.completion.task !== taskId || (runId && terminal.completion.runId !== runId)) {
    throw maintenanceError('task_finish.maintenance_identity_conflict', 'Finish terminal completion 与 maintenance reconciliation 的 Task/run identity 不匹配。', { taskId, runId, currentTaskId: terminal.completion.task, currentRunId: terminal.completion.runId });
  }
  return { kind: 'terminal', completion: terminal.completion };
}

function existingMaintenance(state) {
  return clone(state.kind === 'terminal'
    ? state.completion.maintenance || state.completion.result?.maintenance
    : state.completion?.maintenance || state.run?.maintenance || null) || {};
}

export function reconcileTaskFinishMaintenance({ runtime, root, taskId, runId = null, selfBootstrapResult = null, clock = Date.now }) {
  if (!taskId || typeof taskId !== 'string') throw maintenanceError('task_finish.maintenance_task_required', 'Finish maintenance reconciliation requires Task ID.');
  const state = matchingFinishState(runtime, root, taskId, runId);
  const actualRunId = state.kind === 'terminal' ? state.completion.runId : state.run.runId;
  const observedAt = new Date(clock()).toISOString();
  const previous = existingMaintenance(state);
  let selfBootstrap = previous.selfBootstrap || null;
  let activation = previous.activation || 'attention';

  if (selfBootstrapResult !== null) {
    if (typeof selfBootstrapResult !== 'object' || selfBootstrapResult.schemaVersion !== SELF_BOOTSTRAP_CLOSEOUT_RESULT_SCHEMA) {
      throw maintenanceError('task_finish.maintenance_self_bootstrap_schema_invalid', 'Self-bootstrap result schema 不受支持。', { expected: SELF_BOOTSTRAP_CLOSEOUT_RESULT_SCHEMA });
    }
    if (selfBootstrapResult.taskId !== taskId || selfBootstrapResult.runId !== actualRunId) {
      throw maintenanceError('task_finish.maintenance_self_bootstrap_identity_conflict', 'Self-bootstrap result 与 Finish Task/run identity 不匹配。', { expected: { taskId, runId: actualRunId }, actual: { taskId: selfBootstrapResult.taskId || null, runId: selfBootstrapResult.runId || null } });
    }
    if (!['passed', 'blocked', 'not-applicable'].includes(selfBootstrapResult.status)) {
      throw maintenanceError('task_finish.maintenance_self_bootstrap_status_invalid', 'Self-bootstrap result status 不受支持。', { status: selfBootstrapResult.status || null });
    }
    selfBootstrap = closeoutEvidence(selfBootstrapResult, observedAt);
    activation = activationStatus(selfBootstrapResult);
  }

  const cleanup = environmentCleanup(runtime, root, taskId);
  const maintenance = {
    ...previous,
    delivery: previous.delivery || 'delivered',
    activation,
    environmentCleanup: cleanup.status,
    diagnostics: previous.diagnostics || 'not-opened',
    selfBootstrap,
    refreshedAt: observedAt,
  };
  const persisted = runtime.writeTaskFinishMaintenancePersistence(root, {
    taskId,
    runId: actualRunId,
    maintenance,
  });
  return {
    schemaVersion: TASK_FINISH_MAINTENANCE_RESULT_SCHEMA,
    operation: 'maintenance',
    status: 'refreshed',
    taskId,
    runId: actualRunId,
    maintenance,
    environment: cleanup,
    persisted: { storage: persisted.storage || 'workspace-sqlite', locator: persisted.file || null },
  };
}
