import { useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { UNSAFE_LocationContext, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { WorkspaceTabsContext } from './pageTabs';
import { PageTabStrip } from './PageTabStrip';
import { moveTab, parseTabs, ratioStorageKey, readRatio, tabForPath, tabsStorageKey, type WorkspacePageTab } from './workspace-pages';

type LocationValue = React.ContextType<typeof UNSAFE_LocationContext>;
type Visited = { path: string; node: ReactNode; location: LocationValue };
function read(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Private mode still permits browsing. */ } }

/** Retains only visited workspace pages; each outlet keeps its own route and location. */
export function WorkspacePages({ workspaceId }: { workspaceId: string }) {
  const outlet = useOutlet();
  const location = useLocation();
  const locationValue = useContext(UNSAFE_LocationContext);
  const navigate = useNavigate();
  const current = tabForPath(workspaceId, location.pathname);
  const [tabs, setTabs] = useState(() => parseTabs(workspaceId, read(tabsStorageKey(workspaceId))));
  const [ratio, updateRatio] = useState(() => readRatio(read(ratioStorageKey(workspaceId))));
  const [paneWidths, setPaneWidths] = useState<Record<string, number>>({});
  const reportPaneWidth = useCallback((path: string, width: number) => setPaneWidths((prev) => prev[path] === width ? prev : { ...prev, [path]: width }), []);
  const [visited, setVisited] = useState<Visited[]>([]);

  const register = useCallback((tab: WorkspacePageTab) => {
    if (!tabForPath(workspaceId, tab.path)) return;
    setTabs((prev) => {
      const old = prev.find((t) => t.key === tab.key);
      if (old?.title === tab.title && old.path === tab.path) return prev;
      return old ? prev.map((t) => t.key === tab.key ? tab : t) : [...prev, tab];
    });
  }, [workspaceId]);

  useLayoutEffect(() => {
    if (!current) return;
    setTabs((prev) => prev.some((t) => t.key === current.key) ? prev : [...prev, current]);
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
    const next = tabs.filter((t) => t.key !== key);
    const fallback = tabForPath(workspaceId, `/workspaces/${workspaceId}/projects`)!;
    setTabs(next.length ? next : [fallback]);
    setVisited((prev) => prev.filter((p) => p.path !== target.path));
    if (target.path === location.pathname) navigate(next[Math.max(0, index - 1)]?.path || fallback.path);
  }, [tabs, workspaceId, location.pathname, navigate]);
  const reorder = useCallback((key: string, index: number) => setTabs((prev) => moveTab(prev, key, index)), []);
  const setRatio = useCallback((value: number) => {
    updateRatio(value);
    write(ratioStorageKey(workspaceId), String(value));
  }, [workspaceId]);
  // Render a first visit immediately; layout effect retains the same keyed container before paint.
  const entries = current && !visited.some((p) => p.path === location.pathname)
    ? [...visited, { path: location.pathname, node: outlet, location: locationValue }] : visited;
  const displayTabs = current && !tabs.some((t) => t.key === current.key) ? [...tabs, current] : tabs;
  return <WorkspaceTabsContext.Provider value={{ tabs: displayTabs, register, close, reorder, ratio, setRatio, reportPaneWidth }}>
    <div className="workspace-pages" hidden={!current}>
      <div className="workspace-page-tabs" style={{ width: `calc(100% - ${paneWidths[location.pathname] || 0}px)` }}><PageTabStrip tabs={displayTabs} onClose={close} onReorder={reorder} /></div>
      <div className="workspace-page-stack">
        {entries.map((entry) => <div key={entry.path} className="workspace-page" hidden={entry.path !== location.pathname || !current}>
          <UNSAFE_LocationContext.Provider value={entry.location}>{entry.node}</UNSAFE_LocationContext.Provider>
        </div>)}
      </div>
    </div>
    {!current ? outlet : null}
  </WorkspaceTabsContext.Provider>;
}
