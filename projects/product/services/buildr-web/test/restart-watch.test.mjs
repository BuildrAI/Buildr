import assert from 'node:assert/strict';
import test from 'node:test';

const { sessionTokenOf, waitForRestart, withRestartRequest } = await import('../src/app/restart-watch.ts');

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

test('旧实例明确报告失败时结束观察并保留实际原因', async () => {
  const failure = { code: 'web_update_instance_changed', message: '交接期间实例已变化。' };
  const reported = [];
  const status = await waitForRestart({
    url: 'http://127.0.0.1:1/', previousToken: 'aaaa', attempts: 5,
    fetchImpl: async () => new Response(page('aaaa')),
    readStatus: async signal => { assert.equal(signal.aborted, false); return { status: 'failed', error: failure }; },
    onFailure: error => reported.push(error),
  });
  assert.equal(status, 'failed');
  assert.deepEqual(reported, [failure]);
});

test('状态接口不可达不当作重启失败，仍以新页面令牌确认恢复', async () => {
  let pages = 0;
  let statuses = 0;
  const status = await waitForRestart({
    url: 'http://127.0.0.1:1/', previousToken: 'aaaa', attempts: 3, intervalMs: 0,
    fetchImpl: async () => new Response(page(++pages === 1 ? 'aaaa' : 'bbbb')),
    readStatus: async () => { statuses += 1; throw new Error('connection refused'); },
    onFailure: () => assert.fail('无法连接不是已确认失败'),
  });
  assert.equal(status, 'ready');
  assert.equal(statuses, 1);
});

test('idle 与 restarting 不冒充新页面已经恢复', async () => {
  const statuses = ['idle', 'restarting'];
  const status = await waitForRestart({
    url: 'http://127.0.0.1:1/', previousToken: 'aaaa', attempts: 2, intervalMs: 0,
    fetchImpl: async () => new Response(page('aaaa')),
    readStatus: async () => ({ status: statuses.shift() }),
  });
  assert.equal(status, 'timed-out');
  assert.equal(statuses.length, 0);
});

test('首页请求与正文挂起都在请求预算结束后中止', async () => {
  for (const hangBody of [false, true]) {
    let requestSignal;
    const status = await waitForRestart({
      url: 'http://127.0.0.1:1/', previousToken: 'aaaa', attempts: 1, requestTimeoutMs: 10, timeoutMs: 1000,
      fetchImpl: async (_url, init) => {
        requestSignal = init.signal;
        if (!hangBody) return new Promise(() => {});
        return { ok: true, text: () => new Promise(() => {}) };
      },
    });
    assert.equal(status, 'timed-out');
    assert.equal(requestSignal.aborted, true);
  }
});

test('整体截止不受请求次数或等待中的状态接口影响', async () => {
  let time = 0;
  const sleeps = [];
  const status = await waitForRestart({
    url: 'http://127.0.0.1:1/', previousToken: 'aaaa', attempts: 20, intervalMs: 1000, timeoutMs: 25,
    now: () => time,
    fetchImpl: async () => new Response(page('aaaa')),
    sleep: async ms => { sleeps.push(ms); time += ms; },
  });
  assert.equal(status, 'timed-out');
  assert.deepEqual(sleeps, [25]);

  let requestSignal;
  const hungStatus = await waitForRestart({
    url: 'http://127.0.0.1:1/', previousToken: 'aaaa', attempts: 20, timeoutMs: 10, requestTimeoutMs: 1000,
    fetchImpl: async () => new Response(page('aaaa')),
    readStatus: async signal => { requestSignal = signal; return new Promise(() => {}); },
  });
  assert.equal(hungStatus, 'timed-out');
  assert.equal(requestSignal.aborted, true);
});

test('取消请求或间隔等待都会立即结束旧观察且不发起后续请求', async () => {
  for (const cancelDuringSleep of [false, true]) {
    const controller = new AbortController();
    let requests = 0;
    let requestSignal;
    const status = await waitForRestart({
      url: 'http://127.0.0.1:1/', previousToken: 'aaaa', attempts: 20, timeoutMs: 1000, signal: controller.signal,
      fetchImpl: async (_url, init) => {
        requests += 1;
        requestSignal = init.signal;
        if (cancelDuringSleep) return new Response(page('aaaa'));
        queueMicrotask(() => controller.abort());
        return new Promise(() => {});
      },
      sleep: async () => { controller.abort(); return new Promise(() => {}); },
    });
    assert.equal(status, 'timed-out');
    assert.equal(requests, 1);
    if (!cancelDuringSleep) assert.equal(requestSignal.aborted, true);
  }
});

test('重启写请求超时也会中止底层请求并返回可识别原因', async () => {
  let requestSignal;
  await assert.rejects(withRestartRequest(async signal => {
    requestSignal = signal;
    return new Promise(() => {});
  }, { timeoutMs: 10 }), { code: 'restart_request_timeout' });
  assert.equal(requestSignal.aborted, true);
});
