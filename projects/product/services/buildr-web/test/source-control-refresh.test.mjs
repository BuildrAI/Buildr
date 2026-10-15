import assert from 'node:assert/strict';
import test from 'node:test';
import {createSourceControlRefreshLoader} from '../src/features/code/source-control-refresh.ts';
import {createSourceControlCatalog} from '../src/features/code/source-control-catalog.ts';

const pendingDiagnostic = id => ({code:'code_source_control_pending', repositoryId:id, message:'状态尚未检查。'});
const repository = (id, branch = 'main') => ({id, name:id, location:'/repo/' + id, gitId:'git-' + id, available:true, status:'complete', branch, head:branch, source:{location:'/repo/' + id}, fileCount:1, changes:[{path:id + '.ts'}], observedRevision:'revision-' + branch, diagnostics:[], worktreeCount:1, worktreeCoverage:{limit:128,total:1,read:1,truncated:false}, worktrees:[{worktreeId:id + '-main', location:'/repo/' + id, isRegistered:true, available:true, status:'complete', branch, head:branch, source:{location:'/repo/' + id}, changes:[{path:id + '.ts'}], fileCount:1, observedRevision:'revision-' + branch, diagnostics:[], readAt:'2026-10-15T10:00:00.000Z', coverage:{fileLimit:1000,truncated:false}}]});
const response = (...repositories) => ({readAt:'2026-10-15T10:00:00.000Z', repositories, observedRevision:'catalog-revision', selectedRepositoryIds:[], selectedWorktreeIds:[], selectedWorktrees:[], scopeReason:'all', diagnostics:repositories.flatMap(item => item.diagnostics), coverage:{limit:128,truncated:false,nextCursor:null}, worktreeCoverage:{limit:128,total:repositories.every(item => item.worktreeCount !== null) ? repositories.length : null,read:repositories.reduce((sum, item) => sum + item.worktreeCoverage.read, 0),truncated:false}});
const inventory = (...ids) => response(...ids.map(id => ({...repository(id), gitId:null, source:null, available:false, status:'unavailable', branch:null, head:null, fileCount:null, changes:[], observedRevision:null, worktrees:[], worktreeCount:null, worktreeCoverage:{limit:128,total:null,read:0,truncated:false}, diagnostics:[pendingDiagnostic(id)]})));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject}; };
const settle = async () => { for (let count = 0; count < 8; count++) await Promise.resolve(); };
function setup() {
  const requests = [], list = deferred();
  const loader = createSourceControlRefreshLoader({inventory:() => list.promise, repository:(repositoryId, signal) => {
    const request = {...deferred(), repositoryId, signal}; requests.push(request); return request.promise;
  }});
  return {list, requests, loader};
}

test('快库在慢库完成前即发布，保持最多两个请求并保留清单顺序', async () => {
  const {list, requests, loader} = setup(), updates = [], controller = new AbortController();
  const result = loader(undefined, controller.signal, (value, phase) => updates.push({value, phase}));
  assert.equal(requests.length, 0, '必须先等待轻量登记清单');
  list.resolve(inventory('slow', 'fast', 'third', 'fourth')); await settle();
  assert.deepEqual(requests.map(item => item.repositoryId), ['slow', 'fast']);
  assert.equal(updates[0].phase, 'inventory');
  assert.ok(updates[0].value.repositories.every(item => item.fileCount === null && item.status === 'unavailable'));
  requests[1].resolve(response(repository('fast', 'fast-new'))); await settle();
  assert.deepEqual(updates.filter(item => item.phase === 'repository').map(item => item.value.repositories[0].id), ['fast']);
  assert.deepEqual(requests.map(item => item.repositoryId), ['slow', 'fast', 'third']);
  requests[2].resolve(response(repository('third'))); await settle();
  assert.equal(requests.length, 4, '一个完成后只补一个空位');
  requests[3].resolve(response(repository('fourth'))); await settle();
  assert.equal(updates.filter(item => item.phase === 'repository').length, 3);
  requests[0].resolve(response(repository('slow')));
  assert.deepEqual((await result).repositories.map(item => item.id), ['slow', 'fast', 'third', 'fourth']);
});

