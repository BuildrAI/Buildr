import type { ApiClient } from '../../../api/client';
import { api } from '../../../api';
import type {
  TaskAbandonRequest,
  TaskAbandonResponse,
  TaskCompleteRequest,
  TaskCompleteResponse,
  TaskDetailResponse,
  TaskListRequest,
  TaskListResponse,
  TaskRetrospectiveDocumentResponse,
  TaskUpdateRequest,
  TaskUpdateResponse,
} from './generated/task-record-dto';

type ReadOptions = Pick<RequestInit, 'signal'>;

function queryString(input: TaskListRequest): string {
  const query = new URLSearchParams();
  for (const [field, value] of Object.entries(input)) {
    if (value !== undefined) query.set(field, value);
  }
  const rendered = query.toString();
  return rendered ? `?${rendered}` : '';
}

function typed<T>(request: Promise<unknown>): Promise<T> {
  return request as Promise<T>;
}

export function createTasksClient(client: ApiClient) {
  return Object.freeze({
    list(input: TaskListRequest = {}, options: ReadOptions = {}): Promise<TaskListResponse> {
      return typed(client(`/api/v1/tasks${queryString(input)}`, options));
    },
    detail(taskId: string, options: ReadOptions = {}): Promise<TaskDetailResponse> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}`, options));
    },
    retrospectiveDocument(taskId: string, options: ReadOptions = {}): Promise<TaskRetrospectiveDocumentResponse> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}/retrospective-document`, options));
    },
    update(taskId: string, input: TaskUpdateRequest): Promise<TaskUpdateResponse> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }));
    },
    complete(taskId: string, input: TaskCompleteRequest): Promise<TaskCompleteResponse> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}/complete`, {
        method: 'POST',
        body: JSON.stringify(input),
      }));
    },
    abandon(taskId: string, input: TaskAbandonRequest): Promise<TaskAbandonResponse> {
      return typed(client(`/api/v1/tasks/${encodeURIComponent(taskId)}/abandon`, {
        method: 'POST',
        body: JSON.stringify(input),
      }));
    },
  });
}

export type TasksClient = ReturnType<typeof createTasksClient>;
export const taskRecordApi = createTasksClient(api);
