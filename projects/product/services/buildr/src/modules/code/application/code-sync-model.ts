import type { CodeSource } from '../infrastructure/code-file-reader.ts';

export type CodeSyncLocation = { repositoryId: string; worktreeId: string };
export type CodeSyncInput = CodeSyncLocation & { expectedRevision: string };
export type CodeSyncStatus = 'succeeded' | 'failed' | 'unavailable' | 'unknown';
export type CodeSyncStage = { status: CodeSyncStatus | 'not-requested'; message: string };
export type CodeSyncContext = { source: CodeSource; revision: string; head: string | null; branch: string | null; target: string | null; available: boolean; reason: string | null; ahead: number | null; behind: number | null; hasChanges: boolean };
export type CodeSyncResult = { source: CodeSource; readAt: string; branch: string | null; head: string | null; upstream: string | null; status: CodeSyncStatus; message: string; fetch: CodeSyncStage; rebase: CodeSyncStage; push: CodeSyncStage };
export type PreparedCodeCommitSync = (committedHead: string) => Promise<CodeSyncResult>;
