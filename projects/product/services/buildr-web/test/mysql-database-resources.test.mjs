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

// Exercise the real component's events and effects, replacing React scheduling only.
function resourceHarness(overrides = {}) {
  const slots = [], effects = [], writes = [];
  let cursor = 0, dirty = false, node;
  let props = { databases: ['orders', 'billing'], visible: ['orders'], current: '', loading: false, saving: false, writable: true, active: true, onCurrent() {}, onVisible: values => writes.push(values), ...overrides };
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
      popover: popover.props,
      trigger: descendants(node).find(element => element.props.id === 'enable-mysql-databases').props,
      search: controls.find(element => element.props['aria-label'] === '搜索数据库').props,
      choices: React.Children.toArray(group.props.children).filter(element => typeof element.props.checked === 'boolean'),
      text: textContent(content),
      controls,
    };
  }
  return { render, writes };
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
