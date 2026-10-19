import { api } from '../../../api';
import { createSharedSourceControlWatch } from './shared-source-control-watch.ts';
import { beginSourceControlFetch, beginSourceControlSync, notifySourceControlChange } from '../source-control-events.ts';
import type { CodeRepositoriesRepositories, CodeDirectoryDirectory, CodeFileFile, CodeSearchSearch, CodeSourceControlSourceControl, CodeHistoryHistory, CodeCommitCommit, CodeDiffDiff, CodeSourceFileSourceFile, CodeBranchesBranches, CodeAuthorsAuthors, CodeBranchSwitchBranchSwitch, CodeFetchFetch, CodeSyncContextSyncContext, CodeSyncSync, CodeEditorFileEditorFile, CodeSaveFileSaveFile } from '../../../../build/generated/code-http-dto';
export type CodeSourceControlInput = { observation?: 'shared'; repositoryId?: string; worktreeId?: string; taskId?: string; commitHash?: string; path?: string; area?: 'unstaged' | 'staged' | 'untracked' | 'commit'; branch?: string; authorEmail?: string; query?: string; limit?: number; cursor?: string; expectedRevision?: string; page?: number; line?: number; matchQuery?: string };
export type CodeSourceControlResponse = CodeSourceControlSourceControl;
export type CodeSourceControlWatchResponse = {cursor: string; repositoryIds: string[]; refreshAll: boolean; refsRepositoryIds?: string[]; diagnostics?: string[]};
export type CodeHistoryResponse = CodeHistoryHistory;
export type CodeCommitResponse = CodeCommitCommit;
export type CodeDiffResponse = CodeDiffDiff;
export type CodeSourceFileResponse = CodeSourceFileSourceFile;
export type CodeBranchesResponse = CodeBranchesBranches;
export type CodeAuthorsResponse = CodeAuthorsAuthors;
export type CodeBranchSwitchResponse = CodeBranchSwitchBranchSwitch;
export type CodeBranchSwitchInput = { repositoryId: string; worktreeId: string; targetRef: string; expectedTargetHash: string; expectedRevision: string; localName?: string };
export type CodeFetchInput = {repositories:Array<{repositoryId:string; expectedGitId:string | null; expectedCheckoutId:string | null}>};
export type CodeFetchResponse = CodeFetchFetch;
export type CodeSyncContextResponse = CodeSyncContextSyncContext;
export type CodeSyncResponse = CodeSyncSync;
export type CodeSyncInput = {repositoryId:string; worktreeId:string; expectedRevision:string};
export type CodeCatalog = CodeRepositoriesRepositories;
export type CodeDirectory = CodeDirectoryDirectory;
export type CodeFile = CodeFileFile;
export type CodeSearch = CodeSearchSearch;
export type CodeLocation = {repositoryId:string;checkoutId?:string|null;taskId?:string|null;commitHash?:string|null};
export type EditableFileSnapshot = CodeEditorFileEditorFile;
export type EditableFileSelector = EditableFileSnapshot['selector'];
export type SaveFileInput = { selector: EditableFileSelector; expectedFileId: string; expectedSourceRevision: string; expectedRevision: string; content: string };
export type CodeReadInput = CodeLocation & {path?:string;query?:string;mode?:'name'|'content';showIgnored?:boolean;page?:number;line?:number;matchQuery?:string;expectedRevision?:string};
const request = <T,>(workspaceId:string,operation:string,input:Record<string,unknown>,signal?:AbortSignal):Promise<T> => {
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(input))if(value!==undefined&&value!==null)query.set(key==='path'?'filePath':key,String(value));
  return api(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/code/${operation}?${query}`,{signal}) as Promise<T>;
};
export const codeApi = {
  repositories:(id:string,taskId?:string,signal?:AbortSignal)=>request<CodeCatalog>(id,'repositories',{taskId},signal),
  directory:(id:string,input:CodeReadInput,signal?:AbortSignal)=>request<CodeDirectory>(id,'directory',input,signal),
  file:(id:string,input:CodeReadInput,signal?:AbortSignal)=>request<CodeFile>(id,'file',input,signal),
  editorFile:(id:string,selector:EditableFileSelector,signal?:AbortSignal)=>request<EditableFileSnapshot>(id,'editor-file',selector,signal),
  saveFile:async (id:string,input:SaveFileInput):Promise<CodeSaveFileSaveFile> => {
    const result = await api(`/api/v1/workspaces/${encodeURIComponent(id)}/code/save-file`,{method:'POST',body:JSON.stringify(input)}) as CodeSaveFileSaveFile;
    if (input.selector.kind === 'code') notifySourceControlChange({workspaceId:id, repositoryId:input.selector.repositoryId, worktreeId:input.selector.checkoutId, cause:'file-save'});
    return result;
  },
  search:(id:string,input:CodeReadInput,signal?:AbortSignal)=>request<CodeSearch>(id,'search',input,signal),
  sourceControlInventory:(id:string,input:{taskId?:string}={},signal?:AbortSignal)=>request<CodeSourceControlResponse>(id,'source-control-inventory',input,signal),
  sourceControl:(id:string,input:CodeSourceControlInput={},signal?:AbortSignal)=>request<CodeSourceControlResponse>(id,'source-control',input,signal),
  watchSourceControl:createSharedSourceControlWatch((id,cursor,signal)=>request<CodeSourceControlWatchResponse>(id,'source-control-watch',{cursor},signal)),
  history:(id:string,input:CodeSourceControlInput,signal?:AbortSignal)=>request<CodeHistoryResponse>(id,'history',input,signal),
  commit:(id:string,input:CodeSourceControlInput,signal?:AbortSignal)=>request<CodeCommitResponse>(id,'commit',input,signal),
  diff:(id:string,input:CodeSourceControlInput,signal?:AbortSignal)=>request<CodeDiffResponse>(id,'diff',input,signal),
  branches:(id:string,input:CodeSourceControlInput,signal?:AbortSignal)=>request<CodeBranchesResponse>(id,'branches',input,signal),
  authors:(id:string,input:CodeSourceControlInput,signal?:AbortSignal)=>request<CodeAuthorsResponse>(id,'authors',input,signal),
  switchBranch:async (id:string,input:CodeBranchSwitchInput):Promise<CodeBranchSwitchResponse> => {
    const notice = {workspaceId:id, repositoryId:input.repositoryId, worktreeId:input.worktreeId};
    let result: CodeBranchSwitchResponse;
    try { result = await api(`/api/v1/workspaces/${encodeURIComponent(id)}/code/branch-switch`,{method:'POST',body:JSON.stringify(input)}) as CodeBranchSwitchResponse; }
    catch (error) { notifySourceControlChange(notice); throw error; }
    notifySourceControlChange({...notice, result});
    return result;
  },
  fetch:async (id:string,input:CodeFetchInput):Promise<CodeFetchResponse> => {
    const repositoryIds = input.repositories.map(repository => repository.repositoryId);
    const fetchSequences = beginSourceControlFetch(id, repositoryIds);
    let result: CodeFetchResponse;
    try { result = await api(`/api/v1/workspaces/${encodeURIComponent(id)}/code/fetch`, {method:'POST', body:JSON.stringify(input)}) as CodeFetchResponse; }
    catch (error) {
      result = {readAt:new Date().toISOString(), repositories:input.repositories.map(repository => ({repositoryId:repository.repositoryId, gitId:repository.expectedGitId, status:'unknown', message:'获取结果未知，请重新读取核对。' + (error instanceof Error ? ' ' + error.message : ''), remotes:[]}))};
    }
    // An issued Git write outlives the row or page that started it. Never retry it here.
    if (repositoryIds.length) notifySourceControlChange({workspaceId:id, repositoryId:repositoryIds[0], repositoryIds, fetchResults:result.repositories, fetchSequences});
    return result;
  },
  syncContext:(id:string,input:{repositoryId:string;worktreeId:string})=>request<CodeSyncContextResponse>(id,'sync-context',input),
  sync:async (id:string,input:CodeSyncInput,syncSequence = beginSourceControlSync(id, input.repositoryId, input.worktreeId)):Promise<CodeSyncResponse> => {
    const notice = {workspaceId:id, repositoryId:input.repositoryId, worktreeId:input.worktreeId, syncSequence};
    try {
      const result = await api(`/api/v1/workspaces/${encodeURIComponent(id)}/code/sync`, {method:'POST', body:JSON.stringify(input)}) as CodeSyncResponse;
      if (result.source.repositoryId !== input.repositoryId || result.source.worktreeId !== input.worktreeId) throw new Error('同步结果的来源不匹配，请重新读取核对。');
      notifySourceControlChange({...notice, syncResult:result});
      return result;
    } catch (error) {
      notifySourceControlChange({...notice, syncError:'同步结果尚未确认，请重新读取核对。' + (error instanceof Error ? ' ' + error.message : '')});
      throw error;
    }
  },
  sourceFile:(id:string,input:CodeSourceControlInput,signal?:AbortSignal)=>request<CodeSourceFileResponse>(id,'source-file',input,signal),
};
