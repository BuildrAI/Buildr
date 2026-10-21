import { AppShellContext, useAppShell } from './AppShellContext';
import { useRef, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode, type MouseEvent } from 'react';
import { UNSAFE_LocationContext, useLocation, useNavigate, useNavigationType, useOutlet, type Location } from 'react-router-dom';
import { WorkspaceTabsContext, WorkspaceViewActiveContext, WorkspaceViewTransientContext } from './pageTabs';
import { InsideResourcePreview, ResourcePreviewContext, resourcePreview, type PreviewState, type ResourcePreview } from './resource-preview';
import { dshResourceDestination, dshTaskResource } from './dsh-resource-navigation';
import { PageTabStrip } from './PageTabStrip';
import { tabElementId, tabPanelId } from '../lib/tab-navigation';
import { defaultTabForPath, reorderPageTabs, parseTabs, previewOwnerPath, previewOwnerSearch, ratioStorageKey, readRatio, tabForPath, tabsStorageKey, workspacePageLayout, type WorkspacePageTab } from './workspace-pages';
import { WorkspacePaneHostProvider, WorkspacePaneHost, useWorkspacePaneHost, type WorkspacePageNavigationRequest } from './WorkspacePaneHost';
import { RetainedWorkspaceRoute } from './workspace-routes';

type LocationValue = React.ContextType<typeof UNSAFE_LocationContext>;
type Visited = { path: string; location: LocationValue; instance: string };
function read(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Private mode still permits browsing. */ } }

