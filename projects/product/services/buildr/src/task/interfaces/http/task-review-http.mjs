import { validateTaskProfessionalRequest } from './task-professional-http-contracts.ts';
import { mapTaskReviewPromptRequest } from './task-professional-http-mapping.ts';

const TASK_ID = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';

export async function handleTaskReviewHttpRequest({ request, suffix, searchParams, root, runtime, authorizeWrite, readBody, submitTaskRead }) {
  const reviews = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/reviews$`));
  if (request.method === 'GET' && reviews) {
    if (searchParams?.size) {
      const error = new Error('Task Review 不接受 query 参数。');
      error.code = 'task_api_query_forbidden';
      error.status = 400;
      throw error;
    }
    validateTaskProfessionalRequest('task-review.detail', {}, 'Task Review');
    return { status: 200, body: await submitTaskRead('reviews', reviews[1]) };
  }
  if (request.method !== 'POST' || suffix !== '/prompts/task-review') return null;
  if (searchParams?.size) {
    const error = new Error('Task Review prompt 不接受 query 参数。');
    error.code = 'task_api_query_forbidden';
    error.status = 400;
    throw error;
  }
  authorizeWrite();
  const input = mapTaskReviewPromptRequest(validateTaskProfessionalRequest('task-review.prompt', await readBody(new Set(['taskId', 'reviewType', 'projectCode', 'change']), 'Task Review prompt'), 'Task Review prompt'));
  return { status: 200, body: runtime.generateTaskReviewPrompt(root, input) };
}
