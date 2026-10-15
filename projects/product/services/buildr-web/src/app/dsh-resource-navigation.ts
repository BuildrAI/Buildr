import { readDshPageId, readDshTaskPage } from './dsh-page-observation.ts';
import { resourcePreview, type ResourcePreview } from './workspace-pages.ts';

const origin = 'http://buildr.local';

/** Only the explicit desktop-owned document keeps its accurate Task URL. */
export function dshTaskResource(workspaceId: string, pathname: string, search: string): ResourcePreview | null {
  const href = origin + pathname + search;
  if (!pathname.startsWith(`/workspaces/${workspaceId}/tasks/`) || !readDshPageId(href) || !readDshTaskPage(href, origin)) return null;
  return resourcePreview(workspaceId, pathname + search);
}

/** Task-to-Task navigation changes the real URL; other resources use ordinary routes. */
export function dshResourceDestination(workspaceId: string, path: string, currentSearch: string): string {
  const pageId = readDshPageId(origin + '/' + currentSearch);
  const url = new URL(path, origin);
  url.searchParams.delete('buildrDshPage');
  if (pageId && url.pathname.startsWith(`/workspaces/${workspaceId}/tasks/`) && readDshTaskPage(url.href, origin)) url.searchParams.set('buildrDshPage', pageId);
  return url.pathname + url.search + url.hash;
}
