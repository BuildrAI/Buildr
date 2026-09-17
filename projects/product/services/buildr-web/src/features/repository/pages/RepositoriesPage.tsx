import { useAssetList } from '../../workspace/components/useAssetList';
import { RepositoryFields } from '../../workspace/components/RepositoryFields';
import { ResourceDirectory } from '../../../components/ResourceDirectory';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Tag } from 'antd';
import { DrawerShell } from '../../../components/DrawerShell';
import { WorkspaceStage } from '../../../components/WorkspaceStage';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { useAppShell } from '../../../app/AppShellContext';
import { workspaceHref } from '../../../lib/labels';
import { assetCatalogApi, repositoryBranch, type RepositoryDraft } from '../../workspace/api/asset-catalog-api';
import { useAssetCatalog } from '../../workspace/components/useAssetCatalog';
import { AssetEditDrawer } from '../../workspace/components/AssetEditDrawer';
export function RepositoriesPage() {
  const { workspaceId } = useAppShell(), navigate = useNavigate(), tabs = useWorkspacePageTabs(workspaceId), listing = useAssetList('repositories');
  const [editing, setEditing] = useState<string | null>(null), [creating, setCreating] = useState(false), [draft, setDraft] = useState<RepositoryDraft>({ code: '', url: '', integrationBranch: '' }), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const catalog = useAssetCatalog(Boolean(editing));
  const data = catalog.data, list = listing.data, href = (id: string) => workspaceHref(workspaceId, `/repositories/${id}`);
  useEffect(() => { tabs.register({ key: 'dir:repositories', kind: 'dir', title: '代码库目录', path: workspaceHref(workspaceId, '/repositories') }); }, [workspaceId]);
  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close}>
    <ResourceDirectory onRefresh={listing.reload} refreshing={listing.loading} title="代码库" noun="代码库" description="维护共享代码基础，明确来源、分支与可用状态。" data={list?.repositories || []} loading={!list && !listing.error} error={listing.error || catalog.error || error}
      rowKey={r => r.id} name={r => r.name} summary={r => r.description || r.code} searchText={r => `${r.name} ${r.code} ${repositoryBranch(r)}`} href={r => href(r.id)} onOpen={r => navigate(href(r.id))} onEdit={r => setEditing(r.id)} editDisabled={list?.migrationRequired}
      searchId="repositories-search" tableId="repository-table-wrap" columns={[
        { title: '集成分支', width: 150, render: (_, r) => <code className="resource-code">{repositoryBranch(r)}</code> },
        { title: '引用服务', width: 150, render: (_, r) => `${r.serviceCount} 个服务` },
        { title: '本地状态', width: 130, render: (_, r) => <Tag>{r.present ? '目录存在 · 未检查' : '待准备代码'}</Tag> },
      ]} notice={list?.migrationRequired && <Alert type="info" message="旧服务登记需要迁移" action={<Button onClick={async () => { try { await assetCatalogApi.migrate(list.revision); } catch (err) { setError((err as Error).message); } }}>迁移登记</Button>} />}
      actions={<><Button disabled={!list || list.migrationRequired} onClick={async () => { if (list) { setBusy(true); try { await assetCatalogApi.normalize(list.revision); setError(''); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } } }} loading={busy}>规范化旧登记</Button><Button type="primary" disabled={!list || list.migrationRequired} onClick={() => setCreating(true)}>新增代码库</Button></>} />
    {data && editing && <AssetEditDrawer key={editing} catalog={data} kind="repository" id={editing} onClose={() => setEditing(null)} />}
    {creating && list && <DrawerShell open title="新增代码库" sub="登记代码来源，本地代码可以随后准备。" onClose={() => { if (!busy) setCreating(false); }} closeDisabled={busy} footer={<Button type="primary" form="repository-create" htmlType="submit" loading={busy}>登记代码库</Button>}><form id="repository-create" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await assetCatalogApi.repository({ revision: list.revision, ...draft }); setCreating(false); setDraft({ code: '', url: '', integrationBranch: '' }); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}><Form layout="vertical" component={false}>{error && <Alert type="error" message={error} />}<RepositoryFields value={draft} onChange={setDraft} /></Form></form></DrawerShell>}
  </WorkspaceStage>;
}
