import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const facade = source => ({ url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true });
const scoped = parent => /\/service-runtime\/components\/(?:StartWorktreeModal|TaskLocalRuntime)\.tsx$/u.test(parent || '');
registerHooks({
  resolve(specifier, context, next) {
    if (scoped(context.parentURL)) {
      if (specifier === 'react') return facade(['useEffect', 'useMemo', 'useState'].map(name => `export const ${name}=(...args)=>globalThis.__startHooks.${name}(...args);`).join('\n'));
      if (specifier === 'antd') return facade('export const Alert="alert",Button="button",Modal="modal",Tag="tag";export const App={useApp:()=>({message:{success:text=>globalThis.__startMessages.push(text),warning(){}}})};');
      if (specifier.endsWith('/AppShellContext')) return facade('export const useAppShell=()=>({workspaceId:"workspace-one"});');
      if (specifier === '../../../api') return facade('export const api=(...args)=>globalThis.__startRequest(...args);');
      if (specifier.endsWith('/useServiceRuntime')) return facade('export const useServiceRuntimeDetail=(...args)=>{globalThis.__startDetailArgs.push(args);return globalThis.__startRead;};export const useTaskRuntime=()=>globalThis.__startRead;');
      if (specifier.endsWith('/labels')) return facade('export const workspaceHref=(_workspace,path)=>path;');
      if (specifier.endsWith('/confirm')) return facade('export const confirmModal=async()=>{throw Error("unexpected stop confirmation")};');
      if (specifier.startsWith('./')) {
        const name = specifier.slice(2);
        return facade(`export const ${name}=${JSON.stringify(name)};`);
      }
    }
    if (specifier === '../../../api' && context.parentURL?.endsWith('/service-runtime/api/service-runtime-api.ts')) return facade('export const api=(...args)=>globalThis.__startRequest(...args);');
    try { return next(specifier, context); } catch (cause) {
      if (!specifier.startsWith('.') || !context.parentURL?.includes('/src/')) throw cause;
      for (const suffix of ['.ts', '.tsx', '/index.ts']) { const url = new URL(specifier + suffix, context.parentURL); if (existsSync(fileURLToPath(url))) return next(url.href, context); }
      throw cause;
    }
  },
  load(url, context, next) {
    if (url.endsWith('.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { StartWorktreeModal } = await import('../src/features/service-runtime/components/StartWorktreeModal.tsx');
const { TaskLocalRuntime } = await import('../src/features/service-runtime/components/TaskLocalRuntime.tsx');
const find = (tree, type) => Array.isArray(tree) ? tree.flatMap(item => find(item, type)) : tree && typeof tree === 'object' ? [...(tree.type === type ? [tree] : []), ...find(tree.props?.children, type)] : [];
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
function harness(component, data) {
  const slots = [], effects = [], requests = []; let cursor = 0, refreshes = 0;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  globalThis.__startHooks = {
    useMemo(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value; },
    useState(value) { const index = cursor++; slots[index] ||= { value: typeof value === 'function' ? value() : value }; return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }]; },
    useEffect(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { slots[index] = { deps }; effects.push(fn); } },
  };
  globalThis.__startRead = { data, loading: false, error: '', async refresh() { refreshes += 1; } };
  globalThis.__startMessages = [];
  globalThis.__startDetailArgs = [];
  globalThis.__startRequest = (url, options) => new Promise((resolve, reject) => requests.push({ url, ...options, resolve, reject }));
  return { requests, read: globalThis.__startRead, detailArgs: globalThis.__startDetailArgs, messages: globalThis.__startMessages, refreshes: () => refreshes, render(props) { cursor = 0; const tree = component(props); effects.splice(0).forEach(effect => effect()); return tree; }, dispose() { for (const name of ['__startHooks', '__startRead', '__startRequest', '__startMessages', '__startDetailArgs']) delete globalThis[name]; } };
}
const worktree = (code, main = false) => ({ id: code + '-tree', path: '/code/' + code, label: main ? '主工作库' : '订单验证', branch: main ? 'dev' : 'feature/order', head: 'a'.repeat(40), dirty: false, main, taskId: main ? null : 'task-one', taskTitle: main ? null : '订单验证' });
const backend = { serviceCode: 'back', environmentVariable: 'BACKEND_URL', remoteUrl: 'https://test.example.com' };
const service = code => ({ id: code, code, name: code, runs: [], definition: { local: { ...(code === 'front' ? { backend } : {}) } } });
const ready = { target: { runId: 'back-ready', serviceCode: 'back', url: 'http://127.0.0.1:8189', worktreeLabel: '订单验证', branch: 'feature/order' }, reason: null };
const missing = { target: null, reason: '请先启动本任务后端。' };
const initialRun = { id: 'front-running', serviceCode: 'front', worktreeId: 'front-tree', status: 'running', pid: 42, actualPort: 3000, taskId: 'task-one', connection: { mode: 'remote' } };
const primary = modal => find(modal.props.footer, 'button').find(button => button.props.type === 'primary');

test('切换连接携带已展示后端实例，目标变更失败不先停止前端', async () => {
  const detail = { service: { ...service('front'), runs: [initialRun] }, worktrees: [worktree('front')], connectionTargets: { 'front-tree': ready }, diagnostics: [] };
  const h = harness(StartWorktreeModal, detail);
  const props = { open: true, serviceCode: 'front', initialRun, onClose() {} };
  try {
    h.render(props); let tree = h.render(props);
    assert.deepEqual(h.detailArgs.at(-1), ['workspace-one', 'front', 'task-one'], '重开任务实例切换使用原实例的明确任务身份');
    find(tree, 'RuntimeStartOptions')[0].props.onConnection('local'); tree = h.render(props);
    assert.equal(primary(tree).props.disabled, false);
    primary(tree).props.onClick(); assert.equal(h.requests.length, 1);
    assert.match(h.requests[0].url, /\/runs\/front-running\/restart$/u);
    assert.deepEqual(JSON.parse(h.requests[0].body), { connection: 'local', expectedBackendRunId: 'back-ready', expectedWorktree: { path: '/code/front', branch: 'feature/order', head: 'a'.repeat(40), dirty: false } });
    h.read.data = { ...detail, connectionTargets: { 'front-tree': { target: { ...ready.target, runId: 'replacement-back', url: 'http://127.0.0.1:8190' }, reason: null } } };
    h.requests[0].reject(new Error('后端实例已变化，请重新确认；原前端保持运行。')); await settle(); tree = h.render(props);
    assert.equal(h.requests.length, 1); assert.equal(initialRun.status, 'running');
    assert.ok(find(tree, 'alert').some(alert => alert.props.message === '后端实例已变化，请重新确认；原前端保持运行。'));
    assert.ok(find(tree, 'alert').some(alert => alert.props.message === '先校验连接，再重启当前前端'));
    assert.equal(h.refreshes(), 1);
  } finally { h.dispose(); }
});

test('单服务本地启动固定已展示后端实例，远程启动不携带后端实例', async () => {
  for (const connection of ['local', 'remote']) {
    const detail = { service: service('front'), worktrees: [worktree('front')], connectionTargets: { 'front-tree': ready }, diagnostics: [] };
    const h = harness(StartWorktreeModal, detail);
    const props = { open: true, serviceCode: 'front', onClose() {} };
    try {
      h.render(props); let tree = h.render(props); find(tree, 'RuntimeStartOptions')[0].props.onConnection(connection); tree = h.render(props);
      assert.deepEqual(h.detailArgs.at(-1), ['workspace-one', 'front', undefined], '普通服务启动仍读取全局详情');
      primary(tree).props.onClick(); assert.equal(h.requests.length, 1);
      const body = JSON.parse(h.requests[0].body); assert.equal(body.connection, connection);
      if (connection === 'local') assert.equal(body.expectedBackendRunId, 'back-ready');
      else assert.equal(Object.hasOwn(body, 'expectedBackendRunId'), false);
      h.requests[0].resolve({ ...initialRun, status: 'starting' }); await settle();
    } finally { h.dispose(); }
  }
});

test('已选本地后端失去就绪或改选目录时保留选择并阻止提交，不静默切远程', () => {
  const detail = { service: service('front'), worktrees: [worktree('front'), worktree('other', true)], connectionTargets: { 'front-tree': ready, 'other-tree': missing }, diagnostics: [] };
  const h = harness(StartWorktreeModal, detail);
  const props = { open: true, serviceCode: 'front', onClose() {} };
  try {
    h.render(props); h.render(props); let tree = h.render(props);
    let options = find(tree, 'RuntimeStartOptions')[0]; options.props.onWorktree('front-tree'); options.props.onConnection('local');
    tree = h.render(props); assert.equal(primary(tree).props.disabled, false);
    h.read.data = { ...detail, connectionTargets: { ...detail.connectionTargets, 'front-tree': missing } };
    tree = h.render(props); assert.equal(primary(tree).props.disabled, true); assert.equal(find(tree, 'RuntimeStartOptions')[0].props.connection, 'local');
    primary(tree).props.onClick(); assert.equal(h.requests.length, 0);
    h.read.data = detail; tree = h.render(props); assert.equal(primary(tree).props.disabled, false);
    find(tree, 'RuntimeStartOptions')[0].props.onWorktree('other-tree'); tree = h.render(props);
    assert.equal(primary(tree).props.disabled, true); assert.equal(find(tree, 'RuntimeStartOptions')[0].props.connection, 'local');
  } finally { h.dispose(); }
});

test('重启返回失败或已停止实例时展示真实错误，不报成功或关闭面板', async () => {
  for (const status of ['failed', 'stopped']) {
    const detail = { service: { ...service('front'), runs: [initialRun] }, worktrees: [worktree('front')], connectionTargets: { 'front-tree': ready }, diagnostics: [] };
    const h = harness(StartWorktreeModal, detail);
    let closes = 0;
    const props = { open: true, serviceCode: 'front', initialRun, onClose() { closes += 1; } };
    try {
      h.render(props); const tree = h.render(props); primary(tree).props.onClick();
      const failure = `服务${status}：原实例已停止，请检查启动日志。`;
      h.requests[0].resolve({ ...initialRun, id: 'replacement', status, failure }); await settle();
      assert.deepEqual(h.messages, []); assert.equal(closes, 0); assert.equal(h.refreshes(), 1);
      assert.ok(find(h.render(props), 'alert').some(alert => alert.props.message === failure));
      assert.equal(h.requests.length, 1);
    } finally { h.dispose(); }
  }
});

test('任务前后端一起启动仍可用，取消未就绪后端后禁止本地提交，可明确改选远程', async () => {
  const services = ['front', 'back'].map(code => ({ service: service(code), worktree: worktree(code), connectionTarget: code === 'front' ? missing : null, diagnostics: [] }));
  const h = harness(TaskLocalRuntime, { taskId: 'task-one', services, runs: [], diagnostics: [] });
  try {
    let tree = h.render({ taskId: 'task-one' }); find(tree, 'LocalRuntimeSurface')[0].props.onStart(); tree = h.render({ taskId: 'task-one' });
    let modal = find(tree, 'modal')[0]; assert.equal(modal.props.open, true); assert.equal(primary(modal).props.disabled, false);
    let options = find(modal, 'RuntimeStartOptions')[0]; assert.deepEqual(options.props.selected, ['front', 'back']);
    options.props.onSelected(['front']); tree = h.render({ taskId: 'task-one' }); modal = find(tree, 'modal')[0]; assert.equal(primary(modal).props.disabled, true);
    primary(modal).props.onClick(); assert.equal(h.requests.length, 0);
    find(modal, 'RuntimeStartOptions')[0].props.onConnection('remote'); tree = h.render({ taskId: 'task-one' }); modal = find(tree, 'modal')[0]; assert.equal(primary(modal).props.disabled, false);
    find(modal, 'RuntimeStartOptions')[0].props.onSelected(['front', 'back']); find(modal, 'RuntimeStartOptions')[0].props.onConnection('local');
    tree = h.render({ taskId: 'task-one' }); primary(find(tree, 'modal')[0]).props.onClick();
    assert.equal(h.requests.length, 1); assert.match(h.requests[0].url, /\/tasks\/task-one\/runs$/u);
    assert.equal(JSON.parse(h.requests[0].body).connection, 'local'); assert.deepEqual(JSON.parse(h.requests[0].body).selected.map(item => item.serviceCode), ['front', 'back']);
    h.requests[0].resolve({ taskId: 'task-one', results: [] }); await settle();
  } finally { h.dispose(); }
});

test('任务只启动前端固定已有后端，同组明确选择后端时由组合确定目标', async () => {
  const services = ['front', 'back'].map(code => ({ service: service(code), worktree: worktree(code), connectionTarget: code === 'front' ? ready : null, diagnostics: [] }));
  const h = harness(TaskLocalRuntime, { taskId: 'task-one', services, runs: [], diagnostics: [] });
  try {
    let tree = h.render({ taskId: 'task-one' }); find(tree, 'LocalRuntimeSurface')[0].props.onStart(); tree = h.render({ taskId: 'task-one' });
    primary(find(tree, 'modal')[0]).props.onClick();
    let selected = JSON.parse(h.requests[0].body).selected;
    assert.deepEqual(selected.map(item => item.serviceCode), ['front', 'back']);
    assert.equal(Object.hasOwn(selected[0], 'expectedBackendRunId'), false, '组内后端即使已有ready也不固定旧实例');
    h.requests[0].resolve({ taskId: 'task-one', results: [] }); await settle(); tree = h.render({ taskId: 'task-one' });
    find(tree, 'LocalRuntimeSurface')[0].props.onStart(); tree = h.render({ taskId: 'task-one' });
    find(find(tree, 'modal')[0], 'RuntimeStartOptions')[0].props.onSelected(['front']); tree = h.render({ taskId: 'task-one' });
    primary(find(tree, 'modal')[0]).props.onClick(); selected = JSON.parse(h.requests[1].body).selected;
    assert.deepEqual(selected.map(item => item.serviceCode), ['front']); assert.equal(selected[0].expectedBackendRunId, 'back-ready');
    h.requests[1].resolve({ taskId: 'task-one', results: [] }); await settle();
  } finally { h.dispose(); }
});
