import { compileJsonSchemaCatalog } from '../../../infrastructure/contracts/json-schema-validator.mjs';

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const CONTRACT_ROOT = 'https://schemas.buildr.ai/http/task-professional';
const TASK_ID_PATTERN = '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$';
const NON_EMPTY = Object.freeze({ type: 'string', minLength: 1, pattern: '\\S' });
const TASK_ID = Object.freeze({ type: 'string', pattern: TASK_ID_PATTERN });
const EMPTY = Object.freeze({ type: 'object', additionalProperties: false });
const ERROR = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      properties: { code: NON_EMPTY, message: NON_EMPTY, details: {} },
      required: ['code', 'message'],
    },
  },
  required: ['error'],
});
const RESPONSE = Object.freeze({ type: 'object', additionalProperties: true });
const PROMPT_RESPONSE = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: { prompt: NON_EMPTY, copiedMeansRecorded: { type: 'boolean' } },
  required: ['prompt', 'copiedMeansRecorded'],
});
const schema = (id, title, body) => Object.freeze({
  $schema: DRAFT_2020_12,
  $id: `${CONTRACT_ROOT}/${id}/v1`,
  title,
  ...body,
});
const closed = (properties, required = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});

const RETROSPECTIVE_PATCH = closed({
  status: { enum: ['pending', 'handled', 'no-action'] },
  note: NON_EMPTY,
  expectedCurrentDigest: NON_EMPTY,
}, ['expectedCurrentDigest']);
const REVIEW_PROMPT = closed({
  taskId: TASK_ID,
  reviewType: { enum: ['planning', 'completion'] },
  projectCode: NON_EMPTY,
  change: NON_EMPTY,
}, ['taskId', 'reviewType']);
const PARENT_PATCH = closed({
  operation: { enum: ['record', 'reconcile', 'accept'] },
  expectedPlanIdentity: NON_EMPTY,
  plan: { type: 'object', additionalProperties: true },
  reason: NON_EMPTY,
  summary: NON_EMPTY,
}, ['operation']);

export const TASK_PROFESSIONAL_HTTP_SCHEMAS = Object.freeze({
  overviewRequest: schema('overview/request', 'TaskOverviewRequest', EMPTY),
  overviewResponse: schema('overview/response', 'TaskOverviewResponse', RESPONSE),
  environmentRequest: schema('environment/request', 'TaskEnvironmentRequest', EMPTY),
  environmentResponse: schema('environment/response', 'TaskEnvironmentResponse', RESPONSE),
  developmentRequest: schema('development/request', 'TaskDevelopmentRequest', EMPTY),
  developmentResponse: schema('development/response', 'TaskDevelopmentResponse', RESPONSE),
  reviewsRequest: schema('reviews/request', 'TaskReviewsRequest', EMPTY),
  reviewsResponse: schema('reviews/response', 'TaskReviewsResponse', RESPONSE),
  verificationRequest: schema('verification/request', 'TaskVerificationRequest', EMPTY),
  verificationResponse: schema('verification/response', 'TaskVerificationResponse', RESPONSE),
  coordinationRequest: schema('coordination/request', 'TaskCoordinationRequest', EMPTY),
  coordinationResponse: schema('coordination/response', 'TaskCoordinationResponse', RESPONSE),
  coordinationPatchRequest: schema('coordination/patch-request', 'TaskCoordinationPatchRequest', PARENT_PATCH),
  executionRecordsRequest: schema('execution-records/request', 'TaskExecutionRecordsRequest', closed({ view: { enum: ['all', 'verification', 'finish'] } })),
  executionRecordsResponse: schema('execution-records/response', 'TaskExecutionRecordsResponse', RESPONSE),
  executionRecordDetailRequest: schema('execution-record-detail/request', 'TaskExecutionRecordDetailRequest', closed({ recordId: TASK_ID }, ['recordId'])),
  executionRecordDetailResponse: schema('execution-record-detail/response', 'TaskExecutionRecordDetailResponse', RESPONSE),
  executionRecordBodyRequest: schema('execution-record-body/request', 'TaskExecutionRecordBodyRequest', closed({ recordId: TASK_ID, filename: NON_EMPTY }, ['recordId', 'filename'])),
  executionRecordBodyResponse: schema('execution-record-body/response', 'TaskExecutionRecordBodyResponse', RESPONSE),
  retrospectiveRequest: schema('retrospective/request', 'TaskRetrospectiveRequest', EMPTY),
  retrospectiveResponse: schema('retrospective/response', 'TaskRetrospectiveResponse', RESPONSE),
  retrospectivePatchRequest: schema('retrospective/patch-request', 'TaskRetrospectivePatchRequest', RETROSPECTIVE_PATCH),
  reviewPromptRequest: schema('review-prompt/request', 'TaskReviewPromptRequest', REVIEW_PROMPT),
  reviewPromptResponse: schema('review-prompt/response', 'TaskReviewPromptResponse', PROMPT_RESPONSE),
  verificationPromptRequest: schema('verification-prompt/request', 'TaskVerificationPromptRequest', closed({ taskId: TASK_ID, targetIdentity: NON_EMPTY }, ['taskId'])),
  verificationPromptResponse: schema('verification-prompt/response', 'TaskVerificationPromptResponse', PROMPT_RESPONSE),
  errorResponse: schema('error/response', 'TaskProfessionalErrorResponse', ERROR),
});

