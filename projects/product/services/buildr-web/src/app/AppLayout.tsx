import { InstallationInfoDialog } from '../features/installation/components/InstallationInfoDialog';
import { WorkspacePreparationNotice } from '../features/workspace/components/WorkspacePreparationNotice';
import { AgentConversationsProvider, useAgentConversationShell } from '../features/agent-conversations/AgentConversationsContext';
import { ConversationPanel } from '../features/agent-conversations/ConversationPanel';
import { ConversationAttention } from '../features/agent-conversations/ConversationAttention';
import { AgentConnectionSettings } from '../features/agent-conversations/AgentConnectionSettings';
import { AppPrimaryNavigation } from './AppPrimaryNavigation';
import { CommentOutlined } from '@ant-design/icons';
import { AgentRuntimeProvider, useAgentRuntime } from './AgentRuntimeContext';
import { AgentRegistryDrawer } from '../features/agents/components/AgentRegistryDrawer';
import { agentStatusLabel } from '../features/agents/agent-model';
import { AppShellHeader, AppShellFrame } from './AppShellView';
import { WorkbenchPreferencesProvider } from '../features/workbench/hooks/useWorkbenchPreferences';
import { WorkspaceReadCacheProvider } from '../components/WorkspaceReadCache';
import { WorkbenchSearch } from '../features/workbench/components/WorkbenchSearch';
import type { ResourcePreview } from './resource-preview';
import { WorkspacePages } from './WorkspacePages';
import type { WorkspacePageNavigationRequest } from './WorkspacePaneHost';
import { runtimeSystemApi } from './api/runtime-system-api';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Dropdown, Drawer, Tooltip, Typography } from 'antd';
import { AppstoreOutlined, CheckOutlined, CloseCircleOutlined, EllipsisOutlined, InfoCircleOutlined, MenuOutlined, PlusOutlined, PoweroffOutlined, RobotOutlined, SettingOutlined, SyncOutlined } from '@ant-design/icons';
import { api, setWorkspaceId } from '../api';
import { AppShellContext, type WorkspaceShellInfo } from './AppShellContext';
import { AppNavigation } from './AppNavigation';
import { navigationState } from './navigation';
import { workspaceApi, type WorkspaceResponse } from '../features/workspace/api/workspace-api';
import { WorkspaceSettingsDrawer } from '../features/workspace/components/WorkspaceSettingsDrawer';
import { AgentActionDrawer } from './AgentActionDrawer';
import { DrawerShell } from '../components/DrawerShell';
import { confirmModal } from '../lib/confirm';
import { UpdateEntry, type UpdateEntryHandle } from '../features/installation/components/UpdateEntry';
import { ArticleEditorProvider } from '../features/publication/components/ArticleEditorProvider';
import { WorkspaceFileEditingProvider, useFileEditingDraftProtection } from './WorkspaceFileEditingProvider';
import { WorkspaceSourceControlProvider } from './WorkspaceSourceControlProvider';
import { readOptionalPreference, writeOptionalPreference } from '../lib/optional-preferences';
import { waitForRestart } from './restart-watch';

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

export function AppLayout(props: { renderResource: (item: ResourcePreview) => ReactNode }) {
  return <AgentRuntimeProvider><AgentConversationsProvider><AppLayoutView {...props} /></AgentConversationsProvider></AgentRuntimeProvider>;
}

