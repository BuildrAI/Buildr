import type { ConnectionScope } from '../domain/instance.ts';
import { failure } from '../domain/instance.ts';
import type { ConnectionCatalogResult } from './catalog.ts';

type Entry = { scope: ConnectionScope; controller: AbortController; promise: Promise<ConnectionCatalogResult> };

/** Only in-flight source observations are shared; instance and auth reads stay local. */
export class ConnectionDirectoryReads {
  private readonly entries = new Map<string, Entry>();
  private readonly active = new Set<Entry>();
  private closed = false;
  private readonly limit: number;
  constructor(limit = 32) { this.limit = limit; }

  read(scope: ConnectionScope, identity: string, load: (signal: AbortSignal) => Promise<ConnectionCatalogResult>): Promise<ConnectionCatalogResult> {
    if (this.closed) return Promise.reject(failure('local_app_read_executor_closed', '连接目录后台读取已关闭。', 503));
    const key = JSON.stringify([scope.workspaceId, scope.rootPath, identity]);
    const shared = this.entries.get(key);
    if (shared) return shared.promise;
    if (this.active.size >= this.limit) return Promise.reject(failure('local_app_read_queue_full', '连接目录后台读取已达到上限。', 503));
    const controller = new AbortController();
    const entry: Entry = { scope, controller, promise: Promise.resolve().then(() => load(controller.signal)).finally(() => {
      this.active.delete(entry);
      if (this.entries.get(key) === entry) this.entries.delete(key);
    }) };
    this.entries.set(key, entry);
    this.active.add(entry);
    return entry.promise;
  }

  invalidate(scope?: ConnectionScope): void {
    for (const [key, entry] of this.entries) {
      if (!scope || entry.scope.rootPath === scope.rootPath && entry.scope.workspaceId === scope.workspaceId) this.entries.delete(key);
    }
  }

  close(): void {
    this.closed = true;
    this.entries.clear();
    for (const entry of this.active) entry.controller.abort();
  }
}
