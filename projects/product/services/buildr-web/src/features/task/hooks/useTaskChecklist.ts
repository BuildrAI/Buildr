import { useEffect, useRef, useState, type RefObject } from 'react';

/** Hover is transient; pinning deliberately reserves reading space. */
export function useTaskChecklist(taskId: string, rootRef: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [canPin, setCanPin] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovered = useRef(new Set<string>());
  const hoverOpened = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const track = (event: PointerEvent) => {
      pointer.current = event.pointerType === 'touch' ? null : { x: event.clientX, y: event.clientY };
      if (!open || pinned || !pointer.current) return;
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      if (hit?.closest('#task-checklist-toggle, #task-checklist-panel')) cancel();
      else if (!timer.current) leave();
    };
    document.addEventListener('pointermove', track, true);
    document.addEventListener('pointerdown', track, true);
    document.addEventListener('pointerout', track, true);
    return () => {
      document.removeEventListener('pointermove', track, true);
      document.removeEventListener('pointerdown', track, true);
      document.removeEventListener('pointerout', track, true);
    };
  }, [open, pinned]);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const leave = () => {
    cancel();
    if (pinned) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      const active = document.activeElement;
      const keyboardReading = active instanceof HTMLElement && active.matches(':focus-visible') && Boolean(active.closest('#task-checklist-toggle, #task-checklist-panel'));
      // Pin/unpin changes geometry without necessarily moving the pointer or firing enter.
      const point = pointer.current;
      const underPointer = point ? document.elementFromPoint(point.x, point.y) : null;
      const inside = point ? Boolean(underPointer?.closest('#task-checklist-toggle, #task-checklist-panel')) : hovered.current.size > 0;
      if (!inside && !keyboardReading) setOpen(false);
    }, 350);
  };
  const enter = (area: string, pointerType: string) => {
    if (pointerType === 'touch') return;
    cancel(); hovered.current.add(area);
    if (!open) hoverOpened.current = true;
    setOpen(true);
  };
  const exit = (area: string, pointerType: string) => {
    if (pointerType === 'touch') return;
    hovered.current.delete(area); leave();
  };
  const close = () => { cancel(); hovered.current.clear(); setOpen(false); setPinned(false); hoverOpened.current = false; };
  useEffect(() => { close(); hovered.current.clear(); return cancel; }, [taskId]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width >= 1000;
      setCanPin(available);
      if (!available) setPinned(false);
    });
    observer.observe(root);
    return () => observer.disconnect();
  });
  useEffect(() => { if (!pinned && open && !hovered.current.size) leave(); return cancel; }, [pinned]);
  return {
    open, pinned, canPin, enter, exit, cancel, leave, close,
    toggle: () => {
      cancel();
      if (hoverOpened.current) { hoverOpened.current = false; setOpen(true); }
      else if (open) close();
      else setOpen(true);
    },
    togglePin: () => { cancel(); setPinned(value => !value); setOpen(true); },
  };
}
