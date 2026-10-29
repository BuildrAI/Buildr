import assert from 'node:assert/strict';
import test from 'node:test';
import { authorize, json, listen, privateToken, request } from '../../src/process/transport.ts';

test('accepted response finishes before the execution channel closes', { timeout: 10_000 }, async t => {
  // Exceed the socket write buffer so shutdown cannot race an unflushed body.
  const token = privateToken(), payload = 'accepted '.repeat(1_048_576);
  let channel: Awaited<ReturnType<typeof listen>>, closing: Promise<void> | undefined;
  channel = await listen(async (req, res) => {
    authorize(req, token);
    json(res, 200, { payload });
    closing = channel.close();
  });
  t.after(() => channel.close());
  const result = await request(channel.origin, token, '/runtime', { expectedGeneration: 'fixture' });
  assert.equal(result.payload, payload);
  await closing;
});

test('channel close still reclaims an unfinished event stream', { timeout: 10_000 }, async t => {
  const channel = await listen(async (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: ready\n\n');
  });
  t.after(() => channel.close());
  const response = await fetch(channel.origin);
  const reader = response.body!.getReader();
  assert.equal((await reader.read()).done, false);
  const ended = reader.read().then(result => result.done, () => true);
  await Promise.all([channel.close(), channel.close()]);
  assert.equal(await ended, true);
  reader.releaseLock();
});
