import { validateTaskProfessionalRequest } from './task-professional-http-contracts.ts';
import {
  mapTaskProfessionalReadRequest,
} from './task-professional-http-mapping.ts';

type ReadContext = {
  request: { method: string };
  suffix: string;
  searchParams?: URLSearchParams;
  root: string;
  submitTaskRead(operation: string, taskId: string, value: Record<string, never>): Promise<unknown>;
};

type EnvironmentApplication = { readTaskEnvironmentCurrent(root: string, taskId: string): unknown };
type TaskRecordRead = { readTaskRecordPersistence(root: string, taskId: string): unknown };
type ReadInput = (match: RegExpMatchArray, searchParams?: URLSearchParams) => Record<string, never>;

function httpError(code: string, message: string, status: number): Error {
  return Object.assign(new Error(message), { code, status });
}

function readContribution(id: string, taskIdSource: string, operation: string, suffixPattern: string, input: ReadInput = () => ({}), contractId = `task-${operation}.detail`) {
  const pattern = new RegExp(suffixPattern.replaceAll('<task-id>', `(${taskIdSource})`));
  return Object.freeze({
    id,
    handle: async ({ request, suffix, searchParams, submitTaskRead }: ReadContext) => {
      if (request.method !== 'GET') return null;
      const match = suffix.match(pattern);
      if (!match) return null;
      if (searchParams?.size) {
        throw httpError('task_api_query_forbidden', `${id} 不接受 query 参数。`, 400);
      }
      const value = mapTaskProfessionalReadRequest(input(match, searchParams));
      validateTaskProfessionalRequest(contractId, value, id);
      return { status: 200, body: await submitTaskRead(operation, match[1], value) };
    },
  });
}

export function createTaskOverviewHttpContribution(taskIdSource: string) {
  return readContribution('task-overview.http', taskIdSource, 'overview', '^/tasks/<task-id>/overview$', undefined, 'task-overview.detail');
}

export function createTaskVerificationHttpContribution(taskIdSource: string) {
  return readContribution('task-verification.http', taskIdSource, 'verification', '^/tasks/<task-id>/verification$', undefined, 'task-verification.detail');
}

export function createTaskEnvironmentHttpContribution(taskIdSource: string, application: EnvironmentApplication, taskRecordRead: TaskRecordRead) {
  const pattern = new RegExp(`^/tasks/(${taskIdSource})/environment$`);
  return Object.freeze({
    id: 'task-environment.http',
    handle: ({ request, suffix, root, searchParams }: ReadContext) => {
      const match = suffix.match(pattern);
      if (request.method !== 'GET' || !match) return null;
      if (searchParams?.size) {
        throw httpError('task_api_query_forbidden', 'Task environment 不接受 query 参数。', 400);
      }
      validateTaskProfessionalRequest('task-environment.detail', {}, 'Task environment');
      taskRecordRead.readTaskRecordPersistence(root, match[1]);
      return { status: 200, body: application.readTaskEnvironmentCurrent(root, match[1]) };
    },
  });
}

export function createParentCoordinationHttpContribution(taskIdSource: string) {
  return readContribution('task-parent-coordination.http', taskIdSource, 'coordination', '^/tasks/<task-id>/coordination$', undefined, 'task-parent-coordination.detail');
}
