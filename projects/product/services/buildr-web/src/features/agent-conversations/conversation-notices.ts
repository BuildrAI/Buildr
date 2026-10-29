import type { ConversationEntry } from './types';

const recoveryReceipts = new Set(['已请求重试上次未送达的要求。', '已请求继续上次执行。']);
const legacyModelWarnings = new Set(['所选模型暂不可用，请重新选择。', '所选模型已停用或来源不可用，请重新选择。']);

/** Collapse adjacent recovery receipts in the view without rewriting history. */
export function visibleConversationEntries(entries: ConversationEntry[]): ConversationEntry[] {
  return entries.filter((entry, index) => {
    const next = entries[index + 1];
    return !(entry.kind === 'notice' && entry.role === 'system' && recoveryReceipts.has(entry.text)
      && next?.kind === entry.kind && next.role === entry.role && next.text === entry.text && next.participantId === entry.participantId);
  });
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
