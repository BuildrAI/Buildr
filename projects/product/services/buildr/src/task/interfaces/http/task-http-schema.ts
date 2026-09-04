import { compileJsonSchemaCatalog } from '../../../infrastructure/contracts/json-schema-validator.ts';

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const CONTRACT_ROOT = 'https://schemas.buildr.ai/http/task-record';
const TASK_ID_PATTERN = '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$';
const QUALIFIED_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$';
const nonEmptyText = Object.freeze({ type: 'string', minLength: 1, pattern: '\\S' });
type JsonSchema = Record<string, unknown>;

const closed = (properties: Record<string, JsonSchema | boolean>, required: string[] = []): JsonSchema => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const arrayOf = (items: JsonSchema): JsonSchema => ({ type: 'array', items });
const nullable = (value: JsonSchema): JsonSchema => ({ anyOf: [value, { type: 'null' }] });
const schema = (id: string, title: string, body: JsonSchema, definitions?: Record<string, JsonSchema>): Readonly<JsonSchema & { $id: string }> => Object.freeze({
  $schema: DRAFT_2020_12,
  $id: `${CONTRACT_ROOT}/${id}/v1`,
  title,
  ...body,
  ...(definitions ? { $defs: definitions } : {}),
});

export const TASK_HTTP_DEFINITIONS = Object.freeze({
  TaskId: { type: 'string', pattern: TASK_ID_PATTERN },
  QualifiedService: closed({ project: nonEmptyText, service: nonEmptyText }, ['project', 'service']),
  QualifiedChange: closed({ project: nonEmptyText, change: nonEmptyText }, ['project', 'change']),
  QualifiedServiceInput: {
    oneOf: [
      { type: 'string', pattern: QUALIFIED_PATTERN },
      { $ref: '#/$defs/QualifiedService' },
    ],
  },
  ParentCompletion: closed({
    expectedSnapshot: nonEmptyText,
    acceptance: closed({ summary: nonEmptyText, children: arrayOf(closed({ taskId: { $ref: '#/$defs/TaskId' }, summary: nonEmptyText }, ['taskId', 'summary'])) }, ['summary', 'children']),
    authorization: closed({ source: nonEmptyText, statement: nonEmptyText }, ['source', 'statement']),
    recordedAt: nonEmptyText,
  }, ['expectedSnapshot', 'acceptance', 'authorization']),
  TaskResult: {
    anyOf: [
      { type: 'null' },
      closed({ summary: nonEmptyText, parentCompletion: { $ref: '#/$defs/ParentCompletion' } }, ['summary']),
    ],
  },
  TaskResultHistoryEntry: closed({
    status: { enum: ['completed', 'abandoned'] }, title: nonEmptyText, intent: nonEmptyText,
    parentTaskId: nullable({ $ref: '#/$defs/TaskId' }),
    scope: closed({ projects: arrayOf(nonEmptyText), services: arrayOf({ $ref: '#/$defs/QualifiedService' }) }, ['projects', 'services']),
    changes: arrayOf({ $ref: '#/$defs/QualifiedChange' }), isParent: { const: true }, result: { $ref: '#/$defs/TaskResult' },
    recordUpdatedAt: nonEmptyText, correctedAt: nonEmptyText, reason: nonEmptyText,
  }, ['status', 'title', 'intent', 'parentTaskId', 'result', 'recordUpdatedAt', 'correctedAt', 'reason']),
  TaskRecord: closed({
    schemaVersion: { const: 'buildr.task-record/v3' },
    taskId: { $ref: '#/$defs/TaskId' },
    title: nonEmptyText,
    intent: nonEmptyText,
    scope: closed({
      projects: arrayOf(nonEmptyText),
      services: arrayOf({ $ref: '#/$defs/QualifiedService' }),
    }, ['projects', 'services']),
    changes: arrayOf({ $ref: '#/$defs/QualifiedChange' }),
    parentTaskId: nullable({ $ref: '#/$defs/TaskId' }),
    isParent: { type: 'boolean' },
    retrospective: nullable(closed({
      state: { enum: ['pending-decision', 'decided'] },
      documentDigest: { type: 'string', pattern: '^sha256-[0-9a-f]{64}$' },
    }, ['state', 'documentDigest'])),
    status: { enum: ['todo', 'active', 'completed', 'abandoned'] },
    result: { $ref: '#/$defs/TaskResult' },
    resultHistory: arrayOf({ $ref: '#/$defs/TaskResultHistoryEntry' }),
    createdAt: nonEmptyText,
    updatedAt: nonEmptyText,
  }, ['schemaVersion', 'taskId', 'title', 'intent', 'scope', 'changes', 'parentTaskId', 'retrospective', 'status', 'result', 'createdAt', 'updatedAt']),
  TaskRelationSummary: closed({
    taskId: { $ref: '#/$defs/TaskId' },
    title: nonEmptyText,
    status: { enum: ['todo', 'active', 'completed', 'abandoned'] },
  }, ['taskId', 'title', 'status']),
  TaskRelations: closed({
    parent: nullable({ $ref: '#/$defs/TaskRelationSummary' }),
    children: arrayOf({ $ref: '#/$defs/TaskRelationSummary' }),
  }, ['parent', 'children']),
  RetrospectiveDocumentReference: closed({
    path: nonEmptyText,
    registered: nullable(closed({
      state: { enum: ['pending-decision', 'decided'] },
      documentDigest: { type: 'string', pattern: '^sha256-[0-9a-f]{64}$' },
    }, ['state', 'documentDigest'])),
  }, ['path', 'registered']),
  ReferenceDiagnostic: closed({
    taskId: { $ref: '#/$defs/TaskId' },
    kind: { enum: ['project', 'service', 'change'] },
    reference: nonEmptyText,
    code: nonEmptyText,
    message: nonEmptyText,
    details: true,
  }, ['taskId', 'kind', 'reference', 'code', 'message']),
  StoredTaskView: closed({
    record: { $ref: '#/$defs/TaskRecord' },
    recordDigest: nonEmptyText,
    taskRelations: { $ref: '#/$defs/TaskRelations' },
    retrospectiveDocument: { $ref: '#/$defs/RetrospectiveDocumentReference' },
    referenceDiagnostics: arrayOf({ $ref: '#/$defs/ReferenceDiagnostic' }),
  }, ['record', 'recordDigest', 'taskRelations', 'retrospectiveDocument', 'referenceDiagnostics']),
  ErrorResponse: closed({
    error: closed({ code: nonEmptyText, message: nonEmptyText, details: true }, ['code', 'message']),
  }, ['error']),
  TaskRecordMutationResponse: closed({
    schemaVersion: { const: 'buildr.task-record-result/v5' },
    operation: { enum: ['update', 'complete', 'abandon'] },
    status: { enum: ['updated', 'completed', 'abandoned'] },
    taskId: { $ref: '#/$defs/TaskId' },
    record: { $ref: '#/$defs/TaskRecord' },
    recordDigest: nonEmptyText,
    changeReferences: arrayOf({ type: 'object', additionalProperties: true }),
    referenceDiagnostics: arrayOf({ $ref: '#/$defs/ReferenceDiagnostic' }),
    taskRelations: { $ref: '#/$defs/TaskRelations' },
    retrospectiveDocument: { $ref: '#/$defs/RetrospectiveDocumentReference' },
    diagnostic: { type: 'null' },
    effects: arrayOf(closed({ type: nonEmptyText, taskId: { $ref: '#/$defs/TaskId' } }, ['type', 'taskId'])),
    nextActions: arrayOf(nonEmptyText),
  }, ['schemaVersion', 'operation', 'status', 'taskId', 'record', 'recordDigest', 'changeReferences', 'referenceDiagnostics', 'taskRelations', 'retrospectiveDocument', 'diagnostic', 'effects', 'nextActions']),
});

