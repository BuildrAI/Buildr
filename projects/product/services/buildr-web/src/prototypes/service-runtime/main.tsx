import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { App, ConfigProvider, Tag } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  AppstoreOutlined,
  BranchesOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  FolderOutlined,
  HomeOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { AppShellHeader, AppShellFrame } from '../../app/AppShellView';
import { AppNavigationItem } from '../../app/AppNavigationItem';
import { PageTabStrip } from '../../app/PageTabStrip';
import { softProductTheme } from '../../theme';
import { usePrototypeBridge } from '../prototype-bridge';
import scenes from './scenes.json';
import { WorkbenchPage } from './WorkbenchPage';
import { ServiceDirectory } from './ServiceDirectory';
import { ServiceDetail } from './ServiceDetail';
import { StartWorktreeDrawer } from './StartWorktreeDrawer';
import { QaDeployDrawer } from './QaDeployDrawer';
import { LocalLogsDrawer } from './LocalLogsDrawer';
import { AgentDiscoveryDrawer } from './AgentDiscoveryDrawer';
import {
  createRunLogs,
  createServices,
  nextAvailablePort,
  type Service,
} from './model';
import type { WorkspacePageTab } from '../../app/workspace-pages';
import 'antd/dist/reset.css';
import '../../styles.css';
import './preview.css';

const WORKBENCH = '/workspaces/preview/workbench';
const SERVICES = '/workspaces/preview/services';
const servicePath = (id: string) => `${SERVICES}/${encodeURIComponent(id)}`;

type PageId = 'workbench' | 'directory' | 'service';

type DrawerState =
  | { kind: 'start'; serviceId: string }
  | { kind: 'qa'; serviceId: string }
  | { kind: 'logs'; serviceId: string; runId: string }
  | { kind: 'discovery'; serviceId: string }
  | null;

function asPage(value: string): PageId {
  return value === 'workbench' || value === 'directory' || value === 'service' ? value : 'workbench';
}

function pageForRoute(pathname: string): PageId {
  if (pathname === WORKBENCH) return 'workbench';
  if (pathname === SERVICES) return 'directory';
  return 'service';
}

function routeForPage(page: PageId, state: string) {
  if (page === 'workbench') return WORKBENCH;
  if (page === 'directory') return SERVICES;
  if (state === 'unconfigured' || state === 'discovery') return servicePath('freshx-nm');
  return servicePath('freshx-pigs');
}

function drawerForPageState(page: PageId, state: string): DrawerState {
  if (page !== 'service') return null;
  if (state === 'start') return { kind: 'start', serviceId: 'freshx-pigs' };
  if (state === 'qa') return { kind: 'qa', serviceId: 'freshx-pigs' };
  if (state === 'logs') return { kind: 'logs', serviceId: 'freshx-pigs', runId: 'run-main' };
  if (state === 'discovery') return { kind: 'discovery', serviceId: 'freshx-nm' };
  return null;
}

const initialParams = new URLSearchParams(window.location.search);
const initialDocumentState = initialParams.get('state') || '';
const initialDocumentPage = (() => {
  const requested = initialParams.get('page');
  if (requested === 'workbench' || requested === 'directory' || requested === 'service') return requested;
  if (initialDocumentState === 'directory') return 'directory';
  if (initialDocumentState === 'workbench' || initialDocumentState === '') return 'workbench';
  return 'service';
})();

const navItems: Array<[string, string, ReactNode]> = [
  ['workspace-overview', '总览', <HomeOutlined />],
  ['projects', '项目', <FolderOutlined />],
  ['services', '服务', <AppstoreOutlined />],
  ['repositories', '代码库', <BranchesOutlined />],
  ['connection-skills', '连接', <DatabaseOutlined />],
  ['skills', '技能', <ThunderboltOutlined />],
  ['articles', '文章', <FileTextOutlined />],
];

