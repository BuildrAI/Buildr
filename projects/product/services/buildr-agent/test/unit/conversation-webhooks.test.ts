import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { ConversationWebhooks } from '../../src/application/conversation-webhooks.ts';
import { ConversationEvents } from '../../src/application/conversation-events.ts';
import type { ServiceEvent, RunView } from '../../src/contracts.ts';

const env = { BUILDR_AGENT_WEBHOOK_URL: 'https://notify.example.test', BUILDR_AGENT_WEBHOOK_SECRET: 'private-test-key' };
function change(status = 'running', request?: 'approval' | 'question'): Omit<ServiceEvent, 'cursor' | 'generation'> {
  return { type: 'conversation', revision: '1', payload: { conversation: {
    id: 'conversation', workspaceId: 'workspace', cwd: '/', title: 'sensitive title', revision: '1', hidden: false,
    updatedAt: '2026-11-03T00:00:00.000Z', participants: [], entries: [],
    run: { id: 'run', status } as RunView,
    requests: request ? [{ id: 'request', kind: request, title: 'sensitive question', runId: 'run', conversationId: 'conversation', workspaceId: 'workspace', participantId: 'p', generation: 'g' }] : [],
  } } };
}

test('configuration is opt-in and rejects unsafe URLs and invalid header secrets', () => {
  for (const value of [{}, { ...env, BUILDR_AGENT_WEBHOOK_SECRET: '' }, { ...env, BUILDR_AGENT_WEBHOOK_URL: 'file:///tmp/test' },
    { ...env, BUILDR_AGENT_WEBHOOK_URL: 'https://user:password@example.test' }, { ...env, BUILDR_AGENT_WEBHOOK_SECRET: 'key\r\nheader' }]) {
    assert.equal(ConversationWebhooks.configure(value), undefined);
  }
});

test('event outlet maps four types, deduplicates and sends only safe JSON', async () => {
  const sent: RequestInit[] = [];
  const hook = ConversationWebhooks.configure(env, async (_url, init) => { sent.push(init!); return new Response(null, { status: 204 }); })!;
  const events = new ConversationEvents('g', hook);
  events.publish(change());
  for (const event of [change('completed'), change('failed'), change('waiting-question', 'question'), change('waiting-approval', 'approval')]) {
    events.publish(event); events.publish(event);
  }
  await setImmediate();
  assert.equal(sent.length, 4);
  assert.deepEqual(sent.map(init => JSON.parse(String(init.body)).eventType), ['completed', 'error', 'pending_question', 'pending_approval']);
  for (const init of sent) {
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
    assert.equal((init.headers as Record<string,string>).authorization, 'Bearer private-test-key');
    const body = JSON.parse(String(init.body));
    assert.equal(body.workspaceId, 'workspace'); assert.equal(body.conversationId, 'conversation');
    assert.equal(body.timestamp, '2026-11-03T00:00:00.000Z'); assert.equal(body.eventId.length, 64);
    assert.ok(!String(init.body).includes('sensitive')); assert.ok(!String(init.body).includes(env.BUILDR_AGENT_WEBHOOK_SECRET));
  }
  events.close();
});

test('transport failures and HTTP errors never escape or retry', async () => {
  for (const transport of [async () => { throw new Error('private failure'); }, async () => new Response(null, { status: 500 })]) {
    let attempts = 0;
    const hook = ConversationWebhooks.configure(env, async () => { attempts++; return transport(); })!;
    hook.publish(change('completed')); await setImmediate(); hook.publish(change('completed')); await setImmediate();
    assert.equal(attempts, 1); hook.close();
  }
});

test('concurrency is bounded and shutdown aborts active requests', () => {
  const signals: AbortSignal[] = [];
  const hook = ConversationWebhooks.configure(env, async (_url, init) => {
    signals.push(init!.signal!); return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
  })!;
  for (let i = 0; i < 20; i++) { const event = change('completed'); event.payload.conversation!.run!.id = String(i); hook.publish(event); }
  assert.equal(signals.length, 16); hook.close(); assert.ok(signals.every(signal => signal.aborted));
  hook.publish(change('failed')); assert.equal(signals.length, 16);
});
