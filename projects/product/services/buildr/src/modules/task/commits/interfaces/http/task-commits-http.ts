import { TASK_ID_SOURCE } from '../../../application/task-validation.ts';
import { TASK_HTTP_SCHEMAS, TASK_HTTP_VALIDATORS } from '../../../interfaces/http/task-http-schema.ts';

export function createTaskCommitsHttpContribution() {
  return Object.freeze({
    id: 'task.commits.http',
    handle: async ({ request, suffix, searchParams, submitTaskRead }: {
      request: { method?: string }; suffix: string; searchParams: URLSearchParams;
      submitTaskRead(operation: string, taskId: string): Promise<unknown>;
    }) => {
      const match = suffix.match(new RegExp(`^/tasks/(${TASK_ID_SOURCE})/commits$`));
      if (request.method !== 'GET' || !match) return null;
      if (searchParams.size) throw Object.assign(new Error('提交记录读取不接受查询参数。'), { code: 'task_api_query_forbidden', status: 400 });
      const body = await submitTaskRead('commits', match[1]);
      if (!TASK_HTTP_VALIDATORS.validate(TASK_HTTP_SCHEMAS.commitsResponse.$id, body).valid) throw Object.assign(new Error('提交记录读取结果不符合契约。'), { code: 'task_commits_contract_invalid', status: 500 });
      return { status: 200, body };
    },
  });
}
