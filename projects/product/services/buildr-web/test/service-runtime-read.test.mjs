import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createWorkspaceReadCache } from '../src/lib/workspace-read-cache.ts';
const facade = source => ({ url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true });
const hooked = parent => parent?.endsWith('/components/WorkspaceReadCache.tsx') || parent?.endsWith('/service-runtime/hooks/useServiceRuntime.ts') || parent?.endsWith('/service-runtime/components/LocalLogsDrawer.tsx');
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/workspace/components/AssetHome.tsx') || context.parentURL?.endsWith('/service/pages/ServicesPage.tsx')) {
      if (specifier === 'react') return facade(['useCallback', 'useContext', 'useEffect', 'useMemo', 'useRef', 'useState'].map(name => `export const ${name}=(...args)=>globalThis.__runtimeHooks.${name}(...args);`).join('\n') + '\nexport const createContext=value=>({cacheContext:true,defaultValue:value});');
      if (specifier.endsWith('.css')) return facade('');
      if (specifier.endsWith('/useServiceRuntime') || specifier.endsWith('/service-runtime/model')) return next(new URL(specifier + '.ts', context.parentURL).href, context);
      if (specifier.endsWith('/useRuntimeConfiguration')) return facade('export const useRuntimeConfiguration=()=>({discovery:null,pendingCode:"",configure(){},closeDiscovery(){}});');
      const source = ts.createSourceFile('host.tsx', readFileSync(new URL(context.parentURL), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const imported = source.statements.filter(item => ts.isImportDeclaration(item) && item.moduleSpecifier.text === specifier);
      if (!imported.length) return next(specifier, context);
      const names = imported.flatMap(entry => entry.importClause.namedBindings.elements.filter(item => !item.isTypeOnly).map(item => item.name.text));
      return facade(names.map(name => `export const ${name}=globalThis.__assetMocks.${name} ?? (()=>null);`).join('\n') + '\n// host: ' + context.parentURL);
    }
    if (hooked(context.parentURL)) {
      if (specifier === 'react') return facade(['useCallback', 'useContext', 'useEffect', 'useMemo', 'useRef', 'useState'].map(name => `export const ${name}=(...args)=>globalThis.__runtimeHooks.${name}(...args);`).join('\n') + '\nexport const createContext=value=>({cacheContext:true,defaultValue:value});');
      if (specifier === '../../../api') return facade('export const api=(...args)=>globalThis.__runtimeRequest(...args);');
      if (specifier.endsWith('/WorkspaceReadCache')) return next(new URL(specifier + '.tsx', context.parentURL).href, context);
      if (specifier.endsWith('/pageTabs')) return facade('export const WorkspaceViewActiveContext={};');
      if (specifier.endsWith('/AppShellContext')) return facade('export const useAppShell=()=>({workspaceId:globalThis.__runtimeWorkspace});');
      if (specifier.endsWith('/DrawerShell')) return facade('export const DrawerShell="drawer";');
      if (specifier.endsWith('/copyText')) return facade('export const copyText=async text=>{globalThis.__runtimeCopied.push(text);return true;};');
      if (specifier.endsWith('/CopyButton')) return facade('export const CopyButton="copy-button";');
      if (specifier === 'antd') return facade('export const Alert="alert",Button="log-button",Input="log-input",Space="space",Switch="log-switch",Tag="tag";export const App={useApp:()=>({message:{success:text=>globalThis.__runtimeMessages.push(text),error:text=>globalThis.__runtimeMessages.push(text)}})};');
      if (specifier === '@ant-design/icons') return facade('export const CopyOutlined="copy-icon",FileTextOutlined="file-icon",SearchOutlined="search-icon";');
      if (specifier.startsWith('.')) return next(new URL(specifier + '.ts', context.parentURL).href, context);
    }
    if (specifier === '../../../api' && context.parentURL?.endsWith('/service-runtime/api/service-runtime-api.ts')) return facade('export const api=(...args)=>globalThis.__runtimeRequest(...args);');
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/components/WorkspaceReadCache.tsx') || url.endsWith('/LocalLogsDrawer.tsx') || url.endsWith('/workspace/components/AssetHome.tsx') || url.endsWith('/service/pages/ServicesPage.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { useServiceRuntimeOverview, useServiceRuntimeDetail, useTaskRuntime } = await import('../src/features/service-runtime/hooks/useServiceRuntime.ts');
const { createServiceRuntimeClient } = await import('../src/features/service-runtime/api/service-runtime-api.ts');
const { LocalLogsDrawer } = await import('../src/features/service-runtime/components/LocalLogsDrawer.tsx');
const settle = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
function harness(render) {
  const sharedCache = createWorkspaceReadCache();
  const slots = [], effects = [], requests = []; let cursor = 0, active = true;
  const timers = new Map(); let timerId = 0; const nativeSet = globalThis.setInterval, nativeClear = globalThis.clearInterval;
  globalThis.setInterval = (callback, milliseconds) => { timers.set(++timerId, { callback, milliseconds }); return timerId; };
  globalThis.clearInterval = id => timers.delete(id);
  const same = (left, right) => left && right && left.length === right.length && left.every((item, index) => Object.is(item, right[index]));
  const memo = (fn, deps) => { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value; };
  globalThis.window = new EventTarget(); globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  globalThis.__runtimeCopied = []; globalThis.__runtimeMessages = [];
  globalThis.__runtimeRequest = (url, options = {}) => new Promise((resolve, reject) => requests.push({ url, ...options, resolve, reject }));
  globalThis.__runtimeHooks = {
    useContext(context) { cursor++; return context.cacheContext ? sharedCache : active; }, useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useRef(value) { const index = cursor++; return slots[index] ||= { current: value }; },
    useState(value) { const index = cursor++; slots[index] ||= { value: typeof value === 'function' ? value() : value }; return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }]; },
    useEffect(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { const old = slots[index]; slots[index] = { deps }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = fn(); }); } },
  };
  return { requests, tick(milliseconds) { for (const timer of [...timers.values()]) if (timer.milliseconds === milliseconds) timer.callback(); }, render(props, workspace = 'A', visible = true) { active = visible; globalThis.__runtimeWorkspace = workspace; cursor = 0; const value = render(props, workspace); effects.splice(0).forEach(effect => effect()); return value; }, values() { return slots.filter(slot => slot && Object.hasOwn(slot, 'value')).map(slot => slot.value); }, dispose() { slots.forEach(slot => slot?.cleanup?.()); sharedCache.dispose(); globalThis.setInterval = nativeSet; globalThis.clearInterval = nativeClear; for (const key of ['window', 'document', '__runtimeHooks', '__runtimeRequest', '__runtimeWorkspace', '__runtimeCopied', '__runtimeMessages']) delete globalThis[key]; } };
}
const find = (tree, type) => { if (Array.isArray(tree)) return tree.flatMap(item => find(item, type)); if (!tree || typeof tree !== 'object') return []; return [...(tree.type === type ? [tree] : []), ...find(tree.props?.children, type)]; };
const run = id => ({ id, serviceCode: 'front', worktreePath: '/actual/' + id, worktreeLabel: 'task', main: false, taskId: 'task', taskTitle: '订单验证', branch: 'topic', head: 'a'.repeat(40), actualPort: 3000, status: 'running', startedAt: '2026-10-22T01:00:00Z', failure: null, logPath: '/logs/' + id });
const response = (id, log) => ({ record: run(id), log, truncated: false, maxBytes: 1000, size: log.length });

