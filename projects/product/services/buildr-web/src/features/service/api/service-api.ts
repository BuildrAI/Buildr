import { api, type ApiClient } from '../../../api';
import type { ProjectHttpResponseProjectReadResponse as ProjectResponse } from '../../../../build/generated/workspace-http-dto';
import type { WorkspaceDocument } from '../../../api/client';
export type ServiceMetadataUpdate = { revision: string; name?: string; description?: string; type?: string };
type ReadOptions = Pick<RequestInit, 'signal'>;

export function createServiceClient(api: ApiClient) {
  return {
    serviceCreatePrompt(input: Record<string, string>): Promise<{ prompt: string }> {
      return api('/api/v1/prompts/service-create', { method: 'POST', body: JSON.stringify(input) }) as Promise<{ prompt: string }>;
    },
    services(projectCode: string, options: ReadOptions = {}): Promise<ProjectResponse> {
      return api(`/api/v1/projects/${encodeURIComponent(projectCode)}/services`, options) as Promise<ProjectResponse>;
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

export const serviceApi = createServiceClient(api);
