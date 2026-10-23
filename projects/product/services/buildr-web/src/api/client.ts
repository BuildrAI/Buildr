import type { SessionAdapter } from './LocalSessionAdapter';

export type ApiError = Error & { code?: string; status?: number; details?: unknown };

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
      || resource === '/api/v1/release-awareness'
      || resource.startsWith('/api/v1/app/')
      || resource.startsWith('/api/v1/update/')
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
    const send = async () => {
      const headers = new Headers(init.headers || {});
      if (init.body || !['GET', 'HEAD'].includes((init.method || 'GET').toUpperCase())) {
        const writeHeaders = options.sessionAdapter.writeHeaders();
        for (const [key, value] of Object.entries(writeHeaders)) {
          if (!headers.has(key)) headers.set(key, value);
        }
      }
      // JSON endpoints already return no-store. Bypass the browser's cache entry
      // lock before sending too, especially for concurrent observation requests.
      const response = await fetch(scopedResource(resource), { cache: 'no-store', ...init, headers });
      const body = await response.json() as { error?: { message?: string; code?: string; details?: unknown } };
      if (!response.ok) {
        const error: ApiError = new Error(body.error?.message || 'Buildr 请求失败。');
        error.code = body.error?.code;
        error.status = response.status;
        error.details = body.error?.details;
        throw error;
      }
      return body;
    };

    try {
      return await send();
    } catch (error) {
      // 令牌随服务进程轮换：过期页面或缺失 meta 先重取当前令牌，再原样重试一次。
      if ((error as ApiError)?.code !== 'session_forbidden' || typeof options.sessionAdapter.refreshSession !== 'function') throw error;
      if (!await options.sessionAdapter.refreshSession()) throw error;
      return send();
    }
  };
}
export type WorkspaceDocument = { path?: string; name: string; exists: boolean; content: string | null };
