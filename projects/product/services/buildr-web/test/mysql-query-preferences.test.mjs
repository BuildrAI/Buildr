import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Exercise the real hook's requests and state transitions, replacing React scheduling only.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react' && context.parentURL?.endsWith('/hooks/useDatabasePreferences.ts')) {
      const source = ['useEffect', 'useRef', 'useState'].map(name => `export const ${name} = (...args) => globalThis.__databasePreferencesHarness.${name}(...args);`).join('\n');
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    try { return next(specifier, context); } catch (cause) {
      if (specifier.startsWith('.') && context.parentURL?.includes('/src/')) {
        const url = new URL(specifier + '.ts', context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href, context);
      }
      throw cause;
    }
  },
});
const { useDatabasePreferences } = await import('../src/features/connections/hooks/useDatabasePreferences.ts');
const connection = id => ({ id, revision: 'connection-revision' });
const pref = (enabledDatabases = [], currentDatabase = null, revision = 'pref-1') => ({ enabledDatabases, currentDatabase, revision });
const deferred = () => { let resolve, reject; const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; }); return { promise, resolve, reject }; };

function harness(client, selected) {
  const slots = [], effects = [];
  let cursor = 0, dirty = false, result, current = selected, active = true;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; dirty = true; }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useEffect(effect, dependencies) {
      const index = cursor++, previous = slots[index];
      if (previous && dependencies.every((value, offset) => Object.is(value, previous.dependencies[offset]))) return;
      slots[index] = { dependencies, cleanup: previous?.cleanup };
      effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
    },
  };
  function render() { cursor = 0; dirty = false; globalThis.__databasePreferencesHarness = hooks; result = useDatabasePreferences(client, current, active); while (effects.length) effects.shift()(); }
  render();
  return {
    get value() { return result; },
    async settle() { for (let count = 0; count < 8; count++) { await new Promise(resolve => setImmediate(resolve)); if (dirty) render(); } },
    select(next) { current = next; render(); },
    hide() { active = false; render(); },
    show() { active = true; render(); },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('偏好初始空，保存启用库和当前库后使用新版本，不回退连接默认库', async () => {
  let saved = pref(); const writes = [];
  const client = { databases: async () => ({ databases: ['orders', 'billing', 'unused'] }), queryPreferences: async () => saved, saveQueryPreferences: async (id, input) => { writes.push({ id, input }); saved = pref(input.enabledDatabases, input.currentDatabase, `pref-${writes.length + 1}`); return saved; } };
  const h = harness(client, { ...connection('first'), config: { defaultDatabase: 'orders' } });
  try {
    await h.settle(); assert.deepEqual(h.value.enabledDatabases, []); assert.equal(h.value.currentDatabase, '');
    h.value.enable(['orders', 'billing']); await h.settle();
    h.value.select('billing'); await h.settle();
    assert.equal(h.value.currentDatabase, 'billing');
    assert.deepEqual(writes.map(write => write.input.expectedRevision), ['pref-1', 'pref-2']);
    h.value.enable(['orders']); await h.settle();
    assert.equal(h.value.currentDatabase, ''); assert.equal(saved.currentDatabase, null);
    h.value.refresh(); await h.settle();
    assert.deepEqual(h.value.enabledDatabases, ['orders']); assert.equal(h.value.currentDatabase, '');
  } finally { h.dispose(); }
});

test('切换连接后旧加载和旧保存的迟到响应不能串入新连接', async () => {
  const oldLoad = deferred(), oldWrite = deferred();
  const writes = [];
  const client = { databases: async id => ({ databases: [`${id}_db`] }), queryPreferences: id => id === 'first' ? oldLoad.promise : Promise.resolve(pref(['second_db'], 'second_db')), saveQueryPreferences: (id, input) => { writes.push({ id, input }); return oldWrite.promise; } };
  const h = harness(client, connection('first'));
  try {
    h.select(connection('second')); await h.settle();
    oldLoad.resolve(pref(['first_db'], 'first_db')); await h.settle();
    assert.equal(h.value.currentDatabase, 'second_db'); assert.deepEqual(h.value.enabledDatabases, ['second_db']); assert.equal(writes.length, 0);
    h.value.enable([]); await h.settle(); assert.equal(h.value.saving, true);
    h.select(connection('first')); await h.settle();
    oldWrite.resolve(pref([], null, 'late-write')); await h.settle();
    assert.equal(h.value.currentDatabase, 'first_db'); assert.equal(h.value.saving, false);
  } finally { h.dispose(); }
});

test('保存冲突重新读取并明确提示，不重试覆盖另一操作的选择', async () => {
  let latest = pref(['orders'], 'orders'); const writes = [];
  const client = { databases: async () => ({ databases: ['orders', 'billing'] }), queryPreferences: async () => latest, saveQueryPreferences: async (id, input) => { writes.push(input); latest = pref(['billing'], 'billing', 'another-writer'); throw Object.assign(new Error('conflict'), { code: 'connection_query_preferences_revision_conflict' }); } };
  const h = harness(client, connection('first'));
  try {
    await h.settle(); h.value.enable([]); await h.settle();
    assert.equal(writes.length, 1); assert.equal(h.value.currentDatabase, 'billing');
    assert.match(h.value.preferenceError, /已被其他操作修改.*重新选择/); assert.equal(h.value.saving, false);
  } finally { h.dispose(); }
});

test('确认当前库消失才清空持久选择，数据库读取失败不冒充消失', async () => {
  for (const fail of [false, true]) {
    const writes = [], saved = pref(['orders', 'billing'], 'billing');
    const client = { databases: async () => { if (fail) throw new Error('network unavailable'); return { databases: ['orders'] }; }, queryPreferences: async () => saved, saveQueryPreferences: async (id, input) => { writes.push(input); return pref(input.enabledDatabases, input.currentDatabase, 'cleared'); } };
    const h = harness(client, connection('first'));
    try {
      await h.settle(); assert.equal(h.value.currentDatabase, '');
      if (fail) { assert.equal(writes.length, 0); assert.match(h.value.databaseError, /network unavailable/); }
      else assert.deepEqual(writes, [{ enabledDatabases: ['orders', 'billing'], currentDatabase: null, expectedRevision: 'pref-1' }]);
    } finally { h.dispose(); }
  }
});

test('刷新期间保留已确认的当前库，新的权威选择读取完成后才切换', async () => {
  let next;
  const client = {
    databases: () => next ? next.databases.promise : Promise.resolve({ databases: ['orders', 'billing'] }),
    queryPreferences: () => next ? next.preferences.promise : Promise.resolve(pref(['orders', 'billing'], 'orders')),
  };
  const h = harness(client, connection('first'));
  try {
    await h.settle(); assert.equal(h.value.currentDatabase, 'orders');
    next = { databases: deferred(), preferences: deferred() };
    h.value.refresh(); await h.settle();
    assert.equal(h.value.loading, true); assert.equal(h.value.writable, false);
    assert.equal(h.value.currentDatabase, 'orders'); assert.deepEqual(h.value.enabledDatabases, ['orders', 'billing']);
    next.databases.resolve({ databases: ['orders', 'billing'] });
    next.preferences.resolve(pref(['orders', 'billing'], 'billing', 'other-writer'));
    await h.settle();
    assert.equal(h.value.loading, false); assert.equal(h.value.currentDatabase, 'billing');
  } finally { h.dispose(); }
});

test('关闭重开保持原查询目标，重新读取失败不冒充切库，连接版本改变仍隔离旧目标', async () => {
  let next, reads = 0;
  const client = {
    databases: () => { reads++; return next ? next.databases.promise : Promise.resolve({ databases: ['orders'] }); },
    queryPreferences: () => next ? next.preferences.promise : Promise.resolve(pref(['orders'], 'orders')),
  };
  const h = harness(client, connection('first'));
  try {
    await h.settle(); h.hide(); await h.settle();
    assert.equal(reads, 1); assert.equal(h.value.currentDatabase, 'orders'); assert.equal(h.value.writable, false);
    next = { databases: deferred(), preferences: deferred() };
    h.show(); await h.settle();
    assert.equal(reads, 2); assert.equal(h.value.loading, true); assert.equal(h.value.currentDatabase, 'orders');
    next.databases.reject(new Error('discovery unavailable')); next.preferences.reject(new Error('preferences unavailable'));
    await h.settle();
    assert.equal(h.value.loading, false); assert.equal(h.value.currentDatabase, 'orders');
    assert.match(h.value.databaseError, /discovery unavailable/); assert.match(h.value.preferenceError, /preferences unavailable/);
    assert.equal(h.value.writable, false);
    h.select({ ...connection('first'), revision: 'changed-connection' }); await h.settle();
    assert.equal(h.value.currentDatabase, ''); assert.deepEqual(h.value.enabledDatabases, []);
  } finally { h.dispose(); }
});
