import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pushbackNotifications, timedPushbackNotifications, type PushbackSnapshot } from '../../src/domain/programmatic-pushback-notifications.ts';
import type { ConversationView, RunView } from '../../src/contracts.ts';

const NOW = Date.parse('2026-11-01T00:00:00.000Z');
const MINUTE = 60_000;
const run = (id: string, status: RunView['status'], extra: Partial<RunView> = {}): RunView => ({
  id, participantId: 'p', provider: 'local', generation: 'g', status, accepted: true, tools: [],
  startedAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...extra,
});
function view(overrides: Partial<ConversationView> = {}): ConversationView {
  return {
    id: 'conversation-one', workspaceId: 'workspace-one', cwd: '/workspace', title: 'work', revision: 'r1', hidden: false,
    updatedAt: '2026-11-01T00:00:00.000Z', participants: [], requests: [], entries: [], ...overrides,
  } as ConversationView;
}
const context = (now = NOW, stopped: string[] = []) => ({
  now,
  stoppedByCredential: new Set(stopped),
  stalledThresholdMs: 20 * MINUTE,
  progressIntervalMs: 5 * MINUTE,
  progressEnabled: true,
  stalledEnabled: true,
});
const diff = (current: ConversationView, prior?: PushbackSnapshot, ctx = context()) => pushbackNotifications(current, prior, ctx);

test('a new approval request carries all card content, identifiers and answer revision', () => {
  const request = {
    id: 'permit-one', kind: 'approval' as const, title: 'Write a file?', description: 'The agent wants to write src/app.ts.',
    runId: 'run-one', participantId: 'participant-one', generation: 'generation-one',
    options: [{ id: 'allow', label: 'Allow', description: 'once' }, { id: 'deny', label: 'Deny' }],
  };
  const first = diff(view({ revision: 'revision-one', run: run('run-one', 'waiting-approval'), requests: [request as any] }));
  assert.deepEqual(first.events.map(event => event.type), ['decision.requested']);
  const event = first.events[0]!;
  assert.deepEqual(event.request, {
    requestId: 'permit-one', kind: 'approval', title: 'Write a file?', description: 'The agent wants to write src/app.ts.',
    runId: 'run-one', participantId: 'participant-one', generation: 'generation-one', conversationRevision: 'revision-one',
    options: [{ optionId: 'allow', label: 'Allow', description: 'once' }, { optionId: 'deny', label: 'Deny' }],
  });
  assert.equal(event.runStatus, 'waiting-approval');
  const again = diff(view({ revision: 'revision-two', run: run('run-one', 'waiting-approval'), requests: [request as any] }), first.snapshot);
  assert.deepEqual(again.events, [], 'an unchanged request is not re-announced');
});

test('a question request carries every question and option with stable ids', () => {
  const request = {
    id: 'question-one', kind: 'question' as const, title: '处理范围', description: '请选择本轮处理的范围。',
    runId: 'run-one', participantId: 'p', generation: 'g',
    questions: [
      { id: 'scope', label: '范围', multiple: true, allowOther: true, options: [{ id: 'yes', label: '确认', description: '全部范围' }] },
      { id: 'risk', label: '风险', multiple: false, allowOther: false, options: [{ id: 'low', label: '低' }, { id: 'high', label: '高' }] },
    ],
  };
  const first = diff(view({ revision: 'rev-questions', run: run('run-one', 'waiting-question'), requests: [request as any] }));
  assert.deepEqual(first.events.map(event => event.type), ['decision.requested']);
  assert.deepEqual(first.events[0]!.request!.questions, [
    { questionId: 'scope', question: '范围', allowOther: true, multiple: true, options: [{ optionId: 'yes', label: '确认', description: '全部范围' }] },
    { questionId: 'risk', question: '风险', allowOther: false, multiple: false, options: [{ optionId: 'low', label: '低' }, { optionId: 'high', label: '高' }] },
  ]);
  assert.equal(first.events[0]!.request!.conversationRevision, 'rev-questions');
  const changed = diff(view({ revision: 'rev-questions', run: run('run-one', 'waiting-question'), requests: [{ ...request, title: '新的范围' } as any] }), first.snapshot);
  assert.deepEqual(changed.events.map(event => event.type), ['decision.requested'], 'a changed card is a new decision');
});

