import { api } from '../../api/index';
import type { WorkbenchChange, WorkbenchFile } from '../../workbench/source-control/read-contracts';

export type DirectoryScope = {ref:{sourceId:string;id:string};rootPath:string;revision:string;name?:string};
export type DirectoryRequest = <T>(operation:string, input?:object, signal?:AbortSignal)=>Promise<T>;
export type DirectoryListing = {entries:Array<{name:string;path:string;kind:'directory'|'file'|'link';ignored:boolean}>;truncated:boolean};
export type DirectorySearchResult = {matches:Array<{path:string;line:number|null;excerpt:string;occurrences:Array<{line:number;excerpt:string}>}>;truncated:boolean;diagnostics:Array<{message:string}>};
export type FileObservation = {fileId:string;sourceRevision:string;revision:string;content:string;editable:boolean;readonlyReason:string|null;protectedRanges:Array<{from:number;to:number}>;observedAt:string};
export type LocalStatus = {repositoryId:string;worktreeId:string;location:string;isMain:boolean;branch:string|null;head:string|null;upstream:string|null;ahead:number|null;behind:number|null;files:WorkbenchChange[];fileCount:number;truncated:boolean;observedRevision:string;writeRevision:string|null;writeUnavailable:string|null;commitUnavailable:string|null;readAt:string};

export const post = <T,>(route:string, input:object,signal?:AbortSignal) => api(route,{method:'POST',body:JSON.stringify(input),signal}) as Promise<T>;
export const directoryClient = (scope:DirectoryScope,workspaceId:string):DirectoryRequest => (operation,input={},signal) => post('/api/v1/harness/directory-workbench/'+operation,{...input,workspaceId,scopeRevision:scope.revision},signal);
export const observeWorkspaceDirectory = (workspaceId:string,signal:AbortSignal) => post<DirectoryScope>('/api/v1/harness/directory-workbench/scope',{workspaceId},signal);
export type { WorkbenchFile };
