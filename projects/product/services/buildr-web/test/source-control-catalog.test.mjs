import assert from 'node:assert/strict';
import test from 'node:test';
import {createSourceControlCatalog} from '../src/features/code/source-control-catalog.ts';

const repository = (id, branch = 'main', readAt = '2026-10-13T10:00:00.000Z') => ({id, name:id, branch, gitId:'git-' + id, source:{checkoutId:'checkout-' + id}, worktreeCount:1, worktreeCoverage:{limit:128,total:1,read:1,truncated:false}, worktrees:[{worktreeId:id + '-main', isRegistered:true, branch, head:branch, readAt, coverage:{fileLimit:1000, truncated:false}}]});
const response = (...repositories) => ({readAt:'2026-10-13T10:00:00.000Z', repositories, selectedRepositoryIds:repositories.map(item => item.id), selectedWorktrees:[], scopeReason:'all', diagnostics:[], coverage:{limit:128,truncated:false,nextCursor:null}, worktreeCoverage:{limit:128,total:repositories.length,read:repositories.length,truncated:false}});
const setup = async () => {
  const requests = [];
  const catalog = createSourceControlCatalog((repositoryId, signal) => new Promise((resolve, reject) => requests.push({repositoryId, signal, resolve, reject})));
  const initial = catalog.refresh(); requests[0].resolve(response(repository('a'), repository('b'))); await initial;
  return {catalog, requests};
};

test('不同代码库局部读取各自完成，不取消彼此且保留另一库版本和目录选择', async () => {
  const {catalog, requests} = await setup(), initial = catalog.snapshot(), versionB = initial.versions.b;
  const a = catalog.refresh('a'), b = catalog.refresh('b');
  assert.deepEqual(requests.map(item => item.repositoryId), [undefined, 'a', 'b']);
  assert.equal(requests[1].signal.aborted, false);
  requests[1].resolve(response(repository('a', 'a-new'))); await a;
  assert.equal(catalog.snapshot().versions.b, versionB);
  assert.equal(catalog.snapshot().data.repositories[1], initial.data.repositories[1]);
  requests[2].resolve(response(repository('b', 'b-new'))); await b;
  assert.deepEqual(catalog.snapshot().data.repositories.map(item => item.branch), ['a-new', 'b-new']);
  assert.deepEqual(catalog.snapshot().data.selectedRepositoryIds, ['a', 'b']); catalog.dispose();
});

test('旧全目录迟到不覆盖启动之后的单库观察，并仍可更新无关代码库', async () => {
  const {catalog, requests} = await setup();
  const full = catalog.refresh(), partial = catalog.refresh('a');
  requests[2].resolve(response(repository('a', 'new'))); await partial;
  const version = catalog.snapshot().versions.a;
  requests[1].resolve(response(repository('a', 'old'), repository('b', 'full-b'))); await full;
  assert.deepEqual(catalog.snapshot().data.repositories.map(item => item.branch), ['new', 'full-b']);
  assert.equal(catalog.snapshot().versions.a, version); catalog.dispose();
});

test('同库较旧响应和先于较新全量发起的局部结果都不能回滚', async () => {
  const {catalog, requests} = await setup();
  const old = catalog.refresh('a'), newer = catalog.refresh('a');
  assert.equal(requests[1].signal.aborted, true);
  requests[2].resolve(response(repository('a', 'new'))); await newer;
  requests[1].resolve(response(repository('a', 'old'))); await old;
  assert.equal(catalog.snapshot().data.repositories[0].branch, 'new');
  const partial = catalog.refresh('a'), full = catalog.refresh();
  requests[4].resolve(response(repository('a', 'full-new'), repository('b'))); await full;
  requests[3].resolve(response(repository('a', 'partial-old'))); await partial;
  assert.equal(catalog.snapshot().data.repositories[0].branch, 'full-new'); catalog.dispose();
});

test('局部读取失败保留全部已有目录，未知响应不全量回退', async () => {
  const {catalog, requests} = await setup(), before = catalog.snapshot().data;
  const failed = catalog.refresh('a'); requests[1].reject(new Error('来源暂不可读')); await failed;
  assert.equal(catalog.snapshot().data, before); assert.equal(catalog.snapshot().error, '');
  assert.equal(catalog.snapshot().repositoryErrors.a, '来源暂不可读');
  const wrong = catalog.refresh('a'); requests[2].resolve(response(repository('b'))); await wrong;
  assert.equal(catalog.snapshot().data, before); assert.match(catalog.snapshot().repositoryErrors.a, /未返回对应来源/);
  assert.deepEqual(requests.map(item => item.repositoryId), [undefined, 'a', 'a']);
  const full = catalog.refresh(); requests[3].resolve(response(repository('b'))); await full;
  assert.equal(catalog.snapshot().repositoryErrors.a, undefined, '全目录确认来源已移除后清理对应的旧局部错误');
  catalog.dispose();
});

