import type { CodeReadDiagnostic, CodeReadMeta } from '@buildr-ai/buildr-harness/workbench';
import type { CodeChange } from '../domain/source-control.ts';
export type { CodeSourceControlInput, CodeReadDiagnostic, CodeReadCoverage, CodeReadMeta, CodeHistoryResponse, CodeAuthorsResponse, CodeCommitResponse, CodeDiffResponse, CodeSourceFileResponse } from '@buildr-ai/buildr-harness/workbench';
import type { CodeSource } from '../infrastructure/code-file-reader.ts';
export type { CodeChangeArea, CodeChange, CodeBranch, CodeBranchEntry, CodeHistoryCommit } from '../domain/source-control.ts';

export type CodeSourceControlWorktree = {
  worktreeId:string;name:string;location:string;isMain:boolean;isRegistered:boolean;available:boolean;source:CodeSource|null;
  status:'complete'|'partial'|'unavailable';branch:string|null;head:string|null;upstream:string|null;ahead:number|null;behind:number|null;
  taskId:string|null;taskTitle:string|null;taskDiagnostic:string|null;
  fileCount:number|null;changes:CodeChange[];observedRevision:string|null;readAt:string;coverage:{fileLimit:number;truncated:boolean};diagnostics:CodeReadDiagnostic[];
};
export type CodeRepositoryCloneStatus = { state: 'cloning' | 'failed' | null; diagnostic: string | null; startedAt: string | null };
export type CodeRepositoryCloneResult = { status: 'started' | 'already-running' | 'ready' | 'unavailable'; diagnostic: string | null };
export type CodeSourceControlRepository = {
  id: string; code: string; name: string; location: string; available: boolean; gitId: string | null;
  source: CodeSource | null; status: 'complete' | 'partial' | 'unavailable';
  clone: { state: 'cloning' | 'failed'; diagnostic: string | null; startedAt: string | null } | null;
  branch: string | null; head: string | null; upstream: string | null; ahead: number | null; behind: number | null;
  fileCount: number | null; changes: CodeChange[]; observedRevision: string | null; diagnostics: CodeReadDiagnostic[];
  worktrees:CodeSourceControlWorktree[];worktreeCount:number|null;worktreeCoverage:{limit:number;total:number|null;read:number;truncated:boolean};
};
export type CodeSourceControlResponse = CodeReadMeta & { repositories: CodeSourceControlRepository[]; selectedRepositoryIds: string[];selectedWorktreeIds:string[];selectedWorktrees:Array<{repositoryId:string;worktreeId:string}>;worktreeCoverage:{limit:number;total:number|null;read:number;truncated:boolean}; scopeReason: string };
export type { CodeBranchesResponse, CodeBranchSwitchInput, CodeBranchSwitchResponse } from '@buildr-ai/buildr-harness/workbench';
