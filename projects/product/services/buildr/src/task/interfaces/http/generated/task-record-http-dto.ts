/* eslint-disable */
// Generated from Task Record HTTP JSON Schema. Do not edit.
// Run: npm run contracts:generate

export type TaskId = string;
export type TaskResult = null | {
  summary: string;
  parentCompletion?: ParentCompletion;
};
export type QualifiedServiceInput = string | QualifiedService;

export interface TaskRecordHttpDtoProjection {
  taskRecordMutationResponse: TaskRecordMutationResponse;
  taskListRequest: TaskListRequest;
  taskListResponse: TaskListResponse;
  taskDetailRequest: TaskDetailRequest;
  taskDetailResponse: TaskDetailResponse;
  taskUpdateRequest: TaskUpdateRequest;
  taskUpdateResponse: TaskRecordMutationResponse;
  taskCompleteRequest: TaskCompleteRequest;
  taskCompleteResponse: TaskRecordMutationResponse;
  taskAbandonRequest: TaskAbandonRequest;
  taskAbandonResponse: TaskRecordMutationResponse;
  taskRetrospectiveDocumentRequest: TaskRetrospectiveDocumentRequest;
  taskRetrospectiveDocumentResponse: TaskRetrospectiveDocumentResponse;
  taskErrorResponse: ErrorResponse;
}
export interface TaskRecordMutationResponse {
  schemaVersion: 'buildr.task-record-result/v5';
  operation: 'update' | 'complete' | 'abandon';
  status: 'updated' | 'completed' | 'abandoned';
  taskId: TaskId;
  record: TaskRecord;
  recordDigest: string;
  changeReferences: {
    [k: string]: unknown | undefined;
  }[];
  taskRelations: TaskRelations;
  retrospectiveDocument: RetrospectiveDocumentReference;
  diagnostic: null;
  effects: {
    type: string;
    taskId: TaskId;
  }[];
  nextActions: string[];
}
export interface TaskRecord {
  schemaVersion: 'buildr.task-record/v3';
  taskId: TaskId;
  title: string;
  intent: string;
  scope: {
    projects: string[];
    services: QualifiedService[];
  };
  changes: QualifiedChange[];
  parentTaskId: TaskId | null;
  isParent?: boolean;
  retrospective: {
    state: 'pending-decision' | 'decided';
    documentDigest: string;
  } | null;
  status: 'todo' | 'active' | 'completed' | 'abandoned';
  result: TaskResult;
  resultHistory?: TaskResultHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}
export interface QualifiedService {
  project: string;
  service: string;
}
export interface QualifiedChange {
  project: string;
  change: string;
}
export interface ParentCompletion {
  expectedSnapshot: string;
  acceptance: {
    summary: string;
    children: {
      taskId: TaskId;
      summary: string;
    }[];
  };
  authorization: {
    source: string;
    statement: string;
  };
  recordedAt?: string;
}
export interface TaskResultHistoryEntry {
  status: 'completed' | 'abandoned';
  title: string;
  intent: string;
  parentTaskId: TaskId | null;
  scope?: {
    projects: string[];
    services: QualifiedService[];
  };
  changes?: QualifiedChange[];
  isParent?: true;
  result: TaskResult;
  recordUpdatedAt: string;
  correctedAt: string;
  reason: string;
}
export interface TaskRelations {
  parent: TaskRelationSummary | null;
  children: TaskRelationSummary[];
}
export interface TaskRelationSummary {
  taskId: TaskId;
  title: string;
  status: 'todo' | 'active' | 'completed' | 'abandoned';
}
export interface RetrospectiveDocumentReference {
  path: string;
  registered: {
    state: 'pending-decision' | 'decided';
    documentDigest: string;
  } | null;
}
export interface TaskListRequest {
  q?: string;
  project?: string;
  service?: string;
  status?: 'open' | 'todo' | 'active' | 'completed' | 'abandoned' | 'all';
  hasChildren?: 'yes' | 'no' | 'all';
  retrospectiveState?: 'missing' | 'pending-decision' | 'decided' | 'all';
}
export interface TaskListResponse {
  schemaVersion: 'buildr.task-record-list/v5';
  filters: {
    q: string;
    project: string | null;
    service: string | null;
    status: 'open' | 'todo' | 'active' | 'completed' | 'abandoned' | 'all';
    hasChildren: 'yes' | 'no' | 'all';
    retrospectiveState: 'missing' | 'pending-decision' | 'decided' | 'all';
  };
  filterOptions: {
    projects: string[];
    services: string[];
  };
  totalTaskCount: number;
  tasks: StoredTaskView[];
  diagnostics: {
    taskId?: TaskId;
    code?: string;
    message: string;
    details?: unknown;
  }[];
}
export interface StoredTaskView {
  record: TaskRecord;
  recordDigest: string;
  taskRelations: TaskRelations;
  retrospectiveDocument: RetrospectiveDocumentReference;
}
export interface TaskDetailRequest {}
export interface TaskDetailResponse {
  schemaVersion: 'buildr.task-record-view/v3';
  taskId: TaskId;
  record: TaskRecord;
  recordDigest: string;
  taskRelations: TaskRelations;
  retrospectiveDocument: RetrospectiveDocumentReference;
}
export interface TaskUpdateRequest {
  expectedRecordDigest: string;
  status?: 'todo' | 'active' | 'completed' | 'abandoned';
  reason?: string;
  summary?: string;
  parentCompletion?: ParentCompletion;
  addChanges?: QualifiedChange[];
  removeChanges?: QualifiedChange[];
  isParent?: true;
  title?: string;
  intent?: string;
  parentTaskId?: TaskId | null;
  addProjects?: string[];
  removeProjects?: string[];
  addServices?: QualifiedServiceInput[];
  removeServices?: QualifiedServiceInput[];
  retrospectiveState?: 'pending-decision' | 'decided';
  retrospectiveDocumentDigest?: string;
  clearRetrospective?: true;
}
export interface TaskCompleteRequest {
  expectedRecordDigest: string;
  summary: string;
  parentCompletion?: ParentCompletion;
}
export interface TaskAbandonRequest {
  expectedRecordDigest: string;
  reason: string;
}
export interface TaskRetrospectiveDocumentRequest {}
export interface TaskRetrospectiveDocumentResponse {
  schemaVersion: 'buildr.task-retrospective-document/v1';
  operation: 'inspect';
  status: 'inspected';
  taskId: TaskId;
  path: string;
  present: boolean;
  content: string | null;
  actualDigest: string | null;
  registeredDigest: string | null;
  registeredState: ('pending-decision' | 'decided') | null;
  effectiveState: 'missing' | 'pending-decision' | 'decided';
  diagnostic: {
    code: string;
    message: string;
  } | null;
  effects: unknown[];
  nextActions: string[];
}
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type TaskUpdateResponse = TaskRecordMutationResponse;
export type TaskCompleteResponse = TaskRecordMutationResponse;
export type TaskAbandonResponse = TaskRecordMutationResponse;
export type TaskErrorResponse = ErrorResponse;
