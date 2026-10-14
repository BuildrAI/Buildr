import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';

registerHooks({resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/features/code/api/code-api.ts') && specifier === '../../../api') {
    return {url: 'data:text/javascript,export const api = (...args) => globalThis.__branchApi(...args);', shortCircuit: true};
  }
  return next(specifier, context);
}});
const {codeApi} = await import('../src/features/code/api/code-api.ts');
const {subscribeSourceControlChanges, currentSourceControlFetchResults} = await import('../src/features/code/source-control-events.ts');

test('历史条件和分页由真实客户端完整传到服务器，作者目录不依赖关键词', async () => {
  const requests = [];
  globalThis.__branchApi = async (...request) => {requests.push(request); return {};};
  const signal = new AbortController().signal;
  try {
    await codeApi.history('ws/id', {repositoryId: 'repo', worktreeId: 'main', branch: 'refs/remotes/origin/main', authorEmail: 'same+dev@example.com', query: '新任务', cursor: 'bound-cursor'}, signal);
    const [resource, options] = requests[0], url = new URL(resource, 'http://localhost');
    assert.equal(url.pathname, '/api/v1/workspaces/ws%2Fid/code/history');
    assert.equal(url.searchParams.get('branch'), 'refs/remotes/origin/main');
    assert.equal(url.searchParams.get('authorEmail'), 'same+dev@example.com');
    assert.equal(url.searchParams.get('query'), '新任务');
    assert.equal(url.searchParams.get('cursor'), 'bound-cursor');
    assert.equal(options.signal, signal);
    await codeApi.authors('ws/id', {repositoryId: 'repo', worktreeId: 'main', branch: 'refs/heads/dev'}, signal);
    const authorUrl = new URL(requests[1][0], 'http://localhost');
    assert.equal(authorUrl.searchParams.has('query'), false);
    assert.equal(authorUrl.searchParams.has('authorEmail'), false);
    assert.equal(authorUrl.searchParams.get('branch'), 'refs/heads/dev');
  } finally {delete globalThis.__branchApi;}
});

test('切换使用单独POST并绑定目标完整引用、目标提交和已观察版本', async () => {
  const requests = [];
  globalThis.__branchApi = async (...request) => {requests.push(request); return {};};
  const input = {repositoryId: 'repo', worktreeId: 'main', targetRef: 'refs/remotes/origin/feature/review', expectedTargetHash: 'f'.repeat(40), expectedRevision: 'observed-source', localName: 'review-other'};
  try {
    await codeApi.switchBranch('ws', input);
    assert.equal(requests[0][0], '/api/v1/workspaces/ws/code/branch-switch');
    assert.equal(requests[0][1].method, 'POST');
    assert.deepEqual(JSON.parse(requests[0][1].body), input);
    assert.equal(requests[0][1].signal, undefined, '关闭查看浮层不能冒充撤销已经发出的Git写入');
    await codeApi.branches('ws', {repositoryId: 'repo', worktreeId: 'main'});
    assert.equal(requests[1][1].method, undefined, '清单只通过既有只读请求读取');
  } finally {delete globalThis.__branchApi;}
});

test('写入完成通知当前订阅者，保留发起工作空间与准确来源，失败也重读', async () => {
  const input = {repositoryId:'repo', worktreeId:'main', targetRef:'refs/heads/new', expectedTargetHash:'a'.repeat(40), expectedRevision:'observed'};
  let finish;
  globalThis.__branchApi = () => new Promise(resolve => {finish = resolve;});
  const pending = codeApi.switchBranch('original-workspace', input), notices = [];
  const unsubscribe = subscribeSourceControlChanges(notice => notices.push(notice));
  const result = {source:{repositoryId:'repo', worktreeId:'main'}, branch:'new'};
  try {
    finish(result); assert.equal(await pending, result);
    assert.deepEqual(notices, [{workspaceId:'original-workspace', repositoryId:'repo', worktreeId:'main', result}]);
    const failure = new Error('read after write unavailable');
    globalThis.__branchApi = async () => {throw failure;};
    await assert.rejects(codeApi.switchBranch('original-workspace', input), error => error === failure);
    assert.deepEqual(notices[1], {workspaceId:'original-workspace', repositoryId:'repo', worktreeId:'main'});
    unsubscribe(); await assert.rejects(codeApi.switchBranch('original-workspace', input)); assert.equal(notices.length, 2);
  } finally {unsubscribe(); delete globalThis.__branchApi;}
});

