// @ts-nocheck -- Legacy JavaScript boundary migrated to a single TypeScript source; typing is outside this change.
import { compileJsonSchemaCatalog } from '../../../infrastructure/contracts/json-schema-validator.mjs';

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const CONTRACT_ROOT = 'https://schemas.buildr.ai/http/task-professional';
const NON_EMPTY = Object.freeze({ type: 'string', minLength: 1, pattern: '\\S' });
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
  retrospectiveRequest: schema('retrospective/request', 'TaskRetrospectiveRequest', EMPTY),
  retrospectiveResponse: schema('retrospective/response', 'TaskRetrospectiveResponse', RESPONSE),
  retrospectivePatchRequest: schema('retrospective/patch-request', 'TaskRetrospectivePatchRequest', RETROSPECTIVE_PATCH),
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
  operation('task-retrospective.detail', 'GET', '/tasks/:taskId/retrospective', 'retrospectiveRequest', 'retrospectiveResponse'),
  operation('task-retrospective.patch', 'PATCH', '/tasks/:taskId/retrospective', 'retrospectivePatchRequest', 'retrospectiveResponse'),
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
  if (operationId === 'task-retrospective.patch' && field === 'expectedCurrentDigest') error.code = 'task_retrospective_digest_required';
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