function AppLayoutView({ renderResource }: { renderResource: (item: ResourcePreview) => ReactNode }) {
  useFileEditingDraftProtection();
  const agents = useAgentRuntime();
  const conversations = useAgentConversationShell();
  const [conversationMount, setConversationMount] = useState<HTMLDivElement | null>(null);
  const defaultAgent = agents.registry?.agents.find(agent => agent.id === agents.registry?.defaultAgentId);
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const workspaceId = params.workspaceId ?? null;
  const activeWorkspaceId = useRef(workspaceId);
  activeWorkspaceId.current = workspaceId;
  const isGlobal = !workspaceId;
  const area = navigationState(location.pathname, location.search, workspaceId).area;
  const retainedSearch = location.search;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readOptionalPreference('buildr.sidebar-collapsed') === 'true');
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(readOptionalPreference('buildr.sidebar-width'));
    return Number.isFinite(saved) && saved >= 150 && saved <= 256 ? saved : 256;
  });
  const resizeSidebar = (width: number) => { setSidebarWidth(width); writeOptionalPreference('buildr.sidebar-width', String(Math.round(width))); };
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [pageNavigationRequest, setPageNavigationRequest] = useState<WorkspacePageNavigationRequest>();
  const requestWorkspacePage = useCallback((destination: string) => setPageNavigationRequest(previous => ({ sequence: (previous?.sequence || 0) + 1, destination })), []);
  const [compactNavigation, setCompactNavigation] = useState(() => window.matchMedia('(max-width: 899px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)');
    const update = () => { setCompactNavigation(media.matches); setNavigationOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const workspaceDestination = useRef({ workspaceId, path: `/workspaces/${workspaceId}/workspace-overview`, state: null });
  if (workspaceDestination.current.workspaceId !== workspaceId) {
    workspaceDestination.current = { workspaceId, path: `/workspaces/${workspaceId}/workspace-overview`, state: null };
  }
  const [codeEntry, setCodeEntry] = useState<{ workspaceId: string | null; path: string }>(() => ({
    workspaceId,
    path: workspaceId ? `/workspaces/${workspaceId}/code/source-control` : '',
  }));
  const codeEntryPath = workspaceId
    ? codeEntry.workspaceId === workspaceId ? codeEntry.path : `/workspaces/${workspaceId}/code/source-control`
    : undefined;
  const setCodeEntryPath = useCallback((path: string) => setCodeEntry({ workspaceId, path }), [workspaceId]);
  const [, refreshSectionLinks] = useState(0);
  const sectionHistory = useRef<{ workspaceId: string | null; pages: Record<string, { to: string; state?: unknown }> }>({ workspaceId, pages: {} });
  if (sectionHistory.current.workspaceId !== workspaceId) sectionHistory.current = { workspaceId, pages: {} };
  const section = workspaceId ? location.pathname.slice(`/workspaces/${workspaceId}/`.length).split('/')[0] : '';
  if (workspaceId && ['workspace-overview', 'projects', 'services', 'repositories', 'connection-skills', 'skills', 'articles'].includes(section) && !/\/(new|edit)$/.test(location.pathname)) {
    sectionHistory.current.pages[section] = { to: location.pathname + retainedSearch + location.hash, state: location.state };
  }
  const workspaceMenuTarget = (name: string) => sectionHistory.current.pages[name] || { to: `/workspaces/${workspaceId}/${name}` };
  const forgetWorkspacePage = (path: string) => {
    let changed = false;
    for (const [name, target] of Object.entries(sectionHistory.current.pages)) if (target.to.split(/[?#]/)[0] === path) { delete sectionHistory.current.pages[name]; changed = true; }
    if (changed) refreshSectionLinks(value => value + 1);
  };
  setWorkspaceId(workspaceId);

  const [workspace, setWorkspaceState] = useState<WorkspaceShellInfo | null>(null);
  const [breadcrumbParts, setBreadcrumbParts] = useState<string[]>(['工作空间']);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerWorkspaceId, setDrawerWorkspaceId] = useState<string | null>(null);
  const [drawerAction, setDrawerAction] = useState<string | undefined>();
  const [drawerContext, setDrawerContext] = useState<Record<string, unknown>>({});
  const [exited, setExited] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [quitError, setQuitError] = useState('');
  const quitPending = useRef(false);
  const [installationInfoOpen, setInstallationInfoOpen] = useState(false);
  const updateEntryRef = useRef<UpdateEntryHandle>(null);
  const [restartPhase, setRestartPhase] = useState<null | 'watching' | 'timed-out'>(null);
  const [restartError, setRestartError] = useState('');
  const restartPending = useRef(false);
  const [taskListResetToken, setTaskListResetToken] = useState(0);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const refreshNavigation = useCallback(() => setNavigationRevision((value) => value + 1), []);
  const [registry, setRegistry] = useState<WorkspaceEntry[]>([]);
  const [workspaceRegistryRevision, setWorkspaceRegistryRevision] = useState(0);
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRouteWorkspace = useRef(workspaceId);
  useEffect(() => {
    if (settingsRouteWorkspace.current !== workspaceId) {
      setSettingsOpen(false);
      settingsRouteWorkspace.current = workspaceId;
    }
  }, [workspaceId]);

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

  const openWorkspaceSettings = useCallback((id: string) => {
    setSettingsWorkspaceId(id);
    setSettingsOpen(true);
  }, []);

  const workspaceSettingsSaved = (id: string, data: WorkspaceResponse) => {
    if (id === activeWorkspaceId.current) setWorkspace(data);
    setRegistry(entries => entries.map(entry => entry.workspace?.id === id ? { ...entry, workspace: data.workspace } : entry));
    setWorkspaceRegistryRevision(value => value + 1);
  };

  const openAgentAction = useCallback((action?: string, context: Record<string, unknown> = {}) => {
    setDrawerWorkspaceId(workspaceId);
    setDrawerAction(action);
    setDrawerContext(context);
    setDrawerOpen(true);
  }, [workspaceId]);

  const closeAgentAction = useCallback(() => {
    setDrawerOpen(false);
    setDrawerAction(undefined);
    setDrawerContext({});
  }, []);

  // An action belongs to the workspace in which the user opened it.
  // Hide it synchronously on scope change, then discard its old context.
  const visibleDrawer = drawerOpen && drawerWorkspaceId === workspaceId;
  useEffect(() => {
    setDrawerOpen(false);
    setDrawerAction(undefined);
    setDrawerContext({});
  }, [workspaceId]);

  const resetTaskList = useCallback(() => {
    setTaskListResetToken((value) => value + 1);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('drawer-open', visibleDrawer);
  }, [visibleDrawer]);

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
  }, [workspaceRegistryRevision]);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    setWorkspaceState(null);
    void workspaceApi.readById(workspaceId, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setWorkspace(data);
    }).catch(() => { /* Page-level diagnostics remain available. */ });
    return () => controller.abort();
  }, [workspaceId, setWorkspace]);

  useEffect(() => { setNavigationOpen(false); }, [location.pathname, location.search]);

  const quit = async (ask = true) => {
    if (quitPending.current) return;
    quitPending.current = true;
    try {
      const ok = !ask || await confirmModal({
        title: '退出 Buildr Web？',
        content: '退出 Buildr Web 后，本机服务将停止。确定退出吗？',
        okText: '退出',
        okButtonProps: { danger: true },
      });
      if (!ok) return;
      setQuitError(''); setQuitting(true); agents.setOpen(false);
      await runtimeSystemApi.quit();
      setExited(true);
    } catch (error) {
      setQuitError(error instanceof Error ? error.message : '退出失败，请重试。');
    } finally {
      quitPending.current = false; setQuitting(false);
    }
  };

  const watchRestart = useCallback(async () => {
    const status = await waitForRestart({
      url: window.location.origin + '/',
      previousToken: document.querySelector('meta[name="buildr-session"]')?.getAttribute('content') ?? null,
    });
    if (status === 'ready') {
      window.location.reload();
      return;
    }
    setRestartPhase('timed-out');
  }, []);

  const restart = async () => {
    if (restartPending.current || quitPending.current) return;
    restartPending.current = true;
    try {
      const ok = await confirmModal({
        title: '重启 Buildr Web？',
        content: '重启将停止当前实例并启动新实例，进行中的生成与任务验证将被取消。确定重启吗？',
        okText: '重启',
        okButtonProps: { danger: true },
      });
      if (!ok) return;
      setRestartError(''); agents.setOpen(false);
      await runtimeSystemApi.restart();
      setRestartPhase('watching');
      void watchRestart();
    } catch (error) {
      setRestartError(error instanceof Error ? error.message : '重启失败，请重试。');
    } finally {
      restartPending.current = false;
    }
  };

  const beginRestartWatch = useCallback(() => {
    setRestartPhase('watching');
    void watchRestart();
  }, [watchRestart]);

  const devUpdateCompleted = useCallback(() => {
    void runtimeSystemApi.restart().catch(() => {}).then(beginRestartWatch);
  }, [beginRestartWatch]);

  const retryRestartWatch = () => {
    if (restartPhase !== 'timed-out') return;
    setRestartPhase('watching');
    void watchRestart();
  };

  const shellValue = {
    requestWorkspacePage,
    workspaceId,
    navigationRevision,
    refreshNavigation,
    workspace,
    setWorkspace,
    openWorkspaceSettings,
    workspaceRegistryRevision,
    openAgentAction,
    breadcrumbParts,
    setBreadcrumbParts,
    taskListResetToken,
    resetTaskList,
    workspaceMenuTarget,
    forgetWorkspacePage,
    codeEntryPath,
    setCodeEntryPath,
  };

  const switchWorkspace = (id: string | null) => {
    navigate(id ? `/workspaces/${id}/overview` : '/?catalog=1');
  };

  const workspaceMenuItems = [
    ...registry.map((entry) => {
      const id = entry.workspace?.id;
      const name = entry.workspace?.name || id || entry.rootPath;
      return {
        key: id || entry.rootPath,
        disabled: !id || entry.status !== 'ready',
        className: id === workspaceId ? 'workspace-switcher-current' : undefined,
        label: <span className="workspace-switcher-option" aria-current={id === workspaceId ? 'true' : undefined}>
          <span className="workspace-switcher-option-name" title={name}>{name}</span>
          <span className="workspace-switcher-option-check" aria-hidden="true">{id === workspaceId ? <CheckOutlined /> : null}</span>
        </span>,
        onClick: id ? () => switchWorkspace(id) : undefined,
      };
    }),
    { type: 'divider' as const },
    ...(workspaceId ? [{
      key: 'settings',
      icon: <SettingOutlined />,
      label: <span data-action="workspace-settings">工作空间设置</span>,
      onClick: () => openWorkspaceSettings(workspaceId),
    }] : []),
    {
      key: 'all',
      icon: <AppstoreOutlined />,
      label: '全部工作空间',
      onClick: () => switchWorkspace(null),
    },
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

  if (restartPhase) {
    return (
      <div className="exit-screen" id="restart-screen">
        <Typography.Title level={2}>{restartPhase === 'watching' ? '正在重启 Buildr Web…' : '重启仍在进行'}</Typography.Title>
        <Typography.Paragraph type="secondary">
          {restartPhase === 'watching'
            ? '页面将在新实例就绪后自动刷新，请稍候。'
            : '等待超过预期仍未检测到新实例就绪。你可以继续等待，或稍后重新打开 Buildr Web。'}
        </Typography.Paragraph>
        {restartPhase === 'timed-out' ? (
          <Button id="restart-retry" type="primary" onClick={retryRestartWatch}>继续等待</Button>
        ) : null}
      </div>
    );
  }

  return (
    <AppShellContext.Provider value={shellValue}>
      <WorkspaceSourceControlProvider workspaceId={workspaceId}>
      <WorkspaceReadCacheProvider key={workspaceId || 'global'}>
      <WorkbenchPreferencesProvider key={workspaceId || "global"} workspaceId={workspaceId}>
      <div className={"app-shell has-primary-navigation area-" + area + (conversations.open && conversations.full ? " has-full-conversation" : "")}>
        <AppShellHeader primaryNavigation="rail" isGlobal={isGlobal} brandHref={isGlobal ? '/' : workspaceHref('/overview')} development={webProfile === 'development'} workspaceName={isGlobal ? '全部工作空间' : (workspace?.name || '正在读取…')} workspaceMenuItems={workspaceMenuItems} area={area} workbenchHref={workspaceHref('/overview')} codeHref={codeEntryPath} workspaceDestination={{to:workspaceDestination.current.path,state:workspaceDestination.current.state}} actions={<>
            {!isGlobal ? <WorkbenchSearch key={workspaceId} /> : null}
            <div className="global-conversations-control"><Button id="global-conversations-entry" type="text" className={conversations.open?'is-active':''} icon={<CommentOutlined />} aria-pressed={conversations.open} aria-controls="agent-conversation-panel" title={conversations.open?'收起对话':'打开对话'} aria-label={conversations.open ? "收起全局对话" : "打开全局对话"} onClick={conversations.toggle}>对话</Button><ConversationAttention/></div>
            {!isGlobal ? <Button className="shell-menu-toggle" aria-label="打开导航菜单" icon={<MenuOutlined />} onClick={() => setNavigationOpen(true)} /> : null}
            <Tooltip title={defaultAgent ? defaultAgent.label + ' · ' + agentStatusLabel(defaultAgent) : agents.error || '查看或接入智能体'}><Button id="global-agents-entry" className={'shell-agent-entry'+(defaultAgent?.availability === 'available' ? ' is-connected' : ' is-offline')} aria-label="智能体" type="text" icon={<RobotOutlined />} onClick={() => agents.setOpen(true)}><span className="global-agent-label">{defaultAgent?.label || '智能体'}</span></Button></Tooltip>
            <InstallationInfoDialog open={installationInfoOpen} onClose={() => setInstallationInfoOpen(false)} />
            <UpdateEntry ref={updateEntryRef} enabled checkOnly={Boolean(preview)} openAgentAction={openAgentAction} onCompleted={webProfile === 'development' ? devUpdateCompleted : undefined} />
            <Dropdown
              menu={{ items: [
                { key: 'installation-info', icon: <InfoCircleOutlined />, label: '安装信息', onClick: () => setInstallationInfoOpen(true) },
                { key: 'check-update', icon: <SyncOutlined />, label: <span id="check-buildr-update">检查更新…</span>, onClick: () => updateEntryRef.current?.check() },
                { key: 'restart', icon: <PoweroffOutlined />, disabled: Boolean(preview), title: preview ? '托管预览由开发工具重新启动' : undefined, label: <span id="restart-buildr">重启 Buildr Web</span>, onClick: () => { void restart(); } },
                { key: 'quit', danger: true, icon: <CloseCircleOutlined />, label: <span id="quit-buildr">退出 Buildr Web</span>, onClick: () => { void quit(); } },
              ] }}
              trigger={['hover']} placement="bottomRight"
            >
              <Button id="more-actions" className="nav-more" aria-label="更多操作" type="text" icon={<EllipsisOutlined />} loading={quitting} />
            </Dropdown>
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
              <Tooltip styles={{ root: { pointerEvents: 'none' } }} title={area === 'workbench' ? '提出新目标' : '交给 Agent'}>
              <Button
                id="open-agent-action"
                aria-label={area === 'workbench' ? '提出新目标' : '交给 Agent'}
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openAgentAction(area === "workbench" ? "start" : undefined)}
              >
                {area === "workbench" ? "提出新目标" : "交给 Agent"}
              </Button>
              </Tooltip>
            ) : null}
