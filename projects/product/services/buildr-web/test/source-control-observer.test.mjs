import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceControlObserver } from '../src/features/code/source-control-observer.ts';
import { createSourceControlRefreshLoader } from '../src/features/code/source-control-refresh.ts';

const deferred = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
const until = async condition => { const limit=Date.now()+1500; while(!condition()){assert.ok(Date.now()<limit,'异步观察应及时完成'); await new Promise(resolve=>setTimeout(resolve,5));} };
const repository = (id,revision='first') => ({id,name:id,branch:'main',gitId:'git-'+id,observedRevision:revision,worktreeCount:1,worktreeCoverage:{limit:128,total:1,read:1,truncated:false},diagnostics:[],worktrees:[{worktreeId:id+'-main',isRegistered:true,branch:'main',head:'head',readAt:'2026-10-15T10:00:00.000Z',observedRevision:revision,fileCount:1,changes:[],diagnostics:[],coverage:{fileLimit:1000,truncated:false}}]});
const response = (...repositories) => ({readAt:'2026-10-15T10:00:00.000Z',repositories,selectedRepositoryIds:repositories.map(item=>item.id),selectedWorktrees:[],scopeReason:'all',diagnostics:[],coverage:{limit:128,truncated:false,nextCursor:null},worktreeCoverage:{limit:128,total:repositories.length,read:repositories.length,truncated:false}});
function fixture(options = {}) {
  const requests=[],watches=[]; let receive,live=0,maximum=0;
  const observer=createSourceControlObserver({workspaceId:'workspace',debounceMs:5,retryMs:5,fallbackMs:60000,...options,
    subscribe:listener=>{receive=listener;return()=>{receive=undefined;};},
    load:(taskId,repositoryId,signal)=>{const pending=deferred(); live++;maximum=Math.max(maximum,live);requests.push({...pending,taskId,repositoryId,signal});return pending.promise.finally(()=>{live--;});},
    watch:(cursor,signal)=>{const pending=deferred();watches.push({...pending,cursor,signal});signal.addEventListener('abort',()=>pending.reject(Error('aborted')),{once:true});return pending.promise;},
  });
  return {observer,requests,watches,maximum:()=>maximum,notice:notice=>receive?.({workspaceId:'workspace',...notice})};
}

test('缓存恢复后被动激活合并在途核对，变化仍保留一次后续检查', async () => {
  const saved = [], initial = response(repository('a'), repository('b'));
  const f = fixture({cache:{read:() => initial, write:data => saved.push(data)}});
  try {
    assert.equal(f.observer.catalog().snapshot().data, initial);
    assert.deepEqual(f.observer.catalog().snapshot().cachedRepositoryIds, ['a', 'b']);
    f.observer.start();
    await until(() => f.requests.length === 1);
    for (let index = 0; index < 5; index++) f.observer.reconcile();
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].signal.aborted, false);
    f.notice({repositoryId:'a', cause:'file-save'});
    await until(() => f.requests.length === 2);
    assert.equal(f.requests[1].repositoryId, 'a');
    f.requests[1].resolve(response(repository('a', 'updated')));
    f.requests[0].resolve(initial);
    await until(() => f.observer.catalog().snapshot().selectionReady);
    assert.equal(f.observer.catalog().snapshot().data.repositories[0].observedRevision, 'updated');
  } finally {f.observer.dispose();}
  assert.equal(saved.length, 1, '退出时合并保存最终已核对快照');
  assert.equal(saved[0].repositories[0].observedRevision, 'updated');
});

