import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationEventDecoder, conversationEventEncoder } from '../../src/domain/conversation-transfer.ts';
import { pendingConversationSummary } from '../../src/domain/pending-summary.ts';
import type { ServiceEvent } from '../../src/contracts.ts';

function event(cursor: number): ServiceEvent {
  return { cursor, generation: 'generation', type: cursor ? 'conversation' : 'snapshot',
    workspaceId: 'workspace', conversationId: 'chat', revision: `r${cursor}`,
    payload: { conversation: { id: 'chat', workspaceId: 'workspace', cwd: '/workspace', title: 'work',
      hidden: false, revision: `r${cursor}`, updatedAt: 'now', participants: [], requests: [],
      entries: Array.from({ length: 60 }, (_, i) => ({
        id: `entry-${i}`, sequence: i + 1, kind: 'message', role: 'assistant',
        text: 'history '.repeat(1024), createdAt: 'now',
      })) } } };
}

test('long conversation deltas preserve changed, added, deleted and reordered entries and remove metadata', () => {
  const encode = conversationEventEncoder(), decode = conversationEventDecoder();
  const first = event(0);
  first.payload.conversation!.taskId = 'removed-task';
  assert.deepEqual(decode(encode(first)), first);
  const next = event(1), view = next.payload.conversation!;
  view.entries.pop(); view.entries.reverse();
  view.entries[0] = { ...view.entries[0]!, text: 'new text' };
  view.entries.push({ ...view.entries[0]!, id: 'added', sequence: 61 });
  const wire = encode(next);
  assert.equal(wire.payload.delta!.entries.length, 2);
  assert.equal(wire.payload.conversation, undefined);
  assert.ok(JSON.stringify(wire).length < JSON.stringify(next).length / 20);
  assert.deepEqual(decode(wire), next);
  assert.equal(decode(encode(event(2))).payload.conversation!.taskId, undefined);
  console.log(`long-conversation fixture: full=${JSON.stringify(next).length} delta=${JSON.stringify(wire).length}`);
});

test('mismatched cursor, revision, generation, scope, missing and duplicate entries refuse delta assembly', () => {
  const encode = conversationEventEncoder(), first = event(0);
  encode(first);
  const wire = encode(event(1));
  for (const change of [
    (x: any) => { x.payload.delta.baseCursor++; },
    (x: any) => { x.payload.delta.baseRevision = 'stale'; },
    (x: any) => { x.generation = 'other'; },
    (x: any) => { x.conversationId = 'other'; },
    (x: any) => { x.workspaceId = 'other'; },
    (x: any) => { x.payload.delta.entryIds.push('missing'); },
    (x: any) => { x.payload.delta.entryIds.push(x.payload.delta.entryIds[0]); },
  ]) {
    const decode = conversationEventDecoder(); decode(first);
    const invalid = structuredClone(wire); change(invalid);
    assert.throws(() => decode(invalid), /conversation_delta_/);
  }
  assert.throws(() => conversationEventDecoder()(wire), /baseline/);
});

test('new subscriptions, snapshots, generation changes and larger deltas use complete events', () => {
  const encode = conversationEventEncoder(), first = event(0);
  assert.deepEqual(encode(first), first);
  const changed = event(1);
  for (const entry of changed.payload.conversation!.entries) entry.text += 'new';
  assert.deepEqual(encode(changed), changed);
  const snapshot = { ...event(2), type: 'snapshot' as const };
  assert.deepEqual(encode(snapshot), snapshot);
  const generation = { ...event(3), generation: 'new-generation' };
  assert.deepEqual(encode(generation), generation);
  assert.deepEqual(conversationEventEncoder()(event(10)), event(10));
});

test('pending summaries contain only required reminder data, never native or user content', () => {
  const view = event(0).payload.conversation!;
  const summary = pendingConversationSummary(view);
  assert.deepEqual(summary, { conversationId: 'chat', workspaceId: 'workspace', title: 'work', status: 'unknown', count: 0 });
  assert.ok(JSON.stringify(summary).length < JSON.stringify(view).length / 100);
});
