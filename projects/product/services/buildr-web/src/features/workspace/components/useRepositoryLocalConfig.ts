import { useCallback, useEffect, useState } from 'react';
import { assetCatalogApi } from '../api/asset-catalog-api';
export function useRepositoryLocalConfig(id: string | undefined, revision: string) {
  const [data, setData] = useState<Awaited<ReturnType<typeof assetCatalogApi.localConfig>> | null>(null);
  const [loading, setLoading] = useState(Boolean(id)), [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh(value => value + 1), []);
  useEffect(() => {
    setData(null); setError('');
    if (!id) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    void assetCatalogApi.localConfig(id, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result.revision !== revision) { setError('声明已变化，请重新打开并核对。'); return; }
      setData(result);
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, revision, refresh]);
  return { data, loading, error, reload };
}
