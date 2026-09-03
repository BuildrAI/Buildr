import assert from 'node:assert/strict';
import test from 'node:test';

import { createModuleRegistry, defineModule } from '../../src/bootstrap/module-registry.ts';

test('module registry resolves named dependencies and exposes closed contributions', () => {
  const dependency = Object.freeze({ value: 42 });
  const registry = createModuleRegistry({ capabilities: { 'foundation.clock': dependency } });
  const descriptor = registry.install(defineModule({
    id: 'example',
    requires: ['foundation.clock'],
    create: (requires) => ({
      provides: { 'example.application': { dependency: requires['foundation.clock'] } },
      contributions: { cli: [{ key: 'example run' }], http: [{ id: 'example.http', handle() {} }] },
    }),
  }));

  assert.equal(descriptor.id, 'example');
  assert.equal(registry.provide('example.application').dependency, dependency);
  assert.deepEqual(registry.contributions('cli').map((item) => item.id), ['example run']);
  assert.deepEqual(registry.snapshot(), [{
    id: 'example', requires: ['foundation.clock'], provides: ['example.application'],
    contributions: { cli: ['example run'], http: ['example.http'], diagnostics: [] }, lifecycle: 'none',
  }]);
});

test('module registry fails closed for invalid definitions, missing dependencies and duplicates', () => {
  assert.throws(() => defineModule({ id: 'bad', requires: [], create() {}, extra: true }), { code: 'bootstrap_module_definition_invalid' });

  const registry = createModuleRegistry();
  assert.throws(() => registry.install(defineModule({ id: 'missing', requires: ['missing.port'], create() { return {}; } })), { code: 'bootstrap_module_dependency_missing' });
  registry.install(defineModule({ id: 'first', requires: [], create: () => ({ provides: { 'shared.api': {} }, contributions: { cli: [{ key: 'shared' }] } }) }));
  assert.throws(() => registry.install(defineModule({ id: 'first', requires: [], create: () => ({}) })), { code: 'bootstrap_module_duplicate' });
  assert.throws(() => registry.install(defineModule({ id: 'provide-conflict', requires: [], create: () => ({ provides: { 'shared.api': {} } }) })), { code: 'bootstrap_module_provide_duplicate' });
  assert.throws(() => registry.install(defineModule({ id: 'contribution-conflict', requires: [], create: () => ({ contributions: { cli: [{ key: 'shared' }] } }) })), { code: 'bootstrap_module_contribution_duplicate' });
  assert.throws(() => registry.install(defineModule({ id: 'bad-lifecycle', requires: [], create: () => ({ lifecycle: { start() {} } }) })), { code: 'bootstrap_module_lifecycle_invalid' });
});

test('module lifecycle starts deterministically and stops in reverse order', async () => {
  const events = [];
  const registry = createModuleRegistry();
  for (const id of ['one', 'two']) {
    registry.install(defineModule({ id, requires: [], create: () => ({ lifecycle: { start: () => events.push(`start:${id}`), stop: () => events.push(`stop:${id}`) } }) }));
  }
  await registry.start();
  await registry.stop();
  assert.deepEqual(events, ['start:one', 'start:two', 'stop:two', 'stop:one']);
});

test('module lifecycle rolls back only successfully started resources', async () => {
  const events = [];
  const registry = createModuleRegistry();
  registry.install(defineModule({ id: 'one', requires: [], create: () => ({ lifecycle: { start: () => events.push('start:one'), stop: () => events.push('stop:one') } }) }));
  registry.install(defineModule({ id: 'two', requires: [], create: () => ({ lifecycle: { start() { events.push('start:two'); throw new Error('boom'); }, stop: () => events.push('stop:two') } }) }));

  await assert.rejects(registry.start(), { code: 'bootstrap_module_start_failed' });
  assert.deepEqual(events, ['start:one', 'start:two', 'stop:one']);
});
