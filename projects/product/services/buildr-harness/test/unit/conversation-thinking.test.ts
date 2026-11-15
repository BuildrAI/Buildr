import test from 'node:test';
import assert from 'node:assert/strict';
import { continuationDraft, continuationPrompt, stoppedContinuation } from '../../src/domain/conversation-continuation.ts';
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

test('continuation prompt follows the chain to the first real user input and never guesses', () => {
  const base = record([
    message(1, { id: 'original-input', role: 'user', text: '原始要求', runId: 'source' }),
    { id: 'first-continuation', sequence: 2, kind: 'notice', role: 'system', text: '已请求继续上次执行。', runId: 'middle', createdAt: '2026-11-01T00:00:00Z' },
    { id: 'second-continuation', sequence: 3, kind: 'notice', role: 'system', text: '已请求继续上次执行。', runId: 'current', createdAt: '2026-11-01T00:00:00Z' },
  ]);
  base.attempts = [
    { clientRequestId: 'source', inputDigest: 'd', runId: 'source', participantId: 'p', through: 1, userEntryId: 'original-input', accepted: true },
    { clientRequestId: 'middle', inputDigest: 'd', runId: 'middle', participantId: 'p', through: 2, userEntryId: 'first-continuation', accepted: true, continuationOf: 'source' },
    { clientRequestId: 'current', inputDigest: 'd', runId: 'current', participantId: 'p', through: 3, userEntryId: 'second-continuation', accepted: true, continuationOf: 'middle' },
  ];
  assert.deepEqual(continuationPrompt(base, 'current'), { runId: 'source', userEntryId: 'original-input', prompt: base.view.entries[0] });
  const orphan = structuredClone(base);
  orphan.attempts[2]!.continuationOf = 'missing';
  assert.equal(continuationPrompt(orphan, 'current'), undefined);
  const loop = structuredClone(base);
  loop.attempts[2]!.continuationOf = 'current';
  assert.equal(continuationPrompt(loop, 'current'), undefined);
});

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

test('explicit stop escape does not require acceptance, release or completed tools and never replays input', () => {
  for (const accepted of [true, false]) {
    const base = record([message(1, { role: 'user', text: 'DANGEROUS_ORIGINAL_COMMAND' })]);
    base.view.run = { id: 'run-1', participantId: 'p', status: 'unknown', stopRequested: true, accepted, tools: [{id:'tool',status:'running'}] } as NonNullable<StoredConversation['view']['run']>;
    base.participants = [{id:'p',connectionId:'local'}] as never;
    const draft = {...send,connectionId:'local',permissionMode:'default' as const};
    const snapshot = structuredClone(base);
    assert.equal(stoppedContinuation(base,draft),true);
    const result=continuationDraft(base,draft);
    assert.match(result.text,/旧命令可能仍在运行/);
    assert.match(result.text,/不要重发原输入/);
    assert.ok(!result.text.includes('DANGEROUS_ORIGINAL_COMMAND'));
    assert.deepEqual(base,snapshot);
    assert.throws(()=>continuationDraft(base,{...draft,continueRunId:'other'}),/原执行已变化/);
    assert.equal(stoppedContinuation(base,{...draft,connectionId:'other'}),false);
    base.view.run!.stopRequested=false;
    assert.equal(stoppedContinuation(base,draft),false);
  }
});
