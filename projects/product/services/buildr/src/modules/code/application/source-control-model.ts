import type { CodeSource } from '../infrastructure/code-file-reader.ts';
import type { readCodeFile } from '../infrastructure/code-file-content.ts';
import type { CodeImagePreview } from '../infrastructure/source-control-image-reader.ts';
import type { CodeChangeArea, CodeChange, CodeBranch, CodeBranchEntry, CodeBranchSwitchEffects, CodeHistoryCommit } from '../domain/source-control.ts';
export type { CodeChangeArea, CodeChange, CodeBranch, CodeBranchEntry, CodeHistoryCommit } from '../domain/source-control.ts';

export type CodeSourceControlInput = { repositoryId?: string; checkoutId?: string; worktreeId?: string; taskId?: string; commitHash?: string; path?: string; area?: CodeChangeArea; branch?: string; authorEmail?: string; query?: string; limit?: number; cursor?: string; expectedRevision?: string; page?: number; line?: number; matchQuery?: string };
export type CodeReadDiagnostic = { code: string; message: string; repositoryId: string | null; worktreeId?: string | null };
export type CodeReadCoverage = { limit: number; truncated: boolean; nextCursor: string | null };
export type CodeReadMeta = { readAt: string; observedRevision: string; coverage: CodeReadCoverage; diagnostics: CodeReadDiagnostic[] };
export type CodeSourceControlWorktree = {
  worktreeId:string;name:string;location:string;isMain:boolean;isRegistered:boolean;available:boolean;source:CodeSource|null;
  status:'complete'|'partial'|'unavailable';branch:string|null;head:string|null;upstream:string|null;ahead:number|null;behind:number|null;
  taskId:string|null;taskTitle:string|null;taskDiagnostic:string|null;
  fileCount:number|null;changes:CodeChange[];observedRevision:string|null;readAt:string;coverage:{fileLimit:number;truncated:boolean};diagnostics:CodeReadDiagnostic[];
};
export type CodeSourceControlRepository = {
  id: string; code: string; name: string; location: string; available: boolean; gitId: string | null;
  source: CodeSource | null; status: 'complete' | 'partial' | 'unavailable';
  branch: string | null; head: string | null; upstream: string | null; ahead: number | null; behind: number | null;
  fileCount: number | null; changes: CodeChange[]; observedRevision: string | null; diagnostics: CodeReadDiagnostic[];
  worktrees:CodeSourceControlWorktree[];worktreeCount:number|null;worktreeCoverage:{limit:number;total:number|null;read:number;truncated:boolean};
};
export type CodeSourceControlResponse = CodeReadMeta & { repositories: CodeSourceControlRepository[]; selectedRepositoryIds: string[];selectedWorktreeIds:string[];selectedWorktrees:Array<{repositoryId:string;worktreeId:string}>;worktreeCoverage:{limit:number;total:number|null;read:number;truncated:boolean}; scopeReason: string };
export type CodeHistoryResponse = CodeReadMeta & { source: CodeSource; branches: CodeBranch[]; commits: CodeHistoryCommit[] };
export type CodeBranchesResponse = CodeReadMeta & { source: CodeSource; branches: CodeBranchEntry[] };
export type CodeAuthorsResponse = CodeReadMeta & { source: CodeSource; currentAuthor: { name: string; email: string } | null; authors: Array<{ name: string; email: string }> };
export type CodeBranchSwitchInput = { repositoryId: string; worktreeId: string; targetRef: string; expectedTargetHash: string; expectedRevision: string; localName?: string };
export type CodeBranchSwitchResponse = { source: CodeSource; branch: string | null; head: string | null; upstream: string | null; observedRevision: string; readAt: string; effects: CodeBranchSwitchEffects };
export type CodeCommitResponse = CodeReadMeta & { source: CodeSource; commit: CodeHistoryCommit; baseHash: string | null; files: CodeChange[] };
export type CodeDiffResponse = CodeReadMeta & { source: CodeSource; area: CodeChangeArea; file: CodeChange; patch: string | null; binary: boolean; baseHash: string | null; imagePreview?:CodeImagePreview };
export type CodeSourceFileResponse = Awaited<ReturnType<typeof readCodeFile>> & CodeReadMeta;
