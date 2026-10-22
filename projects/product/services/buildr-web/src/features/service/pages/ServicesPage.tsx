import { AssetDeleteDialog } from '../../workspace/components/AssetDeleteDialog';
import { useAssetList } from '../../workspace/components/useAssetList';
import { Alert, App, Select, Space } from 'antd';
import { ResourceDirectory } from '../../../components/ResourceDirectory';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import { PlayCircleOutlined, SettingOutlined, StopOutlined } from '@ant-design/icons';
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
import { StartWorktreeModal } from '../../service-runtime/components/StartWorktreeModal';
import { serviceRuntimeApi, type ManagedRun } from '../../service-runtime/api/service-runtime-api';
import { confirmModal } from '../../../lib/confirm';
import { useServiceRuntimeOverview } from '../../service-runtime/hooks/useServiceRuntime';
import { activeRuns } from '../../service-runtime/model';
import '../../service-runtime/service-runtime.css';

export function ServicesPage() {
  const { workspaceId } = useAppShell(), navigate = useNavigate(), tabs = useWorkspacePageTabs(workspaceId), listing = useAssetList('services');
  const { message } = App.useApp();
  const [editing, setEditing] = useState<string | null>(null), [creating, setCreating] = useState(false), [draft, setDraft] = useState<ServiceDraft>();
  const [actionError, setActionError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [starting, setStarting] = useState<{ code: string; name: string } | null>(null);
  const [stopping, setStopping] = useState('');
  const [discovering, setDiscovering] = useState<{ code: string; name: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'running'>('all');
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const catalog = useAssetCatalog(Boolean(editing || creating)), data = catalog.data, list = listing.data;
  const runtime = useServiceRuntimeOverview(workspaceId);
  const href = (id: string) => workspaceHref(workspaceId, `/services/${id}`);
  useEffect(() => { tabs.register({ key: 'dir:services', kind: 'dir', title: '服务目录', path: workspaceHref(workspaceId, '/services') }); }, [workspaceId]);

  const runtimeByCode = useMemo(() => new Map((runtime.data?.services ?? []).map(service => [service.code, service])), [runtime.data]);
  const projectOptions = useMemo(() => {
    const projects = new Map((list?.services ?? []).flatMap(service => service.projects).map(project => [project.id, project]));
    return [...projects.values()].sort((a, b) => a.name.localeCompare(b.name)).map(project => ({ value: project.id, label: `${project.name}（${project.code}）` }));
  }, [list]);
  const selectedProjects = new Set(projectFilter);
  const services = (list?.services || []).filter(service =>
    (statusFilter === 'all' || activeRuns(runtimeByCode.get(service.code)).length > 0)
    && (!selectedProjects.size || service.projects.some(project => selectedProjects.has(project.id))));
  const stopRuns = async (service: { code: string; name: string }, runs: ManagedRun[]) => {
    const confirmed = await confirmModal({
      title: `停止 ${service.name} 的本地运行？`,
      content: runs.length === 1
        ? `Buildr 会向 ${runs[0].worktreeLabel} 的托管进程发送终止信号，端口 :${runs[0].actualPort} 随后释放。`
        : `该服务有 ${runs.length} 个运行实例，将全部停止：${runs.map(run => `${run.worktreeLabel}(:${run.actualPort})`).join('、')}。`,
      okText: '停止运行',
      cancelText: '取消',
    });
    if (!confirmed) return;
    setStopping(service.code);
    setActionError('');
    try {
      for (const run of runs) await serviceRuntimeApi.stop(run.id);
      message.success('已停止本地运行');
      await runtime.refresh({ silent: true });
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '停止失败');
      void runtime.refresh({ silent: true });
    } finally {
      setStopping('');
    }
  };

  return <WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close}>
    <ResourceDirectory onRefresh={() => { listing.reload(); void runtime.refresh(); }} refreshing={listing.loading || runtime.loading} title="服务" noun="服务" description="了解实现职责，连接业务与代码；状态列合并本地运行与各环境最近结果。" data={services} loading={!list && !listing.error} error={listing.error || catalog.error || actionError}
      rowKey={s => s.id} name={s => s.name} summary={s => s.description} searchText={s => `${s.name} ${s.code} ${s.description}`} href={s => href(s.id)} onOpen={s => navigate(href(s.id))} onEdit={s => setEditing(s.id)} onDelete={s => setDeleting(s.id)} editDisabled={list?.migrationRequired}
      tableId="service-table-wrap" bodyId="service-table-body" searchId="services-search"
      total={list?.services.length} filtered={statusFilter === 'running' || projectFilter.length > 0} onClearFilters={() => { setStatusFilter('all'); setProjectFilter([]); }}
      filters={<>
        <Select id="service-project-filter" aria-label="所属项目筛选" mode="multiple" allowClear showSearch maxTagCount={1} placeholder="所属项目" value={projectFilter} options={projectOptions} onChange={setProjectFilter} filterOption={(input, option) => String(option?.label ?? '').toLocaleLowerCase().includes(input.trim().toLocaleLowerCase())} />
        <Select id="service-runtime-filter" aria-label="运行状态筛选" value={statusFilter} options={[{ label: '全部服务', value: 'all' }, { label: '只看运行中', value: 'running' }]} onChange={value => setStatusFilter(value as 'all' | 'running')} />
      </>}
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
        const runs = activeRuns(summary);
        return <Space size={0} wrap>
          {summary?.definition
            ? runs.length
              ? <Button type="text" danger icon={<StopOutlined />} loading={stopping === s.code} disabled={list?.migrationRequired} onClick={() => void stopRuns(s, runs)}>停止</Button>
              : <Button type="text" icon={<PlayCircleOutlined />} disabled={list?.migrationRequired} onClick={() => setStarting({ code: s.code, name: s.name })}>启动</Button>
            : <Button type="text" icon={<SettingOutlined />} disabled={list?.migrationRequired} onClick={() => setDiscovering({ code: s.code, name: s.name })}>运行配置</Button>}
          <Button type="text" disabled={list?.migrationRequired} onClick={() => setEditing(s.id)}>编辑</Button>
          <Button type="text" disabled={list?.migrationRequired} onClick={() => setDeleting(s.id)}>移除</Button>
        </Space>;
      }}
      notice={<>{list?.migrationRequired && <Alert type="info" message="旧服务登记需要迁移" action={<Button onClick={async () => { try { await assetCatalogApi.migrate(list.revision); setActionError(''); } catch (err) { setActionError((err as Error).message); } }}>迁移登记</Button>} />}
        {runtime.error ? <Alert type="warning" showIcon message="运行与部署状态暂时不可用" description={runtime.error} action={<Button size="small" onClick={() => void runtime.refresh()}>重试</Button>} /> : null}</>}
      actions={<Button type="primary" disabled={!list || list.migrationRequired} onClick={() => setCreating(true)}>新增服务</Button>} />
    {deleting && <AssetDeleteDialog kind="service" id={deleting} onClose={() => setDeleting(null)} onDeleted={listing.reload} />}
    {data && editing && <AssetEditDrawer key={editing} catalog={data} kind="service" id={editing} onClose={() => setEditing(null)} />}
    {data && creating && <ServiceCreateDrawer catalog={data} initial={draft} onClose={d => { setDraft(d); setCreating(false); }} onSave={async service => { await assetCatalogApi.service({ revision: data.revision, service }); setDraft(undefined); setCreating(false); }} />}
    <StartWorktreeModal open={Boolean(starting)} serviceCode={starting?.code ?? null} serviceName={starting?.name} onClose={() => setStarting(null)} onStarted={() => void runtime.refresh({ silent: true })} />
    <AgentDiscoveryDrawer open={Boolean(discovering)} serviceCode={discovering?.code ?? null} serviceName={discovering?.name} onClose={() => setDiscovering(null)} />
  </WorkspaceStage>;
}
