import { validateTaskProfessionalRequest } from './task-professional-http-contracts.ts';

const TASK_ID = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';

export type TaskReviewHttpInput = {
  request: { method: string };
  suffix: string;
  searchParams?: URLSearchParams;
  submitTaskRead(operation: string, taskId: string): Promise<unknown>;
};

export async function handleTaskReviewHttpRequest({ request, suffix, searchParams, submitTaskRead }: TaskReviewHttpInput) {
  const reviews = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/reviews$`));
  if (request.method === 'GET' && reviews) {
    if (searchParams?.size) {
      throw Object.assign(new Error('Task Review 不接受 query 参数。'), { code: 'task_api_query_forbidden', status: 400 });
    }
    validateTaskProfessionalRequest('task-review.detail', {}, 'Task Review');
    return { status: 200, body: await submitTaskRead('reviews', reviews[1]) };
  }
  return null;
}
