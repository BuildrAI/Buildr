import type { ApiClient } from './client';
import type {
  ProjectHttpResponseProjectReadResponse,
  WorkspaceMetadataUpdateRequestMetadataUpdateRequest,
  WorkspacePickResponsePickResponse,
  WorkspaceRegistryResponseRegistryResponse,
  WorkspaceReadResponseWorkspaceReadResponse,
} from './generated/workspace-http-dto';

export type WorkspaceRegistry = WorkspaceRegistryResponseRegistryResponse;
export type WorkspaceResponse = WorkspaceReadResponseWorkspaceReadResponse;
export type ProjectResponse = ProjectHttpResponseProjectReadResponse;
export type ProjectMetadataUpdate = { revision: string; name?: string; description?: string };
export type ServiceMetadataUpdate = { revision: string; name?: string; description?: string; type?: string };
export type WorkspaceDocument = { path?: string; name: string; exists: boolean; content: string | null };

export function createWorkspaceClient(api: ApiClient) {
  return {
    listRegistered(): Promise<WorkspaceRegistry> {
      return api('/api/v1/workspaces') as Promise<WorkspaceRegistry>;
    },
    register(input: { rootPath: string; revision: string; open?: boolean }): Promise<WorkspaceRegistry> {
      return api('/api/v1/workspaces', { method: 'POST', body: JSON.stringify(input) }) as Promise<WorkspaceRegistry>;
    },
    pick(input: { revision: string }): Promise<WorkspacePickResponsePickResponse> {
      return api('/api/v1/workspaces/pick', { method: 'POST', body: JSON.stringify(input) }) as Promise<WorkspacePickResponsePickResponse>;
    },
    remove(input: { revision: string; rootPath?: string; workspaceId?: string }): Promise<WorkspaceRegistry> {
      return api('/api/v1/workspaces', { method: 'DELETE', body: JSON.stringify(input) }) as Promise<WorkspaceRegistry>;
    },
    read(): Promise<WorkspaceResponse> {
      return api('/api/v1/workspace') as Promise<WorkspaceResponse>;
    },
    update(input: WorkspaceMetadataUpdateRequestMetadataUpdateRequest): Promise<WorkspaceResponse> {
      return api('/api/v1/workspace', { method: 'PUT', body: JSON.stringify(input) }) as Promise<WorkspaceResponse>;
    },
    listProjects(): Promise<ProjectResponse> {
      return api('/api/v1/projects') as Promise<ProjectResponse>;
    },
    project(projectCode: string): Promise<ProjectResponse> {
      return api(`/api/v1/projects/${encodeURIComponent(projectCode)}`) as Promise<ProjectResponse>;
    },
    updateProject(projectCode: string, input: ProjectMetadataUpdate): Promise<ProjectResponse> {
      return api(`/api/v1/projects/${encodeURIComponent(projectCode)}`, { method: 'PUT', body: JSON.stringify(input) }) as Promise<ProjectResponse>;
    },
    projectDocument(projectCode: string, documentPath: string): Promise<WorkspaceDocument> {
      return api(`/api/v1/projects/${encodeURIComponent(projectCode)}/documents/${documentPath}`) as Promise<WorkspaceDocument>;
    },
    services(projectCode: string): Promise<ProjectResponse> {
      return api(`/api/v1/projects/${encodeURIComponent(projectCode)}/services`) as Promise<ProjectResponse>;
    },
    service(projectCode: string, serviceCode: string): Promise<ProjectResponse> {
      return api(`/api/v1/projects/${encodeURIComponent(projectCode)}/services/${encodeURIComponent(serviceCode)}`) as Promise<ProjectResponse>;
    },
    updateService(projectCode: string, serviceCode: string, input: ServiceMetadataUpdate): Promise<ProjectResponse> {
      return api(`/api/v1/projects/${encodeURIComponent(projectCode)}/services/${encodeURIComponent(serviceCode)}`, { method: 'PUT', body: JSON.stringify(input) }) as Promise<ProjectResponse>;
    },
    serviceDocument(projectCode: string, serviceCode: string, documentPath: string): Promise<WorkspaceDocument> {
      return api(`/api/v1/projects/${encodeURIComponent(projectCode)}/services/${encodeURIComponent(serviceCode)}/documents/${documentPath}`) as Promise<WorkspaceDocument>;
    },
  };
}
