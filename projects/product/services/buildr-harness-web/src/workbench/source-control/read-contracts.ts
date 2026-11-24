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
  editorSnapshot?:EditableFileSnapshot;
};
export type CodeHistoryResponse = ReadMeta & { source:WorkbenchLocation; branches:Array<{name:string;hash:string;current:boolean;upstream:string|null}>; commits:HistoryCommit[] };
export type CodeCommitResponse = ReadMeta & { source:WorkbenchLocation; commit:HistoryCommit; baseHash:string|null; files:WorkbenchChange[] };
export type CodeDiffResponse = ReadMeta & { source:WorkbenchLocation; area:Area; file:WorkbenchChange; patch:string|null; binary:boolean; baseHash:string|null; imagePreview?:{before:WorkbenchFile|null;after:WorkbenchFile|null} };
export type CodeSourceFileResponse = ReadMeta & WorkbenchFile;

export type EditableCodeSelector = { kind:'code'; repositoryId:string; checkoutId:string; path:string };
export type EditableProjectSelector = { kind:'project'; projectCode:string; path:string };
export type EditableFileSelector = EditableCodeSelector | EditableProjectSelector;
export type EditableFileSnapshot = {
  selector:EditableFileSelector; fileId:string; absolutePath:string; rootPath:string; path:string;
  sourceRevision:string; locationLabel:string; versionLabel:string; version:string;
  kind:'text'|'markdown'|'unsupported'; content:string; revision:string; sizeBytes:number;
  editable:boolean; readonlyReason:string|null; readonlyReasonCode:string|null;
  protectedRanges:Array<{from:number;to:number}>; observedAt:string;
  imageContext?:{documentDigest:string;sourceIdentity:string};
};
export type SaveFileInput = { selector:EditableFileSelector; expectedFileId:string; expectedSourceRevision:string; expectedRevision:string; content:string };

export type CodeLocalBranch = { ref:string; name:string; hash:string; upstream:string|null; worktreeId:string|null; worktreeLocation:string|null };
export type CodeBranchEntry = CodeLocalBranch & { kind:'local'|'remote'; remote:string|null; current:boolean; localBranch:CodeLocalBranch|null };
export type CodeBranchesResponse = ReadMeta & { source:WorkbenchLocation; branches:CodeBranchEntry[] };
export type CodeAuthorsResponse = ReadMeta & { source:WorkbenchLocation; currentAuthor:{name:string;email:string}|null; authors:Array<{name:string;email:string}> };
export type CodeBranchSwitchResponse = { source:WorkbenchLocation; branch:string|null; head:string|null; upstream:string|null; observedRevision:string; readAt:string; effects:{switched:boolean;createdLocalBranch:string|null} };

export type CodeFetchTarget = { repositoryId:string; expectedGitId:string|null; expectedCheckoutId:string|null };
export type CodeFetchStatus = 'succeeded'|'failed'|'unavailable'|'unknown';
export type CodeFetchRepositoryResult = { repositoryId:string; gitId:string|null; status:CodeFetchStatus; message:string; remotes:Array<{name:string;status:CodeFetchStatus;message:string}> };
export type CodeFetchResponse = { readAt:string; repositories:CodeFetchRepositoryResult[] };

export type CodeSyncContextResponse = { source:WorkbenchLocation; revision:string; head:string|null; branch:string|null; target:string|null; available:boolean; reason:string|null; ahead:number|null; behind:number|null; hasChanges:boolean };
export type CodeSyncStageStatus = 'not-requested'|'succeeded'|'failed'|'unavailable'|'unknown';
export type CodeSyncStageResult = { status:CodeSyncStageStatus; message:string };
export type CodeSyncResponse = { source:WorkbenchLocation; readAt:string; branch:string|null; head:string|null; upstream:string|null; status:CodeFetchStatus; message:string; fetch:CodeSyncStageResult; rebase:CodeSyncStageResult; push:CodeSyncStageResult };

