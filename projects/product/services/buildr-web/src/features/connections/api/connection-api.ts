import type { ApiClient } from '../../../api/client';
import type { ConnectionInput, ConnectionTestInput, ConnectionTestResult, EditableConnection, ExternalConnection, KibanaDataViewsInput, KibanaDataViewsResult, MySqlQueryResult, QueryPreferences } from '../connection-types';

/** Bind every operation to its visible workspace, including after an asynchronous response. */
export function createConnectionClient(api: ApiClient, workspaceId: string) {
  const root = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/connections`;
  const item = (id: string) => `${root}/${encodeURIComponent(id)}`;
  const json = (method: string, body: unknown, signal?: AbortSignal): RequestInit => ({ method, body: JSON.stringify(body), signal });
  return {
    list(signal?: AbortSignal) {
      return api(root, { signal }) as Promise<{ connections: ExternalConnection[]; configurationWritable?: boolean }>;
    },
    create(input: ConnectionInput) {
      return api(root, json('POST', input)) as Promise<{ connection: EditableConnection }>;
    },
    update(id: string, expectedRevision: string, input: ConnectionInput) {
      return api(item(id), json('PATCH', { ...input, expectedRevision })) as Promise<{ connection: EditableConnection }>;
    },
    remove(id: string, expectedRevision: string) {
      return api(item(id), json('DELETE', { expectedRevision })) as Promise<unknown>;
    },
    test(input: ConnectionTestInput, signal?: AbortSignal) {
      return api(`${root}/test`, json('POST', input, signal)) as Promise<ConnectionTestResult>;
    },
    discoverKibanaViews(input: KibanaDataViewsInput, signal?: AbortSignal) {
      return api(`${root}/kibana/data-views`, json('POST', input, signal)) as Promise<KibanaDataViewsResult>;
    },
    databases(id: string, signal?: AbortSignal) {
      return api(`${item(id)}/databases`, { signal }) as Promise<{ connectionId: string; databases: string[] }>;
    },
    queryPreferences(id: string, signal?: AbortSignal) {
      return api(`${item(id)}/query-preferences`, { signal }) as Promise<QueryPreferences>;
    },
    saveQueryPreferences(id: string, input: { enabledDatabases: string[]; currentDatabase: string | null; expectedRevision: string }, signal?: AbortSignal) {
      return api(`${item(id)}/query-preferences`, json('PUT', input, signal)) as Promise<QueryPreferences>;
    },
    query(id: string, input: { sql: string; database?: string | null }, signal?: AbortSignal) {
      return api(`${item(id)}/query`, json('POST', input, signal)) as Promise<MySqlQueryResult>;
    },
  };
}

export type ConnectionClient = ReturnType<typeof createConnectionClient>;
