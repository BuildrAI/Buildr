const TASK_ID = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';

export async function handleTaskReviewHttpRequest({ request, suffix, root, runtime, authorizeWrite, readBody, submitTaskRead }) {
  const reviews = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/reviews$`));
  if (request.method === 'GET' && reviews) return { status: 200, body: await submitTaskRead('reviews', reviews[1]) };
  if (request.method !== 'POST' || suffix !== '/prompts/task-review') return null;
  authorizeWrite();
  const input = await readBody(new Set(['taskId', 'reviewType', 'projectCode', 'change']), 'Task Review prompt');
  return { status: 200, body: runtime.generateTaskReviewPrompt(root, input) };
}
