import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { test } from 'node:test';
import { handoff, DESKTOP_HEADER } from '../src/handoff.ts';
import { desktopAdmission } from '../src/index.ts';
import { openHarness } from '../src/launcher.ts';

const origin = 'http://127.0.0.1:9519';
const valid = { origin, endpointId: 'same-endpoint', url: `${origin}/#ticket=${'a'.repeat(43)}`, expiresAt: 1000 };

test('handoff accepts only the unexpired ticket for an exact loopback origin', () => {
  assert.deepEqual(handoff(valid, 900), valid);
  for (const change of [
    { origin: 'http://localhost:9519' }, { url: valid.url.replace('9519', '9520') },
    { url: valid.url.replace('/#', '/another#') }, { url: valid.url.replace('/#', '/?value=1#') },
    { url: valid.url + '&next=https://example.com' }, { url: valid.url.replace('http://', 'http://user@') },
    { expiresAt: 900 }, { endpointId: '../other' },
  ]) assert.throws(() => handoff({ ...valid, ...change }, 900), /invalid-handoff/);
});

test('Host admits only the local native-proxied authenticated browser peer with no input body', () => {
  const peer = { id: 'browser' };
  const ctx = { webServer: { host: '127.0.0.1', register: () => () => {} }, connection: { browserPeer: peer, admit: () => ({ peer }) } };
  const req = (headers: IncomingMessage['headers'] = {}, method = 'POST') => ({ method, headers: { [DESKTOP_HEADER]: '1', ...headers } }) as IncomingMessage;
  assert.equal(desktopAdmission(ctx, req()), true);
  for (const request of [req({}, 'GET'), req({ origin: 'http://127.0.0.1:1234' }), req({ 'sec-fetch-site': 'same-origin' }),
    req({ [DESKTOP_HEADER]: undefined }), req({ 'content-length': '2' }), req({ 'transfer-encoding': 'chunked' }), req({ authorization: 'Bearer non-desktop' })]) {
    assert.equal(desktopAdmission(ctx, request), false);
  }
  assert.equal(desktopAdmission({ ...ctx, webServer: { ...ctx.webServer, host: '0.0.0.0' } }, req()), false);
  assert.equal(desktopAdmission({ ...ctx, connection: { browserPeer: peer, admit: () => ({ peer: { id: 'operator' } }) } }, req()), false);
  assert.equal(desktopAdmission({ ...ctx, connection: { browserPeer: peer, admit: () => ({ rejection: 401 }) } }, req()), false);
});

function client(initial: { ready: boolean; origin?: string; endpointId?: string }, issued = valid.endpointId) {
  const calls: unknown[] = [];
  const ready = { ready: true, origin, endpointId: valid.endpointId };
  return { calls, web: {
    status: async () => { calls.push('status'); return initial; },
    enable: async (input?: unknown) => { calls.push(['enable', input]); return ready; },
    login: async () => { calls.push('login'); return { ...valid, endpointId: issued, expiresAt: Date.now() + 1000 }; },
  }, disconnect: async () => { calls.push('disconnect'); } };
}

test('opening reuses a ready endpoint and never attempts to rebind it', async () => {
  const connected = client({ ready: true, origin, endpointId: valid.endpointId });
  assert.equal((await openHarness(connected, 9999)).origin, origin);
  assert.deepEqual(connected.calls, ['status', 'login', 'disconnect']);
});

test('first start supplies the configured port; resuming a previous endpoint does not', async () => {
  const missing = client({ ready: false });
  const existing = client({ ready: false, origin });
  await openHarness(missing, 9550); await openHarness(existing, 9550);
  assert.deepEqual(missing.calls, ['status', ['enable', { port: 9550 }], 'login', 'disconnect']);
  assert.deepEqual(existing.calls, ['status', ['enable', undefined], 'login', 'disconnect']);
});

test('a changed endpoint is not delivered to the guest and the client is always disconnected', async () => {
  const connected = client({ ready: true, origin, endpointId: valid.endpointId }, 'other-endpoint');
  await assert.rejects(openHarness(connected, 9519), /harness-endpoint-changed/);
  assert.deepEqual(connected.calls, ['status', 'login', 'disconnect']);
});
