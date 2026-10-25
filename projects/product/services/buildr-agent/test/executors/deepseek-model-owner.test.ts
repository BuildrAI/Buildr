import test from 'node:test';
import assert from 'node:assert/strict';
import { startDeepSeekOwnerServer } from '../../src/executors/dsh/model-source-plugin.ts';
import { createDeepSeekAccountOwner } from '../../src/executors/dsh/model-source-owner.ts';

test('DeepSeek native owner authenticates loopback calls and never exports its grant', async () => {
  const targets: string[] = [], rejected: string[] = []; let responseStatus = 200;
  const upstream: typeof fetch = async (url, init) => {
    targets.push(String(url));
    assert.equal(new Headers(init?.headers).get('x-dsh-auth-token'), 'native-owner-grant');
    assert.equal(new Headers(init?.headers).get('authorization'), null);
    assert.equal(init?.redirect, 'manual');
    return new Response('data: complete\n\n', { status: responseStatus, headers: { 'content-type': 'text/event-stream', 'set-cookie': 'private', 'x-dsh-auth-token': 'native-owner-grant' } });
  };
  const server = await startDeepSeekOwnerServer({ resolveToken: async url => { assert.ok(url.startsWith('https://api.deepseek.com/')); return 'native-owner-grant'; }, rejectToken: async token => { rejected.push(token); } }, 'local-key', upstream);
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${base}/models`)).status, 401);
    assert.equal((await fetch(`${base}/auth-api/steal`, { headers: { Authorization: 'Bearer local-key' } })).status, 404);
    assert.equal(targets.length, 0);
    const response = await fetch(`${base}/anthropic/v1/messages`, { method: 'POST', headers: { Authorization: 'Bearer local-key', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(await response.text(), 'data: complete\n\n');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('x-dsh-auth-token'), null);
    assert.deepEqual(targets, ['https://api.deepseek.com/anthropic/v1/messages']);
    responseStatus = 401;
    const failure = await fetch(`${base}/models`, { headers: { Authorization: 'Bearer local-key' } }); await failure.text();
    assert.deepEqual(rejected, ['native-owner-grant']);
    responseStatus = 302;
    assert.equal((await fetch(`${base}/models`, { headers: { Authorization: 'Bearer local-key' } })).status, 502);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('DeepSeek source refuses non-model destinations before opening a native profile', async () => {
  const owner = createDeepSeekAccountOwner({ configRoot: '/not-opened-in-test', executable: '/not-opened-in-test', environment: {} });
  await assert.rejects(owner.request('https://attacker.example/models'), /target_invalid/);
  await assert.rejects(owner.request('https://api.deepseek.com/models?redirect=1'), /target_invalid/);
  await assert.rejects(owner.request('https://api.deepseek.com/auth-api/v0/users/current'), /target_invalid/);
});
