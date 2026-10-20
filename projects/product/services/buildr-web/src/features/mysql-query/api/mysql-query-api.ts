import type { ApiClient } from '../../../api/client';
import type { MySqlDatabaseTables, MySqlQueryClient, MySqlQueryResult, MySqlQueryTarget, QueryPreferences } from '../query-types';

/** Each client owns one observed target set. Late calls never pick up another target's revision. */
export function createMySqlQueryClient(api: ApiClient, workspaceId: string, targets: MySqlQueryTarget[]): MySqlQueryClient {
  const revisions = new Map(targets.map(target => [target.id, target.revision]));
  const root = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/mysql-query/connections`;
  const selected = (id: string) => {
    const revision = revisions.get(id);
    if (!revision) throw new Error('查询连接已变化，请刷新连接列表。');
    return { url: `${root}/${encodeURIComponent(id)}`, revision };
  };
  const json = (method: string, body: unknown, signal?: AbortSignal): RequestInit => ({ method, body: JSON.stringify(body), signal });
  return {
    databases(id, signal) {
      const target = selected(id);
      return api(`${target.url}/databases?revision=${encodeURIComponent(target.revision)}`, { signal }) as Promise<{ connectionId: string; databases: string[] }>;
    },
    tables(id, database, signal) {
      const target = selected(id);
      return api(`${target.url}/tables?revision=${encodeURIComponent(target.revision)}&database=${encodeURIComponent(database)}`, { signal }) as Promise<MySqlDatabaseTables>;
    },
    queryPreferences(id, signal) {
      const target = selected(id);
      return api(`${target.url}/query-preferences?revision=${encodeURIComponent(target.revision)}`, { signal }) as Promise<QueryPreferences>;
    },
    saveQueryPreferences(id, input, signal) {
      const target = selected(id);
      return api(`${target.url}/query-preferences`, json('PUT', { ...input, connectionRevision: target.revision }, signal)) as Promise<QueryPreferences>;
    },
    query(id, input, signal) {
      const target = selected(id);
      return api(`${target.url}/query`, json('POST', { ...input, connectionRevision: target.revision }, signal)) as Promise<MySqlQueryResult>;
    },
  };
}
