import { runtimeSystemApi } from './api/runtime-system-api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, Drawer, Dropdown, Space, Typography } from 'antd';
import { CaretDownFilled, MenuOutlined, PlusOutlined } from '@ant-design/icons';
import { api, setWorkspaceId } from '../api';
import { AppShellContext, type WorkspaceShellInfo } from './AppShellContext';
import { AppNavigation } from './AppNavigation';
import { navigationState } from './navigation';
import { workspaceApi } from '../features/workspace/api/workspace-api';
import { AgentActionDrawer } from './AgentActionDrawer';
import { confirmModal } from '../lib/confirm';
import { ReleaseAwarenessBanner } from '../features/installation/components/ReleaseAwarenessBanner';

type PreviewIdentity = {
  instance: string;
  branch: string;
  head: string;
  dirty?: boolean;
  worktree?: string;
};

type WebProfile = 'released' | 'development';

type WorkspaceEntry = {
  status: string;
  rootPath: string;
  workspace?: { id: string; name: string };
};

function readPreviewIdentity(): PreviewIdentity | null {
  const raw = document.querySelector('meta[name="buildr-preview"]')?.getAttribute('content');
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as PreviewIdentity;
  } catch {
    return null;
  }
}

function readWebProfile(): WebProfile | null {
  const profile = document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content');
  return profile === 'released' || profile === 'development' ? profile : null;
}

function productTitle(webProfile: WebProfile | null): string {
  return webProfile === 'development' ? 'Buildr Web Dev' : 'Buildr Web';
}

