import type { TaskReadingTab, TaskReadTarget } from './components/taskWorkContent';

export type TaskReadingSnapshot = { selected: TaskReadingTab; choices: Record<string, string>; trail: TaskReadTarget[]; positions: Record<string, number> };
const key = (workspaceId: string | null, taskId: string, entry?: string) => JSON.stringify([workspaceId, taskId, entry || null]);
const copy = (value: TaskReadingSnapshot): TaskReadingSnapshot => ({ ...value, choices: { ...value.choices }, trail: [...value.trail], positions: { ...value.positions } });

/** Session-only reading positions; normal task openings never consume them. */
export function createTaskReadingHistory(limit = 32) {
  const snapshots = new Map<string, TaskReadingSnapshot>();
  return {
    remember(workspaceId: string | null, taskId: string, value: TaskReadingSnapshot, entry?: string) {
      const identity = key(workspaceId, taskId, entry);
      snapshots.delete(identity); snapshots.set(identity, copy(value));
      while (snapshots.size > limit) snapshots.delete(snapshots.keys().next().value!);
    },
    read(workspaceId: string | null, taskId: string, entry?: string) {
      const value = snapshots.get(key(workspaceId, taskId, entry));
      return value ? copy(value) : null;
    },
  };
}
