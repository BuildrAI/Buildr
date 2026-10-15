import type { GitCommit } from '../../task/commits/domain/task-commit.ts';

export type CodeChangeArea = 'unstaged' | 'staged' | 'untracked' | 'commit';
export type CodeChange = {
  repositoryId: string; worktreeId: string | null; area: CodeChangeArea; path: string; previousPath: string | null;
  kind: 'tracked' | 'untracked'; status: 'modified' | 'untracked' | 'added' | 'deleted' | 'renamed' | 'conflicted';
  additions: number | null; deletions: number | null; preview: string | null; previewTruncated: boolean;
};
export type CodeBranch = { name: string; hash: string; current: boolean; upstream: string | null };
export type CodeLocalBranch = { ref: string; name: string; hash: string; upstream: string | null; worktreeId: string | null; worktreeLocation: string | null };
export type CodeBranchEntry = CodeLocalBranch & { kind: 'local' | 'remote'; remote: string | null; current: boolean; localBranch: CodeLocalBranch | null };
export type CodeBranchSwitchEffects = { switched: boolean; createdLocalBranch: string | null };
export type CodeHistoryCommit = GitCommit & {
  repositoryId: string; worktreeId: string | null; parents: string[]; branches: string[]; tags: string[];
  taskId: string | null; taskTitle: string | null; taskDiagnostic: string | null;
};
