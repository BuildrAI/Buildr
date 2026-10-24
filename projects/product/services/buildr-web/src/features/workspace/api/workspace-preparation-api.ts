import { api } from '../../../api';
export type WorkspacePreparation = { id: string; revision: number; rootPath: string; name: string; workspaceId: string | null; status: 'selected' | 'preparing' | 'ready' | 'failed'; error: string | null; details?:string; customizations?:Array<{id:string;integrity:string}> };
export const workspacePreparationApi = {
  open: (workspaceId: string) => api('/api/v1/workspaces/open', {method:'POST',body:JSON.stringify({workspaceId})}) as Promise<WorkspacePreparation|{ready:true;workspaceId:string;resourceRefresh?:{status:'current'|'refreshed'|'failed';message?:string}}>,
  choose: () => api('/api/v1/workspaces/choose', { method: 'POST', body: '{}' }) as Promise<WorkspacePreparation | {canceled: true}>,
  inspect: (id: string) => api(`/api/v1/workspaces/preparations/${id}`) as Promise<WorkspacePreparation>,
  prepare: (value: WorkspacePreparation, name: string, keepCustomizations=false) => api('/api/v1/workspaces/prepare', { method: 'POST', body: JSON.stringify({id: value.id, revision: value.revision, name,keepCustomizations}) }) as Promise<WorkspacePreparation>,
};
