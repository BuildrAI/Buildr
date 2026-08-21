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
  return Object.freeze({
    id: 'workspace-core.http',
    async handleTopLevel({ request, pathname, authorizeWrite, readJsonBody, pickWorkspaceDirectory }) {
      if (request.method === 'GET' && pathname === '/api/v1/workspaces') return ok(application.listRegisteredWorkspaces());
      if (request.method === 'POST' && pathname === '/api/v1/workspaces') {
        authorizeWrite();
        return ok(application.registerLocalWorkspace(await readJsonBody()));
      }
      if (request.method === 'POST' && pathname === '/api/v1/workspaces/pick') {
        authorizeWrite();
        const input = await readJsonBody();
        const rootPath = pickWorkspaceDirectory();
        return ok(rootPath ? application.inspectLocalWorkspaceCandidate(rootPath, input.revision) : { canceled: true });
      }
      if (request.method === 'DELETE' && pathname === '/api/v1/workspaces') {
        authorizeWrite();
        return ok(application.removeRegisteredWorkspace(await readJsonBody()));
      }
      const removeMatch = pathname.match(new RegExp(`^/api/v1/workspaces/(${WORKSPACE_ID})$`));
      if (request.method === 'DELETE' && removeMatch) {
        authorizeWrite();
        return ok(application.removeRegisteredWorkspace({ ...(await readJsonBody()), workspaceId: removeMatch[1] }));
      }
      if (request.method === 'POST' && pathname === '/api/v1/prompts/workspace-create') {
        authorizeWrite();
        return ok(application.generateWorkspaceCreatePrompt(await readJsonBody()));
      }
      return null;
    },
    async handle({ request, suffix, searchParams, root, authorizeWrite, readJsonBody }) {
      if (request.method === 'GET' && suffix === '') return ok(application.getWorkspace(root));
      if (request.method === 'GET' && suffix === '/getting-started') return ok(application.getWorkspaceGettingStarted(root));
      if (request.method === 'PUT' && suffix === '') {
        authorizeWrite();
        return ok(application.updateWorkspaceMetadata(root, await readJsonBody()));
      }
      if (request.method === 'GET' && suffix === '/projects') return ok(application.listProjects(root));

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
      if (request.method === 'GET' && projectMatch) return ok(application.projectDetail(root, projectMatch[1]));
      if (request.method === 'PUT' && projectMatch) {
        authorizeWrite();
        return ok(application.updateProjectMetadata(root, projectMatch[1], await readJsonBody()));
      }
      const projectDocumentMatch = suffix.match(new RegExp(`^/projects/(${CODE})/documents/(.+)$`));
      if (request.method === 'GET' && projectDocumentMatch) {
        return ok(application.projectDocument(root, projectDocumentMatch[1], decodeDocumentPath(projectDocumentMatch[2], 'project')));
      }
      const servicesMatch = suffix.match(new RegExp(`^/projects/(${CODE})/services$`));
      if (request.method === 'GET' && servicesMatch) return ok(application.listServices(root, servicesMatch[1]));
      const serviceDocumentMatch = suffix.match(new RegExp(`^/projects/(${CODE})/services/(${CODE})/documents/(.+)$`));
      if (request.method === 'GET' && serviceDocumentMatch) {
        return ok(application.serviceDocument(root, serviceDocumentMatch[1], serviceDocumentMatch[2], decodeDocumentPath(serviceDocumentMatch[3], 'service')));
      }
      const serviceMatch = suffix.match(new RegExp(`^/projects/(${CODE})/services/(${CODE})$`));
      if (request.method === 'GET' && serviceMatch) return ok(application.serviceDetail(root, serviceMatch[1], serviceMatch[2]));
      if (request.method === 'PUT' && serviceMatch) {
        authorizeWrite();
        return ok(application.updateServiceMetadata(root, serviceMatch[1], serviceMatch[2], await readJsonBody()));
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
