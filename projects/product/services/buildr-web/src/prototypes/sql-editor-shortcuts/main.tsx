import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { App, Button, ConfigProvider, Tag } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppstoreOutlined, BranchesOutlined, DatabaseOutlined, FileTextOutlined, FolderOutlined, HomeOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { AppNavigationItem } from '../../app/AppNavigationItem';
import { MySqlQuery } from '../../features/mysql-query/components/MySqlQuery';
import type { MySqlQueryClient, MySqlQueryTarget, QueryPreferences } from '../../features/mysql-query/query-types';
import { softProductTheme } from '../../theme';
import { WorkspaceStage } from '../../components/WorkspaceStage';
import { ResourceDirectory } from '../../components/ResourceDirectory';
import { WorkspaceTabsContext } from '../../app/pageTabs';
import { usePrototypeBridge } from '../prototype-bridge';
import { PrototypeSession, ShortcutContext } from './fixtures';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import './preview.css';

const connections: MySqlQueryTarget[] = [{ id: 'demo-qa', name: '业务演示', environment: '测试环境', revision: 'demo-qa-v1' }, { id: 'demo-dev', name: '本机演示', environment: '开发环境', revision: 'demo-dev-v1' }];
function demoClient(session: PrototypeSession): MySqlQueryClient {
  const stored = new Map<string, QueryPreferences>();
  const get = (id: string) => {
    if (!stored.has(id)) stored.set(id, { enabledDatabases: ['saas_freshx', 'saasx', 'trading_business'], currentDatabase: 'saas_freshx', revision: 'demo-1' });
    return stored.get(id)!;
  };
  return {
    async databases(id) { return { connectionId: id, databases: ['saas_freshx', 'saasx', 'trading_business'] }; },
    async tables(id, database, signal) { return { connectionId: id, database, tables: await session.tables(database, signal) }; },
    async queryPreferences(id) { const value = get(id); return value; },
    async saveQueryPreferences(id, input) { const value = { enabledDatabases: input.enabledDatabases, currentDatabase: input.currentDatabase, revision: 'demo-' + (Number(get(id).revision.split('-')[1]) + 1) }; stored.set(id, value); return value; },
    async query(id, input) { return { connectionId: id, database: input.database || null, submittedSql: input.sql, executedSql: input.sql, columns: [{ name: 'id', type: 'INT' }, { name: 'name', type: 'VARCHAR' }, { name: 'status', type: 'VARCHAR' }], rows: [[1001, '演示记录一', 'active'], [1002, '演示记录二', 'active'], [1003, '演示记录三', 'pending']], rowCount: 3, rowLimit: 100, elapsedMs: 12, limitReached: false }; },
  };
}
function QueryScene({ scene }: { scene: string }) {
  const session = useMemo(() => new PrototypeSession(scene), [scene]);
  const client = useMemo(() => demoClient(session), [session]);
  useEffect(() => () => session.dispose(), [session]);
  return <ShortcutContext.Provider value={session}><MySqlQuery connections={connections} client={client} entry={null} active layoutKey="sql-shortcut-prototype" /></ShortcutContext.Provider>;
}
function Preview() {
  const [pageCollapsed, setPageCollapsed] = useState(true), [queryOpen, setQueryOpen] = useState(true), [ratio, setRatio] = useState<number | null>(0.72);
  const [scene, setScene] = useState(''), [generation, setGeneration] = useState(0), [collapsed, setCollapsed] = useState(false);
  const current = useRef({ page: 'query', state: '' });
  const bridge = usePrototypeBridge(scenes.pages, current, (_page, state) => { setScene(state); setGeneration(value => value + 1); });
  useEffect(() => { bridge.report('query', scene); }, [scene]);
  const { message } = App.useApp();
  const info = () => { void message.info('当前演示查询快捷操作，其他入口保留为页面上下文。'); };
  const nav = [ ['overview','总览',<HomeOutlined />], ['projects','项目',<FolderOutlined />], ['services','服务',<AppstoreOutlined />], ['repositories','代码库',<BranchesOutlined />], ['skills','技能',<ThunderboltOutlined />], ['articles','文章',<FileTextOutlined />], ['connection-skills','连接',<DatabaseOutlined />] ] as const;
  const tab = { key: 'dir:connection-skills', kind: 'dir' as const, title: '连接', path: '/connection-skills' };
  return <WorkspaceTabsContext.Provider value={{ tabs: [tab], register: () => {}, close: info, reorder: () => {}, reportPaneWidth: () => {}, ratio, setRatio }}><div className="app-shell area-workspace sql-shortcuts-preview">
    <AppShellHeader development brandHref="/connection-skills" workspaceName="Buildr" workspaceMenuItems={[{ key: 'demo', label: 'Buildr · 演示数据' }]} area="workspace" workbenchHref="/connection-skills" workspaceDestination={{ to: '/connection-skills' }} actions={<><Tag color="default">演示数据</Tag><Button type="text" onClick={info}>退出</Button></>} />
    <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed(value => !value)} navigation={<nav className="shell-navigation" aria-label="工作空间导航"><p className="shell-nav-caption">工作空间</p>{nav.map(([id,label,icon]) => <AppNavigationItem key={id} name={id} label={label} icon={icon} to={'/' + id} path={'/' + id} active={id === 'connection-skills'} onClick={event => { event.preventDefault(); if (id !== 'connection-skills') info(); }} />)}</nav>}>
      <div className="workspace-pages"><div className="workspace-page-stack"><div className="workspace-page"><WorkspaceStage pageTabs={[tab]} onClosePageTab={info} objectTabs={queryOpen ? [{ key: 'mysql-query', kind: 'doc', title: 'MySQL 查询' }] : []} activeObject={queryOpen ? 'mysql-query' : null} onCloseObject={() => setQueryOpen(false)} onActivateObject={() => setQueryOpen(true)} objectContentLayout="fill" objectLabel="查询" pageCollapse={{ collapsed: pageCollapsed, onChange: setPageCollapsed }} collapsePresentation="header" objectContent={<QueryScene key={scene + ':' + generation} scene={scene} />}>
        <ResourceDirectory title="连接" noun="连接" description="管理团队使用的外部系统，供你和智能体（Agent）使用。" data={connections} rowKey={item => item.id} name={item => item.name} summary={() => '数据库 · MySQL'} searchText={item => item.name + item.environment} onRefresh={info} onOpen={() => { setQueryOpen(true); setPageCollapsed(true); }} columns={[{ title: '环境 / 状态', render: (_, item) => <><Tag>{item.environment}</Tag><Tag>已配置</Tag></> }]} rowActions={() => <Button type="text" onClick={() => { setQueryOpen(true); setPageCollapsed(true); }}>查询</Button>} actions={<Button type="primary" onClick={info}>新增连接</Button>} />
      </WorkspaceStage></div></div></div>
    </AppShellFrame>
  </div></WorkspaceTabsContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}><App><MemoryRouter initialEntries={['/connection-skills']}><Preview /></MemoryRouter></App></ConfigProvider>);
