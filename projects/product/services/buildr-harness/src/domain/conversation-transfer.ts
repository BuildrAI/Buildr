import type { ConversationView, ServiceEvent } from '../contracts.ts';
import {conversationPatchEncoder,restoreConversationPatch,type ConversationPatch} from './conversation-patch.ts';
export type {ConversationPatch} from './conversation-patch.ts';

export interface ConversationDelta {
  baseCursor: number;
  baseRevision: string;
  conversation: Omit<ConversationView, 'entries'>;
  entryIds: string[];
  entries: ConversationView['entries'];
}
export type TransferEvent = ServiceEvent & { payload: ServiceEvent['payload'] & { delta?: ConversationDelta;patch?:ConversationPatch } };

/** Connection-local baseline only; a new connection always starts with a snapshot. */
export function conversationEventEncoder(transfer:'delta-v1'|'delta-v2'='delta-v1') {
  let previous: ServiceEvent | undefined;
  const patch=conversationPatchEncoder();
  return (event: ServiceEvent): TransferEvent => {
    const view = event.payload.conversation, base = previous?.payload.conversation;
    let result: TransferEvent = event;
    if(transfer==='delta-v2'){
      if(view){
        const baseline=base&&previous&&event.type!=='snapshot'&&event.generation===previous.generation&&view.id===base.id&&view.workspaceId===base.workspaceId&&event.cursor>previous.cursor
          ?{cursor:previous.cursor,revision:base.revision}:undefined;
        const changes=patch(view,baseline);
        if(changes)result={...event,payload:{...(event.payload.connection?{connection:event.payload.connection}:{}),patch:changes}};
        previous=event;
      }
      return result;
    }
    if (view && base && previous && event.type !== 'snapshot'
      && event.generation === previous.generation && view.id === base.id && view.workspaceId === base.workspaceId
      && event.cursor > previous.cursor) {
      const known = new Map(base.entries.map(entry => [entry.id, JSON.stringify(entry)]));
      const { entries, ...conversation } = view;
      const delta: ConversationDelta = {
        baseCursor: previous.cursor, baseRevision: base.revision, conversation,
        entryIds: entries.map(entry => entry.id),
        entries: entries.filter(entry => known.get(entry.id) !== JSON.stringify(entry)),
      };
      const candidate: TransferEvent = { ...event, payload: { ...(event.payload.connection ? { connection: event.payload.connection } : {}), delta } };
      if (JSON.stringify(candidate).length < JSON.stringify(event).length) result = candidate;
    }
    if (view) previous = event;
    return result;
  };
}

export function conversationEventDecoder() {
  let previous: ServiceEvent | undefined;
  return (event: TransferEvent): ServiceEvent => {
    const patch=event.payload.patch;
    if(patch){
      const base=previous?.payload.conversation;
      if(!base||!previous||event.type==='snapshot'||event.payload.delta||event.payload.conversation||event.generation!==previous.generation||patch.baseCursor!==previous.cursor||patch.baseRevision!==base.revision||event.cursor<=previous.cursor||event.conversationId!==base.id||event.workspaceId!==base.workspaceId||patch.changes.revision!==event.revision)throw new Error('conversation_patch_baseline_mismatch');
      const result:ServiceEvent={...event,payload:{...(event.payload.connection?{connection:event.payload.connection}:{}),conversation:restoreConversationPatch(base,patch)}};
      previous=result;return result;
    }
    const delta = event.payload.delta;
    let result: ServiceEvent = event;
    if (delta) {
      const base = previous?.payload.conversation, view = delta.conversation;
      if (!base || !previous || event.type === 'snapshot' || event.payload.conversation
        || event.generation !== previous.generation || delta.baseCursor !== previous.cursor
        || delta.baseRevision !== base.revision || event.cursor <= previous.cursor
        || view.id !== base.id || view.workspaceId !== base.workspaceId
        || event.conversationId !== view.id || event.workspaceId !== view.workspaceId || event.revision !== view.revision
        || new Set(delta.entryIds).size !== delta.entryIds.length
        || new Set(delta.entries.map(entry => entry.id)).size !== delta.entries.length
        || delta.entries.some(entry => !delta.entryIds.includes(entry.id))) {
        throw new Error('conversation_delta_baseline_mismatch');
      }
      const entries = new Map(base.entries.map(entry => [entry.id, entry]));
      for (const entry of delta.entries) entries.set(entry.id, entry);
      const ordered = delta.entryIds.map(id => {
        const entry = entries.get(id);
        if (!entry) throw new Error('conversation_delta_entry_missing');
        return entry;
      });
      result = { ...event, payload: { ...(event.payload.connection ? { connection: event.payload.connection } : {}), conversation: { ...view, entries: ordered } } };
    }
    if (result.payload.conversation) previous = result;
    return result;
  };
}
