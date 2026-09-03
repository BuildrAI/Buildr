import { compileJsonSchemaCatalog } from '../../../infrastructure/contracts/json-schema-validator.mjs';
import { TASK_RECORD_HTTP_DEFINITIONS } from './task-record-http-contracts.ts';

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
type JsonSchema = Record<string, unknown> & { $id: string };
type SchemaValidationIssue = {
  keyword?: string;
  instancePath?: string;
  params?: { additionalProperty?: string; missingProperty?: string };
};

const schema = (id: string, title: string, body: Record<string, unknown>, definitions?: Record<string, unknown>): Readonly<JsonSchema> => Object.freeze({
  $schema: DRAFT_2020_12,
  $id: `${CONTRACT_ROOT}/${id}/v1`,
  title,
  ...body,
  ...(definitions ? { $defs: definitions } : {}),
});
const closed = (properties: Record<string, unknown>, required: readonly string[] = []): Record<string, unknown> => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const nullable = (value: Record<string, unknown>) => ({ anyOf: [value, { type: 'null' }] });
const array = (items: Record<string, unknown>) => ({ type: 'array', items });
const REVIEW_RESULT = closed({
  schemaVersion: { const: 'buildr.task-review-result/v2' }, taskId: NON_EMPTY,
  reviewType: { enum: ['planning', 'completion'] }, subjectIdentity: NON_EMPTY,
  method: { enum: ['self', 'independent-agent', 'human'] }, reviewed: array(NON_EMPTY),
  uncovered: array(closed({ subject: NON_EMPTY, reason: NON_EMPTY }, ['subject', 'reason'])),
  findings: array(NON_EMPTY),
  conclusion: closed({ outcome: { enum: ['accepted', 'changes-requested'] }, summary: NON_EMPTY }, ['outcome', 'summary']),
  completedAt: NON_EMPTY,
}, ['schemaVersion', 'taskId', 'reviewType', 'subjectIdentity', 'method', 'reviewed', 'uncovered', 'findings', 'conclusion', 'completedAt']);
const SLOT = closed({
  path: NON_EMPTY, present: { type: 'boolean' }, result: nullable(REVIEW_RESULT),
  resultDigest: nullable(NON_EMPTY), observedAt: nullable(NON_EMPTY),
}, ['path', 'present', 'result', 'resultDigest']);
const OPERATION_BASE = {
  schemaVersion: NON_EMPTY, operation: NON_EMPTY, status: NON_EMPTY, taskId: NON_EMPTY,
  diagnostic: { type: 'null' }, effects: array(EMPTY), nextActions: array(NON_EMPTY),
};
const REVIEWS_RESPONSE = closed({
  ...OPERATION_BASE,
  slots: closed({ planning: SLOT, completion: SLOT }, ['planning', 'completion']),
}, ['schemaVersion', 'operation', 'status', 'taskId', 'slots', 'diagnostic', 'effects', 'nextActions']);
const VERIFICATION_REPORT = closed({
  schemaVersion: { const: 'buildr.task-verification-report/v1' }, taskId: NON_EMPTY,
  scope: closed({
    projects: array(NON_EMPTY),
    services: array(closed({ project: NON_EMPTY, service: NON_EMPTY }, ['project', 'service'])),
  }, ['projects', 'services']),
  content: closed({ identity: NON_EMPTY, summary: NON_EMPTY }, ['identity', 'summary']),
  declarations: array(closed({
    project: NON_EMPTY, path: NON_EMPTY, identity: NON_EMPTY,
    status: { enum: ['ready', 'absent', 'invalid'] }, summary: NON_EMPTY,
  }, ['project', 'path', 'identity', 'status'])),
  checks: array(closed({
    id: NON_EMPTY, project: NON_EMPTY, service: NON_EMPTY, testing: NON_EMPTY,
    selection: { enum: ['focus', 'task-related', 'full', 'legacy'] }, targets: array(NON_EMPTY),
    source: { enum: ['command', 'agent', 'legacy'] }, outcome: { enum: ['passed', 'failed'] },
    summary: NON_EMPTY, mapStatus: { enum: ['declared', 'map-unavailable'] },
    durationMs: { type: 'integer', minimum: 0 },
  }, ['id', 'project', 'testing', 'selection', 'targets', 'source', 'outcome', 'summary', 'mapStatus'])),
  gaps: array(closed({ testing: NON_EMPTY, reason: NON_EMPTY, project: NON_EMPTY, service: NON_EMPTY }, ['testing', 'reason'])),
  conclusion: closed({ outcome: { enum: ['passed', 'not-passed', 'incomplete'] }, summary: NON_EMPTY }, ['outcome', 'summary']),
  completedAt: NON_EMPTY,
}, ['schemaVersion', 'taskId', 'scope', 'content', 'declarations', 'checks', 'gaps', 'conclusion', 'completedAt']);
const VERIFICATION_APPLICABILITY = closed({
  status: { enum: ['current', 'stale', 'unknown'] },
  content: closed({ status: { enum: ['current', 'stale', 'unknown'] } }, ['status']),
  declarations: closed({ status: { enum: ['current', 'stale'] } }, ['status']),
  reasons: array(closed({ code: NON_EMPTY, message: NON_EMPTY }, ['code', 'message'])),
}, ['status', 'content', 'declarations', 'reasons']);
const VERIFICATION_SLOT = closed({
  path: NON_EMPTY, present: { type: 'boolean' }, report: nullable(VERIFICATION_REPORT),
  reportDigest: nullable(NON_EMPTY), applicability: nullable(VERIFICATION_APPLICABILITY), observedAt: NON_EMPTY,
}, ['path', 'present', 'report', 'reportDigest', 'applicability']);
const VERIFICATION_RESPONSE = closed({
  ...OPERATION_BASE, slot: VERIFICATION_SLOT,
}, ['schemaVersion', 'operation', 'status', 'taskId', 'slot', 'diagnostic', 'effects', 'nextActions']);
const COORDINATION_CHILD = closed({
  taskId: { $ref: '#/$defs/TaskId' }, title: NON_EMPTY, intent: NON_EMPTY,
  status: { enum: ['todo', 'active', 'completed', 'abandoned'] },
  scope: { $ref: '#/$defs/TaskScope' }, isParent: { type: 'boolean' },
  result: { $ref: '#/$defs/TaskResult' }, updatedAt: NON_EMPTY,
}, ['taskId', 'title', 'intent', 'status', 'scope', 'isParent', 'result', 'updatedAt']);
const COORDINATION_COMPLETION = closed({
  snapshotIdentity: NON_EMPTY, authorizationRequired: { type: 'boolean' },
  openChildTaskIds: array({ $ref: '#/$defs/TaskId' }),
  evidence: nullable({ $ref: '#/$defs/ParentCompletion' }), summary: NON_EMPTY,
}, ['snapshotIdentity', 'authorizationRequired', 'openChildTaskIds', 'evidence', 'summary']);
const HISTORICAL_CONTRIBUTION = closed({
  id: NON_EMPTY, priority: NON_EMPTY, title: NON_EMPTY, objective: NON_EMPTY,
  directions: array(NON_EMPTY), boundaries: array(NON_EMPTY),
  expectedChild: nullable(NON_EMPTY), dependencies: array(NON_EMPTY),
}, ['id', 'priority', 'title', 'objective', 'directions', 'boundaries', 'expectedChild', 'dependencies']);
const HISTORICAL_PLAN = closed({
  sourceSchemaVersion: NON_EMPTY, identity: NON_EMPTY, outcome: NON_EMPTY,
  architectureDecisions: array(NON_EMPTY), contributions: array(HISTORICAL_CONTRIBUTION),
  finalAcceptance: array(NON_EMPTY),
}, ['sourceSchemaVersion', 'identity', 'outcome', 'architectureDecisions', 'contributions', 'finalAcceptance']);
const COORDINATION_RESPONSE = closed({
  schemaVersion: NON_EMPTY, operation: NON_EMPTY, status: NON_EMPTY, taskId: NON_EMPTY,
  recordDigest: NON_EMPTY, mode: { enum: ['parent', 'child', 'ordinary'] }, parentStatus: { enum: ['todo', 'active', 'completed', 'abandoned'] },
  isParent: { type: 'boolean' }, objective: NON_EMPTY, result: { $ref: '#/$defs/TaskResult' },
  parentSource: nullable({ $ref: '#/$defs/TaskRecord' }), children: array(COORDINATION_CHILD),
  completion: COORDINATION_COMPLETION, historicalPlan: nullable(HISTORICAL_PLAN),
  diagnostic: nullable(closed({ code: NON_EMPTY, message: NON_EMPTY }, ['code', 'message'])), effects: array(EMPTY),
}, ['schemaVersion', 'operation', 'status', 'taskId', 'recordDigest', 'mode', 'parentStatus', 'isParent', 'objective', 'result', 'parentSource', 'children', 'completion', 'historicalPlan', 'diagnostic', 'effects']);

const COORDINATION_DEFINITIONS = Object.freeze({
  ...TASK_RECORD_HTTP_DEFINITIONS,
  TaskScope: closed({
    projects: array(NON_EMPTY), services: array({ $ref: '#/$defs/QualifiedService' }),
  }, ['projects', 'services']),
});

export const TASK_PROFESSIONAL_HTTP_SCHEMAS = Object.freeze({
  reviewsRequest: schema('reviews/request', 'TaskReviewsRequest', EMPTY),
  reviewsResponse: schema('reviews/response', 'TaskReviewsResponse', REVIEWS_RESPONSE),
  verificationRequest: schema('verification/request', 'TaskVerificationRequest', EMPTY),
  verificationResponse: schema('verification/response', 'TaskVerificationResponse', VERIFICATION_RESPONSE),
  coordinationRequest: schema('coordination/request', 'TaskCoordinationRequest', EMPTY),
  coordinationResponse: schema('coordination/response', 'TaskCoordinationResponse', COORDINATION_RESPONSE, COORDINATION_DEFINITIONS),
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
