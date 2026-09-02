import type {
  TaskAbandonRequest,
  TaskCompleteRequest,
  TaskListRequest,
  TaskUpdateRequest,
} from './generated/task-record-http-dto.ts';

export function mapTaskListRequest(input: TaskListRequest): TaskListRequest {
  const result: TaskListRequest = {};
  if (Object.hasOwn(input, 'q')) result.q = input.q;
  if (Object.hasOwn(input, 'project')) result.project = input.project;
  if (Object.hasOwn(input, 'service')) result.service = input.service;
  if (Object.hasOwn(input, 'status')) result.status = input.status;
  if (Object.hasOwn(input, 'hasChildren')) result.hasChildren = input.hasChildren;
  if (Object.hasOwn(input, 'retrospectiveState')) result.retrospectiveState = input.retrospectiveState;
  return result;
}

export function mapTaskUpdateRequest(input: TaskUpdateRequest): TaskUpdateRequest {
  const result: TaskUpdateRequest = { expectedRecordDigest: input.expectedRecordDigest };
  if (Object.hasOwn(input, 'isParent')) result.isParent = input.isParent;
  if (Object.hasOwn(input, 'status')) result.status = input.status;
  if (Object.hasOwn(input, 'reason')) result.reason = input.reason;
  if (Object.hasOwn(input, 'summary')) result.summary = input.summary;
  if (Object.hasOwn(input, 'noChange')) result.noChange = input.noChange;
  if (Object.hasOwn(input, 'parentCompletion')) result.parentCompletion = input.parentCompletion;
  if (Object.hasOwn(input, 'title')) result.title = input.title;
  if (Object.hasOwn(input, 'intent')) result.intent = input.intent;
  if (Object.hasOwn(input, 'parentTaskId')) result.parentTaskId = input.parentTaskId;
  if (Object.hasOwn(input, 'addProjects')) result.addProjects = input.addProjects;
  if (Object.hasOwn(input, 'removeProjects')) result.removeProjects = input.removeProjects;
  if (Object.hasOwn(input, 'addServices')) result.addServices = input.addServices;
  if (Object.hasOwn(input, 'removeServices')) result.removeServices = input.removeServices;
  if (Object.hasOwn(input, 'addChanges')) result.addChanges = input.addChanges;
  if (Object.hasOwn(input, 'removeChanges')) result.removeChanges = input.removeChanges;
  if (Object.hasOwn(input, 'retrospectiveState')) result.retrospectiveState = input.retrospectiveState;
  if (Object.hasOwn(input, 'retrospectiveDocumentDigest')) result.retrospectiveDocumentDigest = input.retrospectiveDocumentDigest;
  if (Object.hasOwn(input, 'clearRetrospective')) result.clearRetrospective = input.clearRetrospective;
  return result;
}

export function mapTaskCompleteRequest(input: TaskCompleteRequest): TaskCompleteRequest {
  return {
    expectedRecordDigest: input.expectedRecordDigest,
    summary: input.summary,
    noChange: input.noChange,
    ...(Object.hasOwn(input, 'parentCompletion') ? { parentCompletion: input.parentCompletion } : {}),
  };
}

export function mapTaskAbandonRequest(input: TaskAbandonRequest): TaskAbandonRequest {
  return {
    expectedRecordDigest: input.expectedRecordDigest,
    reason: input.reason,
  };
}
