import { retiredParentCoordination } from '../../domain/parent-coordination.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../infrastructure/contracts/public-json.mjs';
import { validateTaskProfessionalRequest } from './task-professional-http-contracts.mjs';
import {
  mapTaskExecutionRecordBodyRequest,
  mapTaskExecutionRecordDetailRequest,
  mapTaskExecutionRecordsRequest,
  mapTaskParentCoordinationRequest,
  mapTaskProfessionalReadRequest,
  mapTaskVerificationPromptRequest,
} from './task-professional-http-mapping.mjs';

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

export function createTaskVerificationHttpContribution(taskIdSource, application) {
  const read = readContribution('task-verification.http', taskIdSource, 'verification', '^/tasks/<task-id>/verification$', undefined, 'task-verification.detail');
  return Object.freeze({
    id: read.id,
    handle: async (input) => {
      const readResult = await read.handle(input);
      if (readResult) return readResult;
      const { request, suffix, searchParams, root, authorizeWrite, readBody } = input;
      if (request.method !== 'POST' || suffix !== '/prompts/task-verification') return null;
      if (searchParams?.size) {
        const error = new Error('Task Verification prompt 不接受 query 参数。');
        error.code = 'task_api_query_forbidden';
        error.status = 400;
        throw error;
      }
      authorizeWrite();
      const body = mapTaskVerificationPromptRequest(validateTaskProfessionalRequest('task-verification.prompt', await readBody(new Set(['taskId', 'targetIdentity']), 'Task Verification prompt'), 'Task Verification prompt'));
      return { status: 200, body: application.generateTaskVerificationPrompt(root, body) };
    },
  });
}

export function createTaskExecutionRecordHttpContribution(taskIdSource) {
  const list = new RegExp(`^/tasks/(${taskIdSource})/execution-records$`);
  const detail = new RegExp(`^/tasks/(${taskIdSource})/execution-records/(${taskIdSource})$`);
  const body = new RegExp(`^/tasks/(${taskIdSource})/execution-records/(${taskIdSource})/body/([^/]+)$`);
  return Object.freeze({
    id: 'task-execution-record.http',
    handle: async ({ request, suffix, searchParams, submitTaskRead }) => {
      if (request.method !== 'GET') return null;
      const listMatch = suffix.match(list);
      if (listMatch) {
        const fields = [...new Set(searchParams.keys())];
        if (fields.some((field) => field !== 'view') || searchParams.getAll('view').length > 1) {
          const error = new Error('Task execution records 只接受一个 view query 参数。');
          error.code = 'task_api_query_forbidden';
          error.status = 400;
          throw error;
        }
        const input = mapTaskExecutionRecordsRequest(validateTaskProfessionalRequest('task-execution-record.list', { view: searchParams.get('view') || 'all' }, 'Task execution records'));
        return { status: 200, body: await submitTaskRead('execution-records', listMatch[1], input) };
      }
      const detailMatch = suffix.match(detail);
      if (detailMatch) {
        const input = validateTaskProfessionalRequest('task-execution-record.detail', { recordId: detailMatch[2] }, 'Task execution record detail');
        return { status: 200, body: await submitTaskRead('execution-record-detail', detailMatch[1], mapTaskExecutionRecordDetailRequest(input.recordId)) };
      }
      const bodyMatch = suffix.match(body);
      if (bodyMatch) {
        const input = validateTaskProfessionalRequest('task-execution-record.body', { recordId: bodyMatch[2], filename: decodeURIComponent(bodyMatch[3]) }, 'Task execution record body');
        return { status: 200, body: await submitTaskRead('execution-record-body', bodyMatch[1], mapTaskExecutionRecordBodyRequest(input.recordId, input.filename)) };
      }
      return null;
    },
  });
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

function blockedParentCoordination(taskId, operation, error) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  return {
    status,
    body: withJsonSchema(PUBLIC_JSON_SCHEMAS.parentCoordinationResult, {
      operation: operation || 'unknown', status: 'blocked', taskId, mode: 'unknown', plan: null,
      children: [], contributions: [], prerequisitesSatisfied: false, effects: [],
      diagnostic: {
        code: error.code || 'internal_error',
        message: status >= 500 ? 'Buildr Web 处理Parent coordination请求失败。' : error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
        nextAction: error.nextAction || '重新inspect Parent coordination后重试。',
      },
    }),
  };
}

export function createParentCoordinationHttpContribution(taskIdSource) {
  const pattern = new RegExp(`^/tasks/(${taskIdSource})/coordination$`);
  return Object.freeze({
    id: 'task-parent-coordination.http',
    handle: async ({ request, suffix, searchParams, root, authorizeWrite, readBody, submitTaskRead }) => {
      const match = suffix.match(pattern);
      if (!match) return null;
      if (request.method === 'GET') {
        if (searchParams?.size) {
          const error = new Error('Parent coordination 不接受 query 参数。');
          error.code = 'task_api_query_forbidden';
          error.status = 400;
          throw error;
        }
        validateTaskProfessionalRequest('task-parent-coordination.detail', {}, 'Parent coordination');
        return { status: 200, body: await submitTaskRead('coordination', match[1]) };
      }
      if (request.method !== 'PATCH') return null;
      authorizeWrite();
      let input = null;
      try {
        input = mapTaskParentCoordinationRequest(validateTaskProfessionalRequest('task-parent-coordination.patch', await readBody(new Set(['operation', 'expectedPlanIdentity', 'plan', 'reason', 'summary']), 'Parent coordination'), 'Parent coordination'));
        retiredParentCoordination();
      } catch (error) {
        return blockedParentCoordination(match[1], input?.operation, error);
      }
    },
  });
}
