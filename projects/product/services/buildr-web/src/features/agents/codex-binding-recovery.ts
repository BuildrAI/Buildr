export type CodexBindingRecovery = { id: string; workspaceId: string; taskId: string; connectionId: string; expiresAt: number };
type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const lifetime = 30 * 60_000;
const key = (workspaceId: string, taskId: string) => `buildr.codex.binding.${JSON.stringify([workspaceId, taskId])}`;
const validId = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value);

export function createBindingRecovery(workspaceId: string, taskId: string, connectionId: string, now = Date.now()): CodexBindingRecovery {
  return {id: crypto.randomUUID(), workspaceId, taskId, connectionId, expiresAt: now + lifetime};
}
export function readBindingRecovery(workspaceId: string, taskId: string, storage: () => RecoveryStorage = () => sessionStorage, now = Date.now()): CodexBindingRecovery | null {
  try {
    const raw = storage().getItem(key(workspaceId, taskId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (Object.keys(item).some(name => !['id', 'workspaceId', 'taskId', 'connectionId', 'expiresAt'].includes(name)) || !validId(item.id) || item.workspaceId !== workspaceId || item.taskId !== taskId || typeof item.connectionId !== 'string' || !item.connectionId || item.connectionId.length > 256 || typeof item.expiresAt !== 'number' || !Number.isFinite(item.expiresAt) || item.expiresAt <= now || item.expiresAt > now + lifetime) {
      storage().removeItem(key(workspaceId, taskId)); return null;
    }
    return item as CodexBindingRecovery;
  } catch {return null;}
}
/** Store only a bounded request handle. A native chat identity is never inferred or cached here. */
export function saveBindingRecovery(value: CodexBindingRecovery, storage: () => RecoveryStorage = () => sessionStorage): void {
  try {storage().setItem(key(value.workspaceId, value.taskId), JSON.stringify({id: value.id, workspaceId: value.workspaceId, taskId: value.taskId, connectionId: value.connectionId, expiresAt: value.expiresAt}));} catch { /* The live request remains queryable if optional browser storage is denied. */ }
}
export function clearBindingRecovery(workspaceId: string, taskId: string, storage: () => RecoveryStorage = () => sessionStorage): void {
  try {storage().removeItem(key(workspaceId, taskId));} catch { /* Optional recovery storage must not block the completed association. */ }
}
