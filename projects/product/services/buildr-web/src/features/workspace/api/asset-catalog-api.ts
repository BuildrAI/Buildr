import type { WorkspaceDocument } from '../../../api/client';
import { api } from '../../../api';
import type { AssetServicesAssetServicesResponse, AssetRepositoriesAssetRepositoriesResponse, AssetRepositoryStatusAssetRepositoryStatusResponse, AssetCatalogAssetCatalogResponse, AssetUpdateAssetUpdateRequest, ProjectCreateAssetProjectRequest, ProjectServicesAssetAssociateRequest, ServiceCreateAssetServiceRequest, RepositoryCreateAssetRepositoryRequest } from '../../../../build/generated/workspace-http-dto';
export type AssetCatalog = AssetCatalogAssetCatalogResponse;
export type CatalogService = AssetCatalog['services'][number];
export type CatalogRepository = AssetCatalog['repositories'][number];
export type CatalogProject = AssetCatalog['projects'][number];
export type ServiceDraft = ServiceCreateAssetServiceRequest['service'];
export type RepositoryDraft = Omit<RepositoryCreateAssetRepositoryRequest, 'revision'>;
export type AssetKind = 'project' | 'service' | 'repository';
const base = '/api/v1/asset-catalog';
export const catalogChanged = 'buildr:asset-catalog-changed';
async function write(path: string, method: string, input: unknown): Promise<AssetCatalog> {
  const result = await api(base + path, { method, body: JSON.stringify(input) }) as AssetCatalog;
  window.dispatchEvent(new CustomEvent(catalogChanged, { detail: result }));
  return result;
}
export const assetCatalogApi = {
  services: (signal?: AbortSignal) => api('/api/v1/services', { signal }) as Promise<AssetServicesAssetServicesResponse>,
  repositories: (signal?: AbortSignal) => api('/api/v1/repositories', { signal }) as Promise<AssetRepositoriesAssetRepositoriesResponse>,
  status: (id: string) => api(`/api/v1/repositories/${encodeURIComponent(id)}/status`) as Promise<AssetRepositoryStatusAssetRepositoryStatusResponse>,
  remove: (kind: 'project' | 'service', id: string, revision: string) => write(`/${kind}/${encodeURIComponent(id)}`, 'DELETE', { revision }),
  normalize: (revision: string) => write('/normalize', 'POST', { revision }),
  serviceDocument: (id: string, file: string) => api(`${base}/services/${encodeURIComponent(id)}/documents/${encodeURIComponent(file)}`) as Promise<WorkspaceDocument>,
  read: (signal?: AbortSignal) => api(base, { signal }) as Promise<AssetCatalog>,
  migrate: (revision: string) => write('/migrate', 'POST', { revision }),
  project: (input: ProjectCreateAssetProjectRequest) => write('/projects', 'POST', input),
  service: (input: ServiceCreateAssetServiceRequest) => write('/services', 'POST', input),
  repository: (input: RepositoryCreateAssetRepositoryRequest) => write('/repositories', 'POST', input),
  associate: (id: string, input: ProjectServicesAssetAssociateRequest) => write(`/projects/${encodeURIComponent(id)}/services`, 'PUT', input),
  update: (kind: AssetKind, id: string, input: AssetUpdateAssetUpdateRequest) => write(`/${kind}/${encodeURIComponent(id)}`, 'PUT', input),
  preparePrompt: (id: string) => api(`${base}/repositories/${encodeURIComponent(id)}/prepare-prompt`) as Promise<{ prompt: string }>,
};
export function repositoryBranch(repository: CatalogRepository): string {
  const git = repository.source.git as { integrationBranch?: string } | undefined;
  return git?.integrationBranch || '未指定集成分支';
}
