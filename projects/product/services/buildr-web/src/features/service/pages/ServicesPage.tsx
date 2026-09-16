import { ResourceDirectory } from '../../../components/ResourceDirectory';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { useAppShell } from '../../../app/AppShellContext';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { WorkspaceStage } from '../../../components/WorkspaceStage';
import { workspaceHref } from '../../../lib/labels';
import { useAssetCatalog } from '../../workspace/components/useAssetCatalog';
import { CatalogMigration } from '../../workspace/components/CatalogMigration';
import { AssetEditDrawer } from '../../workspace/components/AssetEditDrawer';
import { assetCatalogApi, type ServiceDraft } from '../../workspace/api/asset-catalog-api';
import { ServiceCreateDrawer } from '../components/ServiceCreateDrawer';
export function ServicesPage() {
  const { workspaceId } = useAppShell(), navigate = useNavigate(), tabs = useWorkspacePageTabs(workspaceId), catalog = useAssetCatalog();
  const [editing, setEditing] = useState<string | null>(null), [creating, setCreating] = useState(false), [draft, setDraft] = useState<ServiceDraft>();
  const href = (id: string) => workspaceHref(workspaceId, `/services/${id}`);
  useEffect(() => { tabs.register({ key: 'dir:services', kind: 'dir', title: '服务目录', path: workspaceHref(workspaceId, '/services') }); }, [workspaceId]);
  const data = catalog.data;
  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close}>
    <ResourceDirectory onRefresh={catalog.reload} refreshing={catalog.loading} title="服务" noun="服务" description="了解实现职责，连接业务与代码。" data={data?.services || []} loading={!data && !catalog.error} error={catalog.error}
      rowKey={s => s.id} name={s => s.name} summary={s => s.description} searchText={s => `${s.name} ${s.code} ${s.description}`} href={s => href(s.id)} onOpen={s => navigate(href(s.id))} onEdit={s => setEditing(s.id)} editDisabled={data?.migrationRequired}
      tableId="service-table-wrap" bodyId="service-table-body" searchId="services-search"
      columns={[
        { title: '关联项目', width: 170, render: (_, s) => data?.projects.filter(p => p.serviceIds?.includes(s.id)).map(p => p.name).join('、') || '尚未关联' },
        { title: '代码库', width: 180, render: (_, s) => { const r = data?.repositories.find(r => r.id === s.repositoryId); return r ? <Link to={workspaceHref(workspaceId, `/repositories/${r.id}`)}>{r.name}</Link> : '引用缺失'; } },
      ]}
      notice={data && <CatalogMigration catalog={data} onSaved={catalog.setData} />}
      actions={<Button type="primary" disabled={!data || data.migrationRequired} onClick={() => setCreating(true)}>新增服务</Button>} />
    {data && editing && <AssetEditDrawer key={editing} catalog={data} kind="service" id={editing} onClose={() => setEditing(null)} />}
    {data && creating && <ServiceCreateDrawer catalog={data} initial={draft} onClose={d => { setDraft(d); setCreating(false); }} onSave={async service => { await assetCatalogApi.service({ revision: data.revision, service }); setDraft(undefined); setCreating(false); }} />}
  </WorkspaceStage>;
}
