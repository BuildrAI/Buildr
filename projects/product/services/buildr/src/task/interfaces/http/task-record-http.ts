import { TASK_RECORD_ID_SOURCE } from '../../domain/task-record.ts';
import type {
  TaskAbandonRequest,
  TaskCompleteRequest,
  TaskUpdateRequest,
} from './generated/task-record-http-dto.ts';
import {
  mapTaskAbandonRequest,
  mapTaskCompleteRequest,
  mapTaskUpdateRequest,
} from './task-record-http-mapping.ts';
import {
  TASK_RECORD_HTTP_OPERATIONS,
  TASK_RECORD_HTTP_VALIDATORS,
} from './task-record-http-contracts.ts';

export { TASK_RECORD_ID_SOURCE };

const TASK_QUERY_FIELDS = new Set(['q', 'project', 'service', 'status', 'hasChildren', 'retrospectiveState']);
const TASK_RECORD_PATH = new RegExp(`^/tasks/(${TASK_RECORD_ID_SOURCE})$`);
const TASK_RETROSPECTIVE_DOCUMENT_PATH = new RegExp(`^/tasks/(${TASK_RECORD_ID_SOURCE})/retrospective-document$`);
const TASK_COMPLETE_PATH = new RegExp(`^/tasks/(${TASK_RECORD_ID_SOURCE})/complete$`);
const TASK_ABANDON_PATH = new RegExp(`^/tasks/(${TASK_RECORD_ID_SOURCE})/abandon$`);
const OPERATIONS = new Map(TASK_RECORD_HTTP_OPERATIONS.map((operation) => [operation.id, operation]));
type ValidationIssue = { keyword?: string; instancePath?: string; params?: { missingProperty?: string; additionalProperty?: string } };
type HttpBusinessError = Error & { code: string; status: number; details?: unknown };
type HttpResult = { status: number; body: unknown };
type TaskHttpRuntime = {
  queryTaskRecordViews(root: string, input: unknown): unknown;
  inspectTaskRetrospectiveDocument(root: string, taskId: string): unknown;
  inspectTaskRecordView(root: string, taskId: string): unknown;
  updateTaskRecord(root: string, taskId: string, input: unknown): unknown;
  completeTaskRecord(root: string, taskId: string, input: unknown): unknown;
  abandonTaskRecord(root: string, taskId: string, input: unknown): unknown;
};
export type TaskHttpInput = {
  request: { method?: string };
  suffix: string;
  searchParams: URLSearchParams;
  root: string;
  runtime: TaskHttpRuntime;
  authorizeWrite(): void;
  readBody<T>(schema: null, label: string): Promise<T>;
};

function invalidContractInput(operationId: string, label: string, errors: readonly ValidationIssue[]): HttpBusinessError {
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
  let code = 'task_record_field_invalid';
  let message = `${label} 请求不符合 HTTP 契约${field ? `：${field}` : ''}。`;
  if (unknownField) {
    code = 'task_api_field_forbidden';
    message = `${label} 不支持字段：${unknownField}。`;
  } else if (field === 'expectedRecordDigest') {
    code = 'task_record_digest_required';
    message = `${label} 必须包含有效 expectedRecordDigest。`;
  } else if (operationId === 'task-record.update' && errorItem.keyword === 'minProperties') {
    code = 'task_record_update_empty';
    message = 'Task update 至少需要一个明确 mutation。';
  } else if (operationId === 'task-record.complete' && field === 'noChange') {
    code = 'task_record_no_change_required';
    message = 'complete 必须明确提供 noChange boolean。';
  } else if (operationId === 'task-record.list') {
    code = 'task_record_filter_invalid';
  } else if (field && /Services$/.test(field)) {
    code = 'task_record_reference_invalid';
  }
  return Object.assign(new Error(message), { code, status: 400, details: { operation: operationId, ...(field ? { field } : {}), keyword: errorItem.keyword || 'schema' } });
}

function validateRequest<T>(operationId: string, value: T, label: string): T {
  const operation = OPERATIONS.get(operationId);
  if (!operation) throw new Error(`Task Record HTTP operation未注册：${operationId}。`);
  const result = TASK_RECORD_HTTP_VALIDATORS.validate(operation.requestSchemaId, value);
  if (!result.valid) throw invalidContractInput(operationId, label, result.errors);
  return value;
}

function taskQueryInput(searchParams: URLSearchParams): Record<string, string> {
  const input: Record<string, string> = {};
  for (const field of new Set(searchParams.keys())) {
    if (!TASK_QUERY_FIELDS.has(field)) {
      throw Object.assign(new Error(`Task list 不支持 query 参数：${field}。`), { code: 'task_api_query_forbidden', status: 400, details: { field } });
    }
    const values = searchParams.getAll(field);
    if (values.length !== 1) {
      throw Object.assign(new Error(`Task list query 参数不能重复：${field}。`), { code: 'task_api_query_invalid', status: 400, details: { field } });
    }
    input[field] = values[0];
  }
  return { ...validateRequest('task-record.list', input, 'Task list') };
}

export async function handleTaskRecordHttpRequest({ request, suffix, searchParams, root, runtime, authorizeWrite, readBody }: TaskHttpInput): Promise<HttpResult | null> {
  if (request.method === 'GET' && suffix === '/tasks') {
    return { status: 200, body: runtime.queryTaskRecordViews(root, taskQueryInput(searchParams)) };
  }

  const retrospectiveDocumentMatch = suffix.match(TASK_RETROSPECTIVE_DOCUMENT_PATH);
  if (request.method === 'GET' && retrospectiveDocumentMatch) {
    if (searchParams?.size) {
      throw Object.assign(new Error('Task retrospective document不接受query参数。'), { code: 'task_api_query_forbidden', status: 400 });
    }
    validateRequest('task-record.retrospective-document', {}, 'Task retrospective document');
    return { status: 200, body: runtime.inspectTaskRetrospectiveDocument(root, retrospectiveDocumentMatch[1]) };
  }

  const taskMatch = suffix.match(TASK_RECORD_PATH);
  if (request.method === 'GET' && taskMatch) {
    return { status: 200, body: runtime.inspectTaskRecordView(root, taskMatch[1]) };
  }
  if (request.method === 'PATCH' && taskMatch) {
    authorizeWrite();
    const input = validateRequest('task-record.update', await readBody<TaskUpdateRequest>(null, 'Task update'), 'Task update');
    return { status: 200, body: runtime.updateTaskRecord(root, taskMatch[1], mapTaskUpdateRequest(input)) };
  }

  const taskCompleteMatch = suffix.match(TASK_COMPLETE_PATH);
  if (request.method === 'POST' && taskCompleteMatch) {
    authorizeWrite();
    const input = validateRequest('task-record.complete', await readBody<TaskCompleteRequest>(null, 'Task complete'), 'Task complete');
    return { status: 200, body: runtime.completeTaskRecord(root, taskCompleteMatch[1], mapTaskCompleteRequest(input)) };
  }

  const taskAbandonMatch = suffix.match(TASK_ABANDON_PATH);
  if (request.method === 'POST' && taskAbandonMatch) {
    authorizeWrite();
    const input = validateRequest('task-record.abandon', await readBody<TaskAbandonRequest>(null, 'Task abandon'), 'Task abandon');
    return { status: 200, body: runtime.abandonTaskRecord(root, taskAbandonMatch[1], mapTaskAbandonRequest(input)) };
  }

  return null;
}
