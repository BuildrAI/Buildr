import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react' && context.parentURL?.endsWith('/hooks/useSourceControlRead.ts')) {
      const source = ['useCallback', 'useEffect', 'useRef', 'useState'].map(name => `export const ${name} = (...args) => globalThis.__sourceControlHookHarness.${name}(...args);`).join('\n');
      return {url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true};
    }
    return next(specifier, context);
  },
});
const { useSourceControlRead } = await import('../src/features/code/hooks/useSourceControlRead.ts');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

// Model React scheduling only; source keys, cancellation, cache and result/error transitions use the real hook.
function hookHarness() {
  const slots = [], effects = [];
  let cursor = 0;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  globalThis.__sourceControlHookHarness = {
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = {value: initial}; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= {current: initial}; },
    useCallback(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = {fn, deps}; return slots[index].fn; },
    useEffect(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { const previous = slots[index]; slots[index] = {deps}; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); }); } },
  };
  return {
    render(key, input, loader, enabled = true, version = '') { cursor = 0; const output = useSourceControlRead(key, input, loader, enabled, version); effects.splice(0).forEach(effect => effect()); return output; },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); delete globalThis.__sourceControlHookHarness; },
  };
}

test('工作空间、代码库、工作树、同路径比较层和固定提交切换拒绝旧回复，包含忽略AbortSignal的读取者', async () => {
  const harness = hookHarness(), requests = [];
  const loader = (input, signal) => { const request = deferred(); requests.push({...request, input, signal}); return request.promise; };
  const inputs = [
    {workspace: 'A', repositoryId: 'repo-1', worktreeId: 'main-checkout', area: 'unstaged', path: 'same.ts'},
    {workspace: 'A', repositoryId: 'repo-1', worktreeId: 'linked-checkout', area: 'unstaged', path: 'same.ts'},
    {workspace: 'A', repositoryId: 'repo-1', area: 'staged', path: 'same.ts'},
    {workspace: 'A', repositoryId: 'repo-2', area: 'staged', path: 'same.ts'},
    {workspace: 'A', repositoryId: 'repo-2', area: 'commit', path: 'same.ts', commitHash: 'a'.repeat(40)},
    {workspace: 'A', repositoryId: 'repo-2', area: 'commit', path: 'same.ts', commitHash: 'b'.repeat(40)},
    {workspace: 'B', repositoryId: 'repo-2', area: 'commit', path: 'same.ts', commitHash: 'b'.repeat(40)},
  ];
  const current = inputs.at(-1), key = JSON.stringify(current);
  try {
    inputs.forEach(input => harness.render(JSON.stringify(input), input, loader));
    assert.ok(requests.slice(0, -1).every(request => request.signal.aborted));
    requests.at(-1).resolve({source: current, patch: 'CURRENT'}); await settle();
    requests.slice(0, -1).reverse().forEach(request => request.resolve({source: request.input, patch: 'STALE'})); await settle();
    const result = harness.render(key, current, loader);
    assert.deepEqual(result.data, {source: current, patch: 'CURRENT'});
    assert.equal(result.error, ''); assert.equal(result.loading, false);
    assert.equal(requests.length, inputs.length, '普通render不能重复读取同一来源');
  } finally { harness.dispose(); }
});

test('同来源刷新失败保留上次真实结果并呈现错误，随后成功重读替换旧版本', async () => {
  const harness = hookHarness(), requests = [], input = {repositoryId: 'repo', area: 'staged', path: 'file.ts'};
  const loader = (value, signal) => { const request = deferred(); requests.push({...request, input: value, signal}); return request.promise; };
  const render = () => harness.render('same-index-source', input, loader);
  try {
    render(); requests[0].resolve({revision: 'index:old:100644', content: 'OLD'}); await settle();
    const refresh = render().refresh();
    assert.deepEqual(render().data, {revision: 'index:old:100644', content: 'OLD'}); assert.equal(render().loading, true);
    requests[1].reject(Error('index changed')); await refresh;
    assert.equal(render().error, 'index changed'); assert.equal(render().data.content, 'OLD'); assert.equal(render().loading, false);
    const recovery = render().refresh(); requests[2].resolve({revision: 'index:new:100644', content: 'NEW'}); await recovery;
    assert.deepEqual(render().data, {revision: 'index:new:100644', content: 'NEW'}); assert.equal(render().error, '');
  } finally { harness.dispose(); }
});

test('连续刷新拒绝晚到的同来源失败；退出阅读取消正在读取的版本且不丢已读缓存', async () => {
  const harness = hookHarness(), requests = [], input = {repositoryId: 'repo', area: 'commit', commitHash: 'c'.repeat(40), path: 'file.ts'};
  const loader = (value, signal) => { const request = deferred(); requests.push({...request, input: value, signal}); return request.promise; };
  const render = enabled => harness.render('fixed-history-file', input, loader, enabled);
  try {
    render(true); requests[0].resolve({revision: 'git:commit:blob', content: 'READ'}); await settle();
    const oldRefresh = render(true).refresh(), latestRefresh = render(true).refresh();
    requests[2].resolve({revision: 'git:commit:blob', content: 'LATEST'}); await latestRefresh;
    requests[1].reject(Error('late failure')); await oldRefresh;
    assert.equal(render(true).data.content, 'LATEST'); assert.equal(render(true).error, '');
    const pending = render(true).refresh(); render(false); assert.equal(requests[3].signal.aborted, true);
    requests[3].resolve({revision: 'wrong', content: 'LATE'}); await pending;
    assert.equal(render(false).data.content, 'LATEST'); assert.equal(render(false).loading, false);
  } finally { harness.dispose(); }
});