const defs = TASK_HTTP_DEFINITIONS;

export const TASK_HTTP_SCHEMAS = Object.freeze({
  listRequest: schema('list/request', 'TaskListRequest', closed({
    q: { type: 'string' },
    project: nonEmptyText,
    service: { type: 'string', pattern: QUALIFIED_PATTERN },
    status: { enum: ['open', 'todo', 'active', 'completed', 'abandoned', 'all'] },
    hasChildren: { enum: ['yes', 'no', 'all'] },
    retrospectiveState: { enum: ['missing', 'pending-decision', 'decided', 'all'] },
  }), defs),
  listResponse: schema('list/response', 'TaskListResponse', closed({
    schemaVersion: { const: 'buildr.task-record-list/v5' },
    filters: closed({
      q: { type: 'string' },
      project: nullable(nonEmptyText),
      service: nullable({ type: 'string', pattern: QUALIFIED_PATTERN }),
      status: { enum: ['open', 'todo', 'active', 'completed', 'abandoned', 'all'] },
      hasChildren: { enum: ['yes', 'no', 'all'] },
      retrospectiveState: { enum: ['missing', 'pending-decision', 'decided', 'all'] },
    }, ['q', 'project', 'service', 'status', 'hasChildren', 'retrospectiveState']),
    filterOptions: closed({ projects: arrayOf(nonEmptyText), services: arrayOf({ type: 'string', pattern: QUALIFIED_PATTERN }) }, ['projects', 'services']),
    totalTaskCount: { type: 'integer', minimum: 0 },
    tasks: arrayOf({ $ref: '#/$defs/StoredTaskView' }),
    diagnostics: arrayOf({ $ref: '#/$defs/ReferenceDiagnostic' }),
  }, ['schemaVersion', 'filters', 'filterOptions', 'totalTaskCount', 'tasks', 'diagnostics']), defs),
  detailRequest: schema('detail/request', 'TaskDetailRequest', closed({}), defs),
  detailResponse: schema('detail/response', 'TaskDetailResponse', closed({
    schemaVersion: { const: 'buildr.task-record-view/v3' },
    taskId: { $ref: '#/$defs/TaskId' },
    record: { $ref: '#/$defs/TaskRecord' },
    recordDigest: nonEmptyText,
    taskRelations: { $ref: '#/$defs/TaskRelations' },
    retrospectiveDocument: { $ref: '#/$defs/RetrospectiveDocumentReference' },
    referenceDiagnostics: arrayOf({ $ref: '#/$defs/ReferenceDiagnostic' }),
  }, ['schemaVersion', 'taskId', 'record', 'recordDigest', 'taskRelations', 'retrospectiveDocument', 'referenceDiagnostics']), defs),
  updateRequest: schema('update/request', 'TaskUpdateRequest', {
    ...closed({
      expectedRecordDigest: nonEmptyText,
      status: { enum: ['todo', 'active', 'completed', 'abandoned'] }, reason: nonEmptyText, summary: nonEmptyText,
      parentCompletion: { $ref: '#/$defs/ParentCompletion' },
      addChanges: arrayOf({ $ref: '#/$defs/QualifiedChange' }), removeChanges: arrayOf({ $ref: '#/$defs/QualifiedChange' }),
    isParent: { const: true },
      title: nonEmptyText,
      intent: nonEmptyText,
      parentTaskId: nullable({ $ref: '#/$defs/TaskId' }),
      addProjects: arrayOf(nonEmptyText),
      removeProjects: arrayOf(nonEmptyText),
      addServices: arrayOf({ $ref: '#/$defs/QualifiedServiceInput' }),
      removeServices: arrayOf({ $ref: '#/$defs/QualifiedServiceInput' }),
      retrospectiveState: { enum: ['pending-decision', 'decided'] },
      retrospectiveDocumentDigest: { type: 'string', pattern: '^sha256-[0-9a-f]{64}$' },
      clearRetrospective: { type: 'boolean', const: true },
    }, ['expectedRecordDigest']),
    minProperties: 2,
  }, defs),
  updateResponse: schema('update/response', 'TaskUpdateResponse', { $ref: '#/$defs/TaskRecordMutationResponse' }, defs),
  completeRequest: schema('complete/request', 'TaskCompleteRequest', closed({
    expectedRecordDigest: nonEmptyText,
    summary: nonEmptyText,
    parentCompletion: { $ref: '#/$defs/ParentCompletion' },
  }, ['expectedRecordDigest', 'summary']), defs),
  completeResponse: schema('complete/response', 'TaskCompleteResponse', { $ref: '#/$defs/TaskRecordMutationResponse' }, defs),
  abandonRequest: schema('abandon/request', 'TaskAbandonRequest', closed({
    expectedRecordDigest: nonEmptyText,
    reason: nonEmptyText,
  }, ['expectedRecordDigest', 'reason']), defs),
  abandonResponse: schema('abandon/response', 'TaskAbandonResponse', { $ref: '#/$defs/TaskRecordMutationResponse' }, defs),
  retrospectiveDocumentRequest: schema('retrospective-document/request', 'TaskRetrospectiveDocumentRequest', closed({}), defs),
  retrospectiveDocumentResponse: schema('retrospective-document/response', 'TaskRetrospectiveDocumentResponse', closed({
    schemaVersion: { const: 'buildr.task-retrospective-document/v1' },
    operation: { const: 'inspect' }, status: { const: 'inspected' }, taskId: { $ref: '#/$defs/TaskId' },
    path: nonEmptyText, present: { type: 'boolean' }, content: nullable({ type: 'string' }),
    actualDigest: nullable({ type: 'string', pattern: '^sha256-[0-9a-f]{64}$' }),
    registeredDigest: nullable({ type: 'string', pattern: '^sha256-[0-9a-f]{64}$' }),
    registeredState: nullable({ enum: ['pending-decision', 'decided'] }),
    effectiveState: { enum: ['missing', 'pending-decision', 'decided'] },
    diagnostic: nullable(closed({ code: nonEmptyText, message: nonEmptyText }, ['code', 'message'])),
    effects: arrayOf({}), nextActions: arrayOf(nonEmptyText),
  }, ['schemaVersion', 'operation', 'status', 'taskId', 'path', 'present', 'content', 'actualDigest', 'registeredDigest', 'registeredState', 'effectiveState', 'diagnostic', 'effects', 'nextActions']), defs),
  errorResponse: schema('error/response', 'TaskErrorResponse', { $ref: '#/$defs/ErrorResponse' }, defs),
});

