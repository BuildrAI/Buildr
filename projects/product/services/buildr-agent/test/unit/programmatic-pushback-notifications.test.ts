import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pushbackNotifications, type PushbackSnapshot } from '../../src/domain/programmatic-pushback-notifications.ts';
import type { ConversationView, RunView } from '../../src/contracts.ts';

const NOW = Date.parse('2026-11-01T00:00:00.000Z');
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
const context = (now = NOW, stopped: string[] = [], stalledThresholdMs = 300000) => ({ now, stoppedByCredential: new Set(stopped), stalledThresholdMs });
const diff = (current: ConversationView, prior?: PushbackSnapshot, ctx = context()) => pushbackNotifications(current, prior, ctx);

test('a new approval request emits decision.requested once and maps its options', () => {
  const request = { id: 'permit-one', kind: 'approval' as const, title: 'Write a file?', runId: 'run-one', participantId: 'p', generation: 'g', options: [{ id: 'allow', label: 'Allow', description: 'once' }, { id: 'deny', label: 'Deny' }] };
  const first = diff(view({ run: run('run-one', 'waiting-approval'), requests: [request as any] }));
  assert.deepEqual(first.events.map(event => event.type), ['decision.requested']);
  const event = first.events[0]!;
  assert.equal(event.request!.requestId, 'permit-one');
  assert.equal(event.request!.kind, 'approval');
  assert.deepEqual(event.request!.options, [{ id: 'allow', label: 'Allow', description: 'once' }, { id: 'deny', label: 'Deny' }]);
  assert.equal(event.runStatus, 'waiting-approval');
  assert.equal(event.occurredAt, '2026-11-01T00:00:00.000Z');
  const again = diff(view({ run: run('run-one', 'waiting-approval'), requests: [request as any] }), first.snapshot);
  assert.deepEqual(again.events, [], 'an unchanged request is not re-announced');
});

test('a question request maps its first question options and re-announces when the signature changes', () => {
  const base = { id: 'question-one', kind: 'question' as const, title: '处理范围', runId: 'run-one', participantId: 'p', generation: 'g', questions: [{ id: 'scope', label: '范围', options: [{ id: 'yes', label: '确认' }] }] };
  const first = diff(view({ run: run('run-one', 'waiting-question'), requests: [base as any] }));
  assert.deepEqual(first.events.map(event => event.type), ['decision.requested']);
  assert.deepEqual(first.events[0]!.request!.options, [{ id: 'yes', label: '确认' }]);
  const changed = diff(view({ run: run('run-one', 'waiting-question'), requests: [{ ...base, title: '新的范围' } as any] }), first.snapshot);
  assert.deepEqual(changed.events.map(event => event.type), ['decision.requested'], 'a changed title is a new decision');
});

test('run.completed carries the final assistant reply trimmed to 500 characters', () => {
  const long = 'x'.repeat(900);
  const entries = [{ id: 'm1', sequence: 1, kind: 'message', role: 'assistant', text: long, createdAt: 'now', runId: 'run-one', status: 'completed' }];
  const first = diff(view({ run: run('run-one', 'running') }));
  const done = diff(view({ run: run('run-one', 'completed'), entries: entries as any }), first.snapshot);
  assert.deepEqual(done.events.map(event => event.type), ['run.completed']);
  assert.equal(done.events[0]!.summary.length, 500);
  assert.equal(done.events[0]!.runId, 'run-one');
  assert.equal(done.events[0]!.runStatus, 'completed');
});

test('run.failed carries the diagnostic trimmed to 500 characters', () => {
  const first = diff(view({ run: run('run-one', 'running') }));
  const failed = diff(view({ run: run('run-one', 'failed', { diagnostic: 'd'.repeat(800) }) }), first.snapshot);
  assert.deepEqual(failed.events.map(event => event.type), ['run.failed']);
  assert.equal(failed.events[0]!.summary.length, 500);
});

test('run.stopped is emitted for observers but suppressed for the credential that initiated the stop', () => {
  const first = diff(view({ run: run('run-one', 'running') }));
  const stopped = diff(view({ run: run('run-one', 'stopped') }), first.snapshot, context(NOW, ['run-one']));
  assert.deepEqual(stopped.events, [], 'the initiating credential does not receive its own stop');
  const other = diff(view({ run: run('run-one', 'stopped') }), first.snapshot, context(NOW, []));
  assert.deepEqual(other.events.map(event => event.type), ['run.stopped']);
});

test('a fault emits run.stalled immediately and only once', () => {
  const first = diff(view({ run: run('run-one', 'running') }));
  const faulted = diff(view({ run: run('run-one', 'running', { fault: { kind: 'transport' } }) }), first.snapshot);
  assert.deepEqual(faulted.events.map(event => event.type), ['run.stalled']);
  const again = diff(view({ run: run('run-one', 'running', { fault: { kind: 'transport' } }) }), faulted.snapshot);
  assert.deepEqual(again.events, [], 'a stalled run is not re-announced');
});

test('unknown becomes run.stalled only after the continuous threshold elapses', () => {
  const first = diff(view({ run: run('run-one', 'unknown') }), undefined, context(NOW));
  assert.deepEqual(first.events, [], 'unknown alone is not yet stalled');
  assert.equal(first.snapshot.runs['run-one']!.unknownSince, NOW);
  const early = diff(view({ run: run('run-one', 'unknown') }), first.snapshot, context(NOW + 299999));
  assert.deepEqual(early.events, []);
  const late = diff(view({ run: run('run-one', 'unknown') }), first.snapshot, context(NOW + 300000));
  assert.deepEqual(late.events.map(event => event.type), ['run.stalled']);
  assert.equal(late.events[0]!.runStatus, 'unknown');
});

test('streaming, running transitions and title changes produce no events', () => {
  const first = diff(view({ run: run('run-one', 'starting') }));
  assert.deepEqual(first.events, []);
  const running = diff(view({ run: run('run-one', 'running'), title: 'renamed', entries: [{ id: 'm', sequence: 1, kind: 'message', role: 'assistant', text: 'partial', createdAt: 'now' }] as any }), first.snapshot);
  assert.deepEqual(running.events, []);
  const tools = diff(view({ run: run('run-one', 'tools-active') }), running.snapshot);
  assert.deepEqual(tools.events, []);
});

test('retained runs are diffed alongside the current run', () => {
  const first = diff(view({ run: run('run-two', 'running'), retainedRuns: [run('run-one', 'running')] }));
  const done = diff(view({ run: run('run-two', 'running'), retainedRuns: [run('run-one', 'completed')] }), first.snapshot);
  assert.deepEqual(done.events.map(event => event.type), ['run.completed']);
  assert.equal(done.events[0]!.runId, 'run-one');
});