import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button } from 'antd';
import {
  configureDesktopBridge,
  desktopNotify,
  desktopPage,
  type DesktopTool,
} from '../../../buildr-harness-web/src/shell';
import { api } from '../api';
import { createWorkspaceClient } from '../features/workspace/api/workspace-client';
import { CodeExplorerPage } from '../features/code/pages/CodeExplorerPage';
import { CodeSourceControlPage } from '../features/code/pages/CodeSourceControlPage';
import type { CodeTaskEntry } from '../features/code/code-navigation';
import { WorkspaceReadCacheProvider } from '../components/WorkspaceReadCache';
import { WorkbenchPreferencesProvider } from '../features/workbench/hooks/useWorkbenchPreferences';
import { WorkspaceFileEditingProvider } from './WorkspaceFileEditingProvider';
import { WorkspaceSourceControlProvider } from './WorkspaceSourceControlProvider';
import { AppShellContext, type AppShellContextValue, type WorkspaceShellInfo } from './AppShellContext';
import { WorkspaceViewActiveContext } from './pageTabs';

export const DEVELOPMENT_DESKTOP_CHANNEL = 'buildr-development-desktop/v1:';
const MODE_STORAGE_KEY = 'buildr.development-dsh.mode';

export type DesktopWorkspaceScope = {
  id: string;
  path: string;
  name?: string;
};

export type DesktopRevealFile = {
  workspaceId: string;
  revision: string;
  path: string;
  line?: number;
  checkout: {
    repositoryId: string;
    checkoutId: string;
  };
};

let nativeSidebarAvailable = false;
const nativeSidebarListeners = new Set<(value: boolean) => void>();
let bridgeInitialized = false;
let lastReportedScopeJson = '';

function hashValue(): string {
  return typeof location !== 'undefined' && typeof location.hash === 'string'
    ? location.hash.slice(1)
    : '';
}

function readModeStorage(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(MODE_STORAGE_KEY) === 'development';
  } catch {
    return false;
  }
}

function writeModeStorage(active: boolean) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (active) sessionStorage.setItem(MODE_STORAGE_KEY, 'development');
    else sessionStorage.removeItem(MODE_STORAGE_KEY);
  } catch {
    /* Restricted storage environments keep hash-based detection intact. */
  }
}

export function desktopToolPage(): { kind: DesktopTool; workspaceId: string } | undefined {
  const page = desktopPage(hashValue());
  if (!page || page.kind === 'chat') return undefined;
  return page;
}

export function isDevelopmentDesktop(): boolean {
  const query = new URLSearchParams(hashValue());
  if (query.get('dsh') === 'development') return true;
  return readModeStorage();
}

export function initDevelopmentDesktopMode(): boolean {
  const query = new URLSearchParams(hashValue());
  if (query.get('dsh') === 'development') writeModeStorage(true);
  const desktop = isDevelopmentDesktop();
  const tool = desktopToolPage();
  configureDesktopBridge({
    channel: DEVELOPMENT_DESKTOP_CHANNEL,
    active: desktop || Boolean(tool),
  });
  if (!bridgeInitialized && typeof window !== 'undefined') {
    bridgeInitialized = true;
    window.addEventListener('buildr-dsh-host', (event: Event) => {
      const value = (event as CustomEvent<{ native?: unknown } | undefined>).detail?.native;
      if (typeof value === 'boolean' && value !== nativeSidebarAvailable) {
        nativeSidebarAvailable = value;
        for (const listener of nativeSidebarListeners) listener(value);
      }
    });
  }
  return desktop;
}

initDevelopmentDesktopMode();

export function useDesktopNativeSidebar(): boolean {
  const [nativeSidebar, setNativeSidebar] = useState(() => isDevelopmentDesktop() && nativeSidebarAvailable);
  useEffect(() => {
    if (!isDevelopmentDesktop()) {
      setNativeSidebar(false);
      return;
    }
    setNativeSidebar(nativeSidebarAvailable);
    const update = (value: boolean) => setNativeSidebar(value);
    nativeSidebarListeners.add(update);
    return () => {
      nativeSidebarListeners.delete(update);
    };
  }, []);
  return nativeSidebar;
}

export function isDesktopNativeSidebar(): boolean {
  return isDevelopmentDesktop() && nativeSidebarAvailable;
}

export function desktopReturnToHost(): (() => void) | undefined {
  if (!isDevelopmentDesktop()) return undefined;
  return () => desktopNotify({ kind: 'shell', action: 'leave' });
}

