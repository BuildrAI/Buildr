import type { ConversationEntry } from './types';

const recoveryReceipts = new Set(['已请求重试上次未送达的要求。', '已请求继续上次执行。']);
const legacyModelWarnings = new Set(['所选模型暂不可用，请重新选择。', '所选模型已停用或来源不可用，请重新选择。']);

/** Collapse adjacent recovery receipts in the view without rewriting history. */
export function visibleConversationEntries(entries: ConversationEntry[]): ConversationEntry[] {
  return entries.filter((entry, index) => {
    if(entry.kind==='message'&&entry.parentToolId)return false;
    if(entry.kind==='notice'&&entry.role==='system'&&['retired-question-','waiting-question-','waiting-handoff-'].some(prefix=>entry.id.startsWith(prefix)))return false;
    const next = entries[index + 1];
    return !(entry.kind === 'notice' && entry.role === 'system' && recoveryReceipts.has(entry.text)
      && next?.kind === entry.kind && next.role === entry.role && next.text === entry.text && next.participantId === entry.participantId);
  });
}

/** Seen state follows the same primary messages the person can actually read. */
export function latestVisibleConversationMessage(entries:ConversationEntry[]):ConversationEntry|undefined {
  return visibleConversationEntries(entries).filter(entry=>!entry.parentToolId&&(entry.kind==='message'&&(entry.role==='user'||entry.role==='assistant')||entry.role==='user'&&entry.kind==='notice'&&entry.id.startsWith('reply-'))&&entry.status!=='failed').at(-1);
}

/** A new native context with unchanged choices is continuation, not a model takeover. */
export function conversationHandoffReceipt(entry:Pick<ConversationEntry,'handoff'|'status'|'text'>):string {
  if(!entry.handoff)return entry.text;
  if(!entry.handoff.changes.length)return entry.status==='accepted'?'':entry.status==='failed'?'新要求未接收':'新要求接收待确认';
  const target=entry.handoff.changes.map(change=>change.after).join(' · ');
  return `${target} ${entry.status==='accepted'?'已接手':entry.status==='failed'?'未接收':'接收待确认'}`;
}

export function conversationModelWarning(ready: boolean, accountId: string | undefined, model: {available: boolean; enabled?: boolean} | undefined): string | undefined {
  if (!ready || !accountId || model?.available) return;
  return model?.enabled === false ? '所选模型已停用，请重新选择。' : '所选模型账号当前不可用，请检查账号登录状态。';
}

/** Model availability is already rendered from current state, including recovery. */
export function conversationActionError(error: string, modelWarning: string | undefined): string | undefined {
  if (!error || error === modelWarning || legacyModelWarnings.has(error)) return;
  return error;
}