test('单库观察绑定repositoryId，获取远程只提交已观察实例身份并通知新订阅页面', async () => {
  const requests = [], notices = []; let finish;
  globalThis.__branchApi = (...request) => { requests.push(request); return request[1]?.method === 'POST' ? new Promise(resolve => {finish = resolve;}) : Promise.resolve({}); };
  const input = {repositories:[{repositoryId:'a', expectedGitId:'git-a', expectedCheckoutId:'checkout-a'}, {repositoryId:'b', expectedGitId:null, expectedCheckoutId:null}]};
  try {
    await codeApi.sourceControl('ws/id', {repositoryId:'a'});
    assert.equal(new URL(requests[0][0], 'http://localhost').searchParams.get('repositoryId'), 'a');
    const pending = codeApi.fetch('ws/id', input);
    const unsubscribe = subscribeSourceControlChanges(notice => notices.push(notice));
    const result = {readAt:'now', repositories:[{repositoryId:'a', gitId:'git-a', status:'succeeded', message:'已获取', remotes:[{name:'origin', status:'succeeded', message:'已获取'}]}, {repositoryId:'b', gitId:null, status:'unavailable', message:'不可读取', remotes:[]}]};
    finish(result); assert.equal(await pending, result); unsubscribe();
    assert.equal(requests[1][0], '/api/v1/workspaces/ws%2Fid/code/fetch');
    assert.deepEqual(JSON.parse(requests[1][1].body), input); assert.equal(requests[1][1].signal, undefined);
    assert.deepEqual(notices.map(({fetchSequences, ...notice}) => notice), [{workspaceId:'ws/id', repositoryId:'a', repositoryIds:['a', 'b'], fetchResults:result.repositories}], '全部获取只通知一次，避免逐库重复严格来源发现');
    assert.equal(typeof notices[0].fetchSequences.a, 'number'); assert.equal(notices[0].fetchSequences.a, notices[0].fetchSequences.b);
  } finally {delete globalThis.__branchApi;}
});

test('获取请求失联逐库表达未知并重新观察，不重发写入', async () => {
  let requests = 0; const notices = [], unsubscribe = subscribeSourceControlChanges(notice => notices.push(notice));
  globalThis.__branchApi = async () => {requests++; throw new Error('connection lost');};
  try {
    const result = await codeApi.fetch('original', {repositories:[{repositoryId:'a', expectedGitId:'git-a', expectedCheckoutId:'checkout-a'}]});
    assert.equal(requests, 1); assert.equal(result.repositories[0].status, 'unknown');
    assert.match(result.repositories[0].message, /结果未知/);
    assert.deepEqual(notices.map(({fetchSequences, ...notice}) => notice), [{workspaceId:'original', repositoryId:'a', repositoryIds:['a'], fetchResults:result.repositories}]);
  } finally {unsubscribe(); delete globalThis.__branchApi;}
});