/** Retains only visited workspace pages; each outlet keeps its own route and location. */
export function WorkspacePages({ workspaceId, renderResource, navigationRequest }: { workspaceId: string; renderResource: (item: ResourcePreview) => ReactNode; navigationRequest?: WorkspacePageNavigationRequest }) {
  const tabPrefix = `workspace-${workspaceId}`;
  const { forgetWorkspacePage, setCodeEntryPath } = useAppShell();
  const outlet = useOutlet();
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousPagePath = useRef(location.pathname);
  const previousPreviewLocation = useRef({ pathname: location.pathname, hadViews: location.state?.resourceViews !== undefined });
  const locationValue = useContext(UNSAFE_LocationContext);
  const navigate = useNavigate();
  const current = tabForPath(workspaceId, location.pathname);
  const lastCodePath = useRef('');
  if (current?.key.startsWith('dir:code:')) lastCodePath.current = current.path;
  const directPreview = resourcePreview(workspaceId, location.pathname + location.search);
  const directDshTask = dshTaskResource(workspaceId, location.pathname, location.search);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const [visited, setVisited] = useState<Visited[]>([]);
  const visitedRef = useRef(visited); visitedRef.current = visited;
  const previewRevision = useRef(0);
  const removedResources = useRef(new Set<string>());
  const removePreviewResource = (kind: string, id: string) => {
    removedResources.current.add(`${kind}:${id}`);
    setPreviews(previous => Object.fromEntries(Object.entries(previous).map(([owner, state]) => {
      const items = state.items.filter(item => !(item.kind === kind && item.id === id));
      return [owner, { items, active: items.some(item => item.kind === state.active) ? state.active : items.at(-1)?.kind || null }];
    })));
  };
  const commitPreview = useCallback((owner: string, next: PreviewState, taskBriefId?: string) => {
    setPreviews(prev => ({ ...prev, [owner]: next }));
    const entry = visitedRef.current.find(item => item.path === owner);
    const { taskBriefId: _previousBrief, ...retainedState } = (owner === location.pathname ? location.state : entry?.location.location.state) || {};
    const state = { ...retainedState, resourceViews: next, ...(taskBriefId ? { taskBriefId } : {}) };
    if (owner === location.pathname) navigate({ pathname: owner, search: location.search, hash: location.hash }, { state });
    else setVisited(previous => previous.map(item => item.path === owner ? { ...item, location: { ...item.location, location: { ...item.location.location, state, key: `preview-${++previewRevision.current}` } } } : item));
  }, [navigate, location.pathname, location.search, location.hash, location.state]);
  const openPreview = useCallback((owner: string, path: string, intent?: { taskBrief: true }) => {
    const resolved = resourcePreview(workspaceId, path);
    if (!resolved) return false;
    if (directDshTask) { navigate(dshResourceDestination(workspaceId, path, location.search)); return true; }
    const state = previews[owner] || { items: [], active: null };
    const taskBriefId = intent?.taskBrief && ['task', 'composite-task'].includes(resolved.kind) ? resolved.id : undefined;
    const item = taskBriefId ? state.items.find(item => ['task', 'composite-task'].includes(item.kind) && item.id === taskBriefId) || resolved : resolved;
    if (!taskBriefId && state.active === item.kind && state.items.some(p => p.path === item.path)) return true;
    commitPreview(owner, { items: state.items.some(p => p.kind === item.kind) ? state.items.map(p => p.kind === item.kind ? item : p) : [...state.items, item], active: item.kind }, taskBriefId);
    return true;
  }, [workspaceId, previews, commitPreview, Boolean(directDshTask), navigate, location.search]);
  const identifyTask = useCallback((owner: string, id: string, composite: boolean) => {
    const state = previews[owner];
    if (!state) return;
    const existing = state.items.find(item => ['task', 'composite-task'].includes(item.kind) && item.id === id);
    const kind = composite ? 'composite-task' : 'task';
    if (!existing || existing.kind === kind) return;
    const path = existing.path.split('?')[0] + (composite ? '?taskType=composite' : '');
    const next = resourcePreview(workspaceId, path)!;
    const items = state.items.filter(item => item !== existing && item.kind !== kind).concat(next);
    commitPreview(owner, { items, active: state.active === existing.kind ? kind : state.active });
  }, [previews, workspaceId, commitPreview]);
  const activatePreview = (owner: string, kind: string) => { const state = previews[owner]; if (state) commitPreview(owner, { ...state, active: kind }); };
  const clearPreview = (owner: string) => commitPreview(owner, { items: [], active: null });
  const closePreview = (owner: string, kind: string) => {
    const state = previews[owner]; if (!state) return;
    const items = state.items.filter(p => p.kind !== kind);
    commitPreview(owner, { items, active: state.active === kind ? items.at(-1)?.kind || null : state.active });
  };
  useEffect(() => {
    const saved = location.state?.resourceViews as PreviewState | undefined;
    const previous = previousPreviewLocation.current;
    previousPreviewLocation.current = { pathname: location.pathname, hadViews: saved !== undefined };
    if (saved === undefined) {
      // Undoing an in-place resource opening restores the underlying document.
      // Ordinary page/tab navigation still retains that page's comparison pane.
      if (navigationType === 'POP' && previous.pathname === location.pathname && previous.hadViews) {
        setPreviews(prev => ({ ...prev, [location.pathname]: { items: [], active: null } }));
      }
      return;
    }
    const items = Array.isArray(saved?.items) ? saved.items.map(item => resourcePreview(workspaceId, item?.path)).filter((item): item is ResourcePreview => Boolean(item) && !removedResources.current.has(`${item!.kind}:${item!.id}`)).filter((item, index, all) => all.findIndex(other => other.kind === item.kind) === index) : [];
    setPreviews(prev => ({ ...prev, [location.pathname]: { items, active: items.some(item => item.kind === saved?.active) ? saved!.active : null } }));
  }, [location.key, location.pathname, workspaceId, navigationType]);
  useEffect(() => {
    if (directDshTask) return;
    if (location.pathname === `/workspaces/${workspaceId}/projects/new`) { navigate(`/workspaces/${workspaceId}/projects`, { replace: true, state: { createProject: true } }); return; }
    const preview = resourcePreview(workspaceId, location.pathname + location.search);
    if (preview) {
      const owner = previewOwnerPath(workspaceId, preview);
      const listSearch = previewOwnerSearch(workspaceId, preview, location.state);
      const taskBriefId = location.state?.taskBriefId === preview.id ? preview.id : undefined;
      navigate({ pathname: owner, search: listSearch }, { replace: true, state: { resourceViews: { items: [preview], active: preview.kind }, ...(taskBriefId ? { taskBriefId } : {}) } });
    }
  }, [workspaceId, location.pathname, location.search, location.state, navigate, Boolean(directDshTask)]);
  const [tabs, setTabs] = useState(() => parseTabs(workspaceId, read(tabsStorageKey(workspaceId))));
  const closingPage = useRef<string | null>(null);
  const forgottenPages = useRef<string[]>([]);
  const previousClosedPath = useRef(location.pathname);
  const forgetPage = useRef(forgetWorkspacePage);
  forgetPage.current = forgetWorkspacePage;
  const [ratio, updateRatio] = useState(() => readRatio(read(ratioStorageKey(workspaceId))));
  const [paneWidths, setPaneWidths] = useState<Record<string, number>>({});
  const reportPaneWidth = useCallback((path: string, width: number) => setPaneWidths((prev) => prev[path] === width ? prev : { ...prev, [path]: width }), []);

  const register = useCallback((tab: WorkspacePageTab) => {
    if (!tabForPath(workspaceId, tab.path) || resourcePreview(workspaceId, tab.path)) return;
    setTabs((prev) => {
      const old = prev.find((t) => t.key === tab.key);
      if (old?.title === tab.title && old.kind === tab.kind) return prev;
      return old ? prev.map((t) => t.key === tab.key ? { ...t, title: tab.title, kind: tab.kind } : t) : [...prev, tab];
    });
  }, [workspaceId]);

  useLayoutEffect(() => {
    const directory = '/workspaces/' + workspaceId + '/projects';
    const fromDirectory = [directory,`/workspaces/${workspaceId}/workspace-overview`].includes(previousPagePath.current) && navigationType !== 'POP'
      && location.pathname.startsWith(directory + '/') && !location.pathname.slice(directory.length + 1).includes('/') && !visitedRef.current.some(entry => entry.path === location.pathname);
    previousPagePath.current = location.pathname;
    if (closingPage.current && closingPage.current !== location.pathname) closingPage.current = null;
    if (!current || resourcePreview(workspaceId, location.pathname)) return;
    // The close action already removed this page; do not let the route effect add it back before navigation settles.
    if (closingPage.current === location.pathname) return;
    if (fromDirectory) setPreviews(prev => ({ ...prev, [location.pathname]: { items: [], active: null } }));
    const search = location.search;
    setTabs((prev) => {
      const old = prev.find(t => t.key === current.key);
      if (old?.path === current.path && old.search === search) return prev;
      const next = {...current, title: old?.title || current.title, search};
      return old ? prev.map(t => t.key === current.key ? next : t) : [...prev, next];
    });
    setVisited((prev) => {
      const old = prev.find((entry) => entry.path === location.pathname);
      if (old?.location.location.key === location.key) return prev;
      const entry = { path: location.pathname, location: locationValue, instance: old?.instance || location.key };
      return old ? prev.map((p) => p.path === entry.path ? entry : p) : [...prev, entry];
    });
  }, [location, locationValue, current?.key, navigationType, workspaceId]);

  useLayoutEffect(() => { write(tabsStorageKey(workspaceId), JSON.stringify(tabs)); }, [tabs, workspaceId]);
  useLayoutEffect(() => {
    if (previousClosedPath.current === location.pathname) return;
    previousClosedPath.current = location.pathname;
    for (const path of forgottenPages.current.splice(0)) forgetPage.current(path);
  }, [location.pathname]);
  useEffect(() => {
    const codeTabs = tabs.filter(tab => tab.key.startsWith('dir:code:'));
    if (current?.key.startsWith('dir:code:') && !codeTabs.some(tab => tab.path === current.path)) codeTabs.push(current);
    const match = codeTabs.find(tab => tab.path === lastCodePath.current);
    const target = match || codeTabs.at(-1);
    setCodeEntryPath?.(target ? target.path + (target.search || '') : `/workspaces/${workspaceId}/code/source-control`);
  }, [workspaceId, current?.key, location.pathname, location.search, tabs, setCodeEntryPath]);
  const close = useCallback((key: string) => {
    const index = tabs.findIndex((t) => t.key === key);
    const target = tabs[index];
    if (!target) return;
    const closingCurrent = tabForPath(workspaceId, location.pathname)?.key === key;
    const next = tabs.filter((t) => t.key !== key);
    const fallback = defaultTabForPath(workspaceId, location.pathname);
    const reopensSame = next.length === 0 && fallback.path === target.path;
    if (closingCurrent && !reopensSame) closingPage.current = target.path;
    forgetWorkspacePage(target.path);
    forgottenPages.current.push(target.path);
    setTabs(next.length ? next : [fallback]);
    setVisited((prev) => reopensSame ? prev : prev.filter((p) => tabForPath(workspaceId, p.path)?.key !== key));
    setPreviews((previous) => {
      if (!(target.path in previous)) return previous;
      const remaining = { ...previous };
      delete remaining[target.path];
      return remaining;
    });
    if (closingCurrent) {
      const nextTab = next[Math.min(index, next.length - 1)] || fallback;
      navigate({ pathname: nextTab.path, search: nextTab.search || "" });
    }
  }, [tabs, workspaceId, location.pathname, navigate, forgetWorkspacePage]);
  const reorder = useCallback((key: string, index: number) => setTabs((prev) => reorderPageTabs(prev, key, index)), []);
  const setRatio = useCallback((value: number) => {
    updateRatio(value);
    write(ratioStorageKey(workspaceId), String(value));
  }, [workspaceId]);
  // Render a first visit immediately; layout effect retains the same keyed container before paint.
  const closingCurrentPage = closingPage.current === location.pathname;
  const entries = current && !closingCurrentPage && !resourcePreview(workspaceId, location.pathname) && !visited.some((p) => p.path === location.pathname)
    ? [...visited, { path: location.pathname, location: locationValue, instance: location.key }] : visited;
  const displayTabs = current && !closingCurrentPage && !resourcePreview(workspaceId, location.pathname) && !tabs.some((t) => t.key === current.key) ? [...tabs, current] : tabs;
  const sharedTabs = displayTabs;
  const ensurePage = (key: string) => {
    const tab = sharedTabs.find(item => item.key === key);
    if (!tab) return;
    setVisited(previous => previous.some(entry => entry.path === tab.path) ? previous : [...previous, { path: tab.path, instance: `retained:${tab.path}`, location: { navigationType, location: { pathname: tab.path, search: tab.search || '', hash: '', state: null, key: `retained:${tab.path}` } } }]);
  };
  const activatePage = (key: string) => {
    const tab = sharedTabs.find(item => item.key === key);
    if (!tab) return;
    ensurePage(key);
    const retained = visitedRef.current.find(entry => entry.path === tab.path)?.location.location;
    navigate({ pathname: tab.path, search: tab.search || retained?.search || '', hash: retained?.hash || '' }, { state: retained?.state });
  };
  const resources = { navigationType, navigationKey: location.key, taskBriefId: location.state?.taskBriefId, render: renderResource, states: previews, open: openPreview, identifyTask, activate: activatePreview, close: closePreview, clear: clearPreview, remove: removePreviewResource };
  return <WorkspaceTabsContext.Provider value={{ tabs: displayTabs, register, close, reorder, ratio, setRatio, reportPaneWidth }}><WorkspacePaneHostProvider workspaceId={workspaceId} currentPath={location.pathname} enabled={Boolean(current && !current.key.startsWith('dir:code:'))} tabs={sharedTabs} paneWidth={paneWidths[location.pathname] || 0} navigationRequest={navigationRequest} ensurePage={ensurePage} activatePage={activatePage} closePage={close} reorderPage={reorder}><HostedResources workspaceId={workspaceId} value={resources}>
    <div className="workspace-pages" hidden={!current}>
      <FallbackPageHeader path={location.pathname} tabPrefix={tabPrefix} tabs={sharedTabs} close={close} reorder={reorder} />
      <WorkspacePageStack workspaceId={workspaceId} ownerPath={location.pathname}>
        {entries.map(entry => <RetainedPage key={entry.path + ':' + entry.instance} entry={entry} workspaceId={workspaceId} currentPath={location.pathname} current={Boolean(current)} tabPrefix={tabPrefix} />)}
        <WorkspacePaneHost />
      </WorkspacePageStack>
    </div>
    {directDshTask ? <InsideResourcePreview.Provider value={true}><WorkspaceViewActiveContext.Provider value={true}><WorkspacePageStack workspaceId={workspaceId} ownerPath={location.pathname} className="resource-preview-content" key={directDshTask.id}>{renderResource(directDshTask)}</WorkspacePageStack></WorkspaceViewActiveContext.Provider></InsideResourcePreview.Provider> : !current && !directPreview ? outlet : null}
  </HostedResources></WorkspacePaneHostProvider></WorkspaceTabsContext.Provider>;
}

