import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '../../../api' && context.parentURL?.endsWith('/service-runtime/api/service-runtime-api.ts')) return { url: 'data:text/javascript,export const api=()=>{throw Error("unexpected real request")}', shortCircuit: true };
    try { return next(specifier, context); } catch (cause) {
      if (!specifier.startsWith('.') || !context.parentURL?.includes('/src/')) throw cause;
      for (const suffix of ['.ts', '.tsx', '/index.ts']) { const url = new URL(specifier + suffix, context.parentURL); if (existsSync(fileURLToPath(url))) return next(url.href, context); }
      throw cause;
    }
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    if (url.endsWith('.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const model = await import('../src/features/service-runtime/model.ts');
const { createServiceRuntimeClient } = await import('../src/features/service-runtime/api/service-runtime-api.ts');
const { LocalRunCard } = await import('../src/features/service-runtime/components/LocalRunCard.tsx');
const { RuntimeStartOptions } = await import('../src/features/service-runtime/components/RuntimeStartOptions.tsx');
const { RuntimeConfigurationSummary } = await import('../src/features/service-runtime/components/RuntimeConfigurationSummary.tsx');
const worktree = (id, main = false) => ({ id, path: '/actual/' + id, label: id, main, branch: main ? 'qa' : 'topic', head: 'a'.repeat(40), dirty: true, taskId: main ? null : 'task-one', taskTitle: main ? null : '本次订单验证' });
const definition = { source: 'agent', verifiedAt: '2026-10-22T01:00:00Z', path: 'services/front/runtime.yml', local: { command: ['node', 'dev.mjs'], cwd: '.', profile: 'dev', preferredPort: 3000, portOverride: '--port', readiness: { kind: 'http', path: '/' }, timeoutSeconds: 60, backends: [{ serviceCode: 'back', environmentVariable: 'BACKEND_URL', remoteUrl: 'https://test.example.com' }] } };
const service = (code, configured = true) => ({ id: code + '-id', code, type: code === 'front' ? 'frontend' : 'backend', name: code === 'front' ? '运营前端' : '业务后端', projects: ['pig'], repositoryId: code + '-repo', definition: configured ? code === 'front' ? definition : { ...definition, local: { ...definition.local, backends: undefined } } : null, definitionDiagnostic: null, runs: [], local: { activeCount: 0, activePorts: [] } });
const run = { id: 'run-one', serviceId: 'front-id', serviceCode: 'front', worktreeId: 'task-front', worktreePath: '/actual/task-front', worktreeLabel: 'topic', branch: 'main', head: 'b'.repeat(40), main: false, taskId: 'task-one', taskTitle: '本次订单验证', dirty: null, origin: 'unknown', url: 'http://127.0.0.1:3001', connection: { mode: 'remote', url: 'https://test.example.com', serviceCode: 'back', runId: null }, launch: null, pid: 3456, preferredPort: 3000, actualPort: 3001, portNote: '已避让首选端口', status: 'running', startedAt: '2026-10-22T01:00:00Z', stoppedAt: null, failure: null, logPath: '/actual/run.log' };
const render = (component, props) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(component, props)));
const elements = node => Array.isArray(node) ? node.flatMap(elements) : node && typeof node === 'object' ? [node, ...elements(node.props?.children)] : [];

