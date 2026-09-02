// @ts-nocheck -- Legacy JavaScript boundary migrated to a single TypeScript source; typing is outside this change.
import { validateTaskProfessionalRequest } from './task-professional-http-contracts.ts';
import {
  mapTaskProfessionalReadRequest,
} from './task-professional-http-mapping.ts';

function readContribution(id, taskIdSource, operation, suffixPattern, input = () => ({}), contractId = `task-${operation}.detail`) {
  const pattern = new RegExp(suffixPattern.replaceAll('<task-id>', `(${taskIdSource})`));
  return Object.freeze({
    id,
    handle: async ({ request, suffix, searchParams, submitTaskRead }) => {
      if (request.method !== 'GET') return null;
      const match = suffix.match(pattern);
      if (!match) return null;
      if (searchParams?.size) {
        const error = new Error(`${id} 不接受 query 参数。`);
        error.code = 'task_api_query_forbidden';
        error.status = 400;
        throw error;
      }
      const value = mapTaskProfessionalReadRequest(input(match, searchParams));
      validateTaskProfessionalRequest(contractId, value, id);
      return { status: 200, body: await submitTaskRead(operation, match[1], value) };
    },
  });
}

export function createTaskOverviewHttpContribution(taskIdSource) {
  return readContribution('task-overview.http', taskIdSource, 'overview', '^/tasks/<task-id>/overview$', undefined, 'task-overview.detail');
}

export function createTaskDevelopmentHttpContribution(taskIdSource) {
  return readContribution('task-development.http', taskIdSource, 'development', '^/tasks/<task-id>/development$', undefined, 'task-development.detail');
}

export function createTaskVerificationHttpContribution(taskIdSource) {
  return readContribution('task-verification.http', taskIdSource, 'verification', '^/tasks/<task-id>/verification$', undefined, 'task-verification.detail');
}

export function createTaskEnvironmentHttpContribution(taskIdSource, application, taskRecordRead) {
  const pattern = new RegExp(`^/tasks/(${taskIdSource})/environment$`);
  return Object.freeze({
    id: 'task-environment.http',
    handle: ({ request, suffix, root, searchParams }) => {
      const match = suffix.match(pattern);
      if (request.method !== 'GET' || !match) return null;
      if (searchParams?.size) {
        const error = new Error('Task environment 不接受 query 参数。');
        error.code = 'task_api_query_forbidden';
        error.status = 400;
        throw error;
      }
      validateTaskProfessionalRequest('task-environment.detail', {}, 'Task environment');
      taskRecordRead.readTaskRecordPersistence(root, match[1]);
      return { status: 200, body: application.readTaskEnvironmentCurrent(root, match[1]) };
    },
  });
}

export function createParentCoordinationHttpContribution(taskIdSource) {
  return readContribution('task-parent-coordination.http', taskIdSource, 'coordination', '^/tasks/<task-id>/coordination$', undefined, 'task-parent-coordination.detail');
}
