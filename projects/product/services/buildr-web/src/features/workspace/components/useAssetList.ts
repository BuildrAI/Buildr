import { useEffect, useState } from 'react';
import { useAppShell } from '../../../app/AppShellContext';
import { assetCatalogApi, catalogChanged } from '../api/asset-catalog-api';
type Lists = { services: Awaited<ReturnType<typeof assetCatalogApi.services>>; repositories: Awaited<ReturnType<typeof assetCatalogApi.repositories>> };
export function useAssetList<K extends keyof Lists>(kind: K) {
  const { workspaceId } = useAppShell();
  const [data, setData] = useState<Lists[K] | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [version, setVersion] = useState(0);
  const reload = () => setVersion(v => v + 1);
  useEffect(() => { window.addEventListener(catalogChanged, reload); return () => window.removeEventListener(catalogChanged, reload); }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void assetCatalogApi[kind](controller.signal).then(result => { if (!controller.signal.aborted) setData(result as Lists[K]); }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, workspaceId, version]);
  return { data, error, loading, reload };
}
