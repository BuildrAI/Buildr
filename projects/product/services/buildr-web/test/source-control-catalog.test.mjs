import assert from 'node:assert/strict';
import test from 'node:test';
import {createSourceControlCatalog} from '../src/features/code/source-control-catalog.ts';

const repository = (id, branch = 'main', readAt = '2026-10-13T10:00:00.000Z') => ({id, name:id, branch, gitId:'git-' + id, source:{checkoutId:'checkout-' + id}, diagnostics:[], worktreeCount:1, worktreeCoverage:{limit:128,total:1,read:1,truncated:false}, worktrees:[{worktreeId:id + '-main', isRegistered:true, branch, head:branch, readAt, coverage:{fileLimit:1000, truncated:false}}]});
const response = (...repositories) => ({readAt:'2026-10-13T10:00:00.000Z', repositories, selectedRepositoryIds:repositories.map(item => item.id), selectedWorktrees:[], scopeReason:'all', diagnostics:[], coverage:{limit:128,truncated:false,nextCursor:null}, worktreeCoverage:{limit:128,total:repositories.length,read:repositories.length,truncated:false}});
const setup = async () => {
  const requests = [];
  const catalog = createSourceControlCatalog((repositoryId, signal) => new Promise((resolve, reject) => requests.push({repositoryId, signal, resolve, reject})));
  const initial = catalog.refresh(); requests[0].resolve(response(repository('a'), repository('b'))); await initial;
  return {catalog, requests};
};

test('静默首次核对共享在途清单，渐进骨架与首个完成库都不提前确认任务预选',async()=>{
  const requests=[];
  const catalog=createSourceControlCatalog((repositoryId,signal,onProgress)=>new Promise(resolve=>requests.push({repositoryId,signal,onProgress,resolve})));
  const initial=catalog.check(),same=catalog.check('a');assert.equal(initial,same);assert.equal(requests.length,1);
  const inventory={...response({...repository('a'),worktrees:[],diagnostics:[{code:'code_source_control_pending',repositoryId:'a',message:'等待'}]}),selectedRepositoryIds:['a'],selectedWorktrees:[],selectedWorktreeIds:[]};
  requests[0].onProgress(inventory,'inventory');
  assert.equal(catalog.snapshot().loading,false);assert.equal(catalog.snapshot().selectionReady,false);assert.deepEqual(catalog.snapshot().versions,{});
  requests[0].onProgress({...response(repository('a')),selectedWorktrees:[{repositoryId:'a',worktreeId:'a-main'}]},'repository');
  assert.equal(catalog.snapshot().selectionReady,false);
  requests[0].resolve({...response(repository('a')),selectedWorktrees:[{repositoryId:'a',worktreeId:'a-main'}]});await initial;
  assert.equal(catalog.snapshot().selectionReady,true);catalog.dispose();
});

test('任务初轮预选未确认时不采用默认目录的空范围，完成后共享数据仍保留任务选择',async()=>{
  let finish,progress;
  const scoped=createSourceControlCatalog((_id,_signal,onProgress)=>{progress=onProgress;return new Promise(resolve=>{finish=resolve;});});
  const initial=scoped.check();progress({...response(repository('a'),repository('b')),selectedRepositoryIds:['b'],selectedWorktrees:[]},'inventory');
  const plain=createSourceControlCatalog(async()=>response(repository('a'),repository('b')));await plain.check();
  scoped.adopt(plain.snapshot());assert.equal(scoped.snapshot().selectionReady,false);assert.deepEqual(scoped.snapshot().data.selectedRepositoryIds,['b']);
  finish({...response(repository('a'),repository('b')),selectedRepositoryIds:['b'],selectedWorktrees:[{repositoryId:'b',worktreeId:'b-main'}]});await initial;
  scoped.adopt(plain.snapshot());assert.equal(scoped.snapshot().selectionReady,true);assert.deepEqual(scoped.snapshot().data.selectedWorktrees,[{repositoryId:'b',worktreeId:'b-main'}]);
  scoped.dispose();plain.dispose();
});

