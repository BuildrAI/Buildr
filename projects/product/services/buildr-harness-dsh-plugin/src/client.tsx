import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { attachHarnessGuest, desktopBridge, type DesktopBridge } from './guest.ts';

const PANEL = 'buildr-harness-dev';
const label = () => 'Buildr Harness';
interface Layout {
  selectPanel(id: string | null): void;
  panelInfo: { subscribe(listener: () => void): () => void; getSnapshot(): { activePanelId: string | null } };
}
interface Slots {
  inject(name: string, mount: () => unknown): void;
  register(options: { name: string; key?: string; id?: string; order?: number; label?: () => string; inject?: () => object }, component: unknown): unknown;
}
export const inject = ['slots', 'layout'];

function Mark({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7}>
    <path d="M4 5h16v14H4zM4 9h16M10 9v10m3-6 2 2-2 2" strokeLinejoin="round" strokeLinecap="round" />
  </svg>;
}

const messages: Record<string, string> = {
  'binding-missing': '尚未绑定本机 Harness。请用此开发插件的本机入口重新打开 DSH。',
  'harness-unavailable': '无法连接已绑定的 Harness。请确认安装和运行状态后重试。',
  'harness-timeout': '打开 Harness 超时。请核对当前运行状态后重试。',
  'harness-navigation': 'Harness 网页未能加载。现有对话和执行不受影响。',
};

function Shell({ layout, bridge }: { layout: Layout; bridge: DesktopBridge }) {
  const active = useSyncExternalStore(layout.panelInfo.subscribe, layout.panelInfo.getSnapshot).activePanelId === PANEL;
  const dialog = useRef<HTMLDialogElement>(null);
  const guest = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ ready: boolean; error?: string }>({ ready: false });
  const leave = () => layout.selectPanel(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (active) {
      setOpened(true);
      if (element && !element.open) element.showModal();
    } else if (element?.open) element.close();
  }, [active]);
  useEffect(() => {
    if (!opened || !guest.current) return;
    return attachHarnessGuest(guest.current, bridge, error => setState(error ? { ready: false, error } : { ready: true }));
  }, [attempt, bridge, opened]);
  return <dialog ref={dialog} aria-label="Buildr Harness" onCancel={event => { event.preventDefault(); leave(); }}
    style={{ position: 'fixed', inset: 0, margin: 0, padding: 0, border: 0, width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', background: 'var(--ds-color-bg-base, Canvas)', color: 'CanvasText' }}>
    <div style={{ height: '100%', display: 'grid', gridTemplateRows: '40px minmax(0, 1fr)' }}>
      <header data-window-drag style={{ display: 'flex', alignItems: 'center', gap: 12, paddingInline: '88px 12px', borderBottom: '1px solid color-mix(in srgb, CanvasText 18%, Canvas)', fontSize: 13 }}>
        <button type="button" onClick={leave}>‹ 返回 DSH</button><strong>Buildr Harness</strong>
      </header>
      <main style={{ minWidth: 0, minHeight: 0, position: 'relative' }}>
        <div ref={guest} style={{ position: 'absolute', inset: 0 }} />
        {!state.ready && <div role={state.error ? 'alert' : 'status'} style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', padding: 24, background: 'Canvas', gap: 12 }}>
          <span>{state.error ? messages[state.error] : '正在打开 Buildr Harness…'}</span>
          {state.error && <button type="button" onClick={() => { setState({ ready: false }); setAttempt(n => n + 1); }}>重新打开</button>}
        </div>}
      </main>
    </div>
  </dialog>;
}

export function apply(ctx: { slots: Slots; layout: Layout }) {
  const bridge = desktopBridge();
  if (!bridge) return;
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL, inject: () => ({}) }, () => null));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 10, label }, Mark));
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: PANEL }, () => <Shell layout={ctx.layout} bridge={bridge} />));
}
