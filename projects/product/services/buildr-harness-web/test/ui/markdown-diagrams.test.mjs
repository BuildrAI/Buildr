import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdownDiagrams } from '../../src/lib/markdownDiagrams.ts';
import { cachedDiagramSvg, rememberDiagramSvg } from '../../src/lib/markdownDiagramSvg.ts';

function fixture(count = 1) {
  const listeners = new Set(), sent = [];
  const drawing = { viewBox: { baseVal: { width: 640 } }, style: {} };
  const blocks = Array.from({ length: count }, () => {
    const graph = { hidden: true, innerHTML: '', querySelector: () => graph.innerHTML.includes('<svg') ? drawing : null, querySelectorAll: () => [], replaceChildren() { this.innerHTML = ''; } };
    const details = { open: true }, note = { hidden: false, textContent: '' };
    return { dataset: { mermaidSource: 'graph LR\nA --> B' }, graph, details, note,
      querySelector: selector => selector === 'details' ? details : selector.includes('view') ? graph : note };
  });
  const frame = { contentWindow: { postMessage: value => sent.push(value) }, setAttribute() {}, addEventListener() {}, remove() { this.removed = true; } };
  const view = { location: { origin: 'http://localhost' }, addEventListener: (_, cb) => listeners.add(cb), removeEventListener: (_, cb) => listeners.delete(cb) };
  const root = { isConnected: true, querySelectorAll: () => blocks, ownerDocument: { defaultView: view, createElement: () => frame, body: { append() {} } } };
  const receive = (data, source = frame.contentWindow, origin = view.location.origin) => listeners.forEach(cb => cb({ data, source, origin }));
  return { root, frame, blocks, sent, listeners, receive };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('独立图示身份，准确来源回应后才插入，图形默认显示且可展开源码', async () => {
  const f = fixture(2), cleanup = renderMarkdownDiagrams(f.root);
  try {
    f.receive({ type: 'buildr:mermaid:ready' }, {});
    assert.equal(f.sent.length, 0);
    f.receive({ type: 'buildr:mermaid:ready' });
    assert.equal(f.sent.length, 2);
    assert.notEqual(f.sent[0].id, f.sent[1].id);
    f.receive({ type: 'buildr:mermaid:result', id: f.sent[0].id, svg: '<svg />' }, f.frame.contentWindow, 'http://other');
    await settle();
    assert.equal(f.blocks[0].graph.hidden, true);
    f.receive({ type: 'buildr:mermaid:result', id: f.sent[0].id, svg: '<svg />' });
    f.receive({ type: 'buildr:mermaid:result', id: f.sent[1].id, error: 'invalid' });
    await settle();
    assert.equal(f.blocks[0].dataset.mermaidState, 'rendered');
    assert.equal(f.blocks[0].details.open, false);
    assert.equal(f.blocks[1].dataset.mermaidState, 'fallback');
    assert.equal(f.blocks[1].details.open, true);
    assert.match(f.blocks[1].note.textContent, /当前显示 Mermaid 源码/);
    assert.equal(f.frame.removed, true, '全部绘图结束立即释放绘图环境');
    assert.equal(f.listeners.size, 0);
  } finally { cleanup(); }
  assert.equal(f.listeners.size, 0);
  assert.equal(f.frame.removed, true);
});

test('图示缓存有界，不保留超大图示，避免展开时重复绘图', () => {
  rememberDiagramSvg('cached-source', '<svg />');
  assert.equal(cachedDiagramSvg('cached-source'), '<svg />');
  rememberDiagramSvg('oversized-source', 'x'.repeat(1_000_001));
  assert.equal(cachedDiagramSvg('oversized-source'), undefined);
  for (let i = 0; i < 30; i++) rememberDiagramSvg(`bounded-${i}`, '<svg />');
  assert.equal(cachedDiagramSvg('cached-source'), undefined);
  assert.equal(cachedDiagramSvg('bounded-29'), '<svg />');
});

test('清理及正文移除阻止迟到插入，空正文不创建绘图环境', async () => {
  const f = fixture(), cleanup = renderMarkdownDiagrams(f.root);
  f.receive({ type: 'buildr:mermaid:ready' });
  cleanup();
  f.receive({ type: 'buildr:mermaid:result', id: f.sent[0].id, svg: '<svg />' });
  await settle();
  assert.equal(f.blocks[0].graph.innerHTML, '');
  const removed = fixture(), stop = renderMarkdownDiagrams(removed.root);
  removed.receive({ type: 'buildr:mermaid:ready' });
  removed.root.isConnected = false;
  removed.receive({ type: 'buildr:mermaid:result', id: removed.sent[0].id, svg: '<svg />' });
  await settle();
  assert.equal(removed.blocks[0].graph.innerHTML, '');
  stop();
  renderMarkdownDiagrams({ querySelectorAll: () => [] })();
});

function createMockElement(tagName, attributes = {}) {
  const attrs = new Map(Object.entries(attributes));
  const listeners = new Map();
  const classes = new Set((attributes.className || '').split(/\s+/).filter(Boolean));
  const children = [];
  const element = {
    tagName: tagName.toUpperCase(),
    children,
    parentNode: null,
    parentElement: null,
    ownerDocument: null,
    textContent: '',
    style: {},
    clientWidth: 320,
    clientHeight: 200,
    scrollHeight: 200,
    scrollTop: 0,
    classList: {
      add: (...items) => items.forEach(item => classes.add(item)),
      contains: item => classes.has(item),
    },
    setAttribute(name, value) {
      attrs.set(name, String(value));
      if (name === 'class') {
        classes.clear();
        String(value).split(/\s+/).filter(Boolean).forEach(item => classes.add(item));
      }
    },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    append(...nodes) {
      for (const node of nodes) {
        node.parentNode = element;
        node.parentElement = element;
        children.push(node);
      }
    },
    prepend(...nodes) {
      for (const node of [...nodes].reverse()) {
        node.parentNode = element;
        node.parentElement = element;
        children.unshift(node);
      }
    },
    insertBefore(node, reference) {
      const index = children.indexOf(reference);
      node.parentNode = element;
      node.parentElement = element;
      if (index === -1) children.push(node);
      else children.splice(index, 0, node);
      return node;
    },
    addEventListener(type, listener) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
    },
    matchesSelector(selector) {
      if (selector === 'button[data-zoom-diagram]') return element.tagName === 'BUTTON' && attrs.has('data-zoom-diagram');
      if (selector === 'button[data-copy-code]') return element.tagName === 'BUTTON' && attrs.has('data-copy-code');
      if (selector === '.markdown-diagram-view') return classes.has('markdown-diagram-view');
      if (selector === '.markdown-diagram') return classes.has('markdown-diagram');
      if (selector === 'pre code') return element.tagName === 'CODE' && element.parentElement?.tagName === 'PRE';
      return false;
    },
    querySelector(selector) {
      for (const child of children) {
        if (child.matchesSelector(selector)) return child;
        const nested = child.querySelector(selector);
        if (nested) return nested;
      }
      return null;
    },
    querySelectorAll(selector) {
      const found = [];
      for (const child of children) {
        if (child.matchesSelector(selector)) found.push(child);
        found.push(...child.querySelectorAll(selector));
      }
      return found;
    },
  };
  return element;
}