test('失败保留的文件不以新读取时间覆盖已保存快照', async () => {
  const saved = [], initial = response(repository('a'));
  const f = fixture({cache:{read:() => null, write:data => saved.push(data)}});
  try {
    f.observer.start(); await until(() => f.requests.length === 1);
    f.requests[0].resolve(initial); await until(() => saved.length === 1);
    const manual = f.observer.refresh();
    const before = repository('a');
    const failed = {...before, status:'unavailable', worktreeCount:null, worktrees:[], gitId:null, source:null, diagnostics:[{code:'code_source_control_refresh_failed', repositoryId:'a', message:'离线'}]};
    f.requests[1].resolve({...response(failed), readAt:'2026-10-15T10:01:00.000Z'}); await manual;
    assert.equal(f.observer.catalog().snapshot().data.repositories[0].status, 'unavailable');
  } finally {f.observer.dispose();}
  assert.equal(saved.length, 1, '失败保留不能再次写入持久缓存');
  assert.equal(saved[0].readAt, initial.readAt, '失败保留不能续新持久缓存的观察时间');
});

test('initial background scan yields to the page and watch initialization cannot bypass the delay', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const f=fixture({initialDelayMs:750});
  try {
    f.observer.start();
    f.watches[0].resolve({cursor:'epoch:1',repositoryIds:[],refreshAll:true});
    await Promise.resolve(); await Promise.resolve();
    t.mock.timers.tick(749);
    assert.equal(f.requests.length,0);
    t.mock.timers.tick(1);
    assert.equal(f.requests.length,1);
    f.requests[0].resolve(response(repository('a')));
  } finally {f.observer.dispose();}
});

test('disposal cancels the deferred scan and observation', t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const f=fixture({initialDelayMs:60000});
  f.observer.start();
  assert.equal(f.requests.length,0);
  f.observer.dispose();
  t.mock.timers.tick(60000);
  assert.equal(f.watches[0].signal.aborted,true);
  assert.equal(f.requests.length,0);
});

test('a code view retained before or after shell startup does not wait for background initialization', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  for(const before of [true,false]) {
    const f=fixture({initialDelayMs:750});let release;
    try {
      if(before)release=f.observer.retain();
      f.observer.start();
      if(!before)release=f.observer.retain();
      t.mock.timers.tick(5);
      assert.equal(f.requests.length,1);
      f.requests[0].resolve(response(repository('a')));
    } finally {release?.();f.observer.dispose();}
  }
});
async function initialized() {
  const value=fixture();value.observer.start();
  value.watches[0].resolve({cursor:'epoch:1',repositoryIds:[],refreshAll:true});
  await until(()=>value.requests.length===1);value.requests[0].resolve(response(repository('a'),repository('b'),repository('c')));
  await until(()=>Boolean(value.observer.catalog().snapshot().data));return value;
}

test('事件风暴按库合并、最多两库并发；同库读取中变更排队一次且不反复取消', async()=>{
  const f=await initialized();
  try {
    for(let index=0;index<30;index++)for(const repositoryId of ['a','b','c'])f.notice({repositoryId,cause:'file-save'});
    await until(()=>f.requests.length===3);
    assert.deepEqual(f.requests.slice(1).map(item=>item.repositoryId),['a','b']);
    for(let index=0;index<30;index++)f.notice({repositoryId:'a',cause:'file-save'});
    await new Promise(resolve=>setTimeout(resolve,15));
    assert.equal(f.requests.length,3);assert.equal(f.requests[1].signal.aborted,false);
    f.requests[1].resolve(response(repository('a','changed')));await until(()=>f.requests.length===4);
    assert.equal(f.requests[3].repositoryId,'c');
    f.requests[2].resolve(response(repository('b')));await until(()=>f.requests.length===5);
    assert.equal(f.requests[4].repositoryId,'a');assert.equal(f.maximum(),2);
    f.requests[3].resolve(response(repository('c')));f.requests[4].resolve(response(repository('a','latest')));
    await until(()=>f.observer.catalog().snapshot().data.repositories[0].observedRevision==='latest');
    assert.equal(f.requests.length,5);
  } finally {f.observer.dispose();}
});

