export type KeyboardNavigationKeyEvent = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
};

const KEYBOARD_NAV_KEYS = new Set([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** 仅将无修饰键的焦点导航按键识别为键盘访问，避免 Cmd+Tab / Ctrl+Tab 切窗口或标签页误判。 */
export function isKeyboardNavigationKey(event: KeyboardNavigationKeyEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return KEYBOARD_NAV_KEYS.has(event.key);
}

export function shouldOpenConversationTooltipOnFocus(input: {
  hasMeta: boolean;
  hidden: boolean;
  keyboardNavActive: boolean;
  focusVisible: boolean;
}): boolean {
  return input.hasMeta && !input.hidden && input.keyboardNavActive && input.focusVisible;
}

export function isElementFocusVisible(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return false;
  try {
    return target.matches(':focus-visible');
  } catch {
    return false;
  }
}
