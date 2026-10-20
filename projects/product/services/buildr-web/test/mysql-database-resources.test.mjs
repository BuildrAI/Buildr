import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react' && context.parentURL?.endsWith('/DatabaseResources.tsx')) {
      const source = ['useEffect', 'useRef', 'useState'].map(name => `export const ${name} = (...args) => globalThis.__databaseResourcesHarness.${name}(...args);`).join('\n');
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/components/DatabaseResources.tsx')) {
      return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText, shortCircuit: true };
    }
    return next(url, context);
  },
});
const { DatabaseResources } = await import('../src/features/mysql-query/components/DatabaseResources.tsx');

function descendants(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(descendants)];
}

function textContent(node) {
  return React.isValidElement(node) ? React.Children.toArray(node.props.children).map(textContent).join('') : String(node ?? '');
}

function fakeCatalog() {
  const entries = new Map(), listeners = new Set(), reads = [];
  let serial = 0;
  function notify(database) { for (const listener of listeners) listener(database); }
  function start(database) {
    const controller = new AbortController(), entry = { status: 'loading', tables: [] };
    entries.set(database, { database, entry, controller, serial: ++serial });
    reads.push(entries.get(database));
    return entry;
  }
  const catalog = {
    reads,
    read(database) { return entries.get(database)?.entry ?? start(database); },
    retry(database) { entries.delete(database); return catalog.read(database); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    invalidate() { for (const read of entries.values()) read.controller.abort(); entries.clear(); notify(''); },
    dispose() { catalog.invalidate(); listeners.clear(); },
    resolve(database, tables) {
      const read = entries.get(database);
      if (!read || read.controller.signal.aborted) return;
      read.entry.status = 'ready'; read.entry.tables = tables; notify(database);
    },
    reject(database, message) {
      const read = entries.get(database);
      if (!read || read.controller.signal.aborted) return;
      read.entry.status = 'error'; read.entry.error = message; notify(database);
    },
  };
  return catalog;
}

// Exercise the real component's events and effects, replacing React scheduling only.
function resourceHarness(overrides = {}) {
  const slots = [], effects = [], writes = [], catalog = overrides.catalog ?? fakeCatalog();
  let cursor = 0, dirty = false, node;
  let props = {
    databases: ['orders', 'billing'], visible: ['orders'], catalog, loading: false, saving: false, writable: true, active: true,
    onVisible: values => writes.push(values),
    ...overrides,
  };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useEffect(effect, dependencies) {
      const index = cursor++, previous = slots[index];
      if (previous && dependencies && dependencies.length === previous.dependencies?.length && dependencies.every((value, offset) => Object.is(value, previous.dependencies[offset]))) return;
      slots[index] = { dependencies };
      effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
    },
  };
  function render(nextProps = {}) {
    props = { ...props, ...nextProps };
    let renders = 0;
    do {
      assert.ok(renders++ < 20, '组件副作用应收敛');
      cursor = 0; dirty = false; globalThis.__databaseResourcesHarness = hooks;
      node = DatabaseResources(props);
      while (effects.length) effects.shift()();
    } while (dirty);
    const popover = descendants(node).find(element => element.props.content?.props.id === 'mysql-database-picker');
    assert.ok(popover, '启用数据库弹出层可访问');
    const content = popover.props.content, controls = descendants(content);
    const group = controls.find(element => element.props.role === 'group' && element.props['aria-label'] === '启用的数据库');
    assert.ok(group, '数据库选择具有明确分组');
    return {
      node,
      popover: popover.props,
      trigger: descendants(node).find(element => element.props.id === 'enable-mysql-databases').props,
      search: controls.find(element => element.props['aria-label'] === '搜索数据库').props,
      choices: React.Children.toArray(group.props.children).filter(element => typeof element.props.checked === 'boolean'),
      text: textContent(content),
      controls,
    };
  }
  return { render, writes, catalog };
}

function toggleFor(view, database) {
  const result = descendants(view.node).find(element => element.type === 'button' && element.props.className === 'buildr-database-toggle' && element.props.title === database);
  assert.ok(result, `${database} 可供展开浏览`);
  return result.props;
}

function bodyText(view) {
  return textContent(view.node);
}

function choice(view, database) {
  const result = view.choices.find(element => textContent(element) === database);
  assert.ok(result, `${database} 可供选择`);
  return result.props;
}