function HostedResources({ workspaceId, value, children }: { workspaceId: string; value: NonNullable<React.ContextType<typeof ResourcePreviewContext>>; children: ReactNode }) {
  const host = useWorkspacePaneHost();
  return <ResourcePreviewContext.Provider value={{ ...value, open(owner, path, intent) {
    const opened = value.open(owner, path, intent);
    const item = opened && resourcePreview(workspaceId, path);
    if (item) host?.revealContent(owner, `preview:${item.kind}`);
    return opened;
  } }}>{children}</ResourcePreviewContext.Provider>;
}

function WorkspacePageStack({ workspaceId, ownerPath, className = 'workspace-page-stack', children }: { workspaceId: string; ownerPath: string; className?: string; children: ReactNode }) {
  const previews = useContext(ResourcePreviewContext);
  const navigate = useNavigate();
  const capture = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as HTMLElement, link = target.closest('a');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    // The file reader resolves these links against its own repository/version.
    // A parent-relative file can otherwise resemble a workspace resource URL.
    if (link.classList.contains('markdown-relative-link')) return;
    const url = new URL(link.href, window.location.href);
    const owner = target.closest<HTMLElement>('[data-workspace-pane-owner]')?.dataset.workspacePaneOwner || ownerPath;
    // Code keeps its own panes. Navigate within the app to retain its open files.
    if (url.origin === window.location.origin && tabForPath(workspaceId, owner)?.key.startsWith('dir:code:')) {
      const resource = resourcePreview(workspaceId, url.pathname + url.search);
      if (!resource) return;
      const brief = link.classList.contains('markdown-task-link') && ['task', 'composite-task'].includes(resource.kind);
      event.preventDefault(); event.stopPropagation();
      navigate(url.pathname + url.search + url.hash, { state: brief ? { taskBriefId: resource.id } : undefined });
      return;
    }
    if (url.origin === window.location.origin && previews?.open(owner, url.pathname + url.search + url.hash, link.classList.contains('markdown-task-link') ? { taskBrief: true } : undefined)) { event.preventDefault(); event.stopPropagation(); }
  };
  return <div className={className} onClickCapture={capture}>{children}</div>;
}