type TaskHttpSchemaKey = keyof typeof TASK_HTTP_SCHEMAS;
function operation(id: string, method: string, path: string, request: TaskHttpSchemaKey, success: TaskHttpSchemaKey) {
  return Object.freeze({
    id,
    method,
    path,
    requestSchemaId: TASK_HTTP_SCHEMAS[request].$id,
    successSchemaId: TASK_HTTP_SCHEMAS[success].$id,
    errorSchemaId: TASK_HTTP_SCHEMAS.errorResponse.$id,
  });
}

export const TASK_HTTP_OPERATIONS = Object.freeze([
  operation('task-record.list', 'GET', '/tasks', 'listRequest', 'listResponse'),
  operation('task-record.detail', 'GET', '/tasks/:taskId', 'detailRequest', 'detailResponse'),
  operation('task-record.update', 'PATCH', '/tasks/:taskId', 'updateRequest', 'updateResponse'),
  operation('task-record.complete', 'POST', '/tasks/:taskId/complete', 'completeRequest', 'completeResponse'),
  operation('task-record.abandon', 'POST', '/tasks/:taskId/abandon', 'abandonRequest', 'abandonResponse'),
  operation('task-record.retrospective-document', 'GET', '/tasks/:taskId/retrospective-document', 'retrospectiveDocumentRequest', 'retrospectiveDocumentResponse'),
]);

const allSchemas = Object.freeze(Object.values(TASK_HTTP_SCHEMAS));
export const TASK_HTTP_VALIDATORS = compileJsonSchemaCatalog(allSchemas);

export function inspectTaskHttpContractCoverage(routeIds: string[]) {
  const migrated = new Set(TASK_HTTP_OPERATIONS.map((operation) => operation.id));
  const unmigrated = [...new Set(routeIds)].filter((routeId) => !migrated.has(routeId)).sort();
  return Object.freeze({
    schemaVersion: 'buildr.task-record-http-contract-coverage/v1',
    status: unmigrated.length ? 'attention' : 'aligned',
    migratedOperationIds: Object.freeze([...migrated].sort()),
    unmigratedOperationIds: Object.freeze(unmigrated),
    blocking: false,
  });
}
