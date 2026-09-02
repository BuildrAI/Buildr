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
type JsonSchema = Record<string, unknown> & { $id: string };
type SchemaValidationIssue = {
  keyword?: string;
  instancePath?: string;
  params?: { additionalProperty?: string; missingProperty?: string };
};

const schema = (id: string, title: string, body: Record<string, unknown>): Readonly<JsonSchema> => Object.freeze({
  $schema: DRAFT_2020_12,
  $id: `${CONTRACT_ROOT}/${id}/v1`,
  title,
  ...body,
});
const closed = (properties: Record<string, unknown>, required: readonly string[] = []): Record<string, unknown> => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});

export const TASK_PROFESSIONAL_HTTP_SCHEMAS = Object.freeze({
  overviewRequest: schema('overview/request', 'TaskOverviewRequest', EMPTY),
  overviewResponse: schema('overview/response', 'TaskOverviewResponse', RESPONSE),
  reviewsRequest: schema('reviews/request', 'TaskReviewsRequest', EMPTY),
  reviewsResponse: schema('reviews/response', 'TaskReviewsResponse', RESPONSE),
  verificationRequest: schema('verification/request', 'TaskVerificationRequest', EMPTY),
  verificationResponse: schema('verification/response', 'TaskVerificationResponse', RESPONSE),
  coordinationRequest: schema('coordination/request', 'TaskCoordinationRequest', EMPTY),
  coordinationResponse: schema('coordination/response', 'TaskCoordinationResponse', RESPONSE),
  errorResponse: schema('error/response', 'TaskProfessionalErrorResponse', ERROR),
});

type SchemaKey = keyof typeof TASK_PROFESSIONAL_HTTP_SCHEMAS;

const operation = (id: string, method: string, path: string, request: SchemaKey, success: SchemaKey) => Object.freeze({
  id,
  method,
  path,
  requestSchemaId: TASK_PROFESSIONAL_HTTP_SCHEMAS[request].$id,
  successSchemaId: TASK_PROFESSIONAL_HTTP_SCHEMAS[success].$id,
  errorSchemaId: TASK_PROFESSIONAL_HTTP_SCHEMAS.errorResponse.$id,
});

export const TASK_PROFESSIONAL_HTTP_OPERATIONS = Object.freeze([
  operation('task-overview.detail', 'GET', '/tasks/:taskId/overview', 'overviewRequest', 'overviewResponse'),
  operation('task-review.detail', 'GET', '/tasks/:taskId/reviews', 'reviewsRequest', 'reviewsResponse'),
  operation('task-verification.detail', 'GET', '/tasks/:taskId/verification', 'verificationRequest', 'verificationResponse'),
  operation('task-parent-coordination.detail', 'GET', '/tasks/:taskId/coordination', 'coordinationRequest', 'coordinationResponse'),
]);

export const TASK_PROFESSIONAL_HTTP_VALIDATORS = compileJsonSchemaCatalog(Object.values(TASK_PROFESSIONAL_HTTP_SCHEMAS));
const OPERATIONS = new Map(TASK_PROFESSIONAL_HTTP_OPERATIONS.map((item) => [item.id, item]));

function validationError(operationId: string, label: string, errors: readonly SchemaValidationIssue[]): Error {
  const item = errors.find((entry) => entry.keyword === 'additionalProperties')
    || errors.find((entry) => entry.keyword === 'required')
    || errors[0]
    || {};
  const field = item.params?.additionalProperty || item.params?.missingProperty || String(item.instancePath || '').split('/').filter(Boolean)[0] || null;
  const code = item.keyword === 'additionalProperties' ? 'task_api_field_forbidden' : 'task_api_field_invalid';
  return Object.assign(new Error(`${label} 请求不符合 HTTP 契约${field ? `：${field}` : ''}。`), {
    status: 400,
    code,
    details: { operation: operationId, ...(field ? { field } : {}), keyword: item.keyword || 'schema' },
  });
}

export function validateTaskProfessionalRequest(operationId: string, value: unknown, label = operationId): unknown {
  const registered = OPERATIONS.get(operationId);
  if (!registered) throw new Error(`Task professional HTTP operation is not registered: ${operationId}`);
  const result = TASK_PROFESSIONAL_HTTP_VALIDATORS.validate(registered.requestSchemaId, value);
  if (!result.valid) throw validationError(operationId, label, result.errors);
  return value;
}

export function inspectTaskProfessionalHttpContractCoverage(routeIds: readonly string[]) {
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
