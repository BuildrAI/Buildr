import { api } from '../../../api';
import type { CodeRepositoriesRepositories, CodeDirectoryDirectory, CodeFileFile, CodeSearchSearch } from '../../../../build/generated/code-http-dto';
export type CodeCatalog = CodeRepositoriesRepositories;
export type CodeDirectory = CodeDirectoryDirectory;
export type CodeFile = CodeFileFile;
export type CodeSearch = CodeSearchSearch;
export type CodeLocation = {repositoryId:string;taskId?:string|null;commitHash?:string|null};
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
};
