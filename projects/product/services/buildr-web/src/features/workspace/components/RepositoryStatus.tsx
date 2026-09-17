import { useEffect, useState } from 'react';
import { Alert, Button, Space, Tag } from 'antd';
import { assetCatalogApi } from '../api/asset-catalog-api';
export function RepositoryStatus({ id, revision }: { id: string; revision: string }) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof assetCatalogApi.status>> | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setStatus(null); setError(''); }, [id, revision]);
  return <><Space wrap><Tag color={status?.available ? 'success' : status ? 'warning' : undefined}>{status ? status.available ? 'Git 仓库可用' : '不可用' : '尚未检查 Git 状态'}</Tag>{status?.observed.currentBranch ? <span>当前分支：{String(status.observed.currentBranch)}</span> : null}<Button size="small" loading={busy} onClick={async () => { setBusy(true); setError(''); try { const result = await assetCatalogApi.status(id); if (result.revision !== revision) { setError('声明已变化，请刷新页面后重新检查。'); return; } setStatus(result); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>检查状态</Button></Space>{(error || status?.diagnostic) && <Alert type="warning" message={error || status?.diagnostic} />}</>;
}