test('run.completed carries the complete final assistant reply and its read URL', () => {
  const long = 'x'.repeat(900);
  const entries = [{ id: 'm1', sequence: 1, kind: 'message', role: 'assistant', text: long, createdAt: '2026-11-01T00:00:01.000Z', runId: 'run-one', status: 'completed' }];
  const first = diff(view({ run: run('run-one', 'running') }));
  const done = diff(view({ run: run('run-one', 'completed'), entries: entries as any }), first.snapshot);
  assert.deepEqual(done.events.map(event => event.type), ['run.completed']);
  assert.equal(done.events[0]!.summary.length, 500);
  assert.equal(done.events[0]!.finalReply, long, 'finalReply is not truncated');
  assert.equal(done.events[0]!.finalReplyUrl, '/api/v1/programmatic/workspaces/workspace-one/conversations/conversation-one/runs/run-one/final-reply');
});

test('run.failed and run.stopped carry the final reply and read URL', () => {
  const entries = [{ id: 'm1', sequence: 1, kind: 'message', role: 'assistant', text: 'partial result', createdAt: '2026-11-01T00:00:01.000Z', runId: 'run-one', status: 'completed' }];
  const first = diff(view({ run: run('run-one', 'running') }));
  const failed = diff(view({ run: run('run-one', 'failed', { diagnostic: 'd'.repeat(800) }), entries: entries as any }), first.snapshot);
  assert.deepEqual(failed.events.map(event => event.type), ['run.failed']);
  assert.equal(failed.events[0]!.summary.length, 500);
  assert.equal(failed.events[0]!.finalReply, 'partial result');
  assert.match(failed.events[0]!.finalReplyUrl!, /\/runs\/run-one\/final-reply$/);
  const stopped = diff(view({ run: run('run-one', 'stopped'), entries: entries as any }), first.snapshot, context(NOW, []));
  assert.deepEqual(stopped.events.map(event => event.type), ['run.stopped']);
  assert.equal(stopped.events[0]!.finalReply, 'partial result');
});

test('run.stopped is suppressed for the credential that initiated the stop', () => {
  const first = diff(view({ run: run('run-one', 'running') }));
  const stopped = diff(view({ run: run('run-one', 'stopped') }), first.snapshot, context(NOW, ['run-one']));
  assert.deepEqual(stopped.events, []);
  const other = diff(view({ run: run('run-one', 'stopped') }), first.snapshot, context(NOW, []));
  assert.deepEqual(other.events.map(event => event.type), ['run.stopped']);
});

test('run.progress sends the first intermediate message immediately and coalesces later messages for five minutes', () => {
  const first = diff(view({ run: run('run-one', 'running', { tools: [{ id: 'tool-one', label: 'Command', status: 'completed', canStop: false }] }) }));
  assert.deepEqual(first.events, []);
  const one = [{ id: 'm1', sequence: 1, kind: 'message', role: 'assistant', text: 'first progress', createdAt: '2026-11-01T00:01:00.000Z', runId: 'run-one', status: 'completed' }];
  const second = diff(view({ updatedAt: '2026-11-01T00:01:00.000Z', run: run('run-one', 'running', { tools: [{ id: 'tool-one', label: 'Command', status: 'completed', canStop: false }] }), entries: one as any }), first.snapshot, context(NOW + MINUTE));
  assert.deepEqual(second.events.map(event => event.type), ['run.progress']);
  assert.deepEqual(second.events[0]!.progress, { text: 'first progress', elapsedMs: MINUTE, completedToolCount: 1 });

  const two = [...one, { id: 'm2', sequence: 2, kind: 'message', role: 'assistant', text: 'latest progress', createdAt: '2026-11-01T00:02:00.000Z', runId: 'run-one', status: 'completed' }];
  const third = diff(view({ updatedAt: '2026-11-01T00:02:00.000Z', run: run('run-one', 'running', { tools: [{ id: 'tool-one', label: 'Command', status: 'completed', canStop: false }] }), entries: two as any }), second.snapshot, context(NOW + 2 * MINUTE));
  assert.deepEqual(third.events, [], 'the next message is coalesced inside the five-minute interval');
  const due = timedPushbackNotifications(third.snapshot, context(NOW + 6 * MINUTE));
  assert.deepEqual(due.events.map(event => event.type), ['run.progress']);
  assert.equal(due.events[0]!.progress!.text, 'latest progress', 'only the newest message is sent after the interval');
  assert.equal(due.events[0]!.progress!.elapsedMs, 6 * MINUTE);
});

