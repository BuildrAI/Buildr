import { createHash } from 'node:crypto';
import type { ConversationView } from '../contracts.ts';
import { BUSY_STATES, type StoredConversation } from './agent-state.ts';

/** Only meaningful visible message changes advance activity, including streamed additions. */
export function messageSignature(record: StoredConversation): string {
  const messages = record.view.entries.filter(entry => (entry.kind === 'message' && ['user','assistant'].includes(entry.role) || entry.role === 'user' && entry.kind === 'notice' && entry.id.startsWith('reply-')) && entry.status !== 'failed')
    .map(entry => [entry.id, entry.text, entry.attachments ?? []]);
  return createHash('sha256').update(JSON.stringify(messages)).digest('hex');
}
export function summaryView(record: StoredConversation, version: number, seenThrough: number, updatedAt: string): ConversationView {
  const view = record.view;
  return {
    ...view, titleState:view.titleState??{status:'unknown'}, entries: [], requests: [], nextEntryCursor: undefined,
    run: view.run ? {...view.run, tools: []} : undefined,
    participants: record.participants.map(p => ({id:p.id,provider:p.provider as ConversationView['participants'][number]['provider'],connectionId:p.connectionId,label:p.label,model:p.modelId,modelAccountId:p.modelAccountId,deliveredThrough:p.deliveredThrough,contextId:''})),
    activity: {version, seenThrough, updatedAt, active: BUSY_STATES.has(view.run?.status as never) || view.requests.length > 0 || version > seenThrough},
  };
}
