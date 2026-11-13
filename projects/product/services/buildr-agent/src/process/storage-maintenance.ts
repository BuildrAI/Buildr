import path from 'node:path';
import fs from 'node:fs';
import type { HomeDiscoveryCursor } from '../storage/home-discovery.ts';
import { observeSharedCacheUse } from '../storage/shared-cache.ts';
import { observeStorageUse } from '../storage/files.ts';
import { ConversationRepository } from '../persistence/conversation-repository.ts';
import { ensureStorageDirectory } from '../storage/files.ts';
import { claimStorage, writePrivate } from './ownership.ts';
import { sharePreparedToolPackage } from '../storage/runtime-objects.ts';
import { maintainNativeContent } from '../application/native-content-maintenance.ts';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { inspectAgentStorage, collectAgentStorage, collectReleasedExecutorStorage, cacheStorageDependencies, mergeLegacyNpmCaches } from '../application/storage-maintenance.ts';
import { cleanupStoppedProcesses } from './cleanup.ts';
import type { ExecutionDiagnosticSink } from '../contracts.ts';
import type { AgentRuntimeUnit } from '../execution-contracts.ts';

/** One pass in a separate isolate: lsof, SQLite and directory scans never block conversation control. */
if (!isMainThread && workerData?.kind === 'agent-storage-program') {
  const lock = claimStorage(workerData.dataRoot);
  try { sharePreparedToolPackage(workerData.root,workerData.directory); } finally { lock.release(); }
} else if (!isMainThread && workerData?.kind === 'agent-storage-release') {
  try { collectReleasedExecutorStorage(workerData.dataRoot, workerData.provider, workerData.configRoot); }
  catch { /* Contention only defers this optional snapshot to periodic maintenance. */ }
} else if (!isMainThread && workerData?.kind === 'agent-storage-maintenance') {
  // Keep the public package synchronously loadable by CJS hosts.
  void runMaintenance();
}

async function runMaintenance(): Promise<void> {
  const { dataRoot, runtime, nativeOnly, inventoryOnly } = workerData;
  const started = performance.now(), cpuStarted = process.threadCpuUsage();
  const stages: Record<string, number> = {};
  let stageStarted = started;
  const stage = (name: string) => {
    const now = performance.now();
    stages[name] = Math.round(now - stageStarted);
    stageStarted = now;
  };
  let content: ReturnType<typeof maintainNativeContent> | undefined;
  const timing = () => {
    const cpu = process.threadCpuUsage(cpuStarted);
    return { durationMs: Math.round(performance.now() - started), cpuMs: Math.ceil((cpu.user + cpu.system) / 1000), stages };
  };
  try {
    if (runtime) try { cleanupStoppedProcesses(dataRoot, runtime); } catch { /* Retain unknown resources. */ }
    stage('runtimes');
    if (!inventoryOnly) content = maintainNativeContent(dataRoot, { maximumItems: 512, budgetMs: 1000 });
    stage('nativeContent');
    if (nativeOnly) {
      parentPort?.postMessage({ nativeContent: content, ...timing() });
      return;
    }
    const root = path.join(dataRoot, 'agent-service');
    let cacheObservationComplete = true;
    try { observeSharedCacheUse(root, observeStorageUse(), cacheStorageDependencies(root, new ConversationRepository(root))); }
    catch { cacheObservationComplete = false; }
    const observationFile = path.join(root, 'process/storage-observation.json');
    let previous: { homeStorage?: { cursor?: HomeDiscoveryCursor } } | undefined;
    try {
      const stat = fs.lstatSync(observationFile);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.size < 1024 * 1024) previous = JSON.parse(fs.readFileSync(observationFile, 'utf8'));
    } catch { /* First observation starts a new cycle. */ }
    stage('cacheObservation');
    const plan = inspectAgentStorage({ dataRoot, homeCursor: previous?.homeStorage?.cursor });
    stage('inventory');
    // Migration verifies the whole cache before retirement. A shorter fixed
    // deadline could repeatedly restart verification without making progress.
    const npmCaches = await mergeLegacyNpmCaches(plan);
    stage('migration');
    if (!cacheObservationComplete) for (const item of plan.items) if (item.kind === 'shared-cache') {
      item.eligible = false;
      item.reason = 'cache_usage_observation_failed';
    }
    const result = collectAgentStorage(plan, 512, { budgetMs: 2000 });
    stage('collection');
    try {
      ensureStorageDirectory(root, path.join(root, 'process'));
      writePrivate(observationFile, {
        schemaVersion: 1, generatedAt: plan.generatedAt, homeStorage: plan.homeStorage,
        sharedCachePolicy: plan.sharedCachePolicy, legacyCachePolicy: 'retire-rebuildable-classes',
        npmCaches, diagnostics: plan.diagnostics, maintenance: timing(),
      });
    } catch { /* Optional diagnostic publication never gates reclamation. */ }
    parentPort?.postMessage({
      nativeContent: content, removedBytes: result.removedBytes, migratedBytes: result.migratedBytes,
      shared: result.results.filter(item => item.status === 'shared').length,
      retained: result.results.filter(item => item.status === 'retained').length, ...timing(),
    });
  } catch {
    parentPort?.postMessage({ nativeContent: content, diagnostic: 'storage_collection_deferred', ...timing() });
  }
}