test('bindMarkdownDiagramPreviews 为已渲染流程图绑定点击与按键放大触发器', async () => {
  const { bindMarkdownDiagramPreviews } = await import('../../src/lib/markdownDiagramPreviews.ts');
  const { rememberBlockDiagramSvg, readBlockDiagramSvg } = await import('../../src/lib/markdownDiagramSvg.ts');

  const doc = {
    defaultView: { getSelection: () => ({ isCollapsed: true, toString: () => '' }) },
    createElement: tag => {
      const el = createMockElement(tag);
      el.ownerDocument = doc;
      return el;
    },
  };

  function makeDiagramBlock(state, sourceText) {
    const block = createMockElement('div', { className: 'markdown-diagram', 'data-mermaid-state': state });
    block.ownerDocument = doc;
    const copy = createMockElement('button', { 'data-copy-code': '' });
    const view = createMockElement('div', { className: 'markdown-diagram-view' });
    const pre = createMockElement('pre');
    const code = createMockElement('code');
    code.textContent = sourceText;
    pre.append(code);
    block.append(copy, view, pre);
    for (const node of [copy, view, pre, code]) node.ownerDocument = doc;
    return { block, copy, view };
  }

  const root = createMockElement('div');
  const rendered = makeDiagramBlock('rendered', 'graph LR\nA-->B');
  const pending = makeDiagramBlock('pending', 'graph LR\nC-->D');
  rememberBlockDiagramSvg(rendered.block, '<svg id="diagram-1" />');
  assert.equal(readBlockDiagramSvg(rendered.block), '<svg id="diagram-1" />');
  root.append(rendered.block, pending.block);

  const opened = [];
  bindMarkdownDiagramPreviews(root, () => item => opened.push(item));

  const zoom = rendered.block.querySelector('button[data-zoom-diagram]');
  assert.ok(zoom);
  assert.equal(zoom.getAttribute('aria-label'), '放大查看流程图');
  assert.equal(rendered.block.children[0], zoom);

  let prevented = 0;
  let stopped = 0;
  const makeEvent = (type, extra = {}) => ({
    type,
    preventDefault() { prevented += 1; },
    stopPropagation() { stopped += 1; },
    ...extra,
  });

  zoom.dispatchEvent(makeEvent('click'));
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0], { svg: '<svg id="diagram-1" />', source: 'graph LR\nA-->B' });
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);

  rendered.view.dispatchEvent(makeEvent('click', { offsetX: 800, offsetY: 50 }));
  assert.equal(opened.length, 1);

  rendered.view.dispatchEvent(makeEvent('click', { offsetX: 80, offsetY: 50 }));
  assert.equal(opened.length, 2);

  rendered.view.dispatchEvent(makeEvent('keydown', { key: 'Enter' }));
  rendered.view.dispatchEvent(makeEvent('keydown', { key: ' ' }));
  rendered.view.dispatchEvent(makeEvent('keydown', { key: 'Escape' }));
  assert.equal(opened.length, 4);

  pending.block.querySelector('button[data-zoom-diagram]').dispatchEvent(makeEvent('click'));
  pending.view.dispatchEvent(makeEvent('click', { offsetX: 40, offsetY: 40 }));
  assert.equal(opened.length, 4);
});

