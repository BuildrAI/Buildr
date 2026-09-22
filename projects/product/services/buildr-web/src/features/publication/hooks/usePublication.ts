import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { publicationApi, publicationsChanged, type PublicationDetail } from '../api/publication-api';

export function usePublication(workspaceId: string | null, projectCode: string, id: string, refreshOnVisit = true) {
  const location = useLocation();
  const [data, setData] = useState<PublicationDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const visitKey = refreshOnVisit ? location.key : '';
  useEffect(() => {
    setData(null); setError('');
  }, [workspaceId, projectCode, id]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    publicationApi.detail(id, controller.signal, projectCode).then(detail => {
      if (!controller.signal.aborted) setData(detail);
    }).catch(err => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '文章读取失败');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, projectCode, id, refresh, visitKey]);
  useEffect(() => {
    if (!refreshOnVisit) return;
    const changed = () => setRefresh(value => value + 1);
    window.addEventListener(publicationsChanged, changed);
    return () => window.removeEventListener(publicationsChanged, changed);
  }, [refreshOnVisit]);
  return { data, setData, error, loading, reload: () => setRefresh(value => value + 1) };
}
