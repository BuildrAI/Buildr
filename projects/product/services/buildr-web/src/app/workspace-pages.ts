export type PageTabKind = 'dir' | 'proj' | 'svc';
export type WorkspacePageTab = { key: string; kind: PageTabKind; title: string; path: string };

export const tabsStorageKey = (id: string) => `buildr.web.page-tabs.${id}`;
export const ratioStorageKey = (id: string) => `buildr.web.pane-ratio.${id}`;

/** Only workspace-owned, supported page routes may be restored from untrusted storage. */
export function tabForPath(workspaceId: string, path: string): WorkspacePageTab | null {
  const prefix = `/workspaces/${workspaceId}/`;
  if (!path.startsWith(prefix)) return null;
  const parts = path.slice(prefix.length).split('/');
  try {
    const decoded = parts.map(decodeURIComponent);
    if (decoded.some((p) => !p || p === '.' || p === '..' || /[/?#\\]/.test(p))) return null;
    const [area, project, service] = decoded;
    const names: Record<string, string> = { projects: '项目目录', services: '服务目录', repositories: '代码库目录', skills: '技能', settings: '设置' };
    if (parts.length === 1 && names[area]) return { key: `dir:${area}`, kind: 'dir', title: names[area], path };
    if (area === 'projects' && project === 'new') return null;
    if (area === 'projects' && parts.length === 2) return { key: `proj:${project}`, kind: 'proj', title: project, path };
    if (['services', 'repositories', 'skills'].includes(area) && parts.length === 2) return { key: `${area === 'services' ? 'service' : area === 'repositories' ? 'repository' : 'skill'}:${project}`, kind: 'svc', title: project, path };
    if (area === 'services' && parts.length === 3) return { key: `svc:${project}/${service}`, kind: 'svc', title: service, path };
  } catch { /* Malformed escapes are not routes. */ }
  return null;
}

export function parseTabs(id: string, raw: string | null): WorkspacePageTab[] {
  try {
    const input: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(input)) return [];
    const result: WorkspacePageTab[] = [];
    for (const item of input) {
      if (!item || typeof item.path !== 'string') continue;
      const tab = tabForPath(id, item.path);
      if (!tab || tab.kind === 'svc' || result.some((t) => t.key === tab.key)) continue;
      if (typeof item.title === 'string' && item.title.trim()) tab.title = item.title.slice(0, 200);
      result.push(tab);
    }
    return result;
  } catch { return []; }
}

export function moveTab<T extends { key: string }>(tabs: T[], key: string, index: number): T[] {
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
  const content = Math.max(0, Math.min(1440, Math.max(900, width * .675), width - 48));
  const min = Math.min(280, Math.max(0, (width - 9) / 2));
  const max = Math.max(min, (width - 9) / 2, width - 369);
  const desired = ratio === null ? Math.max(0, (width - 9) / 2) : width * ratio;
  return { content, min, max, right: Math.min(max, Math.max(min, desired)) };
}
