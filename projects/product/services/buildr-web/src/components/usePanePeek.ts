import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const OPEN_DELAY = 220;
const CLOSE_DELAY = 350;
const INTERACTIVE_POPUPS = '.ant-dropdown, .ant-select-dropdown, .ant-popover, .ant-picker-dropdown, .ant-mentions-dropdown, .ant-modal-wrap, .ant-drawer-open';

export interface PanePeekControl {
  open: boolean;
  onChange: (open: boolean) => void;
}

export interface PanePeekOptions {
  enabled: boolean;
  paneRef: RefObject<HTMLElement | null>;
  railRef: RefObject<HTMLElement | null>;
  control?: PanePeekControl;
  beforeClose?: () => void;
}

function visible(element: HTMLElement) {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
}

function hasInteractivePopup() {
  return [...document.querySelectorAll<HTMLElement>(INTERACTIVE_POPUPS)].some(visible);
}

/** Shared transient/pinned interaction; callers own pane contents and scroll state. */
export function usePanePeek({ enabled, paneRef, railRef, control, beforeClose }: PanePeekOptions) {
  const [localOpen, setLocalOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = control?.open ?? localOpen;
  const latest = useRef({ enabled, paneRef, railRef, control, beforeClose, open });
  latest.current = { enabled, paneRef, railRef, control, beforeClose, open };
  const pinnedRef = useRef(false);
  const triggerRef = useRef<HTMLElement | undefined>(undefined);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovered = useRef(new Set<string>());
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (openTimer.current !== null) clearTimeout(openTimer.current);
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const changeOpen = useCallback((next: boolean) => {
    const current = latest.current;
    if (!next && current.open) current.beforeClose?.();
    setLocalOpen(next);
    if (current.open !== next) current.control?.onChange(next);
  }, []);

  const close = useCallback((returnFocus = false) => {
    cancel();
    hovered.current.clear();
    pinnedRef.current = false;
    setPinned(false);
    changeOpen(false);
    if (returnFocus && triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
  }, [cancel, changeOpen]);

  const contains = useCallback((target: Node | null) => {
    if (!target) return false;
    const current = latest.current;
    return Boolean(current.paneRef.current?.contains(target) || current.railRef.current?.contains(target));
  }, []);

  const leave = useCallback(() => {
    cancel();
    if (!latest.current.enabled || !latest.current.open || pinnedRef.current) return;
    const check = () => {
      closeTimer.current = null;
      const current = latest.current;
      if (!current.enabled || !current.open || pinnedRef.current) return;
      // Geometry can change without a pointer-enter/leave event.
      const point = pointer.current;
      const inside = point ? contains(document.elementFromPoint(point.x, point.y)) : hovered.current.size > 0;
      if (inside || contains(document.activeElement)) return;
      if (hasInteractivePopup()) {
        // Portals can disappear without another pointer or focus event.
        closeTimer.current = setTimeout(check, CLOSE_DELAY);
        return;
      }
      close();
    };
    closeTimer.current = setTimeout(check, CLOSE_DELAY);
  }, [cancel, close, contains]);

  const enter = useCallback((area: string, pointerType: string, trigger?: HTMLElement) => {
    if (!latest.current.enabled || pointerType === 'touch') return;
    cancel();
    hovered.current.add(area);
    if (trigger) triggerRef.current = trigger;
    if (latest.current.open) return;
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      if (latest.current.enabled && hovered.current.size > 0) changeOpen(true);
    }, OPEN_DELAY);
  }, [cancel, changeOpen]);

  const exit = useCallback((area: string, pointerType: string) => {
    if (pointerType === 'touch') return;
    hovered.current.delete(area);
    leave();
  }, [leave]);

  const pin = useCallback((trigger?: HTMLElement) => {
    if (!latest.current.enabled) return;
    cancel();
    if (trigger) triggerRef.current = trigger;
    pinnedRef.current = true;
    setPinned(true);
    changeOpen(true);
  }, [cancel, changeOpen]);

  useEffect(() => {
    if (!enabled) {
      pointer.current = null;
      close();
    }
    return cancel;
  }, [enabled, cancel, close]);

  useEffect(() => {
    if (!open) {
      cancel();
      hovered.current.clear();
      pinnedRef.current = false;
      setPinned(false);
    }
  }, [open, cancel]);

  useEffect(() => {
    if (!enabled) return;
    const track = (event: PointerEvent) => {
      pointer.current = event.pointerType === 'touch' ? null : { x: event.clientX, y: event.clientY };
      if (!latest.current.open || pinnedRef.current || !pointer.current) return;
      if (contains(document.elementFromPoint(event.clientX, event.clientY))) cancel();
      else if (closeTimer.current === null) leave();
    };
    const outside = (event: PointerEvent) => {
      if (!latest.current.open) return;
      const target = event.target;
      if (!(target instanceof Node) || contains(target)) return;
      const popup = target instanceof Element ? target.closest<HTMLElement>(INTERACTIVE_POPUPS) : null;
      if (popup && visible(popup)) return;
      close();
    };
    const focusChanged = () => {
      if (!latest.current.open || pinnedRef.current) return;
      if (contains(document.activeElement)) cancel();
      else leave();
    };
    const leaveDocument = (event: PointerEvent) => {
      if (event.relatedTarget !== null || event.pointerType === 'touch') return;
      pointer.current = null;
      hovered.current.clear();
      leave();
    };
    const keyDown = (event: KeyboardEvent) => {
      // Content lives in stable portals: its React ancestry is the retained page,
      // so the visual pane's JSX key handler cannot receive every inner event.
      if (event.key !== 'Escape' || event.defaultPrevented || !latest.current.open || !contains(event.target as Node)) return;
      event.preventDefault();
      close(true);
    };
    document.addEventListener('pointermove', track, true);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('pointerout', leaveDocument, true);
    document.addEventListener('focusin', focusChanged, true);
    document.addEventListener('focusout', leave, true);
    window.addEventListener('keydown', keyDown);
    return () => {
      document.removeEventListener('pointermove', track, true);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('pointerout', leaveDocument, true);
      document.removeEventListener('focusin', focusChanged, true);
      document.removeEventListener('focusout', leave, true);
      window.removeEventListener('keydown', keyDown);
    };
  }, [enabled, cancel, close, contains, leave]);

  return { open: enabled && open, pinned: enabled && pinned, enter, exit, pin, close, cancel, leave };
}
