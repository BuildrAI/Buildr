/** A task reference names an existing task in the currently viewed workspace. */
export function resolveTaskBriefReference(href: string): string | null {
  return /^@task\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)$/.exec(String(href || '').trim())?.[1] || null;
}

export function taskBriefHref(taskId: string, pathname: string): string {
  const prefix = /^\/workspaces\/[^/]+(?=\/|$)/.exec(pathname)?.[0] || '';
  return `${prefix}/tasks/${encodeURIComponent(taskId)}`;
}