test('启用库重复打开保留草稿，同批勾选后立即关闭只保存一次，重开读取已保存值', () => {
  const h = resourceHarness();
  h.render().trigger.onClick();
  const open = h.render();
  assert.equal(open.popover.open, true);
  assert.equal(open.trigger['aria-expanded'], true);
  choice(open, 'billing').onChange({ target: { checked: true } });
  open.popover.onOpenChange(true);
  const draft = h.render();
  assert.equal(choice(draft, 'billing').checked, true);
  assert.match(draft.text, /已选 2 \/ 2/);
  choice(draft, 'orders').onChange({ target: { checked: false } });
  draft.trigger.onClick();
  draft.popover.onOpenChange(false);
  assert.deepEqual(h.writes, [['billing']]);
  assert.equal(h.render().popover.open, false);
  assert.equal(h.render().trigger['aria-expanded'], false);
  h.render().trigger.onClick();
  const reopened = h.render();
  assert.equal(choice(reopened, 'orders').checked, true);
  assert.equal(choice(reopened, 'billing').checked, false);
  assert.match(reopened.text, /关闭后自动保存/);
  assert.equal(reopened.controls.some(element => element.props.id === 'apply-enabled-databases'), false);
});

test('无变化、撤销选择和仅选择顺序变化均不保存', () => {
  const scenarios = [
    { visible: ['orders'], changes: [] },
    { visible: ['orders'], changes: [['billing', true], ['billing', false]] },
    { visible: ['billing', 'orders'], changes: [['billing', false], ['billing', true]] },
  ];
  for (const { visible, changes } of scenarios) {
    const h = resourceHarness({ visible });
    h.render().popover.onOpenChange(true);
    for (const [database, checked] of changes) choice(h.render(), database).onChange({ target: { checked } });
    h.render().popover.onOpenChange(false);
    assert.deepEqual(h.writes, [], JSON.stringify(changes));
    assert.equal(h.render().popover.open, false);
  }
});

test('取消全部启用库后关闭保存空选择', () => {
  const h = resourceHarness();
  h.render().popover.onOpenChange(true);
  const open = h.render();
  choice(open, 'orders').onChange({ target: { checked: false } });
  open.popover.onOpenChange(false);
  assert.deepEqual(h.writes, [[]]);
});

test('搜索忽略大小写和两侧空格，筛选隐藏的已选库仍参与关闭保存', () => {
  const h = resourceHarness();
  h.render().popover.onOpenChange(true);
  h.render().search.onChange({ target: { value: '  BILL  ' } });
  const filtered = h.render();
  assert.deepEqual(filtered.choices.map(textContent), ['billing']);
  assert.match(filtered.text, /已选 1 \/ 2/);
  choice(filtered, 'billing').onChange({ target: { checked: true } });
  h.render().search.onChange({ target: { value: 'missing' } });
  const empty = h.render();
  assert.equal(empty.choices.length, 0);
  assert.ok(empty.controls.some(element => element.props.description === '没有匹配的数据库'));
  empty.popover.onOpenChange(false);
  assert.deepEqual(h.writes, [['orders', 'billing']]);
  h.render().popover.onOpenChange(true);
  assert.equal(h.render().search.value, '');
});

test('切离页面、不可写、读取或保存状态变化会关闭并丢弃未保存草稿', () => {
  for (const state of [{ active: false }, { writable: false }, { loading: true }, { saving: true }]) {
    const h = resourceHarness();
    h.render().popover.onOpenChange(true);
    choice(h.render(), 'billing').onChange({ target: { checked: true } });
    const blocked = h.render(state);
    assert.equal(blocked.popover.open, false, JSON.stringify(state));
    assert.equal(blocked.trigger.disabled, true);
    blocked.popover.onOpenChange(false);
    assert.deepEqual(h.writes, []);
    const restored = h.render({ active: true, writable: true, loading: false, saving: false });
    assert.equal(restored.popover.open, false, '恢复可写性不应重新打开旧草稿');
    restored.popover.onOpenChange(true);
    assert.equal(choice(h.render(), 'billing').checked, false);
  }
});

test('不可编辑状态不能打开或通过残留的选择处理器保存', () => {
  for (const state of [{ active: false }, { writable: false }, { loading: true }, { saving: true }]) {
    const h = resourceHarness(state), blocked = h.render();
    blocked.popover.onOpenChange(true);
    choice(blocked, 'billing').onChange({ target: { checked: true } });
    blocked.popover.onOpenChange(false);
    assert.equal(h.render().popover.open, false);
    assert.deepEqual(h.writes, []);
  }
});

