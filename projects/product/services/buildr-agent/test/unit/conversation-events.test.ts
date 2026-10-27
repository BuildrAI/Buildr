import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConversationEvents } from '../../src/application/conversation-events.ts';
import type { ServiceEvent } from '../../src/contracts.ts';

function change(revision: string, text = ''): Omit<ServiceEvent, 'cursor' | 'generation'> {
  return { type: 'conversation', workspaceId: 'workspace-one', conversationId: 'conversation-one', revision, payload: { conversation: {
    id: 'conversation-one', workspaceId: 'workspace-one', cwd: '/workspace', title: 'work', revision, hidden: false, updatedAt: '2026-10-23T00:00:00.000Z', participants: [], requests: [],
    entries: text ? Array.from({ length: 8 }, (_, index) => ({ id: `message-${index}`, sequence: index + 1, createdAt: '2026-10-23T00:00:00.000Z', kind: 'message' as const, role: 'assistant' as const, text })) : [],
  } } };
}

test('one slow observer keeps only the latest conversation state without blocking a fast observer', async () => {
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
  const slowIterator = slow.events[Symbol.asyncIterator]();
  assert.equal((await slowIterator.next()).value!.type, 'snapshot');
  const jumped = (await slowIterator.next()).value!;
  assert.equal(jumped.cursor, 1_002, 'superseded conversation states are not replayed');
  assert.equal(jumped.revision, 'revision-1002');
  slow.close();
  assert.equal((await slowIterator.next()).done, true);
  const reconnected = events.subscribe({ ...snapshot, revision: 'revision-1002' }, () => true);
  const reconnectIterator = reconnected.events[Symbol.asyncIterator]();
  const latest = (await reconnectIterator.next()).value!;
  assert.equal(latest.type, 'snapshot'); assert.equal(latest.cursor, 1_002); assert.equal(latest.revision, 'revision-1002');
  events.close();
  assert.equal((await fastIterator.next()).done, true); assert.equal((await reconnectIterator.next()).done, true);
});

function connectionEvent(revision: string, padding = ''): Omit<ServiceEvent, 'cursor' | 'generation'> {
  return { type: 'connection', workspaceId: 'workspace-one', conversationId: 'conversation-one', revision, payload: { connection: {
    id: 'codex', provider: 'codex', label: 'Codex' + padding, revision, status: 'ready', enabled: true, models: [],
    capabilities: { text: true, images: false, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 65536 },
  } } };
}

test('the byte limit still closes a slow observer and does not replay an overflowing event', async () => {
  const events = new ConversationEvents('generation-one');
  const subscription = events.subscribe({ ...change('snapshot'), type: 'snapshot' }, () => true);
  const item = 'x'.repeat(4 * 1024 * 1024);
  events.publish(connectionEvent('fits', item));
  events.publish(connectionEvent('exceeds-eight-MiB', item));
  const revisions = [];
  for await (const event of subscription.events) revisions.push(event.revision);
  assert.deepEqual(revisions, ['snapshot', 'fits'], 'the overflowing event is dropped and the stream ends');
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
