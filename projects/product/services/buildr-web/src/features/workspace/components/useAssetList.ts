import { useEffect, useState } from 'react';
import { useAppShell } from '../../../app/AppShellContext';
import { useCachedWorkspaceRead } from '../../../components/WorkspaceReadCache';
import { assetCatalogApi, catalogChanged } from '../api/asset-catalog-api';
type Lists = { services: Awaited<ReturnType<typeof assetCatalogApi.services>>; repositories: Awaited<ReturnType<typeof assetCatalogApi.repositories>> };
export function useAssetList<K extends keyof Lists>(kind: K) {
  const { workspaceId } = useAppShell();
  const [version, setVersion] = useState(0);
  const reload = () => setVersion(v => v + 1);
  const { data, error, loading, refresh } = useCachedWorkspaceRead<Lists[K]>(JSON.stringify([workspaceId, 'asset-list', kind]), signal => assetCatalogApi[kind](signal) as Promise<Lists[K]>, Boolean(workspaceId));
  useEffect(() => { window.addEventListener(catalogChanged, reload); return () => window.removeEventListener(catalogChanged, reload); }, []);
  useEffect(() => {
    if (version) void refresh({ force: true });
  }, [version, refresh]);
  return { data, error, loading, reload };
}
