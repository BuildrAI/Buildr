import { AssetDeleteDialog } from '../../workspace/components/AssetDeleteDialog';
import { useAssetList } from '../../workspace/components/useAssetList';
import { Alert, Segmented, Space, Tag } from 'antd';
import { ResourceDirectory } from '../../../components/ResourceDirectory';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { PlayCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { useAppShell } from '../../../app/AppShellContext';
import { useWorkspacePageTabs } from '../../../app/pageTabs';
import { WorkspaceStage } from '../../../components/WorkspaceStage';
import { workspaceHref } from '../../../lib/labels';
import { useAssetCatalog } from '../../workspace/components/useAssetCatalog';
import { AssetEditDrawer } from '../../workspace/components/AssetEditDrawer';
import { assetCatalogApi, type ServiceDraft } from '../../workspace/api/asset-catalog-api';
import { ServiceCreateDrawer } from '../../workspace/components/ServiceCreateDrawer';
import { AgentDiscoveryDrawer } from '../../service-runtime/components/AgentDiscoveryDrawer';
import { ServiceRuntimeStatusCell } from '../../service-runtime/components/ServiceRuntimeStatusCell';
import { StartWorktreeDrawer } from '../../service-runtime/components/StartWorktreeDrawer';
import { useServiceRuntimeOverview } from '../../service-runtime/hooks/useServiceRuntime';
import { activeRuns } from '../../service-runtime/model';
import '../../service-runtime/service-runtime.css';

export function ServicesPage() {
  const { workspaceId } = useAppShell(), navigate = useNavigate(), tabs = useWorkspacePageTabs(workspaceId), listing = useAssetList('services');
  const [editing, setEditing] = useState<string | null>(null), [creating, setCreating] = useState(false), [draft, setDraft] = useState<ServiceDraft>();
  const [actionError, setActionError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [starting, setStarting] = useState<{ code: string; name: string } | null>(null);
  const [discovering, setDiscovering] = useState<{ code: string; name: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'running'>('all');
  const catalog = useAssetCatalog(Boolean(editing || creating)), data = catalog.data, list = listing.data;
  const runtime = useServiceRuntimeOverview(workspaceId);
  const href = (id: string) => workspaceHref(workspaceId, `/services/${id}`);
  useEffect(() => { tabs.register({ key: 'dir:services', kind: 'dir', title: '服务目录', path: workspaceHref(workspaceId, '/services') }); }, [workspaceId]);

  const runtimeByCode = useMemo(() => new Map((runtime.data?.services ?? []).map(service => [service.code, service])), [runtime.data]);
  const services = (list?.services || []).filter(service => statusFilter === 'all' || activeRuns(runtimeByCode.get(service.code)).length > 0);

  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close}>
    <ResourceDirectory onRefresh={() => { listing.reload(); void runtime.refresh(); }} refreshing={listing.loading || runtime.loading} title="服务" noun="服务" description="了解实现职责，连接业务与代码；状态列合并本地运行与各环境最近结果。" data={services} loading={!list && !listing.error} error={listing.error || catalog.error || actionError}
      rowKey={s => s.id} name={s => s.name} summary={s => s.description} searchText={s => `${s.name} ${s.code} ${s.description}`} href={s => href(s.id)} onOpen={s => navigate(href(s.id))} onEdit={s => setEditing(s.id)} onDelete={s => setDeleting(s.id)} editDisabled={list?.migrationRequired}
      tableId="service-table-wrap" bodyId="service-table-body" searchId="services-search"
      total={list?.services.length} filtered={statusFilter === 'running'} onClearFilters={() => setStatusFilter('all')}
      filters={<Segmented id="service-runtime-filter" aria-label="运行状态筛选" value={statusFilter} options={[{ label: '全部服务', value: 'all' }, { label: '只看运行中', value: 'running' }]} onChange={value => setStatusFilter(value as 'all' | 'running')} />}
      columns={[
        { title: '关联项目', width: 170, render: (_, s) => s.projects.map(p => p.name).join('、') || '尚未关联' },
        { title: '代码库', width: 180, render: (_, s) => { const r = s.repository; return r ? <Link to={workspaceHref(workspaceId, `/repositories/${r.id}`)}>{r.name}</Link> : '引用缺失'; } },
        {
          title: '运行与部署', width: 300, render: (_, s) => {
            const summary = runtimeByCode.get(s.code);
            return summary
              ? <ServiceRuntimeStatusCell service={summary} onOpenDetail={() => navigate(href(s.id))} />
              : <span className="directory-muted">{runtime.error ? '状态不可用' : runtime.loading && !runtime.data ? '正在读取' : '未登记运行状态'}</span>;
          },
        },
      ]}
      actionWidth={196}
      rowActions={s => {
        const summary = runtimeByCode.get(s.code);
        const running = activeRuns(summary).length > 0;
        return <Space size={0} wrap>
          {summary?.definition
            ? <Button type="text" icon={running ? undefined : <PlayCircleOutlined />} disabled={list?.migrationRequired} onClick={() => setStarting({ code: s.code, name: s.name })}>启动</Button>
            : <Button type="text" icon={<SettingOutlined />} disabled={list?.migrationRequired} onClick={() => setDiscovering({ code: s.code, name: s.name })}>运行配置</Button>}
          <Button type="text" disabled={list?.migrationRequired} onClick={() => setEditing(s.id)}>编辑</Button>
          <Button type="text" disabled={list?.migrationRequired} onClick={() => setDeleting(s.id)}>移除</Button>
        </Space>;
      }}
      notice={<>{list?.migrationRequired && <Alert type="info" message="旧服务登记需要迁移" action={<Button onClick={async () => { try { await assetCatalogApi.migrate(list.revision); setActionError(''); } catch (err) { setActionError((err as Error).message); } }}>迁移登记</Button>} />}
        {runtime.error ? <Alert type="warning" showIcon message="运行与部署状态暂时不可用" description={runtime.error} action={<Button size="small" onClick={() => void runtime.refresh()}>重试</Button>} /> : null}
        {statusFilter === 'running' && !services.length ? <Alert type="info" message="当前没有运行中的服务" description={<Space size={4}><Tag>本地</Tag>启动后即可在这里集中查看。</Space>} /> : null}</>}
      actions={<Button type="primary" disabled={!list || list.migrationRequired} onClick={() => setCreating(true)}>新增服务</Button>} />
    {deleting && <AssetDeleteDialog kind="service" id={deleting} onClose={() => setDeleting(null)} onDeleted={listing.reload} />}
    {data && editing && <AssetEditDrawer key={editing} catalog={data} kind="service" id={editing} onClose={() => setEditing(null)} />}
    {data && creating && <ServiceCreateDrawer catalog={data} initial={draft} onClose={d => { setDraft(d); setCreating(false); }} onSave={async service => { await assetCatalogApi.service({ revision: data.revision, service }); setDraft(undefined); setCreating(false); }} />}
    <StartWorktreeDrawer open={Boolean(starting)} serviceCode={starting?.code ?? null} serviceName={starting?.name} onClose={() => setStarting(null)} onStarted={() => void runtime.refresh({ silent: true })} />
    <AgentDiscoveryDrawer open={Boolean(discovering)} serviceCode={discovering?.code ?? null} serviceName={discovering?.name} onClose={() => setDiscovering(null)} />
  </WorkspaceStage>;
}
