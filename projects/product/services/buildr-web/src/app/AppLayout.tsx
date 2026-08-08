import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { api, setWorkspaceId } from '../api';
import { AppShellContext, type WorkspaceShellInfo } from './AppShellContext';
import { AgentActionDrawer } from './AgentActionDrawer';

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

  const preview = useMemo(() => readPreviewIdentity(), []);

  useEffect(() => {
    document.body.classList.toggle('global-context', isGlobal);
    if (isGlobal) {
      setWorkspaceState(null);
      document.title = 'Buildr 工作空间';
      setBreadcrumbParts(['工作空间']);
    }
  }, [isGlobal]);

  const workspaceHref = (suffix: string) => (
    workspaceId ? `/workspaces/${workspaceId}${suffix}` : '/'
  );

  const setWorkspace = useCallback((data: { workspace: { name: string }; rootPath: string }) => {
    setWorkspaceState({ name: data.workspace.name, rootPath: data.rootPath });
    document.title = `${data.workspace.name} · Buildr`;
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAgentAction();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    document.body.classList.toggle('drawer-open', drawerOpen);
  }, [drawerOpen]);

  const quit = async () => {
    if (!window.confirm('退出 Buildr 后，本机服务将停止。确定退出吗？')) return;
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
  };

  if (exited) {
    return (
      <section className="empty-state">
        <h1>Buildr 已退出</h1>
        <p>你可以关闭此页面；再次点击 Buildr 图标即可重新打开。</p>
      </section>
    );
  }

  return (
    <AppShellContext.Provider value={shellValue}>
      <div className="app-shell">
        <aside className="sidebar" aria-label="Buildr 主导航">
          <Link className="brand" to="/" aria-label="Buildr 工作空间首页">
            <span className="brand-mark">B</span>
            <span>
              <strong>Buildr</strong>
              <small>全局应用</small>
            </span>
          </Link>
          <div className="workspace-context">
            <span className="context-label">当前工作空间</span>
            <strong id="shell-workspace-name">
              {isGlobal ? '全部工作空间' : (workspace?.name || '正在读取…')}
            </strong>
            <span id="shell-workspace-path">
              {isGlobal ? '本机登记列表' : (workspace?.rootPath || '本机应用')}
            </span>
          </div>
          <nav className="nav-list">
            <NavLink to="/" data-nav="workspaces" className={navClass} end>
              <span className="nav-icon">▦</span>
              <span>工作空间</span>
            </NavLink>
            <NavLink
              to={workspaceHref('/')}
              data-nav="overview"
              data-workspace-route="/"
              className={() => (routeId === 'overview' ? 'active' : '')}
              aria-current={routeId === 'overview' ? 'page' : undefined}
            >
              <span className="nav-icon">⌂</span>
              <span>开始</span>
            </NavLink>
          </nav>
          <div className={`nav-group${resourceActive ? ' active' : ''}`} data-nav-group="resources">
            <button
              id="resource-nav-toggle"
              className="nav-group-toggle"
              type="button"
              aria-expanded={resourceExpanded}
              aria-controls="resource-nav-children"
              onClick={() => setResourceExpanded((value) => !value)}
            >
              <span className="nav-icon">◇</span>
              <span>核心范围</span>
              <span className="nav-chevron">{resourceExpanded ? '⌄' : '›'}</span>
            </button>
            <nav
              id="resource-nav-children"
              className={`nav-children${resourceExpanded ? '' : ' collapsed'}`}
              aria-label="资源类型"
            >
              <NavLink to={workspaceHref('/tasks')} data-nav="tasks" data-workspace-route="/tasks" className={navClass}>
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
          <nav className="nav-list nav-secondary">
            <NavLink to={workspaceHref('/settings')} data-nav="settings" data-workspace-route="/settings" className={navClass}>
              <span className="nav-icon">⚙</span>
              <span>工作空间设置</span>
            </NavLink>
            <button id="quit-buildr" className="nav-quit" type="button" onClick={() => void quit()}>
              <span className="nav-icon">⏻</span>
              <span>退出 Buildr</span>
            </button>
          </nav>
          <div className="local-note">
            <span className="status-dot" />
            仅限本机访问
          </div>
        </aside>

        <div className="app-main">
          <header className="topbar">
            <div className="mobile-brand">
              <span className="brand-mark">B</span>
              <strong>Buildr</strong>
            </div>
            <div id="page-breadcrumb" className="breadcrumb" aria-label="当前位置">
              {breadcrumbParts.map((part, index) => (
                index === breadcrumbParts.length - 1
                  ? <strong key={`${part}-${index}`}>{part}</strong>
                  : <span key={`${part}-${index}`}>{part}</span>
              ))}
            </div>
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
            <button
              id="open-agent-action"
              className="button primary"
              type="button"
              onClick={() => openAgentAction()}
            >
              <span>＋</span>
              {' '}
              交给 Agent
            </button>
          </header>
          <main id="app-view" tabIndex={-1} aria-live="polite">
            <Outlet />
          </main>
        </div>
      </div>

      <div
        id="agent-action-backdrop"
        className={`drawer-backdrop${drawerOpen ? '' : ' hidden'}`}
        onClick={closeAgentAction}
      />
      <aside
        id="agent-action-drawer"
        className={`drawer${drawerOpen ? '' : ' hidden'}`}
        aria-hidden={!drawerOpen}
        aria-labelledby="agent-action-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">AGENT ACTION</p>
            <h2 id="agent-action-title">交给 Agent</h2>
          </div>
          <button
            id="close-agent-action"
            className="icon-button"
            type="button"
            aria-label="关闭"
            onClick={closeAgentAction}
          >
            ×
          </button>
        </div>
        <div id="agent-action-content">
          {drawerOpen ? (
            <AgentActionDrawer
              initialAction={drawerAction}
              initialContext={drawerContext}
            />
          ) : null}
        </div>
      </aside>
    </AppShellContext.Provider>
  );
}