export function toggleDesktopRightSidebar() {
  if (!isDevelopmentDesktop()) return;
  desktopNotify({ kind: 'shell', action: 'toggle-right' });
}

export function reportDesktopWorkspace(scope: DesktopWorkspaceScope | null, force = false) {
  if (!isDevelopmentDesktop()) return;
  const normalized = scope && scope.id && scope.path
    ? { id: scope.id, path: scope.path, ...(scope.name?.trim() ? { name: scope.name.trim() } : {}) }
    : null;
  const serialized = JSON.stringify(normalized);
  if (!force && serialized === lastReportedScopeJson) return;
  lastReportedScopeJson = serialized;
  desktopNotify({ kind: 'workspace', scope: normalized });
}

export function revealDesktopExplorerFile(
  workspaceId: string,
  file: { path: string; line?: number; checkout: { repositoryId: string; checkoutId: string } },
): boolean {
  if (!isDesktopNativeSidebar()) return false;
  if (!workspaceId || !file.path || !file.checkout.repositoryId || !file.checkout.checkoutId) return false;
  desktopNotify({
    kind: 'reveal',
    file: {
      workspaceId,
      revision: 'observed',
      path: file.path,
      ...(typeof file.line === 'number' && Number.isInteger(file.line) && file.line > 0 ? { line: file.line } : {}),
      checkout: file.checkout,
    },
  });
  return true;
}

export function DesktopLinkFallbackNotice() {
  const desktop = isDevelopmentDesktop();
  const [fallback, setFallback] = useState<string>();

  useEffect(() => {
    if (!desktop) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return;
      const anchor = event.target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      let url: URL;
      try {
        url = new URL(anchor.href, location.href);
      } catch {
        return;
      }
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin === location.origin) return;
      event.preventDefault();
      setFallback(undefined);
      desktopNotify({ kind: 'link', url: url.href });
    };
    const onHost = (event: Event) => {
      const value = (event as CustomEvent<{ fallback?: unknown } | undefined>).detail?.fallback;
      if (typeof value === 'string' && /^https?:/i.test(value)) setFallback(value);
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('buildr-dsh-host', onHost);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('buildr-dsh-host', onHost);
    };
  }, [desktop]);

  if (!desktop || !fallback) return null;
  return (
    <Alert
      className="development-dsh-link-fallback"
      type="warning"
      showIcon
      closable
      onClose={() => setFallback(undefined)}
      message="DSH 右侧栏未启用，外部链接未在当前窗口打开"
      action={
        <>
          <Button
            size="small"
            onClick={() => {
              desktopNotify({ kind: 'link', url: fallback, external: true });
              setFallback(undefined);
            }}
          >
            用默认浏览器打开
          </Button>
          <Button
            size="small"
            onClick={() => {
              void navigator.clipboard?.writeText(fallback).catch(() => {});
            }}
          >
            复制链接
          </Button>
        </>
      }
    />
  );
}

