import { api } from '../../../api';
import type { CodeRepositoriesRepositories, CodeDirectoryDirectory, CodeFileFile, CodeSearchSearch, CodeSourceControlSourceControl, CodeHistoryHistory, CodeCommitCommit, CodeDiffDiff, CodeSourceFileSourceFile } from '../../../../build/generated/code-http-dto';
export type CodeSourceControlInput = { repositoryId?: string; worktreeId?: string; taskId?: string; commitHash?: string; path?: string; area?: 'unstaged' | 'staged' | 'untracked' | 'commit'; branch?: string; query?: string; limit?: number; cursor?: string; expectedRevision?: string; page?: number; line?: number; matchQuery?: string };
export type CodeSourceControlResponse = CodeSourceControlSourceControl;
export type CodeHistoryResponse = CodeHistoryHistory;
export type CodeCommitResponse = CodeCommitCommit;
export type CodeDiffResponse = CodeDiffDiff;
export type CodeSourceFileResponse = CodeSourceFileSourceFile;
export type CodeCatalog = CodeRepositoriesRepositories;
export type CodeDirectory = CodeDirectoryDirectory;
export type CodeFile = CodeFileFile;
export type CodeSearch = CodeSearchSearch;
export type CodeLocation = {repositoryId:string;checkoutId?:string|null;taskId?:string|null;commitHash?:string|null};
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
  search:(id:string,input:CodeReadInput,signal?:AbortSignal)=>request<CodeSearch>(id,'search',input,signal),
  sourceControl:(id:string,input:CodeSourceControlInput={},signal?:AbortSignal)=>request<CodeSourceControlResponse>(id,'source-control',input,signal),
  history:(id:string,input:CodeSourceControlInput,signal?:AbortSignal)=>request<CodeHistoryResponse>(id,'history',input,signal),
  commit:(id:string,input:CodeSourceControlInput,signal?:AbortSignal)=>request<CodeCommitResponse>(id,'commit',input,signal),
  diff:(id:string,input:CodeSourceControlInput,signal?:AbortSignal)=>request<CodeDiffResponse>(id,'diff',input,signal),
  sourceFile:(id:string,input:CodeSourceControlInput,signal?:AbortSignal)=>request<CodeSourceFileResponse>(id,'source-file',input,signal),
};
