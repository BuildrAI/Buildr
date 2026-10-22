import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { Button } from 'antd';
import { CloseOutlined, PushpinFilled, PushpinOutlined } from '@ant-design/icons';
import './side-reading.css';

type Props = HTMLAttributes<HTMLElement> & { id: string; title: string; open: boolean; pinned: boolean; canPin: boolean; onTogglePin(): void; onClose(): void; children: ReactNode };
export function SideReadingPanel({ id, title, open, pinned, canPin, onTogglePin, onClose, children, className = '', ...events }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const body = bodyRef.current;
    const rail = railRef.current;
    const thumb = thumbRef.current;
    if (!body || !rail || !thumb) return;
    let dragging = false;
    let dragStartY = 0;
    let dragStartScroll = 0;
    const update = () => {
      const overflow = body.scrollHeight > body.clientHeight + 1;
      rail.hidden = !overflow;
      if (!overflow) return;
      const track = Math.max(0, rail.clientHeight - 24);
      const height = Math.max(28, Math.round(track * track / body.scrollHeight));
      const maxScroll = body.scrollHeight - body.clientHeight;
      const top = maxScroll > 0 ? Math.round((track - height) * (body.scrollTop / maxScroll)) : 0;
      thumb.style.height = `${height}px`;
      thumb.style.transform = `translateY(${top}px)`;
    };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      const track = Math.max(0, rail.clientHeight - 24);
      const thumbHeight = thumb.offsetHeight;
      const maxScroll = body.scrollHeight - body.clientHeight;
      if (maxScroll <= 0 || track <= thumbHeight) return;
      const delta = (event.clientY - dragStartY) / (track - thumbHeight) * maxScroll;
      body.scrollTop = dragStartScroll + delta;
      update();
    };
    const release = () => {
      dragging = false;
      thumb.classList.remove('is-dragging');
    };
    const start = (event: PointerEvent) => {
      event.preventDefault();
      dragging = true;
      dragStartY = event.clientY;
      dragStartScroll = body.scrollTop;
      thumb.setPointerCapture(event.pointerId);
      thumb.classList.add('is-dragging');
    };
    update();
    body.addEventListener('scroll', update, { passive: true });
    thumb.addEventListener('pointerdown', start);
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('pointerup', release);
    thumb.addEventListener('pointercancel', release);
    const observer = new ResizeObserver(update);
    observer.observe(body);
    const mutations = new MutationObserver(update);
    mutations.observe(body, { childList: true, subtree: true, characterData: true });
    return () => {
      body.removeEventListener('scroll', update);
      thumb.removeEventListener('pointerdown', start);
      thumb.removeEventListener('pointermove', move);
      thumb.removeEventListener('pointerup', release);
      thumb.removeEventListener('pointercancel', release);
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);
  return <aside {...events} id={`${id}-panel`} hidden={!open} className={`side-reading ${className}${pinned ? ' is-pinned' : ''}`} role="region" aria-label={title} onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="side-reading-heading"><h2>{title}</h2><div>
      <Button id={`${id}-pin`} type="text" size="small" disabled={!canPin && !pinned} title={!canPin ? '阅读空间充足时可固定并排查看' : undefined} icon={pinned ? <PushpinFilled /> : <PushpinOutlined />} aria-pressed={pinned} onClick={onTogglePin}>{pinned ? '取消固定' : '固定'}</Button>
      <Button type="text" size="small" icon={<CloseOutlined />} aria-label={`关闭${title}`} onClick={onClose} />
    </div></div><div className="side-reading-body-wrap"><div className="side-reading-body" ref={bodyRef}>{children}</div><div className="side-reading-scrollbar" ref={railRef} aria-hidden="true"><div className="side-reading-scrollbar-thumb" ref={thumbRef} /></div></div>
  </aside>;
}