test('单库请求直读，不获取全目录；全量中的失败只影响该库并继续队列', async () => {
  const {list, requests, loader} = setup();
  const partial = loader('only', new AbortController().signal);
  assert.deepEqual(requests.map(item => item.repositoryId), ['only']);
  requests[0].resolve(response(repository('only'))); await partial;
  const updates = [], result = loader(undefined, new AbortController().signal, (value, phase) => {if (phase === 'repository') updates.push(value);});
  list.resolve(inventory('bad', 'good', 'next')); await settle();
  requests[1].reject(Error('磁盘暂不可读')); await settle();
  assert.equal(requests.length, 4);
  assert.equal(updates[0].diagnostics[0].message, '磁盘暂不可读');
  assert.equal(updates[0].repositories[0].fileCount, null);
  requests[2].resolve(response(repository('good'))); requests[3].resolve(response(repository('next')));
  const value = await result;
  assert.equal(value.repositories.length, 3);
  assert.ok(value.diagnostics.some(item => item.code === 'code_source_control_refresh_failed' && item.repositoryId === 'bad'));
  assert.ok(!value.diagnostics.some(item => item.code === 'code_source_control_pending'));
});

test('取消后不再排队或发布，即使读取者忽略取消信号', async () => {
  const {list, requests, loader} = setup(), controller = new AbortController(), updates = [];
  const result = loader(undefined, controller.signal, (value, phase) => updates.push(phase));
  list.resolve(inventory('one', 'two', 'never')); await settle();
  controller.abort();
  const rejected = assert.rejects(result, {name:'AbortError'});
  requests.forEach(request => request.resolve(response(repository(request.repositoryId)))); await rejected;
  assert.equal(requests.length, 2); assert.deepEqual(updates, ['inventory']);
});

test('全量按登记覆盖上限调度，超出范围保留未知且有明确诊断，空目录正常完成', async () => {
  const {list, requests, loader} = setup(), updates = [];
  const result = loader(undefined, new AbortController().signal, (value, phase) => updates.push({value, phase}));
  const value = inventory('a', 'b', 'c'); value.coverage.limit = 2;
  list.resolve(value); await settle();
  assert.deepEqual(requests.map(item => item.repositoryId), ['a', 'b']);
  requests.forEach(request => request.resolve(response(repository(request.repositoryId))));
  const completed = await result;
  assert.equal(completed.coverage.truncated, true);
  assert.equal(completed.repositories[2].fileCount, null);
  assert.ok(completed.diagnostics.some(item => item.code === 'code_source_control_read_limit' && item.repositoryId === 'c'));
  assert.ok(!completed.diagnostics.some(item => item.code === 'code_source_control_pending'));
  const empty = createSourceControlRefreshLoader({inventory:async () => inventory(), repository:() => assert.fail('空目录不应请求代码库')});
  assert.deepEqual((await empty(undefined, new AbortController().signal)).repositories, []);
});

test('渐进目录保留旧结果直到对应库完成，并在完整结束后删除旧登记', async () => {
  const {list, requests, loader} = setup();
  const catalog = createSourceControlCatalog(loader), result = catalog.refresh();
  list.resolve(inventory('slow', 'fast')); await settle();
  assert.deepEqual(catalog.snapshot().data.repositories.map(item => item.fileCount), [null, null]);
  requests[1].resolve(response(repository('fast', 'fast-new'))); await settle();
  assert.equal(catalog.snapshot().loading, true);
  assert.deepEqual(catalog.snapshot().data.repositories.map(item => item.branch), [null, 'fast-new']);
  assert.deepEqual(catalog.snapshot().data.selectedRepositoryIds, [], '无任务范围时逐库完成不能抢占选择');
  requests[0].resolve(response(repository('slow', 'slow-old'))); await result;
  const nextList = deferred(), nextRequests = [];
  const nextLoader = createSourceControlRefreshLoader({inventory:() => nextList.promise, repository:id => {const request = {...deferred(), id}; nextRequests.push(request); return request.promise;}});
  let activeLoader = async () => catalog.snapshot().data;
  const next = createSourceControlCatalog((...args) => activeLoader(...args)); await next.refresh(); activeLoader = nextLoader;
  const before = next.snapshot();
  const refresh = next.refresh(); nextList.resolve(inventory('fast')); await settle();
  assert.equal(next.snapshot().data.repositories.find(item => item.id === 'fast'), before.data.repositories.find(item => item.id === 'fast'), '登记清单不能替换已经读取的来源实体');
  assert.deepEqual(next.snapshot().versions, before.versions, '登记清单不能使正文读取版本失效');
  assert.deepEqual(next.snapshot().data.repositories.map(item => item.branch), ['fast-new', 'slow-old']);
  assert.equal(next.snapshot().data.repositories.find(item => item.id === 'fast').fileCount, 1);
  nextRequests[0].resolve(response(repository('fast', 'fast-latest'))); await refresh;
  assert.deepEqual(next.snapshot().data.repositories.map(item => item.id), ['fast']);
  next.dispose(); catalog.dispose();
});