test('任务选择只发送已选可用任务目录，单前端不会扩大到后端或主库', () => {
  const choices = [{ service: service('front'), worktree: worktree('task-front'), diagnostics: [] }, { service: service('back'), worktree: worktree('task-back'), diagnostics: [] }, { service: service('main-only'), worktree: worktree('main', true), diagnostics: [] }, { service: service('missing'), worktree: null, diagnostics: [] }, { service: service('unconfigured', false), worktree: worktree('task-u'), diagnostics: [] }];
  const before = structuredClone(choices);
  assert.deepEqual(model.taskSelections(choices, ['front']), [{ serviceCode: 'front', worktreeId: 'task-front', expectedWorktree: { path: '/actual/task-front', branch: 'topic', head: 'a'.repeat(40), dirty: true } }]);
  assert.deepEqual(model.taskSelections(choices, ['back']).map(item => item.serviceCode), ['back']);
  assert.deepEqual(model.taskSelections(choices, ['main-only', 'missing', 'unconfigured']), []);
  assert.deepEqual(choices, before);
});
test('主库身份和未知事实不从分支或标签猜测，地址只为已就绪HTTP实例提供', () => {
  assert.equal(model.sourceLabel({ ...run, main: true }), '主工作库');
  assert.equal(model.sourceLabel({ ...run, main: null, taskId: null, taskTitle: null, worktreeLabel: '主工作库' }), '来源未确认');
  assert.equal(model.dirtyLabel(null), '改动状态未记录');
  assert.equal(model.visibleRunUrl({ ...run, url: 'javascript:alert(1)' }), null);
  assert.equal(model.visibleRunUrl({ ...run, status: 'starting' }), null);
  assert.equal(model.visibleRunUrl(run), 'http://127.0.0.1:3001/');
  assert.equal(model.filterRunLog('INFO Ready\nERROR broken\ninfo next', 'Info'), 'INFO Ready\ninfo next');
});
test('实际实例打开链接保留当前页，未知旧快照不冒充当前配置或业务验证', () => {
  const props = { run, service: service('front'), onLogs() {}, onStop() {}, onStart() {}, onConnection() {} };
  const html = render(LocalRunCard, props);
  assert.match(html, /href="http:\/\/127\.0\.0\.1:3001\/"[^>]*target="_blank"[^>]*rel="noreferrer"/);
  assert.match(html, /进程 3456/); assert.match(html, /改动状态未记录/); assert.match(html, /启动者未记录/); assert.match(html, /业务验证仍需执行/);
  assert.doesNotMatch(html, /QA 部署|业务验证通过|已连接/);
  assert.doesNotMatch(render(LocalRunCard, { ...props, run: { ...run, status: 'failed' } }), /target="_blank"/);
});
test('任务服务复选与连接单选保留单前端远程验证动线，不包含部署入口', () => {
  const html = render(RuntimeStartOptions, { items: [{ service: service('front'), worktree: worktree('task-front') }, { service: service('back'), worktree: worktree('task-back') }], selected: ['front'], onSelected() {}, connection: 'remote', onConnection() {}, taskScope: true });
  assert.equal((html.match(/type="checkbox"/g) || []).length, 2); assert.equal((html.match(/type="radio"/g) || []).length, 0);
  assert.match(html, /一键启动所选前后端/); assert.match(html, /未选择的服务不会启动/);
  const backendOnly = render(RuntimeStartOptions, { items: [{ service: service('front'), worktree: worktree('task-front') }, { service: service('back'), worktree: worktree('task-back') }], selected: ['back'], onSelected() {}, connection: 'local', onConnection() {}, taskScope: true });
  assert.doesNotMatch(backendOnly, /type="radio"/);
});

test('真实普通后端选项不展示下游控件，主库可选且不明路由目录禁选', () => {
  const downstream = { kind: 'service-discovery', serviceCode: 'upms', serviceId: 'upms-app', fallback: { kind: 'existing-discovery', context: 'qa' } };
  const configured = { ...service('back'), definition: { ...definition, local: { ...definition.local, routing: { serviceId: 'business-app', format: 'buildr.local-service-routing/v1' }, backends: [downstream] } } };
  const main = worktree('main', true), task = worktree('task'), unknown = { ...worktree('unknown'), taskId: null }, conflicting = { ...main, id: 'conflicting', taskId: 'task-one' };
  const directories = [];
  const props = { items: [{ service: configured, worktree: main, worktrees: [task, main, unknown, conflicting], connectionTarget: [{ serviceCode: 'upms', candidates: [{ runId: 'task-upms', worktreeLabel: '任务', url: 'http://127.0.0.1:8189', sameScope: false }], target: null }] }], selected: ['back'], connection: 'remote', backendSelections: {}, onConnection() {}, onBackendSelection() { throw Error('普通后端不得要求下游选择'); }, onWorktree: id => directories.push(id) };
  const tree = RuntimeStartOptions(props);
  const nodes = elements(tree);
  assert.equal(nodes.filter(node => node.props?.className === 'runtime-backend-group' || node.props?.className === 'runtime-backend-options').length, 0);
  const select = nodes.find(node => node.props?.['aria-label'] === '代码目录');
  assert.equal(select.props.options[0].value, main.id);
  assert.equal(select.props.options.find(option => option.value === main.id).disabled, false);
  assert.equal(select.props.options.find(option => option.value === task.id).disabled, false);
  assert.equal(select.props.options.find(option => option.value === unknown.id).disabled, true);
  assert.equal(select.props.options.find(option => option.value === conflicting.id).disabled, true);
  select.props.onChange(main.id); assert.deepEqual(directories, [main.id]);
  const html = render(RuntimeStartOptions, props);
  assert.doesNotMatch(html, /type="radio"|请先启动|默认（自动）/);
  assert.match(html, /沿应用现有配置启动/);
});

