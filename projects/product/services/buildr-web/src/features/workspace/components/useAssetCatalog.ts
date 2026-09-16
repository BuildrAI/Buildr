import { useCallback, useEffect, useState } from 'react';
import { useAppShell } from '../../../app/AppShellContext';
import { assetCatalogApi, catalogChanged, type AssetCatalog } from '../api/asset-catalog-api';
export function useAssetCatalog() {
  const { workspaceId } = useAppShell();
  const [data, setData] = useState<AssetCatalog | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => setRetry(value => value + 1), []);
  useEffect(() => { window.addEventListener(catalogChanged, reload); return () => window.removeEventListener(catalogChanged, reload); }, [reload]);
  useEffect(() => {
    const controller = new AbortController(); setError(''); setLoading(true);
    void assetCatalogApi.read(controller.signal).then(result => { if (!controller.signal.aborted) setData(result); }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, retry]);
  return { data, error, reload, setData, loading };
}
