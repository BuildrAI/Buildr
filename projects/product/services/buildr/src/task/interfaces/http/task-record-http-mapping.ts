import type {
  TaskAbandonRequest,
  TaskCompleteRequest,
  TaskListRequest,
  TaskUpdateRequest,
} from './generated/task-record-http-dto.ts';

function present<T extends object, K extends keyof T>(input: T, field: K): Pick<T, K> | Record<string, never> {
  return Object.hasOwn(input, field) ? { [field]: input[field] } as Pick<T, K> : {};
}

export function mapTaskListRequest(input: TaskListRequest): TaskListRequest {
  return {
    ...present(input, 'q'),
    ...present(input, 'project'),
    ...present(input, 'service'),
    ...present(input, 'status'),
    ...present(input, 'hasChildren'),
    ...present(input, 'hasRetrospective'),
    ...present(input, 'retrospectiveState'),
  };
}

export function mapTaskUpdateRequest(input: TaskUpdateRequest): TaskUpdateRequest {
  const result: TaskUpdateRequest = { expectedRecordDigest: input.expectedRecordDigest };
  for (const field of ['isParent', 'status', 'reason', 'summary', 'noChange', 'parentCompletion', 'title', 'intent', 'parentTaskId', 'addProjects', 'removeProjects', 'addServices', 'removeServices', 'addChanges', 'removeChanges', 'addRetrospectiveSources', 'removeRetrospectiveSources'] as const) {
    Object.assign(result, present(input, field));
  }
  return result;
}

export function mapTaskCompleteRequest(input: TaskCompleteRequest): TaskCompleteRequest {
  return {
    expectedRecordDigest: input.expectedRecordDigest,
    summary: input.summary,
    noChange: input.noChange,
    ...present(input, 'parentCompletion'),
  };
}

export function mapTaskAbandonRequest(input: TaskAbandonRequest): TaskAbandonRequest {
  return {
    expectedRecordDigest: input.expectedRecordDigest,
    reason: input.reason,
  };
}
