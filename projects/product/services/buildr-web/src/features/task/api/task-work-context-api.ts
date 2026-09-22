import { api } from '../../../api';
import type { TaskWorkContextsResponse } from '../../../../build/generated/workbench-dto';
export function readTaskWorkContexts(taskIds: string[], signal: AbortSignal): Promise<TaskWorkContextsResponse> {
  const query = new URLSearchParams({ ids: taskIds.join(',') });
  return api(`/api/v1/tasks/work-contexts?${query}`, { signal }) as Promise<TaskWorkContextsResponse>;
}