export class StorageMaintenance {
  private worker?: Worker;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private nativeDue: number;
  private inventoryDue: number;
  private readonly diagnostics?: ExecutionDiagnosticSink;
  private readonly dataRoot: string;
  private readonly intervalMs: number;
  private readonly enabled: () => boolean;
  private readonly runtime?: AgentRuntimeUnit;
  constructor(dataRoot: string, options: { initialMs?: number; intervalMs?: number; enabled?: () => boolean; runtime?: AgentRuntimeUnit; diagnostics?: ExecutionDiagnosticSink } = {}) {
    this.dataRoot = dataRoot; this.intervalMs = options.intervalMs ?? 60_000;
    this.enabled = options.enabled ?? (() => true);
    this.runtime = options.runtime;
    this.diagnostics = options.diagnostics;
    const initial = options.initialMs ?? 5000;
    this.nativeDue = this.inventoryDue = Date.now() + initial;
    this.schedule(initial);
  }
  private schedule(delay: number): void {
    if (!this.closed) { this.timer = setTimeout(() => this.start(), delay); this.timer.unref(); }
  }
  private start(): void {
    if (this.closed || this.worker) return;
    if (!this.enabled()) { this.schedule(this.intervalMs); return; }
    const now = Date.now();
    const nativeOnly = this.nativeDue <= this.inventoryDue;
    const due = nativeOnly ? this.nativeDue : this.inventoryDue;
    if (due > now) { this.schedule(Math.ceil(due - now)); return; }
    const interval = nativeOnly ? this.intervalMs : 5 * this.intervalMs;
    let delay = interval;
    const next = () => {
      if (nativeOnly) this.nativeDue = Date.now() + delay;
      else this.inventoryDue = Date.now() + delay;
      this.schedule(Math.max(0, Math.ceil(Math.min(this.nativeDue, this.inventoryDue) - Date.now())));
    };
    try {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { kind: 'agent-storage-maintenance', dataRoot: this.dataRoot, nativeOnly,
          inventoryOnly: !nativeOnly, runtime: nativeOnly ? undefined : this.runtime },
      });
      worker.on('message', message => {
        const cpuDelay = Number.isFinite(message.cpuMs) ? 50 * message.cpuMs : 0;
        const ioDelay = Number.isFinite(message.durationMs) ? 10 * message.durationMs : 0;
        delay = Math.max(delay, cpuDelay, ioDelay);
        this.diagnostics?.({
          event: 'storage-maintenance-pass', phase: nativeOnly ? 'native-content' : 'inventory',
          durationMs: message.durationMs, cpuMs: message.cpuMs, entryCount: message.nativeContent?.inspected,
          code: message.diagnostic ?? message.nativeContent?.diagnostic,
        });
      });
      this.worker = worker;
      worker.unref();
      worker.on('error', () => this.diagnostics?.({ event: 'storage-maintenance-failed' }));
      worker.once('exit', () => { this.worker = undefined; next(); });
    } catch { next(); }
  }

  /** Do not abort an in-flight narrow rename/delete; the worker is unreferenced and drains naturally. */
  close(): void { this.closed = true; clearTimeout(this.timer); }
}