test('展开数据库按需读取表，只切换展开状态且不保存当前库选择', () => {
  const h = resourceHarness(), initial = h.render();
  assert.equal(toggleFor(initial, 'orders')['aria-expanded'], false);
  toggleFor(initial, 'orders').onClick();
  const loading = h.render();
  assert.equal(toggleFor(loading, 'orders')['aria-expanded'], true);
  assert.match(bodyText(loading), /正在读取表/);
  assert.deepEqual(h.writes, [], '展开数据库不写入查询偏好');
  assert.deepEqual(h.catalog.reads.map(read => read.database), ['orders']);
  h.catalog.resolve('orders', [{ name: 'orders_table', type: 'BASE TABLE' }]);
  const loaded = h.render();
  assert.match(bodyText(loaded), /orders_table/);
  toggleFor(loaded, 'orders').onClick();
  const collapsed = h.render();
  assert.equal(toggleFor(collapsed, 'orders')['aria-expanded'], false);
  assert.deepEqual(h.writes, [], '收起数据库不写入查询偏好');
});

test('收起后再次展开复用目录中已读取的表', () => {
  const h = resourceHarness();
  toggleFor(h.render(), 'orders').onClick();
  h.render();
  h.catalog.resolve('orders', [{ name: 'orders_table', type: 'BASE TABLE' }]);
  toggleFor(h.render(), 'orders').onClick();
  toggleFor(h.render(), 'orders').onClick();
  const reopened = h.render();
  assert.equal(h.catalog.reads.length, 1, '已读取的数据库不重复请求表');
  assert.match(bodyText(reopened), /orders_table/);
});

test('表读取失败显示局部错误与重试，重试成功后显示表', () => {
  const h = resourceHarness();
  toggleFor(h.render(), 'orders').onClick();
  h.render();
  h.catalog.reject('orders', '表读取失败夹具');
  const failed = h.render();
  assert.match(bodyText(failed), /表读取失败夹具/);
  const retry = descendants(failed.node).find(element => element.props.onClick && textContent(element) === '重试');
  assert.ok(retry, '失败后提供重试');
  retry.props.onClick();
  const loading = h.render();
  assert.match(bodyText(loading), /正在读取表/);
  h.catalog.resolve('orders', [{ name: 'orders_table', type: 'BASE TABLE' }]);
  const loaded = h.render();
  assert.equal(h.catalog.reads.length, 2);
  assert.match(bodyText(loaded), /orders_table/);
  assert.doesNotMatch(bodyText(loaded), /表读取失败夹具/);
});

test('空表数据库显示明确空态', () => {
  const h = resourceHarness();
  toggleFor(h.render(), 'orders').onClick();
  h.render();
  h.catalog.resolve('orders', []);
  const empty = h.render();
  assert.match(bodyText(empty), /没有可访问的表/);
});

test('刷新数据库列表会清空展开和库表缓存，再次展开重新读取', () => {
  const h = resourceHarness();
  toggleFor(h.render(), 'orders').onClick();
  h.render();
  h.catalog.resolve('orders', [{ name: 'orders_table', type: 'BASE TABLE' }]);
  h.catalog.invalidate();
  const refreshing = h.render({ loading: true });
  assert.doesNotMatch(bodyText(refreshing), /orders/, '刷新时库表区显示读取状态');
  const refreshed = h.render({ loading: false });
  assert.equal(toggleFor(refreshed, 'orders')['aria-expanded'], false, '刷新后收起旧库表');
  toggleFor(refreshed, 'orders').onClick();
  const reloading = h.render();
  assert.equal(h.catalog.reads.length, 2, '刷新后重新读取表');
  assert.match(bodyText(reloading), /正在读取表/);
  h.catalog.resolve('orders', [{ name: 'orders_table', type: 'BASE TABLE' }]);
  assert.match(bodyText(h.render()), /orders_table/);
});

test('页面停用取消未完成的表读取，恢复后按当前目标重新读取', () => {
  const h = resourceHarness();
  toggleFor(h.render(), 'orders').onClick();
  h.render();
  assert.equal(h.catalog.reads.length, 1);
  h.catalog.invalidate();
  const inactive = h.render({ active: false });
  assert.equal(h.catalog.reads[0].controller.signal.aborted, true, '页面停用时取消未完成读取');
  assert.equal(toggleFor(inactive, 'orders')['aria-expanded'], true, '恢复后保留展开痕迹');
  assert.equal(h.catalog.reads.length, 1, '页面停用期间不发起读取');
  assert.match(bodyText(inactive), /页面恢复后继续读取/);
  const restored = h.render({ active: true });
  assert.equal(h.catalog.reads.length, 2, '恢复后重新读取当前目标');
  h.catalog.resolve('orders', [{ name: 'orders_table', type: 'BASE TABLE' }]);
  assert.match(bodyText(h.render()), /orders_table/);
});
