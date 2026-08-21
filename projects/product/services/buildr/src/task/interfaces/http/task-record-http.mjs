import { TASK_RECORD_ID_SOURCE } from '../../domain/task-record.mjs';

export { TASK_RECORD_ID_SOURCE };

const TASK_QUERY_FIELDS = new Set(['q', 'project', 'service', 'status', 'hasChildren', 'hasRetrospective', 'retrospectiveState']);
const TASK_RECORD_PATH = new RegExp(`^/tasks/(${TASK_RECORD_ID_SOURCE})$`);
const TASK_COMPLETE_PATH = new RegExp(`^/tasks/(${TASK_RECORD_ID_SOURCE})/complete$`);
const TASK_ABANDON_PATH = new RegExp(`^/tasks/(${TASK_RECORD_ID_SOURCE})/abandon$`);

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
  return input;
}

function requireRecordDigest(input, label) {
  if (Object.hasOwn(input, 'expectedRecordDigest')) return;
  const error = new Error(`${label} 必须包含 expectedRecordDigest。`);
  error.code = 'task_record_digest_required';
  error.status = 400;
  throw error;
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
    const input = await readBody(new Set(['expectedRecordDigest', 'title', 'intent', 'parentTaskId', 'addProjects', 'removeProjects', 'addServices', 'removeServices', 'addRetrospectiveSources', 'removeRetrospectiveSources']), 'Task update');
    requireRecordDigest(input, 'Task update');
    return { status: 200, body: runtime.updateTaskRecord(root, taskMatch[1], input) };
  }

  const taskCompleteMatch = suffix.match(TASK_COMPLETE_PATH);
  if (request.method === 'POST' && taskCompleteMatch) {
    authorizeWrite();
    const input = await readBody(new Set(['expectedRecordDigest', 'summary', 'noChange']), 'Task complete');
    requireRecordDigest(input, 'Task complete');
    return { status: 200, body: runtime.completeTaskRecord(root, taskCompleteMatch[1], input) };
  }

  const taskAbandonMatch = suffix.match(TASK_ABANDON_PATH);
  if (request.method === 'POST' && taskAbandonMatch) {
    authorizeWrite();
    const input = await readBody(new Set(['expectedRecordDigest', 'reason']), 'Task abandon');
    requireRecordDigest(input, 'Task abandon');
    return { status: 200, body: runtime.abandonTaskRecord(root, taskAbandonMatch[1], input) };
  }

  return null;
}
