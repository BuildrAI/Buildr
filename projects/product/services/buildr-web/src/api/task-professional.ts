import type { ApiClient } from './client';
import type {
  CoordinationResponse,
  OverviewResponse,
  RetrospectivePatchRequest,
  RetrospectiveResponse,
  ReviewsResponse,
  VerificationResponse,
} from './generated/task-professional-http-dto';

type ReadOptions = Pick<RequestInit, 'signal'>;

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
    reviews(taskId: string, options: ReadOptions = {}): Promise<ReviewsResponse> {
      return typed(client(taskPath(taskId, '/reviews'), options));
    },
    verification(taskId: string, options: ReadOptions = {}): Promise<VerificationResponse> {
      return typed(client(taskPath(taskId, '/verification'), options));
    },
    coordination(taskId: string, options: ReadOptions = {}): Promise<CoordinationResponse> {
      return typed(client(taskPath(taskId, '/coordination'), options));
    },
    retrospective(taskId: string, options: ReadOptions = {}): Promise<RetrospectiveResponse> {
      return typed(client(taskPath(taskId, '/retrospective'), options));
    },
    updateRetrospective(taskId: string, input: RetrospectivePatchRequest): Promise<RetrospectiveResponse> {
      return typed(client(taskPath(taskId, '/retrospective'), { method: 'PATCH', body: JSON.stringify(input) }));
    },
  });
}

export type TaskProfessionalClient = ReturnType<typeof createTaskProfessionalClient>;
