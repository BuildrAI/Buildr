import type { CodeBranchesResponse } from './api/code-api';
import type { ApiError } from '../../api';
import type { SourceControlRepository, SourceControlWorktree } from './source-control-model';

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

/** Resolve only observed tracking relationships; a same-named local ref is not a remote match. */
export function branchSwitchImpact(repository: SourceControlRepository, worktree: SourceControlWorktree, entries: SourceControlBranch[], entry: SourceControlBranch): BranchSwitchImpact {
  const remoteName = entry.kind === 'remote' ? entry.name.slice((entry.remote || entry.name.split('/')[0]).length + 1) : entry.name;
  const tracked = entry.kind === 'remote' ? entry.localBranch : entry;
  const localName = tracked?.name || remoteName;
  const collision = entry.kind === 'remote' && !tracked && entries.some(item => item.kind === 'local' && item.name === localName);
  const occupied = tracked?.worktreeId && tracked.worktreeId !== worktree.worktreeId ? repository.worktrees.find(item => item.worktreeId === tracked.worktreeId) || {worktreeId: tracked.worktreeId, name: tracked.worktreeLocation?.split(/[\\/]/).at(-1) || '另一工作位置', location: tracked.worktreeLocation || '', isMain: false} : undefined;
  return { localName, same: Boolean(entry.kind === 'local' && entry.current || tracked?.worktreeId === worktree.worktreeId), occupied,
    blockedReason: worktree.status === 'offline' ? '这个工作位置暂不可读取。' : !worktree.location ? '工作位置尚未确认，请先刷新。' : '',
    needsLocalName: collision, createTracking: entry.kind === 'remote' && !tracked };
}

/** Surface the server's real failure; the view never predicts which dirty paths Git will reject. */
export function branchSwitchFailure(error: unknown): BranchSwitchFailure {
  const details = error && typeof error === 'object' ? (error as ApiError).details : undefined;
  const paths = details && typeof details === 'object' && 'affectedFiles' in details ? (details as {affectedFiles?: unknown}).affectedFiles : undefined;
  const observed = details && typeof details === 'object' ? details as {effects?: {switched?: boolean; createdLocalBranch?: string | null}; current?: {branch?: string | null}; resultUnconfirmed?: boolean} : undefined;
  const effects = [observed?.effects?.createdLocalBranch ? `已建立本地分支 ${observed.effects.createdLocalBranch}。` : '', observed?.effects?.switched ? `当前位置已切换${observed.current?.branch ? '到 ' + observed.current.branch : ''}。` : '', observed?.resultUnconfirmed ? '当前效果尚未确认，请重新读取。' : ''].filter(Boolean);
  return { message: [error instanceof Error ? error.message : '无法切换，请刷新后重试。', ...effects].join(' '), affectedFiles: Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string') : [] };
}
