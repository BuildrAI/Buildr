import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { inspectAgentStorage, collectAgentStorage } from '../application/storage-maintenance.ts';

/** One pass in a separate isolate: lsof, SQLite and directory scans never block conversation control. */
if (!isMainThread && workerData?.kind === 'agent-storage-maintenance') {
  try {
    const result = collectAgentStorage(inspectAgentStorage({ dataRoot: workerData.dataRoot }));
    parentPort?.postMessage({ removedBytes: result.removedBytes, retained: result.results.filter(item => item.status === 'retained').length });
  } catch { parentPort?.postMessage({ diagnostic: 'storage_collection_deferred' }); }
}

export class StorageMaintenance {
  private worker?: Worker;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private readonly dataRoot: string;
  private readonly intervalMs: number;
  private readonly enabled: () => boolean;
  constructor(dataRoot: string, options: { initialMs?: number; intervalMs?: number; enabled?: () => boolean } = {}) {
    this.dataRoot = dataRoot; this.intervalMs = options.intervalMs ?? 60_000;
    this.enabled = options.enabled ?? (() => true);
    this.schedule(options.initialMs ?? 5000);
  }
  private schedule(delay: number): void {
    if (!this.closed) { this.timer = setTimeout(() => this.start(), delay); this.timer.unref(); }
  }
  private start(): void {
    if (this.closed || this.worker) return;
    if (!this.enabled()) { this.schedule(this.intervalMs); return; }
    try {
      const worker = new Worker(new URL(import.meta.url), { workerData: { kind: 'agent-storage-maintenance', dataRoot: this.dataRoot } });
      this.worker = worker; worker.unref();
      worker.on('error', () => { /* The next pass observes again; no model or input recovery. */ });
      worker.once('exit', () => { if (this.worker === worker) this.worker = undefined; this.schedule(this.intervalMs); });
    } catch { this.schedule(this.intervalMs); }
  }
  /** Do not abort an in-flight narrow rename/delete; the worker is unreferenced and drains naturally. */
  close(): void { this.closed = true; clearTimeout(this.timer); }
}
