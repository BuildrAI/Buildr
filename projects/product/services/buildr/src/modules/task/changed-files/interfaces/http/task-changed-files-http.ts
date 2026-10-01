import { TASK_ID_SOURCE } from '../../../application/task-validation.ts';
import { TASK_HTTP_SCHEMAS, TASK_HTTP_VALIDATORS } from '../../../interfaces/http/task-http-schema.ts';

export function createTaskChangedFilesHttpContribution() {
  return Object.freeze({
    id: 'task.changed-files.http',
    handle: async ({ request, suffix, searchParams, submitTaskRead }: {
      request: { method?: string }; suffix: string; searchParams: URLSearchParams;
      submitTaskRead(operation: string, taskId: string, input?: Record<string, string>): Promise<unknown>;
    }) => {
      const match = suffix.match(new RegExp(`^/tasks/(${TASK_ID_SOURCE})/(changed-files|file-diff)$`));
      if (request.method !== 'GET' || !match) return null;
      if (match[2] === 'changed-files' && searchParams.size) throw Object.assign(new Error('变更文件读取不接受查询参数。'), { code: 'task_api_query_forbidden', status: 400 });
      const input = Object.fromEntries(searchParams);
      if (match[2] === 'file-diff' && ([...searchParams.keys()].length !== 3 || !TASK_HTTP_VALIDATORS.validate(TASK_HTTP_SCHEMAS.fileDiffRequest.$id, input).valid)) throw Object.assign(new Error('完整差异查询参数无效。'), { code: 'task_api_query_invalid', status: 400 });
      const body = await submitTaskRead(match[2], match[1], match[2] === 'file-diff' ? input : undefined);
      if (!TASK_HTTP_VALIDATORS.validate(TASK_HTTP_SCHEMAS.changedFilesResponse.$id, body).valid) throw Object.assign(new Error('变更文件读取结果不符合契约。'), { code: 'task_changed_files_contract_invalid', status: 500 });
      return { status: 200, body };
    },
  });
}
