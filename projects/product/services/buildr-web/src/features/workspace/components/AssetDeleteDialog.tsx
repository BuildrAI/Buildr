import { useResourcePreview } from '../../../app/resource-preview';
import { useState } from 'react';
import { Alert, Modal } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAppShell } from '../../../app/AppShellContext';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { workspaceHref } from '../../../lib/labels';
import { assetCatalogApi } from '../api/asset-catalog-api';
import { useAssetCatalog } from './useAssetCatalog';
export function AssetDeleteDialog({ kind, id, onClose, onDeleted }: { kind: 'project' | 'service'; id: string; onClose: () => void; onDeleted?: () => void }) {
  const previews = useResourcePreview();
  const catalog = useAssetCatalog(), { workspaceId } = useAppShell(), tabs = useWorkspacePageTabs(workspaceId), navigate = useNavigate();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const data = catalog.data, item = (kind === 'project' ? data?.projects : data?.services)?.find(x => x.id === id || x.code === id);
  const related = kind === 'service' ? data?.projects.filter(p => p.serviceIds?.includes(item?.id || '')).map(p => p.name) : data?.services.filter(s => data.projects.find(p => p.id === item?.id)?.serviceIds?.includes(s.id)).map(s => s.name);
  const label = kind === 'project' ? '项目' : '服务';
  return <Modal open title={`移除${label}登记${item ? `：${item.name}` : ''}`} okText="移除登记" cancelText="取消" confirmLoading={busy} okButtonProps={{ danger: true, disabled: !item || data?.migrationRequired || Boolean(catalog.error) }} onCancel={() => { if (!busy) onClose(); }} onOk={async () => {
    if (!data || !item) return;
    setBusy(true); setError('');
    try {
      await assetCatalogApi.remove(kind, item.id, data.revision);
      previews?.remove(kind, item.id); previews?.remove(kind, item.code);
      tabs.close(kind === 'project' ? `proj:${item.code}` : `service:${item.id}`);
      onDeleted?.(); onClose(); navigate(workspaceHref(workspaceId, kind === 'project' ? '/projects' : '/services'));
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }}>
    <p>只移除登记和关联，保留代码、文件和历史任务。</p>
    <p>{kind === 'service' ? '将解除这些项目的引用' : '将解除与这些服务的关联，服务仍保留'}：{related?.join('、') || '无'}</p>
    {!data && !catalog.error && <p>正在核对当前登记…</p>}
    {data?.migrationRequired && <Alert type="warning" message="请先迁移旧服务登记，再移除。" />}
    {(error || catalog.error) && <Alert type="error" message={error || catalog.error} description="未完成移除。请关闭后重新核对当前登记。" />}
  </Modal>;
}
