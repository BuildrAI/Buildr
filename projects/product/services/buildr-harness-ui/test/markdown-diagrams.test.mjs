import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdownDiagrams } from '../src/lib/markdownDiagrams.ts';
import { cachedDiagramSvg, rememberDiagramSvg } from '../src/lib/markdownDiagramSvg.ts';

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
