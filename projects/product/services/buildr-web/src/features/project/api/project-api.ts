import { api, type ApiClient } from '../../../api';
import type { ProjectHttpResponseProjectReadResponse } from '../../../../build/generated/workspace-http-dto';
import type { WorkspaceDocument } from '../../../api/client';
export type ProjectResponse = ProjectHttpResponseProjectReadResponse;
export type ProjectMetadataUpdate = { revision: string; name?: string; description?: string };
type ReadOptions = Pick<RequestInit, 'signal'>;

export function createProjectClient(api: ApiClient) {
  return {
    projectCreatePrompt(input: Record<string, string>): Promise<{ prompt: string }> {
      return api('/api/v1/prompts/project-create', { method: 'POST', body: JSON.stringify(input) }) as Promise<{ prompt: string }>;
    },
    listProjects(options: ReadOptions = {}): Promise<ProjectResponse> {
      return api('/api/v1/projects', options) as Promise<ProjectResponse>;
    },
    project(projectCode: string): Promise<ProjectResponse> {
      return api(`/api/v1/projects/${encodeURIComponent(projectCode)}`) as Promise<ProjectResponse>;
    },
    updateProject(projectCode: string, input: ProjectMetadataUpdate): Promise<ProjectResponse> {
      return api(`/api/v1/projects/${encodeURIComponent(projectCode)}`, { method: 'PUT', body: JSON.stringify(input) }) as Promise<ProjectResponse>;
    },
    projectDocument(projectCode: string, documentPath: string, options: ReadOptions = {}): Promise<WorkspaceDocument> {
      return api(`/api/v1/projects/${encodeURIComponent(projectCode)}/documents/${documentPath}`, options) as Promise<WorkspaceDocument>;
    },
  };
}

export const projectApi = createProjectClient(api);
