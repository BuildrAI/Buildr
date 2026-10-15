import type { SourceControlWorktree } from './source-control-model';

type RemoteState = 'unavailable' | 'untracked' | 'unknown' | 'clean' | 'changed';
type FileState = 'unavailable' | 'unknown' | 'clean' | 'changed';
export type WorktreeStatusCount = { kind: 'ahead' | 'behind' | 'files'; count: number };

/** The combined check confirms both observed quantities, never just the file-derived worktree status. */
export function sourceControlWorktreeStatus(worktree?: SourceControlWorktree) {
  const unavailable = !worktree || worktree.status === 'offline';
  const remoteState: RemoteState = unavailable ? 'unavailable' : worktree.upstream === null ? 'untracked'
    : !worktree.upstream || worktree.ahead === null || worktree.behind === null ? 'unknown'
    : worktree.ahead === 0 && worktree.behind === 0 ? 'clean' : 'changed';
  const fileState: FileState = unavailable ? 'unavailable' : worktree.fileCount === null ? 'unknown' : worktree.fileCount === 0 ? 'clean' : 'changed';
  const remoteLabel = remoteState === 'unavailable' ? '远程状态不可读取' : remoteState === 'untracked' ? '未跟踪远程分支'
    : remoteState === 'unknown' ? '远程提交数量未知' : `未推送 ${worktree!.ahead} 个提交，落后远程跟踪记录 ${worktree!.behind} 个提交`;
  const fileLabel = fileState === 'unavailable' ? '未提交文件数量不可读取' : fileState === 'unknown' ? '未提交文件数量未知'
    : fileState === 'clean' ? '没有未提交文件' : `${worktree!.fileCount} 个未提交文件`;
  const counts: WorktreeStatusCount[] = [];
  if (remoteState === 'changed') {
    if (worktree!.ahead! > 0) counts.push({kind: 'ahead', count: worktree!.ahead!});
    if (worktree!.behind! > 0) counts.push({kind: 'behind', count: worktree!.behind!});
  }
  if (fileState === 'changed') counts.push({kind: 'files', count: worktree!.fileCount!});
  return {remoteState, fileState, remoteLabel, fileLabel, counts, clean: remoteState === 'clean' && fileState === 'clean'};
}
