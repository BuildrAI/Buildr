import { randomUUID } from 'node:crypto';
import type { CodeSourceControlResponse } from './source-control-model.ts';
import { SourceControlWatchers } from '../infrastructure/source-control-watcher.ts';
import { codeFailure } from '../infrastructure/code-file-reader.ts';

export type SourceControlWatchResult = { cursor: string; repositoryIds: string[]; refsRepositoryIds?: string[]; refreshAll: boolean; diagnostics?: string[] };
type Waiter = { finish(): void };
type ReadObservationTicket = { epoch: string; inventoryGeneration: number };
type State = {
  epoch: string; sequence: number; changed: Map<string, number>; refsChanged: Map<string, number>; pending: Set<string>; pendingRefs: Set<string>; fingerprints: Map<string, string>;
  inventoryGeneration: number; inventoryIds?: Set<string>;
  diagnostics: Map<string, Set<string>>; waiters: Set<Waiter>; watchers: SourceControlWatchers;
  batch?: ReturnType<typeof setTimeout>; lastUsed: number;
};

/** One bounded observation per active Workspace, shared by all its documents. */
export class SourceControlObservations {
  private readonly states = new Map<string, State>();
  private readonly waitMs: number;
  private readonly batchMs: number;
  private readonly idleMs: number;
  private readonly reap: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(options: { waitMs?: number; batchMs?: number; idleMs?: number } = {}) {
    this.waitMs = Math.max(1, Math.min(20_000, options.waitMs ?? 20_000));
    this.batchMs = Math.max(1, Math.min(1000, options.batchMs ?? 400));
    this.idleMs = Math.max(1, options.idleMs ?? 60_000);
    this.reap = setInterval(() => {
      for (const [root, state] of this.states) if (!state.waiters.size && Date.now() - state.lastUsed > this.idleMs) this.release(root, state);
    }, Math.min(30_000, this.idleMs));
    this.reap.unref();
  }

  private state(root: string) {
    if (this.closed) throw codeFailure('code_watch_closed', '代码状态观察已关闭。', 503);
    let state = this.states.get(root);
    if (!state) {
      if (this.states.size >= 8) {
        const idle = [...this.states].filter(([, value]) => !value.waiters.size).sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
        if (!idle) throw codeFailure('code_watch_capacity', '代码状态观察数量已达上限。', 429);
        this.release(...idle);
      }
      const created: State = { epoch: randomUUID(), sequence: 0, changed: new Map(), refsChanged: new Map(), pending: new Set(), pendingRefs: new Set(), fingerprints: new Map(), inventoryGeneration: 0, diagnostics: new Map(), waiters: new Set(), lastUsed: Date.now(), watchers: null! };
      created.watchers = new SourceControlWatchers({ changed: (ids, refs) => this.invalidate(created, ids, refs), diagnostic: (id, message) => {
        const messages = created.diagnostics.get(id) ?? new Set<string>(); messages.add(message); created.diagnostics.set(id, messages);
      } });
      state = created; this.states.set(root, state);
    }
    state.lastUsed = Date.now(); return state;
  }

  private invalidate(state: State, repositoryIds: string[], refsChanged = false) {
    if (this.closed || !repositoryIds.length) return;
    for (const id of repositoryIds) state.pending.add(id);
    if (refsChanged) for (const id of repositoryIds) state.pendingRefs.add(id);
    // Fixed from the first event: continuous writes cannot postpone delivery indefinitely.
    state.batch ??= setTimeout(() => {
      state.batch = undefined; state.sequence++;
      for (const id of state.pending) state.changed.set(id, state.sequence);
      for (const id of state.pendingRefs) state.refsChanged.set(id, state.sequence);
      state.pending.clear(); state.pendingRefs.clear();
      if (state.changed.size > 256) { state.epoch = randomUUID(); state.sequence = 0; state.changed.clear(); state.refsChanged.clear(); }
      for (const waiter of [...state.waiters]) waiter.finish();
    }, this.batchMs);
    state.batch.unref();
  }

  private retainRepositories(state: State, ids: Set<string>) {
    for (const id of state.fingerprints.keys()) if (!ids.has(id)) {
      state.watchers.remove(id); state.fingerprints.delete(id); state.diagnostics.delete(id); this.invalidate(state, [id], true);
    }
  }

  async observeInventory(root: string, inventory: CodeSourceControlResponse) {
    if (inventory.coverage.truncated || inventory.coverage.nextCursor !== null) return;
    const state = this.states.get(root);
    // Complete registration IDs can retire sources; pending status cannot replace
    // verified checkout facts or allocate new filesystem observations.
    if (state) {
      state.inventoryGeneration++;
      state.inventoryIds = new Set(inventory.repositories.map(repository => repository.id));
      this.retainRepositories(state, state.inventoryIds);
    }
  }

