import { useCallback, useEffect, useState } from 'react';
import { useAppShell } from '../../../app/AppShellContext';
import { assetCatalogApi, catalogChanged, type AssetCatalog } from '../api/asset-catalog-api';
// Share only concurrent reads; completed snapshots remain owned by each component.
const pending = new Map<string, Promise<AssetCatalog>>();
function readShared(key: string) {
  const existing = pending.get(key);
  if (existing) return existing;
  const request = assetCatalogApi.read(); pending.set(key, request);
  void request.finally(() => { if (pending.get(key) === request) pending.delete(key); }).catch(() => {});
  return request;
}
export function useAssetCatalog(enabled = true) {
  const { workspaceId } = useAppShell();
  const [data, setData] = useState<AssetCatalog | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => { pending.delete(workspaceId || ''); setRetry(value => value + 1); }, [workspaceId]);
  useEffect(() => { window.addEventListener(catalogChanged, reload); return () => window.removeEventListener(catalogChanged, reload); }, [reload]);
  useEffect(() => {
    if (!enabled) {
      // A newly opened editor must initialize its fields and revision from the
      // same fresh read, never from the previous editing session's snapshot.
      setData(null);
      setLoading(true);
      setError('');
      return;
    }
    const controller = new AbortController(); setError(''); setLoading(true);
    void readShared(workspaceId || '').then(result => { if (!controller.signal.aborted) setData(result); }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, retry, enabled]);
  return { data, error, reload, setData, loading };
}
