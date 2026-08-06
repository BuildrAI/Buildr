import { TASK_RETROSPECTIVE_FOCUS, TASK_RETROSPECTIVE_RESULT_SCHEMA, normalizeTaskRetrospectiveResult, taskRetrospectiveError } from '../../domain/task-retrospective/task-retrospective.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../json-contracts.mjs';

function assertInput(input, allowed, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw taskRetrospectiveError('task_retrospective_input_invalid', `${label} 必须是对象。`);
  for (const field of Object.keys(input)) {
    if (!allowed.has(field)) throw taskRetrospectiveError('task_retrospective_field_forbidden', `${label} 不支持字段：${field}。`, 400, { field });
  }
}

function result(operation, status, taskId, slot, effects = []) {
  return withJsonSchema(PUBLIC_JSON_SCHEMAS.taskRetrospectiveOperationResult, {
    operation, status, taskId, slot, diagnostic: null, effects, nextActions: [],
  });
}

export function registerTaskRetrospectiveApplication(runtime) {
  function inspectTaskRetrospective(targetRoot, taskId) {
    const task = runtime.readTaskRecordPersistence(targetRoot, taskId);
    const persisted = runtime.readTaskRetrospectiveResultPersistence(task.root, task.record.taskId, { optional: true });
    const slot = persisted
      ? { path: persisted.file, present: true, result: persisted.result, resultDigest: persisted.resultDigest }
      : { path: runtime.taskRetrospectiveResultPath(task.root, task.record.taskId), present: false, result: null, resultDigest: null };
    return result('inspect', 'inspected', task.record.taskId, slot);
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
    return result('record', 'recorded', task.record.taskId, {
      path: written.file, present: true, result: written.result, resultDigest: written.resultDigest,
    }, [{ type: written.created ? 'created' : 'updated', path: written.file }]);
  }

  Object.assign(runtime, { inspectTaskRetrospective, recordTaskRetrospective });
  return runtime;
}
