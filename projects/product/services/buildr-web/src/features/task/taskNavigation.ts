type TaskListPosition = { top: number; count: number };
const storageKey = (from: string) => `buildr.task-list-position:${from}`;
export function taskListScrollHost(): Window | HTMLElement {
  return document.querySelector('#task-table-wrap')?.closest<HTMLElement>('.pane-body, .workspace-page') || window;
}
export function captureTaskListPosition(from: string, count: number): TaskListPosition {
  const host = taskListScrollHost();
  const position = { top: host instanceof Window ? window.scrollY : host.scrollTop, count };
  try { sessionStorage.setItem(storageKey(from), JSON.stringify(position)); } catch { /* Browsing remains available without storage. */ }
  return position;
}
export function loadTaskListPosition(from: string): TaskListPosition | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(from)) || 'null');
    return value && Number.isFinite(value.top) && Number.isFinite(value.count) ? value : null;
  } catch { return null; }
}
export function taskReturnPath(state: unknown, workspacePrefix: string): string {
  workspacePrefix = workspacePrefix.replace(/\/$/, '');
  const from = state && typeof state === 'object' && 'from' in state ? state.from : null;
  if (typeof from === 'string' && from.startsWith('/') && !from.includes('\\')) {
    try {
      const url = new URL(from, 'http://buildr.local');
      if (url.origin === 'http://buildr.local' && url.pathname.startsWith(`${workspacePrefix}/`)) return `${url.pathname}${url.search}${url.hash}`;
    } catch { /* A malformed origin returns to the current task list. */ }
  }
  return `${workspacePrefix}/tasks`;
}
