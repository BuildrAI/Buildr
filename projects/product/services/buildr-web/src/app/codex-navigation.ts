import { previewOwnerPath, resourcePreview } from './workspace-pages';

type RouteLocation = { pathname: string; search: string; hash: string };
type CodexHistoryState = { idx?: number; usr?: unknown; key?: string; buildrCodex?: { fragment: string; route: RouteLocation } };
export type CodexTarget = { workspaceId: string; route: RouteLocation; error: string | null };

const safeSegment = (value: string) => Boolean(value) && value !== '.' && value !== '..' && !/[/?#\\\u0000-\u001f]/u.test(value);
const isRoute = (value: unknown): value is RouteLocation => Boolean(value) && typeof value === 'object' && ['pathname', 'search', 'hash'].every(key => typeof (value as Record<string, unknown>)[key] === 'string');
const queryKeys: Record<string, string[]> = {
  overview: ['project'], activity: ['project', 'date', 'group'], tasks: ['q', 'status', 'project', 'service', 'type', 'retrospective', 'group', 'taskType', 'file', 'page', 'state'],
  projects: ['q', 'project', 'document', 'date', 'group', 'view'], services: ['q', 'project', 'edit'], repositories: ['q'], skills: ['q'],
  articles: ['q', 'project', 'status', 'sort', 'scope', 'view'], knowledge: ['object', 'artifact', 'document', 'reading', 'fromProject', 'q', 'browse', 'type', 'view'],
  code: [], settings: [], 'workspace-overview': [],
};

export function codexWorkspace(pathname: string): string | null {
  const match = /^\/workspaces\/([^/]+)\/codex$/u.exec(pathname);
  try { return match && safeSegment(decodeURIComponent(match[1])) ? decodeURIComponent(match[1]) : null; } catch { return null; }
}

/** The fragment is a workspace-owned route, never a URL or an arbitrary file path. */
export function resolveCodexTarget(workspaceId: string, target: string): CodexTarget {
  const invalid = (message: string): CodexTarget => ({workspaceId, route: {pathname: `/workspaces/${workspaceId}/codex`, search: '', hash: ''}, error: message});
  if (!safeSegment(workspaceId) || !target.startsWith('/') || target.startsWith('//') || target.length > 8000 || /[\\\u0000-\u001f]/u.test(target)) return invalid('任务链接格式无效。');
  if (/%(?![\da-f]{2})/iu.test(target)) return invalid('任务链接编码无效。');
  try {
    const path = target.split(/[?#]/u)[0];
    const parts = path.slice(1).split('/').map(decodeURIComponent);
    if (parts.some(part => !safeSegment(part))) return invalid('任务链接包含无效路径。');
    const [area, first, second] = parts;
    if (!(area in queryKeys)) return invalid('此 Codex 入口不支持该页面。');
    if (area === 'tasks' && parts.length > 1 && !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(first)) return invalid('任务链接的任务身份无效。');
    const url = new URL(target, 'http://buildr.local');
    if ([...url.searchParams.keys()].some(key => !queryKeys[area].includes(key) || url.searchParams.getAll(key).length !== 1) || [...url.searchParams.values()].some(value => /[\u0000-\u001f]/u.test(value))) return invalid('任务链接包含不支持的参数。');
    if (url.searchParams.has('taskType') && url.searchParams.get('taskType') !== 'composite') return invalid('任务链接的任务类型无效。');
    const full = `/workspaces/${workspaceId}${path}${url.search}${url.hash}`;
    const resource = resourcePreview(workspaceId, full);
    const supported = resource || parts.length === 1
      || area === 'code' && parts.length === 2 && ['explorer', 'source-control'].includes(first)
      || area === 'knowledge' && parts.length === 3 && ['project', 'service'].includes(first)
      || area === 'projects' && (parts.length === 2 || parts.length === 3 && second === 'edit')
      || area === 'services' && (parts.length === 3 || parts.length === 4 && parts[3] === 'edit')
      || area === 'tasks' && (parts.length === 3 && second === 'prototypes' || parts.length === 5 && second === 'changes');
    if (!supported) return invalid('任务链接的页面或材料参数无效。');
    // Resource routes must satisfy their existing identity and material validation.
    if (area === 'tasks' && (parts.length === 2 || parts.length === 3 && second === 'document') && !resource) return invalid('任务链接的任务或材料参数无效。');
    return {workspaceId, route: {pathname: `/workspaces/${workspaceId}${path}`, search: url.search, hash: url.hash}, error: null};
  } catch { return invalid('任务链接编码无效。'); }
}

function routeString(route: RouteLocation): string { return route.pathname + route.search + route.hash; }

/** Preserve the actual resource target while WorkspacePages retains its owner/list route. */
export function codexRouteHref(workspaceId: string, route: RouteLocation, userState?: unknown): string | null {
  const prefix = `/workspaces/${workspaceId}`;
  if (!isRoute(route) || !route.pathname.startsWith(prefix + '/') || resolveCodexTarget(workspaceId, routeString(route).slice(prefix.length)).error) return null;
  let destination = routeString(route);
  if (userState && typeof userState === 'object' && 'resourceViews' in userState) {
    const views = userState.resourceViews as { active?: unknown; items?: { kind?: unknown; path?: unknown }[] } | null;
    const active = typeof views?.active === 'string' && Array.isArray(views.items) ? views.items.find(item => item && typeof item === 'object' && item.kind === views.active && typeof item.path === 'string') : null;
    if (active && typeof active.path === 'string') {
      const preview = resourcePreview(workspaceId, active.path);
      if (preview && previewOwnerPath(workspaceId, preview) === route.pathname) destination = active.path;
    }
  }
  if (!destination.startsWith(prefix + '/')) return null;
  const target = destination.slice(prefix.length);
  if (resolveCodexTarget(workspaceId, target).error) return null;
  return `${prefix}/codex#${target}`;
}

export function readCodexLocation(location: RouteLocation, state?: CodexHistoryState | null): CodexTarget | null {
  const workspaceId = codexWorkspace(location.pathname);
  if (!workspaceId) return null;
  const resolved = resolveCodexTarget(workspaceId, location.hash.slice(1) || '/overview');
  if (!resolved.error && state?.buildrCodex?.fragment === location.hash) {
    const route = state.buildrCodex.route;
    if (isRoute(route) && codexRouteHref(workspaceId, route, state.usr) === location.pathname + location.hash) return {...resolved, route};
  }
  return resolved;
}

/** Adapts only URL/history; all business pages and navigation blockers remain shared. */
export function createCodexNavigationWindow(browser: Window): Window {
  const nativeHistory = browser.history;
  let index = typeof nativeHistory.state?.idx === 'number' ? nativeHistory.state.idx : 0;
  const callbacks = new Map<EventListenerOrEventListenerObject, EventListener>();
  const route = () => readCodexLocation(browser.location, nativeHistory.state)?.route || browser.location;
  const physical = (url?: string | URL | null, data?: CodexHistoryState | null) => {
    if (url == null || !codexWorkspace(browser.location.pathname)) return {url, data};
    const parsed = new URL(String(url), browser.location.origin);
    if (parsed.origin !== browser.location.origin) throw new Error('Codex 页面不能跳转到外部地址。');
    const workspaceId = codexWorkspace(browser.location.pathname)!;
    const projected = codexRouteHref(workspaceId, parsed, data?.usr);
    // Explicit navigation to another workspace/global page leaves this entry normally.
    if (!projected && !parsed.pathname.startsWith(`/workspaces/${workspaceId}/`)) return {url, data};
    if (!projected) throw new Error('此 Codex 入口不支持该目标。');
    return {url: projected, data: {...data, buildrCodex: {fragment: projected.slice(projected.indexOf('#')), route: {pathname: parsed.pathname, search: parsed.search, hash: parsed.hash}}}};
  };
  const history = new Proxy(nativeHistory, {get(target, property) {
    if (property === 'pushState' || property === 'replaceState') return (data: CodexHistoryState | null, unused: string, url?: string | URL | null) => {
      const projected = physical(url, data);
      if (typeof projected.data?.idx === 'number') index = projected.data.idx;
      target[property](projected.data, unused, projected.url);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const location = new Proxy(browser.location, {get(target, property) {
    if (['pathname', 'search', 'hash'].includes(String(property))) return route()[property as keyof RouteLocation];
    if (property === 'href') return target.origin + routeString(route());
    if (property === 'assign' || property === 'replace') return (url: string | URL) => target[property](physical(url).url!);
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  return new Proxy(browser, {get(target, property) {
    if (property === 'history') return history;
    if (property === 'location') return location;
    if (property === 'addEventListener') return (type: string, callback: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type !== 'popstate') { target.addEventListener(type, callback, options); return; }
      const listener: EventListener = event => {
        const current = nativeHistory.state as CodexHistoryState | null;
        if (codexWorkspace(target.location.pathname) && (!current?.buildrCodex || current.buildrCodex.fragment !== target.location.hash)) {
          // Native fragment links do not carry router state. Give them a real history
          // index so existing useBlocker can roll back; never replay old resourceViews.
          const nextIndex = typeof current?.idx === 'number' ? current.idx : index + 1;
          nativeHistory.replaceState({idx: nextIndex, key: `codex-${nextIndex}-${Date.now()}`, usr: null}, '');
        }
        if (typeof nativeHistory.state?.idx === 'number') index = nativeHistory.state.idx;
        if (typeof callback === 'function') callback(event); else callback.handleEvent(event);
      };
      callbacks.set(callback, listener); target.addEventListener(type, listener, options);
    };
    if (property === 'removeEventListener') return (type: string, callback: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
      target.removeEventListener(type, type === 'popstate' ? callbacks.get(callback) || callback : callback, options); callbacks.delete(callback);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
}

/** Same-document adoption retains React state, drafts and the complete history payload. */
export function adoptCodexPage(browser: Window = window): boolean {
  if (codexWorkspace(browser.location.pathname)) return true;
  const match = /^\/workspaces\/([^/]+)\//u.exec(browser.location.pathname);
  if (!match) return false;
  let workspaceId: string;
  try {workspaceId = decodeURIComponent(match[1]);} catch {return false;}
  const href = codexRouteHref(workspaceId, browser.location, browser.history.state?.usr);
  if (!href) return false;
  browser.history.replaceState({...browser.history.state, buildrCodex: {fragment: href.slice(href.indexOf('#')), route: {pathname: browser.location.pathname, search: browser.location.search, hash: browser.location.hash}}}, '', href);
  return true;
}
