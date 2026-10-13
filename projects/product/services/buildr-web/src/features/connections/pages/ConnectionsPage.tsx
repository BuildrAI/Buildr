import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { App, Button, Dropdown, Select, Tabs, Tag } from 'antd';
import { MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '../../../api';
import { useAppShell } from '../../../app/AppShellContext';
import { WorkspaceViewActiveContext, useWorkspacePageTabs } from '../../../app/pageTabs';
import { workspaceHref } from '../../../lib/labels';
import { ResourceDirectory } from '../../../components/ResourceDirectory';
import { createConnectionClient } from '../api/connection-api';
import { isMySqlConnection, type ExternalConnection, type MySqlConnection } from '../connection-types';
import { ConnectionEditDrawer } from '../components/ConnectionEditDrawer';
import { MySqlQuery } from '../components/MySqlQuery';
import '../connections.css';

export function ConnectionsPage() {
  const { workspaceId } = useAppShell(), tabs = useWorkspacePageTabs(workspaceId), active = useContext(WorkspaceViewActiveContext), { message, modal } = App.useApp();
  const client = useMemo(() => createConnectionClient(api, workspaceId || ''), [workspaceId]);
  const [connections, setConnections] = useState<ExternalConnection[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState('connections'), [editing, setEditing] = useState<MySqlConnection | null>(), [removing, setRemoving] = useState('');
  const [query, setQuery] = useState(''), [environment, setEnvironment] = useState<string>();
  const [entry, setEntry] = useState<{ id: string; nonce: number } | null>(null);
  const reload = useCallback(() => setRefresh(value => value + 1), []);
  useEffect(() => { tabs.register({ key: 'dir:connections', kind: 'dir', title: '连接', path: workspaceHref(workspaceId, '/connections') }); }, [workspaceId]);
  useEffect(() => {
    if (!workspaceId || !active) return;
    const controller = new AbortController(); setLoading(true); setError('');
    void client.list(controller.signal).then(response => { if (!controller.signal.aborted) setConnections(response.connections); })
      .catch((cause: Error) => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [client, workspaceId, refresh, active]);
  useEffect(() => { if (!active) return; window.addEventListener('focus', reload); return () => window.removeEventListener('focus', reload); }, [active, reload]);
  async function remove(connection: ExternalConnection) {
    setRemoving(connection.id); setError('');
    try { await client.remove(connection.id, connection.revision); setConnections(previous => previous.filter(item => item.id !== connection.id)); message.success('连接已删除。'); reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '连接删除失败。'); }
    finally { setRemoving(''); }
  }
  const mysqlConnections = connections.filter(isMySqlConnection);
  const categoryLabels: Record<string, string> = { 'data-source': '数据源', logs: '日志系统', configuration: '配置系统', scheduling: '调度系统' };
  const environments = [...new Set(connections.map(item => item.environment))].sort((left, right) => left.localeCompare(right));
  function openQuery(connection: ExternalConnection) {
    if (!isMySqlConnection(connection)) return;
    setEntry({ id: connection.id, nonce: Date.now() }); setTab('query');
  }
  const directory = <div className="buildr-connections-directory"><ResourceDirectory<ExternalConnection>
    title="连接" noun="连接" description="管理外部系统连接，供你和智能体（Agent）使用。"
    data={connections.filter(item => environment === undefined || item.environment === environment)} total={connections.length} showTotal
    loading={loading} error={error} onRefresh={reload} rowKey={item => item.id} name={item => item.name}
    summary={item => `${categoryLabels[item.category] || item.category} / ${item.type === 'mysql' ? 'MySQL' : item.type}`}
    nameContent={item => <div className="resource-name"><strong>{item.name}</strong><span>{categoryLabels[item.category] || item.category} / {item.type === 'mysql' ? 'MySQL' : item.type}</span></div>}
    searchText={item => `${item.name} ${item.environment} ${item.category} ${item.type} ${isMySqlConnection(item) ? `${item.config.host}:${item.config.port} ${item.config.defaultDatabase || ''} ${item.config.selectedDatabases.join(' ')}` : ''}`}
    query={query} onQueryChange={setQuery} searchPlaceholder="搜索名称、地址或数据库" searchId="connections-search" tableId="connections-table" countId="connections-count"
    filtered={environment !== undefined} onClearFilters={() => setEnvironment(undefined)}
    filters={<Select aria-label="筛选连接环境" allowClear value={environment} placeholder="全部环境" options={environments.map(value => ({ value, label: value || '未填写环境' }))} onChange={setEnvironment} />}
    actions={<Button id="create-mysql-connection" type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>新增连接</Button>}
    columns={[
      { title: '环境', dataIndex: 'environment', width: 120, render: value => <Tag>{value || '未填写'}</Tag> },
      { title: '地址 / 默认数据库', width: 360, render: (_, connection) => isMySqlConnection(connection) ? <div className="buildr-connection-address"><code>{connection.config.host}:{connection.config.port}</code><small>{connection.config.defaultDatabase || '未设置默认数据库'}</small></div> : '—' },
    ]}
    actionWidth={150} rowActions={connection => <><Button type="text" disabled={!isMySqlConnection(connection)} onClick={() => openQuery(connection)}>查询</Button><Button type="text" disabled={!isMySqlConnection(connection)} onClick={() => { if (isMySqlConnection(connection)) setEditing(connection); }}>编辑</Button><Dropdown trigger={['click']} menu={{ items: [{ key: 'delete', label: '删除连接', danger: true, disabled: removing === connection.id }], onClick: () => { modal.confirm({ title: '删除这个连接？', content: '只删除连接配置和本机认证，不删除外部系统中的内容。', okText: '删除', cancelText: '取消', okButtonProps: { danger: true }, onOk: () => remove(connection) }); } }}><Button type="text" aria-label={`更多操作：${connection.name}`} loading={removing === connection.id} icon={<MoreOutlined />} /></Dropdown></>}
  /></div>;
  return <div className="buildr-connections-page"><Tabs activeKey={tab} onChange={setTab} items={[
    { key: 'connections', label: '连接', children: directory },
    { key: 'query', label: 'MySQL 查询', children: <MySqlQuery connections={mysqlConnections} client={client} entry={entry} active={tab === 'query' && active} /> },
  ]} />{editing !== undefined && <ConnectionEditDrawer key={editing?.id || 'new'} connection={editing || undefined} environments={[...new Set(connections.map(item => item.environment))]} client={client} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); message.success('连接已保存。'); reload(); }} />}</div>;
}
