import { api, type ApiClient } from '../../../api';
export type AccessScope = 'read' | 'execute' | 'answer' | 'approve';
export interface AccessCredential { id: string; name: string; workspaceIds: string[]; scopes: AccessScope[]; allowFullAccess: boolean; revision: string; createdAt: string; revokedAt: string | null; tokenFilePath?: string }
export interface ProgrammaticAccessView { apiUrl: string; documentationUrl: string; operationsUrl?: string; openapiUrl: string; workspaces: Array<{id:string;name:string}>; credentials: AccessCredential[] }
export type AccessDocumentKind = 'help' | 'openapi.json' | 'operations' | `operations/${string}`;
export interface AccessDocument { fileName: string; mediaType: string; content: string }
export type PushbackState = 'unconfigured' | 'invalid' | 'disabled' | 'enabled';
export interface PushbackDeliveryResult { at: string; success: boolean; status?: number; kind: 'event' | 'test' }
export interface PushbackSettingsView { credentialId: string; revision: string; state: PushbackState; url: string; hasSecret: boolean; rateLimitHour: number; rateLimitMinute: number; lastDelivery?: PushbackDeliveryResult; recentDeliveries?: PushbackDeliveryResult[] }
export interface PushbackSettingsInput { expectedRevision: string; enabled: boolean; url: string; secret?: string; rateLimitHour?: number; rateLimitMinute?: number }
const base='/api/v1/app/programmatic-access';
export function createProgrammaticAccessClient(client: ApiClient) { return {
  read:()=>client(base,{headers:{'x-buildr-session':''}}) as Promise<ProgrammaticAccessView>,
  create:(input:{name:string;workspaceIds:string[];scopes:AccessScope[];allowFullAccess?:boolean})=>client(base,{method:'POST',body:JSON.stringify(input)}) as Promise<{credential:AccessCredential;token:string}>,
  revoke:(credential:AccessCredential)=>client(`${base}/${credential.id}/revoke`,{method:'POST',body:JSON.stringify({expectedRevision:credential.revision})}),
  regenerate:(credential:AccessCredential)=>client(`${base}/${credential.id}/regenerate`,{method:'POST',body:JSON.stringify({expectedRevision:credential.revision})}) as Promise<{credential:AccessCredential}>,
  updateFullAccess:(credential:AccessCredential,allowFullAccess:boolean)=>client(`${base}/${credential.id}/full-access`,{method:'POST',body:JSON.stringify({expectedRevision:credential.revision,allowFullAccess})}) as Promise<{credential:AccessCredential}>,
  document:(kind:AccessDocumentKind)=>client(`${base}/documents/${kind}`,{headers:{'x-buildr-session':''}}) as Promise<AccessDocument>,
  pushback:(credentialId:string,signal?:AbortSignal)=>client(`${base}/${credentialId}/pushback`,{headers:{'x-buildr-session':''},signal}) as Promise<PushbackSettingsView>,
  savePushback:(credentialId:string,input:PushbackSettingsInput)=>client(`${base}/${credentialId}/pushback`,{method:'POST',body:JSON.stringify(input)}) as Promise<PushbackSettingsView>,
  revealPushback:(credentialId:string,expectedRevision:string)=>client(`${base}/${credentialId}/pushback/reveal`,{method:'POST',body:JSON.stringify({expectedRevision})}) as Promise<{secret:string}>,
  testPushback:(credentialId:string,expectedRevision:string)=>client(`${base}/${credentialId}/pushback/test`,{method:'POST',body:JSON.stringify({expectedRevision})}) as Promise<PushbackDeliveryResult>,
}; }
export const programmaticAccessApi=createProgrammaticAccessClient(api);
