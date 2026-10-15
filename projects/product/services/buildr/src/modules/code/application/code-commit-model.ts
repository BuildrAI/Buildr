import type { CodeSource } from '../infrastructure/code-file-reader.ts';
import type { CodePushSnapshot } from '../infrastructure/code-commit-snapshot.ts';

export type CodeCommitLocation = { repositoryId: string; worktreeId: string };
export type CodePushContext = Pick<CodePushSnapshot, 'revision' | 'target' | 'available' | 'reason' | 'ahead'>;
export type CodeCommitContext = { source: CodeSource; revision: string; head: string | null; branch: string | null; hasChanges: boolean; fileCount: number; push: CodePushContext };
export type CodeCommitChangesInput = CodeCommitLocation & { expectedRevision: string; message: string; mode: 'commit' | 'commit-push' };
export type CodePushInput = CodeCommitLocation & { expectedHead: string; expectedPushRevision: string };
export type CodeGitMutationResult = {
  source: CodeSource;
  commit: { completed: boolean; hash: string | null; message: string; status: 'not-started' | 'succeeded' | 'failed' | 'unknown' };
  push: { status: 'not-requested' | 'succeeded' | 'failed' | 'unavailable' | 'unknown'; target: string | null; message: string; retry: { expectedHead: string; expectedPushRevision: string } | null };
  effects: { indexUpdated: boolean; warnings: string[] };
};
