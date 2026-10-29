export const DEFAULT_HISTORY_GROUP = '@default';
export const HISTORY_GROUP_LIMIT = 5;
export const HISTORY_GROUP_BATCH = 10;
type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

const profileName = () => typeof document === 'undefined' ? 'local' : document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content') || 'local';
const storageKey = (profile: string) => `buildr.agent-conversation.history-groups:${encodeURIComponent(profile || 'local')}`;
const browserStorage = () => { try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; } };

/** 默认空间固定最后；其余组按已保存偏好在前，未保存过的组按稳定身份次序。 */
export function historyGroupOrder(workspaceIds: string[], preferred: string[] = []): string[] {
  const present = [...new Set(workspaceIds)];
  const ordered = [...new Set(preferred)].filter(id => id !== DEFAULT_HISTORY_GROUP && present.includes(id));
  const rest = present.filter(id => id !== DEFAULT_HISTORY_GROUP && !ordered.includes(id)).sort();
  return [...ordered, ...rest, ...(present.includes(DEFAULT_HISTORY_GROUP) ? [DEFAULT_HISTORY_GROUP] : [])];
}

/** 整组移动：插入到目标组之前，`end` 表示移到最后（仍在默认组之前）。 */
export function moveHistoryGroup(workspaceIds: string[], moved: string, target: string | 'end'): string[] {
  const pinned = workspaceIds.includes(DEFAULT_HISTORY_GROUP) ? [DEFAULT_HISTORY_GROUP] : [];
  const groups = workspaceIds.filter(id => id !== DEFAULT_HISTORY_GROUP);
  if (moved === DEFAULT_HISTORY_GROUP || target === moved || !groups.includes(moved)) return [...groups, ...pinned];
  const rest = groups.filter(id => id !== moved);
  const index = target === 'end' ? rest.length : rest.indexOf(target);
  if (index < 0) return [...groups, ...pinned];
  return [...rest.slice(0, index), moved, ...rest.slice(index), ...pinned];
}

export function readHistoryGroupPreference(storage: Reader | undefined = browserStorage(), profile = profileName()): string[] {
  try {
    const raw = storage?.getItem(storageKey(profile)); if (!raw) return [];
    const parsed: unknown = JSON.parse(raw); if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()) && id.trim() !== DEFAULT_HISTORY_GROUP).map(id => id.trim()))];
  } catch { return []; }
}

export function writeHistoryGroupPreference(order: string[], storage: Writer | undefined = browserStorage(), profile = profileName()): boolean {
  try { storage?.setItem(storageKey(profile), JSON.stringify(order.filter(id => id !== DEFAULT_HISTORY_GROUP))); return Boolean(storage); } catch { return false; }
}
