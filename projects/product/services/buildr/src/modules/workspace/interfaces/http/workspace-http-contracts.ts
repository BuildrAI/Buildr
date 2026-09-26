import { compileJsonSchemaCatalog } from '../../../../infrastructure/contracts/json-schema-validator.ts';

const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
const ROOT = 'https://schemas.buildr.ai/http/workspace';
const text = { type: 'string', minLength: 1 };
const closed = (properties: any, required: any = []) => ({
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
    code: text, name: text, description: { type: 'string' }, type: text, source: sourceEntity,
  },
};
const registryEntry = closed({ status: text, rootPath: text, updatedAt: text, workspace: { anyOf: [workspaceSummary, { type: 'null' }] }, error: { anyOf: [closed({ code: text, message: text }, ['message']), { type: 'null' }] }, migrationRequired: { type: 'boolean' } }, ['status', 'rootPath']);
const registryProjection = closed({ schemaVersion: text, revision: text, workspaces: { type: 'array', items: registryEntry }, lastOpenedWorkspaceId: { type: ['string', 'null'] } }, ['schemaVersion', 'revision', 'workspaces', 'lastOpenedWorkspaceId']);
const response = (id: any, title: any, properties: any, required: any) => Object.freeze({
  $schema: DRAFT_2020_12,
  $id: `${ROOT}/${id}/v1`,
  title,
  ...closed(properties, required),
});

const plainText = { type: 'string' };
const stringIds = { type: 'array', items: text, uniqueItems: true };
const repositoryDraft = closed({ code: text, name: text, description: plainText, url: { type: 'string' }, remote: text, integrationBranch: { type: 'string' }, path: text, observation: text }, ['code']);
const serviceDraft = closed({ code: text, name: text, description: plainText, type: text, repositoryId: text, modulePath: plainText, repository: repositoryDraft, directoryMode: { enum: ['create', 'existing'] }, directoryPath: text, directoryObservation: text, projectCode: text }, ['code', 'name']);
const businessService = closed({ id: text, workspaceId: text, code: text, name: text, description: plainText, type: text, repositoryId: text, modulePath: plainText, legacyRefs: stringIds }, ['id', 'workspaceId', 'code', 'name', 'description', 'type', 'repositoryId', 'modulePath']);
const repositoryInstance = closed({ id: text, workspaceId: text, code: text, name: text, description: plainText, source: sourceEntity, location: text, available: { type: 'boolean' }, present: { type: 'boolean' }, observed: { type: ['object', 'null'], additionalProperties: true } }, ['id', 'workspaceId', 'code', 'name', 'description', 'source']);

const compositionItem = {id:text,code:text,name:text,description:plainText};
const compositionStatus = {type:'string',enum:['complete','partial','unavailable']};

