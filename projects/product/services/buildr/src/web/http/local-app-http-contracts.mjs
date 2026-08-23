import { compileJsonSchemaCatalog } from '../../infrastructure/contracts/json-schema-validator.mjs';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const ROOT = 'https://schemas.buildr.ai/http/local-app';
const text = { type: 'string', minLength: 1 };
const nullable = (value) => ({ anyOf: [value, { type: 'null' }] });
const closed = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const schema = (id, title, body) => Object.freeze({ $schema: DRAFT, $id: `${ROOT}/${id}/v1`, title, ...body });

export const LOCAL_APP_HTTP_SCHEMAS = Object.freeze({
  emptyRequest: schema('empty/request', 'LocalAppEmptyRequest', closed({})),
  quitRequest: schema('quit/request', 'LocalAppQuitRequest', closed({})),
  healthResponse: schema('health/response', 'LocalAppHealthResponse', closed({
    schemaVersion: { const: 'buildr.local-app-health/v1' },
    status: { enum: ['ready', 'stopping'] },
    pid: { type: 'integer', minimum: 1 },
    launcherIdentity: nullable({ type: 'object', additionalProperties: true }),
    productIdentity: nullable({ type: 'object', additionalProperties: true }),
    webProfile: nullable({ type: 'object', additionalProperties: true }),
    previewIdentity: nullable({ type: 'object', additionalProperties: true }),
  }, ['schemaVersion', 'status', 'pid'])),
  stoppingResponse: schema('stopping/response', 'LocalAppStoppingResponse', closed({ status: { const: 'stopping' } }, ['status'])),
  errorResponse: schema('error/response', 'LocalAppErrorResponse', closed({
    error: closed({ code: text, message: text, details: true }, ['code', 'message']),
  }, ['error'])),
});

const jsonOperation = (id, method, path, request, success) => Object.freeze({
  id, owner: 'web-http', method, path, disposition: 'migrated-json', responseKind: 'json',
  requestSchemaId: LOCAL_APP_HTTP_SCHEMAS[request].$id,
  successSchemaId: LOCAL_APP_HTTP_SCHEMAS[success].$id,
  errorSchemaId: LOCAL_APP_HTTP_SCHEMAS.errorResponse.$id,
});

export const LOCAL_APP_HTTP_OPERATIONS = Object.freeze([
  jsonOperation('local-app.health', 'GET', '/api/v1/health', 'emptyRequest', 'healthResponse'),
  jsonOperation('local-app.quit', 'POST', '/api/v1/app/quit', 'quitRequest', 'stoppingResponse'),
  jsonOperation('local-app.quit-instance', 'POST', '/api/v1/app/quit-instance', 'emptyRequest', 'stoppingResponse'),
]);

export const LOCAL_APP_HTTP_VALIDATORS = compileJsonSchemaCatalog(Object.values(LOCAL_APP_HTTP_SCHEMAS));

export function validateLocalAppHttp(schemaId, value, operationId) {
  const result = LOCAL_APP_HTTP_VALIDATORS.validate(schemaId, value);
  if (result.valid) return value;
  const item = result.errors.find((entry) => entry.keyword === 'additionalProperties') || result.errors[0] || {};
  const field = item.params?.additionalProperty || String(item.instancePath || '').split('/').filter(Boolean)[0] || null;
  const error = new Error(`Local App HTTP 请求不符合契约${field ? `：${field}` : ''}。`);
  error.code = item.keyword === 'additionalProperties' ? 'local_app_http_field_forbidden' : 'local_app_http_request_invalid';
  error.status = 400;
  error.details = { operationId, schemaId, ...(field ? { field } : {}), keyword: item.keyword || 'schema' };
  throw error;
}

export function localAppOperation(id) {
  const operation = LOCAL_APP_HTTP_OPERATIONS.find((item) => item.id === id);
  if (!operation) throw new Error(`Local App HTTP operation 未注册：${id}`);
  return operation;
}
