import { useMemo, useSyncExternalStore } from 'react';
import { conversationDraftPresenceSnapshot, conversationDraftSnapshot, subscribeConversationDrafts, type ConversationDraftPresence } from './conversation-draft-presence.ts';

export function useConversationDraftPresence() {
  const profile = document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content') || 'local';
  const snapshot = useSyncExternalStore(subscribeConversationDrafts, () => conversationDraftSnapshot(profile));
  return useMemo(() => JSON.parse(snapshot) as string[], [snapshot]);
}

export function useConversationDraftPresenceDetail(): ConversationDraftPresence {
  const profile = document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content') || 'local';
  const snapshot = useSyncExternalStore(subscribeConversationDrafts, () => conversationDraftPresenceSnapshot(profile));
  return useMemo(() => JSON.parse(snapshot) as ConversationDraftPresence, [snapshot]);
}
