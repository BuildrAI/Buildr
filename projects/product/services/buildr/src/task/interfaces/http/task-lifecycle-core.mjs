import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../../application/json-contracts.mjs';

function readContribution(id, taskIdSource, operation, suffixPattern, input = () => ({})) {
  const pattern = new RegExp(suffixPattern.replaceAll('<task-id>', `(${taskIdSource})`));
  return Object.freeze({
    id,
    handle: async ({ request, suffix, searchParams, submitTaskRead }) => {
      if (request.method !== 'GET') return null;
      const match = suffix.match(pattern);
      if (!match) return null;
      return { status: 200, body: await submitTaskRead(operation, match[1], input(match, searchParams)) };
    },
  });
}

export function createTaskOverviewHttpContribution(taskIdSource) {
  return readContribution('task-overview.http', taskIdSource, 'overview', '^/tasks/<task-id>/overview$');
}

export function createTaskDevelopmentHttpContribution(taskIdSource) {
  return readContribution('task-development.http', taskIdSource, 'development', '^/tasks/<task-id>/development$');
}

export function createTaskVerificationHttpContribution(taskIdSource, application) {
  const read = readContribution('task-verification.http', taskIdSource, 'verification', '^/tasks/<task-id>/verification$');
  return Object.freeze({
    id: read.id,
    handle: async (input) => {
      const readResult = await read.handle(input);
      if (readResult) return readResult;
      const { request, suffix, root, authorizeWrite, readBody } = input;
      if (request.method !== 'POST' || suffix !== '/prompts/task-verification') return null;
      authorizeWrite();
      const body = await readBody(new Set(['taskId', 'targetIdentity']), 'Task Verification prompt');
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
        return { status: 200, body: await submitTaskRead('execution-records', listMatch[1], { view: searchParams.get('view') || 'all' }) };
      }
      const detailMatch = suffix.match(detail);
      if (detailMatch) return { status: 200, body: await submitTaskRead('execution-record-detail', detailMatch[1], { recordId: detailMatch[2] }) };
      const bodyMatch = suffix.match(body);
      if (bodyMatch) return { status: 200, body: await submitTaskRead('execution-record-body', bodyMatch[1], { recordId: bodyMatch[2], filename: decodeURIComponent(bodyMatch[3]) }) };
      return null;
    },
  });
}

export function createTaskEnvironmentHttpContribution(taskIdSource, application, taskRecordRead) {
  const pattern = new RegExp(`^/tasks/(${taskIdSource})/environment$`);
  return Object.freeze({
    id: 'task-environment.http',
    handle: ({ request, suffix, root }) => {
      const match = suffix.match(pattern);
      if (request.method !== 'GET' || !match) return null;
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

export function createParentCoordinationHttpContribution(taskIdSource, application) {
  const pattern = new RegExp(`^/tasks/(${taskIdSource})/coordination$`);
  return Object.freeze({
    id: 'task-parent-coordination.http',
    handle: async ({ request, suffix, root, authorizeWrite, readBody, submitTaskRead }) => {
      const match = suffix.match(pattern);
      if (!match) return null;
      if (request.method === 'GET') return { status: 200, body: await submitTaskRead('coordination', match[1]) };
      if (request.method !== 'PATCH') return null;
      authorizeWrite();
      let input = null;
      try {
        input = await readBody(new Set(['operation', 'expectedPlanIdentity', 'plan', 'reason', 'summary']), 'Parent coordination');
        const operationFields = {
          record: new Set(['operation', 'plan']),
          reconcile: new Set(['operation', 'expectedPlanIdentity', 'plan', 'reason']),
          accept: new Set(['operation', 'expectedPlanIdentity', 'summary']),
        }[input.operation];
        if (operationFields) {
          const forbidden = Object.keys(input).find((field) => !operationFields.has(field));
          if (forbidden) {
            const error = new Error(`Parent coordination ${input.operation}.${forbidden} 不受支持。`);
            error.code = 'parent_coordination_field_forbidden';
            error.status = 400;
            throw error;
          }
        }
        if (input.operation === 'record') return { status: 200, body: application.recordParentPlan(root, match[1], { plan: input.plan }) };
        if (input.operation === 'reconcile') return { status: 200, body: application.reconcileParentPlan(root, match[1], { expectedPlanIdentity: input.expectedPlanIdentity, plan: input.plan, reason: input.reason }) };
        if (input.operation === 'accept') return { status: 200, body: application.acceptParentCoordination(root, match[1], { expectedPlanIdentity: input.expectedPlanIdentity, summary: input.summary }) };
        const error = new Error('Parent coordination operation必须是record、reconcile或accept。');
        error.code = 'parent_coordination_operation_invalid';
        error.status = 400;
        throw error;
      } catch (error) {
        return blockedParentCoordination(match[1], input?.operation, error);
      }
    },
  });
}
