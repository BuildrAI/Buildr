import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const ROOT = 'https://schemas.buildr.ai/http/system-installation';
const text = { type: 'string', minLength: 1 };
const nullableText = { type: ['string', 'null'] };
const closed = (properties: any, required: any = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const schema = (id: any, title: any, body: any) => Object.freeze({ $schema: DRAFT, $id: `${ROOT}/${id}/v1`, title, ...body });

const jobSnapshot = closed({
  schemaVersion: { const: 'buildr.web-update-flow/v1' },
  status: { enum: ['idle', 'preparing', 'ready', 'failed', 'applying', 'completed'] },
  track: { enum: ['stable', 'candidate', null] },
  version: nullableText,
  currentVersion: nullableText,
  error: { type: ['object', 'null'], additionalProperties: true },
  updatedAt: nullableText,
}, ['schemaVersion', 'status', 'track', 'version', 'currentVersion', 'error', 'updatedAt']);

export const UPDATE_FLOW_HTTP_SCHEMAS = Object.freeze({
  prepareRequest: schema('update-flow/prepare-request', 'UpdateFlowPrepareRequest', closed({
    track: { enum: ['stable', 'candidate'] },
    expectedVersion: text,
  }, ['track', 'expectedVersion'])),
  applyRequest: schema('update-flow/apply-request', 'UpdateFlowApplyRequest', closed({
    expectedVersion: text,
  }, ['expectedVersion'])),
  statusRequest: schema('update-flow/status-request', 'UpdateFlowStatusRequest', closed({})),
  jobResponse: schema('update-flow/job-response', 'UpdateFlowJobResponse', jobSnapshot),
  errorResponse: schema('update-flow/error-response', 'UpdateFlowHttpErrorResponse', closed({ error: closed({ code: text, message: text, details: true }, ['code', 'message']) }, ['error'])),
});

export const UPDATE_FLOW_HTTP_OPERATIONS = Object.freeze([
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