test('forwardDiagramBoundaryWheel 在流程图纵向边界或无溢出时继续滚动外层信息流', async () => {
  const { forwardDiagramBoundaryWheel } = await import('../../src/markdown.ts');

  const stream = createMockElement('div');
  stream.style = { overflowY: 'auto' };
  stream.clientHeight = 400;
  stream.scrollHeight = 1000;
  stream.scrollTop = 120;

  const block = createMockElement('div');
  const graph = createMockElement('div');
  stream.append(block);
  block.append(graph);

  graph.clientHeight = 200;
  graph.scrollHeight = 420;
  graph.scrollTop = 60;

  let prevented = 0;
  const makeWheel = (deltaY, extra = {}) => ({
    deltaY,
    deltaX: 0,
    deltaMode: 0,
    defaultPrevented: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault() { prevented += 1; this.defaultPrevented = true; },
    ...extra,
  });

  // 内部尚有滚动余量时不接管，保留组件内滚动
  assert.equal(forwardDiagramBoundaryWheel(graph, makeWheel(40)), false);
  assert.equal(stream.scrollTop, 120);
  assert.equal(prevented, 0);

  // 到达组件底部后继续向下滚，传递给外层滚动容器
  graph.scrollTop = 220;
  assert.equal(forwardDiagramBoundaryWheel(graph, makeWheel(45)), true);
  assert.equal(stream.scrollTop, 165);
  assert.equal(prevented, 1);

  // 到达组件顶部后继续向上滚，传递给外层滚动容器
  graph.scrollTop = 0;
  assert.equal(forwardDiagramBoundaryWheel(graph, makeWheel(-35)), true);
  assert.equal(stream.scrollTop, 130);
  assert.equal(prevented, 2);

  // 横向滚动与缩放手势不劫持
  assert.equal(forwardDiagramBoundaryWheel(graph, makeWheel(10, { deltaX: 50 })), false);
  assert.equal(forwardDiagramBoundaryWheel(graph, makeWheel(20, { ctrlKey: true })), false);

  // 图表无纵向溢出时直接向下/上滚动外层信息流
  graph.scrollHeight = 180;
  graph.scrollTop = 0;
  assert.equal(forwardDiagramBoundaryWheel(graph, makeWheel(25)), true);
  assert.equal(stream.scrollTop, 155);
});
