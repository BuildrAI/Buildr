import { TASK_ID_SOURCE } from '../../../application/task-validation.ts';
import { TASK_HTTP_SCHEMAS, TASK_HTTP_VALIDATORS } from '../../../interfaces/http/task-http-schema.ts';

export function createTaskChangedFilesHttpContribution() {
  return Object.freeze({
    id: 'task.changed-files.http',
    handle: async ({ request, suffix, searchParams, submitTaskRead }: {
      request: { method?: string }; suffix: string; searchParams: URLSearchParams;
      submitTaskRead(operation: string, taskId: string): Promise<unknown>;
    }) => {
      const match = suffix.match(new RegExp(`^/tasks/(${TASK_ID_SOURCE})/changed-files$`));
      if (request.method !== 'GET' || !match) return null;
      if (searchParams.size) throw Object.assign(new Error('变更文件读取不接受查询参数。'), { code: 'task_api_query_forbidden', status: 400 });
      const body = await submitTaskRead('changed-files', match[1]);
      if (!TASK_HTTP_VALIDATORS.validate(TASK_HTTP_SCHEMAS.changedFilesResponse.$id, body).valid) throw Object.assign(new Error('变更文件读取结果不符合契约。'), { code: 'task_changed_files_contract_invalid', status: 500 });
      return { status: 200, body };
    },
  });
}
