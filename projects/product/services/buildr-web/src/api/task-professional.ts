import type { ApiClient } from './client';
import type {
  CoordinationPatchRequest,
  CoordinationResponse,
  DevelopmentResponse,
  EnvironmentResponse,
  ExecutionRecordBodyResponse,
  ExecutionRecordDetailResponse,
  ExecutionRecordsRequest,
  ExecutionRecordsResponse,
  OverviewResponse,
  RetrospectivePatchRequest,
  RetrospectiveResponse,
  ReviewPromptRequest,
  ReviewPromptResponse,
  ReviewsResponse,
  VerificationPromptRequest,
  VerificationPromptResponse,
  VerificationResponse,
} from './generated/task-professional-http-dto';

type ReadOptions = Pick<RequestInit, 'signal'>;

export type TaskExecutionRecordBodyView = {
  available: boolean;
  truncated: boolean;
  status: string;
  diagnostic?: { message: string } | null;
  files?: Array<{ name: string; storedSizeBytes: number; truncated: boolean }>;
};

export type TaskExecutionRecordView = {
  recordId: string;
  owner: string;
  outcome: string;
  runIdentity: string;
  targetIdentity: string;
  producer: string;
  lifecycleStatus: string;
  resolutionStatus: string;
  timestamps: { openedAt: string; sealedAt?: string | null };
  retention: { retainUntil: string };
  body: TaskExecutionRecordBodyView;
};

export type TaskExecutionRecordsView = ExecutionRecordsResponse & { records: TaskExecutionRecordView[] };
export type TaskExecutionRecordDetailView = ExecutionRecordDetailResponse & { record: TaskExecutionRecordView };
export type TaskExecutionRecordBodyViewResponse = ExecutionRecordBodyResponse & {
  file: { name: string; responseSizeBytes: number; responseTruncated: boolean; content: string };
};

function typed<T>(request: Promise<unknown>): Promise<T> {
  return request as Promise<T>;
}

function taskPath(taskId: string, suffix: string): string {
  return `/api/v1/tasks/${encodeURIComponent(taskId)}${suffix}`;
}

export function createTaskProfessionalClient(client: ApiClient) {
  return Object.freeze({
    overview(taskId: string, options: ReadOptions = {}): Promise<OverviewResponse> {
      return typed(client(taskPath(taskId, '/overview'), options));
    },
    environment(taskId: string, options: ReadOptions = {}): Promise<EnvironmentResponse> {
      return typed(client(taskPath(taskId, '/environment'), options));
    },
    development(taskId: string, options: ReadOptions = {}): Promise<DevelopmentResponse> {
      return typed(client(taskPath(taskId, '/development'), options));
    },
    reviews(taskId: string, options: ReadOptions = {}): Promise<ReviewsResponse> {
      return typed(client(taskPath(taskId, '/reviews'), options));
    },
    verification(taskId: string, options: ReadOptions = {}): Promise<VerificationResponse> {
      return typed(client(taskPath(taskId, '/verification'), options));
    },
    coordination(taskId: string, options: ReadOptions = {}): Promise<CoordinationResponse> {
      return typed(client(taskPath(taskId, '/coordination'), options));
    },
    executionRecords(taskId: string, input: ExecutionRecordsRequest = {}, options: ReadOptions = {}): Promise<TaskExecutionRecordsView> {
      const query = input.view ? `?view=${encodeURIComponent(input.view)}` : '';
      return typed<TaskExecutionRecordsView>(client(`${taskPath(taskId, '/execution-records')}${query}`, options));
    },
    executionRecordDetail(taskId: string, recordId: string, options: ReadOptions = {}): Promise<TaskExecutionRecordDetailView> {
      return typed<TaskExecutionRecordDetailView>(client(taskPath(taskId, `/execution-records/${encodeURIComponent(recordId)}`), options));
    },
    executionRecordBody(taskId: string, recordId: string, filename: string, options: ReadOptions = {}): Promise<TaskExecutionRecordBodyViewResponse> {
      return typed<TaskExecutionRecordBodyViewResponse>(client(taskPath(taskId, `/execution-records/${encodeURIComponent(recordId)}/body/${encodeURIComponent(filename)}`), options));
    },
    retrospective(taskId: string, options: ReadOptions = {}): Promise<RetrospectiveResponse> {
      return typed(client(taskPath(taskId, '/retrospective'), options));
    },
    updateRetrospective(taskId: string, input: RetrospectivePatchRequest): Promise<RetrospectiveResponse> {
      return typed(client(taskPath(taskId, '/retrospective'), { method: 'PATCH', body: JSON.stringify(input) }));
    },
    updateCoordination(taskId: string, input: CoordinationPatchRequest): Promise<CoordinationResponse> {
      return typed(client(taskPath(taskId, '/coordination'), { method: 'PATCH', body: JSON.stringify(input) }));
    },
    reviewPrompt(input: ReviewPromptRequest): Promise<ReviewPromptResponse> {
      return typed(client('/api/v1/prompts/task-review', { method: 'POST', body: JSON.stringify(input) }));
    },
    verificationPrompt(input: VerificationPromptRequest): Promise<VerificationPromptResponse> {
      return typed(client('/api/v1/prompts/task-verification', { method: 'POST', body: JSON.stringify(input) }));
    },
  });
}

export type TaskProfessionalClient = ReturnType<typeof createTaskProfessionalClient>;
