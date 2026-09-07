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

export function createTaskVerificationHttpContribution(taskIdSource: string) {
  return readContribution('task-verification.http', taskIdSource, 'verification', '^/tasks/<task-id>/verification$', undefined, 'task-verification.detail');
}

export function createParentCoordinationHttpContribution(taskIdSource: string) {
  return readContribution('task-parent-coordination.http', taskIdSource, 'coordination', '^/tasks/<task-id>/coordination$', undefined, 'task-parent-coordination.detail');
}
