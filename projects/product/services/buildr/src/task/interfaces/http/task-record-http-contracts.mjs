import { compileJsonSchemaCatalog } from '../../../infrastructure/contracts/json-schema-validator.mjs';

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const CONTRACT_ROOT = 'https://schemas.buildr.ai/http/task-record';
const TASK_ID_PATTERN = '^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$';
const QUALIFIED_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$';
const nonEmptyText = Object.freeze({ type: 'string', minLength: 1, pattern: '\\S' });

const closed = (properties, required = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const arrayOf = (items) => ({ type: 'array', items });
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const schema = (id, title, body, defs = undefined) => Object.freeze({
  $schema: DRAFT_2020_12,
  $id: `${CONTRACT_ROOT}/${id}/v1`,
  title,
  ...body,
  ...(defs ? { $defs: defs } : {}),
});

export const TASK_RECORD_HTTP_DEFINITIONS = Object.freeze({
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
      closed({ summary: nonEmptyText, noChange: { type: 'boolean' }, parentCompletion: { $ref: '#/$defs/ParentCompletion' } }, ['summary']),
    ],
  },
  TaskResultHistoryEntry: closed({
    status: { enum: ['completed', 'abandoned'] }, title: nonEmptyText, intent: nonEmptyText,
    parentTaskId: nullable({ $ref: '#/$defs/TaskId' }), result: { $ref: '#/$defs/TaskResult' },
    recordUpdatedAt: nonEmptyText, correctedAt: nonEmptyText, reason: nonEmptyText,
  }, ['status', 'title', 'intent', 'parentTaskId', 'result', 'recordUpdatedAt', 'correctedAt', 'reason']),
  TaskRecord: closed({
    schemaVersion: { const: 'buildr.task-record/v2' },
    taskId: { $ref: '#/$defs/TaskId' },
    title: nonEmptyText,
    intent: nonEmptyText,
    scope: closed({
      projects: arrayOf(nonEmptyText),
      services: arrayOf({ $ref: '#/$defs/QualifiedService' }),
    }, ['projects', 'services']),
    changes: arrayOf({ $ref: '#/$defs/QualifiedChange' }),
    parentTaskId: nullable({ $ref: '#/$defs/TaskId' }),
    childTaskIds: arrayOf({ $ref: '#/$defs/TaskId' }),
    isParent: { type: 'boolean' },
    retrospectiveSourceTaskIds: arrayOf({ $ref: '#/$defs/TaskId' }),
    status: { enum: ['todo', 'active', 'completed', 'abandoned'] },
    result: { $ref: '#/$defs/TaskResult' },
    resultHistory: arrayOf({ $ref: '#/$defs/TaskResultHistoryEntry' }),
    createdAt: nonEmptyText,
    updatedAt: nonEmptyText,
  }, ['schemaVersion', 'taskId', 'title', 'intent', 'scope', 'changes', 'parentTaskId', 'childTaskIds', 'retrospectiveSourceTaskIds', 'status', 'result', 'createdAt', 'updatedAt']),
  TaskRelationSummary: closed({
    taskId: { $ref: '#/$defs/TaskId' },
    title: nonEmptyText,
    status: { enum: ['todo', 'active', 'completed', 'abandoned'] },
  }, ['taskId', 'title', 'status']),
  TaskRelations: closed({
    parent: nullable({ $ref: '#/$defs/TaskRelationSummary' }),
    children: arrayOf({ $ref: '#/$defs/TaskRelationSummary' }),
  }, ['parent', 'children']),
  RetrospectiveRelations: closed({
    sources: arrayOf({ $ref: '#/$defs/TaskRelationSummary' }),
    followups: arrayOf({ $ref: '#/$defs/TaskRelationSummary' }),
  }, ['sources', 'followups']),
  StoredTaskView: closed({
    record: { $ref: '#/$defs/TaskRecord' },
    recordDigest: nonEmptyText,
    storedChangeReferences: arrayOf({ $ref: '#/$defs/QualifiedChange' }),
    taskRelations: { $ref: '#/$defs/TaskRelations' },
    retrospectiveRelations: { $ref: '#/$defs/RetrospectiveRelations' },
    childTaskCount: { type: 'integer', minimum: 0 },
  }, ['record', 'recordDigest', 'storedChangeReferences', 'taskRelations', 'retrospectiveRelations', 'childTaskCount']),
  ErrorResponse: closed({
    error: closed({ code: nonEmptyText, message: nonEmptyText, details: true }, ['code', 'message']),
  }, ['error']),
  TaskRecordMutationResponse: closed({
    schemaVersion: { const: 'buildr.task-record-result/v4' },
    operation: { enum: ['update', 'complete', 'abandon'] },
    status: { enum: ['updated', 'completed', 'abandoned'] },
    taskId: { $ref: '#/$defs/TaskId' },
    record: { $ref: '#/$defs/TaskRecord' },
    recordDigest: nonEmptyText,
    changeReferences: arrayOf({ type: 'object', additionalProperties: true }),
    taskRelations: { $ref: '#/$defs/TaskRelations' },
    retrospectiveRelations: { $ref: '#/$defs/RetrospectiveRelations' },
    diagnostic: { type: 'null' },
    effects: arrayOf(closed({ type: nonEmptyText, taskId: { $ref: '#/$defs/TaskId' } }, ['type', 'taskId'])),
    nextActions: arrayOf(nonEmptyText),
  }, ['schemaVersion', 'operation', 'status', 'taskId', 'record', 'recordDigest', 'changeReferences', 'taskRelations', 'retrospectiveRelations', 'diagnostic', 'effects', 'nextActions']),
});

