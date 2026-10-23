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
      if (specifier === 'antd') return facade('export const Alert="alert",Button="button",Modal="modal",Tag="tag",Select="select";export const App={useApp:()=>({message:{success:text=>globalThis.__startMessages.push(text),warning(){}}})};');
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
  globalThis.__startRead = { data, loading: false, error: '', async refresh() { refreshes += 1; return globalThis.__startRead.data; } };
  globalThis.__startMessages = [];
  globalThis.__startDetailArgs = [];
  globalThis.__startRequest = (url, options) => new Promise((resolve, reject) => requests.push({ url, ...options, resolve, reject }));
  return { requests, read: globalThis.__startRead, detailArgs: globalThis.__startDetailArgs, messages: globalThis.__startMessages, refreshes: () => refreshes, render(props) { cursor = 0; const tree = component(props); effects.splice(0).forEach(effect => effect()); return tree; }, dispose() { for (const name of ['__startHooks', '__startRead', '__startRequest', '__startMessages', '__startDetailArgs']) delete globalThis[name]; } };
}
const worktree = (code, main = false) => ({ id: code + '-tree', path: '/code/' + code, label: main ? '主工作库' : '订单验证', branch: main ? 'dev' : 'feature/order', head: 'a'.repeat(40), dirty: false, main, taskId: main ? null : 'task-one', taskTitle: main ? null : '订单验证' });
const backend = { serviceCode: 'back', environmentVariable: 'BACKEND_URL', remoteUrl: 'https://test.example.com' };
const service = code => ({ id: code, code, type: code === 'front' ? 'frontend' : 'backend', name: code, runs: [], definition: { local: { ...(code === 'front' ? { backends: [backend] } : {}) } } });
const ready = [{ serviceCode: 'back', candidates: [], target: { runId: 'back-ready', serviceCode: 'back', url: 'http://127.0.0.1:8189', worktreeLabel: '订单验证', branch: 'feature/order' }, reason: null }];
const missing = [{ serviceCode: 'back', candidates: [], target: null, reason: '请先启动本任务后端。' }];
const initialRun = { id: 'front-running', serviceCode: 'front', worktreeId: 'front-tree', status: 'running', pid: 42, actualPort: 3000, taskId: 'task-one', connection: { mode: 'remote' } };
const primary = modal => find(modal.props.footer, 'button').find(button => button.props.type === 'primary');

test('切换连接携带已展示后端实例，目标变更失败不先停止前端', async () => {
  const detail = { service: { ...service('front'), runs: [initialRun] }, worktrees: [worktree('front')], connectionTargets: { 'front-tree': ready }, diagnostics: [] };
  const h = harness(StartWorktreeModal, detail);
  const props = { open: true, serviceCode: 'front', initialRun, onClose() {} };
  try {
    h.render(props); let tree = h.render(props);
    assert.deepEqual(h.detailArgs.at(-1), ['workspace-one', 'front', 'task-one'], '重开任务实例切换使用原实例的明确任务身份');
    find(tree, 'RuntimeStartOptions')[0].props.onBackendSelection('back', 'run:back-ready'); tree = h.render(props);
    assert.equal(primary(tree).props.disabled, false);
    primary(tree).props.onClick(); assert.equal(h.requests.length, 1);
    assert.match(h.requests[0].url, /\/runs\/front-running\/restart$/u);
    assert.deepEqual(JSON.parse(h.requests[0].body), { backendTargets: [{ serviceCode: 'back', target: 'run', runId: 'back-ready' }], expectedWorktree: { path: '/code/front', branch: 'feature/order', head: 'a'.repeat(40), dirty: false } });
    h.read.data = { ...detail, connectionTargets: { 'front-tree': [{ ...ready[0], target: { ...ready[0].target, runId: 'replacement-back', url: 'http://127.0.0.1:8190' } }] } };
    h.requests[0].reject(new Error('后端实例已变化，请重新确认；原前端保持运行。')); await settle(); tree = h.render(props);
    assert.equal(h.requests.length, 1); assert.equal(initialRun.status, 'running');
    assert.ok(find(tree, 'alert').some(alert => alert.props.message === '后端实例已变化，请重新确认；原前端保持运行。'));
    assert.equal(h.refreshes(), 1);
  } finally { h.dispose(); }
});

