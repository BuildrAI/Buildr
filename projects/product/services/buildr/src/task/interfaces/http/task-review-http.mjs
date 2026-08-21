export async function handleTaskReviewHttpRequest({ request, suffix, root, runtime, authorizeWrite, readBody }) {
  if (request.method !== 'POST' || suffix !== '/prompts/task-review') return null;
  authorizeWrite();
  const input = await readBody(new Set(['taskId', 'reviewType', 'projectCode', 'change']), 'Task Review prompt');
  return { status: 200, body: runtime.generateTaskReviewPrompt(root, input) };
}
