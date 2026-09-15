import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { CloseOutlined } from '@ant-design/icons';
import type { WorkspacePageTab } from './workspace-pages';

type Drag = { key: string; start: number; x: number; left: number; top: number; width: number; height: number; moved: boolean };
type Props = { tabs: WorkspacePageTab[]; onClose: (key: string) => void; onReorder: (key: string, index: number) => void };
export function PageTabStrip({ tabs, onClose, onReorder }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const strip = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const positions = useRef(new Map<string, number>());
  const suppressed = useRef(false);
  const cleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [landing, setLanding] = useState(false);
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => () => { if (cleanupTimer.current) clearTimeout(cleanupTimer.current); }, []);
  useLayoutEffect(() => {
    strip.current?.querySelectorAll<HTMLElement>('[data-page-tab]').forEach((node) => {
      const key = node.dataset.pageTab!;
      const previous = positions.current.get(key);
      const left = node.getBoundingClientRect().left;
      if (dragRef.current?.moved && key !== dragRef.current.key && previous !== undefined && previous !== left && !reduced()) {
        node.getAnimations().forEach((a) => a.cancel());
        node.animate([{ transform: `translateX(${previous - left}px)` }, { transform: 'translateX(0)' }], { duration: 150, easing: 'ease-out' });
      }
      positions.current.set(key, left);
    });
  }, [tabs]);

  function start(event: PointerEvent, tab: WorkspacePageTab) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.pane-tab-x')) return;
    if (cleanupTimer.current) clearTimeout(cleanupTimer.current);
    setLanding(false);
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = { key: tab.key, start: event.clientX, x: event.clientX, left: rect.left, top: rect.top, width: rect.width, height: rect.height, moved: false };
  }
  function move(event: PointerEvent) {
    const current = dragRef.current;
    if (!current) return;
    if (!current.moved && Math.abs(event.clientX - current.start) < 5) return;
    if (!current.moved) strip.current?.setPointerCapture(event.pointerId);
    const next = { ...current, x: event.clientX, moved: true };
    dragRef.current = next;
    setDrag(next);
    suppressed.current = true;
    const host = strip.current!;
    const bounds = host.getBoundingClientRect();
    if (event.clientX > bounds.right - 30) host.scrollLeft += 12;
    if (event.clientX < bounds.left + 30) host.scrollLeft -= 12;
    const others = [...host.querySelectorAll<HTMLElement>('[data-page-tab]')].filter((n) => n.dataset.pageTab !== next.key);
    const index = others.filter((n) => event.clientX > bounds.left + n.offsetLeft - host.scrollLeft + n.offsetWidth / 2).length;
    if (tabs.findIndex((t) => t.key === next.key) !== index) onReorder(next.key, index);
  }
  function end(event: PointerEvent) {
    const current = dragRef.current;
    dragRef.current = null;
    if (strip.current?.hasPointerCapture(event.pointerId)) strip.current.releasePointerCapture(event.pointerId);
    if (current?.moved) {
      const node = [...(strip.current?.querySelectorAll<HTMLElement>('[data-page-tab]') || [])].find((n) => n.dataset.pageTab === current.key);
      setLanding(true);
      setDrag({ ...current, x: current.start + (node?.getBoundingClientRect().left ?? current.left) - current.left });
      cleanupTimer.current = setTimeout(() => { setDrag(null); setLanding(false); suppressed.current = false; }, reduced() ? 0 : 150);
    } else { setDrag(null); suppressed.current = false; }
  }
  const draggedTab = tabs.find((t) => t.key === drag?.key);
  return <>
    <div ref={strip} className="pane-tabstrip workspace-tabstrip" role="tablist" aria-label="打开的页面" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {tabs.map((tab, index) => <div key={tab.key} data-page-tab={tab.key} className={`pane-tab-wrap${drag?.key === tab.key ? ' is-dragged' : ''}`} onPointerDown={(e) => start(e, tab)}>
        <button type="button" role="tab" aria-selected={tab.path === location.pathname} className={`pane-tab${tab.path === location.pathname ? ' on' : ''}`} title={`${tab.title}（Alt + 方向键调整顺序）`}
          onClick={() => { if (!suppressed.current && tab.path !== location.pathname) navigate(tab.path); }}
          onKeyDown={(e) => {
            if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); onReorder(tab.key, index + (e.key === 'ArrowLeft' ? -1 : 1)); }
            if (e.key === 'Delete') { e.preventDefault(); onClose(tab.key); }
          }}>
          <span className={`pane-tab-dot ${tab.kind}`} aria-hidden /><span className="pane-tab-text">{tab.title}</span>
        </button>
        <button type="button" className="pane-tab-x" aria-label={`关闭 ${tab.title}`} onClick={() => onClose(tab.key)}><CloseOutlined /></button>
      </div>)}
    </div>
    {drag && draggedTab ? createPortal(<div aria-hidden className={`pane-tab-drag-ghost${landing ? ' landing' : ''}`} style={{ left: drag.left, top: drag.top, width: drag.width, height: drag.height, transform: `translateX(${drag.x - drag.start}px)` }}><span className={`pane-tab-dot ${draggedTab.kind}`} />{draggedTab.title}<CloseOutlined /></div>, document.body) : null}
  </>;
}