</>} />
        {workspaceId&&!preview&&<WorkspacePreparationNotice key={workspaceId} workspaceId={workspaceId}/>}
        {quitError && <Alert id="quit-buildr-error" type="error" showIcon message="Buildr Web 尚未退出" description={quitError}
          action={<Button size="small" loading={quitting} onClick={() => void quit(false)}>重试退出</Button>} />}
        {restartError && <Alert id="restart-buildr-error" type="error" showIcon message="Buildr Web 尚未重启" description={restartError}
          action={<Button size="small" onClick={() => { setRestartError(''); void restart(); }}>重试重启</Button>} />}
        <AppShellFrame isGlobal={isGlobal} compactNavigation={compactNavigation} sidebarCollapsed={sidebarCollapsed} sidebarWidth={sidebarWidth} onSidebarResize={resizeSidebar} onToggleSidebar={() => { setSidebarCollapsed(value => !value); writeOptionalPreference('buildr.sidebar-collapsed', String(!sidebarCollapsed)); }} navigation={<AppNavigation key={workspaceId} />} navigationRail={workspaceId ? <AppPrimaryNavigation sidebarWidth={sidebarWidth} onSidebarResize={resizeSidebar} workspaceId={workspaceId} area={area} /> : undefined} afterContent={<div className="ac-panel-mount" ref={setConversationMount} style={{display: 'contents'}} /> }>{/* Business content stays in the live adapter. */}<>{workspaceId ? <WorkspaceFileEditingProvider key={workspaceId} workspaceId={workspaceId}><ArticleEditorProvider workspaceId={workspaceId}><WorkspacePages workspaceId={workspaceId} renderResource={renderResource} navigationRequest={pageNavigationRequest} /></ArticleEditorProvider></WorkspaceFileEditingProvider> : <Outlet />}</></AppShellFrame>
      </div>

      {!isGlobal ? <Drawer title="导航" placement="left" width={280} open={navigationOpen}
        onClose={() => setNavigationOpen(false)} destroyOnClose>
        {navigationOpen ? <AppNavigation key={workspaceId} onNavigate={() => setNavigationOpen(false)} /> : null}
      </Drawer> : null}
      <div
        id="agent-action-backdrop"
        className={visibleDrawer ? '' : 'hidden'}
        onClick={closeAgentAction}
        aria-hidden
      />
      <DrawerShell
        id="agent-action-drawer"
        open={visibleDrawer}
        onClose={closeAgentAction}
        eyebrow="AGENT ACTION"
        title="交给 Agent"
        titleId="agent-action-title"
        sub="选择要由 Agent 完成的动作"
        closeAriaLabel="关闭"
        closeButtonId="close-agent-action"
        rootClassName="agent-action-shell"
      >
        <div id="agent-action-content">
          {visibleDrawer ? (
            <AgentActionDrawer
              initialAction={drawerAction}
              initialContext={drawerContext}
            />
          ) : null}
        </div>
      </DrawerShell>
      <AgentRegistryDrawer />
      <AgentConnectionSettings />
      <WorkspaceSettingsDrawer open={settingsOpen} workspaceId={settingsWorkspaceId}
        onClose={() => setSettingsOpen(false)} onSaved={workspaceSettingsSaved} />
    </WorkbenchPreferencesProvider>
    <ConversationPanel portalTarget={conversationMount} defaultWorkspaceId={workspaceId} workspaces={registry.flatMap(entry => entry.workspace ? [{id:entry.workspace.id,name:entry.workspace.name,rootPath:entry.rootPath}] : [])} />
    </WorkspaceReadCacheProvider>
    </WorkspaceSourceControlProvider>
    </AppShellContext.Provider>
  );
}
