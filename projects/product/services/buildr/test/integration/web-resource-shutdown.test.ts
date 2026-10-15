import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';

test('failed bind attempts do not close application resources needed by the fallback host', async t => {
  const occupied = http.createServer();
  await new Promise<void>(resolve => occupied.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => occupied.close(() => resolve())));
  const address = occupied.address();
  assert.ok(address && typeof address !== 'string');
  let closes = 0;
  const options = {
    ensureRegisteredTarget: () => null,
    resolveRegisteredWorkspace: () => { throw new Error('No workspace in this fixture.'); },
    httpContributions: [{ taskIdSource: '[a-z0-9-]+' }],
    readExecutor: { close: async () => {}, run: () => { throw new Error('Unexpected read.'); } },
    beforeShutdown: async () => { closes++; },
  };
  const failed = createLocalWorkspaceServer({}, { ...options, port: address.port });
  await assert.rejects(failed.ready, (error: NodeJS.ErrnoException) => error.code === 'EADDRINUSE');
  await new Promise<void>(resolve => failed.server.close(() => resolve()));
  assert.equal(closes, 0);
  const fallback = createLocalWorkspaceServer({}, options);
  t.after(() => fallback.shutdown());
  await fallback.ready;
  assert.equal(closes, 0, 'the shared application remains usable after the fallback binds');
  await fallback.shutdown();
  assert.equal(closes, 1);
});

test('Web quit waits for owned resources, rejects new work and closes only once', async t => {
  const events: string[] = [];
  let release!: () => void;
  let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const cleanup = new Promise<void>(resolve => { release = resolve; });
  const instance = createLocalWorkspaceServer({}, {
    ensureRegisteredTarget: () => null,
    resolveRegisteredWorkspace: () => { throw new Error('No workspace in this fixture.'); },
    httpContributions: [{ taskIdSource: '[a-z0-9-]+' }],
    readExecutor: { close: async () => {}, run: () => { throw new Error('Unexpected read.'); } },
    beforeShutdown: async () => { events.push('resources-start'); began(); await cleanup; events.push('resources-closed'); },
    onShutdown: () => { events.push('host-closed'); },
  });
  t.after(async () => { release(); await instance.shutdown(); });
  const ready = await instance.ready;
  const response = await fetch(ready.url + '/api/v1/app/quit', {
    method: 'POST', headers: { origin: ready.url, 'x-buildr-session': ready.sessionToken, 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 202);
  await started;
  assert.equal(instance.server.listening, true, 'owned resources must close before the HTTP host exits');
  const unavailable = await fetch(ready.url + '/');
  assert.equal(unavailable.status, 503);
  const first = instance.shutdown();
  assert.equal(first, instance.shutdown(), 'all shutdown entry points share one cleanup');
  release();
  await first;
  assert.equal(instance.server.listening, false);
  assert.deepEqual(events, ['resources-start', 'resources-closed', 'host-closed']);
});

test('resource cleanup failure closes the HTTP host but cannot report a successful shutdown', async () => {
  const failure = new Error('owned process exit unconfirmed');
  let observed: unknown;
  const instance = createLocalWorkspaceServer({}, {
    ensureRegisteredTarget: () => null,
    resolveRegisteredWorkspace: () => { throw new Error('No workspace in this fixture.'); },
    httpContributions: [{ taskIdSource: '[a-z0-9-]+' }],
    readExecutor: { close: async () => {}, run: () => { throw new Error('Unexpected read.'); } },
    beforeShutdown: async () => { throw failure; },
    onShutdown: (error: unknown) => { observed = error; },
  });
  await instance.ready;
  await assert.rejects(instance.shutdown(), error => error === failure);
  assert.equal(instance.server.listening, false);
  assert.equal(observed, failure);
});
