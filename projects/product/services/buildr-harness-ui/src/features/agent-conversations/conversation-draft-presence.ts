import { readDraft } from './conversation-state.ts';

type DraftStorage = Pick<Storage, 'length' | 'key' | 'getItem'>;
const textPrefix = (profile: string) => `buildr.agent-conversation.draft:${encodeURIComponent(profile)}:`;
const attachmentKey = (profile: string) => `buildr.agent-conversation.attachments:${profile}`;

/** Derive membership only; draft contents never become list data or HTTP parameters. */
export function conversationDraftIds(profile: string, storage: DraftStorage, overrides = new Map<string, string | null>()): string[] {
  const values = new Map<string, string | null>();
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key && (key.startsWith(textPrefix(profile)) || key === attachmentKey(profile))) values.set(key, storage.getItem(key));
    }
  } catch { /* Current-page overrides remain usable if storage is denied. */ }
  for (const [key, value] of overrides) values.set(key, value);
  const ids = new Set<string>();
  for (const [key, value] of values) {
    if (key === attachmentKey(profile)) {
      try {
        const images = JSON.parse(value || '{}');
        if (images && typeof images === 'object' && !Array.isArray(images)) {
          for (const [id, items] of Object.entries(images)) if (Array.isArray(items) && items.length) ids.add(id);
        }
      } catch { /* A broken attachment slot must not hide valid text drafts. */ }
      continue;
    }
    if (!key.startsWith(textPrefix(profile))) continue;
    const parts = key.slice(textPrefix(profile).length).split(':');
    if (parts.length !== 2 || parts[0] === 'new' || parts[1] === 'new') continue;
    try {
      if (readDraft(key, {getItem: () => value}).text.trim()) ids.add(decodeURIComponent(parts[1]));
    } catch { /* Invalid legacy keys are not identities. */ }
  }
  return [...ids].sort();
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
export function conversationDraftSnapshot(profile: string): string {
  let storage: DraftStorage = {length: 0, key: () => null, getItem: () => null};
  try { storage = sessionStorage; } catch { /* Use current-page overrides. */ }
  return JSON.stringify(conversationDraftIds(profile, storage, overrides));
}
