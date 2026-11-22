import type { CodeBranchesResponse, CodeBranchSwitchResponse } from './read-contracts.ts';
import type { SourceControlRepository, SourceControlWorktree } from './source-control-model.ts';

export type SourceControlBranch = CodeBranchesResponse['branches'][number];
export type BranchSwitchImpact = {
  localName: string;
  same: boolean;
  occupied?: Pick<SourceControlWorktree, 'worktreeId' | 'name' | 'location' | 'isMain'>;
  blockedReason?: string;
  needsLocalName?: boolean;
  createTracking: boolean;
};
export type BranchSwitchFailure = { message: string; affectedFiles: string[] };

type SwitchableWorktree = { worktreeId: string; isRegistered?: boolean; readAt?: string };
type SwitchableRepository = { id: string; worktrees: SwitchableWorktree[] };
type SwitchableCatalog = { readAt: string; repositories: SwitchableRepository[] };

/** A confirmed write replaces branch facts immediately; file/status observations must be read again. */
export function sourceControlAfterBranchSwitch<T extends SwitchableCatalog>(catalog: T, result: CodeBranchSwitchResponse): T {
  const { repositoryId, worktreeId } = result.source;
  const observed = catalog.repositories.find(repository => repository.id === repositoryId)?.worktrees.find(worktree => worktree.worktreeId === worktreeId);
  if (!worktreeId || !observed || (observed.readAt ? Date.parse(observed.readAt) > Date.parse(result.readAt) : false)) return catalog;
  return {
    ...catalog,
    readAt: result.readAt,
    repositories: catalog.repositories.map(repository => {
      if (repository.id !== repositoryId) return repository;
      const worktrees = repository.worktrees.map(worktree => worktree.worktreeId !== worktreeId ? worktree : {
        ...worktree, source: result.source, branch: result.branch, head: result.head, upstream: result.upstream, readAt: result.readAt,
        ahead: null, behind: null, fileCount: null, changes: [], observedRevision: null, status: 'partial' as const,
      });
      const registered = worktrees.find(worktree => worktree.isRegistered);
      return {
        ...repository, worktrees, status: 'partial' as const, fileCount: null,
        ...(registered?.worktreeId === worktreeId ? { source: result.source, branch: result.branch, head: result.head, upstream: result.upstream, ahead: null, behind: null, changes: [], observedRevision: null } : {}),
      };
    }),
  } as T;
}

/** Resolve only observed tracking relationships; a same-named local ref is not a remote match. */
export function branchSwitchImpact(
  repository: Pick<SourceControlRepository, 'worktrees'>,
  worktree: Pick<SourceControlWorktree, 'worktreeId' | 'status' | 'location'>,
  entries: SourceControlBranch[],
  entry: SourceControlBranch,
): BranchSwitchImpact {
  const remoteName = entry.kind === 'remote' ? entry.name.slice((entry.remote || entry.name.split('/')[0]).length + 1) : entry.name;
  const tracked = entry.kind === 'remote' ? entry.localBranch : entry;
  const localName = tracked?.name || remoteName;
  const collision = entry.kind === 'remote' && !tracked && entries.some(item => item.kind === 'local' && item.name === localName);
  const occupied = tracked?.worktreeId && tracked.worktreeId !== worktree.worktreeId
    ? repository.worktrees.find(item => item.worktreeId === tracked.worktreeId)
      || { worktreeId: tracked.worktreeId, name: tracked.worktreeLocation?.split(/[\\/]/).at(-1) || '另一工作位置', location: tracked.worktreeLocation || '', isMain: false }
    : undefined;
  return {
    localName,
    same: Boolean(entry.kind === 'local' && entry.current || tracked?.worktreeId === worktree.worktreeId),
    occupied,
    blockedReason: worktree.status === 'offline' ? '这个工作位置暂不可读取。' : !worktree.location ? '工作位置尚未确认，请先刷新。' : '',
    needsLocalName: collision,
    createTracking: entry.kind === 'remote' && !tracked,
  };
}

/** Surface the server's real failure; the view never predicts which dirty paths Git will reject. */
export function branchSwitchFailure(error: unknown): BranchSwitchFailure {
  const details = error && typeof error === 'object' ? (error as { details?: unknown }).details : undefined;
  const paths = details && typeof details === 'object' && 'affectedFiles' in details ? (details as { affectedFiles?: unknown }).affectedFiles : undefined;
  const observed = details && typeof details === 'object' ? details as { effects?: { switched?: boolean; createdLocalBranch?: string | null }; current?: { branch?: string | null }; resultUnconfirmed?: boolean } : undefined;
  const effects = [
    observed?.effects?.createdLocalBranch ? `已建立本地分支 ${observed.effects.createdLocalBranch}。` : '',
    observed?.effects?.switched ? `当前位置已切换${observed.current?.branch ? '到 ' + observed.current.branch : ''}。` : '',
    observed?.resultUnconfirmed ? '当前效果尚未确认，请重新读取。' : '',
  ].filter(Boolean);
  return {
    message: [error instanceof Error ? error.message : '无法切换，请刷新后重试。', ...effects].join(' '),
    affectedFiles: Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string') : [],
  };
}