test('写入确认立即采用准确来源，仅该库失效并局部重读；旧写入仍触发核对', async () => {
  const {catalog, requests} = await setup(), versionB = catalog.snapshot().versions.b;
  catalog.changed('a', {source:{repositoryId:'a', worktreeId:'a-main'}, branch:'confirmed', head:'confirmed-head', upstream:null, readAt:'2026-10-13T10:00:02.000Z'});
  assert.equal(catalog.snapshot().data.repositories[0].branch, 'confirmed');
  assert.equal(catalog.snapshot().versions.b, versionB); assert.equal(requests[1].repositoryId, 'a');
  requests[1].resolve(response(repository('a', 'newest', '2026-10-13T10:00:03.000Z'))); await Promise.resolve();
  catalog.changed('a', {source:{repositoryId:'a', worktreeId:'a-main'}, branch:'old-write', readAt:'2026-10-13T10:00:01.000Z'});
  assert.equal(catalog.snapshot().data.repositories[0].branch, 'newest'); assert.equal(requests[2].repositoryId, 'a');
  catalog.dispose();
});

test('旧工作空间销毁后的迟到响应不发布或污染新页面', async () => {
  const {catalog, requests} = await setup(); let notified = 0;
  catalog.subscribe(() => { notified++; });
  const pending = catalog.refresh('a'), before = notified;
  catalog.dispose(); const next = await setup();
  requests[1].resolve(response(repository('a', 'other-workspace'))); await pending;
  assert.equal(notified, before); assert.equal(next.catalog.snapshot().data.repositories[0].branch, 'main');
  assert.equal(requests[1].signal.aborted, true); next.catalog.dispose();
});

test('批量获取完成只重读一次全目录，仅明确范围的分支读取版本失效', async () => {
  const {catalog, requests} = await setup();
  const initialVersionB = catalog.snapshot().versions.b;
  catalog.changedMany(['a']);
  assert.equal(requests.length, 2); assert.equal(requests[1].repositoryId, undefined);
  assert.equal(catalog.snapshot().versions.b, initialVersionB);
  const versionA = catalog.snapshot().versions.a;
  requests[1].resolve(response(repository('a'), repository('b'))); await Promise.resolve();
  assert.equal(catalog.snapshot().versions.a, versionA, '批量观察不重复失效已打开的分支清单');
  assert.equal(catalog.snapshot().versions.b, initialVersionB); catalog.dispose();
});

test('局部恢复仅清理目标旧诊断，按合并事实更新全局覆盖并保留选择与观察版本', async () => {
  let resolve;
  const catalog = createSourceControlCatalog(() => new Promise(done => {resolve = done;}));
  const a = repository('a'), b = repository('b');
  a.worktreeCoverage.read = 0; a.worktreeCoverage.truncated = true;
  const initial = {...response(a, b), observedRevision:'opaque-original', diagnostics:[{repositoryId:'a', message:'旧A错误'}, {repositoryId:'b', message:'保留B错误'}, {repositoryId:null, message:'全局提示'}], coverage:{limit:128,truncated:true,nextCursor:null}};
  const first = catalog.refresh(); resolve(initial); await first;
  const refresh = catalog.refresh('a'); resolve({...response(repository('a')), readAt:'2026-10-13T10:00:01.000Z', diagnostics:[{repositoryId:'a', message:'当前A提示'}, {repositoryId:null, message:'局部请求不能替换全局提示'}]}); await refresh;
  const data = catalog.snapshot().data;
  assert.deepEqual(data.diagnostics.map(item => item.message), ['保留B错误', '全局提示', '当前A提示']);
  assert.deepEqual(data.worktreeCoverage, {limit:128,total:2,read:2,truncated:false}); assert.equal(data.coverage.truncated, false);
  assert.deepEqual(data.selectedRepositoryIds, ['a', 'b']); assert.equal(data.observedRevision, 'opaque-original');
  catalog.dispose();
});