const operation = (id, method, path, request, success) => Object.freeze({
  id,
  method,
  path,
  requestSchemaId: TASK_PROFESSIONAL_HTTP_SCHEMAS[request].$id,
  successSchemaId: TASK_PROFESSIONAL_HTTP_SCHEMAS[success].$id,
  errorSchemaId: TASK_PROFESSIONAL_HTTP_SCHEMAS.errorResponse.$id,
});

export const TASK_PROFESSIONAL_HTTP_OPERATIONS = Object.freeze([
  operation('task-overview.detail', 'GET', '/tasks/:taskId/overview', 'overviewRequest', 'overviewResponse'),
  operation('task-environment.detail', 'GET', '/tasks/:taskId/environment', 'environmentRequest', 'environmentResponse'),
  operation('task-development.detail', 'GET', '/tasks/:taskId/development', 'developmentRequest', 'developmentResponse'),
  operation('task-review.detail', 'GET', '/tasks/:taskId/reviews', 'reviewsRequest', 'reviewsResponse'),
  operation('task-verification.detail', 'GET', '/tasks/:taskId/verification', 'verificationRequest', 'verificationResponse'),
  operation('task-parent-coordination.detail', 'GET', '/tasks/:taskId/coordination', 'coordinationRequest', 'coordinationResponse'),
  operation('task-parent-coordination.patch', 'PATCH', '/tasks/:taskId/coordination', 'coordinationPatchRequest', 'coordinationResponse'),
  operation('task-execution-record.list', 'GET', '/tasks/:taskId/execution-records', 'executionRecordsRequest', 'executionRecordsResponse'),
  operation('task-execution-record.detail', 'GET', '/tasks/:taskId/execution-records/:recordId', 'executionRecordDetailRequest', 'executionRecordDetailResponse'),
  operation('task-execution-record.body', 'GET', '/tasks/:taskId/execution-records/:recordId/body/:filename', 'executionRecordBodyRequest', 'executionRecordBodyResponse'),
  operation('task-retrospective.detail', 'GET', '/tasks/:taskId/retrospective', 'retrospectiveRequest', 'retrospectiveResponse'),
  operation('task-retrospective.patch', 'PATCH', '/tasks/:taskId/retrospective', 'retrospectivePatchRequest', 'retrospectiveResponse'),
  operation('task-review.prompt', 'POST', '/prompts/task-review', 'reviewPromptRequest', 'reviewPromptResponse'),
  operation('task-verification.prompt', 'POST', '/prompts/task-verification', 'verificationPromptRequest', 'verificationPromptResponse'),
]);

export const TASK_PROFESSIONAL_HTTP_VALIDATORS = compileJsonSchemaCatalog(Object.values(TASK_PROFESSIONAL_HTTP_SCHEMAS));
const OPERATIONS = new Map(TASK_PROFESSIONAL_HTTP_OPERATIONS.map((item) => [item.id, item]));

function validationError(operationId, label, errors) {
  const item = errors.find((entry) => entry.keyword === 'additionalProperties')
    || errors.find((entry) => entry.keyword === 'required')
    || errors[0]
    || {};
  const field = item.params?.additionalProperty || item.params?.missingProperty || String(item.instancePath || '').split('/').filter(Boolean)[0] || null;
  const error = new Error(`${label} 请求不符合 HTTP 契约${field ? `：${field}` : ''}。`);
  error.status = 400;
  error.code = item.keyword === 'additionalProperties' ? 'task_api_field_forbidden' : 'task_api_field_invalid';
  if (operationId === 'task-execution-record.list' && item.keyword === 'enum') error.code = 'task_execution_record_view_invalid';
  if (operationId === 'task-retrospective.patch' && field === 'expectedCurrentDigest') error.code = 'task_retrospective_digest_required';
  if (operationId === 'task-parent-coordination.patch' && field === 'operation') error.code = 'parent_coordination_operation_invalid';
  error.details = { operation: operationId, ...(field ? { field } : {}), keyword: item.keyword || 'schema' };
  return error;
}

export function validateTaskProfessionalRequest(operationId, value, label = operationId) {
  const registered = OPERATIONS.get(operationId);
  if (!registered) throw new Error(`Task professional HTTP operation is not registered: ${operationId}`);
  const result = TASK_PROFESSIONAL_HTTP_VALIDATORS.validate(registered.requestSchemaId, value);
  if (!result.valid) throw validationError(operationId, label, result.errors);
  return value;
}

export function inspectTaskProfessionalHttpContractCoverage(routeIds) {
  const migrated = new Set(TASK_PROFESSIONAL_HTTP_OPERATIONS.map((item) => item.id));
  const unmigrated = [...new Set(routeIds)].filter((id) => !migrated.has(id)).sort();
  return Object.freeze({
    schemaVersion: 'buildr.task-professional-http-contract-coverage/v1',
    status: unmigrated.length ? 'attention' : 'aligned',
    migratedOperationIds: Object.freeze([...migrated].sort()),
    unmigratedOperationIds: Object.freeze(unmigrated),
    blocking: false,
  });
}
