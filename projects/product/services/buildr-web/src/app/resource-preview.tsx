import { createContext, useContext, type ReactNode } from 'react';
import type { ResourcePreview, PreviewState } from './workspace-pages';
export { resourcePreview } from './workspace-pages';
export type { ResourcePreview, PreviewState } from './workspace-pages';
export const ResourcePreviewContext = createContext<{
  render: (item: ResourcePreview) => ReactNode;
  states: Record<string, PreviewState>;
  open: (owner: string, path: string) => boolean;
  activate: (owner: string, kind: string) => void;
  remove: (kind: string, id: string) => void;
  clear: (owner: string) => void;
  close: (owner: string, kind: string) => void;
} | null>(null);
export const ProjectPreviewContext = createContext<string | null>(null);
export const InsideResourcePreview = createContext(false);
export function useResourcePreview() { return useContext(ResourcePreviewContext); }
