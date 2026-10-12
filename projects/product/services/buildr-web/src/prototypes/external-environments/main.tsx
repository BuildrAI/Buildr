import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { Alert, App, Button, ConfigProvider, Empty, Input, Modal, Select, Table, Tabs, Tag, Tree } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppstoreOutlined, BranchesOutlined, CheckCircleOutlined, DatabaseOutlined, FileTextOutlined, FolderOutlined, HomeOutlined, LinkOutlined, PlayCircleOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { AppNavigationItem } from '../../app/AppNavigationItem';
import { ResizablePanels } from '../../components/ResizablePanels';
import { softProductTheme } from '../../theme';
import { usePrototypeBridge } from '../prototype-bridge';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';
import './preview.css';

type EnvironmentId = 'qa' | 'prod';
type Order = { id: string; customer: string; amount: number; status: string; created_at: string };
type Result = { status: 'idle' | 'running' | 'success' | 'failure'; rows: Order[]; completedAt: string; truncated: boolean; error?: string };
type Query = { environment: EnvironmentId; connectionId: string; database: string; sql: string; result: Result };
const environments: Record<EnvironmentId, { name: string; purpose: string; endpoint: string; identity: string }> = {
  qa: { name: '测试环境', purpose: '联调与验证使用', endpoint: 'qa-mysql.example.invalid:3306', identity: 'orders-qa-reader' },
  prod: { name: '生产环境', purpose: '查看线上业务现场', endpoint: 'prod-mysql.example.invalid:3306', identity: 'orders-prod-reader' },
};
const defaultSql = 'SELECT id, customer, amount, status, created_at\nFROM orders_demo.orders\nORDER BY created_at DESC\nLIMIT 100;';
const sampleOrders: Order[] = [
  { id: 'DEMO-1006', customer: '示例客户 F', amount: 268, status: 'PAID', created_at: '2026-10-12 13:46:12' },
  { id: 'DEMO-1005', customer: '示例客户 E', amount: 128, status: 'PAID', created_at: '2026-10-12 13:42:06' },
  { id: 'DEMO-1004', customer: '示例客户 D', amount: 356, status: 'PENDING', created_at: '2026-10-12 13:39:25' },
  { id: 'DEMO-1003', customer: '示例客户 C', amount: 89, status: 'CANCELLED', created_at: '2026-10-12 13:35:18' },
  { id: 'DEMO-1002', customer: '示例客户 B', amount: 420, status: 'PAID', created_at: '2026-10-12 13:31:09' },
  { id: 'DEMO-1001', customer: '示例客户 A', amount: 196, status: 'PENDING', created_at: '2026-10-12 13:26:43' },
];
const emptyResult = (): Result => ({ status: 'idle', rows: [], completedAt: '', truncated: false });
const timestamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
function resultFixture(environment: EnvironmentId, truncated = false): Result {
  const rows = environment === 'qa' ? sampleOrders : sampleOrders.map(row => ({ ...row, id: row.id.replace('DEMO-', 'DEMO-P-') }));
  return { status: 'success', rows: truncated ? rows.slice(0, 3) : rows, completedAt: '2026-10-12 14:00:00', truncated };
}
function queryFixture(environment: EnvironmentId, ready = false): Query {
  return { environment, connectionId: `orders-mysql-${environment}`, database: 'orders_demo', sql: defaultSql, result: ready ? resultFixture(environment) : emptyResult() };
}
function EnvironmentTag({ environment }: { environment: EnvironmentId }) {
  return <Tag className={`external-env-tag environment-${environment}`}>{environments[environment].name} · {environment}</Tag>;
}
const columns = [
  { title: 'id', dataIndex: 'id', width: 148 },
  { title: 'customer', dataIndex: 'customer', width: 132 },
  { title: 'amount', dataIndex: 'amount', width: 96, align: 'right' as const, render: (value: number) => value.toFixed(2) },
  { title: 'status', dataIndex: 'status', width: 126 },
  { title: 'created_at', dataIndex: 'created_at', width: 188 },
];

