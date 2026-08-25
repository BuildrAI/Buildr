import { TASK_RETROSPECTIVE_FOCUS, TASK_RETROSPECTIVE_RESULT_SCHEMA, normalizeTaskRetrospectiveDisposition, normalizeTaskRetrospectiveResult, taskRetrospectiveError } from '../domain/task-retrospective.mjs';
import { isTaskRecordId } from '../domain/task-record.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.mjs';

export const TASK_RETROSPECTIVE_PROMPT = '是否进行任务复盘？当前将重点分析 Agent 执行耗时、Token 消耗、重复尝试和人机协作效率。Token 数据仅在 Agent 可取得时记录，缺失不影响复盘。';

const TASK_RETROSPECTIVE_LIST_STATUSES = Object.freeze(['pending', 'handled', 'no-action', 'all']);
const TASK_RETROSPECTIVE_LIST_DEFAULT_LIMIT = 100;
const TASK_RETROSPECTIVE_LIST_MAX_LIMIT = 500;
export const TASK_RETROSPECTIVE_LIST_DEFAULT_MAX_BYTES = 256 * 1024;
export const TASK_RETROSPECTIVE_LIST_MAX_BYTES = 1024 * 1024;

function returnedBytes(payload) {
  return Buffer.byteLength(`${JSON.stringify(payload)}\n`, 'utf8');
}

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

  function listTaskRetrospectives(targetRoot, input = {}) {
    assertInput(input, new Set(['status', 'taskIds', 'limit', 'maxBytes', 'includeReport']), 'Task Retrospective list');
    const status = input.status ?? 'pending';
    if (!TASK_RETROSPECTIVE_LIST_STATUSES.includes(status)) {
      throw taskRetrospectiveError('task_retrospective_list_status_invalid', 'status 只支持 pending、handled、no-action 或 all。', 400, { field: 'status', value: status });
    }
    const taskIds = input.taskIds ?? [];
    if (!Array.isArray(taskIds) || taskIds.some((taskId) => !isTaskRecordId(taskId))) {
      throw taskRetrospectiveError('task_retrospective_list_task_ids_invalid', 'taskIds 必须是合法 Task ID 数组。', 400, { field: 'taskIds' });
    }
    const normalizedTaskIds = [...new Set(taskIds)].sort((left, right) => left.localeCompare(right));
    const limit = input.limit ?? TASK_RETROSPECTIVE_LIST_DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > TASK_RETROSPECTIVE_LIST_MAX_LIMIT) {
      throw taskRetrospectiveError('task_retrospective_list_limit_invalid', `limit 必须是 1 到 ${TASK_RETROSPECTIVE_LIST_MAX_LIMIT} 的整数。`, 400, { field: 'limit', value: limit });
    }
    const maxBytes = input.maxBytes ?? TASK_RETROSPECTIVE_LIST_DEFAULT_MAX_BYTES;
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > TASK_RETROSPECTIVE_LIST_MAX_BYTES) {
      throw taskRetrospectiveError('task_retrospective_list_max_bytes_invalid', `maxBytes 必须是 1 到 ${TASK_RETROSPECTIVE_LIST_MAX_BYTES} 的整数。`, 400, { field: 'maxBytes', value: maxBytes });
    }
    const includeReport = input.includeReport ?? false;
    if (typeof includeReport !== 'boolean') {
      throw taskRetrospectiveError('task_retrospective_list_include_report_invalid', 'includeReport 必须是布尔值。', 400, { field: 'includeReport', value: includeReport });
    }
    const envelopeProbe = withJsonSchema(PUBLIC_JSON_SCHEMAS.taskRetrospectiveListResult, {
      operation: 'list', status: 'listed', filters: { status, taskIds: normalizedTaskIds, limit, maxBytes, includeReport },
      matchingTaskCount: Number.MAX_SAFE_INTEGER, returnedTaskCount: 0, maxBytes, returnedBytes: 0, truncated: true,
      items: [], diagnostic: null, effects: [], nextActions: [],
    });
    for (let attempt = 0; attempt < 4; attempt += 1) envelopeProbe.returnedBytes = returnedBytes(envelopeProbe);
    if (envelopeProbe.returnedBytes > maxBytes) {
      throw taskRetrospectiveError('task_retrospective_list_max_bytes_too_small', 'maxBytes 无法容纳批量结果 envelope。', 400, { field: 'maxBytes', value: maxBytes, minimumBytes: envelopeProbe.returnedBytes });
    }

    const queried = runtime.queryTaskRecordViews(targetRoot, { hasRetrospective: 'yes', retrospectiveState: status });
    const selectedTaskIds = new Set(normalizedTaskIds);
    const matching = queried.tasks
      .filter((view) => selectedTaskIds.size === 0 || selectedTaskIds.has(view.record.taskId))
      .sort((left, right) => left.record.taskId.localeCompare(right.record.taskId));
    const candidateItems = matching.slice(0, limit).map((view) => {
      const task = { taskId: view.record.taskId, title: view.record.title, status: view.record.status };
      try {
        const inspected = inspectTaskRetrospective(targetRoot, view.record.taskId);
        const retrospective = {
          completedAt: inspected.slot.result.completedAt,
          resultDigest: inspected.slot.resultDigest,
          currentDigest: inspected.slot.currentDigest,
          disposition: inspected.slot.disposition,
          followupTasks: inspected.followupTasks,
        };
        return {
          base: { task, retrospective, diagnostic: null },
          reportMarkdown: includeReport ? inspected.slot.result.reportMarkdown : null,
        };
      } catch (error) {
        return { base: {
          task,
          retrospective: null,
          diagnostic: { code: error.code || 'task_retrospective_inspect_failed', message: error.message, details: error.details },
        }, reportMarkdown: null };
      }
    });
    const items = [];
    let reportOmitted = false;
    const output = (nextItems, truncated) => {
      const payload = withJsonSchema(PUBLIC_JSON_SCHEMAS.taskRetrospectiveListResult, {
        operation: 'list',
        status: 'listed',
        filters: { status, taskIds: normalizedTaskIds, limit, maxBytes, includeReport },
        matchingTaskCount: matching.length,
        returnedTaskCount: nextItems.length,
        maxBytes,
        returnedBytes: 0,
        truncated,
        items: nextItems,
        diagnostic: null,
        effects: [],
        nextActions: [],
      });
      for (let attempt = 0; attempt < 4; attempt += 1) payload.returnedBytes = returnedBytes(payload);
      return payload;
    };
    for (const candidate of candidateItems) {
      let item = candidate.base;
      if (candidate.reportMarkdown !== null) {
        const withReport = structuredClone(candidate.base);
        withReport.retrospective.reportMarkdown = candidate.reportMarkdown;
        if (output([...items, withReport], true).returnedBytes <= maxBytes) item = withReport;
        else reportOmitted = true;
      }
      if (output([...items, item], true).returnedBytes > maxBytes) break;
      items.push(item);
    }
    const truncated = matching.length > items.length || reportOmitted;
    const result = output(items, truncated);
    if (result.returnedBytes > maxBytes) {
      throw taskRetrospectiveError('task_retrospective_list_max_bytes_too_small', 'maxBytes 无法容纳批量结果 envelope。', 400, { field: 'maxBytes', value: maxBytes });
    }
    return result;
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

  Object.assign(runtime, { inspectTaskRetrospective, listTaskRetrospectives, recordTaskRetrospective, handleTaskRetrospective });
  return runtime;
}
