import type { ApiClient } from '../../../api/client';
import type { CatalogEntry, ConnectionInstance, HookInput, HookResult, TeamInput } from '../connection-skill-types';

export function createConnectionSkillsClient(api: ApiClient, workspaceId: string) {
  const root = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/connection-skills`;
  const item = (id: string) => `${root}/instances/${encodeURIComponent(id)}`;
  const json = (method: string, body: unknown, signal?: AbortSignal): RequestInit => ({ method, body: JSON.stringify(body), signal });
  return {
    definitions: (signal?: AbortSignal) => api(`${root}/definitions`, { signal }) as Promise<{ definitions: CatalogEntry[]; diagnostics: unknown[] }>,
    list: (signal?: AbortSignal) => api(`${root}/instances`, { signal }) as Promise<{ instances: ConnectionInstance[]; diagnostics: unknown[] }>,
    get: (id: string, signal?: AbortSignal) => api(item(id), { signal }) as Promise<{ instance: ConnectionInstance }>,
    create: (input: TeamInput) => api(`${root}/instances`, json('POST', input)) as Promise<{ instance: ConnectionInstance }>,
    update: (id: string, input: TeamInput) => api(item(id), json('PATCH', input)) as Promise<{ instance: ConnectionInstance }>,
    remove: (id: string, expected: TeamInput['expected']) => api(item(id), json('DELETE', { expected })) as Promise<{ removed: boolean }>,
    savePersonal: (id: string, input: { intent: 'replace' | 'remove'; values?: Record<string, unknown>; expected: { teamRevision: string; definitionRevision: string; localRevision: string } }) => api(`${item(id)}/auth`, json('PUT', input)) as Promise<{ instance: ConnectionInstance }>,
    test: (input: HookInput, signal?: AbortSignal) => api(`${root}/test`, json('POST', input, signal)) as Promise<HookResult>,
    discover: (input: HookInput, signal?: AbortSignal) => api(`${root}/discover`, json('POST', input, signal)) as Promise<HookResult>,
    check: (id: string, signal?: AbortSignal) => api(`${item(id)}/check`, json('POST', {}, signal)) as Promise<{ program: string; ready: boolean; diagnostics: string[]; installHint: string | null }>,
  };
}
export type ConnectionSkillsClient = ReturnType<typeof createConnectionSkillsClient>;
