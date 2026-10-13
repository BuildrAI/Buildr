import { createApiClient, type ApiClient } from '../api/client.ts';
import { LocalSessionAdapter, readSessionTokenFromDocument } from '../api/LocalSessionAdapter.ts';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const TASK_PATH = /^\/workspaces\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/tasks\/[a-z0-9](?:[a-z0-9._-]{0,198}[a-z0-9])?$/u;

export function readDshPageId(href: string): string | null {
  try {
    const values = new URL(href).searchParams.getAll('buildrDshPage');
    return values.length === 1 && UUID.test(values[0]) ? values[0] : null;
  } catch { return null; }
}

/** Read the actual location for each challenge, after any same-document navigation. */
export function readDshTaskPage(href: string, origin: string): string | null {
  try {
    const url = new URL(href);
    return url.origin === origin && !url.username && !url.password && TASK_PATH.test(url.pathname) ? url.origin + url.pathname : null;
  } catch { return null; }
}

/** This nonce belongs to this document only; it never persists a task or a tab claim. */
export function startDshPageObservation(browser: Window = window, client?: ApiClient): () => void {
  const pageId = readDshPageId(browser.location.href);
  if (!pageId) return () => {};
  const origin = browser.location.origin;
  const api = client ?? createApiClient({ sessionAdapter: new LocalSessionAdapter(() => readSessionTokenFromDocument(browser.document)), getWorkspaceId: () => null });
  const controller = new AbortController();
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryResolve: (() => void) | undefined;
  const stop = () => {
    controller.abort();
    clearTimeout(retryTimer); retryResolve?.();
    browser.removeEventListener('pagehide', stop);
  };
  browser.addEventListener('pagehide', stop, { once: true });
  const retry = () => new Promise<void>(resolve => {
    retryResolve = resolve;
    retryTimer = setTimeout(() => { retryResolve = undefined; resolve(); }, 1000);
  });
  void (async () => {
    while (!controller.signal.aborted) {
      try {
        const result = await api(`/api/v1/app/dsh/pages/watch?pageId=${pageId}`, { signal: controller.signal }) as { challengeId?: unknown };
        if (controller.signal.aborted) break;
        if (result?.challengeId === null) continue;
        if (typeof result?.challengeId !== 'string' || !UUID.test(result.challengeId)) throw new Error('页面回执挑战无效。');
        await api('/api/v1/app/dsh/pages/ack', { method: 'POST', signal: controller.signal, body: JSON.stringify({ pageId, challengeId: result.challengeId, taskUrl: readDshTaskPage(browser.location.href, origin) }) });
      } catch {
        if (!controller.signal.aborted) await retry();
      }
    }
  })();
  return stop;
}