function Preview() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const current = useRef({ page: initialDocumentPage as PageId, state: initialDocumentState });
  const initialRender = useRef(true);
  const skipRouteReset = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [services, setServices] = useState<Service[]>(() => createServices(initialDocumentState));
  const [drawer, setDrawer] = useState<DrawerState>(() => drawerForPageState(initialDocumentPage as PageId, initialDocumentState));

  const isWorkbench = location.pathname === WORKBENCH;
  const isDirectory = location.pathname === SERVICES;
  const selectedId = location.pathname.startsWith(`${SERVICES}/`) ? decodeURIComponent(location.pathname.slice(SERVICES.length + 1)) : null;
  const selectedService = selectedId ? services.find(service => service.id === selectedId) ?? services[0] : null;
  const currentPage = pageForRoute(location.pathname);
  const currentState = currentPage === 'service' && selectedService?.runtime?.qa?.lastDeploy?.state === 'submitted' ? 'qa-submitted' : '';

  const bridge = usePrototypeBridge(scenes.pages as never, current, (pageId, state) => {
    const targetPage = asPage(pageId);
    const target = routeForPage(targetPage, state);
    if (target !== location.pathname) skipRouteReset.current = true;
    current.current = { page: targetPage, state };
    navigate(target);
    if (targetPage === 'service' && state === 'qa-submitted') setServices(createServices('qa-submitted'));
    setDrawer(drawerForPageState(targetPage, state));
  });

  function report(pageId: PageId, state: string) {
    current.current = { page: pageId, state };
    bridge.report(pageId, state);
  }

  useEffect(() => {
    if (initialRender.current) { initialRender.current = false; return; }
    if (skipRouteReset.current) { skipRouteReset.current = false; return; }
    setDrawer(null);
    current.current = { page: currentPage, state: currentState };
    bridge.report(currentPage, currentState);
  }, [location.pathname]);

  const openService = (serviceId: string) => navigate(servicePath(serviceId));
  const openDirectory = () => navigate(SERVICES);
  const closeDrawer = () => { setDrawer(null); report('service', currentState); };
  const openStart = (serviceId: string) => { setDrawer({ kind: 'start', serviceId }); report('service', 'start'); };
  const openQa = (serviceId: string) => { setDrawer({ kind: 'qa', serviceId }); report('service', 'qa'); };
  const openLogs = (serviceId: string, runId: string) => { setDrawer({ kind: 'logs', serviceId, runId }); report('service', 'logs'); };
  const openDiscovery = (serviceId: string) => { setDrawer({ kind: 'discovery', serviceId }); report('service', 'discovery'); };

  const startRun = (serviceId: string, worktreeId: string) => {
    const service = services.find(item => item.id === serviceId);
    if (!service?.runtime) return;
    const worktree = service.worktrees.find(item => item.id === worktreeId);
    if (!worktree) return;
    if (service.runs.some(run => run.worktreeId === worktreeId)) {
      message.info('这个工作树已经有受管运行实例。');
      setDrawer(null);
      return;
    }
    const port = nextAvailablePort(services, service);
    const preferred = service.runtime.local.preferredPort;
    setServices(previous => previous.map(item => item.id === serviceId ? {
      ...item,
      runs: [...item.runs, {
        id: `run-${worktreeId}-${Date.now()}`,
        worktreeId,
        actualPort: port,
        startedAt: '刚刚',
        portNote: port === preferred ? '使用首选端口' : `首选 ${preferred} 被占用，已避让`,
        logs: createRunLogs(item, worktree, port),
      }],
    } : item));
    setDrawer(null);
    report('service', currentState);
    message.success(`已在「${worktree.label}」启动，端口 :${port}（演示）。`);
  };

  const stopRun = (serviceId: string, runId: string) => {
    setServices(previous => previous.map(item => item.id === serviceId ? { ...item, runs: item.runs.filter(run => run.id !== runId) } : item));
    report('service', currentState);
    message.success('已停止 Buildr 托管的本地进程（演示）。');
  };

  const confirmQa = (serviceId: string, branch: string, commit: string) => {
    const service = services.find(item => item.id === serviceId);
    if (!service?.runtime?.qa) return;
    const version = `${branch}@${commit}`;
    setServices(previous => previous.map(item => item.id === serviceId && item.runtime?.qa ? {
      ...item,
      runtime: {
        ...item.runtime,
        qa: { ...item.runtime.qa, lastDeploy: { state: 'submitted', version, at: '刚刚' } },
      },
    } : item));
    setDrawer(null);
    report('service', 'qa-submitted');
    message.success('已提交到云雀；构建和部署进度在云雀查看（演示）。');
  };

  const openYunque = () => message.info('实际使用时会打开云雀对应部署详情；原型不连接外部系统。');

  const navigation = <nav className="shell-navigation" aria-label="工作空间导航">
    {navItems.map(([name, label, icon]) => {
      const active = !isWorkbench && name === 'services';
      return <AppNavigationItem
        key={name}
        to={name === 'services' ? SERVICES : `/workspaces/preview/${name}`}
        path={name === 'services' ? SERVICES : `/${name}`}
        name={name}
        label={label}
        icon={icon}
        active={active}
        onClick={event => {
          if (name !== 'services') {
            event.preventDefault();
            message.info('本次原型聚焦服务运行。');
          }
        }}
      />;
    })}
  </nav>;

  const tabs: WorkspacePageTab[] = [
    { key: 'workbench:overview', kind: 'dir', title: '工作概览', path: WORKBENCH },
    { key: 'dir:services', kind: 'dir', title: '服务目录', path: SERVICES },
    ...(!isWorkbench && !isDirectory && selectedService ? [{ key: `service:${selectedService.id}`, kind: 'svc' as const, title: selectedService.name, path: servicePath(selectedService.id) }] : []),
  ];

  const drawerService = drawer ? services.find(service => service.id === drawer.serviceId) ?? null : null;
  const drawerRun = drawer?.kind === 'logs' ? drawerService?.runs.find(run => run.id === drawer.runId) ?? null : null;

  return <div className="app-shell area-workspace service-runtime-prototype">
    <AppShellHeader
      brandHref={WORKBENCH}
      workspaceName="集鲜 · 演示工作空间"
      workspaceMenuItems={[{ key: 'demo', label: '集鲜 · 演示工作空间' }]}
      area={isWorkbench ? 'workbench' : 'workspace'}
      workbenchHref={WORKBENCH}
      workspaceDestination={{ to: SERVICES }}
      actions={<Tag>离线原型 · 虚构数据</Tag>}
    />
    <AppShellFrame
      sidebarCollapsed={collapsed}
      compactNavigation={isWorkbench}
      onToggleSidebar={() => setCollapsed(value => !value)}
      navigation={navigation}
    >
      <div className="workspace-pages">
        <div className="workspace-page-tabs">
          <PageTabStrip
            tabs={tabs}
            idPrefix="service-runtime-prototype"
            onClose={key => {
              if (key.startsWith('service:')) navigate(SERVICES);
              else message.info('原型保留此页签。');
            }}
            onReorder={() => undefined}
          />
        </div>
        <div className="workspace-page-stack">
          <div className="workspace-page">
            {currentPage === 'workbench' && <WorkbenchPage services={services} onOpenDirectory={openDirectory} onOpenService={openService} />}
            {currentPage === 'directory' && <ServiceDirectory services={services} onOpen={openService} onStart={openStart} onDiscover={openDiscovery} />}
            {currentPage === 'service' && selectedService && <ServiceDetail
              service={selectedService}
              onStart={() => openStart(selectedService.id)}
              onStop={runId => stopRun(selectedService.id, runId)}
              onLogs={runId => openLogs(selectedService.id, runId)}
              onDiscover={() => openDiscovery(selectedService.id)}
              onQaDeploy={() => openQa(selectedService.id)}
              onOpenYunque={openYunque}
            />}
          </div>
        </div>
      </div>
    </AppShellFrame>

    <StartWorktreeDrawer
      service={drawer?.kind === 'start' ? drawerService : null}
      open={drawer?.kind === 'start'}
      onClose={closeDrawer}
      onStart={worktreeId => drawer && startRun(drawer.serviceId, worktreeId)}
    />
    <QaDeployDrawer
      service={drawer?.kind === 'qa' ? drawerService : null}
      open={drawer?.kind === 'qa'}
      onClose={closeDrawer}
      onConfirm={confirmQa}
    />
    <LocalLogsDrawer
      service={drawer?.kind === 'logs' ? drawerService : null}
      run={drawerRun}
      open={drawer?.kind === 'logs'}
      onClose={closeDrawer}
    />
    <AgentDiscoveryDrawer
      service={drawer?.kind === 'discovery' ? drawerService : null}
      open={drawer?.kind === 'discovery'}
      onClose={closeDrawer}
    />
  </div>;
}

createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}>
  <App><MemoryRouter initialEntries={[routeForPage(initialDocumentPage as PageId, initialDocumentState)]}><Preview /></MemoryRouter></App>
</ConfigProvider>);
