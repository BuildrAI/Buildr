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
  const emptyAccount=Object.assign(new Error('Authentication required. Log in with qodercli login or provide valid SDK credentials.'),{name:'ControlRequestError'});
  assert.equal(qoderAccountFailure(emptyAccount).status, 'not-authenticated');
  assert.equal(qoderAccountFailure(new Error('Authentication required.')).status, 'failed', 'ambiguous messages are not proof of missing login');
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

test('Qoder CN is an independent product with its own endpoints and login text', async () => {
  const { qoderProduct } = await import('../../src/executors/qoder/product.ts');
  const cn = qoderProduct('qoder-cn'), intl = qoderProduct('qoder');
  assert.equal(cn.label, 'Qoder CN');
  assert.equal(cn.configDirectory, 'qoder-cn-config');
  assert.equal(cn.configEnvironment, 'QODERCN_CONFIG_DIR');
  assert.deepEqual(cn.executableNames.slice(0, 2), ['qodercn', 'qoderclicn']);
  assert.equal(cn.api.gateway, 'https://gateway.qoder.com.cn');
  assert.equal(cn.api.openapi, 'https://openapi.qoder.com.cn');
  assert.equal(intl.api.gateway, 'https://api3.qoder.sh');
  assert.notEqual(cn.configDirectory, intl.configDirectory);
  assert.equal(qoderAccountFailure(new Error('No qodercn login found. Run "qodercn login" first.'), false, cn.label).status, 'not-authenticated');
  assert.match(qoderAccountFailure(new Error('unknown'), false, cn.label).diagnostic!, /Qoder CN 账号检查未完成/);
});

test('Qoder CN provider keeps its own identity namespace', async () => {
  const owner = {
    inspect: async () => ({ status: 'ready' as const }),
    identity: async () => 'qoder-cn:account-a',
    request: async () => Response.json({ chat: [{ key: 'cn-model', enable: true }], userType: 'personal_lite', userQuota: { total: 10, remaining: 5 } }),
  };
  const runtime = await createQoderModelProvider(owner, 'qoder-cn').open({ accountId: 'native-qoder-cn', configRoot: 'unused', environment: {} });
  try {
    const provider = createQoderModelProvider(owner, 'qoder-cn');
    assert.equal(provider.id, 'native-qoder-cn');
    assert.equal(provider.label, 'Qoder CN');
    assert.equal(provider.connectionId, 'qoder-cn');
    const result = await runtime.inspect();
    assert.equal(result.status, 'ready');
    assert.equal(result.label, 'Qoder CN');
    assert.equal(result.quota?.summary?.startsWith('Qoder CN · '), true);
    assert.deepEqual(result.models.map(model => model.id), ['cn-model']);
  } finally { await runtime.close(); }
});

test('Qoder CN plan failures are quota errors, not expired logins', async () => {
  const { requestQoderModel } = await import('../../src/model-access/providers/qoder.ts');
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createCipheriv } = await import('node:crypto');
  const root = await mkdtemp(join(tmpdir(), 'qoder-cn-quota-'));
  try {
    // Reproduce the native credential layout: AES-128-CBC of the user record keyed by the machine id.
    await mkdir(join(root, '.auth'), { recursive: true, mode: 0o700 });
    const machine = 'machine-id-fixture-1';
    await writeFile(join(root, '.auth', 'machine_id'), machine, { mode: 0o600 });
    const key = Buffer.from(machine.slice(0, 16));
    const cipher = createCipheriv('aes-128-cbc', key, key);
    const payload = Buffer.concat([cipher.update(JSON.stringify({ uid: 'account', security_oauth_token: 'token' }), 'utf8'), cipher.final()]).toString('base64');
    await writeFile(join(root, '.auth', 'user'), payload, { mode: 0o600 });
    const original = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ pricingUrl: 'https://qoder.com.cn/pricing?client=qoder' }, { status: 403 })) as typeof fetch;
    try {
      const response = await requestQoderModel(root, '/models', {}, globalThis.fetch, undefined, 'qoder-cn');
      assert.equal(response.status, 403);
      const failure = await (await import('../../src/model-access/providers/qoder.ts')).inspectQoderLogin(root, 'qoder-cn');
      assert.equal(failure.status, 'failed');
    } finally { globalThis.fetch = original; }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Qoder CN models can serve other executors through the local gateway', async () => {
  const requests: Array<{ path: string }> = [];
  const runtime = await createQoderModelProvider({
    inspect: async () => ({ status: 'ready' as const }),
    identity: async () => 'qoder-cn:account-a',
    async request(path) {
      requests.push({ path });
      if (path === '/models') return Response.json({ chat: [{ key: 'qfmodel', display_name: 'Qwen3.8-Flash', enable: true }] });
      if (path === '/usage') return Response.json({ userType: 'personal_standard', userQuota: { total: 100, remaining: 80 } });
      return new Response('data: {"choices":[{"delta":{"content":"收到"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    },
  }, 'qoder-cn').open({ accountId: 'native-qoder-cn', configRoot: 'unused', environment: {} });
  try {
    assert.equal((await runtime.inspect()).models[0]?.id, 'qfmodel');
    // A Codex/DSH lease arrives as a chat-completions request for the CN catalog model.
    const response = await runtime.infer({ body: { messages: [{ role: 'user', content: '你好' }] }, modelId: 'qfmodel', signal: new AbortController().signal, context: { accountId: 'native-qoder-cn', agentId: 'codex', conversationId: 'one', runId: 'run', requestId: 'request' } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).choices[0].message.content, '收到');
    assert.deepEqual(requests.map(item => item.path).filter(path => path !== '/usage'), ['/models', '/chat']);
  } finally { await runtime.close(); }
});
