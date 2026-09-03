import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.mjs';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const ROOT = 'https://schemas.buildr.ai/http/system-publication';
const text = { type: 'string', minLength: 1 };
const nullableText = { type: ['string', 'null'] };
const closed = (properties: any, required: any = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const schema = (id: any, title: any, body: any) => Object.freeze({ $schema: DRAFT, $id: `${ROOT}/${id}/v1`, title, ...body });
const publication = closed({
  id: text, title: text, kind: text, status: text, publishedAt: nullableText,
  targets: { type: 'array', items: closed({ platform: text, status: text, url: text }, ['platform', 'status']) },
  sourcePath: text,
}, ['id', 'title', 'kind', 'status', 'publishedAt', 'targets', 'sourcePath']);

export const PUBLICATION_HTTP_SCHEMAS: Readonly<Record<string, any>> = Object.freeze({
  listRequest: schema('list/request', 'PublicationListRequest', closed({})),
  detailRequest: schema('detail/request', 'PublicationDetailRequest', closed({ id: text }, ['id'])),
  assetRequest: schema('asset/request', 'PublicationAssetRequest', closed({ id: text, assetPath: text }, ['id', 'assetPath'])),
  listResponse: schema('list/response', 'PublicationListResponse', closed({
    schemaVersion: { const: 'buildr.publications/v1' }, publications: { type: 'array', items: publication }, empty: { type: 'boolean' },
  }, ['schemaVersion', 'publications', 'empty'])),
  detailResponse: schema('detail/response', 'PublicationDetailResponse', closed({
    schemaVersion: { const: 'buildr.publication-detail/v1' }, publication, content: { type: 'string' }, source: { type: 'string' },
  }, ['schemaVersion', 'publication', 'content', 'source'])),
  errorResponse: schema('error/response', 'PublicationHttpErrorResponse', closed({ error: closed({ code: text, message: text, details: true }, ['code', 'message']) }, ['error'])),
});

const json = (id: any, method: any, path: any, request: any, success: any) => Object.freeze({
  id, owner: 'system-publication', method, path, disposition: 'migrated-json', responseKind: 'json',
  requestSchemaId: PUBLICATION_HTTP_SCHEMAS[request].$id,
  successSchemaId: PUBLICATION_HTTP_SCHEMAS[success].$id,
  errorSchemaId: PUBLICATION_HTTP_SCHEMAS.errorResponse.$id,
});

export const PUBLICATION_HTTP_OPERATIONS = Object.freeze([
  json('system-publication.list', 'GET', '/publications', 'listRequest', 'listResponse'),
  json('system-publication.detail', 'GET', '/publications/:publicationId', 'detailRequest', 'detailResponse'),
  Object.freeze({
    id: 'system-publication.asset', owner: 'system-publication', method: 'GET', path: '/publications/:publicationId/assets/:assetPath',
    disposition: 'migrated-binary', responseKind: 'binary',
    requestSchemaId: PUBLICATION_HTTP_SCHEMAS.assetRequest.$id,
    successSchemaId: null,
    errorSchemaId: PUBLICATION_HTTP_SCHEMAS.errorResponse.$id,
  }),
]);

export const PUBLICATION_HTTP_VALIDATORS = compileJsonSchemaCatalog(Object.values(PUBLICATION_HTTP_SCHEMAS));

export function validatePublicationHttp(schemaId: any, value: any, operationId: any, phase: any = 'request') {
  const result = PUBLICATION_HTTP_VALIDATORS.validate(schemaId, value);
  if (result.valid) return value;
  const error: Error & Record<string, any> = new Error(`Publication HTTP ${phase} DTO 不符合契约：${operationId}。`);
  error.code = phase === 'request' ? 'publication_http_request_invalid' : 'publication_http_response_invalid';
  error.status = phase === 'request' ? 400 : 500;
  error.details = { operationId, schemaId, errors: result.errors };
  throw error;
}

export function publicationOperation(id: any) {
  const operation = PUBLICATION_HTTP_OPERATIONS.find((item: any) => item.id === id);
  if (!operation) throw new Error(`Publication HTTP operation 未注册：${id}`);
  return operation;
}
