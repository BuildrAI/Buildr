import type {
  TaskAbandonRequest,
  TaskAbandonResponse,
  TaskCompleteRequest,
  TaskCompleteResponse,
  TaskDetailResponse,
  TaskListRequest,
  TaskListResponse,
  TaskUpdateRequest,
  TaskUpdateResponse,
} from './generated/task-dto.ts';
import { TASK_RECORD_SCHEMA, type ParentCompletion, type TaskResult, type TaskResultHistory, type TaskRetrospective, type TaskRetrospectiveDocumentState, type TaskStatus } from '../domain/task.ts';

export { TASK_RECORD_SCHEMA };
export type { ParentCompletion, TaskRetrospectiveDocumentState };
export type TaskRecordStatus = TaskStatus;
export type TaskRetrospectiveReference = TaskRetrospective;
export type TaskServiceReference = { project: string; service: string };
export type TaskChangeReference = { project: string; change: string };
export type TaskRecordResult = TaskResult | null;
export type TaskRecordHistory = TaskResultHistory;
export type TaskRecord = {
  schemaVersion: typeof TASK_RECORD_SCHEMA;
  taskId: string;
  title: string;
  intent: string;
  scope: { projects: string[]; services: TaskServiceReference[] };
  changes: TaskChangeReference[];
  parentTaskId: string | null;
  isParent?: true;
  retrospective: TaskRetrospectiveReference | null;
  status: TaskRecordStatus;
  result: TaskRecordResult;
  resultHistory?: TaskRecordHistory[];
  createdAt: string;
  updatedAt: string;
};

export type TaskRecordBusinessError = Error & {
  code: string;
  status: number;
  details?: unknown;
  nextAction?: string;
  taskRecordBusiness: true;
};

export type TaskPersistence = { root: string; record: TaskRecord; recordDigest: string };
export type TaskRelation = { taskId: string; title: string; status: TaskStatus };
export type TaskView = TaskPersistence & { taskRelations: { parent: TaskRelation | null; children: TaskRelation[] } };
export type TaskQueryFilters = { q?: string; project?: string; service?: TaskServiceReference; status?: string; hasChildren?: string; retrospectiveState?: string };

export type TaskCreateInputDto = {
  taskId: string;
  title: string;
  intent: string;
  status?: 'todo' | 'active';
  isParent?: true;
  parentTaskId?: string | null;
  projects?: string[];
  services?: Array<string | { project: string; service: string }>;
  changes?: Array<string | { project: string; change: string }>;
};

export type TaskActivateInputDto = { expectedRecordDigest: string };
export type TaskListInputDto = TaskListRequest;
export type TaskUpdateInputDto = TaskUpdateRequest;
export type TaskCompleteInputDto = TaskCompleteRequest;
export type TaskAbandonInputDto = TaskAbandonRequest;
export type TaskListOutputDto = TaskListResponse;
export type TaskDetailOutputDto = TaskDetailResponse;
export type TaskUpdateOutputDto = TaskUpdateResponse;
export type TaskCompleteOutputDto = TaskCompleteResponse;
export type TaskAbandonOutputDto = TaskAbandonResponse;
