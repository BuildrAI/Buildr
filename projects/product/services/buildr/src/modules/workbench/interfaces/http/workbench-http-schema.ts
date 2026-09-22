import { WORKBENCH_INPUT_DEFINITIONS } from '../../domain/workbench.ts';
import { TASK_WORK_CONTEXT_DEFINITIONS } from '../../../task/work-context/domain/work-context.ts';
import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';
import { TASK_HTTP_DEFINITIONS } from '../../../task/interfaces/http/task-http-schema.ts';

const text = { type: 'string', minLength: 1, maxLength: 12000, pattern: '\\S' };
const shortText = { ...text, maxLength: 300 };
const nullable = (value: any) => ({ anyOf: [value, { type: 'null' }] });
const array = (items: any) => ({ type: 'array', items });
const closed = (properties: any, required: string[] = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const ref = (name: string) => ({ $ref: `#/$defs/${name}` });
const kind = { enum: ['pinned-task', 'planned-task', 'followed-project', 'saved-resource', 'recent-resource'] };
export const WORKBENCH_HTTP_DEFINITIONS = {
  ...TASK_HTTP_DEFINITIONS,
  ...TASK_WORK_CONTEXT_DEFINITIONS,
  ...WORKBENCH_INPUT_DEFINITIONS,
  WorkbenchEmptyRequest: closed({}),
  WorkbenchDiagnostic: closed({ code: text, message: text, project: text }, ['code', 'message']),
  WorkbenchPreference: closed({ kind, key: shortText, label: shortText, href: { ...text, maxLength: 1500 }, updatedAt: text }),
  WorkbenchPreferencesResponse: closed({ schemaVersion: { const: 'buildr.workbench-preferences/v1' }, items: array(ref('WorkbenchPreference')) }),
  WorkbenchTaskItem: closed({ task: ref('StoredTaskView'), workContext: ref('TaskWorkContextResponse') }),
  WorkbenchTaskSection: closed({ items: array(ref('WorkbenchTaskItem')), total: { type: 'integer', minimum: 0 }, hasMore: { type: 'boolean' }, diagnostic: nullable(ref('WorkbenchDiagnostic')) }),
  WorkbenchDailyProgressItem: closed({ project: shortText, projectName: shortText, date: text, recordedAt: text, daySummary: closed({ added: text, updated: text, deleted: text, drawbacks: text }), commitCount: { type: 'integer', minimum: 0 }, coverage: text }),
  WorkbenchResponse: closed({ schemaVersion: { const: 'buildr.workbench/v1' }, observedAt: text, project: nullable(shortText), date: nullable(text), projects: array(closed({ code: shortText, name: shortText })), attention: ref('WorkbenchTaskSection'), active: ref('WorkbenchTaskSection'), planned: ref('WorkbenchTaskSection'), recentResults: ref('WorkbenchTaskSection'), preferences: ref('WorkbenchPreferencesResponse'), dailyProgress: closed({ items: array(ref('WorkbenchDailyProgressItem')), diagnostics: array(ref('WorkbenchDiagnostic')), missingProjects: array(shortText), hasMore: { type: 'boolean' } }) }),
  WorkbenchErrorResponse: closed({ error: closed({ code: text, message: text, details: true }, ['code', 'message']) }),
};
const schema = (name: keyof typeof WORKBENCH_HTTP_DEFINITIONS) => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `https://schemas.buildr.ai/http/workbench/${name}/v1`, title: name, ...ref(name), $defs: WORKBENCH_HTTP_DEFINITIONS });
export const WORKBENCH_HTTP_SCHEMAS = Object.fromEntries(Object.keys(WORKBENCH_HTTP_DEFINITIONS).filter((name) => name.startsWith('Workbench') || name.startsWith('TaskWork')).map((name) => [name, schema(name as keyof typeof WORKBENCH_HTTP_DEFINITIONS)]));
export const WORKBENCH_HTTP_VALIDATORS = compileJsonSchemaCatalog(Object.values(WORKBENCH_HTTP_SCHEMAS));
export function validateWorkbenchHttp<T>(name: string, input: T): T {
  const result = WORKBENCH_HTTP_VALIDATORS.validate(WORKBENCH_HTTP_SCHEMAS[name].$id, input);
  if (!result.valid) throw Object.assign(new Error('工作台请求不符合契约。'), { code: 'workbench_input_invalid', status: 400, details: { schema: name, errors: result.errors } });
  return input;
}
export const WORKBENCH_HTTP_OPERATIONS = [
  ['task-work-context.list', 'GET', '/tasks/work-contexts', 'TaskWorkContextsRequest', 'TaskWorkContextsResponse'],
  ['task-work-context.inspect', 'GET', '/tasks/:taskId/work-context', null, 'TaskWorkContextResponse'],
  ['task-work-context.record', 'PUT', '/tasks/:taskId/work-context', 'TaskWorkContextRecordRequest', 'TaskWorkContextResponse'],
  ['task-work-context.respond', 'POST', '/tasks/:taskId/work-context/respond', 'TaskWorkContextRespondRequest', 'TaskWorkContextResponse'],
  ['workbench.overview', 'GET', '/workbench', 'WorkbenchQuery', 'WorkbenchResponse'],
  ['workbench.preferences', 'GET', '/workbench/preferences', null, 'WorkbenchPreferencesResponse'],
  ['workbench.preference.put', 'PUT', '/workbench/preferences/:kind/:key', 'WorkbenchPreferencePutRequest', 'WorkbenchPreferencesResponse'],
  ['workbench.preference.delete', 'DELETE', '/workbench/preferences/:kind/:key', null, 'WorkbenchPreferencesResponse'],
  ['workbench.visit', 'POST', '/workbench/visits', 'WorkbenchVisitRequest', 'WorkbenchPreferencesResponse'],
].map(([id, method, path, request, success]) => ({ id, owner: 'workbench', method, path, disposition: 'migrated-json', responseKind: 'json', requestSchemaId: WORKBENCH_HTTP_SCHEMAS[request || 'WorkbenchEmptyRequest'].$id, successSchemaId: WORKBENCH_HTTP_SCHEMAS[success!].$id, errorSchemaId: WORKBENCH_HTTP_SCHEMAS.WorkbenchErrorResponse.$id }));
