import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const ROOT = 'https://schemas.buildr.ai/http/system-publication';
const text = { type: 'string', minLength: 1 };
const nullableText = { type: ['string', 'null'] };
const closed = (properties: any, required: any = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
const schema = (id: any, title: any, body: any) => Object.freeze({ $schema: DRAFT, $id: `${ROOT}/${id}/v1`, title, ...body });
const publication = closed({
  id: text, title: text, summary: { type: 'string' }, kind: text, status: text, publishedAt: nullableText,
  projectCode: text, projectName: text, updatedAt: text, revision: text,
  targets: { type: 'array', items: closed({ platform: text, status: text, url: text }, ['platform', 'status']) }, sourcePath: text,
}, ['id', 'title', 'summary', 'kind', 'status', 'publishedAt', 'projectCode', 'projectName', 'updatedAt', 'revision', 'targets', 'sourcePath']);
const asset = closed({ name: text, relativePath: text, contentType: text, size: { type: 'integer', minimum: 0 }, isImage: { type: 'boolean' } }, ['name', 'relativePath', 'contentType', 'size', 'isImage']);
const assets = { type: 'array', items: asset };
const identity = { projectCode: text, id: text };
const fields = { title: { type: 'string', minLength: 1, maxLength: 150 }, summary: { type: 'string', maxLength: 2000 }, content: { type: 'string' }, status: text };

export const PUBLICATION_HTTP_SCHEMAS: Readonly<Record<string, any>> = Object.freeze({
  listRequest: schema('list/request', 'PublicationListRequest', closed({})),
  projectListRequest: schema('project-list/request', 'PublicationProjectListRequest', closed({ projectCode: text }, ['projectCode'])),
  detailRequest: schema('detail/request', 'PublicationDetailRequest', closed({ id: text }, ['id'])),
  projectDetailRequest: schema('project-detail/request', 'PublicationProjectDetailRequest', closed(identity, ['projectCode', 'id'])),
  assetRequest: schema('asset/request', 'PublicationAssetRequest', closed({ id: text, assetPath: text }, ['id', 'assetPath'])),
  projectAssetRequest: schema('project-asset/request', 'PublicationProjectAssetRequest', closed({ ...identity, assetPath: text }, ['projectCode', 'id', 'assetPath'])),
  createRequest: schema('create/request', 'PublicationCreateRequest', closed({ id: text, ...fields }, ['title'])),
  updateRequest: schema('update/request', 'PublicationUpdateRequest', closed({ revision: text, ...fields }, ['revision', 'title', 'summary', 'content', 'status'])),
  deleteRequest: schema('delete/request', 'PublicationDeleteRequest', closed({ revision: text }, ['revision'])),
  uploadRequest: schema('upload/request', 'PublicationUploadRequest', closed({ revision: text, filename: { type: 'string', minLength: 1, maxLength: 240 }, contentBase64: text }, ['revision', 'filename', 'contentBase64'])),
  listResponse: schema('list/response', 'PublicationListResponse', closed({
    schemaVersion: { const: 'buildr.publications/v1' }, publications: { type: 'array', items: publication }, empty: { type: 'boolean' },
    diagnostics: { type: 'array', items: closed({ projectCode: text, code: text, message: text }, ['projectCode', 'code', 'message']) },
  }, ['schemaVersion', 'publications', 'empty', 'diagnostics'])),
  detailResponse: schema('detail/response', 'PublicationDetailResponse', closed({
    schemaVersion: { const: 'buildr.publication-detail/v1' }, publication, content: { type: 'string' }, source: { type: 'string' }, revision: text, assets,
    assetDiagnostics: { type: 'array', items: closed({ code: text, message: text }, ['code', 'message']) },
  }, ['schemaVersion', 'publication', 'content', 'source', 'revision', 'assets', 'assetDiagnostics'])),
  deleteResponse: schema('delete/response', 'PublicationDeleteResponse', closed({ schemaVersion: { const: 'buildr.publication-delete/v1' }, ...identity, deleted: { const: true } }, ['schemaVersion', 'projectCode', 'id', 'deleted'])),
  assetsResponse: schema('assets/response', 'PublicationAssetsResponse', closed({ schemaVersion: { const: 'buildr.publication-assets/v1' }, ...identity, revision: text, assets }, ['schemaVersion', 'projectCode', 'id', 'revision', 'assets'])),
  uploadResponse: schema('upload/response', 'PublicationUploadResponse', closed({ schemaVersion: { const: 'buildr.publication-asset-upload/v1' }, revision: text, asset }, ['schemaVersion', 'revision', 'asset'])),
  errorResponse: schema('error/response', 'PublicationHttpErrorResponse', closed({ error: closed({ code: text, message: text, details: true }, ['code', 'message']) }, ['error'])),
});

const json = (id: any, method: any, path: any, request: any, success: any) => Object.freeze({
  id, owner: 'system-publication', method, path, disposition: 'migrated-json', responseKind: 'json',
  requestSchemaId: PUBLICATION_HTTP_SCHEMAS[request].$id, successSchemaId: PUBLICATION_HTTP_SCHEMAS[success].$id, errorSchemaId: PUBLICATION_HTTP_SCHEMAS.errorResponse.$id,
});
const binary = (id: string, path: string, request: string) => Object.freeze({
  id, owner: 'system-publication', method: 'GET', path, disposition: 'migrated-binary', responseKind: 'binary',
  requestSchemaId: PUBLICATION_HTTP_SCHEMAS[request].$id, successSchemaId: null, errorSchemaId: PUBLICATION_HTTP_SCHEMAS.errorResponse.$id,
});
const projectPath = '/projects/:projectCode/publications';
export const PUBLICATION_HTTP_OPERATIONS = Object.freeze([
  json('system-publication.list', 'GET', '/publications', 'listRequest', 'listResponse'),
  json('system-publication.detail', 'GET', '/publications/:publicationId', 'detailRequest', 'detailResponse'),
  binary('system-publication.asset', '/publications/:publicationId/assets/:assetPath', 'assetRequest'),
  json('system-publication.project-list', 'GET', projectPath, 'projectListRequest', 'listResponse'),
  json('system-publication.project-detail', 'GET', `${projectPath}/:publicationId`, 'projectDetailRequest', 'detailResponse'),
  json('system-publication.create', 'POST', projectPath, 'createRequest', 'detailResponse'),
  json('system-publication.update', 'PUT', `${projectPath}/:publicationId`, 'updateRequest', 'detailResponse'),
  json('system-publication.delete', 'DELETE', `${projectPath}/:publicationId`, 'deleteRequest', 'deleteResponse'),
  json('system-publication.assets', 'GET', `${projectPath}/:publicationId/assets`, 'projectDetailRequest', 'assetsResponse'),
  json('system-publication.upload', 'POST', `${projectPath}/:publicationId/assets`, 'uploadRequest', 'uploadResponse'),
  binary('system-publication.project-asset', `${projectPath}/:publicationId/assets/:assetPath`, 'projectAssetRequest'),
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