test('隐藏时暂停观察，恢复补查并使用已有游标；重连后保持已有数据与去重版本', async()=>{
  const f=await initialized();
  try {
    const before=f.observer.catalog().snapshot(),version=before.versions.a;
    f.observer.setVisible(false);assert.equal(f.watches[1].signal.aborted,true);
    f.notice({repositoryId:'a',cause:'file-save'});await new Promise(resolve=>setTimeout(resolve,15));assert.equal(f.requests.length,1);
    f.observer.setVisible(true);await until(()=>f.watches.length===3&&f.requests.length===2);
    assert.equal(f.watches[2].cursor,'epoch:1');assert.equal(f.requests[1].repositoryId,undefined);
    f.requests[1].resolve(response(repository('a'),repository('b'),repository('c')));await until(()=>!f.requests[1].signal.aborted&&f.observer.catalog().snapshot().data!==before.data);
    assert.equal(f.observer.catalog().snapshot().versions.a,version);
    f.watches[2].reject(Error('offline'));await until(()=>f.observer.snapshot().diagnostics.length>0);
    assert.equal(f.observer.catalog().snapshot().data.repositories[0].id,'a');
    await until(()=>f.watches.length===4);f.watches[3].resolve({cursor:'epoch:2',repositoryIds:[],refreshAll:false});
    await until(()=>f.requests.length===3);assert.equal(f.requests[2].repositoryId,undefined);assert.deepEqual(f.observer.snapshot().diagnostics,[]);
  } finally {f.observer.dispose();}
});

test('任务仅首次独立预选，之后共享默认观察；文件保存不使引用失效，引用事件单独失效',async()=>{
  const f=await initialized();let release;
  try {
    release=f.observer.retain('task-one');await until(()=>f.requests.length===2);
    assert.equal(f.requests[1].taskId,'task-one');
    f.requests[1].resolve({...response(repository('a'),repository('b'),repository('c')),selectedRepositoryIds:['b'],selectedWorktrees:[{repositoryId:'b',worktreeId:'b-main'}],scopeReason:'task'});
    await until(()=>Boolean(f.observer.catalog('task-one').snapshot().data));
    const refs=f.observer.catalog().snapshot().refsVersions.a;
    f.notice({repositoryId:'a',cause:'file-save'});await until(()=>f.requests.length===3);
    assert.equal(f.requests[2].taskId,undefined);assert.equal(f.requests[2].repositoryId,'a');
    f.requests[2].resolve({...response(repository('a','edited')),readAt:'2026-10-15T10:00:01.000Z'});
    await until(()=>f.observer.catalog('task-one').snapshot().data.repositories[0].observedRevision==='edited');
    assert.equal(f.observer.catalog().snapshot().refsVersions.a,refs);
    assert.deepEqual(f.observer.catalog('task-one').snapshot().data.selectedRepositoryIds,['b']);
    f.watches[1].resolve({cursor:'epoch:2',repositoryIds:['a'],refsRepositoryIds:['a'],refreshAll:false});
    await until(()=>f.requests.length===4);assert.notEqual(f.observer.catalog().snapshot().refsVersions.a,refs);
    assert.equal(f.requests[3].taskId,undefined);assert.equal(f.requests.length,4);
  } finally {release?.();f.observer.dispose();}
});

