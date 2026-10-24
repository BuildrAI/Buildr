import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConversationEvents } from '../src/application/conversation-events.ts';
import type { ServiceEvent } from '../src/contracts.ts';

function change(revision: string, text = ''): Omit<ServiceEvent, 'cursor' | 'generation'> {
  return { type: 'conversation', workspaceId: 'workspace-one', conversationId: 'conversation-one', revision, payload: { conversation: {
    id: 'conversation-one', workspaceId: 'workspace-one', cwd: '/workspace', title: 'work', revision, hidden: false, updatedAt: '2026-10-23T00:00:00.000Z', participants: [], requests: [],
    entries: text ? Array.from({ length: 8 }, (_, index) => ({ id: `message-${index}`, sequence: index + 1, createdAt: '2026-10-23T00:00:00.000Z', kind: 'message' as const, role: 'assistant' as const, text })) : [],
  } } };
}

test('one slow observer is bounded without blocking a fast observer, and reconnect starts at a current snapshot', async () => {
  const events = new ConversationEvents('generation-one');
  const snapshot = { ...change('snapshot'), type: 'snapshot' as const };
  const slow = events.subscribe(snapshot, () => true);
  const fast = events.subscribe(snapshot, () => true);
  const fastIterator = fast.events[Symbol.asyncIterator]();
  assert.equal((await fastIterator.next()).value!.cursor, 0);
  for (let index = 1; index <= 1_002; index++) {
    events.publish(change(`revision-${index}`));
    assert.equal((await fastIterator.next()).value!.cursor, index);
  }
  const buffered = [];
  for await (const event of slow.events) buffered.push(event);
  assert.equal(buffered.length, 1_000, 'the snapshot and queued changes share one bounded event budget');
  assert.equal(buffered[0]!.type, 'snapshot'); assert.equal(buffered.at(-1)!.cursor, 999);
  const reconnected = events.subscribe({ ...snapshot, revision: 'revision-1002' }, () => true);
  const reconnectIterator = reconnected.events[Symbol.asyncIterator]();
  const latest = (await reconnectIterator.next()).value!;
  assert.equal(latest.type, 'snapshot'); assert.equal(latest.cursor, 1_002); assert.equal(latest.revision, 'revision-1002');
  events.close();
  assert.equal((await fastIterator.next()).done, true); assert.equal((await reconnectIterator.next()).done, true);
});

test('the byte limit closes a slow observer before the event-count limit and does not replay an overflowing event', async () => {
  const events = new ConversationEvents('generation-one');
  const subscription = events.subscribe({ ...change('snapshot'), type: 'snapshot' }, () => true);
  const item = 'x'.repeat(512 * 1024);
  events.publish(change('fits', item));
  events.publish(change('exceeds-eight-MiB', item));
  const revisions = [];
  for await (const event of subscription.events) revisions.push(event.revision);
  assert.deepEqual(revisions, ['snapshot', 'fits']);
  events.close();
});

test('nonmatching workspace changes do not consume a subscription queue and explicit close wakes a waiting reader', async () => {
  const events = new ConversationEvents('generation-one');
  const subscription = events.subscribe({ ...change('snapshot'), type: 'snapshot' }, event => event.workspaceId === 'workspace-one');
  for (let index = 0; index < 1_500; index++) events.publish({ ...change(`foreign-${index}`), workspaceId: 'another-workspace' });
  const iterator = subscription.events[Symbol.asyncIterator]();
  assert.equal((await iterator.next()).value!.type, 'snapshot');
  const waiting = iterator.next(); subscription.close();
  assert.equal((await waiting).done, true);
  events.close();
});