test('真实前端逐后端控件可分别选择跨范围实例，并从失效本地目标明确切回远程', () => {
  const secondary = { serviceCode: 'auth', environmentVariable: 'AUTH_URL', remoteUrl: 'https://test.example.com' };
  const configured = { ...service('front'), definition: { ...definition, local: { ...definition.local, backends: [...definition.local.backends, secondary] } } };
  const selections = { back: 'remote', auth: 'remote' };
  const props = { items: [{ service: configured, worktree: worktree('main', true), connectionTarget: [{ serviceCode: 'back', target: null, candidates: [{ runId: 'other-task-back', worktreeLabel: '另一任务', branch: 'another', url: 'http://127.0.0.1:8189', sameScope: false }] }, { serviceCode: 'auth', target: null, candidates: [] }] }], selected: ['front'], connection: 'remote', onConnection() {}, backendSelections: selections, onBackendSelection: (code, value) => { selections[code] = value; } };
  let groups = elements(RuntimeStartOptions(props)).filter(node => node.props?.className === 'runtime-backend-radio');
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.props.value), ['remote', 'remote']);
  const offered = elements(groups[0]).filter(node => node.props?.value === 'run:other-task-back');
  assert.equal(offered.length, 1, '直接地址已就绪候选可显式跨范围选择');
  groups[0].props.onChange({ target: { value: 'run:other-task-back' } });
  assert.deepEqual(model.backendSelectionTargets(configured.definition.local.backends, selections), [{ serviceCode: 'back', target: 'run', runId: 'other-task-back' }, { serviceCode: 'auth', target: 'remote' }]);
  const stoppedProps = { ...props, items: [{ ...props.items[0], connectionTarget: [{ serviceCode: 'back', target: null, candidates: [] }, { serviceCode: 'auth', target: null, candidates: [] }] }] };
  groups = elements(RuntimeStartOptions(stoppedProps)).filter(node => node.props?.className === 'runtime-backend-radio');
  assert.equal(groups[0].props.value, 'run:other-task-back');
  assert.ok(elements(groups[0]).some(node => node.props?.value === 'remote'), '失效目标不隐藏远程选项');
  groups[0].props.onChange({ target: { value: 'remote' } });
  assert.deepEqual(model.backendSelectionTargets(configured.definition.local.backends, selections), [{ serviceCode: 'back', target: 'remote' }, { serviceCode: 'auth', target: 'remote' }]);
  assert.equal(elements(RuntimeStartOptions(stoppedProps)).filter(node => node.props?.className === 'runtime-backend-radio')[0].props.value, 'remote');
});

test('真实已有任务路由后端仍保留必要联调选择', () => {
  const backend = { kind: 'service-discovery', serviceCode: 'upms', serviceId: 'upms-app', fallback: { kind: 'existing-discovery', context: 'qa' } };
  const configured = { ...service('back'), definition: { ...definition, local: { ...definition.local, routing: { serviceId: 'business-app' }, backends: [backend] } } };
  let selection = 'run:previous';
  const props = { items: [{ service: configured, worktree: worktree('task'), connectionTarget: [{ serviceCode: 'upms', state: 'missing', target: null, candidates: [] }] }], selected: ['back'], preserveTaskConnections: true, connection: 'remote', onConnection() {}, backendSelections: { upms: selection }, onBackendSelection: (_code, value) => { selection = value; } };
  const group = elements(RuntimeStartOptions(props)).find(node => node.props?.className === 'runtime-backend-radio');
  assert.ok(group);
  assert.equal(group.props.value, 'run:previous');
  group.props.onChange({ target: { value: 'remote' } });
  assert.equal(selection, 'remote');
  const taskTree = RuntimeStartOptions({ ...props, preserveTaskConnections: undefined, taskScope: true, onBackendSelection: undefined, connection: 'auto' });
  assert.ok(elements(taskTree).some(node => node.props?.role === 'note')); assert.equal(elements(taskTree).filter(node => node.props?.['data-connection-option']).length, 0);
});
test('客户端发送来源版本和明确服务选择，不提供部署客户端', async () => {
  const requests = [];
  const client = createServiceRuntimeClient(async (url, options = {}) => { requests.push({ url, ...options }); return {}; }, 'workspace one');
  const expected = model.expectedWorktree(worktree('task-front'));
  await client.start('front', 'task-front', { connection: 'remote', origin: 'human', taskId: 'task-one', expectedWorktree: expected });
  assert.equal(requests[0].url, '/api/v1/workspaces/workspace%20one/service-runtime/services/front/runs');
  assert.deepEqual(JSON.parse(requests[0].body), { worktreeId: 'task-front', connection: 'remote', origin: 'human', taskId: 'task-one', expectedWorktree: expected });
  await client.startTask('task-one', { selected: [{ serviceCode: 'front', worktreeId: 'task-front', expectedWorktree: expected }], connection: 'remote', origin: 'human' });
  assert.deepEqual(JSON.parse(requests[1].body).selected.map(item => item.serviceCode), ['front']); assert.equal(requests[1].url, '/api/v1/workspaces/workspace%20one/service-runtime/tasks/task-one/runs');
  const abort = new AbortController(); await client.task('task-one', { signal: abort.signal }); assert.equal(requests[2].signal, abort.signal);
  await client.stop('run/one'); assert.equal(requests[3].url, '/api/v1/workspaces/workspace%20one/service-runtime/runs/run%2Fone/stop');
  await client.restart('run/one', { connection: 'local', expectedWorktree: expected });
  assert.equal(requests[4].url, '/api/v1/workspaces/workspace%20one/service-runtime/runs/run%2Fone/restart');
  assert.deepEqual(JSON.parse(requests[4].body), { connection: 'local', expectedWorktree: expected });
  assert.equal('deploy' in client, false); assert.equal('plan' in client, false);
});