test('切换已确认后立即采用新分支，旧在途响应及后读失败都不能恢复旧改动',async()=>{
  const f=await initialized();
  try {
    f.notice({repositoryId:'a',cause:'file-save'});await until(()=>f.requests.length===2);
    const oldRequest=f.requests[1];
    f.notice({repositoryId:'a',result:{source:{repositoryId:'a',worktreeId:'a-main'},branch:'feature/new',head:'new-head',upstream:'origin/feature/new',readAt:'2026-10-15T10:00:01.000Z'}});
    const confirmed=f.observer.catalog().snapshot().data.repositories[0].worktrees[0];
    assert.equal(confirmed.branch,'feature/new');assert.equal(confirmed.head,'new-head');
    assert.equal(confirmed.observedRevision,null);assert.deepEqual(confirmed.changes,[]);assert.equal(confirmed.fileCount,null);
    assert.equal(oldRequest.signal.aborted,true);assert.equal(f.requests.length,2,'确认写入只采用事实，后读仍经合并队列');
    oldRequest.resolve(response(repository('a','old-response')));await until(()=>f.requests.length===3);
    assert.equal(f.observer.catalog().snapshot().data.repositories[0].worktrees[0].branch,'feature/new');
    f.requests[2].reject(Error('后续读取不可用'));await until(()=>Boolean(f.observer.catalog().snapshot().repositoryErrors.a));
    const failed=f.observer.catalog().snapshot().data.repositories[0].worktrees[0];
    assert.equal(failed.branch,'feature/new');assert.deepEqual(failed.changes,[]);assert.equal(failed.fileCount,null);
  } finally {f.observer.dispose();}
});

test('显式批量操作只排一次全目录观察，引用失效仍限定明确代码库',async()=>{
  const f=await initialized();
  try {
    const before=f.observer.catalog().snapshot();
    f.notice({repositoryId:'a',repositoryIds:['a','b']});
    await until(()=>f.requests.length===2);
    assert.equal(f.requests[1].repositoryId,undefined);
    assert.notEqual(f.observer.catalog().snapshot().refsVersions.a,before.refsVersions.a);
    assert.notEqual(f.observer.catalog().snapshot().refsVersions.b,before.refsVersions.b);
    assert.equal(f.observer.catalog().snapshot().refsVersions.c,before.refsVersions.c);
    f.requests[1].resolve(response(repository('a'),repository('b'),repository('c')));
    await new Promise(resolve=>setTimeout(resolve,15));
    assert.equal(f.requests.length,2);assert.equal(f.observer.catalog().snapshot().versions.c,before.versions.c);
  } finally {f.observer.dispose();}
});

test('共享observer透传渐进结果，慢库全量等待期间快库再次保存仍能局部完成且旧全量不回滚',async()=>{
  const requests=[],inventories=[];let receive;
  const inventory={...response(repository('slow'),repository('fast')),selectedWorktreeIds:[],selectedWorktrees:[]};
  inventory.repositories=inventory.repositories.map(item=>({...item,status:'unavailable',worktrees:[],worktreeCount:null,diagnostics:[{code:'code_source_control_pending',repositoryId:item.id,message:'waiting'}]}));
  const loader=createSourceControlRefreshLoader({inventory:async()=>{inventories.push(true);return inventory;},repository:(repositoryId,signal)=>{const pending=deferred();requests.push({...pending,repositoryId,signal});return pending.promise;}});
  const observer=createSourceControlObserver({workspaceId:'workspace',debounceMs:1,fallbackMs:60000,subscribe:listener=>{receive=listener;return()=>{};},load:(_task,id,signal,progress)=>loader(id,signal,progress),watch:(_cursor,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('abort')),{once:true}))});
  try {
    observer.start();await until(()=>requests.length===2);observer.retain();observer.reconcile();
    assert.equal(observer.catalog().snapshot().loading,false);assert.equal(observer.catalog().snapshot().selectionReady,false);assert.equal(observer.catalog().snapshot().data.repositories.length,2);
    requests.find(item=>item.repositoryId==='fast').resolve({...response(repository('fast','first')),selectedWorktreeIds:[]});
    await until(()=>observer.catalog().snapshot().data.repositories[1].observedRevision==='first');
    receive({workspaceId:'workspace',repositoryId:'fast',cause:'file-save'});await until(()=>requests.length===3);
    assert.equal(requests[2].repositoryId,'fast');assert.equal(requests[0].signal.aborted,false);
    requests[2].resolve({...response(repository('fast','saved-again')),selectedWorktreeIds:[]});
    await until(()=>observer.catalog().snapshot().data.repositories[1].observedRevision==='saved-again');
    assert.equal(observer.catalog().snapshot().selectionReady,false,'慢库仍等待，但快库局部结果已发布');
    requests[0].resolve({...response(repository('slow','finished')),selectedWorktreeIds:[]});
    await until(()=>observer.catalog().snapshot().selectionReady);
    assert.equal(observer.catalog().snapshot().data.repositories[1].observedRevision,'saved-again');assert.equal(inventories.length,1,'retain和focus不复制首轮清单');
  } finally {observer.dispose();}
});

