import { compileJsonSchemaCatalog } from '../../../infrastructure/contracts/json-schema-validator.mjs';

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const ROOT = 'https://schemas.buildr.ai/http/workspace';
const text = { type: 'string', minLength: 1 };
const closed = (properties, required = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length ? { required } : {}),
});
const workspaceSummary = closed({ id: text, name: text, description: text }, ['id', 'name']);
const sourceLocation = {
  type: 'object',
  additionalProperties: true,
  properties: { type: text, path: text, root: text, ownership: text, identity: text },
};
const sourceEntity = { ...sourceLocation, required: ['type', 'path'] };
const projectEntity = {
  type: 'object',
  additionalProperties: true,
  required: ['id', 'workspaceId', 'code', 'name', 'description', 'source'],
  properties: {
    id: text, workspaceId: text, code: text, name: text, description: text,
    source: sourceEntity,
  },
};
const serviceEntity = {
  type: 'object',
  additionalProperties: true,
  required: ['id', 'workspaceId', 'projectId', 'code', 'name', 'description', 'type', 'source'],
  properties: {
    id: text, workspaceId: text, projectId: text, projectCode: text,
    code: text, name: text, description: text, type: text, source: sourceEntity,
  },
};
const registryEntry = closed({ status: text, rootPath: text, updatedAt: text, workspace: { anyOf: [workspaceSummary, { type: 'null' }] }, error: { anyOf: [closed({ code: text, message: text }, ['message']), { type: 'null' }] }, migrationRequired: { type: 'boolean' } }, ['status', 'rootPath']);
const registryProjection = closed({ schemaVersion: text, revision: text, workspaces: { type: 'array', items: registryEntry }, lastOpenedWorkspaceId: { type: ['string', 'null'] } }, ['schemaVersion', 'revision', 'workspaces', 'lastOpenedWorkspaceId']);
const response = (id, title, properties, required) => Object.freeze({
  $schema: DRAFT_2020_12,
  $id: `${ROOT}/${id}/v1`,
  title,
  ...closed(properties, required),
});

export const WORKSPACE_HTTP_SCHEMAS = Object.freeze({
  registryRequest: response('registry/request', 'WorkspaceRegistryRequest', {}, []),
  registerRequest: response('registry/register-request', 'WorkspaceRegisterRequest', {
    rootPath: text,
    revision: text,
    open: { type: 'boolean' },
  }, ['rootPath', 'revision']),
  pickRequest: response('registry/pick-request', 'WorkspacePickRequest', { revision: text }, ['revision']),
  pickResponse: response('registry/pick-response', 'WorkspacePickResponse', { status: text, canceled: { type: 'boolean' }, rootPath: text, workspace: workspaceSummary, registry: registryProjection, message: text, prompt: text }, ['status']),
  removeRequest: response('registry/remove-request', 'WorkspaceRemoveRequest', { revision: text, rootPath: text, workspaceId: text }, ['revision']),
  registryResponse: response('registry/response', 'WorkspaceRegistryResponse', {
    schemaVersion: text,
    revision: text,
    workspaces: { type: 'array', items: registryEntry },
    lastOpenedWorkspaceId: { type: ['string', 'null'] },
  }, ['schemaVersion', 'revision', 'workspaces', 'lastOpenedWorkspaceId']),
  workspaceReadRequest: response('workspace/request', 'WorkspaceReadRequest', {}, []),
  workspaceReadResponse: response('workspace/response', 'WorkspaceReadResponse', {
    rootPath: text,
    status: text,
    workspace: workspaceSummary,
    migrationRequired: { type: 'boolean' },
    schemaVersion: text,
    revision: text,
    compatibility: { type: 'object', additionalProperties: true },
    nextActions: { type: 'array', items: text },
  }, ['rootPath', 'workspace']),
  metadataUpdateRequest: response('metadata-update/request', 'WorkspaceMetadataUpdateRequest', {
    revision: text,
    name: text,
    description: text,
  }, ['revision']),
  projectMetadataUpdateRequest: response('project-metadata-update/request', 'ProjectMetadataUpdateRequest', {
    revision: text,
    name: text,
    description: text,
  }, ['revision']),
  serviceMetadataUpdateRequest: response('service-metadata-update/request', 'ServiceMetadataUpdateRequest', {
    revision: text,
    name: text,
    description: text,
    type: text,
  }, ['revision']),
  projectReadResponse: response('project/response', 'ProjectHttpResponse', {
    schemaVersion: text,
    revision: text,
    migrationRequired: { type: 'boolean' },
    project: projectEntity,
    projects: { type: 'array', items: projectEntity },
    services: { type: 'array', items: serviceEntity },
    service: serviceEntity,
    nextActions: { type: 'array', items: text },
    sourceLocation,
    observed: { type: ['object', 'null'], additionalProperties: true },
    comparison: { type: 'object', additionalProperties: true },
  }, ['schemaVersion']),
  documentResponse: response('document/response', 'WorkspaceDocumentResponse', {
    schemaVersion: text,
    path: text,
    name: text,
    entry: { type: 'boolean' },
    exists: { type: 'boolean' },
    content: { type: ['string', 'null'] },
  }, ['schemaVersion', 'path', 'name', 'entry', 'exists', 'content']),
  errorResponse: response('error/response', 'WorkspaceErrorResponse', {
    error: closed({ code: text, message: text, details: {} }, ['code', 'message']),
  }, ['error']),
});