test('单服务选择远程环境，来源属于任务也不加入任务或提交下游选择', async () => {
  for (const environment of ['qa', 'stage']) {
    const detail = { service: service('front'), worktrees: [worktree('front')], connectionTargets: { 'front-tree': ready }, diagnostics: [] };
    const h = harness(StartWorktreeModal, detail), props = { open: true, serviceCode: 'front', onClose() {} };
    try {
      h.render(props); let tree = h.render(props); find(tree, 'select')[0].props.onChange(environment); tree = h.render(props);
      assert.equal(find(tree, 'RuntimeStartOptions').length, 0);
      primary(tree).props.onClick(); const body = JSON.parse(h.requests[0].body);
      assert.equal(body.standalone, true); assert.equal(body.environment, environment); assert.equal(body.taskId, undefined); assert.equal(body.backendTargets, undefined);
      h.requests[0].resolve({ ...initialRun, status: 'starting' }); await settle();
    } finally { h.dispose(); }
  }
});

test('先准备未检出分支的工作树，再从返回的实际代码版本启动', async () => {
  const h = harness(StartWorktreeModal, { service: service('front'), worktrees: [worktree('front')], connectionTargets: {}, diagnostics: [] });
  const props = { open: true, serviceCode: 'front', onClose() {} };
  try {
    h.render(props); let tree = h.render(props);
    const selection = { worktreeId: 'front-tree', targetRef: 'refs/heads/feature/new', expectedTargetHash: 'b'.repeat(40), expectedRevision: 'observed' };
    const preparation = find(tree, 'ServiceSourcePicker')[0].props.onIndependent({ ref: selection.targetRef, hash: selection.expectedTargetHash }, { observedRevision: selection.expectedRevision }); await settle();
    assert.equal(h.requests.length, 1); assert.match(h.requests[0].url, /worktrees$/); assert.deepEqual(JSON.parse(h.requests[0].body), selection);
    const source = { ...worktree('new'), path: '/independent/front', branch: 'feature/new', head: 'b'.repeat(40), taskId: null };
    h.read.data = { ...h.read.data, worktrees: [worktree('front'), source] };
    h.requests[0].resolve({ worktree: source, created: true }); await preparation; await settle();
    assert.equal(h.requests.length, 1, '准备分支后先展示实际来源，不隐式启动');
    tree = h.render(props); primary(tree).props.onClick();
    assert.equal(h.requests.length, 2); const body = JSON.parse(h.requests[1].body);
    assert.equal(body.worktreeId, source.id); assert.deepEqual(body.expectedWorktree, { path: source.path, branch: source.branch, head: source.head, dirty: false });
    assert.equal(body.taskId, undefined); assert.equal(body.standalone, true);
    h.requests[1].resolve({ ...initialRun, status: 'starting' }); await settle();
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

test('任务一键组合默认自动连接，仅选前端时未启动后端明确使用远程', async () => {
  const services = ['front', 'back'].map(code => ({ service: service(code), worktree: worktree(code), connectionTarget: code === 'front' ? missing : null, diagnostics: [] }));
  const h = harness(TaskLocalRuntime, { taskId: 'task-one', services, runs: [], diagnostics: [] });
  try {
    let tree = h.render({ taskId: 'task-one' }); find(tree, 'LocalRuntimeSurface')[0].props.onStart(); tree = h.render({ taskId: 'task-one' });
    let modal = find(tree, 'modal')[0]; assert.equal(primary(modal).props.disabled, false);
    find(modal, 'RuntimeStartOptions')[0].props.onSelected(['front']); tree = h.render({ taskId: 'task-one' }); modal = find(tree, 'modal')[0];
    assert.equal(primary(modal).props.disabled, false); primary(modal).props.onClick();
    const body = JSON.parse(h.requests[0].body); assert.equal(body.connection, 'auto'); assert.deepEqual(body.selected.map(item => item.serviceCode), ['front']);
    assert.deepEqual(body.selected[0].backendTargets, [{ serviceCode: 'back', target: 'remote' }]);
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
    assert.deepEqual(selected.map(item => item.serviceCode), ['front']); assert.deepEqual(selected[0].backendTargets, [{ serviceCode: 'back', target: 'run', runId: 'back-ready' }]);
    h.requests[1].resolve({ taskId: 'task-one', results: [] }); await settle();
  } finally { h.dispose(); }
});

test('发现调用方切换携带当前上下文摘要和自动选择的已观察编号', async () => {
  const declaration = { kind: 'service-discovery', serviceCode: 'back', serviceId: 'back-app', fallback: { kind: 'existing-discovery', context: 'qa' } };
  const configured = { ...service('front'), definition: { local: { routing: { serviceId: 'front-app' }, backends: [declaration] } } };
  const current = { ...initialRun, connection: null, connections: [{ ...declaration, mode: 'local', runId: 'back-ready' }], routing: { contextDigest: 'sha256-' + 'a'.repeat(64) } };
  const h = harness(StartWorktreeModal, { service: { ...configured, runs: [current] }, worktrees: [worktree('front')], connectionTargets: { 'front-tree': ready }, diagnostics: [] });
  const props = { open: true, serviceCode: 'front', initialRun: current, onClose() {} };
  try {
    h.render(props); let tree = h.render(props);
    find(tree, 'RuntimeStartOptions')[0].props.onBackendSelection('back', 'auto'); tree = h.render(props);
    primary(tree).props.onClick();
    const body = JSON.parse(h.requests[0].body);
    assert.equal(body.expectedRoutingDigest, current.routing.contextDigest);
    assert.deepEqual(body.backendTargets, [{ serviceCode: 'back', target: 'auto', expectedRunId: 'back-ready' }]);
    h.requests[0].resolve({ ...current, status: 'starting' }); await settle();
  } finally { h.dispose(); }
});

test('声明任务路由的普通后端仍默认主库且提交不带任务或下游选择', async () => {
  const declaration = { kind: 'service-discovery', serviceCode: 'upms', serviceId: 'upms-app', fallback: { kind: 'existing-discovery', context: 'qa' } };
  const configured = { ...service('back'), definition: { local: { routing: { serviceId: 'business-app', format: 'buildr.local-service-routing/v1' }, backends: [declaration] } } };
  const main = worktree('main-back', true), task = worktree('task-back');
  const h = harness(StartWorktreeModal, { service: configured, worktrees: [task, main], connectionTargets: {}, diagnostics: [] });
  const props = { open: true, serviceCode: 'back', onClose() {} };
  try {
    h.render(props); let tree = h.render(props);
    assert.equal(find(tree, 'ServiceSourcePicker')[0].props.worktree.id, main.id);
    assert.equal(primary(tree).props.disabled, false);
    assert.ok(!find(tree, 'alert').some(alert => String(alert.props.message).includes('任务目录')));
    primary(tree).props.onClick();
    const body = JSON.parse(h.requests[0].body);
    assert.equal(body.worktreeId, main.id);
    assert.deepEqual(body.expectedWorktree, { path: main.path, branch: main.branch, head: main.head, dirty: main.dirty });
    assert.equal(Object.hasOwn(body, 'backendTargets'), false);
    assert.equal(Object.hasOwn(body, 'taskId'), false);
    assert.equal(Object.hasOwn(body, 'expectedRoutingDigest'), false);
    h.requests[0].resolve({ ...initialRun, status: 'starting' }); await settle();
  } finally { h.dispose(); }
});

test('普通独立工作树无需伪造任务身份，失败准备不发出启动请求', async () => {
  const source = { ...worktree('independent'), taskId: null };
  const h = harness(StartWorktreeModal, { service: service('back'), worktrees: [source], connectionTargets: {}, diagnostics: [] });
  const props = { open: true, serviceCode: 'back', onClose() {} };
  try {
    h.render(props); let tree = h.render(props); assert.equal(primary(tree).props.disabled, false);
    const preparing = find(tree, 'ServiceSourcePicker')[0].props.onIndependent({ ref: 'refs/heads/new', hash: 'b'.repeat(40) }, { observedRevision: 'old' }); await settle();
    h.requests[0].reject(new Error('目标分支已变化')); await assert.rejects(preparing, /目标分支已变化/);
    assert.equal(h.requests.length, 1); assert.deepEqual(h.messages, []);
    assert.deepEqual(h.read.data.worktrees, [source], '准备失败保留原目录选择，错误由共同分支组件展示');
  } finally { h.dispose(); }
});

test('普通前端无本地后端选项，只提交所选来源及统一远程环境', async () => {
  const configured = { ...service('front'), definition: { local: { remoteEnvironments: [{ code: 'qa', name: '测试环境', url: 'https://test.example.com', variables: {} }], backends: [backend] } } };
  const main = worktree('main-front', true), h = harness(StartWorktreeModal, { service: configured, worktrees: [worktree('task-front'), main], connectionTargets: { [main.id]: ready }, diagnostics: [] });
  const props = { open: true, serviceCode: 'front', onClose() {} };
  try {
    h.render(props); const tree = h.render(props); assert.equal(find(tree, 'RuntimeStartOptions').length, 0); assert.equal(find(tree, 'select')[0].props.value, 'qa');
    primary(tree).props.onClick(); const body = JSON.parse(h.requests[0].body);
    assert.equal(body.environment, 'qa'); assert.equal(body.standalone, true); assert.equal(body.backendTargets, undefined); assert.equal(body.worktreeId, main.id);
    h.requests[0].resolve({ ...initialRun, status: 'starting' }); await settle();
  } finally { h.dispose(); }
});

test('重开已有任务后端保全任务路由与当前目标，不应用普通启动精简', async () => {
  const declaration = { kind: 'service-discovery', serviceCode: 'upms', serviceId: 'upms-app', fallback: { kind: 'existing-discovery', context: 'qa' } };
  const configured = { ...service('back'), definition: { local: { routing: { serviceId: 'business-app', format: 'buildr.local-service-routing/v1' }, backends: [declaration] } } };
  const task = worktree('back');
  const current = { ...initialRun, serviceCode: 'back', worktreeId: task.id, connection: null, connections: [{ ...declaration, mode: 'local', runId: 'upms-ready' }], routing: { contextDigest: 'sha256-' + 'c'.repeat(64) } };
  const target = { ...ready[0], serviceCode: 'upms', target: { ...ready[0].target, serviceCode: 'upms', runId: 'upms-ready' } };
  const h = harness(StartWorktreeModal, { service: { ...configured, runs: [current] }, worktrees: [task], connectionTargets: { [task.id]: [target] }, diagnostics: [] });
  const props = { open: true, serviceCode: 'back', initialRun: current, onClose() {} };
  try {
    h.render(props); const tree = h.render(props);
    assert.deepEqual(h.detailArgs.at(-1), ['workspace-one', 'back', 'task-one']);
    assert.equal(find(tree, 'RuntimeStartOptions')[0].props.preserveTaskConnections, true);
    primary(tree).props.onClick();
    const body = JSON.parse(h.requests[0].body);
    assert.equal(body.expectedRoutingDigest, current.routing.contextDigest);
    assert.deepEqual(body.backendTargets, [{ serviceCode: 'upms', target: 'run', runId: 'upms-ready' }]);
    h.requests[0].resolve({ ...current, status: 'starting' }); await settle();
  } finally { h.dispose(); }
});

test('冷读取不打开空弹窗，分支操作期间阻止并行启动', () => {
  const h = harness(StartWorktreeModal, null), props = { open: true, serviceCode: 'back', onClose() {} };
  try {
    h.read.loading = true;
    let tree = h.render(props); assert.equal(tree.props.open, false);
    h.read.data = { service: service('back'), worktrees: [worktree('back')], connectionTargets: {}, diagnostics: [] }; h.read.loading = false;
    h.render(props); tree = h.render(props); assert.equal(tree.props.open, true);
    find(tree, 'ServiceSourcePicker')[0].props.onBusy(true); tree = h.render(props); assert.equal(primary(tree).props.disabled, true);
    find(tree, 'ServiceSourcePicker')[0].props.onBusy(false); tree = h.render(props); assert.equal(primary(tree).props.disabled, false);
  } finally { h.dispose(); }
});