test('run.stalled fires after twenty minutes without a record, resets on recovery, then fires again', () => {
  const first = diff(view({ run: run('run-one', 'running') }));
  assert.deepEqual(first.events, []);
  const early = diff(view({ run: run('run-one', 'running') }), first.snapshot, context(NOW + 19 * MINUTE));
  assert.deepEqual(early.events, []);
  const stalled = diff(view({ run: run('run-one', 'running') }), early.snapshot, context(NOW + 20 * MINUTE));
  assert.deepEqual(stalled.events.map(event => event.type), ['run.stalled']);
  assert.equal(stalled.events[0]!.stalled!.idleMs, 20 * MINUTE);
  const again = diff(view({ run: run('run-one', 'running') }), stalled.snapshot, context(NOW + 21 * MINUTE));
  assert.deepEqual(again.events, [], 'a stalled run is not re-announced without recovery');

  const recoveredEntries = [{ id: 'm1', sequence: 1, kind: 'message', role: 'assistant', text: 'recovered', createdAt: '2026-11-01T00:21:00.000Z', runId: 'run-one', status: 'completed' }];
  const recovered = diff(view({ run: run('run-one', 'running'), entries: recoveredEntries as any }), again.snapshot, context(NOW + 22 * MINUTE));
  assert.deepEqual(recovered.events.map(event => event.type), ['run.progress']);
  const secondStall = diff(view({ run: run('run-one', 'running'), entries: recoveredEntries as any }), recovered.snapshot, context(NOW + 42 * MINUTE));
  assert.deepEqual(secondStall.events.map(event => event.type), ['run.stalled'], 'a full new twenty-minute idle period is required');
});

test('a fault alone does not claim a running execution is stalled', () => {
  const first = diff(view({ run: run('run-one', 'running') }));
  const faulted = diff(view({ run: run('run-one', 'running', { fault: { kind: 'transport' } }) }), first.snapshot);
  assert.deepEqual(faulted.events, [], 'run.stalled is about continuous inactivity, not a fault marker');
});

test('progress and stall switches suppress only their own new event types', () => {
  const disabled = { ...context(), progressEnabled: false, stalledEnabled: false };
  const first = diff(view({ run: run('run-one', 'running') }), undefined, disabled);
  const entries = [{ id: 'm1', sequence: 1, kind: 'message', role: 'assistant', text: 'intermediate', createdAt: '2026-11-01T00:01:00.000Z', runId: 'run-one', status: 'completed' }];
  const progressed = diff(view({ run: run('run-one', 'running'), entries: entries as any }), first.snapshot, { ...disabled, now: NOW + MINUTE });
  assert.deepEqual(progressed.events, []);
  const idle = diff(view({ run: run('run-one', 'running'), entries: entries as any }), progressed.snapshot, { ...disabled, now: NOW + 30 * MINUTE });
  assert.deepEqual(idle.events, []);
  assert.notEqual(idle.snapshot.runs['run-one']!.stalled, true, 'disabled stall detection does not consume the state');
});

test('tool and title changes do not create progress; a new assistant message does', () => {
  const first = diff(view({ run: run('run-one', 'starting') }));
  assert.deepEqual(first.events, []);
  const running = diff(view({ title: 'renamed', run: run('run-one', 'running'), entries: [{ id: 'm', sequence: 1, kind: 'message', role: 'assistant', text: 'partial', createdAt: '2026-11-01T00:00:01.000Z', runId: 'run-one' }] as any }), first.snapshot);
  assert.deepEqual(running.events.map(event => event.type), ['run.progress']);
  const tools = diff(view({ run: run('run-one', 'tools-active', { tools: [{ id: 'tool', label: 'Command', status: 'running' }] }), entries: [{ id: 'm', sequence: 1, kind: 'message', role: 'assistant', text: 'partial', createdAt: '2026-11-01T00:00:01.000Z', runId: 'run-one' }] as any }), running.snapshot);
  assert.deepEqual(tools.events, [], 'tool-only changes do not push intermediate chat text');
});

test('retained runs are diffed alongside the current run', () => {
  const first = diff(view({ run: run('run-two', 'running'), retainedRuns: [run('run-one', 'running')] }));
  const done = diff(view({ run: run('run-two', 'running'), retainedRuns: [run('run-one', 'completed')] }), first.snapshot);
  assert.deepEqual(done.events.map(event => event.type), ['run.completed']);
  assert.equal(done.events[0]!.runId, 'run-one');
  assert.ok(done.events[0]!.finalReplyUrl);
});
