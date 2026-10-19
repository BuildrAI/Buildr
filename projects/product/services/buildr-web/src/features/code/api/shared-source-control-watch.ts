import type { CodeSourceControlWatchResponse } from './code-api';

type Watch = (workspaceId: string, cursor?: string, signal?: AbortSignal) => Promise<CodeSourceControlWatchResponse>;
type Channel = Pick<BroadcastChannel, 'postMessage' | 'close' | 'addEventListener' | 'removeEventListener'>;
type Ports = { locks?: Pick<LockManager, 'request'>; channel?: (name: string) => Channel };
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
function isResult(value: unknown): value is CodeSourceControlWatchResponse {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return typeof result.cursor === 'string' && typeof result.refreshAll === 'boolean' && strings(result.repositoryIds)
    && (result.refsRepositoryIds === undefined || strings(result.refsRepositoryIds))
    && (result.diagnostics === undefined || strings(result.diagnostics));
}

// HTTP/1.1 has a small per-origin connection pool. Share the pending watch across
// documents as well as the backend observation, so idle tabs cannot fill it.
// Only identical cursors share a reply: a newer cursor could omit older changes.
export function createSharedSourceControlWatch(load: Watch, ports: Ports = {
  locks: globalThis.navigator?.locks,
  channel: typeof BroadcastChannel === 'function' ? name => new BroadcastChannel(name) : undefined,
}): Watch {
  return (workspaceId, cursor, signal = new AbortController().signal) => {
    if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    if (!ports.locks || !ports.channel) return load(workspaceId, cursor, signal);
    const key = 'buildr.source-control-watch.v1:' + workspaceId;
    let channel: Channel;
    try { channel = ports.channel(key); } catch { return load(workspaceId, cursor, signal); }
    const queue = new AbortController();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (value?: CodeSourceControlWatchResponse, error?: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        channel.removeEventListener('message', receive);
        channel.close();
        queue.abort();
        if (error !== undefined) reject(error); else resolve(value!);
      };
      const abort = () => finish(undefined, signal.reason ?? new DOMException('Aborted', 'AbortError'));
      const receive = (event: MessageEvent) => {
        const message = event.data;
        if (message?.kind === 'result' && message.from === (cursor ?? null) && isResult(message.value)) finish(message.value);
      };
      channel.addEventListener('message', receive);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      void ports.locks!.request(key, { signal: queue.signal }, async () => {
        // A previous holder's broadcast may still be queued when its lock is
        // released. Process it before issuing another identical HTTP request.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (settled) return;
        const value = await load(workspaceId, cursor, queue.signal);
        if (settled) return;
        channel.postMessage({ kind: 'result', from: cursor ?? null, value });
        finish(value);
      }).catch(error => finish(undefined, error));
    });
  };
}