test('渐进全量的旧库结果不能覆盖较新局部刷新或分支切换，失败保留旧文件并显示真实错误', async () => {
  const events = [];
  const catalog = createSourceControlCatalog((repositoryId, signal, onProgress) => {
    const request = {...deferred(), repositoryId, signal, onProgress}; events.push(request); return request.promise;
  });
  const first = catalog.refresh(); events[0].resolve(response(repository('a'), repository('b'))); await first;
  const full = catalog.refresh(); events[1].onProgress(inventory('a', 'b'), 'inventory');
  const partial = catalog.refresh('a'); events[2].resolve(response(repository('a', 'new-local'))); await partial;
  events[1].onProgress(response(repository('a', 'old-full')), 'repository');
  assert.equal(catalog.snapshot().data.repositories[0].branch, 'new-local');
  catalog.changed('a', {source:{repositoryId:'a', worktreeId:'a-main'}, branch:'confirmed', head:'confirmed-head', upstream:null, readAt:'2026-10-15T10:00:02.000Z'});
  events[1].onProgress(response(repository('a', 'older-full')), 'repository');
  assert.equal(catalog.snapshot().data.repositories[0].branch, 'confirmed');
  const failed = inventory('b'); failed.repositories[0].diagnostics = [{code:'code_source_control_refresh_failed', repositoryId:'b', message:'读取超时'}]; failed.diagnostics = failed.repositories[0].diagnostics;
  events[1].onProgress(failed, 'repository');
  assert.equal(catalog.snapshot().data.repositories[1].changes[0].path, 'b.ts');
  assert.equal(catalog.snapshot().data.repositories[1].status, 'unavailable');
  assert.equal(catalog.snapshot().repositoryErrors.b, '读取超时');
  events[1].resolve(response(repository('a', 'old-final'), failed.repositories[0])); await full;
  assert.equal(catalog.snapshot().data.repositories[0].branch, 'confirmed');
  assert.equal(catalog.snapshot().data.repositories[1].changes[0].path, 'b.ts');
  events[3].resolve(response(repository('a', 'confirmed'))); await settle(); catalog.dispose();
});

test('被替代或销毁的全量刷新忽略后续逐库进度', async () => {
  const requests = [];
  const catalog = createSourceControlCatalog((repositoryId, signal, onProgress) => {const request = {...deferred(), signal, onProgress}; requests.push(request); return request.promise;});
  const first = catalog.refresh(); requests[0].onProgress(inventory('a'), 'inventory');
  const latest = catalog.refresh(); requests[1].onProgress(inventory('a'), 'inventory');
  requests[1].onProgress(response(repository('a', 'newest')), 'repository');
  requests[0].onProgress(response(repository('a', 'stale')), 'repository');
  assert.equal(catalog.snapshot().data.repositories[0].branch, 'newest');
  requests[1].resolve(response(repository('a', 'newest'))); await latest;
  requests[0].resolve(response(repository('a', 'stale'))); await first;
  let published = 0; catalog.subscribe(() => published++);
  const abandoned = catalog.refresh(), before = published; catalog.dispose();
  requests[2].onProgress(response(repository('a', 'disposed')), 'repository'); requests[2].resolve(response(repository('a', 'disposed'))); await abandoned;
  assert.equal(published, before);
});

