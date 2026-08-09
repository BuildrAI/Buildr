import {
  TASK_EXECUTION_RECORD_OWNER_KINDS,
  beginTaskExecutionRecordCleanup,
  completeTaskExecutionRecordCleanup,
  createOpenTaskExecutionRecord,
  evaluateTaskExecutionRecordCleanup,
  recoverTaskExecutionRecordAttention,
  resolveTaskExecutionRecord,
  sealTaskExecutionRecord,
  taskExecutionRecordError,
} from '../../domain/task-execution-record/task-execution-record.mjs';

function assertInput(input, allowed, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskExecutionRecordError('task_execution_record_input_invalid', `${label}必须是对象。`);
  for (const field of Object.keys(input)) {
    if (!allowed.has(field)) throw taskExecutionRecordError('task_execution_record_field_forbidden', `${label}不支持字段：${field}。`, 400, { field });
  }
}

function result(operation, status, persisted, effects = []) {
  return {
    schemaVersion: 'buildr.task-execution-record-operation-result/v1',
    operation,
    status,
    taskId: persisted.record.taskId,
    record: persisted.record,
    locator: persisted.file,
    effects,
    diagnostic: null,
    nextActions: [],
  };
}

export function registerTaskExecutionRecordApplication(runtime) {
  function openTaskExecutionRecord(targetRoot, taskId, input) {
    assertInput(input, new Set(['owner', 'kind', 'runIdentity', 'targetIdentity', 'producer']), 'Task Execution Record open');
    const task = runtime.prepareTaskRecordPersistence(targetRoot, taskId);
    if (task.record.status !== 'active') throw taskExecutionRecordError('task_execution_record_task_terminal', `Task ${taskId} 已是${task.record.status}，不能open新的执行记录。`, 409, { status: task.record.status });
    const draft = createOpenTaskExecutionRecord({ taskId: task.record.taskId, ...input });
    const persisted = runtime.openTaskExecutionRecordPersistence(task.root, draft);
    return result('open', persisted.created ? 'opened' : 'reused', persisted, [{ type: persisted.created ? 'created' : 'reused', path: persisted.file }]);
  }

  function inspectTaskExecutionRecord(targetRoot, recordId) {
    return result('inspect', 'inspected', runtime.readTaskExecutionRecordPersistence(targetRoot, recordId));
  }

  function listTaskExecutionRecords(targetRoot, taskId, input = {}) {
    assertInput(input, new Set(['owner', 'kind']), 'Task Execution Record list');
    if (input.owner !== undefined && !Object.hasOwn(TASK_EXECUTION_RECORD_OWNER_KINDS, input.owner)) throw taskExecutionRecordError('task_execution_record_owner_invalid', `owner不受支持：${input.owner}。`, 400, { owner: input.owner });
    if (input.kind !== undefined) {
      if (!input.owner) throw taskExecutionRecordError('task_execution_record_kind_requires_owner', '按kind筛选时必须同时提供owner。', 400, { kind: input.kind });
      if (!TASK_EXECUTION_RECORD_OWNER_KINDS[input.owner].includes(input.kind)) throw taskExecutionRecordError('task_execution_record_kind_invalid', `kind不属于owner：${input.kind}。`, 400, { owner: input.owner, kind: input.kind });
    }
    const records = runtime.listTaskExecutionRecordPersistence(targetRoot, taskId, input);
    return {
      schemaVersion: 'buildr.task-execution-record-list-result/v1',
      operation: 'list',
      status: 'listed',
      taskId,
      records: records.map((item) => item.record),
      diagnostic: null,
      nextActions: [],
    };
  }

  function sealTaskExecutionRecordOperation(targetRoot, recordId, input) {
    assertInput(input, new Set(['outcome', 'files']), 'Task Execution Record seal');
    const persisted = runtime.readTaskExecutionRecordPersistence(targetRoot, recordId);
    const current = persisted.record;
    if (current.lifecycleStatus !== 'open') {
      if (current.outcome === input.outcome && current.lifecycleStatus === 'retained') return result('seal', 'reused', persisted);
      if (current.outcome === input.outcome && current.lifecycleStatus === 'attention') {
        runtime.verifyTaskExecutionRecordBody(persisted.root, current);
        const recovered = runtime.replaceTaskExecutionRecordPersistence(persisted.root, current, recoverTaskExecutionRecordAttention(current));
        return result('seal', 'recovered', recovered, [{ type: 'verified', path: current.body.locator }, { type: 'updated', path: recovered.file }]);
      }
      throw taskExecutionRecordError('task_execution_record_not_open', `record ${recordId} 已是${current.lifecycleStatus}。`, 409, { lifecycleStatus: current.lifecycleStatus });
    }
    const body = runtime.publishTaskExecutionRecordBody(persisted.root, current, input.files);
    const sealedAt = new Date().toISOString();
    const next = sealTaskExecutionRecord(current, body, input.outcome, sealedAt);
    try {
      const written = runtime.replaceTaskExecutionRecordPersistence(persisted.root, current, next);
      return result('seal', 'sealed', written, [{ type: 'published', path: body.locator }, { type: 'updated', path: written.file }]);
    } catch (error) {
      try {
        const attention = sealTaskExecutionRecord(current, body, input.outcome, sealedAt, { attention: true });
        runtime.replaceTaskExecutionRecordPersistence(persisted.root, current, attention);
      } catch {}
      throw error;
    }
  }

  function resolveTaskExecutionRecordOperation(targetRoot, recordId, input) {
    assertInput(input, new Set(['resolutionStatus']), 'Task Execution Record resolve');
    const persisted = runtime.readTaskExecutionRecordPersistence(targetRoot, recordId);
    if (persisted.record.resolutionStatus === input.resolutionStatus) return result('resolve', 'reused', persisted);
    const next = resolveTaskExecutionRecord(persisted.record, input.resolutionStatus);
    const written = runtime.replaceTaskExecutionRecordPersistence(persisted.root, persisted.record, next);
    return result('resolve', 'resolved', written, [{ type: 'updated', path: written.file }]);
  }

  function cleanupTaskExecutionRecord(targetRoot, recordId) {
    let persisted = runtime.readTaskExecutionRecordPersistence(targetRoot, recordId);
    if (persisted.record.lifecycleStatus === 'cleaned') return result('cleanup', 'reused', persisted);
    if (persisted.record.lifecycleStatus === 'retained') {
      const recentRank = runtime.taskExecutionRecordRecentRank(persisted.root, persisted.record);
      const eligibility = evaluateTaskExecutionRecordCleanup(persisted.record, { recentRank });
      if (!eligibility.eligible) throw taskExecutionRecordError('task_execution_record_cleanup_not_eligible', 'Task Execution Record尚不满足cleanup条件。', 409, { recordId, reasons: eligibility.reasons }, '等待固定retention到期、完成失败处置，或保留最近成功记录。');
      persisted = runtime.replaceTaskExecutionRecordPersistence(persisted.root, persisted.record, beginTaskExecutionRecordCleanup(persisted.record));
    }
    if (persisted.record.lifecycleStatus !== 'cleanup_pending') throw taskExecutionRecordError('task_execution_record_cleanup_not_pending', `record ${recordId} 不能cleanup：${persisted.record.lifecycleStatus}。`, 409, { lifecycleStatus: persisted.record.lifecycleStatus });
    const removed = runtime.cleanupTaskExecutionRecordBody(persisted.root, persisted.record);
    const cleaned = completeTaskExecutionRecordCleanup(persisted.record, removed.removed ? 'body-removed' : 'body-already-absent');
    const written = runtime.replaceTaskExecutionRecordPersistence(persisted.root, persisted.record, cleaned);
    return result('cleanup', 'cleaned', written, [{ type: removed.removed ? 'deleted' : 'absent', path: removed.locator }, { type: 'updated', path: written.file }]);
  }

  Object.assign(runtime, {
    openTaskExecutionRecord,
    inspectTaskExecutionRecord,
    listTaskExecutionRecords,
    sealTaskExecutionRecord: sealTaskExecutionRecordOperation,
    resolveTaskExecutionRecord: resolveTaskExecutionRecordOperation,
    cleanupTaskExecutionRecord,
  });
  return runtime;
}