function Preview() {
  const { message } = App.useApp();
  const location = useLocation(), navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [activeKey, setActiveKey] = useState('directory');
  const [directoryFilter, setDirectoryFilter] = useState('all');
  const [detailEnvironment, setDetailEnvironment] = useState<EnvironmentId>('qa');
  const [detailOpen, setDetailOpen] = useState(false);
  const [bound, setBound] = useState<Record<EnvironmentId, boolean>>({ qa: true, prod: true });
  const [queries, setQueries] = useState<Partial<Record<EnvironmentId, Query>>>({});
  const [bindingEnvironment, setBindingEnvironment] = useState<EnvironmentId | null>(null);
  const [checkTimes, setCheckTimes] = useState<Record<EnvironmentId, string>>({ qa: '2026-10-12 14:00:00', prod: '2026-10-12 13:55:00' });
  const timers = useRef(new Map<EnvironmentId, ReturnType<typeof setTimeout>>());
  const current = useRef({ page: 'directory', state: '' });
  const area = location.pathname.startsWith('/workbench') ? 'workbench' : location.pathname.startsWith('/code') ? 'code' : 'workspace';
  const onEnvironmentPage = location.pathname === '/environments';

  function clearTimers() { timers.current.forEach(clearTimeout); timers.current.clear(); }
  useEffect(() => clearTimers, []);
  function selectScene(page: string, state = '') {
    clearTimers(); setBindingEnvironment(null); navigate('/environments');
    setBound({ qa: true, prod: true }); setDirectoryFilter('all'); setDetailOpen(page === 'connection');
    setDetailEnvironment(state === 'prod' || state === 'unbound' ? 'prod' : 'qa');
    if (page === 'directory') { setQueries({}); setActiveKey('directory'); setDirectoryFilter(state || 'all'); }
    else if (page === 'connection') { setQueries({}); setActiveKey('connection'); if (state === 'unbound') setBound({ qa: true, prod: false }); }
    else {
      const environment = state === 'prod' || state === 'unbound' ? 'prod' : 'qa';
      const query = queryFixture(environment, state !== 'idle' && state !== 'unbound');
      if (state === 'failure') query.result = { ...emptyResult(), status: 'failure', completedAt: '2026-10-12 14:00:00', error: '模拟连接超时，未返回结果。可以重试，其他查询保持原状。' };
      if (state === 'truncated') { query.sql = defaultSql.replace('100', '3'); query.result = resultFixture(environment, true); }
      setQueries(state === 'paired' ? { qa: queryFixture('qa', true), prod: queryFixture('prod', true) } : { [environment]: query });
      if (state === 'unbound') setBound({ qa: true, prod: false });
      setActiveKey(`query-${environment}`);
    }
  }
  const bridge = usePrototypeBridge(scenes.pages, current, selectScene);
  const activeEnvironment = activeKey === 'query-prod' ? 'prod' : 'qa';
  const activeQuery = queries[activeEnvironment];
  useEffect(() => {
    if (!onEnvironmentPage) return;
    if (activeKey === 'directory') bridge.report('directory', directoryFilter === 'all' ? '' : directoryFilter);
    else if (activeKey === 'connection') bridge.report('connection', !bound[detailEnvironment] ? 'unbound' : detailEnvironment === 'prod' ? 'prod' : '');
    else if (activeQuery) {
      const result = activeQuery.result;
      bridge.report('query', !bound[activeEnvironment] ? 'unbound' : result.status === 'failure' ? 'failure' : result.truncated ? 'truncated' : result.status === 'idle' ? 'idle' : activeEnvironment === 'prod' ? 'prod' : queries.qa && queries.prod ? 'paired' : '');
    }
  }, [activeKey, directoryFilter, detailEnvironment, bound, activeQuery?.result.status, activeQuery?.result.truncated, Boolean(queries.qa), Boolean(queries.prod), onEnvironmentPage]);

  function openConnection(environment: EnvironmentId) { setDetailEnvironment(environment); setDetailOpen(true); setActiveKey('connection'); }
  function openQuery(environment: EnvironmentId) { setQueries(previous => ({ ...previous, [environment]: previous[environment] || queryFixture(environment) })); setActiveKey(`query-${environment}`); }
  function updateQuery(environment: EnvironmentId, change: Partial<Query>) { setQueries(previous => previous[environment] ? { ...previous, [environment]: { ...previous[environment]!, ...change } } : previous); }
  function runQuery(environment: EnvironmentId) {
    const query = queries[environment]; if (!query || !bound[environment] || query.result.status === 'running') return;
    const sql = query.sql.trim();
    const supported = /^SELECT\s+(?:\*|id\s*,\s*customer\s*,\s*amount\s*,\s*status\s*,\s*created_at)\s+FROM\s+(?:orders_demo\.)?orders(?:\s+WHERE\s+status\s*=\s*['"](?:PAID|PENDING|CANCELLED)['"])?(?:\s+ORDER\s+BY\s+created_at\s+DESC)?(?:\s+LIMIT\s+\d+)?\s*;?$/i.test(sql);
    if (!supported) {
      updateQuery(environment, { result: { ...emptyResult(), status: 'failure', completedAt: timestamp(), error: '此演示仅支持 orders 表的示例 SELECT、status 等值筛选和 LIMIT；其他语句未执行。可用“示例查询”恢复语句。' } }); return;
    }
    updateQuery(environment, { result: { ...emptyResult(), status: 'running' } });
    const sqlAtStart = sql;
    timers.current.set(environment, setTimeout(() => {
      timers.current.delete(environment);
      let rows = resultFixture(environment).rows;
      const status = sqlAtStart.match(/\bWHERE\s+status\s*=\s*['"](PAID|PENDING|CANCELLED)['"]/i)?.[1]?.toUpperCase();
      if (status) rows = rows.filter(row => row.status === status);
      const limit = Math.max(0, Math.min(100, Number(sqlAtStart.match(/\bLIMIT\s+(\d+)/i)?.[1] ?? 100)));
      const result = { status: 'success' as const, rows: rows.slice(0, limit), completedAt: timestamp(), truncated: rows.length > limit };
      setQueries(previous => previous[environment] ? { ...previous, [environment]: { ...previous[environment]!, result } } : previous);
    }, 420));
  }
  function closeTab(key: string) {
    if (key === 'connection') setDetailOpen(false);
    else if (key.startsWith('query-')) {
      const environment = key.slice(6) as EnvironmentId; const timer = timers.current.get(environment); if (timer) clearTimeout(timer); timers.current.delete(environment);
      setQueries(previous => { const next = { ...previous }; delete next[environment]; return next; });
    }
    if (activeKey === key) setActiveKey('directory');
  }
  function ConnectionFacts({ environment }: { environment: EnvironmentId }) {
    const data = environments[environment];
    return <dl className="external-connection-facts"><div><dt>连接标识</dt><dd><code>orders-mysql-{environment}</code></dd></div><div><dt>系统类型</dt><dd>MySQL</dd></div><div><dt>目标地址</dt><dd><code>{data.endpoint}</code><small>示例地址，不连接真实系统</small></dd></div><div><dt>资源范围</dt><dd><code>orders_demo</code> / <code>orders</code></dd></div><div><dt>引用服务</dt><dd>订单服务 <code>orders-api</code></dd></div><div><dt>执行位置</dt><dd>当前本机 · 演示</dd></div></dl>;
  }
  const directory = <section className="external-directory">
    <header className="page-header"><div><p className="eyebrow">工作空间</p><h1>环境</h1><p className="page-copy">找到当前环境中的数据、配置与日志。本次先演示 MySQL 查询。</p></div><Tag>模拟数据</Tag></header>
    <div className="external-directory-toolbar" data-prototype-position="environment-filter"><Select aria-label="筛选环境" value={directoryFilter} onChange={setDirectoryFilter} options={[{ value: 'all', label: '全部环境' }, { value: 'qa', label: '测试环境 · qa' }, { value: 'prod', label: '生产环境 · prod' }]} /><span>已打开的查询保留各自目标，筛选仅影响此目录。</span></div>
    <div className="external-environment-groups" data-prototype-position="environment-groups">{(['qa', 'prod'] as const).filter(environment => directoryFilter === 'all' || directoryFilter === environment).map(environment => <section key={environment} className={`external-environment-group environment-${environment}`}>
      <div className="external-environment-heading"><div><EnvironmentTag environment={environment} /><p>{environments[environment].purpose}</p></div><span>1 个连接</span></div>
      <article className="external-connection-card"><div className="external-connection-title"><DatabaseOutlined /><div><h2>订单 MySQL</h2><code>orders-mysql-{environment}</code></div></div><p>订单服务使用的数据查询入口</p><dl><div><dt>数据库</dt><dd><code>orders_demo</code></dd></div><div><dt>本机身份</dt><dd>{bound[environment] ? <span className="external-bound"><CheckCircleOutlined /> 已绑定 · 模拟</span> : '尚未绑定'}</dd></div></dl><div className="external-card-actions"><Button onClick={() => openConnection(environment)}>查看连接</Button><Button type="primary" icon={<PlayCircleOutlined />} onClick={() => openQuery(environment)}>打开查询</Button></div></article>
    </section>)}</div>
    <p className="external-footnote">qa 与 prod 分别登记连接和本机身份；此处展示关联关系，不代表网络隔离已经验证。</p>
  </section>;
  const detail = <section className="external-connection-detail">
    <header className="page-header"><div><p className="eyebrow">环境 / {detailEnvironment}</p><h1>订单 MySQL</h1><p className="page-copy">查看目标、资源范围与当前本机的使用身份。</p></div><EnvironmentTag environment={detailEnvironment} /></header>
    <div className="external-detail-grid"><section className="external-detail-section" data-prototype-position="connection-target"><h2>连接目标</h2><ConnectionFacts environment={detailEnvironment} /></section><section className="external-detail-section" data-prototype-position="local-binding"><h2>当前本机</h2><p className="external-binding-state">{bound[detailEnvironment] ? <><CheckCircleOutlined /> 身份已绑定 · 模拟</> : <><LinkOutlined /> 尚未绑定身份</>}</p><dl className="external-connection-facts"><div><dt>认证来源</dt><dd>{bound[detailEnvironment] ? '系统钥匙串（Keychain） · 模拟引用' : '未选择'}<small>这里只登记来源引用，不显示凭据值。</small></dd></div><div><dt>使用身份</dt><dd>{bound[detailEnvironment] ? <code>{environments[detailEnvironment].identity}</code> : '未绑定'}</dd></div><div><dt>操作范围</dt><dd>仅查询，不提供数据修改</dd></div><div><dt>操作入口</dt><dd>MySQL 对接器（Connector） · 演示</dd></div><div><dt>最近检查</dt><dd>{bound[detailEnvironment] ? <>{checkTimes[detailEnvironment]}<small>模拟检查成功；未访问实际系统。</small></> : '尚未检查'}</dd></div></dl><div className="external-card-actions"><Button onClick={() => setBindingEnvironment(detailEnvironment)}>{bound[detailEnvironment] ? '查看身份绑定' : '绑定本机身份'}</Button><Button disabled={!bound[detailEnvironment]} onClick={() => { setCheckTimes(previous => ({ ...previous, [detailEnvironment]: timestamp() })); message.success('模拟检查完成，没有访问实际系统。'); }}>模拟检查</Button></div></section></div>
    {!bound[detailEnvironment] && <Alert type="warning" showIcon message="登记信息可以查看，查询需要先绑定本机身份。" />}
    <div className="external-detail-footer"><Button onClick={() => setActiveKey('directory')}>返回环境目录</Button><Button type="primary" icon={<PlayCircleOutlined />} onClick={() => openQuery(detailEnvironment)}>打开查询</Button></div>
  </section>;
  function queryContent(environment: EnvironmentId, query: Query) {
    const result = query.result;
    const schema = <aside className="external-schema" data-prototype-position="database-structure"><h2>数据库结构</h2><p><code>{query.database}</code></p><Tree defaultExpandAll selectedKeys={['orders']} treeData={[{ title: 'orders_demo', key: 'database', icon: <DatabaseOutlined />, children: [{ title: 'orders', key: 'orders', children: [{ title: 'id · varchar', key: 'id' }, { title: 'customer · varchar', key: 'customer' }, { title: 'amount · decimal', key: 'amount' }, { title: 'status · varchar', key: 'status' }, { title: 'created_at · datetime', key: 'created_at' }] }] }]} /><p className="external-schema-note">示例结构 · 仅开放 orders 表</p></aside>;
    const results = <section className="external-results" data-prototype-position="query-result"><div className="external-results-header"><h2>查询结果 <Tag>模拟</Tag></h2>{result.status === 'success' && <span>{result.rows.length} 行 · 模拟耗时 76 ms</span>}</div>
      {result.status === 'success' ? <><div className="external-result-evidence"><span>目标：{environment} / {query.connectionId} / {query.database}</span><span>完成：{result.completedAt}（UTC+8）</span><span className={result.truncated ? 'external-truncated' : ''}>{result.truncated ? `结果已截断：仅显示前 ${result.rows.length} 行，完整行数未统计` : '未截断：本次示例结果全部显示'}</span></div><Table<Order> size="small" rowKey="id" columns={columns} dataSource={result.rows} pagination={false} scroll={{ x: 690 }} /></> : result.status === 'failure' ? <Alert type="error" showIcon message="查询未完成 · 模拟" description={<>{result.error}<p>目标：{environment} / {query.connectionId} / {query.database} · {result.completedAt}（UTC+8）</p></>} action={<Button disabled={!bound[environment]} onClick={() => runQuery(environment)}>重试</Button>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={result.status === 'running' ? '正在生成模拟结果…' : '执行示例查询后，在这里查看结果。'} />}
    </section>;
    const editor = <section className="external-query-editor" data-prototype-position="query-editor"><div className="external-editor-heading"><h2>查询语句（SQL）</h2><Button type="text" size="small" onClick={() => updateQuery(environment, { sql: defaultSql })}>示例查询</Button></div><Input.TextArea aria-label={`${environment} 查询语句`} value={query.sql} onChange={event => updateQuery(environment, { sql: event.target.value })} spellCheck={false} autoSize={false} /><div className="external-query-actions"><span>单条示例查询 · 最多 100 行 · 全部数据为模拟</span><Button type="primary" icon={<PlayCircleOutlined />} loading={result.status === 'running'} disabled={!bound[environment]} onClick={() => runQuery(environment)}>运行查询</Button></div></section>;
    return <div className="external-query-page"><div className={`external-query-target environment-${environment}`} data-prototype-position="fixed-query-target"><div><EnvironmentTag environment={environment} /><strong>订单 MySQL</strong><span>/</span><code>{query.database}</code><Tag>仅查询</Tag></div><small>此查询固定使用 <code>{query.connectionId}</code>；目录筛选和其他查询不会改变目标。</small></div>
      {!bound[environment] && <Alert className="external-query-binding-alert" type="warning" showIcon message="当前连接尚未绑定本机身份，查询暂不可执行。" action={<Button onClick={() => setBindingEnvironment(environment)}>绑定本机身份</Button>} />}
      <ResizablePanels className="external-database-layout" initialSize={210} minFirst={160} minSecond={390} separatorLabel="调整结构区与查询区宽度" first={schema} second={<ResizablePanels className="external-query-layout" direction="vertical" initialRatio={0.46} minFirst={200} minSecond={190} separatorLabel="调整查询语句与结果高度" first={editor} second={results} />} />
    </div>;
  }
  const tabItems = [{ key: 'directory', label: '环境目录', closable: false, children: directory }, ...(detailOpen ? [{ key: 'connection', label: `连接 · ${detailEnvironment}`, children: detail }] : []), ...(['qa', 'prod'] as const).flatMap(environment => queries[environment] ? [{ key: `query-${environment}`, label: <span className="external-query-tab"><DatabaseOutlined />{environment} · 订单查询</span>, children: queryContent(environment, queries[environment]!) }] : [])];
  const workspaceNav: Array<[string, string, ReactNode]> = [['workspace-overview', '总览', <HomeOutlined />], ['projects', '项目', <FolderOutlined />], ['services', '服务', <AppstoreOutlined />], ['repositories', '代码库', <BranchesOutlined />], ['environments', '环境', <DatabaseOutlined />], ['skills', '技能', <ThunderboltOutlined />], ['articles', '文章', <FileTextOutlined />]];
  const navigation = <nav className="shell-navigation" aria-label={area === 'workspace' ? '工作空间导航' : area === 'code' ? '代码导航' : '工作台导航'}>{(area === 'workspace' ? workspaceNav : area === 'code' ? [['code/explorer', '资源管理器', <FolderOutlined />], ['code/source-control', '源代码管理', <BranchesOutlined />]] as typeof workspaceNav : [['workbench', '概览', <HomeOutlined />], ['tasks', '任务', <AppstoreOutlined />], ['activity', '动态', <FileTextOutlined />]] as typeof workspaceNav).map(([key, label, icon]) => <AppNavigationItem key={key} to={`/${key}`} path={`/${key}`} name={key} label={label} icon={icon} active={location.pathname === `/${key}`} />)}</nav>;
  return <div className={`app-shell external-environments-preview area-${area}`}><AppShellHeader brandHref="/environments" workspaceName="产品研发 · 演示" workspaceMenuItems={[{ key: 'demo', label: '产品研发 · 演示工作空间' }]} area={area} workbenchHref="/workbench" codeHref="/code/explorer" workspaceDestination={{ to: '/environments' }} actions={<><Tag>交互原型</Tag><Button type="text" icon={<SearchOutlined />} disabled aria-label="查找" /><Button type="primary" onClick={() => message.info('此原型只演示环境与查询，没有发送消息或启动智能体（Agent）。')}>交给智能体（Agent）</Button></>} />
    <AppShellFrame sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed(value => !value)} navigation={navigation}>{onEnvironmentPage ? <Tabs className="external-page-tabs" type="editable-card" hideAdd activeKey={activeKey} items={tabItems} onChange={setActiveKey} onEdit={(key, action) => { if (action === 'remove' && typeof key === 'string') closeTab(key); }} /> : <div className="external-existing-page"><Empty description="此处沿用现有模块，本次原型聚焦环境与 MySQL 查询。"><Button type="primary" onClick={() => navigate('/environments')}>查看环境</Button></Empty></div>}</AppShellFrame>
    <Modal title="本机身份绑定 · 模拟" open={bindingEnvironment !== null} onCancel={() => setBindingEnvironment(null)} okText="采用此模拟身份" onOk={() => { if (bindingEnvironment) { setBound(previous => ({ ...previous, [bindingEnvironment]: true })); setBindingEnvironment(null); message.success('已在本次演示中绑定，未读取或保存实际凭据。'); } }}><p>目标：{bindingEnvironment && <EnvironmentTag environment={bindingEnvironment} />}订单 MySQL</p><label className="external-binding-label">认证来源引用<Select aria-label="认证来源引用" value="keychain" options={[{ value: 'keychain', label: '系统钥匙串（Keychain） · 演示身份' }]} /></label><p className="page-copy">身份：<code>{bindingEnvironment && environments[bindingEnvironment].identity}</code>。这一步只改变本次演示；不访问钥匙串、不保存凭据。</p></Modal>
  </div>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}><App><MemoryRouter initialEntries={['/environments']}><Preview /></MemoryRouter></App></ConfigProvider>);
