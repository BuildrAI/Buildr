import { inputObject, recordRevision, type ConnectionRecord } from '../domain/connection.ts';
import type { KibanaOperations } from '../domain/kibana-connection.ts';
import { sanitizeKibanaOutput } from '../infrastructure/kibana-provider.ts';

type KibanaAccess = { record: ConnectionRecord; credentials: Record<string, unknown>; kibana: KibanaOperations };
type ObservedResult<K extends keyof KibanaOperations> = Awaited<ReturnType<KibanaOperations[K]>> & { connectionId: string; connectionRevision: string; environment: string };
const DISCOVERY_FIELDS = ['name', 'offset', 'limit'];
const QUERY_FIELDS = ['dataViewId', 'since', 'from', 'to', 'service', 'namespace', 'contains', 'traceId', 'filters'];

/** One observed connection per action; credentials remain inside the application boundary. */
export class KibanaLogsApplication {
  private readonly access: (root: string, id: string) => KibanaAccess;
  constructor(access: (root: string, id: string) => KibanaAccess) { this.access = access; }
  private async run<K extends keyof KibanaOperations>(root: string, id: string, value: unknown, action: K, fields: string[]): Promise<ObservedResult<K>> {
    const input = inputObject(value, fields), access = this.access(root, id);
    const result = await access.kibana[action](access.record.config, access.credentials, input);
    const observed = { ...result, connectionId: access.record.id, connectionRevision: recordRevision(access.record), environment: access.record.environment } as unknown as ObservedResult<K>;
    return sanitizeKibanaOutput(observed, access.credentials, access.record.config);
  }
  views(root: string, id: string, value: unknown = {}) { return this.run(root, id, value, 'views', DISCOVERY_FIELDS); }
  fields(root: string, id: string, value: unknown = {}) { return this.run(root, id, value, 'fields', ['dataViewId', ...DISCOVERY_FIELDS]); }
  search(root: string, id: string, value: unknown = {}) { return this.run(root, id, value, 'search', [...QUERY_FIELDS, 'limit', 'fields', 'order', 'messageBytes']); }
  aggregate(root: string, id: string, value: unknown = {}) { return this.run(root, id, value, 'aggregate', [...QUERY_FIELDS, 'field', 'top']); }
}
