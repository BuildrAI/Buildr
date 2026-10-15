import { api, type ApiClient } from '../../../api';
import type { ProjectHttpResponseProjectReadResponse } from '../../../../build/generated/workspace-http-dto';
import type { WorkspaceDocument } from '../../../api/client';
import { markdownImageQuery, type MarkdownImageContext } from '../../../lib/markdownImages';
export type ProjectResponse = ProjectHttpResponseProjectReadResponse;
export type ProjectDocument = WorkspaceDocument & { imageContext?: MarkdownImageContext };
export type ProjectMetadataUpdate = { revision: string; name?: string; description?: string };
type ReadOptions = Pick<RequestInit, 'signal'>;

export function projectDocumentImage(workspaceId: string | null, projectCode: string, documentPath: string, href: string, context?: MarkdownImageContext | null): string | null {
  if (!workspaceId || !projectCode) return null;
  const query = markdownImageQuery(documentPath, href, context);
  if (!query) return null;
  query.set('documentPath', documentPath);
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectCode)}/document-image?${query}`;
}

export function createProjectClient(api: ApiClient) {
  return {
    projectCreatePrompt(input: Record<string, string>): Promise<{ prompt: string }> {
      return api('/api/v1/prompts/project-create', { method: 'POST', body: JSON.stringify(input) }) as Promise<{ prompt: string }>;
    },
    listProjects(options: ReadOptions = {}, workspaceId?: string | null): Promise<ProjectResponse> {
      const prefix = workspaceId ? `/api/v1/workspaces/${encodeURIComponent(workspaceId)}` : '/api/v1';
      return api(`${prefix}/projects`, options) as Promise<ProjectResponse>;
    },
    project(projectCode: string): Promise<ProjectResponse> {
      return api(`/api/v1/projects/${encodeURIComponent(projectCode)}`) as Promise<ProjectResponse>;
    },
    updateProject(projectCode: string, input: ProjectMetadataUpdate): Promise<ProjectResponse> {
      return api(`/api/v1/projects/${encodeURIComponent(projectCode)}`, { method: 'PUT', body: JSON.stringify(input) }) as Promise<ProjectResponse>;
    },
    projectDocument(projectCode: string, documentPath: string, options: ReadOptions = {}, workspaceId?: string | null): Promise<ProjectDocument> {
      const prefix = workspaceId ? `/api/v1/workspaces/${encodeURIComponent(workspaceId)}` : '/api/v1';
      return api(`${prefix}/projects/${encodeURIComponent(projectCode)}/documents/${documentPath}`, options) as Promise<ProjectDocument>;
    },
  };
}

export const projectApi = createProjectClient(api);
