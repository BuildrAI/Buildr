/**
 * Restart observation: the page is the only recovery surface the old instance
 * leaves behind, so readiness is proven by the same document serving a new
 * session token. Pure logic — tests drive it with a fake fetch and clock.
 */

export type RestartWatchStatus = 'waiting' | 'ready' | 'timed-out' | 'failed';

export type RestartFailure = { code: string; message: string };
export type RestartOperationStatus = { status: 'idle' | 'restarting' | 'failed'; error?: RestartFailure };

export type RestartWatchOptions = {
  url: string;
  previousToken: string | null;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  attempts?: number;
  intervalMs?: number;
  timeoutMs?: number;
  requestTimeoutMs?: number;
  now?: () => number;
  onWaiting?: () => void;
  readStatus?: (signal: AbortSignal) => Promise<RestartOperationStatus>;
  onFailure?: (error: RestartFailure) => void;
  signal?: AbortSignal;
};

/** Bound both fetch and body reads, including collaborators that ignore abort. */
export async function withRestartRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
  { signal, timeoutMs = 1500 }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  let dispose = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    const stop = (reason: unknown) => { controller.abort(reason); reject(reason); };
    const onAbort = () => stop(signal?.reason ?? new DOMException('请求已取消。', 'AbortError'));
    const timer = setTimeout(() => stop(Object.assign(new Error('Buildr Web 请求超过预期时间，请重新连接后查看。'), { code: 'restart_request_timeout' })), Math.max(1, timeoutMs));
    dispose = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return request(controller.signal);
    }), interrupted]);
  } finally {
    dispose();
  }
}

export function sessionTokenOf(html: string): string | null {
  const match = html.match(/<meta\s+name="buildr-session"\s+content="([a-f0-9]+)"\s*\/?>/u);
  return match?.[1] ?? null;
}

async function fetchToken(fetchImpl: typeof fetch, url: string, signal?: AbortSignal): Promise<string | null> {
  const response = await fetchImpl(url, { cache: 'no-store', signal });
  if (!response.ok) return null;
  return sessionTokenOf(await response.text());
}

async function pause(milliseconds: number, signal: AbortSignal, sleep?: RestartWatchOptions['sleep']): Promise<void> {
  if (sleep) return sleep(milliseconds);
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, milliseconds);
    if (signal.aborted) done();
    else signal.addEventListener('abort', done, { once: true });
  });
}

export async function waitForRestart(options: RestartWatchOptions): Promise<RestartWatchStatus> {
  const fetchImpl = options.fetchImpl || fetch;
  const attempts = options.attempts ?? 30;
  const intervalMs = options.intervalMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? Math.max(1000, attempts * intervalMs);
  const requestTimeoutMs = options.requestTimeoutMs ?? 1500;
  const now = options.now || Date.now;
  const deadline = now() + timeoutMs;
  try {
    return await withRestartRequest(async signal => {
      const requestBudget = () => Math.min(requestTimeoutMs, Math.max(1, deadline - now()));
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (signal.aborted || now() >= deadline) return 'timed-out';
        options.onWaiting?.();
        try {
          const token = await withRestartRequest(requestSignal => fetchToken(fetchImpl, options.url, requestSignal), { signal, timeoutMs: requestBudget() });
          if (signal.aborted || now() >= deadline) return 'timed-out';
          if (token && token !== options.previousToken) return 'ready';
        } catch {
          // An unreachable address does not prove whether the successor started.
        }
        if (signal.aborted || now() >= deadline) return 'timed-out';
        if (options.readStatus) {
          try {
            const status = await withRestartRequest(options.readStatus, { signal, timeoutMs: requestBudget() });
            if (signal.aborted || now() >= deadline) return 'timed-out';
            if (status.status === 'failed') {
              options.onFailure?.(status.error || { code: 'web_restart_failed', message: 'Buildr Web 未能完成重启，请重试。' });
              return 'failed';
            }
          } catch {
            // Older servers and a disconnected address may not expose status.
          }
        }
        if (attempt + 1 < attempts && !signal.aborted && now() < deadline) {
          await pause(Math.min(intervalMs, deadline - now()), signal, options.sleep);
        }
      }
      return 'timed-out';
    }, { signal: options.signal, timeoutMs });
  } catch {
    return 'timed-out';
  }
}
