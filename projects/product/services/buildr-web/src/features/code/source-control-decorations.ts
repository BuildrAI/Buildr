import type { CodeSourceControlResponse } from './api/code-api';

export type SourceControlFileStatus = 'M' | 'A' | 'D' | 'R' | 'U' | 'C';
const status: Record<string, SourceControlFileStatus> = {modified:'M', added:'A', deleted:'D', renamed:'R', untracked:'U', conflicted:'C'};
const priority: Record<SourceControlFileStatus, number> = {U:1, M:2, A:3, R:4, D:5, C:6};

/** Decorations use the exact checkout identity; a historical file never inherits current Git status. */
export function sourceControlDecorations(data: CodeSourceControlResponse | null, repositoryId: string, worktreeId?: string | null, historical = false) {
  const files = new Map<string, SourceControlFileStatus>(), directories = new Set<string>();
  const worktree = !historical && data?.repositories.find(repository => repository.id === repositoryId)?.worktrees.find(item => item.worktreeId === worktreeId);
  for (const file of worktree ? worktree.changes : []) {
    const value = status[file.status] || 'M', previous = files.get(file.path);
    if (!previous || priority[value] > priority[previous]) files.set(file.path, value);
    for (const path of [file.path, ...(file.previousPath ? [file.previousPath] : [])]) {
      const parts = path.split('/');
      for (let index = 1; index < parts.length; index++) directories.add(parts.slice(0, index).join('/'));
    }
  }
  return {files, directories, hasChanges:Boolean(worktree && (worktree.fileCount || 0) > 0)};
}
