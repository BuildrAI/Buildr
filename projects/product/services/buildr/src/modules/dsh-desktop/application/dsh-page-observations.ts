import { randomUUID } from 'node:crypto';

const PAGE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const TASK_PATH = /^\/workspaces\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/tasks\/[a-z0-9](?:[a-z0-9._-]{0,198}[a-z0-9])?$/u;
const failure = (message: string, status = 400) => Object.assign(new Error(message), { code: 'agent_dsh_page_observation_invalid', status });
type Waiting<T> = { finish(value: T): void };
type Page = { watch?: Waiting<string | null>; probe?: Waiting<string | null> & { challengeId: string } };

/** A fresh challenge observes one document now; no tab mapping is accepted as page evidence. */
export class DshPageObservations {
  private readonly pages = new Map<string, Page>();
  private readonly readOrigin: () => string | null;
  private readonly watchMs: number;
  private readonly probeMs: number;
  private closed = false;

  constructor(options: { readOrigin(): string | null; watchMs?: number; probeMs?: number }) {
    this.readOrigin = options.readOrigin;
    this.watchMs = Math.max(1, Math.min(20_000, options.watchMs ?? 20_000));
    this.probeMs = Math.max(1, Math.min(2_000, options.probeMs ?? 2_000));
  }

  private identity(value: string) {
    if (!PAGE_ID.test(value)) throw failure('页面回执身份无效。');
  }

  private waiterCount() {
    return [...this.pages.values()].reduce((sum, page) => sum + Number(Boolean(page.watch)) + Number(Boolean(page.probe)), 0);
  }

  private capacity() {
    if (this.waiterCount() >= 128) throw failure('页面回执等待数量已达上限。', 429);
  }

  private wait(pageId: string, page: Page, key: 'watch' | 'probe', timeout: number, signal?: AbortSignal, challengeId?: string): Promise<string | null> {
    return new Promise(resolve => {
      let done = false;
      const finish = (value: string | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (page[key] === pending) delete page[key];
        if (!page.watch && !page.probe && this.pages.get(pageId) === page) this.pages.delete(pageId);
        resolve(value);
      };
      const abort = () => finish(null);
      const timer = setTimeout(abort, timeout);
      timer.unref();
      const pending = { finish, ...(challengeId ? { challengeId } : {}) };
      if (key === 'probe') page.probe = pending as Page['probe'];
      else page.watch = pending;
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }

  watch(pageId: string, signal?: AbortSignal): Promise<string | null> {
    this.identity(pageId);
    if (this.closed || signal?.aborted) return Promise.resolve(null);
    const page = this.pages.get(pageId) ?? {};
    // The Host may probe immediately after openTab, before this document loads.
    if (page.probe) return Promise.resolve(page.probe.challengeId);
    page.watch?.finish(null);
    this.capacity();
    if (!this.pages.has(pageId) && this.pages.size >= 128) throw failure('页面回执身份数量已达上限。', 429);
    this.pages.set(pageId, page);
    return this.wait(pageId, page, 'watch', this.watchMs, signal);
  }

  probe(pageId: string, signal?: AbortSignal): Promise<string | null> {
    this.identity(pageId);
    if (this.closed || signal?.aborted) return Promise.resolve(null);
    const page = this.pages.get(pageId) ?? {};
    if (page.probe) return Promise.resolve(null);
    // Transfer the watch's slot to this probe before dispatching its challenge.
    const watch = page.watch;
    delete page.watch;
    this.capacity();
    this.pages.set(pageId, page);
    const challengeId = randomUUID();
    const result = this.wait(pageId, page, 'probe', this.probeMs, signal, challengeId);
    watch?.finish(challengeId);
    return result;
  }

  acknowledge(input: { pageId: string; challengeId: string; taskUrl: string | null }): { accepted: boolean } {
    this.identity(input.pageId); this.identity(input.challengeId);
    if (input.taskUrl !== null) {
      const origin = this.readOrigin();
      let valid = false;
      try {
        const url = new URL(input.taskUrl), expected = new URL(origin ?? '');
        valid = input.taskUrl.length <= 512 && url.href === input.taskUrl && url.origin === expected.origin
          && !url.username && !url.password && !url.search && !url.hash && TASK_PATH.test(url.pathname);
      } catch { /* Invalid origins and URLs cannot acknowledge a task page. */ }
      if (!valid) throw failure('页面回执必须是当前 Buildr 的准确任务地址。');
    }
    const pending = this.pages.get(input.pageId)?.probe;
    if (this.closed || !pending || pending.challengeId !== input.challengeId) return { accepted: false };
    pending.finish(input.taskUrl);
    return { accepted: true };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const page of [...this.pages.values()]) { page.watch?.finish(null); page.probe?.finish(null); }
    this.pages.clear();
  }
}
