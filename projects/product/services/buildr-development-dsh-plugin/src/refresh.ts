import type { Tool } from './workspace.ts';

export type ShortcutModifier = 'control' | 'alt' | 'shift' | 'meta';

export interface ShortcutBinding {
  code: string;
  modifiers: readonly ShortcutModifier[];
  secondCode?: string | null;
}

export interface ShortcutCatalogEntry {
  id: string;
  binding: ShortcutBinding | null;
  issue: string | null;
  conflicts: readonly string[];
}

export interface DesktopKeyboardInput {
  kind?: string;
  revision?: string;
  frameName?: string;
  code: string;
  secondCode?: string;
  repeat?: boolean;
  control?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export const TOOL_LABELS: Record<Tool, string> = {
  explorer: '文件',
  'source-control': '代码库',
};

export function toolTabTitle(kind: Tool): string {
  return TOOL_LABELS[kind];
}

export function detectDesktopPlatform(platform?: string): 'macos' | 'windows' | 'linux' {
  const value = platform ?? (typeof document !== 'undefined' ? document.documentElement.dataset.platform : undefined)
    ?? (typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'linux');
  if (value === 'darwin' || value === 'macos') return 'macos';
  if (value === 'win32' || value === 'windows') return 'windows';
  return 'linux';
}

export function resolveRefreshBinding(
  catalog: readonly ShortcutCatalogEntry[] | undefined,
  platform: 'macos' | 'windows' | 'linux',
): ShortcutBinding | null {
  const entry = catalog?.find(item => item.id === 'page.refresh');
  if (entry) {
    if (!entry.binding || entry.issue || entry.conflicts.length > 0) return null;
    return entry.binding;
  }
  return { code: 'KeyR', modifiers: [platform === 'macos' ? 'meta' : 'control'] };
}

export function matchesShortcut(input: DesktopKeyboardInput, binding: ShortcutBinding | null): boolean {
  if (!binding || input.repeat || input.code !== binding.code) return false;
  if ((binding.secondCode ?? undefined) !== input.secondCode) return false;
  const required = new Set(binding.modifiers);
  return Boolean(input.control) === required.has('control')
    && Boolean(input.alt) === required.has('alt')
    && Boolean(input.shift) === required.has('shift')
    && Boolean(input.meta) === required.has('meta');
}

export function shouldRefreshCenterDevelopment(input: {
  active: boolean;
  hasModal: boolean;
  inRightSidebar: boolean;
  chatLease: string | undefined;
  expectedRevision?: string;
  binding: ShortcutBinding | null;
  event: DesktopKeyboardInput;
}): boolean {
  if (!input.active || input.hasModal || !input.chatLease || !input.binding) return false;
  if (input.expectedRevision && input.event.revision && input.event.revision !== input.expectedRevision) return false;
  if (input.event.kind === 'webview') {
    if (input.event.frameName !== input.chatLease) return false;
  } else if (input.event.kind === 'keyboard') {
    if (input.inRightSidebar) return false;
  } else {
    return false;
  }
  return matchesShortcut(input.event, input.binding);
}
