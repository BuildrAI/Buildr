import assert from 'node:assert/strict';
import test from 'node:test';
import { createBuildrBridge, observeBoundInstance, readyOrigin } from '../../plugin/bridge.ts';

const binding = { channel: 'npm' as const, nodeExecutable: '/node', cliEntry: '/buildr.mjs' };

/** Public status for a machine; `present` says whether the observed channel is installed at all. */
function status(state = 'ready', url = 'http://127.0.0.1:49001', channel: 'npm' | 'development' = 'npm', present = true): any {
  const identityFor = (value: 'npm' | 'development') => ({
    ownershipIdentity: 'installation-A', version: '1',
    protocolIdentity: 'buildr.web-protocol/v1', applicationPayloadDigest: 'digest-A',
    // The two installations publish different identities: npm names the package it came from, a
    // development installation names the source root it runs from.
    ...(value === 'npm' ? { package: '@buildr-ai/buildr', channel: 'npm' } : { sourceRoot: '/src/buildr' }),
  });
  return {
    schemaVersion: 'buildr.installation-status/v1',
    channels: {
      npm: present || channel !== 'npm' ? { status: 'installed', identity: identityFor('npm') } : { status: 'absent' },
      development: present || channel !== 'development' ? { status: 'installed', identity: identityFor('development') } : { status: 'absent' },
    },
    instances: {
      // A running instance states the channel it serves, which is how a development instance is
      // recognised: its installation registers a source identity the process never restates.
      [channel === 'npm' ? 'released' : 'development']: { status: state, identity: { ...identityFor(channel), channel, url } },
      [channel === 'npm' ? 'development' : 'released']: { status: 'ready', identity: { ...identityFor(channel === 'npm' ? 'development' : 'npm'), channel: channel === 'npm' ? 'development' : 'npm', url: 'http://127.0.0.1:49999' } },
    },
  };
}
// A real wait must yield the event loop, or the readiness poll would spin synchronously and starve
// the very timeout that is supposed to end it.
const immediate = (_ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal.throwIfAborted();
  setImmediate(() => { try { signal.throwIfAborted(); resolve(); } catch (error) { reject(error); } });
});

test('DSH bridge reuses the ready instance of its own channel and discovers a changed address', async () => {
  let current = status();
  const bridge = createBuildrBridge(binding, { query: async () => current, launch: () => assert.fail('must not launch') });
  assert.equal((await bridge.open()).url, 'http://127.0.0.1:49001');
  current = status('ready', 'http://127.0.0.1:49002');
  assert.equal((await bridge.open()).url, 'http://127.0.0.1:49002');
  bridge.dispose();
});

test('DSH bridge never falls back to the other channel', async () => {
  const current = status('absent');
  let launches = 0;
  let queries = 0;
  const bridge = createBuildrBridge(binding, {
    query: async () => ++queries === 1 ? current : status(),
    launch: async () => { launches++; }, wait: immediate,
  });
  assert.equal((await bridge.open()).url, 'http://127.0.0.1:49001');
  assert.equal(launches, 1);
  bridge.dispose();
  // The other channel's readiness is never consulted as a substitute.
  assert.equal(observeBoundInstance(status('ready', 'http://127.0.0.1:49003', 'development'), 'development').channel, 'development');
});

test('DSH bridge shares concurrent startup and waits beyond launcher success', async () => {
  let launches = 0;
  let queries = 0;
  const bridge = createBuildrBridge(binding, {
    query: async () => status(++queries < 4 ? 'absent' : 'ready'),
    launch: async () => { launches++; }, wait: immediate,
  });
  const pending = bridge.open();
  assert.equal(bridge.open(), pending);
  assert.equal((await pending).url, 'http://127.0.0.1:49001');
  assert.equal(queries, 4);
  assert.equal(launches, 1);
  bridge.dispose();
});

test('DSH bridge refuses malformed status and reports a channel this machine does not have', () => {
  for (const mutate of [
    (s: any) => { s.schemaVersion = 'other'; },
    (s: any) => { s.instances.released.status = 'unhealthy'; },
    (s: any) => { s.instances.released.status = 'profile-conflict'; },
  ]) {
    const broken = status(); mutate(broken);
    assert.throws(() => observeBoundInstance(broken, 'npm'));
  }
  // An installation this machine does not have is a stated absence, never a silent fallback.
  assert.throws(() => observeBoundInstance(status('ready', 'http://127.0.0.1:49001', 'development', false), 'development'), /没有检测到 Buildr 开发版/);
  assert.throws(() => observeBoundInstance(status('ready', 'http://127.0.0.1:49001', 'npm', false), 'npm'), /没有检测到 Buildr/);
  for (const url of ['https://127.0.0.1:4000', 'http://localhost:4000', 'http://example.com:4000', 'http://127.0.0.1:4000/path', 'http://127.0.0.1:4000/?key=secret', 'http://u:p@127.0.0.1:4000', 'http://127.0.0.1']) {
    assert.throws(() => readyOrigin(url));
  }
});

test('a differing caller runtime never rejects a running instance', () => {
  // `status.*.runtime` reports whoever ran the query, so it cannot act as an installation check.
  const current = status();
  current.channels.npm.runtime = { identity: 'runtime-of-the-querier' };
  current.instances.released.identity.runtime = { identity: 'runtime-of-the-running-instance' };
  assert.equal(observeBoundInstance(current, 'npm').ready, true);
});

test('an instance belonging to another installation is refused', () => {
  const current = status();
  current.instances.released.identity.ownershipIdentity = 'installation-B';
  assert.throws(() => observeBoundInstance(current, 'npm'), /不属于该安装/);
});

test('DSH bridge bounds readiness wait and permits a later retry', async () => {
  let current = status('absent');
  let launches = 0;
  const bridge = createBuildrBridge(binding, {
    query: async () => current, launch: async () => { launches++; }, wait: immediate, timeoutMs: 40, pollMs: 1,
  });
  await assert.rejects(bridge.open(), /超时/);
  assert.equal(launches, 1);
  current = status();
  assert.equal((await bridge.open()).url, 'http://127.0.0.1:49001');
  bridge.dispose();
});

test('DSH bridge launch failure is sanitized, retryable and has no shutdown effect', async () => {
  let launches = 0;
  let fail = true;
  const bridge = createBuildrBridge(binding, {
    query: async () => status('absent'),
    launch: async () => { launches++; if (fail) throw new Error('private launcher path'); },
    wait: immediate, timeoutMs: 20, pollMs: 1,
  });
  await assert.rejects(bridge.open(), (error: any) => error.code === 'operation-failed' && !error.message.includes('private'));
  fail = false;
  await assert.rejects(bridge.open(), /超时/);
  assert.equal(launches, 2);
  bridge.dispose();
});

test('DSH bridge cancellation reaches its owned query and prevents launch', async () => {
  let launched = 0;
  let aborted = 0;
  const bridge = createBuildrBridge(binding, {
    query: (signal: AbortSignal) => {
      if (signal.aborted) { aborted++; return Promise.reject(signal.reason); }
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => { aborted++; reject(signal.reason); }, { once: true });
      });
    },
    launch: async () => { launched++; }, wait: immediate,
  });
  const pending = bridge.open();
  bridge.dispose();
  await assert.rejects(pending, /已停用/);
  assert.equal(launched, 0);
  assert.equal(aborted, 1);
});
