import { navigationState } from './navigation.ts';

export type PageTabKind = "dir" | "proj" | "svc";
export type WorkspacePageTab = {
  key: string;
  kind: PageTabKind;
  title: string;
  path: string;
  search?: string;
  pinned?: boolean;
};

type PreviewBase = { id: string; path: string; title: string };
export type ResourcePreview =
  | (PreviewBase & { kind: 'task' })
  | (PreviewBase & { kind: 'composite-task' })
  | (PreviewBase & { kind: 'task-document'; taskId: string; projectCode: string; file: string })
  | (PreviewBase & { kind: 'service' | 'repository' | 'skill'; knowledge?: { artifactId?: string; objectId?: string }; edit?: boolean })
  | (PreviewBase & { kind: 'article'; projectCode: string; publicationId: string; sourceTaskId?: string; view?: 'source'; edit?: boolean });
export type PreviewState = { items: ResourcePreview[]; active: string | null };

/** Resolve only supported resource identities; query values never become file paths. */
export function resourcePreview(workspaceId: string, path: string): ResourcePreview | null {
  const prefix = `/workspaces/${workspaceId}/`;
  if (typeof path !== 'string' || !path.startsWith(prefix)) return null;
  const pathname = path.split(/[?#]/)[0];
  try {
    const parts = pathname.slice(prefix.length).split('/').map(decodeURIComponent);
    if (parts.some(part => !part || part === '.' || part === '..' || /[/?#\\\u0000-\u001f]/.test(part))) return null;
    const [area, first, second, action] = parts;
    const search = new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?') + 1).split('#')[0] : '');
    if (area === 'tasks' && parts.length === 2) return { kind: search.get('taskType') === 'composite' ? 'composite-task' : 'task', id: first, title: search.get('taskType') === 'composite' ? '组合任务' : '普通任务', path };
    if (area === 'tasks' && parts.length === 3 && second === 'document') {
      const projectCode = search.get('project') || '', file = search.get('file') || '';
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(projectCode) || !file.endsWith('.md') || file.split('/').some(segment => !segment || segment === '..' || segment === '.') || /[\\\x00]/.test(file) || file.startsWith('/')) return null;
      return { kind: 'task-document', id: `${first}:${projectCode}:${file}`, taskId: first, projectCode, file, title: '文档', path };
    }
    if (area === 'articles' && (parts.length === 2 || parts.length === 3 || parts.length === 4 && action === 'edit')) {
      const projectCode = parts.length === 2 ? 'product' : first;
      const publicationId = parts.length === 2 ? first : second;
      const sourceTaskId = search.get('task') || undefined;
      if (sourceTaskId && !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(sourceTaskId)) return null;
      return { kind: 'article', id: `${projectCode}:${publicationId}${sourceTaskId ? `:task:${sourceTaskId}` : ''}`, projectCode, publicationId, ...(sourceTaskId ? { sourceTaskId } : {}), title: '文章详情', path,
        ...(search.get('view') === 'source' ? { view: 'source' as const } : {}), ...(action === 'edit' ? { edit: true } : {}) };
    }
    if (area === 'knowledge' && first === 'service' && parts.length === 3) {
      return { kind: 'service', id: second, title: '服务详情', path, knowledge: {
        ...(search.get('artifact') ? { artifactId: search.get('artifact')! } : {}),
        ...(search.get('object') ? { objectId: search.get('object')! } : {}),
      } };
    }
    const types = { services: ['service', '服务详情'], repositories: ['repository', '代码库详情'], skills: ['skill', '技能详情'] } as const;
    if (parts.length !== 2 || !(area in types)) return null;
    const [kind, title] = types[area as keyof typeof types];
    return { kind, id: first, title, path, ...(kind === 'service' && search.get('edit') === '1' ? { edit: true } : {}) };
  } catch { return null; }
}

export function previewOwnerPath(workspaceId: string, item: ResourcePreview): string {
  const area = { service: 'services', repository: 'repositories', skill: 'skills', article: 'articles', task: 'tasks', 'composite-task': 'tasks', 'task-document': 'tasks' }[item.kind];
  return `/workspaces/${workspaceId}/${area}`;
}

/** A task deep link can restore its originating list filters without leaving that list. */
export function previewOwnerSearch(workspaceId: string, item: ResourcePreview, state: unknown): string {
  if (!state || typeof state !== 'object') return '';
  if (item.kind === 'article' && 'articleListSearch' in state) {
    return typeof state.articleListSearch === 'string' && state.articleListSearch.startsWith('?') ? state.articleListSearch : '';
  }
  if (!['task', 'composite-task', 'task-document'].includes(item.kind) || !('from' in state) || typeof state.from !== 'string' || !state.from.startsWith('/') || state.from.includes('\\')) return '';
  try {
    const source = new URL(state.from, 'http://buildr.local');
    return source.origin === 'http://buildr.local' && source.pathname === previewOwnerPath(workspaceId, item) ? source.search : '';
  } catch { return ''; }
}

export const tabsStorageKey = (id: string) => `buildr.web.page-tabs.${id}`;
export const pinnedTabsStorageKey = (id: string) => `buildr.web.pinned-page-tabs.${id}`;
export const ratioStorageKey = (id: string) => `buildr.web.pane-ratio.${id}`;

/** Only workspace-owned, supported page routes may be restored from untrusted storage. */
export function tabForPath(
  workspaceId: string,
  path: string,
): WorkspacePageTab | null {
  const prefix = `/workspaces/${workspaceId}/`;
  if (!path.startsWith(prefix)) return null;
  const parts = path.slice(prefix.length).split("/");
  try {
    const decoded = parts.map(decodeURIComponent);
    if (decoded.some((p) => !p || p === "." || p === ".." || /[/?#\\]/.test(p)))
      return null;
    const [area, project, service] = decoded;
    if (area === "connections" && parts.length === 1)
      return { key: "dir:connection-skills", kind: "dir", title: "连接", path: `${prefix}connection-skills` };
    if(area==='code'&&parts.length===2&&['explorer','source-control'].includes(project))return {key:`dir:code:${project}`,kind:'dir',title:project==='explorer'?'资源管理器':'源代码管理',path};
    const names: Record<string, string> = {
      overview: "概览",
      "workspace-overview": "工作空间总览",
      projects: "项目目录",
      services: "服务目录",
      repositories: "代码库目录",
      "connection-skills": "连接",
      skills: "技能",
      articles: "文章",
      tasks: "任务",
    };
    if (parts.length === 1 && names[area])
      return { key: `dir:${area}`, kind: "dir", title: names[area], path };
    if (
      area === "knowledge" &&
      project === "project" &&
      service &&
      parts.length === 3
    )
      return {
        key: `proj:${service}`,
        kind: "proj",
        title: service,
        path,
      };
    if (area === "projects" && project === "new") return null;
    if (area === "projects" && parts.length === 2)
      return { key: `proj:${project}`, kind: "proj", title: project, path };
  } catch {
    /* Malformed escapes are not routes. */
  }
  return null;
}

export type WorkspaceArea = 'workbench' | 'workspace' | 'code';

/** Each entry opens its own default page tab; the tab set itself stays shared. */
export function defaultTabForArea(workspaceId: string, area: WorkspaceArea): WorkspacePageTab {
  const path = area === 'workbench'
    ? `/workspaces/${workspaceId}/overview`
    : area === 'code'
      ? `/workspaces/${workspaceId}/code/source-control`
      : `/workspaces/${workspaceId}/workspace-overview`;
  return tabForPath(workspaceId, path)!;
}

export function defaultTabForPath(workspaceId: string, pathname: string): WorkspacePageTab {
  return defaultTabForArea(workspaceId, navigationState(pathname, '', workspaceId).area);
}

/** Query, code tools and the workbench overview use their panel; document-oriented pages retain a reading measure. */
export function workspacePageLayout(workspaceId: string, path: string): 'functional' | 'reading' {
  const key = tabForPath(workspaceId, path)?.key;
  return key === 'dir:connection-skills' || key === 'dir:overview' || key?.startsWith('dir:code:') ? 'functional' : 'reading';
}

export function parseTabs(id: string, raw: string | null): WorkspacePageTab[] {
  try {
    const input: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(input)) return [];
    const result: WorkspacePageTab[] = [];
    for (const item of input) {
      if (!item || typeof item.path !== "string") continue;
      const tab = tabForPath(id, item.path);
      if (!tab || tab.kind === "svc" || result.some((t) => t.key === tab.key))
        continue;
      if (tab.key !== "dir:connection-skills" && typeof item.title === "string" && item.title.trim())
        tab.title = item.title.replace(/ · 知识$/, "").slice(0, 200);
      if (
        typeof item.search === "string" &&
        item.search.startsWith("?") &&
        item.search.length <= 4000
      )
        tab.search = item.search;
      result.push(tab);
    }
    return result;
  } catch {
    return [];
  }
}

export function moveTab<T extends { key: string }>(
  tabs: T[],
  key: string,
  index: number,
): T[] {
  const old = tabs.findIndex((t) => t.key === key);
  if (old < 0) return tabs;
  const next = [...tabs];
  const [tab] = next.splice(old, 1);
  next.splice(Math.max(0, Math.min(next.length, index)), 0, tab);
  return next;
}

/** Fixed preferences include closed pages; only open members appear in the strip. */
export function orderPageTabs(tabs: WorkspacePageTab[], pinnedTabs: WorkspacePageTab[]): WorkspacePageTab[] {
  const ranks = new Map(pinnedTabs.map((tab, index) => [tab.key, index]));
  const pinned = tabs.filter(tab => ranks.has(tab.key)).sort((a, b) => ranks.get(a.key)! - ranks.get(b.key)!);
  const ordinary = tabs.filter(tab => !ranks.has(tab.key));
  const ordered = [...pinned, ...ordinary].map(tab => {
    const fixed = ranks.has(tab.key);
    return Boolean(tab.pinned) === fixed ? tab : { ...tab, pinned: fixed };
  });
  return ordered.every((tab, index) => tab === tabs[index]) ? tabs : ordered;
}

export function togglePageTabPin(tabs: WorkspacePageTab[], pinnedTabs: WorkspacePageTab[], key: string) {
  const target = tabs.find(tab => tab.key === key);
  if (!target) return { tabs, pinnedTabs };
  const unpin = pinnedTabs.some(tab => tab.key === key);
  const nextPins = unpin ? pinnedTabs.filter(tab => tab.key !== key) : [...pinnedTabs, target];
  // On unpin, put the page first among ordinary pages without changing the active route.
  const nextTabs = unpin ? [target, ...tabs.filter(tab => tab.key !== key)] : tabs;
  return { tabs: orderPageTabs(nextTabs, nextPins), pinnedTabs: nextPins };
}

/** Reordering visible pins replaces only their slots; a closed pin keeps its saved position. */
export function reorderPinnedTabs(pinnedTabs: WorkspacePageTab[], tabs: WorkspacePageTab[]): WorkspacePageTab[] {
  const pinnedKeys = new Set(pinnedTabs.map(tab => tab.key));
  const openPins = tabs.filter(tab => pinnedKeys.has(tab.key));
  const openKeys = new Set(openPins.map(tab => tab.key));
  let index = 0;
  return pinnedTabs.map(tab => openKeys.has(tab.key) ? openPins[index++] : tab);
}

/** Page tabs share one strip, with independent fixed/ordinary reorder boundaries. */
export function reorderPageTabs(tabs: WorkspacePageTab[], key: string, index: number): WorkspacePageTab[] {
  const old = tabs.findIndex(tab => tab.key === key);
  if (old < 0 || !Number.isFinite(index)) return tabs;
  const count = tabs.filter(tab => tab.pinned).length;
  const min = tabs[old].pinned ? 0 : count;
  const max = tabs[old].pinned ? count - 1 : tabs.length - 1;
  const destination = Math.max(min, Math.min(max, Math.trunc(index)));
  return old === destination ? tabs : moveTab(tabs, key, destination);
}

export function readRatio(raw: string | null): number | null {
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : null;
}

export function paneDimensions(width: number, ratio: number | null) {
  const content = Math.max(
    0,
    Math.min(1440, Math.max(900, width * 0.675), width - 48),
  );
  const min = Math.min(280, Math.max(0, (width - 9) / 2));
  const max = Math.max(min, (width - 9) / 2, width - 369);
  const desired = width * (ratio ?? 0.65);
  return { content, min, max, right: Math.min(max, Math.max(min, desired)) };
}