test('本地连接必须有服务器确认的就绪地址，远程固定地址始终可见', () => {
  const item = { service: service('front'), worktree: worktree('task-front'), connectionTarget: [{ serviceCode: 'back', candidates: [], target: null, reason: '本任务后端尚未就绪，请先启动后端。' }] };
  const props = { items: [item], selected: ['front'], connection: 'local', onConnection() {} };
  let html = render(RuntimeStartOptions, props);
  assert.match(html, /<input(?=[^>]*type="radio")(?=[^>]*value="local")(?=[^>]*disabled="")[^>]*>/);
  assert.match(html, /本任务后端尚未就绪/); assert.match(html, /https:\/\/test\.example\.com/, '远程地址不随当前选择隐藏');
  assert.equal(model.canUseLocalConnection([item], ['front']), false);
  const ready = { ...item, connectionTarget: [{ serviceCode: 'back', candidates: [], target: { runId: 'ready-back', serviceCode: 'back', url: 'http://127.0.0.1:8189', worktreeLabel: '本次订单验证', branch: 'feature/order' }, reason: null }] };
  html = render(RuntimeStartOptions, { ...props, items: [ready] });
  assert.match(html, /http:\/\/127\.0\.0\.1:8189/); assert.match(html, /本次订单验证/); assert.match(html, /feature\/order/);
  assert.doesNotMatch(html, /<input(?=[^>]*type="radio")(?=[^>]*value="local")(?=[^>]*disabled="")[^>]*>/);
  assert.equal(model.canUseLocalConnection([ready], ['front']), true);
  assert.deepEqual(model.taskSelections([ready], ['front'], 'local')[0].backendTargets, [{ serviceCode: 'back', target: 'run', runId: 'ready-back' }]);
  assert.equal(Object.hasOwn(model.taskSelections([ready], ['front'], 'remote')[0], 'expectedBackendRunId'), false);
  assert.equal(Object.hasOwn(model.taskSelections([item], ['front'], 'local')[0], 'expectedBackendRunId'), false, '整组后端尚未启动时不固定未知实例');
  assert.equal(model.canUseLocalConnection([item], ['front']), false, '轮询读到后端停止后不能继续提交旧目标');
});

test('任务明确选择后端可一起启动，单选前端不隐式启动后端或借用主库', () => {
  const items = [{ service: service('front'), worktree: worktree('task-front') }, { service: service('back'), worktree: worktree('task-back') }];
  assert.equal(model.canUseLocalConnection(items, ['front'], true), false);
  assert.equal(model.canUseLocalConnection(items, ['front', 'back'], true), true);
  const html = render(RuntimeStartOptions, { items, selected: ['front', 'back'], connection: 'local', onConnection() {}, taskScope: true });
  assert.match(html, /一键启动所选前后端/); assert.match(html, /其他请求继续使用远程测试环境/);
  assert.equal(model.canUseLocalConnection([{ ...items[0] }, { ...items[1], worktree: worktree('main-back', true) }], ['front', 'back'], true), false);
  assert.equal(model.canUseLocalConnection([{ ...items[0] }, { ...items[1], service: service('back', false) }], ['front', 'back'], true), false);
});


