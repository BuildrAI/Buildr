import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { App, Button, ConfigProvider, Empty, Tabs, Tag } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppstoreOutlined, BranchesOutlined, DatabaseOutlined, FileTextOutlined, FolderOutlined, HomeOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { AppNavigationItem } from '../../app/AppNavigationItem';
import { WorkspaceViewActiveContext } from '../../app/pageTabs';
import { softProductTheme } from '../../theme';
import { usePrototypeBridge } from '../prototype-bridge';
import { ConnectionDirectory } from './ConnectionDirectory';
import { DataPage, type DataEntry } from './DataPage';
import { editConnection, initialConnections, newQuery, prepareSQL, simulateResult, type Connection } from './models';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import './preview.css';
function makeEntry(key: number, state = ''): DataEntry {
  const connection = initialConnections[0], query = newQuery('data-preview', connection, connection.databases[0]);
  let result = simulateResult(query, 'agent', connection.username), expanded = false, error: string | undefined;
  if (state === 'manual') return { key, connectionId: connection.id, database: query.target.database, sql: query.sql, expanded: true };
  if (state === 'empty') { query.sql = prepareSQL(query.target, 'O-0000'); result = simulateResult(query, 'human', connection.username); }
  if (state === 'limit500' || state === 'page2') { query.sql = prepareSQL(query.target, '').replace('LIMIT 100', 'LIMIT 500'); result = simulateResult(query, 'human', connection.username, state === 'page2' ? 500 : undefined); }
  if (state === 'error' || state === 'over-limit') {
    expanded = true; query.sql = state === 'error' ? 'DELETE FROM orders_qa.orders;' : prepareSQL(query.target, '').replace('LIMIT 100', 'LIMIT 501');
    try { simulateResult(query); } catch (cause) { error = cause instanceof Error ? cause.message : '查询未完成。'; }
  }
  return { key, connectionId: connection.id, database: query.target.database, sql: query.sql, result, expanded, error };
}
function Preview() {
  const { message } = App.useApp(), location = useLocation(), navigate = useNavigate();
  const [connections, setConnections] = useState(() => structuredClone(initialConnections)), [page, setPage] = useState('data'), [entry, setEntry] = useState(() => makeEntry(1)), [dataState, setDataState] = useState(''), [collapsed, setCollapsed] = useState(false);
  const nextEntry = useRef(2), current = useRef({ page: 'data', state: '' });
  const onConnections = location.pathname === '/connections';
  const area = location.pathname.startsWith('/workbench') ? 'workbench' : location.pathname.startsWith('/code') ? 'code' : 'workspace';
  function selectScene(selectedPage: string, state = '') { navigate('/connections'); setConnections(structuredClone(initialConnections)); if (selectedPage === 'connections') setPage('connections'); else { setEntry(makeEntry(nextEntry.current++, state)); setPage('data'); } }
  const bridge = usePrototypeBridge(scenes.pages, current, selectScene);
  useEffect(() => { if (onConnections) bridge.report(page, page === 'data' ? dataState : ''); }, [page, dataState, onConnections]);
  function query(connection: Connection) { const fresh = newQuery('data-preview', connection); setEntry({ key: nextEntry.current++, connectionId: connection.id, database: fresh.target.defaultDatabase || '', sql: fresh.sql, expanded: true }); setPage('data'); }
  function save(value: Connection) { setConnections(previous => { const before = previous.find(item => item.id === value.id); return before ? previous.map(item => item.id === value.id ? editConnection(before, value) : item) : [...previous, value]; }); message.success('连接配置已保存于本次演示，未连接实际系统。'); }
  const tabs = [{ key: 'connections', label: '连接', children: <WorkspaceViewActiveContext.Provider value={page === 'connections'}><ConnectionDirectory connections={connections} onQuery={query} onSave={save} /></WorkspaceViewActiveContext.Provider> }, { key: 'data', label: '查看数据', forceRender: true, children: <WorkspaceViewActiveContext.Provider value={page === 'data'}><DataPage connections={connections} entry={entry} onStateChange={setDataState} onVisibleDatabases={(id, visibleDatabases) => setConnections(previous => previous.map(item => item.id === id ? { ...item, visibleDatabases } : item))} /></WorkspaceViewActiveContext.Provider> }];
  const workspaceItems: Array<[string, string, ReactNode]> = [['workspace-overview', '总览', <HomeOutlined />], ['projects', '项目', <FolderOutlined />], ['services', '服务', <AppstoreOutlined />], ['repositories', '代码库', <BranchesOutlined />], ['connections', '连接', <DatabaseOutlined />], ['skills', '技能', <ThunderboltOutlined />], ['articles', '文章', <FileTextOutlined />]];
  const navItems = area === 'workspace' ? workspaceItems : area === 'code' ? [['code/explorer', '资源管理器', <FolderOutlined />], ['code/source-control', '源代码管理', <BranchesOutlined />]] as typeof workspaceItems : [['workbench', '概览', <HomeOutlined />], ['tasks', '任务', <AppstoreOutlined />], ['activity', '动态', <FileTextOutlined />]] as typeof workspaceItems;
  const navigation = <nav className="shell-navigation" aria-label="工作空间导航">{navItems.map(([key, label, icon]) => <AppNavigationItem key={key} to={`/${key}`} path={`/${key}`} name={key} label={label} icon={icon} active={location.pathname === `/${key}`} />)}</nav>;
  return <div className={`app-shell connections-preview area-${area}`}><AppShellHeader brandHref="/connections" workspaceName="产品研发 · 演示" workspaceMenuItems={[{ key: 'demo', label: '产品研发 · 演示工作空间' }]} area={area} workbenchHref="/workbench" codeHref="/code/explorer" workspaceDestination={{ to: '/connections' }} actions={<Tag>离线原型 · 虚构数据</Tag>} /><AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed(value => !value)} navigation={navigation}>{onConnections ? <Tabs className="connections-page-tabs" activeKey={page} items={tabs} onChange={setPage} /> : <div className="connections-existing-page"><Empty description="本次原型仅包含连接和查看数据。"><Button onClick={() => navigate('/connections')}>返回连接</Button></Empty></div>}</AppShellFrame></div>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}><App><MemoryRouter initialEntries={['/connections']}><Preview /></MemoryRouter></App></ConfigProvider>);
