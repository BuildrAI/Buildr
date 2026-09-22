import { useEffect, useState } from 'react';
import { Alert, Button, Tag } from 'antd';
import { assetCatalogApi } from '../api/asset-catalog-api';
export function RepositoryStatus({ id, revision, onAlign, onRefresh, showRemote = true }: { id: string; revision: string; onAlign?: () => void; onRefresh?: () => void; showRemote?: boolean }) {
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
  return <div className="repository-status" data-repository-alignment={status?.alignment || 'unchecked'}>
    <div className="repository-status-line"><span className="repository-status-label">状态</span><Tag color={status?.alignment === 'ready' ? 'success' : status || error ? 'warning' : undefined}>{status ? status.alignment === 'ready' ? '已对齐' : '待对齐' : error ? '检查失败' : '正在检查'}</Tag><div className="repository-status-actions"><Button size="small" loading={busy} onClick={() => { setRefresh(v => v + 1); onRefresh?.(); }}>检查状态</Button>{status?.alignment === 'pending' && onAlign && <Button size="small" onClick={onAlign}>查看对齐指引</Button>}</div></div>
    {status && <dl className="asset-facts repository-status-facts"><div><dt>当前分支</dt><dd><code>{String(status.observed.currentBranch || '未检出分支')}</code></dd></div>{showRemote && <><div><dt>远端（Remote）</dt><dd>{String(status.observed.remote || 'origin')}</dd></div><div><dt>实际地址</dt><dd><code>{String(status.observed.remoteUrl || '未配置或不可用')}</code></dd></div></>}</dl>}
    {(error || status?.diagnostic) && <Alert type="warning" message={error || status?.diagnostic} />}
  </div>;
}
