import type { CodeSourceControlResponse, CodeSourceControlWatchResponse } from './api/code-api';
import { createSourceControlCatalog } from './source-control-catalog.ts';
import { subscribeSourceControlChanges, type SourceControlChangeNotice } from './source-control-events.ts';
import type { SourceControlProgress } from './source-control-refresh';

type Catalog = ReturnType<typeof createSourceControlCatalog>;
type Options = {
  workspaceId: string;
  load(taskId: string | undefined, repositoryId: string | undefined, signal: AbortSignal, onProgress?: SourceControlProgress, shared?: boolean): Promise<CodeSourceControlResponse>;
  watch(cursor: string | undefined, signal: AbortSignal): Promise<CodeSourceControlWatchResponse>;
  subscribe?(listener: (notice: SourceControlChangeNotice) => void): () => void;
  cache?: {read(): CodeSourceControlResponse | null; write(data: CodeSourceControlResponse): void};
  debounceMs?: number; fallbackMs?: number; retryMs?: number; concurrency?: number; initialDelayMs?: number;
};
type Job = {scope: string; repositoryId?: string; catalog: Catalog};
const jobKey = (scope: string, repositoryId?: string) => JSON.stringify([scope, repositoryId || '']);

/** One workspace owns observation, coalescing and reconnects. Consumers never start their own poll. */
export function createSourceControlObserver(options: Options) {
  const catalogs = new Map<string, {catalog: Catalog; users: number}>();
  const queued = new Map<string, Job>(), running = new Map<string, Job>();
  const listeners = new Set<() => void>();
  const debounceMs = options.debounceMs ?? 180, fallbackMs = options.fallbackMs ?? 120000;
  const concurrency = Math.max(1, options.concurrency ?? 2);
  let started = false, visible = true, disposed = false, cursor: string | undefined;
  let initialNotBefore = 0;
  let scheduled: ReturnType<typeof setTimeout> | undefined, fallback: ReturnType<typeof setTimeout> | undefined;
  let watchController: AbortController | undefined, unsubscribe: (() => void) | undefined;
  let state = {diagnostics: [] as string[]};
  function diagnostics(values: string[]) {
    if (JSON.stringify(values) === JSON.stringify(state.diagnostics)) return;
    state = {diagnostics: values}; for (const listener of listeners) listener();
    scheduleFallback();
  }
  function getCatalog(taskId = '') {
    let entry = catalogs.get(taskId);
    if (!entry) {
      entry = {catalog: createSourceControlCatalog((repositoryId, signal, onProgress, shared) => options.load(taskId || undefined, repositoryId, signal, onProgress, shared), taskId ? null : options.cache?.read()), users: 0};
      catalogs.set(taskId, entry);
    }
    return entry.catalog;
  }
  const defaultCatalog = getCatalog();
  let cacheTimer: ReturnType<typeof setTimeout> | undefined;
  let cachedData = defaultCatalog.snapshot().data;
  const saveCache = () => {
    clearTimeout(cacheTimer); cacheTimer = undefined;
    const snapshot = defaultCatalog.snapshot();
    if (snapshot.data && snapshot.selectionReady && !snapshot.error && !Object.keys(snapshot.repositoryErrors).length && !snapshot.cachedRepositoryIds?.length && !snapshot.data.repositories.some(repository => repository.diagnostics.some(item => item.code === 'code_source_control_stale')) && snapshot.data !== cachedData) {
      options.cache?.write(snapshot.data); cachedData = snapshot.data;
    }
  };
  const stopSharing = defaultCatalog.subscribe(() => {
    const snapshot = defaultCatalog.snapshot();
    for (const [scope, entry] of catalogs) if (scope) entry.catalog.adopt(snapshot);
    if (options.cache && snapshot.data !== cachedData && snapshot.selectionReady && !snapshot.cachedRepositoryIds?.length && !cacheTimer) cacheTimer = setTimeout(saveCache, 250);
  });
  function scheduleDrain() {
    if (started && visible && !scheduled && !disposed) {
      const delay = defaultCatalog.snapshot().data ? debounceMs : Math.max(debounceMs, initialNotBefore - Date.now());
      scheduled = setTimeout(drain, delay);
    }
  }
  function drain() {
    scheduled = undefined;
    if (!started || !visible || disposed) return;
    while (true) {
      // A full progressive job can wait on a slow repository while a completed peer needs a
      // new read. Bound full and local jobs separately so two initializing scopes cannot
      // occupy every local slot. Actual Git I/O still uses the host's two read workers.
      const next = [...queued].find(([, job]) => {
        const peers = [...running.values()];
        return peers.filter(other => Boolean(other.repositoryId) === Boolean(job.repositoryId)).length < concurrency &&
          !peers.some(other => other.scope === job.scope && other.repositoryId === job.repositoryId);
      });
      if (!next) break;
      const [key, job] = next; queued.delete(key); running.set(key, job);
      void job.catalog.check(job.repositoryId).finally(() => { if (job.scope) job.catalog.adopt(defaultCatalog.snapshot()); running.delete(key); drain(); });
    }
  }
  function enqueue(scope: string, repositoryId?: string) {
    if (disposed) return;
    const catalog = getCatalog(scope);
    // The first observation must establish a complete catalog before partial results can merge.
    const target = catalog.snapshot().data ? repositoryId : undefined;
    if (!target) for (const [key, job] of queued) { if (job.scope === scope) queued.delete(key); }
    else if (queued.has(jobKey(scope)) && !running.has(jobKey(scope))) return;
    queued.set(jobKey(scope, target), {scope, repositoryId: target, catalog});
    scheduleDrain();
  }
  function check(taskId?: string, repositoryIds?: string[]) {
    const scope = taskId || '';
    if (scope && !getCatalog(scope).snapshot().data) enqueue(scope);
    if (repositoryIds?.length) for (const repositoryId of new Set(repositoryIds)) enqueue('', repositoryId);
    else enqueue('');
  }
  function checkAll(repositoryIds?: string[]) {
    check(undefined, repositoryIds);
  }
  function invalidateRefs(repositoryIds?: string[]) {
    for (const entry of catalogs.values()) entry.catalog.invalidateRefs(repositoryIds || entry.catalog.snapshot().data?.repositories.map(repository => repository.id) || []);
  }
  function reconcile(taskId?: string) {
    if (state.diagnostics.length) invalidateRefs();
    const scope = taskId || '';
    if (queued.has(jobKey(scope)) || running.has(jobKey(scope))) return;
    check(taskId);
  }
  function scheduleFallback() {
    clearTimeout(fallback);
    if (!started || !visible || disposed) return;
    // Ref-only changes may leave the working-tree digest unchanged. The infrequent safety check
    // also invalidates active branch/history readers; ordinary file notices never do this.
    fallback = setTimeout(() => { invalidateRefs(); checkAll(); scheduleFallback(); }, state.diagnostics.length ? Math.min(fallbackMs, 30000) : fallbackMs);
  }
  const wait = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms); signal.addEventListener('abort', finish, {once: true});
  });
  async function watch(signal: AbortSignal) {
    let retry = options.retryMs ?? 1000, reconnect = false;
    while (!signal.aborted && !disposed && visible) {
      const began = Date.now();
      try {
        const value = await options.watch(cursor, signal);
        if (signal.aborted || disposed) return;
        const advanced = value.cursor !== cursor;
        cursor = value.cursor;
        if (advanced && value.refsRepositoryIds?.length) invalidateRefs(value.refsRepositoryIds);
        diagnostics(value.diagnostics || []);
        if (value.refreshAll || reconnect) { invalidateRefs(); checkAll(); }
        else if (value.repositoryIds.length) checkAll(value.repositoryIds);
        reconnect = false; retry = options.retryMs ?? 1000;
        // A healthy server holds empty requests. Protect against an immediate empty response loop.
        if (!value.refreshAll && !value.repositoryIds.length && Date.now() - began < 250) await wait(250, signal);
      } catch {
        if (signal.aborted || disposed) return;
        diagnostics(['自动更新暂时中断，保留上次读取结果；正在重新连接。']);
        reconnect = true;
        await wait(retry, signal); retry = Math.min(retry * 2, 10000);
      }
    }
  }
  function resumeWatch() {
    if (!started || !visible || disposed || watchController) return;
    const controller = new AbortController(); watchController = controller;
    void watch(controller.signal).finally(() => { if (watchController === controller) watchController = undefined; });
  }
  function setVisible(next: boolean) {
    if (disposed || visible === next) return;
    visible = next;
    if (visible) { reconcile(); resumeWatch(); scheduleFallback(); }
    else { watchController?.abort(); watchController = undefined; clearTimeout(scheduled); scheduled = undefined; clearTimeout(fallback); }
  }
  return {
    catalog: getCatalog,
    snapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    retain(taskId?: string) {
      const scope = taskId || ''; getCatalog(scope); catalogs.get(scope)!.users++;
      // A code view needs observations now; navigation badges can wait for the
      // initial page to finish. Retaining before start is covered by users below.
      if (started && !defaultCatalog.snapshot().data && initialNotBefore > Date.now()) {
        initialNotBefore = 0; clearTimeout(scheduled); scheduled = undefined;
        scheduleDrain();
      }
      if (!catalogs.get(scope)!.catalog.snapshot().data && !queued.has(jobKey(scope)) && !running.has(jobKey(scope))) enqueue(scope);
      return () => {
        const entry = catalogs.get(scope); if (!entry) return;
        entry.users--;
        if (scope && entry.users === 0) {
          for (const [key, job] of queued) if (job.scope === scope) queued.delete(key);
          entry.catalog.dispose(); catalogs.delete(scope);
        }
      };
    },
    check,
    checkAll,
    reconcile,
    refresh: (repositoryId?: string) => {
      queued.delete(jobKey('', repositoryId));
      return defaultCatalog.refresh(repositoryId);
    },
    setVisible,
    start(initialVisible = true) {
      if (started || disposed) return;
      started = true; visible = initialVisible;
      initialNotBefore = Date.now() + ([...catalogs.values()].some(entry => entry.users > 0) ? 0 : Math.max(0, options.initialDelayMs ?? 0));
      unsubscribe = (options.subscribe || subscribeSourceControlChanges)(notice => {
        if (notice.workspaceId !== options.workspaceId) return;
        const ids = notice.repositoryIds?.length ? notice.repositoryIds : notice.repositoryId ? [notice.repositoryId] : undefined;
        if (notice.result) for (const entry of catalogs.values()) entry.catalog.confirmBranchSwitch(notice.repositoryId, notice.result);
        if (notice.cause !== 'file-save') for (const entry of catalogs.values()) entry.catalog.invalidateRefs(ids || entry.catalog.snapshot().data?.repositories.map(repository => repository.id) || []);
        // Explicit batch operations already cover their observed catalog. Reconcile once;
        // ordinary filesystem and save notices remain scoped to affected repositories.
        checkAll(notice.repositoryIds && notice.repositoryIds.length > 1 ? undefined : ids);
      });
      checkAll(); resumeWatch(); scheduleFallback();
    },
    dispose() {
      disposed = true; watchController?.abort(); unsubscribe?.();
      clearTimeout(scheduled); clearTimeout(fallback); queued.clear();
      saveCache();
      stopSharing();
      for (const entry of catalogs.values()) entry.catalog.dispose();
      catalogs.clear(); listeners.clear();
    },
  };
}
export type SourceControlObserver = ReturnType<typeof createSourceControlObserver>;
