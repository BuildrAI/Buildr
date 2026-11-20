export type { CodeChangeArea, CodeChange, CodeBranch, CodeHistoryCommit } from '@buildr-ai/buildr-harness/workbench';

export type CodeLocalBranch = { ref: string; name: string; hash: string; upstream: string | null; worktreeId: string | null; worktreeLocation: string | null };
export type CodeBranchEntry = CodeLocalBranch & { kind: 'local' | 'remote'; remote: string | null; current: boolean; localBranch: CodeLocalBranch | null };
export type CodeBranchSwitchEffects = { switched: boolean; createdLocalBranch: string | null };
