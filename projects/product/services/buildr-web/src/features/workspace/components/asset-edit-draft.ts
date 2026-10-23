import type { AssetCatalog, AssetKind } from '../api/asset-catalog-api';

export function assetEditDraft(catalog: AssetCatalog, kind: AssetKind, id: string) {
  const item = (kind === 'project' ? catalog.projects : kind === 'service' ? catalog.services : catalog.repositories).find(item => item.id === id);
  if (!item) return null;
  const service = catalog.services.find(item => item.id === id);
  const project = catalog.projects.find(item => item.id === id);
  const repository = catalog.repositories.find(item => item.id === id);
  const git = repository?.source.git as { url?: string; remote?: string; integrationBranch?: string } | undefined;
  return {
    code: item.code, name: item.name, description: item.description, type: service?.type || 'service', repositoryId: service?.repositoryId, modulePath: service?.modulePath || '',
    projectIds: service ? catalog.projects.filter(entry => entry.serviceIds?.includes(service.id)).map(entry => entry.id) : [],
    serviceIds: project ? project.serviceIds ?? [] : repository ? catalog.services.filter(entry => entry.repositoryId === repository.id).map(entry => entry.id) : [],
    path: repository?.source.path || '.', url: git?.url || '', remote: git?.remote || 'origin',
    integrationBranch: String(repository?.source.integrationBranch || git?.integrationBranch || ''),
  };
}
