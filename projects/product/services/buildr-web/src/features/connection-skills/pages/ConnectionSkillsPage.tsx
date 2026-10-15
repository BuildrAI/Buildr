import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Dropdown, Tag } from 'antd';
import { MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../../api';
import { useAppShell } from '../../../app/AppShellContext';
import { WorkspaceViewActiveContext, useWorkspacePageTabs } from '../../../app/pageTabs';
import { ResourceDirectory } from '../../../components/ResourceDirectory';
import { WorkspaceStage } from '../../../components/WorkspaceStage';
import { useWorkspacePaneHost } from '../../../app/WorkspacePaneContext';
import { workspaceHref } from '../../../lib/labels';
import { createConnectionSkillsClient } from '../api/connection-skills-api';
import type { CatalogEntry, ConnectionInstance } from '../connection-skill-types';
import { categoryLabel, diagnosticText, websiteHref } from '../connection-skill-form';
import { connectionSummaryLines } from '../connection-skill-summary';
import { ConnectionSkillEditDrawer } from '../components/ConnectionSkillEditDrawer';
import { MySqlQuery, createMySqlQueryClient, mysqlQueryTarget, type MySqlQueryTarget } from '../../mysql-query';
import '../connection-skills.css';

export function ConnectionSkillsPage() {
  const { workspaceId } = useAppShell(), active = useContext(WorkspaceViewActiveContext), tabs = useWorkspacePageTabs(workspaceId), { modal, message } = App.useApp();
  const client = useMemo(() => createConnectionSkillsClient(api, workspaceId || ''), [workspaceId]);
  const paneHost = useWorkspacePaneHost(), location = useLocation();
  const [queryOpen, setQueryOpen] = useState(false), [queryEntry, setQueryEntry] = useState<{ id: string; nonce: number } | null>(null);
  const [instances, setInstances] = useState<ConnectionInstance[]>([]), [definitions, setDefinitions] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [diagnostics, setDiagnostics] = useState<unknown[]>([]), [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<ConnectionInstance | null>(), [removing, setRemoving] = useState('');
  const current = useRef({ client, refresh }); current.current = { client, refresh };
  const completed = useRef<{ client: typeof client; refresh: number } | null>(null), reading = useRef<AbortController | null>(null);
  const reload = useCallback(() => setRefresh(value => value + 1), []);
  useEffect(() => { completed.current = null; setInstances([]); setDefinitions([]); setEditing(undefined); setDiagnostics([]); setQueryOpen(false); setQueryEntry(null); setRemoving(''); setError(''); setLoading(true); }, [client]);
  useEffect(() => { tabs.register({ key: 'dir:connection-skills', kind: 'dir', title: '连接', path: workspaceHref(workspaceId, '/connection-skills') }); }, [workspaceId]);
  useEffect(() => {
    if (!workspaceId || !active || completed.current?.client === client && completed.current.refresh === refresh) return;
    const controller = new AbortController(); reading.current = controller; setLoading(true); setError('');
    const isCurrent = () => !controller.signal.aborted && current.current.client === client;
    void Promise.allSettled([client.list(controller.signal), client.definitions(controller.signal)]).then(([list, catalog]) => {
      if (!isCurrent()) return;
      const notices: unknown[] = [];
      if (list.status === 'fulfilled') { setInstances(list.value.instances); notices.push(...list.value.diagnostics); } else setError((list.reason as Error).message);
      if (catalog.status === 'fulfilled') { setDefinitions(catalog.value.definitions); notices.push(...catalog.value.diagnostics); } else notices.push((catalog.reason as Error).message);
      setDiagnostics(notices);
      if (list.status === 'fulfilled' && catalog.status === 'fulfilled') completed.current = { client, refresh };
    }).finally(() => { if (isCurrent()) setLoading(false); if (reading.current === controller) reading.current = null; });
    return () => { controller.abort(); if (reading.current === controller) reading.current = null; };
  }, [client, workspaceId, active, refresh]);
  function acceptLocalChange() {
    reading.current?.abort(); reading.current = null;
    completed.current = { client, refresh: current.current.refresh };
    setLoading(false); setError('');
  }
  function saved(instance: ConnectionInstance) {
    if (current.current.client !== client) return;
    acceptLocalChange();
    setInstances(previous => previous.some(item => item.id === instance.id) ? previous.map(item => item.id === instance.id ? instance : item) : [...previous, instance]);
  }
  async function remove(instance: ConnectionInstance) {
    setRemoving(instance.id);
    try { await client.remove(instance.id, { teamRevision: instance.teamRevision, definitionRevision: instance.definitionRevision }); if (current.current.client !== client) return; acceptLocalChange(); setInstances(previous => previous.filter(item => item.id !== instance.id)); message.success('连接实例已删除。'); }
    catch (cause) { if (current.current.client === client) setError((cause as Error).message); }
    finally { if (current.current.client === client) setRemoving(''); }
  }
  const summary = (instance: ConnectionInstance) => `${instance.definition?.definition.presentation?.categoryLabel || categoryLabel(instance.category)} · ${instance.definition?.definition.name || instance.binding.definitionId}`;
  const targetKey = JSON.stringify(instances.map(mysqlQueryTarget).filter((target): target is MySqlQueryTarget => target !== null));
  const queryTargets = useMemo(() => JSON.parse(targetKey) as MySqlQueryTarget[], [targetKey]);
  const queryClient = useMemo(() => createMySqlQueryClient(api, workspaceId || '', queryTargets), [workspaceId, queryTargets]);
  function openQuery(instance: ConnectionInstance) {
    if (!mysqlQueryTarget(instance)) return;
    setQueryEntry({ id: instance.id, nonce: Date.now() }); setQueryOpen(true);
    paneHost?.revealContent(location.pathname, 'mysql-query');
  }
  return <><WorkspaceStage pageTabs={tabs.tabs} onClosePageTab={tabs.close}
    objectTabs={queryOpen ? [{ key: 'mysql-query', kind: 'doc', title: 'MySQL 查询' }] : []}
    activeObject={queryOpen ? 'mysql-query' : null} onActivateObject={() => setQueryOpen(true)} onCloseObject={() => setQueryOpen(false)}
    objectContentLayout="fill" objectLabel="查询" retainObjectContent
    objectContent={({ visible }) => queryEntry && <MySqlQuery connections={queryTargets} client={queryClient} entry={queryEntry} active={queryOpen && visible} layoutKey={workspaceId || ''} />}
  >
    <ResourceDirectory<ConnectionInstance> title="连接" noun="连接" description="管理团队使用的外部系统，供你和智能体（Agent）使用。" data={instances} total={instances.length} showTotal loading={loading} error={error} rowKey={instance => instance.id} name={instance => instance.name} summary={summary} onRefresh={reload} searchId="connection-skills-search" tableId="connection-skills-table" countId="connection-skills-count" searchText={instance => `${instance.name} ${instance.environment} ${summary(instance)} ${connectionSummaryLines(instance).join(' ')} ${Object.values(instance.config).join(' ')}`} searchPlaceholder="搜索名称、系统或范围"
      notice={<><p className="buildr-connection-skill-muted">连接配置随当前工作空间（Workspace）的团队文件共享。<Link to={workspaceHref(workspaceId, '/connections')}>打开已有连接</Link></p>{diagnostics.map((item, index) => <Alert key={index} showIcon type="warning" message={diagnosticText(item)} />)}</>}
      actions={<Button id="create-connection-skill" type="primary" icon={<PlusOutlined />} disabled={loading || !definitions.some(entry => entry.enabled)} onClick={() => setEditing(null)}>新增连接</Button>}
      columns={[
        { title: '环境 / 状态', width: 180, render: (_, instance) => <><Tag>{instance.environment || '未填写环境'}</Tag><Tag>{instance.enabled ? '已启用' : '已停用'}</Tag><Tag color={instance.availability.ready ? undefined : 'orange'}>{instance.availability.ready ? '已配置' : '需检查'}</Tag></> },
        { title: '地址 / 默认范围', width: 320, render: (_, instance) => <div className="buildr-connection-skill-summary">{connectionSummaryLines(instance).map((line, index) => <span key={index}>{line}</span>)}{instance.availability.diagnostics.map((item, index) => <small key={index}>{item}</small>)}</div> },
        { title: '认证', width: 150, render: (_, instance) => <><Tag>{instance.authentication.source === 'personal' ? '本机个人' : '团队'}</Tag><small>{instance.authentication[instance.authentication.source].configured ? '已配置 · 未验证' : '不可用'}</small></> },
      ]} actionWidth={180} rowActions={instance => { const website = websiteHref(instance.websiteUrl); return <>
        {mysqlQueryTarget(instance) && <Button type="text" onClick={() => openQuery(instance)}>查询</Button>}
        {website && <a href={website} target="_blank" rel="noopener noreferrer">打开网站</a>}
        <Button type="text" onClick={() => setEditing(instance)}>编辑</Button>
        <Dropdown trigger={['click']} menu={{ items: [{ key: 'delete', label: '删除实例', danger: true, disabled: removing === instance.id }], onClick: () => modal.confirm({ title: '删除这个连接实例？', content: '删除团队实例文件，不操作外部系统或已有连接。', okText: '删除', cancelText: '取消', onOk: () => remove(instance) }) }}><Button type="text" loading={removing === instance.id} aria-label={`更多操作：${instance.name}`} icon={<MoreOutlined />} /></Dropdown>
      </>; }} />
  </WorkspaceStage>{editing !== undefined && <ConnectionSkillEditDrawer key={`${workspaceId}:${editing?.id || 'new'}`} instance={editing || undefined} definitions={definitions} client={client} onClose={() => setEditing(undefined)} onSaved={saved} />}</>;
}