test('任务已确认来源不被共享渐进骨架清空，真实失败仍保留准确来源并标陈旧',async()=>{
  const before={...repository('a'),status:'complete',location:'/actual/a',diagnostics:[]};
  const scoped=createSourceControlCatalog(async()=>({...response(before),selectedRepositoryIds:['a'],selectedWorktrees:[{repositoryId:'a',worktreeId:'a-main'}]}));await scoped.check();
  let finish,progress;
  const plain=createSourceControlCatalog((_id,_signal,onProgress)=>{progress=onProgress;return new Promise(resolve=>{finish=resolve;});});const initial=plain.check();
  const waiting={...before,status:'unavailable',gitId:null,source:null,location:'/declared/a',worktrees:[],worktreeCount:null,diagnostics:[{code:'code_source_control_pending',repositoryId:'a',message:'尚未读取'}]};
  progress(response(waiting),'inventory');const versions=scoped.snapshot().versions;scoped.adopt(plain.snapshot());
  assert.equal(scoped.snapshot().data.repositories[0],before);assert.deepEqual(scoped.snapshot().versions,versions);assert.equal(scoped.snapshot().selectionReady,true);
  assert.deepEqual(scoped.snapshot().data.selectedWorktrees,[{repositoryId:'a',worktreeId:'a-main'}]);
  const failed={...waiting,diagnostics:[{code:'code_source_control_refresh_failed',repositoryId:'a',message:'读失败'}]};finish(response(failed));await initial;scoped.adopt(plain.snapshot());
  const retained=scoped.snapshot().data.repositories[0];assert.equal(retained.worktrees[0].worktreeId,'a-main');assert.equal(retained.location,'/actual/a');assert.equal(retained.status,'unavailable');assert.ok(retained.worktrees[0].diagnostics.some(item=>item.code==='code_source_control_stale'));
  scoped.dispose();plain.dispose();
});

test('局部刷新不产生空错误，重试保留真实失败直到成功确认', async () => {
  const {catalog, requests} = await setup(), before = catalog.snapshot().data;
  const first = catalog.refresh('a');
  assert.deepEqual(catalog.snapshot().repositoryErrors, {});
  requests[1].reject(new Error('工作树暂时离线')); await first;
  const retry = catalog.refresh('a');
  assert.equal(catalog.snapshot().repositoryErrors.a, '工作树暂时离线');
  assert.equal(catalog.snapshot().data, before);
  requests[2].resolve(response(repository('a'))); await retry;
  assert.deepEqual(catalog.snapshot().repositoryErrors, {});
  catalog.dispose();
});

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

test('自动核对忽略读取时间，正文和引用版本独立；显式刷新仍强制重读', async () => {
  const {catalog, requests} = await setup();
  const first = catalog.snapshot(), versionA = first.versions.a, refsA = first.refsVersions.a;
  const unchanged = catalog.check();
  requests[1].resolve({...response(repository('a', 'main', '2026-10-13T10:01:00.000Z'), repository('b')), readAt:'2026-10-13T10:01:00.000Z'}); await unchanged;
  assert.equal(catalog.snapshot().versions.a, versionA); assert.equal(catalog.snapshot().refsVersions.a, refsA);
  const content = catalog.check('a'), changed = repository('a'); changed.worktrees[0].observedRevision = 'new-content';
  requests[2].resolve(response(changed)); await content;
  assert.notEqual(catalog.snapshot().versions.a, versionA); assert.equal(catalog.snapshot().refsVersions.a, refsA);
  const contentVersion = catalog.snapshot().versions.a, forced = catalog.refresh('a');
  requests[3].resolve(response(changed)); await forced;
  assert.notEqual(catalog.snapshot().versions.a, contentVersion); assert.notEqual(catalog.snapshot().refsVersions.a, refsA);
  catalog.dispose();
});