export function AppLayout() {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const workspaceId = params.workspaceId ?? null;
  const isGlobal = !workspaceId;
  const area = navigationState(location.pathname, location.search, workspaceId).area;
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(() => window.matchMedia('(max-width: 899px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)');
    const update = () => { setCompactNavigation(media.matches); setNavigationOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const workspaceDestination = useRef({ workspaceId, path: `/workspaces/${workspaceId}/projects` });
  if (workspaceDestination.current.workspaceId !== workspaceId) {
    workspaceDestination.current = { workspaceId, path: `/workspaces/${workspaceId}/projects` };
  }
  if (area === 'workspace' && workspaceId) workspaceDestination.current.path = location.pathname + location.search;
  setWorkspaceId(workspaceId);

  const [workspace, setWorkspaceState] = useState<WorkspaceShellInfo | null>(null);
  const [breadcrumbParts, setBreadcrumbParts] = useState<string[]>(['工作空间']);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerAction, setDrawerAction] = useState<string | undefined>();
  const [drawerContext, setDrawerContext] = useState<Record<string, unknown>>({});
  const [exited, setExited] = useState(false);
  const [taskListResetToken, setTaskListResetToken] = useState(0);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const refreshNavigation = useCallback(() => setNavigationRevision((value) => value + 1), []);
  const [registry, setRegistry] = useState<WorkspaceEntry[]>([]);

  const preview = useMemo(() => readPreviewIdentity(), []);
  const webProfile = useMemo(() => readWebProfile(), []);

  useEffect(() => {
    document.body.classList.toggle('global-context', isGlobal);
    if (isGlobal) {
      setWorkspaceState(null);
      document.title = productTitle(webProfile);
      setBreadcrumbParts(['工作空间']);
    }
  }, [isGlobal, webProfile]);

  const workspaceHref = (suffix: string) => (
    workspaceId ? `/workspaces/${workspaceId}${suffix}` : '/'
  );

  const setWorkspace = useCallback((data: { workspace: { name: string }; rootPath: string }) => {
    setWorkspaceState({ name: data.workspace.name, rootPath: data.rootPath });
    document.title = `${data.workspace.name} · ${productTitle(webProfile)}`;
  }, [webProfile]);

  const openAgentAction = useCallback((action?: string, context: Record<string, unknown> = {}) => {
    setDrawerAction(action);
    setDrawerContext(context);
    setDrawerOpen(true);
  }, []);

  const closeAgentAction = useCallback(() => {
    setDrawerOpen(false);
    setDrawerAction(undefined);
    setDrawerContext({});
  }, []);

  const resetTaskList = useCallback(() => {
    setTaskListResetToken((value) => value + 1);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('drawer-open', drawerOpen);
  }, [drawerOpen]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await api('/api/v1/workspaces', { signal: controller.signal }) as { workspaces: WorkspaceEntry[] };
        if (!controller.signal.aborted) setRegistry(data.workspaces || []);
      } catch {
        if (!controller.signal.aborted) setRegistry([]);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    setWorkspaceState(null);
    void workspaceApi.read({ signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setWorkspace(data);
    }).catch(() => { /* Page-level diagnostics remain available. */ });
    return () => controller.abort();
  }, [workspaceId, setWorkspace]);

  useEffect(() => { setNavigationOpen(false); }, [location.pathname, location.search]);

  const quit = async () => {
    const ok = await confirmModal({
      title: '退出 Buildr Web？',
      content: '退出 Buildr Web 后，本机服务将停止。确定退出吗？',
      okText: '退出',
      okButtonProps: { danger: true },
    });
    if (!ok) return;
    await runtimeSystemApi.quit();
    setExited(true);
  };

  const shellValue = {
    workspaceId,
    navigationRevision,
    refreshNavigation,
    workspace,
    setWorkspace,
    openAgentAction,
    breadcrumbParts,
    setBreadcrumbParts,
    taskListResetToken,
    resetTaskList,
  };

  const switchWorkspace = (id: string | null) => {
    navigate(id ? `/workspaces/${id}/tasks` : '/?catalog=1');
  };

  const workspaceMenuItems = [
    {
      key: 'all',
      label: '全部工作空间',
      onClick: () => switchWorkspace(null),
    },
    { type: 'divider' as const },
    ...registry.map((entry) => {
      const id = entry.workspace?.id;
      const name = entry.workspace?.name || id || entry.rootPath;
      return {
        key: id || entry.rootPath,
        disabled: !id || entry.status !== 'ready',
        label: name,
        onClick: id ? () => switchWorkspace(id) : undefined,
      };
    }),
  ];

  if (exited) {
    return (
      <div className="exit-screen">
        <Typography.Title level={2}>Buildr Web 已退出</Typography.Title>
        <Typography.Paragraph type="secondary">
          你可以关闭此页面；再次点击 Buildr Web 图标即可重新打开。
        </Typography.Paragraph>
      </div>
    );
  }

  return (
    <AppShellContext.Provider value={shellValue}>
      <div className="app-shell">
        <header className="topbar">
          <Link
            className="brand-link"
            to={isGlobal ? '/' : workspaceHref('/tasks')}
            aria-label="当前工作空间任务列表"
          >
            <span className="brand-mark">B</span>
            <strong>Buildr Web</strong>
          </Link>
          {webProfile === 'development' ? (
            <span
              id="development-environment-badge"
              className="development-environment-badge"
              title="当前运行的是 Buildr Web 开发版"
            >
              开发版
            </span>
          ) : null}

            <Dropdown menu={{ items: workspaceMenuItems }} trigger={['click']}>
              <button type="button" className="workspace-switcher" aria-label="切换工作空间">
                <span className="context-label">工作空间</span>
                <strong id="shell-workspace-name">
                  {isGlobal ? '全部工作空间' : (workspace?.name || '正在读取…')}
                </strong>
                <CaretDownFilled aria-hidden />
              </button>
            </Dropdown>
          {!isGlobal ? <nav className="top-nav" aria-label="主导航">
            <Link to={workspaceHref('/tasks')} data-area="workbench" aria-current={area === 'workbench' ? 'page' : undefined} className={area === 'workbench' ? 'active' : ''}
              onClick={resetTaskList}>工作台</Link>
            <Link to={workspaceDestination.current.path} data-area="workspace" aria-current={area === 'workspace' ? 'page' : undefined} className={area === 'workspace' ? 'active' : ''}>工作空间</Link>
          </nav> : null}
          <div className="topbar-actions">
            {!isGlobal ? <Button className="shell-menu-toggle" aria-label="打开导航菜单" icon={<MenuOutlined />} onClick={() => setNavigationOpen(true)} /> : null}
            <Button id="quit-buildr" className="nav-quit" type="text" onClick={() => { void quit(); }}>
              退出
            </Button>
            <div
              id="preview-identity"
              className="preview-identity hidden"
              aria-hidden="true"
              data-preview={preview
                ? `开发预览：${preview.instance} · ${preview.branch} · ${preview.head.slice(0, 12)}${preview.dirty ? ' · 有未提交修改' : ''}`
                : undefined}
              title={preview?.worktree || undefined}
            />
            {!isGlobal ? (
              <Button
                id="open-agent-action"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openAgentAction()}
              >
                交给 Agent
              </Button>
            ) : null}
          </div>
        </header>
        <ReleaseAwarenessBanner openAgentAction={openAgentAction} />
        <div className={`app-frame${isGlobal ? ' is-global' : ''}`}>
          {!isGlobal && !compactNavigation ? <aside className="app-sidebar"><AppNavigation key={workspaceId} /></aside> : null}
          <main id="app-view" tabIndex={-1} aria-live="polite"><Outlet key={workspaceId} /></main>
        </div>
      </div>

      {!isGlobal ? <Drawer title="导航" placement="left" width={280} open={navigationOpen}
        onClose={() => setNavigationOpen(false)} destroyOnClose>
        {navigationOpen ? <AppNavigation key={workspaceId} onNavigate={() => setNavigationOpen(false)} /> : null}
      </Drawer> : null}
      <div
        id="agent-action-backdrop"
        className={drawerOpen ? '' : 'hidden'}
        onClick={closeAgentAction}
        aria-hidden
      />
      <Drawer
        id="agent-action-drawer"
        open={drawerOpen}
        onClose={closeAgentAction}
        width={440}
        destroyOnClose
        title={(
          <Space direction="vertical" size={0}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>AGENT ACTION</Typography.Text>
            <Typography.Title id="agent-action-title" level={4} style={{ margin: 0 }}>交给 Agent</Typography.Title>
          </Space>
        )}
        extra={(
          <Button
            id="close-agent-action"
            type="text"
            aria-label="关闭"
            onClick={closeAgentAction}
          >
            关闭
          </Button>
        )}
        closable={false}
      >
        <div id="agent-action-content">
          {drawerOpen ? (
            <AgentActionDrawer
              initialAction={drawerAction}
              initialContext={drawerContext}
            />
          ) : null}
        </div>
      </Drawer>
    </AppShellContext.Provider>
  );
}
