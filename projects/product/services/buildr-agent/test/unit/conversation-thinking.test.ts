import test from 'node:test';
import assert from 'node:assert/strict';
import { continuationDraft } from '../../src/domain/conversation-continuation.ts';
import { messageSignature } from '../../src/domain/conversation-activity.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';
import type { ConversationEntry, SendDraft } from '../../src/contracts.ts';

const message = (sequence: number, fields: Partial<ConversationEntry>): ConversationEntry => ({
  id: `entry-${sequence}`, sequence, kind: 'message', role: 'assistant', text: '', createdAt: '2026-11-01T00:00:00Z', runId: 'run-1', status: 'completed', ...fields,
});
const record = (entries: ConversationEntry[]): StoredConversation => ({
  view: { entries, run: undefined, requests: [] }, participants: [], attempts: [{ runId: 'run-1', participantId: 'p', executionRef: 'exec', through: 1 }], sources: {},
} as unknown as StoredConversation);
const send = { text: '', conversationId: 'c', clientRequestId: 'r', expectedRevision: '1', continueRunId: 'run-1' } as unknown as SendDraft;

test('a run that only produced thinking still counts as unanswered when the user continues', () => {
  const run = { id: 'run-1', participantId: 'p', accepted: true, status: 'completed', tools: [], startedAt: '2026-11-01T00:00:00Z' } as never;
  const base = record([message(1, { role: 'user', text: '原要求' })]);
  base.view.run = run;
  // Thinking alone never satisfies the answered check, so continuing resumes the same goal.
  const thinkingOnly = record([...base.view.entries, message(2, { text: '内部推理', thinking: true })]);
  thinkingOnly.view.run = run;
  assert.match(continuationDraft(thinkingOnly, send).text, /继续上次未正常答复的执行/);
  const answered = record([...base.view.entries, message(2, { text: '最终答复' })]);
  answered.view.run = run;
  assert.throws(() => continuationDraft(answered, send), /本轮已正常答复/);
});

test('streaming thinking does not advance conversation activity', () => {
  const view = (thinking: string) => record([
    message(1, { role: 'user', text: '要求' }),
    message(2, { text: thinking, thinking: true }),
    message(3, { text: '答复' }),
  ]);
  assert.equal(messageSignature(view('第一步')), messageSignature(view('第一步，第二步')));
  const visible = view('第一步');
  visible.view.entries[2]!.text = '答复（更新）';
  assert.notEqual(messageSignature(view('第一步')), messageSignature(visible));
});
