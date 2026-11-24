import { label, panelId, released } from './channel.ts';
import { CHANNEL, parseGuestMessage, type GuestMessage, type Tool } from './workspace.ts';
import { DESKTOP_HEADER, handoff, OPEN_PATH } from './handoff.ts';
import { openImagePreview, parsePreviewImage } from './image-preview.ts';
import type { DesktopKeyboardInput } from './refresh.ts';

interface Reservation { lease: string; partition: string }
export interface DesktopBridge {
  acquire(key: string): Promise<Reservation>;
  release(lease: string): Promise<void>;
}
export interface DesktopKeyboardBridge {
  subscribe(listener: (input: DesktopKeyboardInput) => void): () => void;
}
interface Webview extends HTMLElement {
  loadURL(url: string): Promise<void>;
  getURL(): string;
  clearHistory(): void;
  executeJavaScript(script: string): Promise<unknown>;
}

export function desktopBridge(): DesktopBridge | undefined {
  if (location.origin !== 'dsh-app://app') return undefined;
  const browser = (window as unknown as { dshDesktop?: { browser?: DesktopBridge } }).dshDesktop?.browser;
  return typeof browser?.acquire === 'function' && typeof browser.release === 'function' ? browser : undefined;
}

export function desktopKeyboard(): DesktopKeyboardBridge | undefined {
  if (location.origin !== 'dsh-app://app') return undefined;
  const keyboard = (window as unknown as { dshDesktop?: { keyboard?: DesktopKeyboardBridge } }).dshDesktop?.keyboard;
  return typeof keyboard?.subscribe === 'function' ? keyboard : undefined;
}