test('本地运行读取按工作空间和任务隔离，隐藏页面不刷新，迟到旧范围不能覆盖', async () => {
  const h = harness((_props, workspace) => useServiceRuntimeOverview(workspace));
  try {
    h.render(); await settle(); h.requests[0].resolve({ readAt: 'A' }); await settle(); assert.equal(h.render().data.readAt, 'A');
    const pending = h.render(null, 'B'); await settle(); assert.equal(pending.data, null);
    h.requests[1].resolve({ readAt: 'B' }); await settle(); assert.equal(h.render(null, 'B').data.readAt, 'B');
    h.render(null, 'B', false); window.dispatchEvent(new Event('focus')); assert.equal(h.requests.length, 2);
    h.render(null, 'B', true); await settle(); assert.equal(h.requests.length, 2, 'warm observations remain available when returning to a tab');
  } finally { h.dispose(); }
  const task = harness((id, workspace) => useTaskRuntime(workspace, id));
  try {
    task.render('old'); await settle(); task.render('current'); await settle();
    task.requests[1].resolve({ taskId: 'current' }); await settle(); task.requests[0].resolve({ taskId: 'old' }); await settle();
    assert.equal(task.render('current').data.taskId, 'current'); assert.match(task.requests[1].url, /tasks\/current$/);
  } finally { task.dispose(); }
});

