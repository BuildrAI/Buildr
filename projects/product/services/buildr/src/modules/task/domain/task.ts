import crypto from 'node:crypto';

export const TASK_RECORD_SCHEMA = 'buildr.task-record/v4';
export const TASK_BRIEF_MAX_BYTES = 1_048_576;
export function taskContentDigest(value: string): string {
  return `sha256-${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}
export const taskBriefDigest = (brief: string | null): string | null => brief === null ? null : taskContentDigest(brief);
export const taskHistoryDigest = (history: TaskResultHistory[]): string => taskContentDigest(JSON.stringify(history));
export const TASK_ID_SOURCE = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';
const TASK_ID_PATTERN = new RegExp(`^${TASK_ID_SOURCE}$`);
export function isTaskRecordId(value: unknown): value is string {
  return typeof value === 'string' && TASK_ID_PATTERN.test(value);
}
export const TASK_RECORD_STATUSES = Object.freeze(['todo', 'active', 'completed', 'abandoned'] as const);
export const TASK_RETROSPECTIVE_DOCUMENT_STATES = Object.freeze(['pending-decision', 'decided'] as const);

export type TaskStatus = (typeof TASK_RECORD_STATUSES)[number];
export type TaskRetrospectiveDocumentState = (typeof TASK_RETROSPECTIVE_DOCUMENT_STATES)[number];

export class ParentCompletion {
  readonly expectedSnapshot: string;
  readonly acceptance: { summary: string; children: Array<{ taskId: string; summary: string }> };
  readonly authorization: { source: string; statement: string };
  readonly recordedAt?: string;

  constructor(input: ParentCompletion) {
    this.expectedSnapshot = input.expectedSnapshot;
    this.acceptance = input.acceptance;
    this.authorization = input.authorization;
    if (input.recordedAt !== undefined) this.recordedAt = input.recordedAt;
  }
}

export class TaskResult {
  readonly summary: string;
  readonly parentCompletion?: ParentCompletion;

  constructor(input: TaskResult) {
    this.summary = input.summary;
    if (input.parentCompletion !== undefined) this.parentCompletion = input.parentCompletion;
  }
}

export class TaskResultHistory {
  readonly status: 'completed' | 'abandoned';
  readonly title: string;
  readonly intent: string;
  readonly brief: string | null;
  readonly parentTaskId: string | null;
  readonly scope?: { projects: string[]; services: Array<{ project: string; service: string }> };
  readonly changes?: Array<{ project: string; change: string }>;
  readonly isParent?: true;
  readonly result: TaskResult;
  readonly recordUpdatedAt: string;
  readonly correctedAt: string;
  readonly reason: string;

  constructor(input: TaskResultHistory) {
    Object.assign(this, input);
    this.status = input.status;
    this.title = input.title;
    this.intent = input.intent;
    this.brief = input.brief;
    this.parentTaskId = input.parentTaskId;
    this.result = input.result;
    this.recordUpdatedAt = input.recordUpdatedAt;
    this.correctedAt = input.correctedAt;
    this.reason = input.reason;
  }
}

export class TaskRetrospective {
  readonly state: TaskRetrospectiveDocumentState;
  readonly documentDigest: string;

  constructor(state: TaskRetrospectiveDocumentState, documentDigest: string) {
    this.state = state;
    this.documentDigest = documentDigest;
  }
}

export class Task {
  readonly taskId: string;
  readonly title: string;
  readonly intent: string;
  readonly brief: string | null;
  readonly briefDigest: string | null;
  readonly resultHistoryDigest: string;
  readonly status: TaskStatus;
  readonly parentTaskId: string | null;
  readonly isParent: boolean;
  readonly result: TaskResult | null;
  readonly resultHistory: TaskResultHistory[];
  readonly retrospective: TaskRetrospective | null;
  readonly createdAt: string;
  readonly updatedAt: string;

  constructor(input: Omit<Task, 'briefDigest' | 'resultHistoryDigest'>, digests?: { brief: string | null; history: string }) {
    this.taskId = input.taskId;
    this.title = input.title;
    this.intent = input.intent;
    this.brief = input.brief;
    this.briefDigest = digests ? digests.brief : taskBriefDigest(input.brief);
    this.resultHistoryDigest = digests ? digests.history : taskHistoryDigest(input.resultHistory);
    this.status = input.status;
    this.parentTaskId = input.parentTaskId;
    this.isParent = input.isParent;
    this.result = input.result;
    this.resultHistory = input.resultHistory;
    this.retrospective = input.retrospective;
    this.createdAt = input.createdAt;
    this.updatedAt = input.updatedAt;
  }
}
