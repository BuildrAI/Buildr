import test from 'node:test';
import assert from 'node:assert/strict';
import { qoderAccountFailure, qoderAuthenticationError } from '../../src/model-access/providers/qoder-auth.ts';
import { createQoderModelProvider } from '../../src/model-access/providers/qoder.ts';

test('Qoder explicit expiration is recognized without the SDK expiry callback', () => {
  for (const error of [
    new Error('Local login has expired. Run "qodercli login" to refresh.'),
    { code: '105', message: 'Login expired' },
    { code: 'TOKEN_EXPIRE', message: 'token is not active' },
  ]) {
    const result = qoderAccountFailure(error);
    assert.equal(result.status, 'expired');
    assert.match(result.diagnostic!, /团队账号额度已用尽.*更换有额度/);
  }
  assert.equal(qoderAccountFailure(new Error('unknown'), true).status, 'expired');
  assert.equal(qoderAccountFailure(new Error('No qodercli login found. Run "qodercli login" first.')).status, 'not-authenticated');
  for (const message of ['fetch failed', 'ETIMEDOUT', 'insufficient_quota', 'credits exhausted', 'permission denied']) {
    assert.equal(qoderAccountFailure(new Error(message)).status, 'failed');
    assert.equal(qoderAuthenticationError(403, { message }), undefined);
  }
  assert.equal(qoderAuthenticationError(403, { code: '105', message: 'Login expired' })?.code, 'qoder_platform_login_expired');
  assert.equal(qoderAuthenticationError(401, {})?.code, 'qoder_platform_login_expired');
});

test('Qoder authenticates with the catalog and overlaps quota, without an additional SDK account query', async () => {
  let release!: () => void;
  const catalogGate = new Promise<void>(resolve => { release = resolve; });
  const calls: string[] = [];
  const runtime = await createQoderModelProvider({
    inspect: async () => { throw new Error('must not start another SDK account query'); },
    identity: async () => 'personal-account',
    async request(path) {
      calls.push(path);
      if (path === '/models') { await catalogGate; return Response.json({ chat: [{ key: 'model', enable: true }] }); }
      return Response.json({ userType: 'personal_lite', userQuota: { total: 100, remaining: 80 } });
    },
  }).open({ accountId: 'native-qoder', configRoot: 'unused', environment: {} });
  try {
    const pending = runtime.inspect();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['/models', '/usage'], 'quota starts before the catalog responds');
    release();
    const result = await pending;
    assert.equal(result.status, 'ready');
    assert.equal(result.identity, 'personal-account');
    assert.equal(result.quota?.remainingPercent, 80);
  } finally { release(); await runtime.close(); }
});

test('Qoder team exhaustion gives an account-switch action, while zero quota is not authentication expiry', async () => {
  for (const userType of ['teams', 'personal_lite']) {
    const runtime = await createQoderModelProvider({
      inspect: async () => ({ status: 'ready' }),
      identity: async () => userType,
      request: async path => Response.json(path === '/models' ? { chat: [{ key: 'model' }] } : { userType, userQuota: { total: 100, remaining: 0 } }),
    }).open({ accountId: 'native-qoder', configRoot: 'unused', environment: {} });
    try {
      const result = await runtime.inspect();
      assert.equal(result.status, 'ready', 'exhaustion does not fabricate logout');
      if (userType === 'teams') assert.match(result.diagnostic!, /团队账号额度已用尽.*更换有额度/);
      else assert.equal(result.diagnostic, undefined);
    } finally { await runtime.close(); }
  }
});

test('Qoder HTTP 403 expiration is definitive; permission, quota and network failures are not logout', async () => {
  for (const kind of ['expired', 'permission', 'network', 'quota']) {
    const runtime = await createQoderModelProvider({
      inspect: async () => ({ status: 'ready' }),
      identity: async () => 'same-account',
      async request(path) {
        if (path === '/usage') return Response.json({});
        if (kind === 'network') throw new Error('network private-secret');
        if (kind === 'quota') return Response.json({ code: 'insufficient_quota', message: 'credits exhausted' }, { status: 403 });
        return Response.json({ code: kind === 'expired' ? '105' : 'forbidden', message: kind === 'expired' ? 'Login expired' : 'permission denied' }, { status: 403 });
      },
    }).open({ accountId: 'native-qoder', configRoot: 'unused', environment: {} });
    try {
      const result = await runtime.inspect();
      assert.equal(result.status, kind === 'expired' ? 'expired' : 'failed');
      assert.equal(result.incomplete, kind !== 'expired');
      assert.equal(result.identity, 'same-account');
      if (kind === 'quota') assert.match(result.diagnostic!, /团队账号额度用尽.*更换有额度/);
      assert.doesNotMatch(JSON.stringify(result), /private-secret/);
    } finally { await runtime.close(); }
  }
});

test('Qoder does not attach an earlier account response to a new login', async () => {
  let reads = 0;
  const runtime = await createQoderModelProvider({
    inspect: async () => ({ status: 'ready' }),
    identity: async () => ++reads === 1 ? 'old-team' : 'new-personal',
    request: async path => Response.json(path === '/models' ? { chat: [{ key: 'old-model' }] } : { userType: 'teams', userQuota: { total: 100, remaining: 0 } }),
  }).open({ accountId: 'native-qoder', configRoot: 'unused', environment: {} });
  try {
    const result = await runtime.inspect();
    assert.equal(result.identity, 'new-personal');
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.models, []);
    assert.equal(result.quota, undefined);
  } finally { await runtime.close(); }
});
