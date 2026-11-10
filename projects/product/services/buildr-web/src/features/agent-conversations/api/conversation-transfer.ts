import type { ConversationEvent } from '../types';
import {restoreConversationPatch} from './conversation-patch.ts';

/** Reduce wire deltas before the existing selection, history and generation guards. */
export function conversationTransferDecoder(workspaceId: string, conversationId: string) {
  let previous: ConversationEvent | undefined;
  return (event: ConversationEvent): ConversationEvent => {
    const delta = event.payload.delta,patch=event.payload.patch;
    if (event.workspaceId !== workspaceId || event.conversationId !== conversationId) {
      if (delta||patch) throw new Error('实时事件不属于当前对话，需要重新观察。');
      // Legacy full events keep their existing ignore/filter semantics. They
      // cannot replace the baseline used for this subscription's deltas.
      return event;
    }
    if(patch){
      const base=previous?.payload.conversation;
      if(!base||!previous||base.id!==conversationId||base.workspaceId!==workspaceId||event.type==='snapshot'||delta||event.payload.conversation||event.generation!==previous.generation||patch.baseCursor!==previous.cursor||patch.baseRevision!==base.revision||event.cursor<=previous.cursor||patch.changes.revision!==event.revision)throw new Error('实时更新基准已变化，需要重新观察。');
      event={...event,payload:{...(event.payload.connection?{connection:event.payload.connection}:{}),conversation:restoreConversationPatch(base,patch)}};
    }
    if (delta) {
      const base = previous?.payload.conversation, view = delta.conversation;
      if (!base || !previous || event.type === 'snapshot' || event.payload.conversation
        || event.generation !== previous.generation || delta.baseCursor !== previous.cursor
        || delta.baseRevision !== base.revision || event.cursor <= previous.cursor
        || view.id !== base.id || view.workspaceId !== base.workspaceId
        || view.id !== conversationId || view.workspaceId !== workspaceId || view.revision !== event.revision
        || new Set(delta.entryIds).size !== delta.entryIds.length
        || new Set(delta.entries.map(entry => entry.id)).size !== delta.entries.length
        || delta.entries.some(entry => !delta.entryIds.includes(entry.id))) {
        throw new Error('实时更新基准已变化，需要重新观察。');
      }
      const entries = new Map(base.entries.map(entry => [entry.id, entry]));
      for (const entry of delta.entries) entries.set(entry.id, entry);
      const ordered = delta.entryIds.map(id => {
        const entry = entries.get(id);
        if (!entry) throw new Error('实时记录不完整，需要重新观察。');
        return entry;
      });
      event = { ...event, payload: { ...(event.payload.connection ? { connection: event.payload.connection } : {}), conversation: { ...view, entries: ordered } } };
    }
    if (event.payload.conversation) previous = event;
    return event;
  };
}
