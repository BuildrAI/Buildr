import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

const LIST_MIN = 280;
const LIST_MAX = 520;
const LIST_DEFAULT = 320;
const DETAIL_MIN = 360;
const STEP = 16;

function clampAbsolute(value: number): number {
  return Math.round(Math.min(LIST_MAX, Math.max(LIST_MIN, value)));
}

function readStoredWidth(storageKey: string): number {
  try {
    const value = Number(window.localStorage.getItem(storageKey));
    if (Number.isFinite(value)) return clampAbsolute(value);
  } catch {
    /* ignore quota / private mode */
  }
  return LIST_DEFAULT;
}

function persistWidth(storageKey: string, value: number): void {
  try {
    window.localStorage.setItem(storageKey, String(value));
  } catch {
    /* ignore quota / private mode */
  }
}

export function useResizableListWidth(storageKey: string) {
  const cockpitRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(LIST_DEFAULT);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [listWidth, setListWidth] = useState(LIST_DEFAULT);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const next = readStoredWidth(storageKey);
    widthRef.current = next;
    setListWidth(next);
  }, [storageKey]);

  const clampWidth = useCallback((value: number) => {
    const cockpitWidth = cockpitRef.current?.getBoundingClientRect().width ?? LIST_MAX + DETAIL_MIN;
    const max = Math.min(LIST_MAX, Math.max(LIST_MIN, cockpitWidth - DETAIL_MIN));
    return Math.round(Math.min(max, Math.max(LIST_MIN, value)));
  }, []);

  const commitWidth = useCallback((value: number) => {
    const next = clampWidth(value);
    widthRef.current = next;
    setListWidth(next);
    return next;
  }, [clampWidth]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: widthRef.current };
    setResizing(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    commitWidth(drag.startWidth + (event.clientX - drag.startX));
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setResizing(false);
    persistWidth(storageKey, widthRef.current);
  };

  const onResizerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    persistWidth(storageKey, commitWidth(widthRef.current + (event.key === 'ArrowRight' ? STEP : -STEP)));
  };

  return {
    cockpitRef,
    listWidth,
    resizing,
    listMin: LIST_MIN,
    listMax: LIST_MAX,
    resizerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown: onResizerKeyDown,
    },
  };
}
