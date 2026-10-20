import { AssetDeleteDialog } from '../../workspace/components/AssetDeleteDialog';
import { useAssetList } from '../../workspace/components/useAssetList';
import { RepositoryFields } from '../../workspace/components/RepositoryFields';
import { ResourceDirectory } from '../../../components/ResourceDirectory';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Select, Space, Tag } from 'antd';
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
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null), [creating, setCreating] = useState(false), [draft, setDraft] = useState<RepositoryDraft>({ code: '', url: '', integrationBranch: '' }), [serviceIds, setServiceIds] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const catalog = useAssetCatalog(Boolean(editing || creating));
  const data = catalog.data, list = listing.data, href = (id: string) => workspaceHref(workspaceId, `/repositories/${id}`);
  useEffect(() => { tabs.register({ key: 'dir:repositories', kind: 'dir', title: '代码库目录', path: workspaceHref(workspaceId, '/repositories') }); }, [workspaceId]);
  const closeCreate = () => { if (!busy) { setCreating(false); setDraft({ code: '', url: '', integrationBranch: '' }); setServiceIds([]); setError(''); } };
  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close}>
    <ResourceDirectory onRefresh={listing.reload} refreshing={listing.loading} title="代码库" noun="代码库" description="维护共享代码基础，明确来源、分支与可用状态。" data={list?.repositories || []} loading={!list && !listing.error} error={listing.error || catalog.error || error}
      rowKey={r => r.id} name={r => r.name} summary={r => r.description || r.code} searchText={r => `${r.name} ${r.code} ${repositoryBranch(r)}`} href={r => href(r.id)} onOpen={r => navigate(href(r.id))} onEdit={r => setEditing(r.id)} onDelete={r => setDeleting(r.id)} editDisabled={list?.migrationRequired}
      searchId="repositories-search" tableId="repository-table-wrap" columns={[
        { title: '集成分支', width: 150, render: (_, r) => <code className="resource-code">{repositoryBranch(r)}</code> },
        { title: '引用服务', width: 150, render: (_, r) => `${r.serviceCount} 个服务` },
        { title: '本地状态', width: 130, render: (_, r) => <Tag>{r.present ? '目录存在 · 未检查' : '待准备代码'}</Tag> },
      ]} notice={list?.migrationRequired && <Alert type="info" message="旧服务登记需要迁移" action={<Button onClick={async () => { try { await assetCatalogApi.migrate(list.revision); } catch (err) { setError((err as Error).message); } }}>迁移登记</Button>} />}
      actions={<><Button disabled={!list || list.migrationRequired} onClick={async () => { if (list) { setBusy(true); try { await assetCatalogApi.normalize(list.revision); setError(''); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } } }} loading={busy}>规范化旧登记</Button><Button type="primary" disabled={!list || list.migrationRequired} onClick={() => setCreating(true)}>新增代码库</Button></>} />
    {deleting && <AssetDeleteDialog kind="repository" id={deleting} onClose={() => setDeleting(null)} onDeleted={listing.reload} />}
    {data && editing && <AssetEditDrawer key={editing} catalog={data} kind="repository" id={editing} onClose={() => setEditing(null)} />}
    {creating && list && <DrawerShell open title="新增代码库" sub="登记代码来源，本地代码可以随后准备。" onClose={closeCreate} closeDisabled={busy} footer={<Space style={{ display: 'flex', justifyContent: 'flex-end' }}><Button disabled={busy} onClick={closeCreate}>取消</Button><Button type="primary" form="repository-create" htmlType="submit" loading={busy}>登记代码库</Button></Space>}><form id="repository-create" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await assetCatalogApi.repository({ revision: list.revision, ...draft, serviceIds }); setCreating(false); setDraft({ code: '', url: '', integrationBranch: '' }); setServiceIds([]); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}><Form layout="vertical" component={false}>{error && <Alert type="error" message={error} />}<RepositoryFields value={draft} onChange={setDraft} /><Form.Item label="所属服务" help="可多选；勾选的服务代码库引用改为本库，模块路径保持不变。"><Select aria-label="所属服务" mode="multiple" allowClear disabled={busy} value={serviceIds} onChange={setServiceIds} options={(data?.services || []).map(entry => ({ label: entry.name, value: entry.id }))} placeholder="选择使用本代码库的服务，可稍后补充" /></Form.Item></Form></form></DrawerShell>}
  </WorkspaceStage>;
}
