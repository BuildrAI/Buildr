import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { SplitDivider } from './SplitDivider';
import './resizable-panels.css';

export type ResizablePanelsProps = {
  first: ReactNode;
  second: ReactNode;
  direction?: 'horizontal' | 'vertical';
  initialRatio?: number;
  initialSize?: number;
  minFirst?: number;
  minSecond?: number;
  firstHidden?: boolean;
  className?: string;
  separatorLabel?: string;
  storageKey?: string;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const validMinimum = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
function storedRatio(key?: string): number | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || !raw.trim()) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
  } catch { return null; }
}
function saveStoredRatio(key: string | undefined, value: number) {
  if (key) try { localStorage.setItem(key, String(value)); } catch { /* Preferences cannot block reading. */ }
}
function ratioBounds(available: number, minFirst: number, minSecond: number) {
  if (available <= 0) return { min: 0, max: 1 };
  const totalMinimum = minFirst + minSecond;
  // Shrink impossible minimums proportionally so that both regions remain accessible.
  const scale = totalMinimum > available ? available / totalMinimum : 1;
  return { min: minFirst * scale / available, max: 1 - minSecond * scale / available };
}

/** One axis-aware layout for independently scrolling regions; hiding retains the first region's state. */
export function ResizablePanels({ first, second, direction = 'horizontal', initialRatio = 0.38, initialSize, minFirst = 120, minSecond = 180, firstHidden = false, className = '', separatorLabel = '调整区域大小', storageKey }: ResizablePanelsProps) {
  const horizontal = direction === 'horizontal';
  const defaultRatio = Number.isFinite(initialRatio) ? clamp(initialRatio, 0, 1) : 0.38;
  const pixelDefault = initialSize !== undefined && Number.isFinite(initialSize) ? Math.max(0, initialSize) : null;
  const [initialPreference] = useState(() => storedRatio(storageKey));
  const [ratio, setRatio] = useState(initialPreference ?? defaultRatio);
  const latestRatio = useRef(ratio), preferenceKey = useRef(storageKey);
  const [axisSize, setAxisSize] = useState(0);
  const [dragging, setDragging] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const initialSizeApplied = useRef(initialPreference !== null);
  const origin = useRef<{ position: number; firstSize: number; available: number; pointerId: number; element: HTMLButtonElement; storageKey?: string } | null>(null);
  const id = useId();
  const available = Math.max(0, axisSize);
  const bounds = ratioBounds(available, validMinimum(minFirst), validMinimum(minSecond));
  const effectiveRatio = clamp(ratio, bounds.min, bounds.max);
  const firstSize = available * effectiveRatio;
  const saveRatio = (value: number) => {
    saveStoredRatio(storageKey, value);
  };
  const updateRatio = (value: number, save = false) => {
    latestRatio.current = value;
    setRatio(value);
    if (save) saveRatio(value);
  };

  useEffect(() => {
    if (preferenceKey.current === storageKey) return;
    const draggingOrigin = origin.current;
    if (draggingOrigin) {
      origin.current = null;
      saveStoredRatio(draggingOrigin.storageKey, latestRatio.current);
      if (draggingOrigin.element.hasPointerCapture(draggingOrigin.pointerId)) draggingOrigin.element.releasePointerCapture(draggingOrigin.pointerId);
      setDragging(false);
    }
    preferenceKey.current = storageKey;
    const preference = storedRatio(storageKey);
    initialSizeApplied.current = preference !== null;
    updateRatio(preference ?? defaultRatio);
  }, [storageKey, defaultRatio]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => { const rectangle = element.getBoundingClientRect(); setAxisSize(horizontal ? rectangle.width : rectangle.height); };
    measure();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [horizontal]);

  useEffect(() => {
    if (initialSizeApplied.current || firstHidden || available <= 0) return;
    if (pixelDefault !== null) updateRatio(clamp(pixelDefault / available, 0, 1));
    initialSizeApplied.current = true;
  }, [available, pixelDefault, firstHidden, storageKey]);

  useEffect(() => {
    if (!firstHidden || !origin.current) return;
    const start = origin.current;
    origin.current = null;
    saveStoredRatio(start.storageKey, latestRatio.current);
    if (start.element.hasPointerCapture(start.pointerId)) start.element.releasePointerCapture(start.pointerId);
    setDragging(false);
  }, [firstHidden]);

  const stopDragging = (event: PointerEvent<HTMLButtonElement>) => {
    if (!origin.current || origin.current.pointerId !== event.pointerId) return;
    const start = origin.current;
    origin.current = null;
    saveStoredRatio(start.storageKey, latestRatio.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };
  const reset = () => updateRatio(pixelDefault !== null && available > 0 ? clamp(pixelDefault / available, 0, 1) : defaultRatio, true);
  const decreaseKey = horizontal ? 'ArrowLeft' : 'ArrowUp', increaseKey = horizontal ? 'ArrowRight' : 'ArrowDown';
  const valueText = horizontal
    ? `左侧区域 ${Math.round(effectiveRatio * 100)}%，右侧区域 ${Math.round((1 - effectiveRatio) * 100)}%`
    : `上方区域 ${Math.round(effectiveRatio * 100)}%，下方区域 ${Math.round((1 - effectiveRatio) * 100)}%`;

  return <div ref={host} className={`resizable-panels direction-${direction}${dragging ? ' is-resizing' : ''}${firstHidden ? ' first-hidden' : ''}${className ? ' ' + className : ''}`}>
    <div id={id + '-first'} hidden={firstHidden} className="resizable-panels-pane resizable-panels-first" style={{ flexBasis: axisSize ? firstSize : pixelDefault ?? defaultRatio * 100 + '%' }}>{first}</div>
    <SplitDivider hidden={firstHidden} orientation={horizontal ? 'vertical' : 'horizontal'} className="resizable-panels-divider" aria-label={separatorLabel}
      aria-controls={id + '-first ' + id + '-second'} aria-valuemin={Math.round(bounds.min * 100)} aria-valuemax={Math.round(bounds.max * 100)}
      aria-valuenow={Math.round(effectiveRatio * 100)} aria-valuetext={valueText} title="拖动调整大小；方向键微调，双击恢复"
      onPointerDown={event => {
        if (event.button !== 0 || firstHidden || !available) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        origin.current = { position: horizontal ? event.clientX : event.clientY, firstSize, available, pointerId: event.pointerId, element: event.currentTarget, storageKey };
        setDragging(true);
      }}
      onPointerMove={event => {
        const start = origin.current;
        if (!start || start.pointerId !== event.pointerId || start.available <= 0) return;
        const position = horizontal ? event.clientX : event.clientY;
        const limits = ratioBounds(start.available, validMinimum(minFirst), validMinimum(minSecond));
        updateRatio(clamp((start.firstSize + position - start.position) / start.available, limits.min, limits.max));
      }}
      onPointerUp={stopDragging} onPointerCancel={stopDragging} onLostPointerCapture={stopDragging}
      onKeyDown={event => {
        if (![decreaseKey, increaseKey, 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const step = available > 0 ? (event.shiftKey ? 32 : 16) / available : 0.05;
        const next = event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max : effectiveRatio + (event.key === increaseKey ? step : -step);
        updateRatio(clamp(next, bounds.min, bounds.max), true);
      }}
      onDoubleClick={reset} />
    <div id={id + '-second'} className="resizable-panels-pane resizable-panels-second">{second}</div>
  </div>;
}
