import { WORKSPACE_HTTP_OPERATIONS, WORKSPACE_HTTP_SCHEMAS, validateWorkspaceHttp } from './workspace-http-contracts.ts';

const WORKSPACE_ID = '[0-9a-fA-F-]{36}';
const CODE = '[A-Za-z0-9][A-Za-z0-9._-]*';
const TASK_ID = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';

function ok(body: any) {
  return { status: 200, body };
}

function decodeDocumentPath(value: any, kind: any) {
  try {
    return decodeURIComponent(value);
  } catch {
    const label = kind === 'project' ? '项目' : '服务';
    const error: Error & Record<string, any> = new Error(`${label}文档路径无效。`);
    error.code = `${kind}_document_path_forbidden`;
    error.status = 400;
    throw error;
  }
}

export function createWorkspaceHttpContribution(application: any) {
  const operation = (id: any) => WORKSPACE_HTTP_OPERATIONS.find((item: any) => item.id === id);
  function validateRequest(id: any, value: any) {
    const item = operation(id);
    if (!item) throw new Error(`Workspace HTTP operation is missing: ${id}`);
    return validateWorkspaceHttp(item.requestSchemaId, value, id);
  }
  function validateResponse(id: any, value: any) {
    const item = operation(id);
    if (!item) throw new Error(`Workspace HTTP operation is missing: ${id}`);
    return validateWorkspaceHttp(item.successSchemaId, value, id, 'response');
  }
  const respond = (id: any, value: any) => ({ status: 200, body: validateResponse(id, value) });
  return Object.freeze({
    id: 'workspace-core.http',
    async handleTopLevel({ request, pathname, authorizeWrite, readJsonBody, pickWorkspaceDirectory }: any) {
      if (request.method === 'GET' && pathname === '/api/v1/workspaces') {
        validateRequest('workspace.registry.list', {});
        return respond('workspace.registry.list', application.listRegisteredWorkspaces());
      }
      if (request.method === 'POST' && pathname === '/api/v1/workspaces') {
        authorizeWrite();
        const input = validateRequest('workspace.registry.register', await readJsonBody());
        return respond('workspace.registry.register', application.registerLocalWorkspace(input));
      }
      if (request.method === 'POST' && pathname === '/api/v1/workspaces/pick') {
        authorizeWrite();
        const input = validateRequest('workspace.registry.pick', await readJsonBody());
        const rootPath = pickWorkspaceDirectory();
        return respond('workspace.registry.pick', rootPath ? application.inspectLocalWorkspaceCandidate(rootPath, input.revision) : { status: 'canceled', canceled: true });
      }
      if (request.method === 'DELETE' && pathname === '/api/v1/workspaces') {
        authorizeWrite();
        return respond('workspace.registry.remove', application.removeRegisteredWorkspace(validateRequest('workspace.registry.remove', await readJsonBody())));
      }
      const removeMatch = pathname.match(new RegExp(`^/api/v1/workspaces/(${WORKSPACE_ID})$`));
      if (request.method === 'DELETE' && removeMatch) {
        authorizeWrite();
        return respond('workspace.registry.remove', application.removeRegisteredWorkspace({ ...validateRequest('workspace.registry.remove', await readJsonBody()), workspaceId: removeMatch[1] }));
      }
      if (request.method === 'POST' && pathname === '/api/v1/prompts/workspace-create') {
        authorizeWrite();
        return ok(application.generateWorkspaceCreatePrompt(await readJsonBody()));
      }
      return null;
    },
    async handle({ request, suffix, searchParams, root, authorizeWrite, readJsonBody }: any) {
      if (request.method === 'GET' && suffix === '') {
        validateRequest('workspace.read', {});
        return respond('workspace.read', application.getWorkspace(root));
      }
      if (request.method === 'GET' && suffix === '/getting-started') return ok(application.getWorkspaceGettingStarted(root));
      if (request.method === 'PUT' && suffix === '') {
        authorizeWrite();
        application.updateWorkspaceMetadata(root, validateRequest('workspace.update', await readJsonBody()));
        return respond('workspace.update', application.getWorkspace(root));
      }
      if (request.method === 'GET' && suffix === '/services') return respond('assets.services.list', application.listCatalogServices(root));
      if (request.method === 'GET' && suffix === '/repositories') return respond('assets.repositories.list', application.listCatalogRepositories(root));
      const repositoryConfig = suffix.match(/^\/repositories\/([A-Za-z0-9._-]+)\/local-config$/);
      if (request.method === 'GET' && repositoryConfig) return respond('assets.repository.local-config', application.catalogRepositoryLocalConfig(root, repositoryConfig[1]));
      const repositoryStatus = suffix.match(/^\/repositories\/([A-Za-z0-9._-]+)\/status$/);
      if (request.method === 'GET' && repositoryStatus) return respond('assets.repository.status', application.catalogRepositoryStatus(root, repositoryStatus[1]));
      if (request.method === 'POST' && suffix === '/asset-catalog/normalize') {
        authorizeWrite();
        return respond('assets.normalize', application.normalizeCatalogRepositories(root, validateRequest('assets.normalize', await readJsonBody())));
      }
      const assetDelete = suffix.match(/^\/asset-catalog\/(project|service|repository)\/([A-Za-z0-9._-]+)$/);
      if (request.method === 'DELETE' && assetDelete) {
        authorizeWrite();
        return respond('assets.delete', application.deleteCatalogAsset(root, assetDelete[1], assetDelete[2], validateRequest('assets.delete', await readJsonBody())));
      }
      if (request.method === 'GET' && suffix === '/workspace-composition') return respond('workspace.composition', application.workspaceComposition(root));
      if (request.method === 'GET' && suffix === '/asset-catalog') return respond('assets.read', application.assetCatalog(root));
      if (request.method === 'GET' && suffix === '/asset-catalog/service-candidates') return respond('assets.services.candidates', application.listCatalogDirectoryCandidates(root, 'service'));
      if (request.method === 'GET' && suffix === '/asset-catalog/repository-candidates') return respond('assets.repositories.candidates', application.listCatalogDirectoryCandidates(root, 'repository'));
      if (request.method === 'GET' && suffix === '/asset-catalog/project-candidates') return respond('assets.projects.candidates', application.listProjectRegistrationCandidates(root));
      if (request.method === 'POST' && suffix === '/asset-catalog/projects/register') {
        authorizeWrite();
        return respond('assets.projects.register', application.registerCatalogProject(root, validateRequest('assets.projects.register', await readJsonBody())));
      }
      if (request.method === 'POST' && suffix === '/asset-catalog/migrate') {
        authorizeWrite();
        return respond('assets.migrate', application.migrateAssetCatalog(root, validateRequest('assets.migrate', await readJsonBody())));
      }
      const assetCreate = suffix.match(/^\/asset-catalog\/(projects|services|repositories)$/);
      if (request.method === 'POST' && assetCreate) {
        authorizeWrite();
        const kind = assetCreate[1];
        const id = `assets.${kind}.create`;
        const input = validateRequest(id, await readJsonBody());
        const method = kind === 'projects' ? 'createCatalogProject' : kind === 'services' ? 'createCatalogService' : 'createCatalogRepository';
        return respond(id, application[method](root, input));
      }
      const relationship = suffix.match(/^\/asset-catalog\/projects\/([A-Za-z0-9._-]+)\/services$/);
      if (request.method === 'PUT' && relationship) {
        authorizeWrite();
        return respond('assets.associate', application.updateProjectServices(root, relationship[1], validateRequest('assets.associate', await readJsonBody())));
      }
      const catalogDocument = suffix.match(/^\/asset-catalog\/services\/([A-Za-z0-9._-]+)\/documents\/(.+)$/);
      if (request.method === 'GET' && catalogDocument) return ok(application.catalogServiceDocument(root, catalogDocument[1], decodeDocumentPath(catalogDocument[2], 'service')));
      const assetUpdate = suffix.match(/^\/asset-catalog\/(project|service|repository)\/([A-Za-z0-9._-]+)$/);
      if (request.method === 'PUT' && assetUpdate) {
        authorizeWrite();
        return respond('assets.update', application.updateCatalogAsset(root, assetUpdate[1], assetUpdate[2], validateRequest('assets.update', await readJsonBody())));
      }
      const prepare = suffix.match(/^\/asset-catalog\/repositories\/([A-Za-z0-9._-]+)\/prepare-prompt$/);
      if (request.method === 'GET' && prepare) return ok(application.repositoryPreparePrompt(root, prepare[1]));
      if (request.method === 'GET' && suffix === '/projects') return respond('project.list', application.listProjects(root));

      const projectMatch = suffix.match(new RegExp(`^/projects/(${CODE})$`));
      if (request.method === 'GET' && projectMatch) return respond('project.detail', application.projectDetail(root, projectMatch[1]));
      if (request.method === 'PUT' && projectMatch) {
        authorizeWrite();
        return respond('project.update', application.updateProjectMetadata(root, projectMatch[1], validateRequest('project.update', await readJsonBody())));
      }
      const projectDocumentMatch = suffix.match(new RegExp(`^/projects/(${CODE})/documents/(.+)$`));
      if (request.method === 'GET' && projectDocumentMatch) {
        return ok(application.projectDocument(root, projectDocumentMatch[1], decodeDocumentPath(projectDocumentMatch[2], 'project')));
      }
      const servicesMatch = suffix.match(new RegExp(`^/projects/(${CODE})/services$`));
      if (request.method === 'GET' && servicesMatch) return respond('service.list', application.listServices(root, servicesMatch[1]));
      const serviceDocumentMatch = suffix.match(new RegExp(`^/projects/(${CODE})/services/(${CODE})/documents/(.+)$`));
      if (request.method === 'GET' && serviceDocumentMatch) {
        return ok(application.serviceDocument(root, serviceDocumentMatch[1], serviceDocumentMatch[2], decodeDocumentPath(serviceDocumentMatch[3], 'service')));
      }
      const serviceMatch = suffix.match(new RegExp(`^/projects/(${CODE})/services/(${CODE})$`));
      if (request.method === 'GET' && serviceMatch) return respond('service.detail', application.serviceDetail(root, serviceMatch[1], serviceMatch[2]));
      if (request.method === 'PUT' && serviceMatch) {
        authorizeWrite();
        return respond('service.update', application.updateServiceMetadata(root, serviceMatch[1], serviceMatch[2], validateRequest('service.update', await readJsonBody())));
      }
      if (request.method === 'POST' && suffix === '/prompts/project-create') {
        authorizeWrite();
        return ok(application.generateProjectCreatePrompt(await readJsonBody()));
      }
      if (request.method === 'POST' && suffix === '/prompts/service-create') {
        authorizeWrite();
        return ok(application.generateServiceCreatePrompt(root, await readJsonBody()));
      }
      if (request.method === 'POST' && suffix === '/prompts/start-work') {
        authorizeWrite();
        return ok(application.generateStartWorkPrompt(root, await readJsonBody()));
      }
      return null;
    },
  });
}
