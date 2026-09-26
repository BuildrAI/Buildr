export type PageTabKind = "dir" | "proj" | "svc";
export type WorkspacePageTab = {
  key: string;
  kind: PageTabKind;
  title: string;
  path: string;
  search?: string;
};

type PreviewBase = { id: string; path: string; title: string };
export type ResourcePreview =
  | (PreviewBase & { kind: 'task' })
  | (PreviewBase & { kind: 'composite-task' })
  | (PreviewBase & { kind: 'task-document'; taskId: string; projectCode: string; file: string })
  | (PreviewBase & { kind: 'service' | 'repository' | 'skill'; knowledge?: { artifactId?: string; objectId?: string }; edit?: boolean })
  | (PreviewBase & { kind: 'article'; projectCode: string; publicationId: string; view?: 'source'; edit?: boolean });
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
      return { kind: 'article', id: `${projectCode}:${publicationId}`, projectCode, publicationId, title: '文章详情', path,
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
    const names: Record<string, string> = {
      "workspace-overview": "工作空间总览",
      projects: "项目目录",
      services: "服务目录",
      repositories: "代码库目录",
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

/** Remember the project home, rather than replaying a retired daily-progress redirect. */
export function workspacePageSearch(workspaceId: string, path: string, search: string): string {
  if (!path.startsWith(`/workspaces/${workspaceId}/projects/`) || tabForPath(workspaceId, path)?.kind !== 'proj') return search;
  const params = new URLSearchParams(search);
  if (params.get('document') !== 'daily') return search;
  params.delete('document');
  params.delete('date');
  params.delete('group');
  return params.size ? `?${params}` : '';
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
      if (typeof item.title === "string" && item.title.trim())
        tab.title = item.title.replace(/ · 知识$/, "").slice(0, 200);
      if (
        typeof item.search === "string" &&
        item.search.startsWith("?") &&
        item.search.length <= 4000
      )
        tab.search = workspacePageSearch(id, item.path, item.search);
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
  const desired = ratio === null ? Math.max(0, (width - 9) / 2) : width * ratio;
  return { content, min, max, right: Math.min(max, Math.max(min, desired)) };
}
