import { maintainNativeContent } from '../application/native-content-maintenance.ts';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { inspectAgentStorage, collectAgentStorage } from '../application/storage-maintenance.ts';
import { cleanupStoppedProcesses } from './cleanup.ts';
import type { AgentRuntimeUnit } from '../execution-contracts.ts';

/** One pass in a separate isolate: lsof, SQLite and directory scans never block conversation control. */
if (!isMainThread && workerData?.kind === 'agent-storage-maintenance') {
  try {
    // Confirmed shutdowns use the same worker as the other storage collectors.
    // The scheduler throttles this even while a diagnostic backlog drains.
    if(workerData.runtime)try{cleanupStoppedProcesses(workerData.dataRoot,workerData.runtime);}catch{/* Retain unknown resources. */}
    const content = maintainNativeContent(workerData.dataRoot,{maximumItems:512,budgetMs:1000});
    // Native deduplication gets its own budget before the potentially expensive
    // diagnostic inventory. A backlog must not starve content or runtime adoption.
    try {
      const result = collectAgentStorage(inspectAgentStorage({ dataRoot: workerData.dataRoot }),512,{budgetMs:3000});
      parentPort?.postMessage({ nativeContent: content, removedBytes: result.removedBytes, backlog:result.removedBytes>0&&result.results.some(item=>item.reason==='storage_batch_deferred'), retained: result.results.filter(item => item.status === 'retained').length });
    }catch{parentPort?.postMessage({nativeContent:content,diagnostic:'storage_collection_deferred'});}
  } catch { parentPort?.postMessage({ diagnostic: 'storage_collection_deferred' }); }
}

export class StorageMaintenance {
  private worker?: Worker;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private entryDone=false;
  private attachmentDone=false;
  private readonly dataRoot: string;
  private readonly intervalMs: number;
  private readonly enabled: () => boolean;
  private readonly runtime?: AgentRuntimeUnit;
  private lastRuntimeCollection = -Infinity;
  constructor(dataRoot: string, options: { initialMs?: number; intervalMs?: number; enabled?: () => boolean; runtime?: AgentRuntimeUnit } = {}) {
    this.dataRoot = dataRoot; this.intervalMs = options.intervalMs ?? 60_000;
    this.enabled = options.enabled ?? (() => true);
    this.runtime = options.runtime;
    this.schedule(options.initialMs ?? 5000);
  }
  private schedule(delay: number): void {
    if (!this.closed) { this.timer = setTimeout(() => this.start(), delay); this.timer.unref(); }
  }
  private start(): void {
    if (this.closed || this.worker) return;
    if (!this.enabled()) { this.schedule(this.intervalMs); return; }
    try {
      const collectRuntime = this.runtime && Date.now()-this.lastRuntimeCollection>=60_000;
      const worker = new Worker(new URL(import.meta.url), { workerData: { kind: 'agent-storage-maintenance', dataRoot: this.dataRoot, ...(collectRuntime?{runtime:this.runtime}:{}) } });
      if(collectRuntime)this.lastRuntimeCollection=Date.now();
      let backlog=false;
      worker.on('message',message=>{
        const content=message?.nativeContent;
        if(content&&!content.diagnostic){this.entryDone ||=content.nextEntry===0;this.attachmentDone ||=content.nextAttachment==='';}
        backlog=message?.backlog===true||!!content&&!content.diagnostic&&(!this.entryDone||!this.attachmentDone);
      });
      this.worker = worker; worker.unref();
      worker.on('error', () => { /* The next pass observes again; no model or input recovery. */ });
      worker.once('exit', () => { if (this.worker === worker) this.worker = undefined;if(!backlog){this.entryDone=false;this.attachmentDone=false;}this.schedule(backlog?250:this.intervalMs); });
    } catch { this.schedule(this.intervalMs); }
  }
  /** Do not abort an in-flight narrow rename/delete; the worker is unreferenced and drains naturally. */
  close(): void { this.closed = true; clearTimeout(this.timer); }
}
