import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const ROOT = 'https://schemas.buildr.ai/http/system-installation';
const text = { type: 'string', minLength: 1 };
const nullableText = { type: ['string', 'null'] };
const closed = (properties: any, required: any = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const schema = (id: any, title: any, body: any) => Object.freeze({ $schema: DRAFT, $id: `${ROOT}/${id}/v1`, title, ...body });

const jobSnapshot = closed({
  schemaVersion: { const: 'buildr.web-update-flow/v2' },
  id: nullableText,
  revision: { type: 'integer', minimum: 0 },
  stage: { enum: ['idle', 'download', 'ready', 'install', 'launcher', 'restart', 'verify', 'workspaces', 'completed'] },
  workspaces: { type: 'array', items: closed({ rootPath: text, workspaceId: nullableText, name: text, status: { enum: ['pending','running','done','failed','skipped'] }, error: nullableText, details:{type:'string'}, customizations: {type:'array',items:closed({id:text,integrity:text},['id','integrity'])} }, ['rootPath','workspaceId','name','status','error']) },
  runningVersion: nullableText,
  installedVersion: nullableText,
  simulated: { type: 'boolean' },
  steps: closed(Object.fromEntries(['install', 'launcher', 'restart', 'verify'].map(key => [key, { enum: ['pending', 'running', 'done', 'failed', 'skipped'] }])), ['install', 'launcher', 'restart', 'verify']),
  launcherError: { type: ['object', 'null'], additionalProperties: true },
  status: { enum: ['idle', 'preparing', 'ready', 'failed', 'applying', 'partial', 'completed'] },
  track: { enum: ['stable', 'candidate', null] },
  version: nullableText,
  currentVersion: nullableText,
  error: { type: ['object', 'null'], additionalProperties: true },
  updatedAt: nullableText,
}, ['schemaVersion', 'id', 'revision', 'status', 'stage', 'track', 'version', 'currentVersion', 'runningVersion', 'installedVersion', 'simulated', 'steps', 'launcherError', 'error', 'updatedAt']);

export const UPDATE_FLOW_HTTP_SCHEMAS = Object.freeze({
  resourceLocationRequest: schema('resources/request', 'ResourceLocationRequest', closed({})),
  resourceLocationResponse: schema('resources/response', 'ResourceLocationResponse', closed({version:text,resourceSet:text,path:text,available:{type:'boolean'},issue:nullableText}, ['version','resourceSet','path','available','issue'])),
  resourceOpenRequest: schema('resources/open/request', 'ResourceOpenRequest', closed({resourceSet:text}, ['resourceSet'])),
  resourceOpenResponse: schema('resources/open/response', 'ResourceOpenResponse', closed({requested:{const:true}}, ['requested'])),
  prepareRequest: schema('update-flow/prepare-request', 'UpdateFlowPrepareRequest', closed({
    track: { enum: ['stable', 'candidate'] },
    expectedVersion: text, autoApply: { type: 'boolean' },
  }, ['track', 'expectedVersion'])),
  applyRequest: schema('update-flow/apply-request', 'UpdateFlowApplyRequest', closed({
    expectedVersion: text,
  }, ['expectedVersion'])),
  recoveryRequest: schema('update-flow/recovery-request', 'UpdateFlowRecoveryRequest', closed({
    expectedJobId: text, expectedVersion: text, action: { enum: ['install', 'launcher', 'restart', 'workspaces'] }, rootPath: text, keepCustomizations: {type:'boolean'},
  }, ['expectedJobId', 'expectedVersion', 'action'])),
  statusRequest: schema('update-flow/status-request', 'UpdateFlowStatusRequest', closed({})),
  jobResponse: schema('update-flow/job-response', 'UpdateFlowJobResponse', jobSnapshot),
  errorResponse: schema('update-flow/error-response', 'UpdateFlowHttpErrorResponse', closed({ error: closed({ code: text, message: text, details: true }, ['code', 'message']) }, ['error'])),
});

export const UPDATE_FLOW_HTTP_OPERATIONS = Object.freeze([
  {id:'system-installation.resources.location', owner:'system-installation', method:'GET', path:'/api/v1/installation/resources', requestSchemaId:UPDATE_FLOW_HTTP_SCHEMAS.resourceLocationRequest.$id, successSchemaId:UPDATE_FLOW_HTTP_SCHEMAS.resourceLocationResponse.$id, errorSchemaId:UPDATE_FLOW_HTTP_SCHEMAS.errorResponse.$id},
  {id:'system-installation.resources.open', owner:'system-installation', method:'POST', path:'/api/v1/installation/resources/open', requestSchemaId:UPDATE_FLOW_HTTP_SCHEMAS.resourceOpenRequest.$id, successSchemaId:UPDATE_FLOW_HTTP_SCHEMAS.resourceOpenResponse.$id, errorSchemaId:UPDATE_FLOW_HTTP_SCHEMAS.errorResponse.$id},
  Object.freeze({
    id: 'system-installation.update-flow.recover', owner: 'system-installation', method: 'POST', path: '/api/v1/update/recover',
    disposition: 'migrated-json', responseKind: 'json',
    requestSchemaId: UPDATE_FLOW_HTTP_SCHEMAS.recoveryRequest.$id,
    successSchemaId: UPDATE_FLOW_HTTP_SCHEMAS.jobResponse.$id, errorSchemaId: UPDATE_FLOW_HTTP_SCHEMAS.errorResponse.$id,
  }),
  Object.freeze({
    id: 'system-installation.update-flow.status', owner: 'system-installation', method: 'GET', path: '/api/v1/update/status',
    disposition: 'migrated-json', responseKind: 'json',
    requestSchemaId: UPDATE_FLOW_HTTP_SCHEMAS.statusRequest.$id,
    successSchemaId: UPDATE_FLOW_HTTP_SCHEMAS.jobResponse.$id,
    errorSchemaId: UPDATE_FLOW_HTTP_SCHEMAS.errorResponse.$id,
  }),
  Object.freeze({
    id: 'system-installation.update-flow.prepare', owner: 'system-installation', method: 'POST', path: '/api/v1/update/prepare',
    disposition: 'migrated-json', responseKind: 'json',
    requestSchemaId: UPDATE_FLOW_HTTP_SCHEMAS.prepareRequest.$id,
    successSchemaId: UPDATE_FLOW_HTTP_SCHEMAS.jobResponse.$id,
    errorSchemaId: UPDATE_FLOW_HTTP_SCHEMAS.errorResponse.$id,
  }),
  Object.freeze({
    id: 'system-installation.update-flow.apply', owner: 'system-installation', method: 'POST', path: '/api/v1/update/apply',
    disposition: 'migrated-json', responseKind: 'json',
    requestSchemaId: UPDATE_FLOW_HTTP_SCHEMAS.applyRequest.$id,
    successSchemaId: UPDATE_FLOW_HTTP_SCHEMAS.jobResponse.$id,
    errorSchemaId: UPDATE_FLOW_HTTP_SCHEMAS.errorResponse.$id,
  }),
]);

export const UPDATE_FLOW_HTTP_VALIDATORS = compileJsonSchemaCatalog(Object.values(UPDATE_FLOW_HTTP_SCHEMAS));

export function validateUpdateFlowHttp(schemaId: any, value: any, phase: any = 'request', operationId: any = 'system-installation.update-flow') {
  const result = UPDATE_FLOW_HTTP_VALIDATORS.validate(schemaId, value);
  if (result.valid) return value;
  const error: Error & Record<string, any> = new Error(`Update Flow HTTP ${phase} DTO 不符合契约。`);
  error.code = phase === 'request' ? 'update_flow_http_request_invalid' : 'update_flow_http_response_invalid';
  error.status = phase === 'request' ? 400 : 500;
  error.details = { operationId, schemaId, errors: result.errors };
  throw error;
}