test('登记子目录或符号路径不清空已确认Git根，传输失败及未调度仍保留旧身份和文件', async () => {
  for (const {location, limit} of [{location:'/repo/a/packages/service', limit:128}, {location:'/linked/a', limit:0}]) {
    const before = repository('a', 'observed');
    let activeLoader = async () => response(before);
    const catalog = createSourceControlCatalog((...args) => activeLoader(...args));
    await catalog.refresh();
    const previous = catalog.snapshot();
    const list = deferred(), read = deferred(), declarations = inventory('a');
    declarations.repositories[0].location = location;
    declarations.coverage.limit = limit;
    activeLoader = createSourceControlRefreshLoader({inventory:() => list.promise, repository:() => read.promise});
    const refresh = catalog.refresh(); list.resolve(declarations);
    if (limit) {
      await settle();
      assert.equal(catalog.snapshot().data.repositories[0], previous.data.repositories[0], '未知Git身份的登记路径不能替换旧实体');
      assert.deepEqual(catalog.snapshot().versions, previous.versions);
      read.reject(Error('暂时不可读取登记目录'));
    }
    await refresh;
    const retained = catalog.snapshot().data.repositories[0];
    assert.equal(retained.location, before.location);
    assert.equal(retained.gitId, before.gitId);
    assert.deepEqual(retained.source, before.source);
    assert.deepEqual(retained.changes, before.changes);
    assert.equal(retained.worktrees[0].observedRevision, before.worktrees[0].observedRevision);
    assert.equal(retained.status, 'unavailable');
    assert.ok(retained.diagnostics.some(item => item.code === 'code_source_control_stale'));
    assert.ok(retained.diagnostics.some(item => item.code === (limit ? 'code_source_control_refresh_failed' : 'code_source_control_read_limit')));
    catalog.dispose();
  }
});

test('实际读取证明Git身份或根路径已更换时，不把旧文件移到新来源', async () => {
  for (const identity of [{location:'/repo/a', gitId:'different-git'}, {location:'/different/a', gitId:'git-a'}]) {
    let activeLoader = async () => response(repository('a', 'old'));
    const catalog = createSourceControlCatalog((...args) => activeLoader(...args)); await catalog.refresh();
    const foreign = {...inventory('a').repositories[0], ...identity, diagnostics:[{code:'code_source_unavailable',repositoryId:'a',message:'新来源不可读取'}]};
    activeLoader = async () => response(foreign);
    await catalog.refresh('a');
    const actual = catalog.snapshot().data.repositories[0];
    assert.equal(actual.gitId, identity.gitId);
    assert.equal(actual.location, identity.location);
    assert.equal(actual.observedRevision, null);
    assert.deepEqual(actual.changes, []);
    assert.deepEqual(actual.worktrees, []);
    assert.ok(!actual.diagnostics.some(item => item.code === 'code_source_control_stale'));
    catalog.dispose();
  }
});

test('切换已确认但文件版本尚未重读时，后续全量失败仍保留分支与工作树身份', async () => {
  const reads = [];
  const catalog = createSourceControlCatalog((repositoryId, signal, onProgress) => {const read = {...deferred(), repositoryId, signal, onProgress}; reads.push(read); return read.promise;});
  const first = catalog.refresh(); reads[0].resolve(response(repository('a'))); await first;
  const source = {repositoryId:'a', worktreeId:'a-main', checkoutId:'a-main', location:'/repo/a'};
  catalog.changed('a', {source, branch:'confirmed-new', head:'confirmed-new-head', upstream:'origin/confirmed-new', readAt:'2026-10-15T10:00:01.000Z'});
  assert.equal(catalog.snapshot().data.repositories[0].worktrees[0].observedRevision, null);
  const full = catalog.refresh();
  reads[2].onProgress(inventory('a'), 'inventory');
  const failed = inventory('a'); failed.repositories[0].diagnostics = [{code:'code_source_control_refresh_failed',repositoryId:'a',message:'重读失败'}]; failed.diagnostics = failed.repositories[0].diagnostics;
  reads[2].onProgress(failed, 'repository'); reads[2].resolve(failed); await full;
  const actual = catalog.snapshot().data.repositories[0];
  assert.equal(actual.branch, 'confirmed-new'); assert.equal(actual.head, 'confirmed-new-head');
  assert.deepEqual(actual.source, source); assert.equal(actual.worktrees[0].worktreeId, 'a-main');
  assert.equal(actual.worktrees[0].branch, 'confirmed-new'); assert.equal(actual.worktrees[0].status, 'unavailable');
  assert.equal(actual.worktrees[0].fileCount, null); assert.equal(actual.worktrees[0].observedRevision, null);
  assert.deepEqual(actual.worktrees[0].changes, []); assert.equal(catalog.snapshot().repositoryErrors.a, '重读失败');
  reads[1].resolve(response(repository('a', 'old-main'))); await settle();
  assert.equal(catalog.snapshot().data.repositories[0].branch, 'confirmed-new'); catalog.dispose();
});