const defs = TASK_RECORD_HTTP_DEFINITIONS;

export const TASK_RECORD_HTTP_SCHEMAS = Object.freeze({
  listRequest: schema('list/request', 'TaskListRequest', closed({
    q: { type: 'string' },
    project: nonEmptyText,
    service: { type: 'string', pattern: QUALIFIED_PATTERN },
    status: { enum: ['open', 'todo', 'active', 'completed', 'abandoned', 'all'] },
    hasChildren: { enum: ['yes', 'no', 'all'] },
    hasRetrospective: { enum: ['yes', 'no', 'all'] },
    retrospectiveState: { enum: ['missing', 'pending', 'handled', 'no-action', 'all'] },
  }), defs),
  listResponse: schema('list/response', 'TaskListResponse', closed({
    schemaVersion: { const: 'buildr.task-record-list/v4' },
    filters: closed({
      q: { type: 'string' },
      project: nullable(nonEmptyText),
      service: nullable({ type: 'string', pattern: QUALIFIED_PATTERN }),
      status: { enum: ['open', 'todo', 'active', 'completed', 'abandoned', 'all'] },
      hasChildren: { enum: ['yes', 'no', 'all'] },
      hasRetrospective: { enum: ['yes', 'no', 'all'] },
      retrospectiveState: { enum: ['missing', 'pending', 'handled', 'no-action', 'all'] },
    }, ['q', 'project', 'service', 'status', 'hasChildren', 'hasRetrospective', 'retrospectiveState']),
    filterOptions: closed({ projects: arrayOf(nonEmptyText), services: arrayOf({ type: 'string', pattern: QUALIFIED_PATTERN }) }, ['projects', 'services']),
    totalTaskCount: { type: 'integer', minimum: 0 },
    tasks: arrayOf({ $ref: '#/$defs/StoredTaskView' }),
    diagnostics: arrayOf(closed({ taskId: { $ref: '#/$defs/TaskId' }, code: nonEmptyText, message: nonEmptyText, details: true }, ['message'])),
  }, ['schemaVersion', 'filters', 'filterOptions', 'totalTaskCount', 'tasks', 'diagnostics']), defs),
  detailRequest: schema('detail/request', 'TaskDetailRequest', closed({}), defs),
  detailResponse: schema('detail/response', 'TaskDetailResponse', closed({
    schemaVersion: { const: 'buildr.task-record-view/v2' },
    taskId: { $ref: '#/$defs/TaskId' },
    record: { $ref: '#/$defs/TaskRecord' },
    recordDigest: nonEmptyText,
    storedChangeReferences: arrayOf({ $ref: '#/$defs/QualifiedChange' }),
    taskRelations: { $ref: '#/$defs/TaskRelations' },
    retrospectiveRelations: { $ref: '#/$defs/RetrospectiveRelations' },
    childTaskCount: { type: 'integer', minimum: 0 },
  }, ['schemaVersion', 'taskId', 'record', 'recordDigest', 'storedChangeReferences', 'taskRelations', 'retrospectiveRelations', 'childTaskCount']), defs),
  updateRequest: schema('update/request', 'TaskUpdateRequest', {
    ...closed({
      expectedRecordDigest: nonEmptyText,
      status: { enum: ['todo', 'active', 'completed', 'abandoned'] }, reason: nonEmptyText, summary: nonEmptyText,
      noChange: { type: 'boolean' }, parentCompletion: { $ref: '#/$defs/ParentCompletion' },
      addChanges: arrayOf({ $ref: '#/$defs/QualifiedChange' }), removeChanges: arrayOf({ $ref: '#/$defs/QualifiedChange' }),
    isParent: { const: true },
      title: nonEmptyText,
      intent: nonEmptyText,
      parentTaskId: nullable({ $ref: '#/$defs/TaskId' }),
      addProjects: arrayOf(nonEmptyText),
      removeProjects: arrayOf(nonEmptyText),
      addServices: arrayOf({ $ref: '#/$defs/QualifiedServiceInput' }),
      removeServices: arrayOf({ $ref: '#/$defs/QualifiedServiceInput' }),
      addRetrospectiveSources: arrayOf({ $ref: '#/$defs/TaskId' }),
      removeRetrospectiveSources: arrayOf({ $ref: '#/$defs/TaskId' }),
    }, ['expectedRecordDigest']),
    minProperties: 2,
  }, defs),
  updateResponse: schema('update/response', 'TaskUpdateResponse', { $ref: '#/$defs/TaskRecordMutationResponse' }, defs),
  completeRequest: schema('complete/request', 'TaskCompleteRequest', closed({
    expectedRecordDigest: nonEmptyText,
    summary: nonEmptyText,
    noChange: { type: 'boolean' },
    parentCompletion: { $ref: '#/$defs/ParentCompletion' },
  }, ['expectedRecordDigest', 'summary', 'noChange']), defs),
  completeResponse: schema('complete/response', 'TaskCompleteResponse', { $ref: '#/$defs/TaskRecordMutationResponse' }, defs),
  abandonRequest: schema('abandon/request', 'TaskAbandonRequest', closed({
    expectedRecordDigest: nonEmptyText,
    reason: nonEmptyText,
  }, ['expectedRecordDigest', 'reason']), defs),
  abandonResponse: schema('abandon/response', 'TaskAbandonResponse', { $ref: '#/$defs/TaskRecordMutationResponse' }, defs),
  errorResponse: schema('error/response', 'TaskErrorResponse', { $ref: '#/$defs/ErrorResponse' }, defs),
});

