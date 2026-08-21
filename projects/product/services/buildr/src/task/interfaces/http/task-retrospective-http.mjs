import { TASK_RECORD_ID_SOURCE } from './task-record-http.mjs';

const TASK_RETROSPECTIVE_PATH = new RegExp(`^/tasks/(${TASK_RECORD_ID_SOURCE})/retrospective$`);

export async function handleTaskRetrospectiveHttpRequest({ request, suffix, root, runtime, authorizeWrite, readBody }) {
  const taskRetrospectiveMatch = suffix.match(TASK_RETROSPECTIVE_PATH);
  if (request.method === 'GET' && taskRetrospectiveMatch) {
    return { status: 200, body: runtime.inspectTaskRetrospective(root, taskRetrospectiveMatch[1]) };
  }
  if (request.method === 'PATCH' && taskRetrospectiveMatch) {
    authorizeWrite();
    const input = await readBody(new Set(['status', 'note', 'expectedCurrentDigest']), 'Task retrospective handle');
    if (!Object.hasOwn(input, 'expectedCurrentDigest')) {
      const error = new Error('Task retrospective handle 必须包含 expectedCurrentDigest。');
      error.code = 'task_retrospective_digest_required';
      error.status = 400;
      throw error;
    }
    return { status: 200, body: runtime.handleTaskRetrospective(root, taskRetrospectiveMatch[1], input) };
  }
  return null;
}
