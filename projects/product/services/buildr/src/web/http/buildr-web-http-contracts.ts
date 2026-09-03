import { compileJsonSchemaCatalog } from '../../infrastructure/contracts/json-schema-validator.mjs';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const ROOT = 'https://schemas.buildr.ai/http/local-app';
const text = { type: 'string', minLength: 1 };
const nullable = (value: any) => ({ anyOf: [value, { type: 'null' }] });
const closed = (properties: any, required: any = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const schema = (id: any, title: any, body: any) => Object.freeze({ $schema: DRAFT, $id: `${ROOT}/${id}/v1`, title, ...body });

export const BUILDR_WEB_HTTP_SCHEMAS: Readonly<Record<string, any>> = Object.freeze({
  emptyRequest: schema('empty/request', 'BuildrWebEmptyRequest', closed({})),
  quitRequest: schema('quit/request', 'BuildrWebQuitRequest', closed({})),
  healthResponse: schema('health/response', 'BuildrWebHealthResponse', closed({
    schemaVersion: { const: 'buildr.local-app-health/v1' },
    status: { enum: ['ready', 'stopping'] },
    pid: { type: 'integer', minimum: 1 },
    launcherIdentity: nullable({ type: 'object', additionalProperties: true }),
    productIdentity: nullable({ type: 'object', additionalProperties: true }),
    webProfile: nullable({ type: 'object', additionalProperties: true }),
    previewIdentity: nullable({ type: 'object', additionalProperties: true }),
  }, ['schemaVersion', 'status', 'pid'])),
  stoppingResponse: schema('stopping/response', 'BuildrWebStoppingResponse', closed({ status: { const: 'stopping' } }, ['status'])),
  errorResponse: schema('error/response', 'BuildrWebErrorResponse', closed({
    error: closed({ code: text, message: text, details: true }, ['code', 'message']),
  }, ['error'])),
});

const jsonOperation = (id: any, method: any, path: any, request: any, success: any) => Object.freeze({
  id, owner: 'web-http', method, path, disposition: 'migrated-json', responseKind: 'json',
  requestSchemaId: BUILDR_WEB_HTTP_SCHEMAS[request].$id,
  successSchemaId: BUILDR_WEB_HTTP_SCHEMAS[success].$id,
  errorSchemaId: BUILDR_WEB_HTTP_SCHEMAS.errorResponse.$id,
});

export const BUILDR_WEB_HTTP_OPERATIONS = Object.freeze([
  jsonOperation('local-app.health', 'GET', '/api/v1/health', 'emptyRequest', 'healthResponse'),
  jsonOperation('local-app.quit', 'POST', '/api/v1/app/quit', 'quitRequest', 'stoppingResponse'),
  jsonOperation('local-app.quit-instance', 'POST', '/api/v1/app/quit-instance', 'emptyRequest', 'stoppingResponse'),
]);

export const BUILDR_WEB_HTTP_VALIDATORS = compileJsonSchemaCatalog(Object.values(BUILDR_WEB_HTTP_SCHEMAS));

export function validateBuildrWebHttp(schemaId: any, value: any, operationId: any) {
  const result = BUILDR_WEB_HTTP_VALIDATORS.validate(schemaId, value);
  if (result.valid) return value;
  const item = result.errors.find((entry: any) => entry.keyword === 'additionalProperties') || result.errors[0] || {};
  const field = item.params?.additionalProperty || String(item.instancePath || '').split('/').filter(Boolean)[0] || null;
  const error: Error & Record<string, any> = new Error(`Buildr Web HTTP 请求不符合契约${field ? `：${field}` : ''}。`);
  error.code = item.keyword === 'additionalProperties' ? 'local_app_http_field_forbidden' : 'local_app_http_request_invalid';
  error.status = 400;
  error.details = { operationId, schemaId, ...(field ? { field } : {}), keyword: item.keyword || 'schema' };
  throw error;
}

export function buildrWebOperation(id: any) {
  const operation = BUILDR_WEB_HTTP_OPERATIONS.find((item: any) => item.id === id);
  if (!operation) throw new Error(`Buildr Web HTTP operation 未注册：${id}`);
  return operation;
}

// Existing import names remain as source-compatibility aliases; wire schema and operation IDs above stay stable.
export const LOCAL_APP_HTTP_SCHEMAS = BUILDR_WEB_HTTP_SCHEMAS;
export const LOCAL_APP_HTTP_OPERATIONS = BUILDR_WEB_HTTP_OPERATIONS;
export const LOCAL_APP_HTTP_VALIDATORS = BUILDR_WEB_HTTP_VALIDATORS;
export const validateLocalAppHttp = validateBuildrWebHttp;
export const localAppOperation = buildrWebOperation;
