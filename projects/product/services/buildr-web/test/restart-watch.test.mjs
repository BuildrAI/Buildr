import assert from 'node:assert/strict';
import test from 'node:test';

const { sessionTokenOf, waitForRestart } = await import('../src/app/restart-watch.ts');

const page = token => `<!doctype html><meta name="buildr-session" content="${token}" />`;
const fail = () => { throw new Error('connection refused'); };

test('sessionTokenOf 只接受注入的十六进制会话令牌', () => {
  assert.equal(sessionTokenOf(page('a'.repeat(64))), 'a'.repeat(64));
  assert.equal(sessionTokenOf('<meta name="buildr-session" content="">'), null);
  assert.equal(sessionTokenOf('<meta content="abc">'), null);
  assert.equal(sessionTokenOf('plain text'), null);
});

test('令牌保持不变仍等待；令牌轮换立即 ready', async () => {
  const tokens = ['aaaa', 'aaaa', 'bbbb'];
  const calls = [];
  const status = await waitForRestart({
    url: 'http://127.0.0.1:1/', previousToken: 'aaaa', attempts: 5, intervalMs: 0, sleep: async () => {},
    fetchImpl: async () => { calls.push(tokens[0]); const token = tokens.shift(); return new Response(page(token)); },
  });
  assert.equal(status, 'ready');
  assert.deepEqual(calls, ['aaaa', 'aaaa', 'bbbb']);
});

test('旧进程拒绝连接继续观察，耗尽进入 timed-out', async () => {
  const seen = [];
  const status = await waitForRestart({
    url: 'http://127.0.0.1:1/', previousToken: 'aaaa', attempts: 3, intervalMs: 0, sleep: async () => { seen.push(1); },
    fetchImpl: fail, onWaiting: () => seen.push('w'),
  });
  assert.equal(status, 'timed-out');
  assert.equal(seen.filter(v => v === 'w').length, 3);
});

test('HTTP 非 200 与令牌相同都不算就绪', async () => {
  let step = 0;
  const status = await waitForRestart({
    url: 'http://127.0.0.1:1/', previousToken: 'aaaa', attempts: 4, intervalMs: 0, sleep: async () => {},
    fetchImpl: async () => { step += 1; return step === 4 ? new Response(page('bbbb')) : new Response(page('aaaa'), { status: step === 1 ? 503 : 200 }); },
  });
  assert.equal(status, 'ready');
  assert.equal(step, 4);
});
