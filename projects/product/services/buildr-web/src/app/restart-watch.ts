/**
 * Restart observation: the page is the only recovery surface the old instance
 * leaves behind, so readiness is proven by the same document serving a new
 * session token. Pure logic — tests drive it with a fake fetch and clock.
 */

export type RestartWatchStatus = 'waiting' | 'ready' | 'timed-out';

export type RestartWatchOptions = {
  url: string;
  previousToken: string | null;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  attempts?: number;
  intervalMs?: number;
  onWaiting?: () => void;
  signal?: AbortSignal;
};

export function sessionTokenOf(html: string): string | null {
  const match = html.match(/<meta\s+name="buildr-session"\s+content="([a-f0-9]+)"\s*\/?>/u);
  return match?.[1] ?? null;
}

async function fetchToken(fetchImpl: typeof fetch, url: string, signal?: AbortSignal): Promise<string | null> {
  const response = await fetchImpl(url, { cache: 'no-store', signal });
  if (!response.ok) return null;
  return sessionTokenOf(await response.text());
}

export async function waitForRestart(options: RestartWatchOptions): Promise<RestartWatchStatus> {
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const attempts = options.attempts ?? 30;
  const intervalMs = options.intervalMs ?? 1000;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.signal?.aborted) return 'timed-out';
    options.onWaiting?.();
    try {
      const token = await fetchToken(fetchImpl, options.url, options.signal);
      if (token && token !== options.previousToken) return 'ready';
    } catch {
      // The old process refuses connections while it stops; keep watching.
    }
    await sleep(intervalMs);
  }
  return 'timed-out';
}