test('旧全量收束保护较新单库任务来源和选择元数据，移除旧关联并重算理由', async () => {
  const requests = [];
  const catalog = createSourceControlCatalog((repositoryId, signal, onProgress) => {const request = {...deferred(), repositoryId, signal, onProgress}; requests.push(request); return request.promise;});
  const scoped = (id, worktreeId) => {
    const item = repository(id); item.worktrees[0].worktreeId = worktreeId;
    return {...response(item), selectedRepositoryIds:[id], selectedWorktreeIds:[worktreeId], selectedWorktrees:[{repositoryId:id,worktreeId}], scopeReason:'旧任务范围'};
  };
  const initial = catalog.refresh(); requests[0].resolve(scoped('a', 'old-task')); await initial;
  const full = catalog.refresh(); requests[1].onProgress(inventory('a', 'b'), 'inventory');
  const partialA = catalog.refresh('a'), partialB = catalog.refresh('b');
  const valueA = scoped('a', 'new-task'); valueA.selectedRepositoryIds = []; valueA.selectedWorktreeIds = []; valueA.selectedWorktrees = [];
  requests[2].resolve(valueA); await partialA;
  requests[3].resolve(scoped('b', 'new-b-task')); await partialB;
  const outdated = scoped('a', 'old-task'); outdated.repositories.push(repository('b'));
  requests[1].resolve(outdated); await full;
  const actual = catalog.snapshot().data;
  assert.equal(actual.repositories.find(item => item.id === 'a').worktrees[0].worktreeId, 'new-task');
  assert.equal(actual.repositories.find(item => item.id === 'b').worktrees[0].worktreeId, 'new-b-task');
  assert.deepEqual(actual.selectedRepositoryIds, ['b']);
  assert.deepEqual(actual.selectedWorktrees, [{repositoryId:'b',worktreeId:'new-b-task'}]);
  assert.deepEqual(actual.selectedWorktreeIds, ['new-b-task']);
  assert.match(actual.scopeReason, /当前已确认范围预选 1 个检出/);
  catalog.dispose();
});

test('后端未取得Git身份而返回登记子目录时，失败只标陈旧而不丢已确认来源', async () => {
  let activeLoader = async () => response(repository('a', 'observed'));
  const catalog = createSourceControlCatalog((...args) => activeLoader(...args)); await catalog.refresh();
  const failed = inventory('a'); failed.repositories[0].location = '/repo/a/packages/service';
  failed.repositories[0].diagnostics = [{code:'code_repository_unavailable',repositoryId:'a',message:'本机目录或Git身份暂不可读取'}]; failed.diagnostics = failed.repositories[0].diagnostics;
  activeLoader = async () => failed; await catalog.refresh('a');
  const actual = catalog.snapshot().data.repositories[0];
  assert.equal(actual.location, '/repo/a'); assert.equal(actual.gitId, 'git-a'); assert.equal(actual.branch, 'observed');
  assert.deepEqual(actual.changes, [{path:'a.ts'}]); assert.equal(actual.status, 'unavailable');
  assert.ok(actual.diagnostics.some(item => item.code === 'code_repository_unavailable'));
  assert.ok(actual.diagnostics.some(item => item.code === 'code_source_control_stale'));
  catalog.dispose();
});