export function isTrustedGuestUrl(currentUrl: string, expectedOrigin: string, modeHash: string, hasTool: boolean): boolean {
  try {
    const current = new URL(currentUrl);
    if (current.origin !== expectedOrigin) return false;
    if (hasTool) return current.pathname === '/' && !current.search && current.hash === modeHash;
    return !current.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

export function isTrustedGuestScriptSource(sourceId: string | undefined, expectedOrigin: string, isReleased: boolean): boolean {
  if (!sourceId) return false;
  try {
    const source = new URL(sourceId);
    if (source.origin !== expectedOrigin) return false;
    if (/^\/assets\/[^/]+\.js$/i.test(source.pathname)) return true;
    if (!isReleased && /^\/(?:src|@fs)\/.+\.(?:[jt]sx?|mjs)$/i.test(source.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

export function attachDevelopmentGuest(mount: HTMLElement, bridge: DesktopBridge, onState: (error?: string) => void, options?: {
  tool?: { kind: Tool; workspaceId: string };
  onMessage?: (message: GuestMessage) => void;
  canPreviewImage?: () => boolean;
  onControl?: (send: (data: object) => void) => void;
  onRefresh?: (handle: { lease: string; reload: () => void } | undefined) => void;
}) {
  const abort = new AbortController();
  let lease: string | undefined;
  let guest: Webview | undefined;
  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  let closePreview: (() => void) | undefined;
  let previewSequence = 0;
  const dismissPreview = () => { ++previewSequence; closePreview?.(); closePreview = undefined; };
  const release = () => {
    dismissPreview();
    options?.onRefresh?.(undefined);
    if (probeTimer) clearTimeout(probeTimer);
    guest?.remove(); guest = undefined;
    const id = lease; lease = undefined;
    if (id) void bridge.release(id).catch(() => {});
  };
  const fail = (code: string) => {
    if (abort.signal.aborted) return;
    abort.abort(); release(); onState(code);
  };
  const timeout = setTimeout(() => fail('development-timeout'), 55_000);
  const stop = () => { clearTimeout(timeout); abort.abort(); release(); };

  void (async () => {
    const response = await fetch(OPEN_PATH, { method: 'POST', headers: { [DESKTOP_HEADER]: '1' }, cache: 'no-store', signal: abort.signal });
    if (!response.ok) {
      const error = response.status === 409 ? await response.json().catch(() => null) : null;
      fail(typeof error?.code === 'string' ? error.code : 'development-unavailable');
      return;
    }
    const target = handoff(await response.json());
    const reserved = await bridge.acquire(`${panelId}:${target.endpointId}`);
    if (abort.signal.aborted) { await bridge.release(reserved.lease); return; }
    lease = reserved.lease;
    const view = guest = document.createElement('webview') as Webview;
    view.setAttribute('name', lease);
    view.setAttribute('partition', reserved.partition);
    view.setAttribute('src', `about:blank#${lease}`);
    view.setAttribute('aria-label', `${label} Web`);
    view.setAttribute('data-sidebar-browser-frame', 'webview');
    Object.assign(view.style, { width: '100%', height: '100%', display: 'flex' });
    const destination = new URL(target.url);
    const mode = new URLSearchParams({ dsh: options?.tool?.kind ?? 'development' });
    if (options?.tool) mode.set('workspace', options.tool.workspaceId);
    const modeHash = '#' + mode;
    destination.hash = mode.toString();

    const isTrusted = () => isTrustedGuestUrl(view.getURL(), destination.origin, modeHash, Boolean(options?.tool));
    const send = (data: object) => {
      if (!abort.signal.aborted && isTrusted()) {
        const detail = JSON.stringify(JSON.stringify(data));
        void view.executeJavaScript(`window.dispatchEvent(new CustomEvent('buildr-dsh-host', {detail:JSON.parse(${detail})}))`).catch(() => {});
      }
    };
    view.addEventListener('console-message', event => {
      const { message, sourceId } = event as Event & { message?: string; sourceId?: string };
      if (abort.signal.aborted || !message?.startsWith(CHANNEL) || !isTrusted()) return;
      if (!isTrustedGuestScriptSource(sourceId, target.origin, released)) return;
      const request = parseGuestMessage(message);
      if (request?.kind === 'image-preview') {
        if (!options?.canPreviewImage?.() || options.tool) { send({ imagePreview: { id: request.id, opened: false } }); return; }
        dismissPreview();
        const sequence = previewSequence;
        void (async () => {
          let opened = false;
          try {
            const payload = await view.executeJavaScript(`(() => {
              const detail = { id: ${JSON.stringify(request.id)} };
              window.dispatchEvent(new CustomEvent('buildr-dsh-read-preview', { detail }));
              return detail.image;
            })()`);
            if (abort.signal.aborted || previewSequence !== sequence || !isTrusted() || !options.canPreviewImage?.()) return;
            const image = parsePreviewImage(payload, Date.now());
            if (image) { closePreview = openImagePreview(image, view); opened = true; }
          } catch { /* Keep the existing guest preview if the host cannot present it. */ }
          if (previewSequence === sequence) send({ imagePreview: { id: request.id, opened } });
        })();
        return;
      }
      if (!request) return;
      if (options?.tool && request.kind === 'tool-ready') ready(true);
      if (!options?.tool || request.kind === 'reveal' || request.kind === 'link' || request.kind === 'tool-ready') options?.onMessage?.(request);
    });
    let started = false;
    view.addEventListener('dom-ready', () => {
      if (started || abort.signal.aborted) return;
      started = true;
      try { void view.loadURL(destination.href).catch(() => fail('development-navigation')); }
      catch { fail('development-navigation'); }
    });
    let watching = false;
    let refreshing = false;
    const reload = () => {
      if (!isTrusted() || refreshing || abort.signal.aborted) return;
      refreshing = true;
      void view.executeJavaScript('location.reload()').catch(() => {}).finally(() => { refreshing = false; });
    };
    const probe = async () => {
      if (!isTrusted() || abort.signal.aborted) return;
      let keepWatching = true;
      try {
        const state = await view.executeJavaScript(`(async () => {
          if (window.__buildrDshEdited === true) return 'edited';
          const bundle = d => [...d.querySelectorAll('script[src],link[rel="stylesheet"][href]')]
            .map(e => e.getAttribute('src') || e.getAttribute('href')).filter(v => v && v.startsWith('/assets/')).sort().join('\\n');
          const current = bundle(document);
          if (!current) return 'unknown';
          const response = await fetch('/', {cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(3000)});
          if (!response.ok || response.redirected) return 'unknown';
          const next = bundle(new DOMParser().parseFromString(await response.text(),'text/html'));
          if (!next || next === current) return 'unchanged';
          if (window.__buildrDshEdited !== false || !!document.querySelector('dialog[open], [aria-modal="true"]')) return 'defer';
          location.reload();
          return 'adopting';
        })()`);
        if (state === 'edited') { watching = false; keepWatching = false; }
      } catch { /* The incumbent page stays usable during a backend handoff. */ }
      finally { if (keepWatching && !abort.signal.aborted) probeTimer = setTimeout(() => { void probe(); }, 8000); }
    };
    const ready = (toolReady = false) => {
      if (!abort.signal.aborted && isTrusted()) {
        if (!released) {
          void view.executeJavaScript(`if (window.__buildrDshEdited === undefined) {
            window.__buildrDshEdited = false;
            for (const type of ['beforeinput','input','change','compositionstart','drop','paste','keydown','pointerdown'])
              document.addEventListener(type, () => { window.__buildrDshEdited = true; }, true);
          }`).catch(() => {});
          if (!watching) { watching = true; probeTimer = setTimeout(() => { void probe(); }, 8000); }
        }
        if (!options?.tool || toolReady) {
          view.clearHistory();
          clearTimeout(timeout);
          onState();
        }
        options?.onControl?.(send);
        options?.onRefresh?.({ lease: reserved.lease, reload });
      }
    };
    view.addEventListener('did-start-navigation', dismissPreview);
    view.addEventListener('did-navigate-in-page', () => ready());
    view.addEventListener('did-navigate', () => { if (!options?.tool && isTrusted()) ready(); });
    view.addEventListener('did-finish-load', () => {
      if (!started || abort.signal.aborted) return;
      try {
        if (isTrusted()) { ready(); return; }
        const here = new URL(view.getURL());
        if (here.origin === target.origin && here.pathname === '/' && !here.search) {
          void view.executeJavaScript(`if(document.getElementById('root')) location.replace(${JSON.stringify(modeHash)})`).catch(() => {});
        }
      } catch { fail('development-navigation'); }
    });
    view.addEventListener('render-process-gone', () => fail('development-navigation'));
    mount.replaceChildren(view);
  })().catch(() => fail('development-unavailable'));
  return stop;
}
