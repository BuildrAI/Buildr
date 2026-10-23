export type TabCloseFocus = { removed: string; next: string | null };

export function tabFocusTarget(keys: string[], current: string, key: string): string | null {
  if (!keys.length) return null;
  const index = Math.max(0, keys.indexOf(current));
  if (key === 'ArrowLeft') return keys[(index + keys.length - 1) % keys.length];
  if (key === 'ArrowRight') return keys[(index + 1) % keys.length];
  if (key === 'Home') return keys[0];
  if (key === 'End') return keys[keys.length - 1];
  return null;
}

export function tabAfterClose(keys: string[], closed: string): string | null {
  const index = keys.indexOf(closed);
  return index < 0 ? null : keys[index + 1] || keys[index - 1] || null;
}

export function tabElementId(prefix: string, key: string): string { return `${prefix}-tab-${encodeURIComponent(key)}`; }
export function tabPanelId(prefix: string, path: string): string { return `${prefix}-panel-${encodeURIComponent(path)}`; }

/** Activation changes presentation order without changing any tab identity. */
export function activateTabKey(order: string[], key: string): string[] {
  return order[0] === key ? order : [key, ...order.filter(item => item !== key)];
}

export function tabsInOrder<T extends { key: string }>(tabs: T[], order: string[]): T[] {
  const remaining = new Map(tabs.map(tab => [tab.key, tab]));
  const result: T[] = [];
  for (const key of order) {
    const tab = remaining.get(key);
    if (tab) { result.push(tab); remaining.delete(key); }
  }
  return [...result, ...remaining.values()];
}
