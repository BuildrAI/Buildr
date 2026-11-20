import type { RepositoryFilePage } from '../explorer/repository-file-page.ts';

// Scope-neutral view inputs. The host still owns transport, source resolution and writes.
export type CodeSourceTarget = { repositoryId:string; checkoutId:string };
export type ChangedFileEntry = {
  repositoryId:string; checkoutId?:string; path:string; previousPath:string|null;
  kind:'tracked'|'untracked'; status:'modified'|'untracked'|'added'|'deleted'|'renamed'|'conflicted';
  additions:number|null; deletions:number|null; preview:string|null; previewTruncated:boolean;
};
export type GitCommitView = {
  repositoryId:string; hash:string; shortHash:string; subject:string; message:string;
  authorName:string; authorEmail:string; authoredAt:string; committedAt:string;
};
type Area = 'staged'|'unstaged'|'untracked'|'working'|'commit';
export type CodeSourceControlInput = {
  repositoryId?:string; worktreeId?:string; taskId?:string; commitHash?:string; path?:string; area?:Area;
  branch?:string; authorEmail?:string; query?:string; limit?:number; cursor?:string;
  expectedRevision?:string; page?:number; line?:number; matchQuery?:string;
};
export type WorkbenchChange = ChangedFileEntry & { worktreeId:string|null; area:Area };
type HistoryCommit = GitCommitView & {worktreeId:string|null; parents:string[]; branches:string[]; tags:string[]; taskId:string|null; taskTitle:string|null; taskDiagnostic:string|null};
type WorkbenchLocation = {
  repositoryId:string; checkoutId:string|null; worktreeGroupId:string|null; worktreeId?:string|null;
  taskId:string|null; commitHash:string|null; location:string; version:string; kind:'default'|'worktree'|'task'|'commit';
};
type ReadMeta = { readAt:string; observedRevision:string; coverage:{limit:number;truncated:boolean;nextCursor:string|null}; diagnostics:Array<{code:string;message:string;repositoryId:string|null;worktreeId?:string|null}> };
export type WorkbenchFile = {
  source:WorkbenchLocation; path:string; kind:'text'|'markdown'|'image'|'unsupported'; content:string; mediaType:string;
  sizeBytes:number; limitBytes:number; truncated:boolean; digest:string; revision:string; page:RepositoryFilePage|null; observedAt:string; message:string;
};
export type CodeHistoryResponse = ReadMeta & { source:WorkbenchLocation; branches:Array<{name:string;hash:string;current:boolean;upstream:string|null}>; commits:HistoryCommit[] };
export type CodeCommitResponse = ReadMeta & { source:WorkbenchLocation; commit:HistoryCommit; baseHash:string|null; files:WorkbenchChange[] };
export type CodeDiffResponse = ReadMeta & { source:WorkbenchLocation; area:Area; file:WorkbenchChange; patch:string|null; binary:boolean; baseHash:string|null; imagePreview?:{before:WorkbenchFile|null;after:WorkbenchFile|null} };
export type CodeSourceFileResponse = ReadMeta & WorkbenchFile;