test('切换详情携带明确任务范围，任务变化拒绝旧响应，普通服务不带任务参数', async () => {
  const h = harness((taskId, workspace) => useServiceRuntimeDetail(workspace, 'front', taskId));
  try {
    h.render('old task'); await settle(); assert.equal(new URL(h.requests[0].url, 'http://fixture').searchParams.get('taskId'), 'old task');
    h.requests[0].resolve({ readAt: 'old', connectionTargets: {} }); await settle(); assert.equal(h.render('old task').data.readAt, 'old');
    h.tick(5000); await settle(); const late = h.requests[1];
    const next = h.render('new/task'); await settle(); assert.equal(next.data, null);
    assert.match(h.requests[2].url, /\/services\/front\?taskId=new%2Ftask$/u);
    assert.equal(Object.hasOwn(h.requests[2], 'taskId'), false, '任务只作为URL查询参数，不混入请求选项');
    h.requests[2].resolve({ readAt: 'new', connectionTargets: {} }); await settle(); late.resolve({ readAt: 'late-old' }); await settle();
    assert.equal(h.render('new/task').data.readAt, 'new');
    assert.equal(h.render(undefined).data, null); await settle(); assert.equal(h.requests[3].url.endsWith('/services/front?standalone=true'), true);
    h.requests[3].resolve({ readAt: 'global' }); await settle(); assert.equal(h.render(undefined).data.readAt, 'global');
  } finally { h.dispose(); }
});

test('日志换实例、关闭和同名跨工作空间后拒绝旧响应；搜索复制仅当前匹配输出', async () => {
  const h = harness(props => LocalLogsDrawer(props));
  const props = id => ({ open: true, run: run(id), serviceName: '运营前端', onClose() {} });
  try {
    h.render(props('old')); h.render(props('current')); assert.equal(h.requests[0].signal.aborted, true);
    h.requests[1].resolve(response('current', 'INFO current\nERROR current-failure')); await settle();
    let tree = h.render(props('current')); assert.equal(find(tree, 'pre')[0].props.children, 'INFO current\nERROR current-failure');
    h.requests[0].resolve(response('old', 'OLD LEAK')); await settle(); tree = h.render(props('current')); assert.doesNotMatch(find(tree, 'pre')[0].props.children, /OLD LEAK/);
    find(tree, 'log-input')[0].props.onChange({ target: { value: 'error' } }); tree = h.render(props('current'));
    assert.equal(find(tree, 'pre')[0].props.children, 'ERROR current-failure'); assert.equal(find(tree, 'log-switch')[0].props.checked, false);
    const copy = find(tree, 'copy-button')[0]; assert.equal(copy.props.text, 'ERROR current-failure'); assert.equal(copy.props.disabled, false);
    tree = h.render(props('current'), 'B'); assert.doesNotMatch(find(tree, 'pre')[0].props.children, /current-failure/);
    const last = h.requests.at(-1); h.render({ ...props('current'), open: false }, 'B'); assert.equal(last.signal.aborted, true);
    last.resolve(response('current', 'CLOSED LEAK')); await settle(); tree = h.render(props('current'), 'B'); assert.doesNotMatch(find(tree, 'pre')[0].props.children, /CLOSED LEAK/);
  } finally { h.dispose(); }
});


