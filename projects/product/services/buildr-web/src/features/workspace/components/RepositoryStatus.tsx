import { useEffect, useState } from 'react';
import { Alert, Button, Space, Tag } from 'antd';
import { assetCatalogApi } from '../api/asset-catalog-api';
export function RepositoryStatus({ id, revision, onAlign, onRefresh }: { id: string; revision: string; onAlign?: () => void; onRefresh?: () => void }) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof assetCatalogApi.status>> | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setStatus(null); setError(''); setBusy(true);
    void assetCatalogApi.status(id, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result.revision !== revision) { setError('声明已变化，请刷新页面后重新检查。'); return; }
      setStatus(result);
    }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [id, revision, refresh]);
  return <div data-repository-alignment={status?.alignment || 'unchecked'}>
    <Space wrap><Tag color={status?.alignment === 'ready' ? 'success' : status ? 'warning' : undefined}>{status ? status.alignment === 'ready' ? '已对齐' : '待对齐' : '正在检查'}</Tag><Button size="small" loading={busy} onClick={() => { setRefresh(v => v + 1); onRefresh?.(); }}>检查状态</Button>{status?.alignment === 'pending' && onAlign && <Button size="small" onClick={onAlign}>查看对齐指引</Button>}</Space>
    {status && <p className="page-copy">当前分支：{String(status.observed.currentBranch || '未检出分支')}；远端（Remote）{String(status.observed.remote || 'origin')} 的实际地址：{String(status.observed.remoteUrl || '未配置或不可用')}</p>}
    {(error || status?.diagnostic) && <Alert type="warning" message={error || status?.diagnostic} />}
  </div>;
}