export type CodeDiscardContext = { source:WorkbenchLocation; revision:string; paths:string[]; removePaths:string[] };
export type CodeDiscardChanges = { source:WorkbenchLocation; status:'succeeded'|'partial'; paths:string[]; message:string };

export type GenerationRun = { id:string; modelAccountId:string; modelId:string; label:string; accountRevision:string; status:'running'|'succeeded'|'failed'|'cancelled'; output:unknown; error:{code:string;message:string}|null };
export type ModelSelection = { id:string; label:string; modelAccountId:string; modelId:string; accountIdentity:string; accountRevision:string; serviceTier?:string; reasoningEffort?:string };
export type CommitContext = { source:WorkbenchLocation; revision:string; head:string|null; branch:string|null; hasChanges:boolean; fileCount:number; push:{revision:string;target:string|null;available:boolean;reason:string|null;ahead:number} };
export type PushRetry = { expectedHead:string; expectedPushRevision:string };
export type GitMutationResult = {
  source:WorkbenchLocation;
  commit:{ completed:boolean; hash:string|null; message:string; status:'not-started'|'succeeded'|'failed'|'unknown' };
  push:{ status:CodeSyncStageStatus; target:string|null; message:string; retry:PushRetry|null };
  sync:CodeSyncResponse|null;
  effects:{ indexUpdated:boolean; warnings:string[] };
};
export type CodeActionSource = { workspaceId:string; repositoryId:string; worktreeId:string; branch:string|null };
export type CommitMode = 'commit'|'commit-sync'|'commit-push';
export type CodeActionsClient = {
  context(source:CodeActionSource, signal?:AbortSignal):Promise<CommitContext>;
  generate(source:CodeActionSource, expectedRevision:string, model:ModelSelection):Promise<GenerationRun>;
  commit(source:CodeActionSource, expectedRevision:string, message:string, mode:CommitMode):Promise<GitMutationResult>;
  push(source:CodeActionSource, retry:PushRetry):Promise<GitMutationResult>;
  discardContext(source:CodeActionSource, path?:string):Promise<CodeDiscardContext>;
  discard(source:CodeActionSource, expectedRevision:string, path?:string):Promise<CodeDiscardChanges>;
  run(source:CodeActionSource, runId:string):Promise<GenerationRun>;
  cancel(source:CodeActionSource, runId:string):Promise<GenerationRun>;
};

export type CodeSourceControlWorktree = {
  worktreeId:string; name:string; location:string; isMain:boolean; isRegistered:boolean; available?:boolean;
  source:WorkbenchLocation|null; status:'complete'|'partial'|'unavailable';
  branch:string|null; head:string|null; upstream:string|null; ahead:number|null; behind:number|null;
  taskId?:string|null; taskTitle?:string|null; taskDiagnostic?:string|null;
  fileCount:number|null; changes:WorkbenchChange[]; observedRevision:string|null; readAt:string;
  coverage?:{fileLimit:number;truncated:boolean}; diagnostics?:ReadMeta['diagnostics'];
};
export type CodeSourceControlRepository = {
  id:string; code:string; name:string; location:string; available?:boolean; gitId:string|null;
  source:WorkbenchLocation|null; status:'complete'|'partial'|'unavailable';
  clone?:{state:'cloning'|'failed';diagnostic:string|null;startedAt:string|null}|null;
  branch:string|null; head:string|null; upstream:string|null; ahead:number|null; behind:number|null;
  fileCount:number|null; changes:WorkbenchChange[]; observedRevision:string|null; diagnostics?:ReadMeta['diagnostics'];
  worktrees:CodeSourceControlWorktree[]; worktreeCount?:number|null;
  worktreeCoverage?:{limit:number;total:number|null;read:number;truncated:boolean};
};
export type CodeSourceControlResponse = ReadMeta & {
  repositories:CodeSourceControlRepository[];
  selectedRepositoryIds:string[]; selectedWorktreeIds:string[];
  selectedWorktrees:Array<{repositoryId:string;worktreeId:string}>;
  worktreeCoverage:{limit:number;total:number|null;read:number;truncated:boolean};
  scopeReason:string;
};
