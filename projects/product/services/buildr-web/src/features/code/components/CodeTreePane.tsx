import { SplitDivider } from '../../../components/SplitDivider';
import { useEffect, useRef, useState } from 'react';

type Props = { hidden: boolean; onHost(host: HTMLDivElement | null): void; storageKey?: string };
/** The docking surface owns width only; file data and selection stay with the caller. */
export function CodeTreePane({ hidden, onHost, storageKey }: Props) {
  const [width, setWidth] = useState(()=>{try{const value=Number(storageKey && localStorage.getItem(storageKey));return value>=240&&value<=420?value:280;}catch{return 280;}});
  useEffect(()=>{if(storageKey)try{localStorage.setItem(storageKey,String(width));}catch{/* local preferences are optional */}},[width,storageKey]);
  const [dragging, setDragging] = useState(false);
  const origin = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      if (origin.current) setWidth(Math.max(240, Math.min(420, origin.current.width + event.clientX - origin.current.x)));
    };
    const release = () => { origin.current = null; setDragging(false); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [dragging]);
  return <aside hidden={hidden} className={'global-source-dock' + (dragging ? ' is-resizing' : '')} style={{ width, flexBasis: width }} aria-label="资源管理器文件树" data-prototype-position="explorer-tree-pane">
    <div className="global-source-sidebar"><header className="code-tree-pane-title">资源管理器</header><div className="code-tree-host" ref={onHost} /></div>
    <SplitDivider className="global-source-divider" children={<span className="split-divider-header-marker" aria-hidden="true" />} aria-label="调整资源管理器宽度" aria-orientation="vertical" aria-valuemin={240} aria-valuemax={420} aria-valuenow={width}
      onPointerDown={event => { event.preventDefault(); origin.current = { x: event.clientX, width }; setDragging(true); }}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setWidth(value => Math.max(240, Math.min(420, value + (event.key === 'ArrowRight' ? 16 : -16)))); } }}
      onDoubleClick={() => setWidth(280)} />
  </aside>;
}
