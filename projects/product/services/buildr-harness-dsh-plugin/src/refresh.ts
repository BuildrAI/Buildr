import type { Tool } from './workspace.ts';

export type ShortcutModifier = 'control' | 'alt' | 'shift' | 'meta';

export interface ShortcutBinding {
  code: string;
  secondCode?: string;
  modifiers: readonly ShortcutModifier[];
}

export interface ShortcutCatalogEntry {
  id: string;
  binding?: ShortcutBinding | null;
  issue?: unknown;
  conflicts?: readonly string[];
}

export interface DesktopKeyboardInput {
  kind: 'keyboard' | 'webview' | 'iframe' | 'menu';
  revision?: string;
  frameName?: string;
  code?: string;
  secondCode?: string;
  repeat?: boolean;
  control?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export const TOOL_LABELS: Record<Tool, string> = {
  explorer: '资源管理器',
  'source-control': '源代码管理',
};

/** Right-sidebar tabs render short tool names without any Buildr prefix. */
export function toolTabTitle(kind: Tool): string {
  return kind === 'explorer' ? '文件' : '代码库';
}

export function detectDesktopPlatform(platform?: string): 'macos' | 'windows' | 'linux' {
  const value = platform
    ?? (typeof document !== 'undefined' ? document.documentElement.dataset.platform : undefined)
    ?? (typeof navigator !== 'undefined' ? navigator.platform : '');
  if (/darwin|mac|iphone|ipad/iu.test(value)) return 'macos';
  if (/win/iu.test(value)) return 'windows';
  return 'linux';
}

/** Resolve the effective page.refresh shortcut from host settings, or platform default when absent. */
export function resolveRefreshBinding(
  catalog: readonly ShortcutCatalogEntry[] | undefined,
  platform: 'macos' | 'windows' | 'linux',
): ShortcutBinding | null {
  const entry = catalog?.find(item => item.id === 'page.refresh');
  if (entry) {
    if (!entry.binding || entry.issue != null || (entry.conflicts && entry.conflicts.length > 0)) return null;
    return entry.binding;
  }
  return { code: 'KeyR', modifiers: [platform === 'macos' ? 'meta' : 'control'] };
}

export function matchesShortcut(input: DesktopKeyboardInput, binding: ShortcutBinding | null): boolean {
  if (!binding || input.repeat) return false;
  if (input.code !== binding.code) return false;
  if ((input.secondCode ?? undefined) !== (binding.secondCode ?? undefined)) return false;
  return Boolean(input.control) === binding.modifiers.includes('control')
    && Boolean(input.alt) === binding.modifiers.includes('alt')
    && Boolean(input.shift) === binding.modifiers.includes('shift')
    && Boolean(input.meta) === binding.modifiers.includes('meta');
}

/** Refresh only the center Harness webview; never steal refresh from modals or right-sidebar panes. */
export function shouldRefreshCenterHarness(input: {
  active: boolean;
  hasModal: boolean;
  inRightSidebar: boolean;
  chatLease?: string;
  expectedRevision?: string;
  binding: ShortcutBinding | null;
  event: DesktopKeyboardInput;
}): boolean {
  const { active, hasModal, inRightSidebar, chatLease, expectedRevision, binding, event } = input;
  if (!active || hasModal) return false;
  if (expectedRevision !== undefined && event.revision !== undefined && event.revision !== expectedRevision) return false;
  if (!matchesShortcut(event, binding)) return false;
  if (event.kind === 'webview') return chatLease !== undefined && event.frameName === chatLease;
  if (event.kind === 'keyboard') return !inRightSidebar;
  return false;
}
