import { createContext, useContext, type ReactNode } from 'react';
export type ResourcePreview = { kind: 'service' | 'repository' | 'skill'; id: string; path: string; title: string };
export type PreviewState = { items: ResourcePreview[]; active: string | null };
export const ResourcePreviewContext = createContext<{
  render: (item: ResourcePreview) => ReactNode;
  states: Record<string, PreviewState>;
  open: (owner: string, path: string) => boolean;
  activate: (owner: string, kind: string) => void;
  clear: (owner: string) => void;
  close: (owner: string, kind: string) => void;
} | null>(null);
export const ProjectPreviewContext = createContext<string | null>(null);
export const InsideResourcePreview = createContext(false);
export function resourcePreview(workspaceId: string, path: string): ResourcePreview | null {
  const prefix = `/workspaces/${workspaceId}/`;
  if (!path.startsWith(prefix)) return null;
  const [area, rawId, extra] = path.slice(prefix.length).split('/');
  if (!rawId || extra !== undefined) return null;
  const types = { services: ['service', '服务详情'], repositories: ['repository', '代码库详情'], skills: ['skill', '技能详情'] } as const;
  if (!(area in types)) return null;
  try {
    const id = decodeURIComponent(rawId);
    if (!id || /[/?#\\]/.test(id) || id === '.' || id === '..') return null;
    const [kind, title] = types[area as keyof typeof types];
    return { kind, id, title, path };
  } catch { return null; }
}
export function useResourcePreview() { return useContext(ResourcePreviewContext); }
