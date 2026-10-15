import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';

registerHooks({resolve(specifier, context, next) {
  if (!context.parentURL?.endsWith('/hooks/useSourceControl.ts')) return next(specifier, context);
  if (specifier === 'react') return {url:'data:text/javascript,' + encodeURIComponent(['useMemo', 'useRef', 'useEffect', 'useSyncExternalStore'].map(name => `export const ${name} = (...args) => globalThis.__sourceControlHarness.${name}(...args);`).join('\n')), shortCircuit:true};
  if (specifier === '../api/code-api') return {url:'data:text/javascript,' + encodeURIComponent('export const codeApi = globalThis.__sourceControlApi;'), shortCircuit:true};
  return next(specifier + '.ts', context);
}});
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};
const settle = async () => {for (let count = 0; count < 8; count++) await Promise.resolve();};
const repository = id => ({id, name:id, location:'/repo/' + id, gitId:'git-' + id, status:'complete', source:null, branch:'main', fileCount:0, changes:[], diagnostics:[], worktreeCount:1, worktreeCoverage:{limit:128,total:1,read:1,truncated:false}, worktrees:[{worktreeId:id + '-task', name:'task', isMain:true, isRegistered:true, location:'/repo/' + id, source:null, branch:'main', status:'complete', fileCount:0, changes:[], diagnostics:[], coverage:{fileLimit:1000,truncated:false}}]});
const response = (...repositories) => ({repositories, readAt:'2026-10-15T10:00:00Z', selectedRepositoryIds:['task-repo'], selectedWorktreeIds:repositories.filter(item => item.id === 'task-repo').map(item => item.worktrees[0]?.worktreeId).filter(Boolean), selectedWorktrees:repositories.filter(item => item.id === 'task-repo' && item.worktrees[0]).map(item => ({repositoryId:item.id,worktreeId:item.worktrees[0].worktreeId})), diagnostics:[], scopeReason:'task', coverage:{limit:128,truncated:false,nextCursor:null}, worktreeCoverage:{limit:128,total:repositories.length,read:repositories.length,truncated:false}});
const inventory = () => {const value = response(...['other', 'task-repo'].map(id => ({...repository(id), gitId:null, status:'unavailable', fileCount:null, worktrees:[], worktreeCount:null, worktreeCoverage:{limit:128,total:null,read:0,truncated:false}, diagnostics:[{code:'code_source_control_pending', repositoryId:id, message:'尚未检查'}]}))); return {...value, diagnostics:value.repositories.flatMap(repository => repository.diagnostics)};};

function harness() {
  const slots = [], effects = []; let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  globalThis.__sourceControlHarness = {
    useMemo(fn, deps) {const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = {value:fn(), deps}; return slots[index].value;},
    useRef(value) {const index = cursor++; return slots[index] ||= {current:value};},
    useEffect(fn, deps) {const index = cursor++; if (!same(slots[index]?.deps, deps)) {const previous = slots[index]; slots[index] = {deps}; effects.push(() => {previous?.cleanup?.(); slots[index].cleanup = fn();});}},
    useSyncExternalStore(subscribe, snapshot) {cursor++; return snapshot();},
  };
  return {render(hook, workspaceId = 'workspace', taskId = 'task') {cursor = 0; const value = hook(workspaceId, taskId); effects.splice(0).forEach(fn => fn()); return value;}, dispose() {slots.forEach(slot => slot?.cleanup?.()); delete globalThis.__sourceControlHarness;}};
}

test('任务默认来源等完整刷新后一次提供，后续渐进刷新保留旧选择且工作空间切换不复用', async () => {
  const lists = [], reads = [];
  globalThis.__sourceControlApi = {
    sourceControlInventory(workspaceId, input, signal) {const request = {...deferred(), workspaceId, input, signal}; lists.push(request); return request.promise;},
    sourceControl(workspaceId, input, signal) {const request = {...deferred(), workspaceId, input, signal}; reads.push(request); return request.promise;},
  };
  const {useSourceControl} = await import('../src/features/code/hooks/useSourceControl.ts');
  const view = harness();
  try {
    view.render(useSourceControl); lists[0].resolve(inventory()); await settle();
    assert.equal(view.render(useSourceControl).selection, undefined);
    assert.deepEqual(view.render(useSourceControl).observation.diagnostics, [], '等待状态不能当作全局失败警告');
    reads.find(item => item.input.repositoryId === 'other').resolve(response(repository('other'))); await settle();
    assert.equal(view.render(useSourceControl).repositories.find(item => item.id === 'other').status, 'clean', '非任务库结果仍可渐进显示');
    assert.equal(view.render(useSourceControl).selection, undefined, '任务来源未完成前不能消费空工作树选择');
    reads.find(item => item.input.repositoryId === 'task-repo').resolve(response(repository('task-repo'))); await settle();
    const ready = view.render(useSourceControl);
    assert.deepEqual(ready.selection.worktrees, [{repositoryId:'task-repo',worktreeId:'task-repo-task'}]);
    const refresh = ready.refresh(); lists[1].resolve(inventory()); await settle();
    assert.equal(view.render(useSourceControl).selection, ready.selection, '后续刷新期间继续保留已确认范围');
    reads.slice(2).forEach(request => request.resolve(response(repository(request.input.repositoryId)))); await refresh;
    assert.equal(view.render(useSourceControl, 'different').selection, undefined, '新工作空间不能沿用旧任务来源');
  } finally {view.dispose(); delete globalThis.__sourceControlApi;}
});
