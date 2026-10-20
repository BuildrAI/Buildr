import type { MySqlQueryClient } from '../query-types';

export type TableCatalogEntry = { status: 'loading' | 'ready' | 'error'; tables: { name: string; type: string }[]; error?: string };
type Read = { entry: TableCatalogEntry; controller: AbortController };

/** One instance belongs to one observed client/connection revision. No credentials or cross-target state. */
export class DatabaseCatalog {
  private readonly client: MySqlQueryClient;
  private readonly connectionId: string;
  private reads = new Map<string, Read>();
  private listeners = new Set<(database: string) => void>();
  private disposed = false;
  constructor(client: MySqlQueryClient, connectionId: string) { this.client = client; this.connectionId = connectionId; }
  subscribe(listener: (database: string) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  read(database: string): TableCatalogEntry {
    const previous = this.reads.get(database); if (previous) return previous.entry;
    const read: Read = { entry: { status: 'loading', tables: [] }, controller: new AbortController() };
    if (this.disposed) return read.entry;
    this.reads.set(database, read);
    void Promise.resolve().then(() => this.client.tables(this.connectionId, database, read.controller.signal)).then(result => {
      if (!this.current(database, read)) return;
      if (result.connectionId !== this.connectionId || result.database !== database) throw Error('表列表目标不匹配，请刷新后重试。');
      read.entry = { status: 'ready', tables: result.tables };
    }).catch(cause => {
      if (this.current(database, read)) read.entry = { status: 'error', tables: [], error: cause instanceof Error ? cause.message : '读取表列表失败。' };
    }).finally(() => { if (this.current(database, read)) this.listeners.forEach(listener => listener(database)); });
    return read.entry;
  }
  retry(database: string) { this.reads.get(database)?.controller.abort(); this.reads.delete(database); return this.read(database); }
  invalidate() { this.reads.forEach(read => read.controller.abort()); this.reads.clear(); this.listeners.forEach(listener => listener('')); }
  dispose() { this.disposed = true; this.invalidate(); this.listeners.clear(); }
  private current(database: string, read: Read) { return !this.disposed && !read.controller.signal.aborted && this.reads.get(database) === read; }
}
