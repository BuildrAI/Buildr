import {createApiClient as createSharedApiClient} from '@buildr-ai/buildr-harness-ui/api/client';
import type {SessionAdapter} from './LocalSessionAdapter';
export type {ApiClient,ApiError,WorkspaceDocument} from '@buildr-ai/buildr-harness-ui/api/client';
  function scopedResource(resource: string, options:{getWorkspaceId:()=>string|null}): string {
    const workspaceId = options.getWorkspaceId();
    if (!workspaceId || !resource.startsWith('/api/v1/')) return resource;
    if (
      resource === '/api/v1/workspaces'
      || resource.startsWith('/api/v1/workspaces/')
      || resource === '/api/v1/release-awareness'
      || resource.startsWith('/api/v1/app/')
      || resource.startsWith('/api/v1/update/')
      || resource.startsWith('/api/v1/installation/')
      || resource === '/api/v1/prompts/workspace-create'
    ) {
      return resource;
    }
    if (resource === '/api/v1/workspace') {
      return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;
    }
    return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}${resource.slice('/api/v1'.length)}`;
  }

export function createApiClient(options:{sessionAdapter:SessionAdapter;getWorkspaceId:()=>string|null}){const client=createSharedApiClient(options);return (resource:string,init?:RequestInit)=>client(scopedResource(resource,options),init);}
