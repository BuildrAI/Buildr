import type { CodeBranchSwitchResponse, CodeFetchResponse, CodeSyncResponse } from './api/code-api';

export type SourceControlChangeNotice = { workspaceId: string; repositoryId: string; worktreeId?: string; cause?: 'file-save'; result?: CodeBranchSwitchResponse; fetchResults?: CodeFetchResponse['repositories']; fetchReadAt?: string; repositoryIds?:string[]; fetchSequences?:Record<string, number>; syncResult?:CodeSyncResponse; syncError?:string; syncSequence?:number };
const changes = new EventTarget();
let syncSequence = 0;
const syncSequences = new Map<string, number>();
const syncKey = (workspaceId: string, repositoryId: string, worktreeId: string) => JSON.stringify([workspaceId, repositoryId, worktreeId]);
export function beginSourceControlSync(workspaceId: string, repositoryId: string, worktreeId: string) {
  const sequence = ++syncSequence; syncSequences.set(syncKey(workspaceId, repositoryId, worktreeId), sequence); return sequence;
}
export function isCurrentSourceControlSync(notice: SourceControlChangeNotice) {
  return notice.worktreeId && notice.syncSequence !== undefined && notice.syncSequence === syncSequences.get(syncKey(notice.workspaceId, notice.repositoryId, notice.worktreeId));
}
let fetchSequence = 0;
const fetchSequences = new Map<string, number>();
const fetchKey = (workspaceId: string, repositoryId: string) => JSON.stringify([workspaceId, repositoryId]);

/** Action ordering outlives a mounted row; it stores no results and never retries a write. */
export function beginSourceControlFetch(workspaceId: string, repositoryIds: string[]) {
  const sequence = ++fetchSequence;
  for (const id of repositoryIds) fetchSequences.set(fetchKey(workspaceId, id), sequence);
  return Object.fromEntries(repositoryIds.map(id => [id, sequence]));
}

export function currentSourceControlFetchResults(notice: SourceControlChangeNotice) {
  return (notice.fetchResults || []).filter(result => notice.fetchSequences?.[result.repositoryId] === fetchSequences.get(fetchKey(notice.workspaceId, result.repositoryId)) && notice.fetchSequences?.[result.repositoryId] !== undefined);
}

/** Notify live readers even when the page that started a write has been unmounted. */
export function notifySourceControlChange(notice: SourceControlChangeNotice) {
  changes.dispatchEvent(new CustomEvent('change', {detail: notice}));
}

export function subscribeSourceControlChanges(listener: (notice: SourceControlChangeNotice) => void) {
  const receive = (event: Event) => listener((event as CustomEvent<SourceControlChangeNotice>).detail);
  changes.addEventListener('change', receive);
  return () => changes.removeEventListener('change', receive);
}
