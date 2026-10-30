import type { ConversationView, SendPreview } from './types';

/** One budget belongs to an explicit send, shared by preparation and submission. */
export type ConversationSendRecovery = { enabled: boolean; used: boolean };

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}

/** Ignore only known background metadata, never message bodies or execution identity. */
export function sameConversationSendFacts(before: ConversationView, next: ConversationView): boolean {
  const facts = (view: ConversationView) => {
    const { revision: _revision, title: _title, titleState: _titleState, updatedAt: _updatedAt,
      activity: _activity, nextEntryCursor: _cursor, entries: _entries, run, ...rest } = view;
    const { contextUsage: _usage, updatedAt: _runUpdatedAt, ...execution } = run ?? {};
    return { ...rest, run: run ? execution : undefined };
  };
  if (stable(facts(before)) !== stable(facts(next))) return false;
  if (before.entries.at(-1)?.sequence !== next.entries.at(-1)?.sequence) return false;
  // A reread returns a bounded tail; the UI may already have loaded older pages.
  if (!next.entries.length) return before.entries.length === 0;
  const oldest = next.entries[0].sequence;
  if (before.entries.length && oldest < before.entries[0].sequence) return false;
  return stable(before.entries.filter(entry => entry.sequence >= oldest)) === stable(next.entries);
}

/** A refreshed preview must still target the observed source and execution settings. */
export function sameConversationSendPreview(before: SendPreview, next: SendPreview): boolean {
  const facts = (preview: SendPreview) => {
    const { token: _token, revision: _revision, inputBytes: _size, handoff: _handoff,
      modelSourceLabel: _label, ...rest } = preview;
    return rest;
  };
  return stable(facts(before)) === stable(facts(next));
}

export async function withConversationSendRecovery<T>(
  before: ConversationView,
  recovery: ConversationSendRecovery,
  options: {
    perform(current: ConversationView): Promise<T>;
    read(): Promise<ConversationView>;
    apply(current: ConversationView, observedRevision: string): void;
    isCurrent(): boolean;
  },
): Promise<{ conversation: ConversationView; value: T } | undefined> {
  if (!options.isCurrent()) return;
  try {
    return { conversation: before, value: await options.perform(before) };
  } catch (failure) {
    const error = failure as { status?: number; code?: string };
    // These errors prove rejection, unlike a dropped response or unknown delivery.
    if (!recovery.enabled || recovery.used || error.status !== 409 ||
      !['agent_revision_conflict', 'agent_preview_stale'].includes(error.code ?? '') || !options.isCurrent()) throw failure;
    recovery.used = true;
    const next = await options.read();
    if (!options.isCurrent()) return;
    options.apply(next, before.revision);
    if (!sameConversationSendFacts(before, next)) throw failure;
    return { conversation: next, value: await options.perform(next) };
  }
}

export function refreshedConversationConflictMessage(error: { code?: string; message: string }): string {
  if (error.code === 'agent_revision_conflict' || error.code === 'agent_preview_stale') {
    return '对话状态已更新，请核对后重新发送。草稿保留。';
  }
  const message = error.message.trim() || '请求未完成。';
  return /[。！？]$/.test(message) ? message + ' 草稿保留。' : message + '。草稿保留。';
}
