import { api, type ApiClient } from '../../../api';
import type { WorkspaceMetadataUpdateRequestMetadataUpdateRequest, WorkspacePickResponsePickResponse, WorkspaceRegistryResponseRegistryResponse, WorkspaceReadResponseWorkspaceReadResponse } from '../../../../build/generated/workspace-http-dto';
export type WorkspaceRegistry = WorkspaceRegistryResponseRegistryResponse;
export type WorkspaceResponse = WorkspaceReadResponseWorkspaceReadResponse;
type ReadOptions = Pick<RequestInit, 'signal'>;

export function createWorkspaceClient(api: ApiClient) {
  return {
    workspaceCreatePrompt(input: { name: string; description: string; targetPath: string }): Promise<{ prompt: string }> {
      return api('/api/v1/prompts/workspace-create', { method: 'POST', body: JSON.stringify(input) }) as Promise<{ prompt: string }>;
    },
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
    read(options: ReadOptions = {}): Promise<WorkspaceResponse> {
      return api('/api/v1/workspace', options) as Promise<WorkspaceResponse>;
    },
    update(input: WorkspaceMetadataUpdateRequestMetadataUpdateRequest): Promise<WorkspaceResponse> {
      return api('/api/v1/workspace', { method: 'PUT', body: JSON.stringify(input) }) as Promise<WorkspaceResponse>;
    },
  };
}

export const workspaceApi = createWorkspaceClient(api);
