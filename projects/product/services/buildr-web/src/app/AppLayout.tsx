import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { Button, Drawer, Space, Typography } from 'antd';
import { CaretDownFilled, PlusOutlined } from '@ant-design/icons';
import { api, setWorkspaceId } from '../api';
import { AppShellContext, type WorkspaceShellInfo } from './AppShellContext';
import { AgentActionDrawer } from './AgentActionDrawer';
import { confirmModal } from '../lib/confirm';

type PreviewIdentity = {
  instance: string;
  branch: string;
  head: string;
  dirty?: boolean;
  worktree?: string;
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

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'active' : '';
}

export function AppLayout() {
  const params = useParams();
  const location = useLocation();
  const workspaceId = params.workspaceId ?? null;
  const isGlobal = !workspaceId;
  setWorkspaceId(workspaceId);

  const [workspace, setWorkspaceState] = useState<WorkspaceShellInfo | null>(null);
  const [breadcrumbParts, setBreadcrumbParts] = useState<string[]>(['工作空间']);
  const [resourceExpanded, setResourceExpanded] = useState(
    () => window.matchMedia('(min-width: 701px)').matches,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerAction, setDrawerAction] = useState<string | undefined>();
  const [drawerContext, setDrawerContext] = useState<Record<string, unknown>>({});
  const [exited, setExited] = useState(false);
  const [taskListResetToken, setTaskListResetToken] = useState(0);

  const preview = useMemo(() => readPreviewIdentity(), []);

  useEffect(() => {
    document.body.classList.toggle('global-context', isGlobal);
    if (isGlobal) {
      setWorkspaceState(null);
      document.title = 'Buildr Web';
      setBreadcrumbParts(['工作空间']);
    }
  }, [isGlobal]);

  const workspaceHref = (suffix: string) => (
    workspaceId ? `/workspaces/${workspaceId}${suffix}` : '/'
  );

  const setWorkspace = useCallback((data: { workspace: { name: string }; rootPath: string }) => {
    setWorkspaceState({ name: data.workspace.name, rootPath: data.rootPath });
    document.title = `${data.workspace.name} · Buildr Web`;
  }, []);

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

  const quit = async () => {
    const ok = await confirmModal({
      title: '退出 Buildr Web？',
      content: '退出 Buildr Web 后，本机服务将停止。确定退出吗？',
      okText: '退出',
      okButtonProps: { danger: true },
    });
    if (!ok) return;
    await api('/api/v1/app/quit', { method: 'POST', body: '{}' });
    setExited(true);
  };

  const routeId = useMemo(() => {
    const path = location.pathname;
    if (isGlobal || path === '/') return 'workspaces';
    if (/\/settings\/?$/.test(path)) return 'settings';
    if (/\/articles(\/|$)/.test(path)) return 'articles';
    if (/\/tasks(\/|$)/.test(path)) return 'tasks';
    if (/\/projects(\/|$)/.test(path)) return 'projects';
    if (/\/services(\/|$)/.test(path)) return 'services';
    if (/\/overview\/?$/.test(path) || /\/workspaces\/[^/]+\/?$/.test(path)) return 'overview';
    return 'overview';
  }, [location.pathname, isGlobal]);

  const resourceActive = ['tasks', 'projects', 'services', 'articles'].includes(routeId);

  const shellValue = {
    workspaceId,
    workspace,
    setWorkspace,
    openAgentAction,
    breadcrumbParts,
    setBreadcrumbParts,
    taskListResetToken,
    resetTaskList,
  };

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
        <aside className="app-sider" aria-label="Buildr Web 主导航">
          <div className="sider-top">
            <Link className="brand-link" to="/" aria-label="Buildr Web 工作空间首页">
              <span className="brand-mark">B</span>
              <span>
                <strong>Buildr Web</strong>
                <small>全局应用</small>
              </span>
            </Link>
            <div className="workspace-context">
              <span className="context-label">当前工作空间</span>
              <strong id="shell-workspace-name">
                {isGlobal ? '全部工作空间' : (workspace?.name || '正在读取…')}
              </strong>
            </div>
            <nav className="nav-list">
              <NavLink to="/" data-nav="workspaces" className={navClass} end>
                工作空间
              </NavLink>
              <NavLink
                to={workspaceHref('/')}
                data-nav="overview"
                data-workspace-route="/"
                className={() => (routeId === 'overview' ? 'active' : '')}
                aria-current={routeId === 'overview' ? 'page' : undefined}
              >
                开始
              </NavLink>
            </nav>
            <div className={`nav-group${resourceActive ? ' active' : ''}`} data-nav-group="resources">
              <Button
                id="resource-nav-toggle"
                className="nav-group-toggle"
                type="text"
                aria-expanded={resourceExpanded}
                aria-controls="resource-nav-children"
                onClick={() => setResourceExpanded((value) => !value)}
              >
                <span>核心范围</span>
                <CaretDownFilled
                  className={`nav-chevron${resourceExpanded ? ' expanded' : ''}`}
                  aria-hidden
                />
              </Button>
              <nav
                id="resource-nav-children"
                className={`nav-children${resourceExpanded ? '' : ' collapsed'}`}
                aria-label="资源类型"
              >
                <NavLink
                  to={workspaceHref('/tasks')}
                  data-nav="tasks"
                  data-workspace-route="/tasks"
                  className={navClass}
                  onClick={resetTaskList}
                >
                  <span>任务</span>
                  <small>顶层任务记录</small>
                </NavLink>
                <NavLink to={workspaceHref('/projects')} data-nav="projects" data-workspace-route="/projects" className={navClass}>
                  <span>项目</span>
                  <small>长期工作单元</small>
                </NavLink>
                <NavLink to={workspaceHref('/services')} data-nav="services" data-workspace-route="/services" className={navClass}>
                  <span>服务</span>
                  <small>代码与应用资产</small>
                </NavLink>
                <NavLink to={workspaceHref('/articles')} data-nav="articles" data-workspace-route="/articles" className={navClass}>
                  <span>文章</span>
                  <small>对外发布材料</small>
                </NavLink>
              </nav>
            </div>
          </div>
          <div className="sider-bottom">
            <nav className="nav-list nav-secondary">
              <NavLink to={workspaceHref('/settings')} data-nav="settings" data-workspace-route="/settings" className={navClass}>
                工作空间设置
              </NavLink>
              <Button id="quit-buildr" className="nav-quit" type="text" onClick={() => { void quit(); }}>
                退出 Buildr Web
              </Button>
            </nav>
            <div className="local-note">
              <span className="status-dot" />
              仅限本机访问
            </div>
          </div>
        </aside>

        <div className="app-main">
          <header className="topbar">
            <div className="mobile-brand">
              <span className="brand-mark">B</span>
              <strong>Buildr Web</strong>
            </div>
            <div id="page-breadcrumb" className="breadcrumb" aria-label="当前位置">
              {breadcrumbParts.map((part, index) => (
                index === breadcrumbParts.length - 1
                  ? <strong key={`${part}-${index}`}>{part}</strong>
                  : <span key={`${part}-${index}`}>{part}</span>
              ))}
            </div>
            <div className="topbar-actions">
              <div
                id="preview-identity"
                className={`preview-identity${preview ? '' : ' hidden'}`}
                aria-label="开发预览身份"
                title={preview?.worktree || undefined}
              >
                {preview
                  ? `开发预览：${preview.instance} · ${preview.branch} · ${preview.head.slice(0, 12)}${preview.dirty ? ' · 有未提交修改' : ''}`
                  : null}
              </div>
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
          <main id="app-view" tabIndex={-1} aria-live="polite">
            <Outlet />
          </main>
        </div>
      </div>

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