test('失败但未确认停止的正进程号仍保留停止与占用，不能重试新开', () => {
  const pendingCleanup = { ...run, status: 'failed', stoppedAt: null, pid: 3456, failure: '启动失败，进程清理未完成' };
  assert.equal(model.isActiveRun(pendingCleanup), true);
  assert.equal(model.activeRuns({ ...service('front'), runs: [pendingCleanup] }).length, 1);
  const props = { run: pendingCleanup, service: service('front'), onLogs() {}, onStop() {}, onStart() {}, onConnection() {} };
  const labels = html => (html.match(/<button\b[\s\S]*?<\/button>/gu) || []).map(item => item.replace(/<[^>]+>/gu, '').replace(/\s+/gu, ''));
  const actions = labels(render(LocalRunCard, props));
  assert.ok(actions.includes('停止')); assert.ok(!actions.includes('重试') && !actions.includes('再次启动'));
  const stopped = { ...pendingCleanup, stoppedAt: '2026-10-22T01:01:00Z' };
  assert.equal(model.isActiveRun(stopped), false);
  assert.ok(labels(render(LocalRunCard, { ...props, run: stopped })).includes('重试'));
  assert.equal(model.isActiveRun({ ...pendingCleanup, pid: 0 }), false);
  assert.equal(model.isActiveRun({ status: 'failed' }), false, '缺少旧记录停止信息不能推断仍有受管进程');
  assert.equal(model.isActiveRun({ status: 'starting' }), true, '状态摘要调用方保持兼容');
});


test('切换同一实例保全明确任务交由后端重验，改选目录不能沿用旧任务', async () => {
  const requests = [];
  const client = createServiceRuntimeClient(async (url, options = {}) => { requests.push({ url, ...options }); return {}; }, 'workspace one');
  const original = { worktreeId: 'task-front', taskId: 'task-one' };
  const unassociated = { ...worktree('task-front'), taskId: null, taskTitle: null };
  await client.start('front', unassociated.id, model.startRunOptions(unassociated, original, 'remote'));
  let payload = JSON.parse(requests.at(-1).body);
  assert.equal(payload.taskId, 'task-one', '全局代码观察缺少任务关联时仍提交原实例明确的上下文');
  assert.equal(payload.connection, 'remote'); assert.equal(payload.origin, 'human');
  assert.deepEqual(payload.expectedWorktree, model.expectedWorktree(unassociated));
  await client.start('front', unassociated.id, model.startRunOptions(unassociated, original, 'local'));
  assert.equal(JSON.parse(requests.at(-1).body).taskId, 'task-one');
  const main = worktree('main', true);
  await client.start('front', main.id, model.startRunOptions(main, original, 'remote'));
  payload = JSON.parse(requests.at(-1).body);
  assert.equal(Object.hasOwn(payload, 'taskId'), false, '用户改选主工作库，不得套用原任务');
  const other = { ...worktree('other-task'), taskId: 'task-two' };
  await client.start('front', other.id, model.startRunOptions(other, original, 'local'));
  assert.equal(JSON.parse(requests.at(-1).body).taskId, 'task-two', '改选另一任务仅提交新目录自己的身份');
  await client.start('front', unassociated.id, model.startRunOptions(unassociated, null, 'local'));
  assert.equal(Object.hasOwn(JSON.parse(requests.at(-1).body), 'taskId'), false, '没有可信原实例时不猜测任务');
});


test('启动配置按原始参数数组展示，长路径和引号不被shell拼接改写', async () => {
  const { RuntimeDefinitionDrawer } = await import('../src/features/service-runtime/components/RuntimeDefinitionDrawer.tsx');
  const command = ['/bin/sh', '-c', 'exec /a path/node node_modules/vite/bin/vite.js --mode dev "$@"', 'runner'];
  const configured = { ...service('front'), definition: { ...definition, path: '/workspace with spaces/services/front/runtime.yml', local: { ...definition.local, command } } };
  const tree = RuntimeDefinitionDrawer({ service: configured, onClose() {}, onConfigure() {} });
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
  const pre = nodes(tree).find(node => node.type === 'pre');
  assert.equal(pre.props['aria-label'], '启动命令参数数组');
  assert.deepEqual(JSON.parse(pre.props.children.props.children), command);
  assert.ok(nodes(tree).some(node => node.type === 'dl' && node.props.className === 'runtime-definition-paths'));
  assert.equal(tree.props.id, 'service-runtime-definition-drawer');
  const noConnection = render(RuntimeStartOptions, { items: [{ service: service('back'), worktree: worktree('back-task') }], selected: ['back'], connection: 'remote', onConnection() {} });
  assert.match(noConnection, /沿应用现有配置启动/); assert.doesNotMatch(noConnection, /type="radio"|这是后端|这是前端/);
});

