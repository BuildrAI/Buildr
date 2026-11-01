import test from 'node:test';
import assert from 'node:assert/strict';
import { dshBalanceQuota } from '../../src/executors/dsh/balance.ts';
import { createDeepSeekModelProvider } from '../../src/model-access/providers/deepseek.ts';

const ready = (value: unknown[], bonusWallets: unknown[] = []) => ({ status: 'ready', value, bonusWallets });
test('DeepSeek native wallets preserve exact precision, currency boundaries and zero', () => {
  const quota = dshBalanceQuota(ready([{ currency: 'CNY', balance: '9007199254740993.10' }, { currency: 'USD', balance: '0.00' }], [{ currency: 'CNY', balance: '0.20' }]));
  assert.equal(quota.available, true);
  assert.deepEqual(quota.balances, [{ currency: 'CNY', total: '9007199254740993.30', toppedUp: '9007199254740993.10', granted: '0.20' }, { currency: 'USD', total: '0.00', toppedUp: '0.00' }]);
  assert.equal(quota.remainingPercent, undefined);
  assert.deepEqual(dshBalanceQuota(ready([{ currency: 'CNY', balance: '1e-3' }], [{ currency: 'CNY', balance: '.002' }])).balances, [{ currency: 'CNY', total: '0.003', toppedUp: '0.001', granted: '0.002' }]);
  assert.equal(dshBalanceQuota(ready([{ currency: 'CNY', balance: '-.10' }], [{ currency: 'CNY', balance: '1.10' }])).balances?.[0].total, '1.00');
});
test('DeepSeek malformed, unavailable and empty wallets are unknown, never zero', () => {
  for (const value of [null, { status: 'failed' }, ready([]), ready([{ currency: 'CNY', balance: 'NaN' }]), ready([{ currency: 'CNY', balance: '1e99999' }]), ready([{ currency: 'EUR', balance: '1' }]), { status: 'ready', value: [] }]) {
    const quota = dshBalanceQuota(value);
    assert.equal(quota.available, false); assert.equal(quota.balances, undefined); assert.equal(quota.remainingPercent, undefined);
  }
});
test('DeepSeek model catalog remains ready when independent balance retrieval fails', async () => {
  for (const fail of [false, true]) {
    let quotaCalls = 0;
    const provider = createDeepSeekModelProvider({ ownerFactory: () => ({
      async inspect() { return { status: 'ready' }; }, async beginLogin() {}, async cancelLogin() {}, async close() {},
      async request(url) { assert.equal(url, 'https://api.deepseek.com/models'); return Response.json({ data: [{ id: 'deepseek', api_capabilities: { anthropic_messages: {} } }] }); },
      async quota() { quotaCalls++; if (fail) throw new Error('private failure must not leak'); return dshBalanceQuota(ready([{ currency: 'CNY', balance: '0.00' }])); },
    }) });
    const runtime = await provider.open({ accountId: 'test', configRoot: '/unused', environment: {} });
    try {
      const result = await runtime.inspect();
      assert.equal(result.status, 'ready'); assert.equal(result.models.length, 1); assert.equal(quotaCalls, 1);
      assert.equal(result.quota?.available, !fail);
      assert.doesNotMatch(JSON.stringify(result), /private failure/);
      if (!fail) assert.equal(result.quota?.balances?.[0].total, '0.00');
    } finally { await runtime.close(); }
  }
});

test('DSH runtime delegates wallet reads to the official account RPC without widening the model bridge', async () => {
  const { DshRuntime } = await import('../../src/executors/dsh/index.ts');
  const runtime = Object.create(DshRuntime.prototype) as typeof DshRuntime.prototype;
  let calls = 0;
  Object.assign(runtime, { metadata: { version: 'test', locale: 'zh-CN', timezoneOffsetSeconds: 28800 }, client: { remote: { account: { async getBalance(metadata: {locale:string}) { calls++; assert.equal(metadata.locale, 'zh-CN'); return { ok: true, value: ready([{currency:'CNY',balance:'1.25'}]) }; } } } } });
  // The DSH client transports values in its own RPC success envelope.
  const quota = await runtime.modelQuota();
  assert.equal(calls, 1); assert.equal(quota.balances?.[0].total, '1.25');
  Object.assign(runtime, {client:{remote:{account:{async getBalance(){throw new Error('failed');}}}}});
  assert.equal((await runtime.modelQuota()).available, false);
});