export const WORKSPACE_HTTP_OPERATIONS = Object.freeze([
  ['workspace.registry.list', 'GET', '/workspaces', 'registryRequest', 'registryResponse'],
  ['workspace.registry.register', 'POST', '/workspaces', 'registerRequest', 'registryResponse'],
  ['workspace.registry.pick', 'POST', '/workspaces/pick', 'pickRequest', 'pickResponse'],
  ['workspace.registry.remove', 'DELETE', '/workspaces', 'removeRequest', 'registryResponse'],
  ['workspace.read', 'GET', '/workspace', 'workspaceReadRequest', 'workspaceReadResponse'],
  ['workspace.update', 'PUT', '/workspace', 'metadataUpdateRequest', 'workspaceReadResponse'],
  ['project.list', 'GET', '/projects', 'workspaceReadRequest', 'projectReadResponse'],
  ['project.detail', 'GET', '/projects/:projectCode', 'workspaceReadRequest', 'projectReadResponse'],
  ['project.update', 'PUT', '/projects/:projectCode', 'projectMetadataUpdateRequest', 'projectReadResponse'],
  ['service.list', 'GET', '/projects/:projectCode/services', 'workspaceReadRequest', 'projectReadResponse'],
  ['service.detail', 'GET', '/projects/:projectCode/services/:serviceCode', 'workspaceReadRequest', 'projectReadResponse'],
  ['service.update', 'PUT', '/projects/:projectCode/services/:serviceCode', 'serviceMetadataUpdateRequest', 'projectReadResponse'],
].map(([id, method, path, request, success]) => Object.freeze({
  id,
  method,
  path,
  requestSchemaId: WORKSPACE_HTTP_SCHEMAS[request].$id,
  successSchemaId: WORKSPACE_HTTP_SCHEMAS[success].$id,
  errorSchemaId: WORKSPACE_HTTP_SCHEMAS.errorResponse.$id,
})));

export const WORKSPACE_HTTP_VALIDATORS = compileJsonSchemaCatalog(Object.values(WORKSPACE_HTTP_SCHEMAS));

export function validateWorkspaceHttp(schemaId, value, operationId, phase = 'request') {
  const result = WORKSPACE_HTTP_VALIDATORS.validate(schemaId, value);
  if (result.valid) return value;
  const error = new Error(`Workspace HTTP ${phase} DTO 不符合契约：${operationId}。`);
  error.code = phase === 'request' ? 'workspace_http_request_invalid' : 'workspace_http_response_invalid';
  error.status = 400;
  error.details = { operationId, schemaId, errors: result.errors };
  throw error;
}

export function workspaceOperation(operationId) {
  const operation = WORKSPACE_HTTP_OPERATIONS.find((item) => item.id === operationId);
  if (!operation) throw new Error(`Workspace HTTP operation 未注册：${operationId}`);
  return operation;
}