  /** Reserve bounded observation identity without letting availability gate the authoritative read. */
  beginRead(root: string): ReadObservationTicket | undefined {
    try {
      const state = this.state(root);
      return { epoch: state.epoch, inventoryGeneration: state.inventoryGeneration };
    } catch { return undefined; }
  }

  async observe(root: string, result: CodeSourceControlResponse, partial = false, ticket?: ReadObservationTicket) {
    const state = ticket ? this.states.get(root) : this.state(root);
    if (!state || (ticket && ticket.epoch !== state.epoch)) return;
    const newerInventory = ticket !== undefined && ticket.inventoryGeneration !== state.inventoryGeneration;
    const repositories = result.repositories.slice(0, 128);
    let remainingLocations = 128;
    if (!partial && !newerInventory) this.retainRepositories(state, new Set(repositories.map(value => value.id)));
    await Promise.all(repositories.map(async repository => {
      // A completed Worker response may arrive after registration retirement.
      // Only those older requests are fenced; fresh scoped reads can discover new registrations.
      if (newerInventory && state.inventoryIds && !state.inventoryIds.has(repository.id)) return;
      const candidates = [...new Set([repository.location, ...repository.worktrees.map(value => value.location)].filter(Boolean))];
      const locations = candidates.slice(0, remainingLocations); remainingLocations -= locations.length;
      const fingerprint = JSON.stringify([repository.gitId, locations, repository.worktrees.map(value => value.worktreeId)]);
      const sourcesChanged = state.fingerprints.get(repository.id) !== fingerprint;
      if (state.fingerprints.get(repository.id) === fingerprint && !state.watchers.needsRetry(repository.id)) return;
      state.fingerprints.set(repository.id, fingerprint); state.diagnostics.delete(repository.id);
      if (locations.length < candidates.length) state.diagnostics.set(repository.id, new Set(['部分目录超出监听预算，将通过低频核对补偿变化。']));
      const rebound = await state.watchers.update(repository.id, locations);
      // Covers the interval between the authoritative read and attaching a new watcher.
      // Repeated unchanged failures must not trigger another read/retry/invalidate cycle.
      if (this.states.get(root) === state && (sourcesChanged || rebound)) this.invalidate(state, [repository.id], sourcesChanged);
    }));
  }

  async watch(root: string, cursor?: string, signal?: AbortSignal): Promise<SourceControlWatchResult> {
    const state = this.state(root);
    const match = cursor?.match(/^([a-f0-9-]{36}):(\d+)$/);
    const sequence = match && match[1] === state.epoch ? Number(match[2]) : -1;
    const refreshAll = () => match?.[1] !== state.epoch || !Number.isSafeInteger(sequence) || sequence < 0 || sequence > state.sequence;
    const result = (): SourceControlWatchResult => ({ cursor: state.epoch + ':' + state.sequence,
      repositoryIds: refreshAll() ? [] : [...state.changed].filter(([, value]) => value > sequence).map(([id]) => id), refreshAll: refreshAll(),
      refsRepositoryIds: refreshAll() ? [] : [...state.refsChanged].filter(([, value]) => value > sequence).map(([id]) => id),
      diagnostics: [...new Set([...state.diagnostics.values()].flatMap(messages => [...messages]))],
    });
    if (refreshAll() || signal?.aborted || [...state.changed.values()].some(value => value > sequence)) return result();
    if ([...this.states.values()].reduce((total, value) => total + value.waiters.size, 0) >= 128) throw codeFailure('code_watch_capacity', '代码状态等待数量已达上限。', 429);
    await new Promise<void>(resolve => {
      let done = false;
      const waiter: Waiter = { finish: () => {
        if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', waiter.finish); state.waiters.delete(waiter); state.lastUsed = Date.now(); resolve();
      } };
      const timer = setTimeout(waiter.finish, this.waitMs); timer.unref();
      state.waiters.add(waiter); signal?.addEventListener('abort', waiter.finish, { once: true });
      if (signal?.aborted) waiter.finish();
    });
    return result();
  }

  private release(root: string, state: State) {
    if (state.batch) clearTimeout(state.batch);
    state.watchers.close(); for (const waiter of [...state.waiters]) waiter.finish(); this.states.delete(root);
  }

  close() {
    if (this.closed) return;
    this.closed = true; clearInterval(this.reap);
    for (const [root, state] of this.states) this.release(root, state);
  }
}
