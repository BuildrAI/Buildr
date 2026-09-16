import { ResourceDirectory } from '../../../components/ResourceDirectory';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input, Tag } from 'antd';
import { DrawerShell } from '../../../components/DrawerShell';
import { WorkspaceStage } from '../../../components/WorkspaceStage';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { assetCatalogApi, repositoryBranch, type RepositoryDraft } from '../../workspace/api/asset-catalog-api';
import { useAssetCatalog } from '../../workspace/components/useAssetCatalog';
import { CatalogMigration } from '../../workspace/components/CatalogMigration';
import { AssetEditDrawer } from '../../workspace/components/AssetEditDrawer';
export function RepositoriesPage() {
  const { workspaceId } = useAppShell(), navigate = useNavigate(), tabs = useWorkspacePageTabs(workspaceId), catalog = useAssetCatalog();
  const [editing, setEditing] = useState<string | null>(null), [creating, setCreating] = useState(false), [draft, setDraft] = useState<RepositoryDraft>({ code: '', url: '', integrationBranch: '' }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const data = catalog.data, href = (id: string) => workspaceHref(workspaceId, `/repositories/${id}`);
  useEffect(() => { tabs.register({ key: 'dir:repositories', kind: 'dir', title: '代码库目录', path: workspaceHref(workspaceId, '/repositories') }); }, [workspaceId]);
  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close}>
    <ResourceDirectory onRefresh={catalog.reload} refreshing={catalog.loading} title="代码库" noun="代码库" description="维护共享代码基础，明确来源、分支与可用状态。" data={data?.repositories || []} loading={!data && !catalog.error} error={catalog.error}
      rowKey={r => r.id} name={r => r.name} summary={r => r.description || r.code} searchText={r => `${r.name} ${r.code} ${repositoryBranch(r)}`} href={r => href(r.id)} onOpen={r => navigate(href(r.id))} onEdit={r => setEditing(r.id)} editDisabled={data?.migrationRequired}
      searchId="repositories-search" tableId="repository-table-wrap" columns={[
        { title: '集成分支', width: 150, render: (_, r) => <code className="resource-code">{repositoryBranch(r)}</code> },
        { title: '引用服务', width: 150, render: (_, r) => `${data?.services.filter(s => s.repositoryId === r.id).length || 0} 个服务` },
        { title: '本地状态', width: 130, render: (_, r) => <Tag color={r.available ? 'success' : 'warning'}>{data?.diagnostics.some(d => d.objectId === r.id && d.code === 'repository_identity_conflict') ? '来源冲突' : r.available ? '本地可用' : '待准备代码'}</Tag> },
      ]} notice={data && <CatalogMigration catalog={data} onSaved={catalog.setData} />}
      actions={<Button type="primary" disabled={!data || data.migrationRequired} onClick={() => setCreating(true)}>新增代码库</Button>} />
    {data && editing && <AssetEditDrawer key={editing} catalog={data} kind="repository" id={editing} onClose={() => setEditing(null)} />}
    {creating && data && <DrawerShell open title="新增代码库" sub="登记代码来源，本地代码可以随后准备。" onClose={() => { if (!busy) setCreating(false); }} closeDisabled={busy} footer={<Button type="primary" form="repository-create" htmlType="submit" loading={busy}>登记代码库</Button>}><form id="repository-create" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await assetCatalogApi.repository({ revision: data.revision, ...draft }); setCreating(false); setDraft({ code: '', url: '', integrationBranch: '' }); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}><Form layout="vertical" component={false}>{error && <Alert type="error" message={error} />}{(['code', 'url', 'integrationBranch'] as const).map(key => <Form.Item key={key} label={{ code: '代码库标识', url: 'Git 地址', integrationBranch: '集成分支' }[key]} required><Input required value={draft[key]} onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} /></Form.Item>)}<p className="page-copy">repositories/{draft.code || '<代码库标识>'}/</p></Form></form></DrawerShell>}
  </WorkspaceStage>;
}
