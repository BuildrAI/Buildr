import type { SessionAdapter } from './LocalSessionAdapter';

export type ApiError = Error & { code?: string; details?: unknown };

export type ApiClient = (resource: string, options?: RequestInit) => Promise<unknown>;

export function createApiClient(options: {
  sessionAdapter: SessionAdapter;
  getWorkspaceId: () => string | null;
}): ApiClient {
  function scopedResource(resource: string): string {
    const workspaceId = options.getWorkspaceId();
    if (!workspaceId || !resource.startsWith('/api/v1/')) return resource;
    if (
      resource === '/api/v1/workspaces'
      || resource.startsWith('/api/v1/workspaces/')
      || resource.startsWith('/api/v1/app/')
      || resource === '/api/v1/prompts/workspace-create'
    ) {
      return resource;
    }
    if (resource === '/api/v1/workspace') {
      return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;
    }
    return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}${resource.slice('/api/v1'.length)}`;
  }

  return async function api(resource: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers || {});
    if (init.body) {
      const writeHeaders = options.sessionAdapter.writeHeaders();
      for (const [key, value] of Object.entries(writeHeaders)) {
        if (!headers.has(key)) headers.set(key, value);
      }
    }
    const response = await fetch(scopedResource(resource), { ...init, headers });
    const body = await response.json() as { error?: { message?: string; code?: string; details?: unknown } };
    if (!response.ok) {
      const error: ApiError = new Error(body.error?.message || 'Buildr 请求失败。');
      error.code = body.error?.code;
      error.details = body.error?.details;
      throw error;
    }
    return body;
  };
}
