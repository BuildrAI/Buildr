import type { ApiClient } from './client';
import type {
  CoordinationResponse,
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
    reviews(taskId: string, options: ReadOptions = {}): Promise<ReviewsResponse> {
      return typed(client(taskPath(taskId, '/reviews'), options));
    },
    verification(taskId: string, options: ReadOptions = {}): Promise<VerificationResponse> {
      return typed(client(taskPath(taskId, '/verification'), options));
    },
    coordination(taskId: string, options: ReadOptions = {}): Promise<CoordinationResponse> {
      return typed(client(taskPath(taskId, '/coordination'), options));
    },
  });
}

export type TaskProfessionalClient = ReturnType<typeof createTaskProfessionalClient>;
