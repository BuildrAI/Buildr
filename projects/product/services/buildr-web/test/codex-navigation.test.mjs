import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/codex-navigation.ts') && specifier === './workspace-pages') return next(specifier + '.ts', context);
  return next(specifier, context);
}});
const {resolveCodexTarget, codexRouteHref, readCodexLocation, createCodexNavigationWindow, adoptCodexPage} = await import('../src/app/codex-navigation.ts');

function browserAt(href, state = {idx: 0, key: 'initial', usr: null}) {
  const entries = [{href, state}]; let position = 0;
  const listeners = new Map();
  const current = () => new URL(entries[position].href);
  const location = {};
  for (const key of ['pathname', 'search', 'hash', 'origin', 'href']) Object.defineProperty(location, key, {get: () => current()[key]});
  const event = () => {for (const callback of listeners.get('popstate') || []) callback({type: 'popstate', state: entries[position].state});};
  const browser = {location, history: {
    get state() { return entries[position].state; },
    pushState(data, _, url) {entries.splice(++position); entries.push({href: url == null ? entries[position - 1].href : new URL(url, entries[position - 1].href).href, state: data});},
    replaceState(data, _, url) { entries[position] = {href: url == null ? entries[position].href : new URL(url, entries[position].href).href, state: data}; },
    go(delta) { const next = position + delta; if (next < 0 || next >= entries.length) return; position = next; event(); },
  }, addEventListener(type, callback) { const set = listeners.get(type) || new Set(); set.add(callback); listeners.set(type, set); }, removeEventListener(type, callback) {listeners.get(type)?.delete(callback);}};
  return {browser, fragment(value) {browser.history.pushState(null, '', current().pathname + value); event();}, entries};
}

test('固定入口只解析当前工作空间的受限目标，错误任务和材料不退回另一个任务', () => {
  const target = resolveCodexTarget('w', '/tasks/fix-save?taskType=composite');
  assert.deepEqual(target.route, {pathname: '/workspaces/w/tasks/fix-save', search: '?taskType=composite', hash: ''});
  assert.equal(target.error, null);
  assert.equal(resolveCodexTarget('w', '/tasks/t/document?project=product&file=docs%2Fplan.md').error, null);
  for (const value of ['https://example.com', '//evil.example/task', '/workspaces/other/tasks/t', '/tasks/a%2fb', '/tasks/%2e%2e', '/tasks/%zz', '/tasks/t?redirect=https://evil.example', '/tasks/t/document?project=product&file=..%2Fsecret.md', '/tasks/t/document?project=product&file=%2Fsecret.md', '/code/unknown', '/unknown']) {
    const result = resolveCodexTarget('w', value); assert.ok(result.error, value); assert.equal(result.route.pathname, '/workspaces/w/codex');
  }
});

test('固定入口从技能页点击连接可达，刷新及历史导航保留同一工作空间入口', () => {
  const target = resolveCodexTarget('w', '/connection-skills#details');
  assert.deepEqual(target, {workspaceId: 'w', route: {pathname: '/workspaces/w/connection-skills', search: '', hash: '#details'}, error: null});
  assert.equal(codexRouteHref('w', target.route), '/workspaces/w/codex#/connection-skills#details');
  assert.equal(resolveCodexTarget('w', '/connections').error, null, 'Legacy links remain accepted so the shared page route can redirect.');
  for (const base of ['/connections', '/connection-skills']) {
    for (const suffix of ['?q=mysql', '?redirect=https://evil.example', '/unknown']) assert.ok(resolveCodexTarget('w', base + suffix).error, base + suffix);
  }

  const {browser} = browserAt('http://local/workspaces/w/codex#/skills');
  const adapted = createCodexNavigationWindow(browser);
  adapted.history.pushState({idx: 1, key: 'connection-skills', usr: null}, '', '/workspaces/w/connection-skills');
  assert.equal(browser.location.pathname, '/workspaces/w/codex');
  assert.equal(browser.location.hash, '#/connection-skills');
  assert.equal(adapted.location.pathname, '/workspaces/w/connection-skills');
  assert.equal(createCodexNavigationWindow(browser).location.pathname, '/workspaces/w/connection-skills');
  adapted.history.go(-1);
  assert.equal(adapted.location.pathname, '/workspaces/w/skills');
  adapted.history.go(1);
  assert.equal(adapted.location.pathname, '/workspaces/w/connection-skills');
});

test('首次载入及刷新准确保留任务片段，资源列表归一不吞掉具体任务', () => {
  const {browser} = browserAt('http://local/workspaces/w/codex#/tasks/task-one?taskType=composite');
  const adapted = createCodexNavigationWindow(browser);
  assert.equal(adapted.location.pathname, '/workspaces/w/tasks/task-one');
  const views = {items: [{kind: 'composite-task', path: '/workspaces/w/tasks/task-one?taskType=composite'}], active: 'composite-task'};
  adapted.history.replaceState({idx: 0, key: 'owner', usr: {resourceViews: views}}, '', '/workspaces/w/tasks');
  assert.equal(browser.location.hash, '#/tasks/task-one?taskType=composite');
  assert.equal(adapted.location.pathname, '/workspaces/w/tasks');
  const refreshed = createCodexNavigationWindow(browser);
  assert.equal(refreshed.location.pathname, '/workspaces/w/tasks');
  assert.deepEqual(refreshed.history.state.usr.resourceViews, views);
});

