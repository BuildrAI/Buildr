import { useMemo, useSyncExternalStore } from 'react';
import { conversationDraftSnapshot, subscribeConversationDrafts } from './conversation-draft-presence.ts';

export function useConversationDraftPresence() {
  const profile = document.querySelector('meta[name="buildr-web-profile"]')?.getAttribute('content') || 'local';
  const snapshot = useSyncExternalStore(subscribeConversationDrafts, () => conversationDraftSnapshot(profile));
  return useMemo(() => JSON.parse(snapshot) as string[], [snapshot]);
}
