import { WORKSPACE_HTTP_OPERATIONS, WORKSPACE_HTTP_SCHEMAS, validateWorkspaceHttp } from './workspace-http-contracts.mjs';

const WORKSPACE_ID = '[0-9a-fA-F-]{36}';
const CODE = '[A-Za-z0-9][A-Za-z0-9._-]*';
const TASK_ID = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';

function ok(body) {
  return { status: 200, body };
}

function decodeDocumentPath(value, kind) {
  try {
    return decodeURIComponent(value);
  } catch {
    const label = kind === 'project' ? '项目' : '服务';
    const error = new Error(`${label}文档路径无效。`);
    error.code = `${kind}_document_path_forbidden`;
    error.status = 400;
    throw error;
  }
}

export function createWorkspaceHttpContribution(application) {
  const operation = (id) => WORKSPACE_HTTP_OPERATIONS.find((item) => item.id === id);
  function validateRequest(id, value) {
    const item = operation(id);
    return validateWorkspaceHttp(item.requestSchemaId, value, id);
  }
  function validateResponse(id, value) {
    const item = operation(id);
    return validateWorkspaceHttp(item.successSchemaId, value, id, 'response');
  }
  const respond = (id, value) => ({ status: 200, body: validateResponse(id, value) });
  return Object.freeze({
    id: 'workspace-core.http',
    async handleTopLevel({ request, pathname, authorizeWrite, readJsonBody, pickWorkspaceDirectory }) {
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
    async handle({ request, suffix, searchParams, root, authorizeWrite, readJsonBody }) {
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
      if (request.method === 'GET' && suffix === '/projects') return respond('project.list', application.listProjects(root));

      const taskDailyProgressMatch = suffix.match(new RegExp(`^/tasks/(${TASK_ID})/daily-progress$`));
      if (request.method === 'GET' && taskDailyProgressMatch) return ok(application.inspectTaskDailyProgress(root, taskDailyProgressMatch[1]));

      const projectDailyProgressTodayMatch = suffix.match(new RegExp(`^/projects/(${CODE})/daily-progress$`));
      const projectDailyProgressDateMatch = suffix.match(new RegExp(`^/projects/(${CODE})/daily-progress/(\\d{4}-\\d{2}-\\d{2})$`));
      if (request.method === 'GET' && (projectDailyProgressTodayMatch || projectDailyProgressDateMatch)) {
        const extra = [...searchParams.keys()].filter((field) => field !== 'group');
        if (extra.length) {
          const error = new Error('每日演进 API 只接受 group query。');
          error.code = 'daily_progress_query_forbidden';
          error.status = 400;
          error.details = { field: extra[0] };
          throw error;
        }
        const project = (projectDailyProgressTodayMatch || projectDailyProgressDateMatch)[1];
        const date = projectDailyProgressDateMatch?.[2] || undefined;
        return ok(application.inspectProjectDailyProgress(root, {
          project,
          date,
          group: searchParams.get('group') || undefined,
        }));
      }

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