test('服务直达页和刷新按URL保留本地运行，后续URL变化与显式预览选择一致', async () => {
  let search = '?view=runtime';
  globalThis.__assetMocks = {
    Alert: 'alert', InsideResourcePreview: {}, ProjectPreviewContext: {}, WorkspaceViewTransientContext: {},
    useResourcePreview: () => null, useLocation: () => ({ search }), useParams: () => ({ assetId: 'front' }),
    useAppShell: () => ({ workspaceId: globalThis.__runtimeWorkspace }), useWorkspacePaneHost: () => null,
    useAssetCatalog: () => ({ error: 'only exercise host lifecycle', data: null }), useWorkspacePageTabs: () => ({}),
    useKnowledgeReading: () => ({ data: null, diagnostics: [] }), useRepositoryLocalConfig: () => ({ data: null }),
  };
  const { AssetHome } = await import('../src/features/workspace/components/AssetHome.tsx');
  const h = harness(props => AssetHome({ kind: 'service', ...props }));
  try {
    h.render({}); assert.equal(h.values()[0], 'runtime', 'effect不能覆盖URL初始化');
    search = '?view=detail'; h.render({}); assert.equal(h.values()[0], 'detail');
    search = '?view=runtime'; h.render({}); assert.equal(h.values()[0], 'runtime', '同一宿主响应URL选择变化');
    h.render({ initialView: 'detail' }); assert.equal(h.values()[0], 'detail', '显式资源预览选择优先于宿主URL');
  } finally { h.dispose(); delete globalThis.__assetMocks; }
});


test('可见空目录轮询发现外部启动，同工作空间写入立即同步按钮与占用，跨空间通知不串入', async () => {
  const item = { id: 'front-id', code: 'front', name: '运营前端', projects: [], repository: null };
  const summary = runs => ({ ...item, definition: { local: {} }, runs });
  const overview = runs => ({ services: [summary(runs)], runs, local: { active: runs, activeCount: runs.length } });
  const navigations = [];
  globalThis.__assetMocks = {
    App: {useApp:()=>({message:{error(){}}})}, useWorkbenchPreferences:()=>({has:()=>false,loading:false}),
    Alert: 'alert', Button: 'service-action-button', Space: 'space', Select: 'select', ResourceDirectory: 'resource-directory', WorkspaceStage: 'workspace-stage',
    useAppShell: () => ({ workspaceId: globalThis.__runtimeWorkspace }), useNavigate: () => path => navigations.push(path), workspaceHref: (workspace, path) => '/workspaces/' + workspace + path,
    useAssetList: () => ({ data: { services: [item] }, loading: false, error: '', reload() {} }), useAssetCatalog: () => ({}),
    useWorkspacePageTabs: () => ({ tabs: [], register() {}, close() {} }),
  };
  const { ServicesPage } = await import('../src/features/service/pages/ServicesPage.tsx');
  const h = harness(() => ServicesPage());
  const action = tree => find(find(tree, 'resource-directory')[0].props.rowActions(item), 'service-action-button')[0];
  try {
    h.render(); await settle(); h.requests[0].resolve(overview([])); await settle(); assert.equal(action(h.render()).props.children, '启动');
    h.tick(5000); await settle(); assert.equal(h.requests.length, 2, '零实例也定期读取，发现外部智能体启动');
    h.requests[1].resolve(overview([run('external')])); await settle();
    let button = action(h.render()); assert.equal(button.props.children, '查看运行'); button.props.onClick(); assert.match(navigations.at(-1), /services\/front-id\?view=runtime$/);
    const client = createServiceRuntimeClient(async () => ({}), 'A');
    await client.stop('external'); await settle(); assert.equal(h.requests.length, 3, '同工作空间写入后立即重读，不等待下一轮询');
    h.requests[2].resolve(overview([])); await settle(); assert.equal(action(h.render()).props.children, '启动');
    await client.start('front', 'main'); await settle(); assert.equal(h.requests.length, 4);
    h.requests[3].resolve(overview([run('started')])); await settle(); assert.equal(action(h.render()).props.children, '查看运行');
    await createServiceRuntimeClient(async () => ({}), 'B').stop('other'); assert.equal(h.requests.length, 4, '其他工作空间不触发当前目录重读');
  } finally { h.dispose(); delete globalThis.__assetMocks; }
});