test('本模块确认框可显式居中，通用确认默认保持原值', async () => {
  const { bindConfirmModal, confirmModal } = await import('../src/lib/confirm.ts');
  const configs = []; bindConfirmModal({ confirm(config) { configs.push(config); return { destroy() {}, update() {} }; } });
  const scoped = confirmModal({ title: '停止实例', centered: true }); configs[0].onOk(); assert.equal(await scoped, true); assert.equal(configs[0].centered, true);
  const normal = confirmModal({ title: '其他模块操作' }); configs[1].onCancel(); assert.equal(await normal, false); assert.equal(Object.hasOwn(configs[1], 'centered'), false);
});

test('启动与连接摘要展示真实声明和配置入口，普通服务不被推断为缺少前后端类型', () => {
  let configured = 0; let viewed = 0;
  const props = { definition, onView() { viewed += 1; }, onConfigure() { configured += 1; } };
  const html = render(RuntimeConfigurationSummary, props);
  assert.match(html, /启动与连接配置/); assert.match(html, /本地后端/); assert.match(html, /<code>back<\/code>/);
  assert.match(html, /远程测试地址/); assert.match(html, /https:\/\/test\.example\.com/); assert.match(html, /services\/front\/runtime.yml/);
  assert.match(html, /配置启动与连接/); assert.match(html, /查看配置/);
  assert.doesNotMatch(html, /BACKEND_URL|已连接|这是前端|这是后端/);
  const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...nodes(node.props?.children)] : [];
  const tree = RuntimeConfigurationSummary(props);
  nodes(tree).find(node => node.props?.children === '配置启动与连接').props.onClick();
  nodes(tree).find(node => node.props?.children === '查看配置').props.onClick();
  assert.equal(configured, 1); assert.equal(viewed, 1, '摘要直接复用宿主提供的配置与只读抽屉入口');
  const plain = render(RuntimeConfigurationSummary, { ...props, definition: service('back').definition });
  assert.match(plain, /未声明可切换的后端连接，按现有启动配置运行/); assert.match(plain, /配置启动与连接/);
  assert.doesNotMatch(plain, /远程测试地址|https:\/\/test\.example\.com|缺少配置|这是后端|这是前端/);
});

test('发现连接提交当前目标或明确缺失，展示泳道和 QA 原因而不为后端提供打开', () => {
  const backend = { kind: 'service-discovery', serviceCode: 'back', serviceId: 'back-app', fallback: { kind: 'existing-discovery', context: 'qa' } };
  assert.deepEqual(model.backendSelectionTargets([backend], {}, [{ serviceCode: 'back', state: 'missing', target: null }]), [{ serviceCode: 'back', target: 'auto', expectedRunId: null }]);
  assert.deepEqual(model.backendSelectionTargets([backend], {}, [{ serviceCode: 'back', state: 'ready', target: { runId: 'observed' } }]), [{ serviceCode: 'back', target: 'auto', expectedRunId: 'observed' }]);
  assert.deepEqual(model.backendSelectionTargets([backend], {}, [{ serviceCode: 'back', state: 'pending', target: null }]), [{ serviceCode: 'back', target: 'auto' }]);
  const discovery = { ...run, connection: null, connections: [{ kind: 'service-discovery', serviceCode: 'back', serviceId: 'back-app', mode: 'remote', context: 'qa', url: null, runId: null, reason: '本次未选择本地下游' }], routing: { laneId: 'lane-test', contextDigest: 'digest', observation: { status: 'unknown' } } };
  const html = render(LocalRunCard, { run: discovery, service: service('back'), onLogs() {}, onStop() {}, onStart() {}, onConnection() {} });
  for (const text of ['lane-test', 'back-app', '本次未选择本地下游', '尚无当前运行观察']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /target="_blank"|已连接|业务验证通过/);
  assert.match(model.routingObservationLabel({ ...discovery, routing: { ...discovery.routing, observation: { status: 'observed', targets: {} } } }), /下游发现状态尚无观察/);
});
