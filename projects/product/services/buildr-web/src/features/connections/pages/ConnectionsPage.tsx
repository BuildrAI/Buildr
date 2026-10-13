import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Popconfirm, Space, Table, Tabs, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '../../../api';
import { useAppShell } from '../../../app/AppShellContext';
import { WorkspaceViewActiveContext, useWorkspacePageTabs } from '../../../app/pageTabs';
import { workspaceHref } from '../../../lib/labels';
import { RefreshButton } from '../../../components/RefreshButton';
import { createConnectionClient } from '../api/connection-api';
import { isMySqlConnection, type ExternalConnection, type MySqlConnection } from '../connection-types';
import { ConnectionEditDrawer } from '../components/ConnectionEditDrawer';
import { MySqlQuery } from '../components/MySqlQuery';
import '../connections.css';

export function ConnectionsPage() {
  const { workspaceId } = useAppShell(), tabs = useWorkspacePageTabs(workspaceId), active = useContext(WorkspaceViewActiveContext), { message } = App.useApp();
  const client = useMemo(() => createConnectionClient(api, workspaceId || ''), [workspaceId]);
  const [connections, setConnections] = useState<ExternalConnection[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState('connections'), [editing, setEditing] = useState<MySqlConnection | null>(), [removing, setRemoving] = useState('');
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
  const directory = <section className="buildr-connections-directory"><header className="page-header"><div><h1>连接</h1><p>管理外部系统连接，供你和智能体（Agent）使用。</p></div><Space><RefreshButton label="刷新连接" loading={loading} onClick={reload} /><Button id="create-mysql-connection" type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>新增连接</Button></Space></header>
    {error && <Alert type="error" showIcon message={error} />}
    <Table<ExternalConnection> id="connections-table" size="middle" rowKey="id" loading={loading} dataSource={connections} pagination={false} scroll={{ x: 870 }} locale={{ emptyText: '还没有连接，添加一个 MySQL 连接开始查询。' }} columns={[
      { title: '名称', dataIndex: 'name', width: 170 },
      { title: '环境', dataIndex: 'environment', width: 120, render: value => <Tag>{value}</Tag> },
      { title: '类别 / 类型', width: 150, render: (_, connection) => `${categoryLabels[connection.category] || connection.category} / ${connection.type === 'mysql' ? 'MySQL' : connection.type}` },
      { title: '地址 / 默认数据库', render: (_, connection) => isMySqlConnection(connection) ? <div className="buildr-connection-address"><code>{connection.config.host}:{connection.config.port}</code><small>{connection.config.defaultDatabase || '未设置默认数据库'}</small></div> : '—' },
      { title: '操作', width: 185, render: (_, connection) => <Space size={0}><Button type="link" disabled={!isMySqlConnection(connection)} onClick={() => { setEntry({ id: connection.id, nonce: Date.now() }); setTab('query'); }}>查询</Button><Button type="link" disabled={!isMySqlConnection(connection)} onClick={() => { if (isMySqlConnection(connection)) setEditing(connection); }}>编辑</Button><Popconfirm title="删除这个连接？" description="只删除连接配置和本机认证，不删除外部系统中的内容。" okText="删除" cancelText="取消" onConfirm={() => remove(connection)}><Button type="link" danger loading={removing === connection.id}>删除</Button></Popconfirm></Space> },
    ]} />
  </section>;
  return <div className="buildr-connections-page"><Tabs activeKey={tab} onChange={setTab} items={[
    { key: 'connections', label: '连接', children: directory },
    { key: 'query', label: 'MySQL 查询', children: <MySqlQuery connections={mysqlConnections} client={client} entry={entry} active={tab === 'query' && active} /> },
  ]} />{editing !== undefined && <ConnectionEditDrawer key={editing?.id || 'new'} connection={editing || undefined} environments={[...new Set(connections.map(item => item.environment))]} client={client} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); message.success('连接已保存。'); reload(); }} />}</div>;
}
