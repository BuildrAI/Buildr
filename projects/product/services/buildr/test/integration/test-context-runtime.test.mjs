import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createTestContextPool, TEST_CONTEXTS_ENV } from '../../test/context/runtime.mjs';

function provider(overrides = {}) {
  return {
    key: 'sample/v1',
    isolationMode: 'sandbox',
    resetStrategy: 'recreate',
    parallelSafety: 'worker-safe',
    footprints: ['filesystem'],
    prepare({ seedRoot }) { fs.writeFileSync(path.join(seedRoot, 'seed.txt'), 'immutable\n'); return { fixture: 'sample' }; },
    inspect({ marker }) { assert.equal(marker.providerData.fixture, 'sample'); },
    ...overrides,
  };
}

test('Context Pool prepares once and projects the same immutable identity to another runner', () => {
  const owner = createTestContextPool({ providers: [provider()] });
  const first = owner.prepare('sample/v1');
  const second = owner.prepare('sample/v1');
  assert.equal(first.contextRoot, second.contextRoot);
  assert.equal(owner.events().filter((event) => event.operation === 'prepare' && event.provider === 'sample/v1').length, 1);

  const consumer = createTestContextPool({ providers: [provider()], env: owner.environment() });
  const inherited = consumer.prepare('sample/v1');
  assert.equal(inherited.marker.identity, first.marker.identity);
  assert.equal(inherited.owned, false);
  assert.equal(consumer.events().filter((event) => event.operation === 'reuse' && event.provider === 'sample/v1').length, 1);
  assert.match(owner.environment()[TEST_CONTEXTS_ENV], /buildr\.test-context-projection\/v1/);
  assert.equal(consumer.cleanup().status, 'cleaned');
  assert.equal(fs.existsSync(first.contextRoot), true, 'consumer must not clean the owner seed');
  assert.equal(owner.cleanup().status, 'cleaned');
});

test('parallel sandbox leases never alias and repeated release is idempotent', () => {
  const pool = createTestContextPool({ providers: [provider()] });
  const left = pool.acquire('sample/v1', { name: 'left' });
  const right = pool.acquire('sample/v1', { name: 'right' });
  assert.notEqual(left.root, right.root);
  fs.writeFileSync(path.join(left.root, 'case.txt'), 'left\n');
  assert.equal(fs.existsSync(path.join(right.root, 'case.txt')), false);
  assert.equal(left.release().status, 'released');
  assert.equal(left.release().status, 'already-released');
  assert.equal(right.release().status, 'released');
  assert.equal(pool.cleanup().status, 'cleaned');
});

test('unknown provider, sandbox alias and inherited identity drift fail closed', () => {
  const pool = createTestContextPool({ providers: [provider()] });
  assert.throws(() => pool.prepare('missing/v1'), (error) => error.code === 'test_context_provider_unknown');
  pool.cleanup();

  const aliasPool = createTestContextPool({ providers: [provider({
    materialize({ context, sandboxRoot }) { fs.symlinkSync(context.seedRoot, sandboxRoot, 'dir'); },
  })] });
  assert.throws(() => aliasPool.acquire('sample/v1'), (error) => error.code === 'test_context_sandbox_alias');
  aliasPool.cleanup();

  const owner = createTestContextPool({ providers: [provider()] });
  owner.prepare('sample/v1');
  const projection = JSON.parse(owner.environment()[TEST_CONTEXTS_ENV]);
  projection.contexts['sample/v1'].identity = `sha256-${'0'.repeat(64)}`;
  const consumer = createTestContextPool({ providers: [provider()], env: { [TEST_CONTEXTS_ENV]: JSON.stringify(projection) } });
  assert.throws(() => consumer.prepare('sample/v1'), (error) => error.code === 'test_context_projection_identity_mismatch');
  consumer.cleanup();
  owner.cleanup();
});

test('seed pollution is detected on release and cleanup still removes owned state', () => {
  const pool = createTestContextPool({ providers: [provider()] });
  const lease = pool.acquire('sample/v1');
  fs.writeFileSync(path.join(lease.context.root, 'seed', 'dirty.txt'), 'dirty\n');
  assert.throws(() => lease.release(), (error) => error.code === 'test_context_seed_dirty');
  assert.equal(fs.existsSync(lease.base), false);
  assert.throws(() => pool.cleanup(), (error) => error.code === 'test_context_seed_dirty');
  assert.equal(fs.existsSync(lease.context.root), false);
});

test('provider release failure is visible and does not retain the sandbox', () => {
  const pool = createTestContextPool({ providers: [provider({ release() { throw new Error('fixture release failed'); } })] });
  const lease = pool.acquire('sample/v1');
  assert.throws(() => lease.release(), /fixture release failed/);
  assert.equal(fs.existsSync(lease.base), false);
  pool.cleanup();
});

test('invalid Context projection is rejected before provider setup', () => {
  assert.throws(
    () => createTestContextPool({ providers: [provider()], env: { [TEST_CONTEXTS_ENV]: '{' } }),
    (error) => error.code === 'test_context_projection_invalid',
  );
});
