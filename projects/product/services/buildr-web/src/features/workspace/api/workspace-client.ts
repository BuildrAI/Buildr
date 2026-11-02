import { sharedJsonRead } from '../../../api/shared-json-read.ts';
import type { ApiClient } from '../../../api';
import type { WorkspaceMetadataUpdateRequestMetadataUpdateRequest, WorkspacePickResponsePickResponse, WorkspaceRegistryResponseRegistryResponse, WorkspaceReadResponseWorkspaceReadResponse, WorkspaceCompositionWorkspaceCompositionResponse } from '../../../../build/generated/workspace-http-dto';
export type WorkspaceRegistry = WorkspaceRegistryResponseRegistryResponse;
export type WorkspaceCompositionResponse = WorkspaceCompositionWorkspaceCompositionResponse;
export type WorkspaceResponse = WorkspaceReadResponseWorkspaceReadResponse;
type ReadOptions = Pick<RequestInit, 'signal'>;

export function createWorkspaceClient(api: ApiClient) {
  const shared = sharedJsonRead(<T,>(url:string,signal:AbortSignal) => api(url,{signal}) as Promise<T>);
  const mutate = async (url:string, options:RequestInit) => {
    shared.invalidate(); try {return await api(url,options);} finally {shared.invalidate();}
  };
  return {
    composition(options: ReadOptions = {}): Promise<WorkspaceCompositionResponse> { return api('/api/v1/workspace-composition', options) as Promise<WorkspaceCompositionResponse>; },
    workspaceCreatePrompt(input: { name: string; description: string; targetPath: string }): Promise<{ prompt: string }> {
      return api('/api/v1/prompts/workspace-create', { method: 'POST', body: JSON.stringify(input) }) as Promise<{ prompt: string }>;
    },
    listRegistered(options:ReadOptions={}): Promise<WorkspaceRegistry> {
      return shared<WorkspaceRegistry>('/api/v1/workspaces',options.signal);
    },
    register(input: { rootPath: string; revision: string; open?: boolean }): Promise<WorkspaceRegistry> {
      return mutate('/api/v1/workspaces', { method: 'POST', body: JSON.stringify(input) }) as Promise<WorkspaceRegistry>;
    },
    pick(input: { revision: string }): Promise<WorkspacePickResponsePickResponse> {
      return mutate('/api/v1/workspaces/pick', { method: 'POST', body: JSON.stringify(input) }) as Promise<WorkspacePickResponsePickResponse>;
    },
    remove(input: { revision: string; rootPath?: string; workspaceId?: string }): Promise<WorkspaceRegistry> {
      return mutate('/api/v1/workspaces', { method: 'DELETE', body: JSON.stringify(input) }) as Promise<WorkspaceRegistry>;
    },
    read(options: ReadOptions = {}): Promise<WorkspaceResponse> {
      return api('/api/v1/workspace', options) as Promise<WorkspaceResponse>;
    },
    readById(workspaceId: string, options: ReadOptions = {}): Promise<WorkspaceResponse> {
      return api(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}`, options) as Promise<WorkspaceResponse>;
    },
    update(input: WorkspaceMetadataUpdateRequestMetadataUpdateRequest): Promise<WorkspaceResponse> {
      return mutate('/api/v1/workspace', { method: 'PUT', body: JSON.stringify(input) }) as Promise<WorkspaceResponse>;
    },
    updateById(workspaceId: string, input: WorkspaceMetadataUpdateRequestMetadataUpdateRequest): Promise<WorkspaceResponse> {
      return mutate(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}`, { method: 'PUT', body: JSON.stringify(input) }) as Promise<WorkspaceResponse>;
    },
  };
}
