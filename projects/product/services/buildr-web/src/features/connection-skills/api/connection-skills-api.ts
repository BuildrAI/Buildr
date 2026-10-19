import type { ApiClient } from '../../../api/client';
import type { CatalogEntry, ConnectionInstance, HookInput, HookResult, TeamInput } from '../connection-skill-types';

type ConnectionDirectory = { instances: ConnectionInstance[]; definitions: CatalogEntry[]; diagnostics: unknown[] };

function connectionDirectory(value: unknown): ConnectionDirectory {
  if (!value || typeof value !== 'object'
    || !('instances' in value) || !Array.isArray(value.instances)
    || !('definitions' in value) || !Array.isArray(value.definitions)
    || !('diagnostics' in value) || !Array.isArray(value.diagnostics)) {
    throw new Error('连接目录响应格式无效，请刷新后重试。');
  }
  return value as ConnectionDirectory;
}

export function createConnectionSkillsClient(api: ApiClient, workspaceId: string) {
  const root = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/connection-skills`;
  const item = (id: string) => `${root}/instances/${encodeURIComponent(id)}`;
  const json = (method: string, body: unknown, signal?: AbortSignal): RequestInit => ({ method, body: JSON.stringify(body), signal });
  return {
    directory: async (signal?: AbortSignal) => connectionDirectory(await api(`${root}/directory`, { signal, cache: 'no-store' })),
    definitions: (signal?: AbortSignal) => api(`${root}/definitions`, { signal }) as Promise<{ definitions: CatalogEntry[]; diagnostics: unknown[] }>,
    list: (signal?: AbortSignal) => api(`${root}/instances`, { signal }) as Promise<{ instances: ConnectionInstance[]; diagnostics: unknown[] }>,
    get: (id: string, signal?: AbortSignal) => api(item(id), { signal }) as Promise<{ instance: ConnectionInstance }>,
    create: (input: TeamInput) => api(`${root}/instances`, json('POST', input)) as Promise<{ instance: ConnectionInstance }>,
    update: (id: string, input: TeamInput) => api(item(id), json('PATCH', input)) as Promise<{ instance: ConnectionInstance }>,
    remove: (id: string, expected: TeamInput['expected']) => api(item(id), json('DELETE', { expected })) as Promise<{ removed: boolean }>,
    savePersonal: (id: string, input: { intent: 'replace' | 'remove'; values?: Record<string, unknown>; expected: { teamRevision: string; definitionRevision: string; localRevision: string } }) => api(`${item(id)}/auth`, json('PUT', input)) as Promise<{ instance: ConnectionInstance }>,
    revealPersonal: (id: string, input: { field: string; expected: { teamRevision: string; definitionRevision: string; localRevision: string } }, signal?: AbortSignal) => api(`${item(id)}/auth/reveal`, { ...json('POST', input, signal), cache: 'no-store' }) as Promise<{ field: string; value: string }>,
    migratePersonal: (id: string, input: { source: { id: string; authenticationSource: 'team' | 'personal'; expected: { teamRevision: string; definitionRevision: string; localRevision: string } }; expected: { teamRevision: string; definitionRevision: string; localRevision: string }; removeSource: boolean }) => api(`${item(id)}/auth/migrate`, json('POST', input)) as Promise<{ instance: ConnectionInstance; migrated: true; sourceRemoved: boolean }>,
    authorizePersonal: (id: string, input: { expected: { teamRevision: string; definitionRevision: string; localRevision: string } }, signal?: AbortSignal) => api(`${item(id)}/auth/authorize`, json('POST', input, signal)) as Promise<{ status: 'success'; instance: ConnectionInstance; accountLabel?: string; warnings?: string[] }>,
    test: (input: HookInput, signal?: AbortSignal) => api(`${root}/test`, json('POST', input, signal)) as Promise<HookResult>,
    discover: (input: HookInput, signal?: AbortSignal) => api(`${root}/discover`, json('POST', input, signal)) as Promise<HookResult>,
    check: (id: string, signal?: AbortSignal) => api(`${item(id)}/check`, json('POST', {}, signal)) as Promise<{ program: string; ready: boolean; diagnostics: string[]; installHint: string | null }>,
  };
}
export type ConnectionSkillsClient = ReturnType<typeof createConnectionSkillsClient>;
