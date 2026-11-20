import type { CodeSource } from './code-file-reader.ts';
import type { readCodeFile } from './code-file-content.ts';
import type { CodeImagePreview } from './source-control-image-reader.ts';
import type { CodeChangeArea, CodeChange, CodeBranch, CodeHistoryCommit } from './source-control-types.ts';

export type CodeSourceControlInput = { repositoryId?: string; checkoutId?: string; worktreeId?: string; taskId?: string; commitHash?: string; path?: string; area?: CodeChangeArea; branch?: string; authorEmail?: string; query?: string; limit?: number; cursor?: string; expectedRevision?: string; page?: number; line?: number; matchQuery?: string };
export type CodeReadDiagnostic = { code: string; message: string; repositoryId: string | null; worktreeId?: string | null };
export type CodeReadCoverage = { limit: number; truncated: boolean; nextCursor: string | null };
export type CodeReadMeta = { readAt: string; observedRevision: string; coverage: CodeReadCoverage; diagnostics: CodeReadDiagnostic[] };
export type CodeHistoryResponse = CodeReadMeta & { source: CodeSource; branches: CodeBranch[]; commits: CodeHistoryCommit[] };
export type CodeAuthorsResponse = CodeReadMeta & { source: CodeSource; currentAuthor: { name: string; email: string } | null; authors: Array<{ name: string; email: string }> };
export type CodeCommitResponse = CodeReadMeta & { source: CodeSource; commit: CodeHistoryCommit; baseHash: string | null; files: CodeChange[] };
export type CodeDiffResponse = CodeReadMeta & { source: CodeSource; area: CodeChangeArea; file: CodeChange; patch: string | null; binary: boolean; baseHash: string | null; imagePreview?:CodeImagePreview };
export type CodeSourceFileResponse = Awaited<ReturnType<typeof readCodeFile>> & CodeReadMeta;
