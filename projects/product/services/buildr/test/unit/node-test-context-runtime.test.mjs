import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTestContextRuntime,
  defineTestContext,
} from '../../test-context.mjs';

test('matching worker configuration creates once and returns isolated leases', async () => {
  let creates = 0;
  let destroys = 0;
  const context = defineTestContext({
    id: 'sample.application', version: 1, scope: 'worker', parallelSafety: 'isolated',
    create({ config }) { creates += 1; return { name: config.name, seed: [] }; },
    acquire({ state }) { return { name: state.name, values: [...state.seed] }; },
    destroy() { destroys += 1; },
  });
  const runtime = createTestContextRuntime();
  const first = await runtime.acquire({ app: { definition: context, config: { name: 'demo' } } }, { testId: 'one', suiteId: 'suite' });
  const second = await runtime.acquire({ app: { definition: context, config: { name: 'demo' } } }, { testId: 'two', suiteId: 'suite' });
  assert.notEqual(first.values.app, second.values.app);
  assert.equal(creates, 1);
  await first.release({ outcome: 'passed' });
  await second.release({ outcome: 'passed' });
  assert.equal(runtime.events().filter((event) => event.operation === 'cache-hit').length, 1);
  await runtime.close();
  assert.equal(destroys, 1);
});

test('configuration identity and dependency identity prevent stale reuse', async () => {
  let baseCreates = 0;
  let applicationCreates = 0;
  const base = defineTestContext({
    id: 'sample.base', version: 1, scope: 'worker', parallelSafety: 'shared',
    create({ config }) { baseCreates += 1; return { value: config.value }; },
  });
  const application = defineTestContext({
    id: 'sample.dependent', version: 1, scope: 'worker', parallelSafety: 'shared',
    dependencies: [{ definition: base, config: (config) => ({ value: config.base }) }],
    create({ dependencies }) { applicationCreates += 1; return { base: dependencies['sample.base'].value }; },
  });
  const runtime = createTestContextRuntime();
  const left = await runtime.acquire({ app: { definition: application, config: { base: 'left' } } }, { testId: 'left', suiteId: 'suite' });
  const right = await runtime.acquire({ app: { definition: application, config: { base: 'right' } } }, { testId: 'right', suiteId: 'suite' });
  assert.equal(left.values.app.base, 'left');
  assert.equal(right.values.app.base, 'right');
  assert.equal(baseCreates, 2);
  assert.equal(applicationCreates, 2);
  await left.release();
  await right.release();
  await runtime.close();
});

test('exclusive context serializes overlapping leases and records wait', async () => {
  const context = defineTestContext({
    id: 'sample.exclusive', version: 1, scope: 'worker', parallelSafety: 'exclusive',
    create() { return { owner: null }; },
  });
  const runtime = createTestContextRuntime();
  const first = await runtime.acquire({ value: context }, { testId: 'one', suiteId: 'suite' });
  let secondAcquired = false;
  const pending = runtime.acquire({ value: context }, { testId: 'two', suiteId: 'suite' }).then((lease) => { secondAcquired = true; return lease; });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(secondAcquired, false);
  await first.release();
  const second = await pending;
  assert.equal(secondAcquired, true);
  await second.release();
  assert.equal(runtime.events().some((event) => event.operation === 'wait' && event.durationMs >= 10), true);
  await runtime.close();
});

test('dirty context is evicted and recreated for the next test', async () => {
  let creates = 0;
  let destroys = 0;
  const context = defineTestContext({
    id: 'sample.dirty', version: 1, scope: 'worker', parallelSafety: 'shared',
    create() { creates += 1; return { generation: creates }; },
    destroy() { destroys += 1; },
  });
  const runtime = createTestContextRuntime();
  const first = await runtime.acquire({ value: context }, { testId: 'one', suiteId: 'suite' });
  assert.equal(first.values.value.generation, 1);
  first.markDirty('value', 'test-requested-rebuild');
  await first.release();
  const second = await runtime.acquire({ value: context }, { testId: 'two', suiteId: 'suite' });
  assert.equal(second.values.value.generation, 2);
  assert.equal(destroys, 1);
  await second.release();
  await runtime.close();
  assert.equal(destroys, 2);
});

test('suite and test scopes destroy at their owning boundaries', async () => {
  const destroyed = [];
  const suiteContext = defineTestContext({
    id: 'sample.suite', version: 1, scope: 'suite', parallelSafety: 'shared',
    create() { return {}; }, destroy({ reason }) { destroyed.push(`suite:${reason}`); },
  });
  const testContext = defineTestContext({
    id: 'sample.test', version: 1, scope: 'test', parallelSafety: 'shared',
    create() { return {}; }, destroy({ reason }) { destroyed.push(`test:${reason}`); },
  });
  const runtime = createTestContextRuntime();
  const lease = await runtime.acquire({ suite: suiteContext, current: testContext }, { testId: 'one', suiteId: 'alpha' });
  await lease.release();
  assert.deepEqual(destroyed, ['test:test-scope-complete']);
  await runtime.closeSuite('alpha');
  assert.deepEqual(destroyed, ['test:test-scope-complete', 'suite:suite-close']);
  await runtime.close();
});

test('invalid definitions, nondeterministic config and dependency cycles fail closed', async () => {
  assert.throws(() => defineTestContext({ id: 'Bad Id', version: 1, scope: 'worker', parallelSafety: 'shared', create() {} }), (error) => error.code === 'test_context_definition_invalid');
  const context = defineTestContext({ id: 'sample.config', version: 1, scope: 'worker', parallelSafety: 'shared', create() { return {}; } });
  const runtime = createTestContextRuntime();
  await assert.rejects(() => runtime.acquire({ value: { definition: context, config: { callback() {} } } }, { testId: 'one', suiteId: 'suite' }), (error) => error.code === 'test_context_configuration_invalid');

  const cyclic = {
    [Symbol.for('@buildr-ai/test-context/definition')]: true,
    id: 'sample.cyclic',
    version: 1,
    key: 'sample.cyclic/v1',
    scope: 'worker',
    parallelSafety: 'shared',
    dependencies: [],
    create() { return {}; },
    acquire: null,
    release: null,
    reset: null,
    inspect: null,
    destroy: null,
    sourceIdentity: null,
  };
  cyclic.dependencies.push({ definition: cyclic, config: {} });
  await assert.rejects(
    () => runtime.acquire({ value: cyclic }, { testId: 'cycle', suiteId: 'suite' }),
    (error) => error.code === 'test_context_dependency_cycle',
  );
  await runtime.close();
});
