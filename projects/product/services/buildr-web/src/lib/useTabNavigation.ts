import { useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { tabAfterClose, tabFocusTarget } from './tab-navigation';

/** Manual activation keeps arrow-key exploration independent of network/navigation. */
export function useTabNavigation(keys: string[], active: string | null | undefined, strip: RefObject<HTMLDivElement | null>) {
  const [focused, setFocused] = useState<string | undefined>(active || keys[0]);
  const pendingClose = useRef<{ removed: string; next: string | null } | null>(null);
  const selected = active && keys.includes(active) ? active : keys[0];
  const focusKey = focused && keys.includes(focused) ? focused : selected;
  const focus = (key: string | null) => {
    const root = strip.current;
    const button = [...(root?.querySelectorAll<HTMLButtonElement>('[data-tab-key]') || [])].find(node => node.dataset.tabKey === key);
    const fallback = [...(root?.parentElement?.parentElement?.querySelectorAll<HTMLElement>('h1,h2,button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]') || [])]
      .find(node => !root?.contains(node) && node.getClientRects().length && !node.closest('[hidden],[inert]'));
    const target = button || fallback || root;
    if (target?.matches('h1,h2')) target.tabIndex = -1;
    target?.focus();
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  useLayoutEffect(() => { setFocused(selected); }, [selected]);
  useLayoutEffect(() => {
    const pending = pendingClose.current;
    if (!pending || keys.includes(pending.removed)) return;
    pendingClose.current = null;
    const target = pending.next && keys.includes(pending.next) ? pending.next : selected || null;
    setFocused(target || undefined); focus(target);
  });
  const close = (key: string, onClose?: (key: string) => void) => {
    if (strip.current?.contains(document.activeElement)) pendingClose.current = { removed: key, next: tabAfterClose(keys, key) };
    onClose?.(key);
  };
  const onKeyDown = (event: KeyboardEvent, key: string, onClose?: (key: string) => void) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = tabFocusTarget(keys, key, event.key);
    if (target) { event.preventDefault(); setFocused(target); focus(target); }
    else if (event.key === 'Delete' && onClose) { event.preventDefault(); close(key, onClose); }
  };
  return { focusKey, onFocus: setFocused, onKeyDown, close };
}
