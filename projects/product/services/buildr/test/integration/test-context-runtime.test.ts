import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createTestContextPool, TEST_CONTEXTS_ENV } from '../context/runtime.ts';

for (const mode of ['success', 'assertion-failure', 'cleanup-failure', 'explicit-cleanup']) test(`default context pool cleans its external seed on worker exit: ${mode}`, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-default-pool-proof-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const observation = path.join(root, 'observation.json');
  const adapter = new URL('../context/node-test.ts', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultTestContextPool, cleanupDefaultTestContextPool } from ${JSON.stringify(adapter)};
const pool = defaultTestContextPool({ temporaryRoot: ${JSON.stringify(root)}, providers: [{
  key: 'sample/v1', isolationMode: 'sandbox', resetStrategy: 'recreate', parallelSafety: 'worker-safe',
  prepare({seedRoot}) { fs.writeFileSync(path.join(seedRoot, 'fixture'), 'owned seed'); }, inspect() {},
  cleanup() { ${mode === 'cleanup-failure' ? "throw new Error('injected_default_pool_cleanup_failure');" : ''} },
}] });
test('uses a seed', t => {
  const lease = pool.acquire('sample/v1');
  fs.writeFileSync(${JSON.stringify(observation)}, JSON.stringify({ pool: path.dirname(lease.context.root), sandbox: lease.base }));
  t.after(() => lease.release());
  ${mode === 'assertion-failure' ? 'assert.fail("injected assertion failure");' : ''}
  ${mode === 'explicit-cleanup' ? "lease.release(); assert.equal(cleanupDefaultTestContextPool().status, 'cleaned'); assert.equal(cleanupDefaultTestContextPool().status, 'not-owned');" : ''}
});
`], { encoding: 'utf8', timeout: 10_000, env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
  assert.ifError(result.error);
  assert.equal(result.status, ['assertion-failure', 'cleanup-failure'].includes(mode) ? 1 : 0, result.stderr || result.stdout);
  const observed = JSON.parse(fs.readFileSync(observation, 'utf8'));
  assert.equal(fs.existsSync(observed.sandbox), false);
  assert.equal(fs.existsSync(observed.pool), false, 'default seed pool must be removed without relying on the test preload root');
  if (mode === 'cleanup-failure') assert.match(result.stderr, /injected_default_pool_cleanup_failure/);
});

function provider(overrides: any = {}): any  {
  return {
    key: 'sample/v1',
    isolationMode: 'sandbox',
    resetStrategy: 'recreate',
    parallelSafety: 'worker-safe',
    footprints: ['filesystem'],
    prepare({ seedRoot }: any): any  { fs.writeFileSync(path.join(seedRoot, 'seed.txt'), 'immutable\n'); return { fixture: 'sample' }; },
    inspect({ marker }: any): any  { assert.equal(marker.providerData.fixture, 'sample'); },
    ...overrides,
  };
}

test('Context Pool prepares once and projects the same immutable identity to another runner', () => {
  const owner: any = createTestContextPool({ providers: [provider()] });
  const first: any = owner.prepare('sample/v1');
  const second: any = owner.prepare('sample/v1');
  assert.equal(first.contextRoot, second.contextRoot);
  assert.equal(owner.events().filter((event: any) => event.operation === 'prepare' && event.provider === 'sample/v1').length, 1);

  const consumer: any = createTestContextPool({ providers: [provider()], env: owner.environment() });
  const inherited: any = consumer.prepare('sample/v1');
  assert.equal(inherited.marker.identity, first.marker.identity);
  assert.equal(inherited.owned, false);
  assert.equal(consumer.events().filter((event: any) => event.operation === 'reuse' && event.provider === 'sample/v1').length, 1);
  assert.match(owner.environment()[TEST_CONTEXTS_ENV], /buildr\.test-context-projection\/v1/);
  assert.equal(consumer.cleanup().status, 'cleaned');
  assert.equal(fs.existsSync(first.contextRoot), true, 'consumer must not clean the owner seed');
  assert.equal(owner.cleanup().status, 'cleaned');
});

test('parallel sandbox leases never alias and repeated release is idempotent', () => {
  const pool: any = createTestContextPool({ providers: [provider()] });
  const left: any = pool.acquire('sample/v1', { name: 'left' });
  const right: any = pool.acquire('sample/v1', { name: 'right' });
  assert.notEqual(left.root, right.root);
  fs.writeFileSync(path.join(left.root, 'case.txt'), 'left\n');
  assert.equal(fs.existsSync(path.join(right.root, 'case.txt')), false);
  assert.equal(left.release().status, 'released');
  assert.equal(left.release().status, 'already-released');
  assert.equal(right.release().status, 'released');
  assert.equal(pool.cleanup().status, 'cleaned');
});

test('unknown provider, sandbox alias and inherited identity drift fail closed', () => {
  const pool: any = createTestContextPool({ providers: [provider()] });
  assert.throws(() => pool.prepare('missing/v1'), (error: any) => error.code === 'test_context_provider_unknown');
  pool.cleanup();

  const aliasPool: any = createTestContextPool({ providers: [provider({
    materialize({ context, sandboxRoot }: any): any  { fs.symlinkSync(context.seedRoot, sandboxRoot, 'dir'); },
  })] });
  assert.throws(() => aliasPool.acquire('sample/v1'), (error: any) => error.code === 'test_context_sandbox_alias');
  aliasPool.cleanup();

  const owner: any = createTestContextPool({ providers: [provider()] });
  owner.prepare('sample/v1');
  const projection: any = JSON.parse(owner.environment()[TEST_CONTEXTS_ENV]);
  projection.contexts['sample/v1'].identity = `sha256-${'0'.repeat(64)}`;
  const consumer: any = createTestContextPool({ providers: [provider()], env: { [TEST_CONTEXTS_ENV]: JSON.stringify(projection) } });
  assert.throws(() => consumer.prepare('sample/v1'), (error: any) => error.code === 'test_context_projection_identity_mismatch');
  consumer.cleanup();
  owner.cleanup();
});

test('seed pollution is detected on release and cleanup still removes owned state', () => {
  const pool: any = createTestContextPool({ providers: [provider()] });
  const lease: any = pool.acquire('sample/v1');
  fs.writeFileSync(path.join(lease.context.root, 'seed', 'dirty.txt'), 'dirty\n');
  assert.throws(() => lease.release(), (error: any) => error.code === 'test_context_seed_dirty');
  assert.equal(fs.existsSync(lease.base), false);
  assert.throws(() => pool.cleanup(), (error: any) => error.code === 'test_context_seed_dirty');
  assert.equal(fs.existsSync(lease.context.root), false);
});

test('provider release failure is visible and does not retain the sandbox', () => {
  const pool: any = createTestContextPool({ providers: [provider({ release(): any  { throw new Error('fixture release failed'); } })] });
  const lease: any = pool.acquire('sample/v1');
  assert.throws(() => lease.release(), /fixture release failed/);
  assert.equal(fs.existsSync(lease.base), false);
  pool.cleanup();
});

test('invalid Context projection is rejected before provider setup', () => {
  assert.throws(
    () => createTestContextPool({ providers: [provider()], env: { [TEST_CONTEXTS_ENV]: '{' } }),
    (error: any) => error.code === 'test_context_projection_invalid',
  );
});
