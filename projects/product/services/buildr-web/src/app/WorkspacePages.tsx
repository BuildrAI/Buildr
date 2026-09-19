import { useAppShell } from './AppShellContext';
import { useRef, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode, type MouseEvent } from 'react';
import { UNSAFE_LocationContext, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { WorkspaceTabsContext } from './pageTabs';
import { ResourcePreviewContext, resourcePreview, type PreviewState, type ResourcePreview } from './resource-preview';
import { PageTabStrip } from './PageTabStrip';
import { moveTab, parseTabs, ratioStorageKey, readRatio, tabForPath, tabsStorageKey, type WorkspacePageTab } from './workspace-pages';

type LocationValue = React.ContextType<typeof UNSAFE_LocationContext>;
type Visited = { path: string; node: ReactNode; location: LocationValue };
function read(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Private mode still permits browsing. */ } }

/** Retains only visited workspace pages; each outlet keeps its own route and location. */
export function WorkspacePages({ workspaceId, renderResource }: { workspaceId: string; renderResource: (item: ResourcePreview) => ReactNode }) {
  const { forgetWorkspacePage } = useAppShell();
  const outlet = useOutlet();
  const location = useLocation();
  const locationValue = useContext(UNSAFE_LocationContext);
  const navigate = useNavigate();
  const current = tabForPath(workspaceId, location.pathname);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const removedResources = useRef(new Set<string>());
  const removePreviewResource = (kind: string, id: string) => {
    removedResources.current.add(`${kind}:${id}`);
    setPreviews(previous => Object.fromEntries(Object.entries(previous).map(([owner, state]) => {
      const items = state.items.filter(item => !(item.kind === kind && item.id === id));
      return [owner, { items, active: items.some(item => item.kind === state.active) ? state.active : items.at(-1)?.kind || null }];
    })));
  };
  const commitPreview = useCallback((owner: string, next: PreviewState) => {
    setPreviews(prev => ({ ...prev, [owner]: next }));
    navigate({ pathname: owner, search: owner === location.pathname ? location.search : '', hash: owner === location.pathname ? location.hash : '' }, { state: { ...(owner === location.pathname ? location.state : {}), resourceViews: next } });
  }, [navigate, location.pathname, location.search, location.hash, location.state]);
  const openPreview = useCallback((owner: string, path: string) => {
    const item = resourcePreview(workspaceId, path);
    if (!item) return false;
    const state = previews[owner] || { items: [], active: null };
    if (state.active === item.kind && state.items.some(p => p.path === item.path)) return true;
    commitPreview(owner, { items: state.items.some(p => p.kind === item.kind) ? state.items.map(p => p.kind === item.kind ? item : p) : [...state.items, item], active: item.kind });
    return true;
  }, [workspaceId, previews, commitPreview]);
  const activatePreview = (owner: string, kind: string) => { const state = previews[owner]; if (state) commitPreview(owner, { ...state, active: kind }); };
  const clearPreview = (owner: string) => commitPreview(owner, { items: [], active: null });
  const closePreview = (owner: string, kind: string) => {
    const state = previews[owner]; if (!state) return;
    const items = state.items.filter(p => p.kind !== kind);
    commitPreview(owner, { items, active: state.active === kind ? items.at(-1)?.kind || null : state.active });
  };
  useEffect(() => {
    const saved = location.state?.resourceViews as PreviewState | undefined;
    if (saved === undefined) return; // A primary reading navigation does not close existing comparison panes.
    const items = Array.isArray(saved?.items) ? saved.items.map(item => resourcePreview(workspaceId, item.path)).filter((item): item is ResourcePreview => Boolean(item) && !removedResources.current.has(`${item!.kind}:${item!.id}`)) : [];
    setPreviews(prev => ({ ...prev, [location.pathname]: { items, active: items.some(item => item.kind === saved?.active) ? saved!.active : null } }));
  }, [location.key, location.pathname, workspaceId]);
  const captureResourceLink = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as HTMLElement).closest('a');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin === window.location.origin && openPreview(location.pathname, url.pathname)) { event.preventDefault(); event.stopPropagation(); }
  };
  useEffect(() => {
    if (location.pathname === `/workspaces/${workspaceId}/projects/new`) { navigate(`/workspaces/${workspaceId}/projects`, { replace: true, state: { createProject: true } }); return; }
    const preview = resourcePreview(workspaceId, location.pathname);
    if (preview) {
      const owner = location.pathname.slice(0, location.pathname.lastIndexOf('/'));
      navigate(owner, { replace: true, state: { resourceViews: { items: [preview], active: preview.kind } } });
    }
  }, [workspaceId, location.pathname, navigate]);
  const [tabs, setTabs] = useState(() => parseTabs(workspaceId, read(tabsStorageKey(workspaceId))));
  const [ratio, updateRatio] = useState(() => readRatio(read(ratioStorageKey(workspaceId))));
  const [paneWidths, setPaneWidths] = useState<Record<string, number>>({});
  const reportPaneWidth = useCallback((path: string, width: number) => setPaneWidths((prev) => prev[path] === width ? prev : { ...prev, [path]: width }), []);
  const [visited, setVisited] = useState<Visited[]>([]);

  const register = useCallback((tab: WorkspacePageTab) => {
    if (!tabForPath(workspaceId, tab.path) || resourcePreview(workspaceId, tab.path)) return;
    setTabs((prev) => {
      const old = prev.find((t) => t.key === tab.key);
      if (old?.title === tab.title && old.kind === tab.kind) return prev;
      return old ? prev.map((t) => t.key === tab.key ? { ...t, title: tab.title, kind: tab.kind } : t) : [...prev, tab];
    });
  }, [workspaceId]);

  useLayoutEffect(() => {
    if (!current || resourcePreview(workspaceId, location.pathname)) return;
    setTabs((prev) => {
      const old = prev.find(t => t.key === current.key);
      if (old?.path === current.path && old.search === location.search) return prev;
      const next = {...current, title: old?.title || current.title, search: location.search};
      return old ? prev.map(t => t.key === current.key ? next : t) : [...prev, next];
    });
    setVisited((prev) => {
      const old = prev.find((entry) => entry.path === location.pathname);
      if (old?.location.location.key === location.key) return prev;
      const entry = { path: location.pathname, node: outlet, location: locationValue };
      return old ? prev.map((p) => p.path === entry.path ? entry : p) : [...prev, entry];
    });
  }, [location, locationValue, outlet, current?.key]);

  useLayoutEffect(() => { write(tabsStorageKey(workspaceId), JSON.stringify(tabs)); }, [tabs, workspaceId]);
  const close = useCallback((key: string) => {
    const index = tabs.findIndex((t) => t.key === key);
    const target = tabs[index];
    if (!target) return;
    forgetWorkspacePage(target.path);
    const next = tabs.filter((t) => t.key !== key);
    const fallback = tabForPath(workspaceId, `/workspaces/${workspaceId}/projects`)!;
    setTabs(next.length ? next : [fallback]);
    setVisited((prev) => prev.filter((p) => tabForPath(workspaceId, p.path)?.key !== key));
    if (tabForPath(workspaceId, location.pathname)?.key === key) { const target = next[Math.max(0, index - 1)] || fallback; navigate({ pathname: target.path, search: target.search || "" }); }
  }, [tabs, workspaceId, location.pathname, navigate, forgetWorkspacePage]);
  const reorder = useCallback((key: string, index: number) => setTabs((prev) => moveTab(prev, key, index)), []);
  const setRatio = useCallback((value: number) => {
    updateRatio(value);
    write(ratioStorageKey(workspaceId), String(value));
  }, [workspaceId]);
  // Render a first visit immediately; layout effect retains the same keyed container before paint.
  const entries = current && !resourcePreview(workspaceId, location.pathname) && !visited.some((p) => p.path === location.pathname)
    ? [...visited, { path: location.pathname, node: outlet, location: locationValue }] : visited;
  const displayTabs = current && !resourcePreview(workspaceId, location.pathname) && !tabs.some((t) => t.key === current.key) ? [...tabs, current] : tabs;
  return <ResourcePreviewContext.Provider value={{ render: renderResource, states: previews, open: openPreview, activate: activatePreview, close: closePreview, clear: clearPreview, remove: removePreviewResource }}><WorkspaceTabsContext.Provider value={{ tabs: displayTabs, register, close, reorder, ratio, setRatio, reportPaneWidth }}>
    <div className="workspace-pages" hidden={!current}>
      <div className="workspace-page-tabs" style={{ width: `calc(100% - ${paneWidths[location.pathname] || 0}px)` }}><PageTabStrip tabs={displayTabs.filter(tab => tab.kind !== 'dir')} onClose={close} onReorder={reorder} /></div>
      <div className="workspace-page-stack" onClickCapture={captureResourceLink}>
        {entries.map((entry) => <div key={entry.path} className="workspace-page" hidden={entry.path !== location.pathname || !current}>
          <UNSAFE_LocationContext.Provider value={entry.location}>{entry.node}</UNSAFE_LocationContext.Provider>
        </div>)}
      </div>
    </div>
    {!current ? outlet : null}
  </WorkspaceTabsContext.Provider></ResourcePreviewContext.Provider>;
}
