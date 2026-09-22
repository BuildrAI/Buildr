import { useEffect, useState } from 'react';
import { Alert, Select } from 'antd';
import { assetCatalogApi } from '../api/asset-catalog-api';
import { RefreshButton } from '../../../components/RefreshButton';
type Candidate = Awaited<ReturnType<typeof assetCatalogApi.directoryCandidates>>['candidates'][number];
export function DirectoryCandidateSelect({ kind, value, onChange }: { kind: 'service' | 'repository'; value?: string; onChange: (candidate?: Candidate) => void }) {
  const [data, setData] = useState<Candidate[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError('');
    void assetCatalogApi.directoryCandidates(kind, controller.signal).then(result => { if (!controller.signal.aborted) { setData(result.candidates); setError(result.diagnostics.map(d => d.message).join('；')); } }).catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, retry]);
  return <><div className="resource-directory-picker"><Select showSearch allowClear aria-label={kind === 'service' ? '已有服务目录' : '已有代码库目录'} placeholder="可选，选择尚未登记的已有目录" loading={loading} value={value} optionFilterProp="label" options={data.map(c => ({ label: c.path, value: c.path }))} onChange={path => onChange(data.find(c => c.path === path))} /><RefreshButton label="刷新可选目录" loading={loading} onClick={() => setRetry(n => n + 1)} /></div>{error && <Alert type="warning" message={error} />}</>;
}