function DesktopToolRouterContent({
  tool,
  workspaceId,
}: {
  tool: DesktopTool;
  workspaceId: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const basePath = `/workspaces/${encodeURIComponent(workspaceId)}/code/${tool === 'explorer' ? 'explorer' : 'source-control'}`;
  const explorerPath = `/workspaces/${encodeURIComponent(workspaceId)}/code/explorer`;

  useEffect(() => {
    const onHost = (event: Event) => {
      if (tool !== 'explorer') return;
      const file = (event as CustomEvent<{ reveal?: DesktopRevealFile } | undefined>).detail?.reveal;
      if (!file || file.workspaceId !== workspaceId) return;
      navigate(explorerPath, {
        replace: true,
        state: {
          nonce: crypto.randomUUID(),
          revealFileTree: true,
          codeEntry: {
            origin: 'source-control',
            file: {
              repositoryId: file.checkout.repositoryId,
              checkoutId: file.checkout.checkoutId,
              path: file.path,
              ...(typeof file.line === 'number' ? { line: file.line } : {}),
            },
            from: { pathname: explorerPath, search: '', hash: '', state: null },
          } satisfies CodeTaskEntry & { nonce?: string },
        },
      });
    };
    window.addEventListener('buildr-dsh-host', onHost);
    desktopNotify({ kind: 'tool-ready', tool, workspaceId });
    return () => window.removeEventListener('buildr-dsh-host', onHost);
  }, [tool, workspaceId, explorerPath, navigate]);

  useEffect(() => {
    if (tool !== 'source-control') return;
    if (!location.pathname.endsWith('/code/explorer')) return;
    const entry = (location.state as { codeEntry?: CodeTaskEntry } | null)?.codeEntry;
    const file = entry?.file;
    if (file?.repositoryId && file.checkoutId && file.path) {
      desktopNotify({
        kind: 'reveal',
        file: {
          workspaceId,
          revision: 'observed',
          path: file.path,
          ...(typeof file.line === 'number' && file.line > 0 ? { line: file.line } : {}),
          checkout: { repositoryId: file.repositoryId, checkoutId: file.checkoutId },
        },
      });
    }
    navigate(basePath, { replace: true });
  }, [tool, workspaceId, basePath, location.pathname, location.state, navigate]);

  return tool === 'explorer' ? <CodeExplorerPage /> : <CodeSourceControlPage />;
}

export function DevelopmentDesktopToolPage({
  tool,
  workspaceId,
}: {
  tool: DesktopTool;
  workspaceId: string;
}) {
  const [workspace, setWorkspaceInfo] = useState<WorkspaceShellInfo | null>(null);
  const [active, setActive] = useState(true);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const [registryRevision, setRegistryRevision] = useState(0);
  const [taskListResetToken, setTaskListResetToken] = useState(0);
  const workspaceClient = useMemo(() => createWorkspaceClient(api), []);

  useEffect(() => {
    configureDesktopBridge({ channel: DEVELOPMENT_DESKTOP_CHANNEL, active: true });
    const onHost = (event: Event) => {
      const value = (event as CustomEvent<{ active?: unknown } | undefined>).detail?.active;
      if (typeof value === 'boolean') setActive(value);
    };
    window.addEventListener('buildr-dsh-host', onHost);
    return () => window.removeEventListener('buildr-dsh-host', onHost);
  }, []);

  useEffect(() => {
    setWorkspaceInfo(null);
    const controller = new AbortController();
    void workspaceClient.readById(workspaceId, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setWorkspaceInfo({ name: data.workspace.name, rootPath: data.rootPath });
    }).catch(() => {});
    return () => controller.abort();
  }, [workspaceClient, workspaceId]);

  const setWorkspace = useCallback((data: { workspace: { name: string }; rootPath: string }) => {
    setWorkspaceInfo({ name: data.workspace.name, rootPath: data.rootPath });
  }, []);
  const initialPath = `/workspaces/${encodeURIComponent(workspaceId)}/code/${tool === 'explorer' ? 'explorer' : 'source-control'}`;
  const workspaceMenuTarget = useCallback((_section: string) => ({ to: initialPath, state: null }), [initialPath]);
  const noop = useRef(() => {}).current;
  const shellValue = useMemo<AppShellContextValue>(() => ({
    workspaceId,
    navigationRevision,
    refreshNavigation: () => setNavigationRevision(value => value + 1),
    workspace,
    setWorkspace,
    openWorkspaceSettings: noop,
    workspaceRegistryRevision: registryRevision,
    refreshWorkspaceRegistry: () => setRegistryRevision(value => value + 1),
    openAgentAction: noop,
    breadcrumbParts: [],
    setBreadcrumbParts: noop,
    taskListResetToken,
    resetTaskList: () => setTaskListResetToken(value => value + 1),
    workspaceMenuTarget,
    forgetWorkspacePage: noop,
    codeEntryPath: initialPath,
    setCodeEntryPath: noop,
  }), [workspaceId, navigationRevision, workspace, setWorkspace, registryRevision, taskListResetToken, workspaceMenuTarget, initialPath, noop]);

  return (
    <AppShellContext.Provider value={shellValue}>
      <WorkspaceReadCacheProvider scopeKey={workspaceId}>
        <WorkbenchPreferencesProvider workspaceId={workspaceId}>
          <WorkspaceSourceControlProvider workspaceId={workspaceId} active={active}>
            <WorkspaceFileEditingProvider workspaceId={workspaceId}>
              <WorkspaceViewActiveContext.Provider value={active}>
                <div className="development-dsh-tool" data-tool={tool} data-workspace-id={workspaceId}>
                  <MemoryRouter key={`${tool}:${workspaceId}`} initialEntries={[initialPath]}>
                    <DesktopToolRouterContent tool={tool} workspaceId={workspaceId} />
                  </MemoryRouter>
                </div>
              </WorkspaceViewActiveContext.Provider>
            </WorkspaceFileEditingProvider>
          </WorkspaceSourceControlProvider>
        </WorkbenchPreferencesProvider>
      </WorkspaceReadCacheProvider>
    </AppShellContext.Provider>
  );
}

export function DesktopShellControls({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