test('宿主外部片段变化清除旧资源权威，历史前进后退可还原并为导航保护提供准确delta', () => {
  const {browser, fragment} = browserAt('http://local/workspaces/w/codex#/overview');
  const adapted = createCodexNavigationWindow(browser), observations = [];
  adapted.addEventListener('popstate', () => observations.push({idx: adapted.history.state.idx, pathname: adapted.location.pathname, usr: adapted.history.state.usr}));
  const views = {items: [{kind: 'task', path: '/workspaces/w/tasks/one'}], active: 'task'};
  adapted.history.replaceState({idx: 0, key: 'one', usr: {resourceViews: views}}, '', '/workspaces/w/tasks');
  fragment('#/tasks/two');
  assert.deepEqual(observations.at(-1), {idx: 1, pathname: '/workspaces/w/tasks/two', usr: null});
  assert.equal(browser.location.pathname, '/workspaces/w/codex');
  adapted.history.go(-1);
  assert.equal(observations.at(-1).idx, 0); assert.equal(observations.at(-1).pathname, '/workspaces/w/tasks');
  assert.deepEqual(observations.at(-1).usr.resourceViews, views);
  adapted.history.go(1);
  assert.deepEqual(observations.at(-1), {idx: 1, pathname: '/workspaces/w/tasks/two', usr: null});
});

test('当前旧页面同文档采用保持历史用户状态与任务材料，后续导航不换基址', () => {
  const userState = {resourceViews: {items: [{kind: 'task-document', path: '/workspaces/w/tasks/t/document?project=product&file=docs%2Fplan.md'}], active: 'task-document'}, draft: '尚未保存'};
  const {browser, entries} = browserAt('http://local/workspaces/w/tasks?status=active', {idx: 3, key: 'retained', usr: userState});
  const adapted = createCodexNavigationWindow(browser);
  assert.equal(adoptCodexPage(browser), true);
  assert.equal(entries.length, 1); assert.equal(browser.location.pathname, '/workspaces/w/codex');
  assert.equal(browser.location.hash, '#/tasks/t/document?project=product&file=docs%2Fplan.md');
  assert.equal(adapted.location.pathname, '/workspaces/w/tasks'); assert.equal(adapted.location.search, '?status=active');
  assert.deepEqual(adapted.history.state.usr, userState);
  adapted.history.pushState({idx: 4, key: 'code', usr: null}, '', '/workspaces/w/code/source-control');
  assert.equal(browser.location.pathname, '/workspaces/w/codex'); assert.equal(browser.location.hash, '#/code/source-control');
  assert.equal(adapted.location.pathname, '/workspaces/w/code/source-control');
  adapted.history.pushState({idx: 5, key: 'other', usr: null}, '', '/workspaces/other/overview');
  assert.equal(browser.location.pathname, '/workspaces/other/overview');
});

test('错误片段不复用旧state，关闭详情显式回列表，普通Web路径及链接保持原状', () => {
  const {browser} = browserAt('http://local/workspaces/w/codex#/tasks/t');
  const adapted = createCodexNavigationWindow(browser);
  adapted.history.replaceState({idx: 0, usr: {resourceViews: {items: [], active: null}}}, '', '/workspaces/w/tasks');
  assert.equal(browser.location.hash, '#/tasks');
  assert.equal(codexRouteHref('w', {pathname: '/workspaces/other/tasks/t', search: '', hash: ''}), null);
  const plain = browserAt('http://local/workspaces/w/tasks/t').browser, normal = createCodexNavigationWindow(plain);
  assert.equal(normal.location.pathname, plain.location.pathname);
  normal.history.pushState({idx: 1, usr: null}, '', '/workspaces/w/overview');
  assert.equal(plain.location.pathname, '/workspaces/w/overview'); assert.equal(plain.location.hash, '');
  assert.equal(readCodexLocation({pathname: '/workspaces/w/codex', search: '', hash: '#/tasks/%zz'}).error, '任务链接编码无效。');
  const target = {pathname: '/workspaces/w/codex', search: '', hash: '#/tasks/t'};
  assert.equal(readCodexLocation(target, {buildrCodex: {fragment: target.hash, route: {pathname: 42}}}).route.pathname, '/workspaces/w/tasks/t');
  assert.equal(readCodexLocation(target, {buildrCodex: {fragment: target.hash, route: {pathname: '/workspaces/w/tasks', search: '', hash: ''}}, usr: {resourceViews: {items: [null], active: undefined}}}).route.pathname, '/workspaces/w/tasks/t');
});