test('旧获取请求后返回仍通知重新观察，但不能回退新实例的较新结果反馈', async () => {
  const pending = [], notices = [];
  globalThis.__branchApi = () => new Promise(resolve => pending.push(resolve));
  const unsubscribe = subscribeSourceControlChanges(notice => notices.push(notice));
  const target = id => ({repositoryId:id, expectedGitId:'git-' + id, expectedCheckoutId:'checkout-' + id});
  const result = (id, status) => ({repositoryId:id, gitId:'git-' + id, status, message:status, remotes:[]});
  try {
    const old = codeApi.fetch('remounted-workspace', {repositories:[target('a'), target('b')]}), newer = codeApi.fetch('remounted-workspace', {repositories:[target('a')]});
    pending[1]({readAt:'newer', repositories:[result('a', 'succeeded')]}); await newer;
    assert.deepEqual(currentSourceControlFetchResults(notices[0]).map(item => [item.repositoryId, item.status]), [['a', 'succeeded']]);
    pending[0]({readAt:'old', repositories:[result('a', 'failed'), result('b', 'succeeded')]}); await old;
    assert.equal(notices.length, 2, '晚完成仍触发事实核对，不能静默丢弃可能发生的Git效果');
    assert.ok(notices[1].fetchSequences.a < notices[0].fetchSequences.a);
    assert.deepEqual(currentSourceControlFetchResults(notices[1]).map(item => item.repositoryId), ['b'], '批量旧结果只影响未被较新动作替代的代码库');
    const otherWorkspace = codeApi.fetch('another-workspace', {repositories:[target('a')]}); pending[2]({readAt:'other', repositories:[result('a', 'failed')]}); await otherWorkspace;
    assert.deepEqual(currentSourceControlFetchResults(notices[0]).map(item => item.status), ['succeeded'], '同名代码库在其他工作空间独立排序');
  } finally {unsubscribe(); delete globalThis.__branchApi;}
});

test('同步按原来源通知新页面，迟到结果不能覆盖较新动作或其他工作空间', async () => {
  const {isCurrentSourceControlSync} = await import('../src/features/code/source-control-events.ts');
  const pending = [], notices = [], requests = [];
  globalThis.__branchApi = (...request) => {requests.push(request); return new Promise(resolve => pending.push(resolve));};
  const input = {repositoryId:'repo', worktreeId:'tree', expectedRevision:'observed-sync'};
  const result = status => ({source:{repositoryId:'repo', worktreeId:'tree'}, status, message:status});
  const old = codeApi.sync('original-workspace', input), newer = codeApi.sync('original-workspace', input);
  const unsubscribe = subscribeSourceControlChanges(notice => notices.push(notice));
  try {
    pending[1](result('succeeded')); await newer;
    pending[0](result('failed')); await old;
    assert.deepEqual(notices.map(notice => [notice.workspaceId, notice.repositoryId, notice.worktreeId, isCurrentSourceControlSync(notice)]), [['original-workspace', 'repo', 'tree', true], ['original-workspace', 'repo', 'tree', false]]);
    assert.deepEqual(JSON.parse(requests[0][1].body), input); assert.equal(requests[0][1].signal, undefined, '已发同步写入不随发起页面撤销');
    const other = codeApi.sync('another-workspace', input); pending[2](result('failed')); await other;
    assert.equal(isCurrentSourceControlSync(notices[0]), true, '另一工作空间的同名来源不改变排序');
  } finally {unsubscribe(); delete globalThis.__branchApi;}
});

test('同步失联或来源不匹配只发布未知结果并核对原来源，不自动重发', async () => {
  const notices = [], unsubscribe = subscribeSourceControlChanges(notice => notices.push(notice)); let requests = 0;
  const input = {repositoryId:'repo', worktreeId:'tree', expectedRevision:'observed-sync'};
  globalThis.__branchApi = async () => {requests++; throw new Error('connection lost');};
  try {
    await assert.rejects(codeApi.sync('original-workspace', input), /connection lost/);
    assert.equal(requests, 1); assert.match(notices[0].syncError, /结果尚未确认/);
    assert.equal(notices[0].workspaceId, 'original-workspace'); assert.equal(notices[0].repositoryId, 'repo'); assert.equal(notices[0].worktreeId, 'tree');
    assert.equal(notices[0].syncResult, undefined);
    globalThis.__branchApi = async () => {requests++; return {source:{repositoryId:'other', worktreeId:'tree'}, status:'succeeded'};};
    await assert.rejects(codeApi.sync('original-workspace', input), /来源不匹配/);
    assert.equal(requests, 2); assert.equal(notices[1].syncResult, undefined); assert.match(notices[1].syncError, /来源不匹配/);
  } finally {unsubscribe(); delete globalThis.__branchApi;}
});