test('任务选择消费共享观察且同步失败诊断，不重复失效相同正文', async () => {
  const {catalog:shared, requests} = await setup();
  const scoped = createSourceControlCatalog(async () => ({...response(repository('a'), repository('b')), selectedRepositoryIds:['b'], selectedWorktrees:[{repositoryId:'b',worktreeId:'b-main'}], scopeReason:'task'}));
  await scoped.refresh(); scoped.adopt(shared.snapshot());
  const version = scoped.snapshot().versions.a;
  shared.invalidateRefs(['a']); scoped.adopt(shared.snapshot());
  const failed = shared.check('a'); requests[1].reject(Error('暂不可读取')); await failed;
  scoped.adopt(shared.snapshot());
  assert.equal(scoped.snapshot().repositoryErrors.a, '暂不可读取'); assert.equal(scoped.snapshot().versions.a, version);
  assert.deepEqual(scoped.snapshot().data.selectedRepositoryIds,['b']); assert.equal(scoped.snapshot().data.scopeReason,'task');
  const changed = shared.check('a'); requests[2].resolve({...response(repository('a','new')),readAt:'2026-10-13T10:01:00.000Z'}); await changed;
  scoped.adopt(shared.snapshot());
  assert.equal(scoped.snapshot().data.repositories[0].branch,'new'); assert.equal(scoped.snapshot().repositoryErrors.a,undefined);
  assert.deepEqual(scoped.snapshot().data.selectedWorktrees,[{repositoryId:'b',worktreeId:'b-main'}]);
  shared.dispose(); scoped.dispose();
});

test('同身份工作树状态读取失败保留已知改动并明确过期，权威移除和身份改变不保留',async()=>{
  const requests=[],catalog=createSourceControlCatalog((repositoryId,signal)=>new Promise(resolve=>requests.push({repositoryId,signal,resolve})));
  const ready=repository('a');Object.assign(ready,{location:'/repo/a',status:'complete',diagnostics:[],fileCount:1,observedRevision:'known'});
  Object.assign(ready.worktrees[0],{location:'/repo/a',status:'complete',available:true,source:{repositoryId:'a',location:'/repo/a'},observedRevision:'known',fileCount:1,changes:[{path:'dirty.ts',status:'modified'}],diagnostics:[]});
  const first=catalog.check();requests[0].resolve(response(ready));await first;
  const unavailable={...ready,status:'unavailable',fileCount:null,changes:[],observedRevision:null,source:null,worktrees:[{...ready.worktrees[0],status:'unavailable',available:false,fileCount:null,changes:[],observedRevision:null,source:null,diagnostics:[{code:'locked',message:'暂不可读'}]}]};
  const failed=catalog.check('a');requests[1].resolve(response(unavailable));await failed;
  const retained=catalog.snapshot().data.repositories[0];
  assert.equal(retained.status,'unavailable');assert.equal(retained.worktrees[0].status,'unavailable');assert.equal(retained.worktrees[0].fileCount,1);
  assert.deepEqual(retained.worktrees[0].changes,ready.worktrees[0].changes);assert.equal(retained.worktrees[0].observedRevision,'known');
  assert.ok(catalog.snapshot().data.diagnostics.some(item=>/更新失败，保留上次读取结果/.test(item.message)));
  const missing={...unavailable,gitId:null,worktreeCount:null,worktrees:[]};
  const absent=catalog.check('a');requests[2].resolve(response(missing));await absent;
  assert.equal(catalog.snapshot().data.repositories[0].worktrees[0].fileCount,1,'根目录暂不可访问时显示上次来源，仍明确不可用');
  assert.equal(catalog.snapshot().data.repositories[0].worktrees[0].status,'unavailable');
  const stillAbsent=catalog.check('a');requests[3].resolve(response(missing));await stillAbsent;
  assert.equal(catalog.snapshot().data.repositories[0].worktrees[0].fileCount,1,'重复失败不会丢失上次来源身份');
  const removed=catalog.check('a');requests[4].resolve(response({...ready,worktrees:[],worktreeCount:0,fileCount:0,changes:[]}));await removed;
  assert.equal(catalog.snapshot().data.repositories[0].worktrees.length,0);
  const recovered=catalog.check('a');requests[5].resolve(response(ready));await recovered;
  const different=catalog.check('a');requests[6].resolve(response({...unavailable,gitId:'different-git'}));await different;
  assert.deepEqual(catalog.snapshot().data.repositories[0].worktrees[0].changes,[]);
  catalog.dispose();
});