function FallbackPageHeader({ path, tabPrefix, tabs, close, reorder }: { path: string; tabPrefix: string; tabs: WorkspacePageTab[]; close: (key: string) => void; reorder: (key: string, index: number) => void }) {
  const host = useWorkspacePaneHost();
  if (host?.viewFor(path).registered) return null;
  return <div className="workspace-page-tabs"><PageTabStrip idPrefix={tabPrefix} tabs={tabs} onClose={close} onReorder={reorder} /></div>;
}

function RetainedPage({ entry, workspaceId, currentPath, current, tabPrefix }: { entry: Visited; workspaceId: string; currentPath: string; current: boolean; tabPrefix: string }) {
  const host = useWorkspacePaneHost(), shell = useAppShell(), previews = useContext(ResourcePreviewContext);
  const view = host?.viewFor(entry.path), active = view?.registered ? view.pageVisible : entry.path === currentPath && current;
  const transient = Boolean(view?.registered && view.pageTransient);
  const tab = tabForPath(workspaceId, entry.path);
  const breadcrumbGuard = useRef({ allowed: false, set: shell.setBreadcrumbParts });
  breadcrumbGuard.current = { allowed: entry.path === currentPath && !transient, set: shell.setBreadcrumbParts };
  const cachedBreadcrumb = useRef<string[] | null>(null);
  const setBreadcrumbParts = useCallback((parts: string[]) => { const next = [...parts]; cachedBreadcrumb.current = next; const guard = breadcrumbGuard.current; if (guard.allowed) guard.set(next); }, [entry.path]);
  useEffect(() => { const guard = breadcrumbGuard.current; if (guard.allowed && cachedBreadcrumb.current) guard.set(cachedBreadcrumb.current); }, [entry.path, currentPath, transient]);
  const scopedShell = { ...shell, setBreadcrumbParts };
  return <div className={`workspace-page${workspacePageLayout(workspaceId, entry.path) === 'functional' ? ' workspace-page-functional' : ''}`} hidden={entry.path !== currentPath || !current || view?.registered}
    id={view?.registered ? undefined : tabPanelId(tabPrefix, entry.path)} role={!view?.registered && tab?.kind === 'proj' ? 'tabpanel' : undefined} aria-labelledby={!view?.registered && tab?.kind === 'proj' ? tabElementId(tabPrefix, tab.key) : undefined}>
    <AppShellContext.Provider value={scopedShell}><WorkspaceViewActiveContext.Provider value={active}><WorkspaceViewTransientContext.Provider value={transient}><UNSAFE_LocationContext.Provider value={entry.location}>
      <ResourcePreviewContext.Provider value={previews ? { ...previews, navigationType: entry.location.navigationType, navigationKey: entry.location.location.key, taskBriefId: entry.location.location.state?.taskBriefId } : null}><RetainedWorkspaceRoute location={entry.location.location as Location} /></ResourcePreviewContext.Provider>
    </UNSAFE_LocationContext.Provider></WorkspaceViewTransientContext.Provider></WorkspaceViewActiveContext.Provider></AppShellContext.Provider>
  </div>;
}
