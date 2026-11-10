import { api, type ApiClient } from '../../../api';
export type AccessScope = 'read' | 'execute' | 'answer' | 'approve';
export interface AccessCredential { id: string; name: string; workspaceIds: string[]; scopes: AccessScope[]; revision: string; createdAt: string; revokedAt: string | null }
export interface ProgrammaticAccessView { apiUrl: string; documentationUrl: string; openapiUrl: string; workspaces: Array<{id:string;name:string}>; credentials: AccessCredential[] }
const base='/api/v1/app/programmatic-access';
export function createProgrammaticAccessClient(client: ApiClient) { return {
  read:()=>client(base,{headers:{'x-buildr-session':''}}) as Promise<ProgrammaticAccessView>,
  create:(input:{name:string;workspaceIds:string[];scopes:AccessScope[]})=>client(base,{method:'POST',body:JSON.stringify(input)}) as Promise<{credential:AccessCredential;token:string}>,
  revoke:(credential:AccessCredential)=>client(`${base}/${credential.id}/revoke`,{method:'POST',body:JSON.stringify({expectedRevision:credential.revision})}),
}; }
export const programmaticAccessApi=createProgrammaticAccessClient(api);
