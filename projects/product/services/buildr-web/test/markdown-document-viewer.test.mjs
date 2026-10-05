import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react' && context.parentURL?.endsWith('/lib/useMarkdownDocumentViewer.ts')) {
      const source = ['useCallback', 'useEffect', 'useRef', 'useState'].map(name => `export const ${name} = (...args) => globalThis.__markdownDocumentHookHarness.${name}(...args);`).join('\n');
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const { useMarkdownDocumentViewer } = await import('../src/lib/useMarkdownDocumentViewer.ts');
const missingMessage = path => `未找到 ${path}`;
const document = (path, content = path, exists = true) => ({ path, name: path, exists, content });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const readingState = ({ path, history, document, loading, message }) => ({ path, history, document, loading, message });

// Only React scheduling is modeled; requests, navigation and all state transitions use the real hook.
function hookHarness(initialReader) {
  const slots = [], effects = [];
  let cursor = 0, writes = 0;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  globalThis.__markdownDocumentHookHarness = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => { writes += 1; slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useCallback(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        const previous = slots[index]; slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  return {
    render(reader = initialReader) { cursor = 0; const output = useMarkdownDocumentViewer(reader, missingMessage); effects.splice(0).forEach(effect => effect()); return output; },
    writes() { return writes; },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); delete globalThis.__markdownDocumentHookHarness; },
  };
}

function readerFixture() {
  const requests = [];
  // Deliberately ignore cancellation, so a generation check must still reject late replies.
  const reader = (path, signal) => { const value = deferred(); requests.push({ ...value, path, signal }); return value.promise; };
  return { reader, requests };
}

test('晚成功不得覆盖最新正文、路径、历史、等待状态与提示', async () => {
  const { reader, requests } = readerFixture(), harness = hookHarness(reader);
  try {
    const first = harness.render().open('A.md'), latest = harness.render().open('B.md');
    requests[1].resolve(document('B.md', 'LATEST')); await latest;
    const expected = readingState(harness.render());
    requests[0].resolve(document('A.md', 'LATE')); await first;
    assert.deepEqual(readingState(harness.render()), expected);
    assert.deepEqual(expected, { path: 'B.md', history: ['README.md', 'B.md'], document: document('B.md', 'LATEST'), loading: false, message: null });
    assert.equal(requests[0].signal?.aborted, true);
  } finally { harness.dispose(); }
});

test('晚失败不能替换当前缺失提示，旧 finally 不能结束新请求的等待', async () => {
  const { reader, requests } = readerFixture(), harness = hookHarness(reader);
  try {
    const first = harness.render().open('A.md'), latest = harness.render().open('B.md');
    requests[0].reject(new Error('旧读取失败')); await first;
    assert.equal(harness.render().loading, true);
    assert.equal(harness.render().message, null);
    requests[1].resolve(document('B.md', null, false)); await latest;
    assert.equal(harness.render().message, '未找到 B.md');

    const slow = harness.render().open('slow.md'), current = harness.render().open('current.md');
    requests[3].resolve(document('current.md')); await current;
    const expected = readingState(harness.render());
    requests[2].reject(new Error('晚到的失败')); await slow;
    assert.deepEqual(readingState(harness.render()), expected);
  } finally { harness.dispose(); }
});

test('真实 AGENTS 根与快速连续返回按当前历史退栈，未完成链接不能重新加入历史', async () => {
  const { reader, requests } = readerFixture(), harness = hookHarness(reader);
  try {
    for (const path of ['AGENTS.md', 'guide.md', 'details.md']) {
      const promise = harness.render().open(path, path === 'AGENTS.md' ? { replaceHistory: true } : {});
      requests.at(-1).resolve(document(path)); await promise;
    }
    assert.deepEqual(harness.render().history, ['AGENTS.md', 'guide.md', 'details.md']);
    const slow = harness.render().open('slow.md');
    const back = harness.render().back;
    back(); back();
    assert.deepEqual(requests.slice(-2).map(request => request.path), ['guide.md', 'AGENTS.md']);
    assert.equal(requests[3].signal?.aborted, true);
    assert.equal(requests[4].signal?.aborted, true);
    requests[5].resolve(document('AGENTS.md', 'CURRENT ROOT')); await settle();
    requests[4].resolve(document('guide.md', 'LATE BACK')); await settle();
    requests[3].resolve(document('slow.md', 'LATE LINK')); await slow;
    assert.deepEqual(readingState(harness.render()), { path: 'AGENTS.md', history: ['AGENTS.md'], document: document('AGENTS.md', 'CURRENT ROOT'), loading: false, message: null });
  } finally { harness.dispose(); }
});

test('重置取消旧读取并立即结束等待，晚响应不能改写已重置正文或局部提示', async () => {
  const { reader, requests } = readerFixture(), harness = hookHarness(reader);
  try {
    const promise = harness.render().open('pending.md');
    harness.render().reset(document('selected.md', 'RESET'));
    assert.equal(harness.render().loading, false);
    assert.equal(requests[0].signal?.aborted, true);
    harness.render().setMessage('仅支持项目内文档');
    requests[0].resolve(document('pending.md', 'LATE')); await promise;
    assert.deepEqual(readingState(harness.render()), { path: 'selected.md', history: ['selected.md'], document: document('selected.md', 'RESET'), loading: false, message: '仅支持项目内文档' });
  } finally { harness.dispose(); }
});

test('换项目在首次 render 就隐藏旧正文并清空历史，旧读取者不能再次打开或污染新项目', async () => {
  const old = readerFixture(), current = readerFixture(), harness = hookHarness(old.reader);
  try {
    harness.render().reset(document('old.md', 'OLD PROJECT'));
    const oldOpen = harness.render().open;
    const previous = oldOpen('old-pending.md');
    const firstNewRender = harness.render(current.reader);
    assert.equal(firstNewRender.document, null);
    assert.deepEqual(firstNewRender.history, ['README.md']);
    assert.equal(old.requests[0].signal?.aborted, true);
    await oldOpen('wrong-project.md');
    assert.equal(old.requests.length, 1);
    const latest = harness.render(current.reader).open('AGENTS.md', { replaceHistory: true });
    current.requests[0].resolve(document('AGENTS.md', 'NEW PROJECT')); await latest;
    old.requests[0].resolve(document('old-pending.md', 'LATE OLD PROJECT')); await previous;
    assert.deepEqual(readingState(harness.render(current.reader)), { path: 'AGENTS.md', history: ['AGENTS.md'], document: document('AGENTS.md', 'NEW PROJECT'), loading: false, message: null });
  } finally { harness.dispose(); }
});

test('卸载失效读取，忽略取消的晚成功或晚失败均不再提交状态', async () => {
  for (const outcome of ['success', 'failure']) {
    const { reader, requests } = readerFixture(), harness = hookHarness(reader);
    const promise = harness.render().open('pending.md');
    harness.dispose();
    const writes = harness.writes();
    if (outcome === 'success') requests[0].resolve(document('pending.md'));
    else requests[0].reject(new Error('late failure'));
    await promise;
    assert.equal(harness.writes(), writes);
    assert.equal(requests[0].signal?.aborted, true);
  }
});
