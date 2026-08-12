import { TASK_RETROSPECTIVE_FOCUS, TASK_RETROSPECTIVE_RESULT_SCHEMA, normalizeTaskRetrospectiveDisposition, normalizeTaskRetrospectiveResult, taskRetrospectiveError } from '../../domain/task-retrospective/task-retrospective.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../json-contracts.mjs';

function assertInput(input, allowed, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskRetrospectiveError('task_retrospective_input_invalid', `${label} 必须是对象。`);
  for (const field of Object.keys(input)) {
    if (!allowed.has(field)) throw taskRetrospectiveError('task_retrospective_field_forbidden', `${label} 不支持字段：${field}。`, 400, { field });
  }
}

function result(operation, status, taskId, slot, effects = [], followupTasks = []) {
  return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskRetrospectiveOperationResult, {
    operation, status, taskId, slot, followupTasks, diagnostic: null, effects, nextActions: [],
  });
}

function slot(persisted) {
  return {
    path: persisted.file,
    present: true,
    result: persisted.result,
    resultDigest: persisted.resultDigest,
    disposition: persisted.disposition,
    currentDigest: persisted.currentDigest,
  };
}

export function registerTaskRetrospectiveApplication(runtime) {
  function followups(targetRoot, taskId) {
    return runtime.readTaskRecordViewPersistence(targetRoot, taskId).retrospectiveRelations.followups;
  }

  function inspectTaskRetrospective(targetRoot, taskId) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    const persisted = runtime.readTaskRetrospectiveResultPersistence(task.root, task.record.taskId, { optional: true });
    const currentSlot = persisted
      ? slot(persisted)
      : { path: runtime.taskRetrospectiveResultPath(task.root, task.record.taskId), present: false, result: null, resultDigest: null, disposition: null, currentDigest: null };
    return result('inspect', 'inspected', task.record.taskId, currentSlot, [], followups(task.root, task.record.taskId));
  }

  function recordTaskRetrospective(targetRoot, taskId, input) {
    assertInput(input, new Set(['reportMarkdown']), 'Task Retrospective record');
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    if (!['completed', 'abandoned'].includes(task.record.status)) {
      throw taskRetrospectiveError('task_retrospective_task_not_terminal', `Task ${taskId} 仍是 ${task.record.status}，只能在终态后记录复盘。`, 409, { status: task.record.status }, '先按Task自身条件完成或放弃任务；复盘不是该转换的门禁。');
    }
    const normalized = normalizeTaskRetrospectiveResult({
      schemaVersion: TASK_RETROSPECTIVE_RESULT_SCHEMA,
      taskId: task.record.taskId,
      focus: TASK_RETROSPECTIVE_FOCUS,
      reportMarkdown: input.reportMarkdown,
      completedAt: new Date().toISOString(),
    }, { expectedTaskId: task.record.taskId });
    const written = runtime.writeTaskRetrospectiveResultPersistence(task.root, normalized);
    return result('record', 'recorded', task.record.taskId, slot(written), [{ type: written.created ? 'created' : 'updated', path: written.file }], followups(task.root, task.record.taskId));
  }

  function handleTaskRetrospective(targetRoot, taskId, input) {
    assertInput(input, new Set(['status', 'note', 'expectedCurrentDigest']), 'Task Retrospective handle');
    if (typeof input.expectedCurrentDigest !== 'string' || !input.expectedCurrentDigest.trim()) {
      throw taskRetrospectiveError('task_retrospective_current_digest_required', 'expectedCurrentDigest 必须是非空字符串。', 400, { field: 'expectedCurrentDigest' });
    }
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    const disposition = normalizeTaskRetrospectiveDisposition({
      status: input.status,
      note: input.status === 'pending' ? null : input.note,
      disposedAt: input.status === 'pending' ? null : new Date().toISOString(),
    });
    const written = runtime.writeTaskRetrospectiveDispositionPersistence(task.root, task.record.taskId, disposition, input.expectedCurrentDigest.trim());
    return result('handle', 'updated', task.record.taskId, slot(written), [{ type: 'updated', path: written.file }], followups(task.root, task.record.taskId));
  }

  Object.assign(runtime, { inspectTaskRetrospective, recordTaskRetrospective, handleTaskRetrospective });
  return runtime;
}
