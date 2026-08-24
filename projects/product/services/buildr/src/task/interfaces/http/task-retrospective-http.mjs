import { TASK_RECORD_ID_SOURCE } from './task-record-http.mjs';
import { validateTaskProfessionalRequest } from './task-professional-http-contracts.mjs';
import { mapTaskRetrospectiveRequest } from './task-professional-http-mapping.mjs';

const TASK_RETROSPECTIVE_PATH = new RegExp(`^/tasks/(${TASK_RECORD_ID_SOURCE})/retrospective$`);

export async function handleTaskRetrospectiveHttpRequest({ request, suffix, searchParams, root, runtime, authorizeWrite, readBody }) {
  const taskRetrospectiveMatch = suffix.match(TASK_RETROSPECTIVE_PATH);
  if (request.method === 'GET' && taskRetrospectiveMatch) {
    if (searchParams?.size) {
      const error = new Error('Task retrospective 不接受 query 参数。');
      error.code = 'task_api_query_forbidden';
      error.status = 400;
      throw error;
    }
    validateTaskProfessionalRequest('task-retrospective.detail', {}, 'Task retrospective');
    return { status: 200, body: runtime.inspectTaskRetrospective(root, taskRetrospectiveMatch[1]) };
  }
  if (request.method === 'PATCH' && taskRetrospectiveMatch) {
    authorizeWrite();
    const input = mapTaskRetrospectiveRequest(validateTaskProfessionalRequest('task-retrospective.patch', await readBody(new Set(['status', 'note', 'expectedCurrentDigest']), 'Task retrospective handle'), 'Task retrospective handle'));
    return { status: 200, body: runtime.handleTaskRetrospective(root, taskRetrospectiveMatch[1], input) };
  }
  return null;
}
