import type { AssetCatalog, AssetKind } from '../api/asset-catalog-api';

export function assetEditDraft(catalog: AssetCatalog, kind: AssetKind, id: string) {
  const item = (kind === 'project' ? catalog.projects : kind === 'service' ? catalog.services : catalog.repositories).find(item => item.id === id);
  if (!item) return null;
  const service = catalog.services.find(item => item.id === id);
  const repository = catalog.repositories.find(item => item.id === id);
  const git = repository?.source.git as { url?: string; remote?: string; integrationBranch?: string } | undefined;
  return {
    name: item.name, description: item.description, repositoryId: service?.repositoryId, modulePath: service?.modulePath || '',
    path: repository?.source.path || '.', url: git?.url || '', remote: git?.remote || 'origin',
    integrationBranch: String(repository?.source.integrationBranch || git?.integrationBranch || ''),
  };
}