test('工作空间和任务两批full都等待慢库时仍保留有界local名额，新快库事实不被任一旧full回滚',async()=>{
  const requests=[],inventories=[];let receive;
  const result=(taskId,id,revision)=>({...response(repository(id,revision)),selectedWorktreeIds:[],selectedRepositoryIds:taskId?(id==='fast'?['fast']:[]):[id],selectedWorktrees:taskId&&id==='fast'?[{repositoryId:'fast',worktreeId:'fast-main'}]:[]});
  const observer=createSourceControlObserver({workspaceId:'workspace',debounceMs:1,fallbackMs:60000,subscribe:listener=>{receive=listener;return()=>{};},
    load:(taskId,id,signal,progress)=>createSourceControlRefreshLoader({
      inventory:async()=>{
        inventories.push(taskId);
        const value={...response(repository('slow'),repository('fast')),selectedWorktreeIds:[],selectedRepositoryIds:taskId?['fast']:['slow','fast']};
        return {...value,repositories:value.repositories.map(item=>({...item,status:'unavailable',worktrees:[],worktreeCount:null,diagnostics:[{code:'code_source_control_pending',repositoryId:item.id,message:'waiting'}]}))};
      },
      repository:(repositoryId,readSignal)=>{const pending=deferred();requests.push({...pending,taskId,repositoryId,signal:readSignal});return pending.promise;},
    })(id,signal,progress),
    watch:(_cursor,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('abort')),{once:true})),
  });
  const release=observer.retain('task');
  try {
    observer.start();await until(()=>requests.length===4);
    assert.deepEqual(inventories.sort(),[undefined,'task'].sort());
    for(const request of requests.filter(item=>item.repositoryId==='fast'))request.resolve(result(request.taskId,'fast','first'));
    await until(()=>[undefined,'task'].every(scope=>observer.catalog(scope).snapshot().data.repositories[1].observedRevision==='first'));
    for(let index=0;index<20;index++)receive({workspaceId:'workspace',repositoryId:'fast',cause:'file-save'});
    await until(()=>requests.length===5);assert.equal(requests[4].taskId,undefined);assert.equal(requests[4].repositoryId,'fast');
    assert.ok(requests.filter(item=>item.repositoryId==='slow').every(item=>!item.signal.aborted));
    requests[4].resolve(result(undefined,'fast','saved-while-both-slow'));
    await until(()=>observer.catalog().snapshot().data.repositories[1].observedRevision==='saved-while-both-slow');
    assert.equal(observer.catalog().snapshot().selectionReady,false);assert.equal(observer.catalog('task').snapshot().selectionReady,false);
    assert.equal(requests.length,5,'重复保存只占一个合并local名额，没有无限派发');
    for(const request of requests.filter(item=>item.repositoryId==='slow'))request.resolve(result(request.taskId,'slow','finished'));
    await until(()=>[undefined,'task'].every(scope=>observer.catalog(scope).snapshot().selectionReady&&observer.catalog(scope).snapshot().data.repositories[1].observedRevision==='saved-while-both-slow'));
    assert.deepEqual(observer.catalog('task').snapshot().data.selectedWorktrees,[{repositoryId:'fast',worktreeId:'fast-main'}]);assert.equal(inventories.length,2);
  } finally {release();observer.dispose();}
});
