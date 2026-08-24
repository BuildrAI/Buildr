import { TASK_RECORD_ID_SOURCE } from '../../domain/task-record.mjs';
import {
  mapTaskAbandonRequest,
  mapTaskCompleteRequest,
  mapTaskListRequest,
  mapTaskUpdateRequest,
} from './task-record-http-mapping.ts';
import {
  TASK_RECORD_HTTP_OPERATIONS,
  TASK_RECORD_HTTP_VALIDATORS,
} from './task-record-http-contracts.mjs';

export { TASK_RECORD_ID_SOURCE };

const TASK_QUERY_FIELDS = new Set(['q', 'project', 'service', 'status', 'hasChildren', 'hasRetrospective', 'retrospectiveState']);
const TASK_RECORD_PATH = new RegExp(`^/tasks/(${TASK_RECORD_ID_SOURCE})$`);
const TASK_COMPLETE_PATH = new RegExp(`^/tasks/(${TASK_RECORD_ID_SOURCE})/complete$`);
const TASK_ABANDON_PATH = new RegExp(`^/tasks/(${TASK_RECORD_ID_SOURCE})/abandon$`);
const OPERATIONS = new Map(TASK_RECORD_HTTP_OPERATIONS.map((operation) => [operation.id, operation]));

function invalidContractInput(operationId, label, errors) {
  const errorItem = errors.find((item) => item.keyword === 'additionalProperties')
    || errors.find((item) => item.params?.missingProperty === 'expectedRecordDigest')
    || errors.find((item) => item.params?.missingProperty === 'noChange')
    || errors.find((item) => item.keyword === 'minProperties')
    || errors[0]
    || {};
  const missingField = errorItem.params?.missingProperty;
  const unknownField = errorItem.params?.additionalProperty;
  const pathField = String(errorItem.instancePath || '').split('/').filter(Boolean)[0];
  const field = unknownField || missingField || pathField || null;
  const error = new Error(`${label} 请求不符合 HTTP 契约${field ? `：${field}` : ''}。`);
  error.status = 400;
  error.details = { operation: operationId, ...(field ? { field } : {}), keyword: errorItem.keyword || 'schema' };
  if (unknownField) {
    error.code = 'task_api_field_forbidden';
    error.message = `${label} 不支持字段：${unknownField}。`;
  } else if (field === 'expectedRecordDigest') {
    error.code = 'task_record_digest_required';
    error.message = `${label} 必须包含有效 expectedRecordDigest。`;
  } else if (operationId === 'task-record.update' && errorItem.keyword === 'minProperties') {
    error.code = 'task_record_update_empty';
    error.message = 'Task update 至少需要一个明确 mutation。';
  } else if (operationId === 'task-record.complete' && field === 'noChange') {
    error.code = 'task_record_no_change_required';
    error.message = 'complete 必须明确提供 noChange boolean。';
  } else if (operationId === 'task-record.list') {
    error.code = 'task_record_filter_invalid';
  } else if (field && /Services$/.test(field)) {
    error.code = 'task_record_reference_invalid';
  } else {
    error.code = 'task_record_field_invalid';
  }
  return error;
}

function validateRequest(operationId, value, label) {
  const operation = OPERATIONS.get(operationId);
  const result = TASK_RECORD_HTTP_VALIDATORS.validate(operation.requestSchemaId, value);
  if (!result.valid) throw invalidContractInput(operationId, label, result.errors);
  return value;
}

function taskQueryInput(searchParams) {
  const input = {};
  for (const field of new Set(searchParams.keys())) {
    if (!TASK_QUERY_FIELDS.has(field)) {
      const error = new Error(`Task list 不支持 query 参数：${field}。`);
      error.code = 'task_api_query_forbidden'; error.status = 400; error.details = { field };
      throw error;
    }
    const values = searchParams.getAll(field);
    if (values.length !== 1) {
      const error = new Error(`Task list query 参数不能重复：${field}。`);
      error.code = 'task_api_query_invalid'; error.status = 400; error.details = { field };
      throw error;
    }
    input[field] = values[0];
  }
  return mapTaskListRequest(validateRequest('task-record.list', input, 'Task list'));
}

export async function handleTaskRecordHttpRequest({ request, suffix, searchParams, root, runtime, authorizeWrite, readBody }) {
  if (request.method === 'GET' && suffix === '/tasks') {
    return { status: 200, body: runtime.queryTaskRecordViews(root, taskQueryInput(searchParams)) };
  }

  const taskMatch = suffix.match(TASK_RECORD_PATH);
  if (request.method === 'GET' && taskMatch) {
    return { status: 200, body: runtime.inspectTaskRecordView(root, taskMatch[1]) };
  }
  if (request.method === 'PATCH' && taskMatch) {
    authorizeWrite();
    const input = validateRequest('task-record.update', await readBody(null, 'Task update'), 'Task update');
    return { status: 200, body: runtime.updateTaskRecord(root, taskMatch[1], mapTaskUpdateRequest(input)) };
  }

  const taskCompleteMatch = suffix.match(TASK_COMPLETE_PATH);
  if (request.method === 'POST' && taskCompleteMatch) {
    authorizeWrite();
    const input = validateRequest('task-record.complete', await readBody(null, 'Task complete'), 'Task complete');
    return { status: 200, body: runtime.completeTaskRecord(root, taskCompleteMatch[1], mapTaskCompleteRequest(input)) };
  }

  const taskAbandonMatch = suffix.match(TASK_ABANDON_PATH);
  if (request.method === 'POST' && taskAbandonMatch) {
    authorizeWrite();
    const input = validateRequest('task-record.abandon', await readBody(null, 'Task abandon'), 'Task abandon');
    return { status: 200, body: runtime.abandonTaskRecord(root, taskAbandonMatch[1], mapTaskAbandonRequest(input)) };
  }

  return null;
}
