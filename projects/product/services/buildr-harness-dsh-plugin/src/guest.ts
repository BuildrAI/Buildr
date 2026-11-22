import { DESKTOP_HEADER, handoff, OPEN_PATH } from './handoff.ts';

interface Reservation { lease: string; partition: string }
export interface DesktopBridge {
  acquire(key: string): Promise<Reservation>;
  release(lease: string): Promise<void>;
}
interface Webview extends HTMLElement {
  loadURL(url: string): Promise<void>;
  getURL(): string;
  clearHistory(): void;
}

export function desktopBridge(): DesktopBridge | undefined {
  if (location.origin !== 'dsh-app://app') return undefined;
  const browser = (window as unknown as { dshDesktop?: { browser?: DesktopBridge } }).dshDesktop?.browser;
  return typeof browser?.acquire === 'function' && typeof browser.release === 'function' ? browser : undefined;
}

export function attachHarnessGuest(mount: HTMLElement, bridge: DesktopBridge, onState: (error?: string) => void) {
  const abort = new AbortController();
  let lease: string | undefined;
  let guest: Webview | undefined;
  const release = () => {
    guest?.remove(); guest = undefined;
    const id = lease; lease = undefined;
    if (id) void bridge.release(id).catch(() => {});
  };
  const fail = (code: string) => {
    if (abort.signal.aborted) return;
    abort.abort(); release(); onState(code);
  };
  const timeout = setTimeout(() => fail('harness-timeout'), 55_000);
  const stop = () => { clearTimeout(timeout); abort.abort(); release(); };

  void (async () => {
    const response = await fetch(OPEN_PATH, { method: 'POST', headers: { [DESKTOP_HEADER]: '1' }, cache: 'no-store', signal: abort.signal });
    if (!response.ok) { fail(response.status === 409 ? 'binding-missing' : 'harness-unavailable'); return; }
    const target = handoff(await response.json());
    const reserved = await bridge.acquire(`buildr-harness-dev:${target.endpointId}`);
    if (abort.signal.aborted) { await bridge.release(reserved.lease); return; }
    lease = reserved.lease;
    const view = guest = document.createElement('webview') as Webview;
    view.setAttribute('name', lease);
    view.setAttribute('partition', reserved.partition);
    view.setAttribute('src', `about:blank#${lease}`);
    view.setAttribute('aria-label', 'Buildr Harness Web');
    view.setAttribute('data-sidebar-browser-frame', 'webview');
    Object.assign(view.style, { width: '100%', height: '100%', display: 'flex' });
    let started = false;
    view.addEventListener('dom-ready', () => {
      if (started || abort.signal.aborted) return;
      started = true;
      try { void view.loadURL(target.url).catch(() => fail('harness-navigation')); }
      catch { fail('harness-navigation'); }
    });
    view.addEventListener('did-finish-load', () => {
      if (!started || abort.signal.aborted) return;
      try {
        const here = new URL(view.getURL());
        if (here.origin !== target.origin) return;
        if (here.hash.startsWith('#ticket=')) {
          // If the partition already had a session, no redemption page ran.
          // Drop the ticket with a clean navigation, not a history-bearing tab.
          void view.loadURL(`${target.origin}/`).catch(() => fail('harness-navigation'));
          return;
        }
        view.clearHistory(); clearTimeout(timeout); onState();
      } catch { fail('harness-navigation'); }
    });
    view.addEventListener('render-process-gone', () => fail('harness-navigation'));
    mount.replaceChildren(view);
  })().catch(() => fail('harness-unavailable'));
  return stop;
}
