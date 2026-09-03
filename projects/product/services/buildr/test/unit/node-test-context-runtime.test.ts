import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTestContextRuntime,
  defineTestContext,
} from '../../test-context.mjs';

test('matching worker configuration creates once and returns isolated leases', async () => {
  let creates: any = 0;
  let destroys: any = 0;
  const context: any = defineTestContext({
    id: 'sample.application', version: 1, scope: 'worker', parallelSafety: 'isolated',
    create({ config }: any): any  { creates += 1; return { name: config.name, seed: [] }; },
    acquire({ state }: any): any  { return { name: state.name, values: [...state.seed] }; },
    destroy(): any  { destroys += 1; },
  });
  const runtime: any = createTestContextRuntime();
  const first: any = await runtime.acquire({ app: { definition: context, config: { name: 'demo' } } }, { testId: 'one', suiteId: 'suite' });
  const second: any = await runtime.acquire({ app: { definition: context, config: { name: 'demo' } } }, { testId: 'two', suiteId: 'suite' });
  assert.notEqual(first.values.app, second.values.app);
  assert.equal(creates, 1);
  await first.release({ outcome: 'passed' });
  await second.release({ outcome: 'passed' });
  assert.equal(runtime.events().filter((event: any) => event.operation === 'cache-hit').length, 1);
  await runtime.close();
  assert.equal(destroys, 1);
});

test('configuration identity and dependency identity prevent stale reuse', async () => {
  let baseCreates: any = 0;
  let applicationCreates: any = 0;
  const base: any = defineTestContext({
    id: 'sample.base', version: 1, scope: 'worker', parallelSafety: 'shared',
    create({ config }: any): any  { baseCreates += 1; return { value: config.value }; },
  });
  const application: any = defineTestContext({
    id: 'sample.dependent', version: 1, scope: 'worker', parallelSafety: 'shared',
    dependencies: [{ definition: base, config: (config: any) => ({ value: config.base }) }],
    create({ dependencies }: any): any  { applicationCreates += 1; return { base: dependencies['sample.base'].value }; },
  });
  const runtime: any = createTestContextRuntime();
  const left: any = await runtime.acquire({ app: { definition: application, config: { base: 'left' } } }, { testId: 'left', suiteId: 'suite' });
  const right: any = await runtime.acquire({ app: { definition: application, config: { base: 'right' } } }, { testId: 'right', suiteId: 'suite' });
  assert.equal(left.values.app.base, 'left');
  assert.equal(right.values.app.base, 'right');
  assert.equal(baseCreates, 2);
  assert.equal(applicationCreates, 2);
  await left.release();
  await right.release();
  await runtime.close();
});

test('exclusive context serializes overlapping leases and records wait', async () => {
  const context: any = defineTestContext({
    id: 'sample.exclusive', version: 1, scope: 'worker', parallelSafety: 'exclusive',
    create(): any  { return { owner: null }; },
  });
  const runtime: any = createTestContextRuntime();
  const first: any = await runtime.acquire({ value: context }, { testId: 'one', suiteId: 'suite' });
  let secondAcquired: any = false;
  const pending: any = runtime.acquire({ value: context }, { testId: 'two', suiteId: 'suite' }).then((lease: any) => { secondAcquired = true; return lease; });
  await new Promise((resolve: any) => setTimeout(resolve, 15));
  assert.equal(secondAcquired, false);
  await first.release();
  const second: any = await pending;
  assert.equal(secondAcquired, true);
  await second.release();
  assert.equal(runtime.events().some((event: any) => event.operation === 'wait' && event.durationMs >= 10), true);
  await runtime.close();
});

test('dirty context is evicted and recreated for the next test', async () => {
  let creates: any = 0;
  let destroys: any = 0;
  const context: any = defineTestContext({
    id: 'sample.dirty', version: 1, scope: 'worker', parallelSafety: 'shared',
    create(): any  { creates += 1; return { generation: creates }; },
    destroy(): any  { destroys += 1; },
  });
  const runtime: any = createTestContextRuntime();
  const first: any = await runtime.acquire({ value: context }, { testId: 'one', suiteId: 'suite' });
  assert.equal(first.values.value.generation, 1);
  first.markDirty('value', 'test-requested-rebuild');
  await first.release();
  const second: any = await runtime.acquire({ value: context }, { testId: 'two', suiteId: 'suite' });
  assert.equal(second.values.value.generation, 2);
  assert.equal(destroys, 1);
  await second.release();
  await runtime.close();
  assert.equal(destroys, 2);
});

test('suite and test scopes destroy at their owning boundaries', async () => {
  const destroyed: any[] = [];
  const suiteContext: any = defineTestContext({
    id: 'sample.suite', version: 1, scope: 'suite', parallelSafety: 'shared',
    create(): any  { return {}; }, destroy({ reason }: any): any  { destroyed.push(`suite:${reason}`); },
  });
  const testContext: any = defineTestContext({
    id: 'sample.test', version: 1, scope: 'test', parallelSafety: 'shared',
    create(): any  { return {}; }, destroy({ reason }: any): any  { destroyed.push(`test:${reason}`); },
  });
  const runtime: any = createTestContextRuntime();
  const lease: any = await runtime.acquire({ suite: suiteContext, current: testContext }, { testId: 'one', suiteId: 'alpha' });
  await lease.release();
  assert.deepEqual(destroyed, ['test:test-scope-complete']);
  await runtime.closeSuite('alpha');
  assert.deepEqual(destroyed, ['test:test-scope-complete', 'suite:suite-close']);
  await runtime.close();
});

test('invalid definitions, nondeterministic config and dependency cycles fail closed', async () => {
  assert.throws(() => defineTestContext({ id: 'Bad Id', version: 1, scope: 'worker', parallelSafety: 'shared', create(): any  {} }), (error: any) => error.code === 'test_context_definition_invalid');
  const context: any = defineTestContext({ id: 'sample.config', version: 1, scope: 'worker', parallelSafety: 'shared', create(): any  { return {}; } });
  const runtime: any = createTestContextRuntime();
  await assert.rejects(() => runtime.acquire({ value: { definition: context, config: { callback(): any  {} } } }, { testId: 'one', suiteId: 'suite' }), (error: any) => error.code === 'test_context_configuration_invalid');

  const cyclic: any = {
    [Symbol.for('@buildr-ai/test-context/definition')]: true,
    id: 'sample.cyclic',
    version: 1,
    key: 'sample.cyclic/v1',
    scope: 'worker',
    parallelSafety: 'shared',
    dependencies: [],
    create(): any  { return {}; },
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
    (error: any) => error.code === 'test_context_dependency_cycle',
  );
  await runtime.close();
});