export const TASK_RECORD_HTTP_OPERATIONS = Object.freeze([
  ['task-record.list', 'GET', '/tasks', 'listRequest', 'listResponse'],
  ['task-record.detail', 'GET', '/tasks/:taskId', 'detailRequest', 'detailResponse'],
  ['task-record.update', 'PATCH', '/tasks/:taskId', 'updateRequest', 'updateResponse'],
  ['task-record.complete', 'POST', '/tasks/:taskId/complete', 'completeRequest', 'completeResponse'],
  ['task-record.abandon', 'POST', '/tasks/:taskId/abandon', 'abandonRequest', 'abandonResponse'],
].map(([id, method, path, request, success]) => Object.freeze({
  id,
  method,
  path,
  requestSchemaId: TASK_RECORD_HTTP_SCHEMAS[request].$id,
  successSchemaId: TASK_RECORD_HTTP_SCHEMAS[success].$id,
  errorSchemaId: TASK_RECORD_HTTP_SCHEMAS.errorResponse.$id,
})));

const allSchemas = Object.freeze(Object.values(TASK_RECORD_HTTP_SCHEMAS));
export const TASK_RECORD_HTTP_VALIDATORS = compileJsonSchemaCatalog(allSchemas);

export function inspectTaskRecordHttpContractCoverage(routeIds) {
  const migrated = new Set(TASK_RECORD_HTTP_OPERATIONS.map((operation) => operation.id));
  const unmigrated = [...new Set(routeIds)].filter((routeId) => !migrated.has(routeId)).sort();
  return Object.freeze({
    schemaVersion: 'buildr.task-record-http-contract-coverage/v1',
    status: unmigrated.length ? 'attention' : 'aligned',
    migratedOperationIds: Object.freeze([...migrated].sort()),
    unmigratedOperationIds: Object.freeze(unmigrated),
    blocking: false,
  });
}
