import type { CodeBranchSwitchResponse } from './api/code-api';

export type SourceControlChangeNotice = { workspaceId: string; repositoryId: string; worktreeId: string; result?: CodeBranchSwitchResponse };
const changes = new EventTarget();

/** Notify live readers even when the page that started a write has been unmounted. */
export function notifySourceControlChange(notice: SourceControlChangeNotice) {
  changes.dispatchEvent(new CustomEvent('change', {detail: notice}));
}

export function subscribeSourceControlChanges(listener: (notice: SourceControlChangeNotice) => void) {
  const receive = (event: Event) => listener((event as CustomEvent<SourceControlChangeNotice>).detail);
  changes.addEventListener('change', receive);
  return () => changes.removeEventListener('change', receive);
}
