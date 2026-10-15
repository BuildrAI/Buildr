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