export const WORKSPACE_HTTP_SCHEMAS: Readonly<Record<string, any>> = Object.freeze({
  workspaceCompositionResponse: response('workspace-composition/response','WorkspaceComposition',{schemaVersion:text,workspaceId:text,projects:{type:'array',items:closed({...compositionItem,serviceIds:stringIds},['id','code','name','description','serviceIds'])},services:{type:'array',items:closed({...compositionItem,repositoryId:text},['id','code','name','description','repositoryId'])},repositories:{type:'array',items:closed(compositionItem,['id','code','name','description'])},sources:closed({projects:compositionStatus,services:compositionStatus,repositories:compositionStatus},['projects','services','repositories']),diagnostics:{type:'array',items:closed({source:{enum:['projects','services','repositories']},message:text},['source','message'])}},['schemaVersion','workspaceId','projects','services','repositories','sources','diagnostics']),
  assetCatalogResponse: response('asset-catalog/response', 'AssetCatalog', { schemaVersion: text, revision: text, migrationRequired: { type: 'boolean' }, projects: { type: 'array', items: { ...projectEntity, properties: { ...projectEntity.properties, serviceIds: stringIds } } }, services: { type: 'array', items: businessService }, repositories: { type: 'array', items: repositoryInstance }, diagnostics: { type: 'array', items: closed({ code: text, message: text, objectId: text }, ['code', 'message', 'objectId']) } }, ['schemaVersion', 'revision', 'migrationRequired', 'projects', 'services', 'repositories', 'diagnostics']),
  assetServicesResponse: response('services/list', 'AssetServices', { revision: text, migrationRequired: { type: 'boolean' }, services: { type: 'array', items: closed({ ...businessService.properties, projects: { type: 'array', items: closed({ id: text, code: text, name: text }, ['id', 'code', 'name']) }, repository: { anyOf: [closed({ id: text, code: text, name: text }, ['id', 'code', 'name']), { type: 'null' }] } }, [...businessService.required, 'projects', 'repository']) } }, ['revision', 'migrationRequired', 'services']),
  assetRepositoriesResponse: response('repositories/list', 'AssetRepositories', { revision: text, migrationRequired: { type: 'boolean' }, repositories: { type: 'array', items: closed({ ...repositoryInstance.properties, serviceCount: { type: 'integer' } }, [...repositoryInstance.required, 'serviceCount']) } }, ['revision', 'migrationRequired', 'repositories']),
  assetRepositoryLocalConfigResponse: response('repositories/local-config', 'AssetRepositoryLocalConfig', { revision: text, id: text, available: { type: 'boolean' }, remotes: { type: 'array', items: closed({ name: text, url: text }, ['name', 'url']) }, selectedRemote: { type: ['string', 'null'] }, currentBranch: { type: ['string', 'null'] }, diagnostic: { type: ['string', 'null'] } }, ['revision', 'id', 'available', 'remotes', 'selectedRemote', 'currentBranch', 'diagnostic']),
  assetRepositoryStatusResponse: response('repositories/status', 'AssetRepositoryStatus', { revision: text, id: text, available: { type: 'boolean' }, alignment: { type: 'string', enum: ['ready', 'pending'] }, observed: { type: 'object', additionalProperties: true }, diagnostic: { type: ['string', 'null'] } }, ['revision', 'id', 'available', 'alignment', 'observed', 'diagnostic']),
  assetDeleteRequest: response('asset-catalog/delete', 'AssetDelete', { revision: text }, ['revision']),
  assetMigrateRequest: response('asset-catalog/migrate', 'AssetMigrate', { revision: text, codeMappings: { type: 'object', additionalProperties: text } }, ['revision']),
  assetRepositoryRequest: response('asset-catalog/repository-create', 'RepositoryCreate', { ...repositoryDraft.properties, revision: text }, ['revision', 'code']),
  assetServiceRequest: response('asset-catalog/service-create', 'ServiceCreate', { revision: text, service: serviceDraft, projectId: text }, ['revision', 'service']),
  assetProjectRequest: response('asset-catalog/project-create', 'ProjectCreate', { revision: text, code: text, name: text, description: plainText, serviceIds: stringIds, newServices: { type: 'array', items: serviceDraft } }, ['revision', 'code', 'name']),
  projectCandidatesResponse: response('asset-catalog/project-candidates', 'ProjectCandidates', { revision: text, candidates: { type: 'array', items: closed({ code: text, path: text, observation: text, source: sourceEntity }, ['code', 'path', 'observation', 'source']) }, diagnostics: { type: 'array', items: closed({ code: text, path: text, message: text }, ['code', 'path', 'message']) } }, ['revision', 'candidates', 'diagnostics']),
  directoryCandidatesResponse: response('asset-catalog/directory-candidates', 'DirectoryCandidates', { revision: text, candidates: { type: 'array', items: closed({ path: text, code: text, observation: text, projectCode: text, url: plainText }, ['path', 'code', 'observation']) }, diagnostics: { type: 'array', items: closed({ code: text, path: text, message: text }, ['code', 'path', 'message']) } }, ['revision', 'candidates', 'diagnostics']),
  projectRegisterRequest: response('asset-catalog/project-register', 'ProjectRegister', { revision: text, code: text, name: text, description: plainText, serviceIds: stringIds, observation: text }, ['revision', 'code', 'name', 'observation']),
  assetAssociateRequest: response('asset-catalog/associate', 'ProjectServices', { revision: text, serviceIds: stringIds, newServices: { type: 'array', items: serviceDraft } }, ['revision', 'serviceIds']),
  assetUpdateRequest: response('asset-catalog/update', 'AssetUpdate', { revision: text, name: text, description: plainText, type: text, repositoryId: text, modulePath: plainText, repository: repositoryDraft, url: plainText, remote: plainText, integrationBranch: plainText, path: text }, ['revision']),
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
  ['assets.services.list', 'GET', '/services', 'workspaceReadRequest', 'assetServicesResponse'],
  ['assets.repositories.list', 'GET', '/repositories', 'workspaceReadRequest', 'assetRepositoriesResponse'],
  ['assets.repository.local-config', 'GET', '/repositories/:id/local-config', 'workspaceReadRequest', 'assetRepositoryLocalConfigResponse'],
  ['assets.repository.status', 'GET', '/repositories/:id/status', 'workspaceReadRequest', 'assetRepositoryStatusResponse'],
  ['assets.normalize', 'POST', '/asset-catalog/normalize', 'assetDeleteRequest', 'assetCatalogResponse'],
  ['assets.delete', 'DELETE', '/asset-catalog/:kind/:id', 'assetDeleteRequest', 'assetCatalogResponse'],
  ['workspace.composition', 'GET', '/workspace-composition', 'workspaceReadRequest', 'workspaceCompositionResponse'],
  ['assets.read', 'GET', '/asset-catalog', 'workspaceReadRequest', 'assetCatalogResponse'],
  ['assets.migrate', 'POST', '/asset-catalog/migrate', 'assetMigrateRequest', 'assetCatalogResponse'],
  ['assets.repositories.create', 'POST', '/asset-catalog/repositories', 'assetRepositoryRequest', 'assetCatalogResponse'],
  ['assets.services.create', 'POST', '/asset-catalog/services', 'assetServiceRequest', 'assetCatalogResponse'],
  ['assets.projects.create', 'POST', '/asset-catalog/projects', 'assetProjectRequest', 'assetCatalogResponse'],
  ['assets.services.candidates', 'GET', '/asset-catalog/service-candidates', 'workspaceReadRequest', 'directoryCandidatesResponse'],
  ['assets.repositories.candidates', 'GET', '/asset-catalog/repository-candidates', 'workspaceReadRequest', 'directoryCandidatesResponse'],
  ['assets.projects.candidates', 'GET', '/asset-catalog/project-candidates', 'workspaceReadRequest', 'projectCandidatesResponse'],
  ['assets.projects.register', 'POST', '/asset-catalog/projects/register', 'projectRegisterRequest', 'assetCatalogResponse'],
  ['assets.associate', 'PUT', '/asset-catalog/projects/:projectId/services', 'assetAssociateRequest', 'assetCatalogResponse'],
  ['assets.update', 'PUT', '/asset-catalog/:kind/:id', 'assetUpdateRequest', 'assetCatalogResponse'],
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
].map(([id, method, path, request, success]: any) => Object.freeze({
  id,
  method,
  path,
  requestSchemaId: WORKSPACE_HTTP_SCHEMAS[request].$id,
  successSchemaId: WORKSPACE_HTTP_SCHEMAS[success].$id,
  errorSchemaId: WORKSPACE_HTTP_SCHEMAS.errorResponse.$id,
})));

export const WORKSPACE_HTTP_VALIDATORS = compileJsonSchemaCatalog(Object.values(WORKSPACE_HTTP_SCHEMAS));

export function validateWorkspaceHttp(schemaId: any, value: any, operationId: any, phase: any = 'request') {
  const result = WORKSPACE_HTTP_VALIDATORS.validate(schemaId, value);
  if (result.valid) return value;
  const error: Error & Record<string, any> = new Error(`Workspace HTTP ${phase} DTO 不符合契约：${operationId}。`);
  error.code = phase === 'request' ? 'workspace_http_request_invalid' : 'workspace_http_response_invalid';
  error.status = 400;
  error.details = { operationId, schemaId, errors: result.errors };
  throw error;
}

export function workspaceOperation(operationId: any) {
  const operation = WORKSPACE_HTTP_OPERATIONS.find((item: any) => item.id === operationId);
  if (!operation) throw new Error(`Workspace HTTP operation 未注册：${operationId}`);
  return operation;
}
