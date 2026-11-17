import { isExecuting } from './conversation-activity.ts';
import { readDraft } from './conversation-state.ts';
import type { ConversationSummary } from './types.ts';

type DraftStorage = Pick<Storage, 'length' | 'key' | 'getItem'>;
export type ConversationDraftPresence = {
  ids: string[];
  byWorkspace: Record<string, string[]>;
  unscopedIds: string[];
};
const textPrefix = (profile: string) => `buildr.agent-conversation.draft:${encodeURIComponent(profile)}:`;
const attachmentKey = (profile: string) => `buildr.agent-conversation.attachments:${profile}`;

/** Derive membership only; draft contents never become list data or HTTP parameters. */
export function conversationDraftPresence(profile: string, storage: DraftStorage, overrides = new Map<string, string | null>()): ConversationDraftPresence {
  const values = new Map<string, string | null>();
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key && (key.startsWith(textPrefix(profile)) || key === attachmentKey(profile))) values.set(key, storage.getItem(key));
    }
  } catch { /* Current-page overrides remain usable if storage is denied. */ }
  for (const [key, value] of overrides) values.set(key, value);
  const ids = new Set<string>(), unscopedIds = new Set<string>(), workspaceSets = new Map<string, Set<string>>();
  for (const [key, value] of values) {
    if (key === attachmentKey(profile)) {
      try {
        const images = JSON.parse(value || '{}');
        if (images && typeof images === 'object' && !Array.isArray(images)) {
          for (const [id, items] of Object.entries(images)) if (Array.isArray(items) && items.length) {
            ids.add(id);
            unscopedIds.add(id);
          }
        }
      } catch { /* A broken attachment slot must not hide valid text drafts. */ }
      continue;
    }
    if (!key.startsWith(textPrefix(profile))) continue;
    const parts = key.slice(textPrefix(profile).length).split(':');
    if (parts.length !== 2 || parts[0] === 'new' || parts[1] === 'new') continue;
    try {
      if (readDraft(key, {getItem: () => value}).text.trim()) {
        const workspaceId = decodeURIComponent(parts[0]), conversationId = decodeURIComponent(parts[1]);
        ids.add(conversationId);
        if (!workspaceId || workspaceId === 'unselected') unscopedIds.add(conversationId);
        else {
          let group = workspaceSets.get(workspaceId);
          if (!group) { group = new Set<string>(); workspaceSets.set(workspaceId, group); }
          group.add(conversationId);
        }
      }
    } catch { /* Invalid legacy keys are not identities. */ }
  }
  const byWorkspace: Record<string, string[]> = {};
  for (const workspaceId of [...workspaceSets.keys()].sort()) byWorkspace[workspaceId] = [...workspaceSets.get(workspaceId)!].sort();
  return { ids: [...ids].sort(), byWorkspace, unscopedIds: [...unscopedIds].sort() };
}

/** Derive membership only; draft contents never become list data or HTTP parameters. */
export function conversationDraftIds(profile: string, storage: DraftStorage, overrides = new Map<string, string | null>()): string[] {
  return conversationDraftPresence(profile, storage, overrides).ids;
}

export function shouldShowConversationDraft(
  row: Pick<ConversationSummary, 'id' | 'run'>,
  liveDraftIds: readonly string[],
  activeEditingId: string | null,
): boolean {
  if (activeEditingId && row.id === activeEditingId) return false;
  if (isExecuting(row as ConversationSummary)) return false;
  return liveDraftIds.includes(row.id);
}

/** Settle list-ordering draft membership: ignore executing conversations and lock the side-by-side active row until navigation away. */
export function settleConversationDraftIds(input: {
  liveIds: readonly string[];
  previousIds: readonly string[];
  activeEditingId: string | null;
  executingIds?: ReadonlySet<string>;
}): string[] {
  const live = new Set(input.liveIds), previous = new Set(input.previousIds);
  const next = new Set<string>();
  for (const id of new Set([...live, ...previous])) {
    if (input.executingIds?.has(id)) continue;
    if (input.activeEditingId && id === input.activeEditingId) {
      if (previous.has(id)) next.add(id);
      continue;
    }
    if (live.has(id)) next.add(id);
  }
  return [...next].sort();
}

export function workspaceConversationDraftIds(
  workspaceId: string,
  settledIds: readonly string[],
  presence: Pick<ConversationDraftPresence, 'byWorkspace' | 'unscopedIds'>,
  lockedScope?: { workspaceId: string; conversationId: string } | null,
): string[] {
  if (!settledIds.length) return [];
  const allowed = new Set([...(presence.byWorkspace[workspaceId] ?? []), ...presence.unscopedIds]);
  if (lockedScope && lockedScope.workspaceId === workspaceId) allowed.add(lockedScope.conversationId);
  return settledIds.filter(id => allowed.has(id));
}

// This is an in-memory fallback for the existing storage, not another draft store.
const overrides = new Map<string, string | null>();
const listeners = new Set<() => void>();
export function notifyConversationDraft(key: string, value: string | null) {
  if (overrides.has(key) && overrides.get(key) === value) return;
  overrides.set(key, value);
  for (const listener of listeners) listener();
}
export function subscribeConversationDrafts(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function readDraftPresence(profile: string): ConversationDraftPresence {
  let storage: DraftStorage = {length: 0, key: () => null, getItem: () => null};
  try { storage = sessionStorage; } catch { /* Use current-page overrides. */ }
  return conversationDraftPresence(profile, storage, overrides);
}
export function conversationDraftSnapshot(profile: string): string {
  return JSON.stringify(readDraftPresence(profile).ids);
}
export function conversationDraftPresenceSnapshot(profile: string): string {
  return JSON.stringify(readDraftPresence(profile));
}
