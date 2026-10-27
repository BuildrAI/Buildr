import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceControlActions, actionSourceKey, commitMessageOutput, commitResultFeedback } from '../src/features/code/source-control-actions.ts';

const source = {workspaceId: 'w', repositoryId: 'repo', worktreeId: 'checkout-a', branch: 'dev'};
const other = {...source, worktreeId: 'checkout-b', branch: 'feature'};
const identity = value => ({repositoryId: value.repositoryId, checkoutId: value.worktreeId, worktreeId: value.worktreeId, worktreeGroupId: 'main', taskId: null, commitHash: null, location: '/fixture/' + value.worktreeId, version: 'current', kind: 'default'});
const context = (value, revision = 'content-1') => ({source: identity(value), revision, head: 'a'.repeat(40), branch: value.branch, hasChanges: true, fileCount: 2, push: {revision: 'push-1', target: 'origin/dev', available: true, reason: null, ahead: 2}});
const selection={id:JSON.stringify(['account','model']),label:'Model',modelAccountId:'account',modelId:'model',accountIdentity:'identity',accountRevision:'v1'};
const run=(status='succeeded',output={commitMessage:'generated'},modelId='model')=>({id:'run-1',modelAccountId:'account',modelId,label:'Model',accountRevision:'v1',status,output,error:null});
const result = (value = source, pushStatus = 'not-requested') => ({source: identity(value), commit: {completed: true, hash: 'b'.repeat(40), message: 'submitted', status: 'succeeded'}, push: {status: pushStatus, target: 'origin/dev', message: pushStatus, retry: pushStatus === 'failed' ? {expectedHead: 'b'.repeat(40), expectedPushRevision: 'push-after-commit'} : null}, sync: null, effects: {indexUpdated: true, warnings: []}});
const syncResult = (value = source, status = 'succeeded') => ({...result(value), sync: {source: identity(value), readAt: '2026-10-16T00:00:00.000Z', branch: value.branch, head: 'c'.repeat(40), upstream: 'origin/dev', status, message: '同步阶段说明', fetch: {status: 'succeeded', message: '已获取固定上游'}, rebase: {status: 'succeeded', message: '已整合远端更新'}, push: {status: status === 'succeeded' ? 'succeeded' : 'not-requested', message: '同步内的推送说明'}}});
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const client = (overrides = {}) => ({context: async value => context(value), generate: async () => run(), run: async () => run(), cancel: async () => run('cancelled', null), commit: async value => result(value), push: async value => result(value, 'succeeded'), ...overrides});
const create = (api, refresh = () => {}) => new SourceControlActions(api, refresh, () => {}, async () => {});

test('来源键同时区分工作空间、代码库、工作树与分支，结构化输出拒绝缺失或空说明', () => {
  for (const next of [{...source, workspaceId: 'other'}, {...source, repositoryId: 'other'}, other, {...source, branch: 'other'}]) assert.notEqual(actionSourceKey(next), actionSourceKey(source));
  for (const value of [null, {}, {commitMessage: ' '}, {commitMessage: 2}, 'text']) assert.equal(commitMessageOutput(value), null);
  assert.equal(commitMessageOutput({commitMessage: 'subject\n\nbody'}), 'subject\n\nbody');
});

test('来源切换保留独立草稿，迟到生成只写原来源并固定执行者', async () => {
  const start = deferred(), calls = [], actions = create(client({generate: (...args) => {calls.push(args); return start.promise;}}));
  await Promise.all([actions.observe(source), actions.observe(other)]);
  actions.setText(source, 'original'); actions.setText(other, 'other draft');
  const pending = actions.generate(source, selection);
  assert.equal(actions.state(source).generation.modelKey, selection.id);
  start.resolve(run()); await pending;
  assert.equal(actions.state(source).text, 'generated'); assert.equal(actions.state(source).generatedBy.modelKey, selection.id);
  assert.equal(actions.state(other).text, 'other draft'); assert.equal(calls[0][2], selection);
});

test('取消先于开始响应仍发送取消，迟到成功不覆盖原草稿', async () => {
  const start = deferred(), cancelled = [], actions = create(client({generate: () => start.promise, cancel: async (source,id) => {cancelled.push([source,id]); return run('cancelled', null);}}));
  await actions.observe(source); actions.setText(source, 'edited');
  const pending = actions.generate(source, selection); await actions.cancel(source);
  start.resolve(run('running', null)); await pending;
  assert.deepEqual(cancelled, [[source,'run-1']]); assert.equal(actions.state(source).text, 'edited'); assert.equal(actions.state(source).generation, null);
});

test('生成来源固定本次账号和模型，其他来源的模型不覆盖旧结果', async()=>{
 const actions=create(client());await actions.observe(source);await actions.generate(source,selection);
 assert.equal(actions.state(source).generatedBy.modelId,'model');
 const mismatch=create(client({generate:async()=>run('succeeded',{commitMessage:'wrong'},'other-model')}));
 await mismatch.observe(source);mismatch.setText(source,'keep');await mismatch.generate(source,selection);
 assert.equal(mismatch.state(source).text,'keep');assert.match(mismatch.state(source).generationError,/不一致/);
});

test('生成期间的新草稿与失败结果都不被覆盖；内容漂移保留说明', async () => {
  const start = deferred(), actions = create(client({generate: () => start.promise}));
  await actions.observe(source); actions.setText(source, 'old'); const pending = actions.generate(source, selection);
  actions.setText(source, 'new edit'); start.resolve(run()); await pending; assert.equal(actions.state(source).text, 'new edit');
  const failed = create(client({generate: async () => ({...run('failed', null), error: {code: 'code_source_changed', message: '内容变化'}})}));
  await failed.observe(source); failed.setText(source, 'keep'); await failed.generate(source, selection);
  assert.equal(failed.state(source).text, 'keep'); assert.equal(failed.state(source).stale, true);
});

test('手写提交不调用智能体，清除的仅是提交时说明并刷新真实读取', async () => {
  let writes = 0, refreshes = 0;
  const actions = create(client({generate: async () => {throw Error('must not call agent');}, commit: async value => {writes++; return result(value);}}), () => {refreshes++;});
  await actions.observe(source); actions.setText(source, 'manual'); actions.setText(other, 'keep other'); await actions.commit(source, 'commit');
  assert.equal(writes, 1); assert.equal(refreshes, 1); assert.equal(actions.state(source).text, ''); assert.equal(actions.state(other).text, 'keep other');
  assert.equal(actions.state(source).gitResult.commit.hash, 'b'.repeat(40));
});

test('三种提交入口共用最新就绪状态，执行期间不能切换动作重复写入', async () => {
  for (const mode of ['commit', 'commit-sync', 'commit-push']) {
    const write = deferred(), calls = [], actions = create(client({commit: (...args) => {calls.push(args); return write.promise;}}));
    actions.setText(source, 'ready draft');
    await actions.commit(source, mode); assert.equal(calls.length, 0, '尚未取得上下文时不写入');
    await actions.observe(source); actions.setText(source, ' ');
    await actions.commit(source, mode); assert.equal(calls.length, 0, '空白说明不写入');
    actions.setText(source, 'ready draft'); const pending = actions.commit(source, mode);
    await actions.commit(source, mode === 'commit' ? 'commit-push' : 'commit');
    assert.deepEqual(calls, [[source, 'content-1', 'ready draft', mode]], '重复事件仅保留首次动作和已观察版本');
    write.resolve(mode === 'commit-sync' ? syncResult() : result(source, mode === 'commit-push' ? 'succeeded' : 'not-requested')); await pending;
    assert.equal(actions.state(source).gitResult.commit.completed, true);
  }
});

test('提交并同步单次写入，迟到的部分成功归原来源且保留原提交与最终同步身份', async () => {
  for (const status of ['succeeded', 'failed', 'unavailable', 'unknown']) {
    const write = deferred(), calls = [], actions = create(client({commit: (...args) => {calls.push(args); return write.promise;}, push: async () => {throw Error('不得拆开再次推送');}}));
    await Promise.all([actions.observe(source), actions.observe(other)]);
    actions.setText(source, '提交后同步'); actions.setText(other, '其他来源草稿');
    const pending = actions.commit(source, 'commit-sync');
    assert.equal(actions.state(source).gitPending, 'commit-sync');
    assert.equal(actions.state(other).gitPending, null);
    write.resolve(syncResult(source, status)); await pending;
    const state = actions.state(source);
    assert.deepEqual(calls, [[source, 'content-1', '提交后同步', 'commit-sync']]);
    assert.equal(state.gitResult.commit.hash, 'b'.repeat(40), '同步后的提交不覆盖原已成立提交');
    assert.equal(state.gitResult.sync.head, 'c'.repeat(40), '同步后的最终身份单独保留');
    assert.equal(state.gitResult.sync.status, status); assert.equal(state.unknownCommit, false);
    assert.equal(state.text, '', '提交已成立时同步失败或未知也不保留可误重提的说明');
    assert.equal(actions.state(other).text, '其他来源草稿'); assert.equal(actions.state(other).gitResult, null);
    await actions.retryPush(source); assert.equal(calls.length, 1);
  }
});

test('同步阶段反馈独立于顶层推送，部分成功不否定已成立提交', () => {
  for (const [status, label] of [['succeeded', '已提交并同步'], ['failed', '已提交，同步失败'], ['unavailable', '已提交，尚未同步'], ['unknown', '已提交，同步结果待核对']]) {
    const value = syncResult(source, status), feedback = commitResultFeedback(value);
    assert.equal(value.push.status, 'not-requested'); assert.equal(feedback.text, label);
    assert.equal(feedback.warning, status !== 'succeeded');
    assert.match(feedback.details, /origin\/dev/); assert.match(feedback.details, /已获取固定上游/);
    assert.match(feedback.details, /已整合远端更新/); assert.match(feedback.details, /同步内的推送说明/);
    assert.ok(feedback.details.includes('初次提交：' + value.commit.hash)); assert.ok(feedback.details.includes('同步后提交：' + value.sync.head));
    assert.equal(Boolean(feedback.note), status !== 'succeeded');
    if (feedback.note) assert.match(feedback.note, /已有提交无需重复提交/);
  }
  const unknown = syncResult(); unknown.commit = {...unknown.commit, completed: false, status: 'unknown'};
  assert.equal(commitResultFeedback(unknown).text, '提交结果尚未确认'); assert.equal(commitResultFeedback(unknown).note, '');
  const unknownHead = syncResult(source, 'unknown'); unknownHead.sync.head = null;
  assert.match(commitResultFeedback(unknownHead).details, /同步后提交：尚未确认/);
  assert.equal(commitResultFeedback(result(source, 'failed')).text, '已提交，推送失败');
  assert.equal(commitResultFeedback(result(source, 'succeeded')).text, '已提交并推送');
  assert.equal(commitResultFeedback(result()).text, '已提交');
});

test('同步结果不能经旧推送重试事件绕过重新观察与整合', async () => {
  let pushes = 0;
  const value = {...syncResult(source, 'failed'), push: result(source, 'failed').push};
  const actions = create(client({commit: async () => value, push: async () => {pushes++; return result(source, 'succeeded');}}));
  await actions.observe(source); actions.setText(source, '提交后同步'); await actions.commit(source, 'commit-sync'); await actions.retryPush(source);
  assert.equal(pushes, 0); assert.equal(actions.state(source).gitResult.sync.status, 'failed');
});

test('重新观察到新内容后，旧版本已完成的迟到生成不能覆盖草稿或解除过期提示', async () => {
  const start = deferred(); let revision = 'content-1';
  const actions = create(client({context: async value => context(value, revision), generate: () => start.promise}));
  await actions.observe(source); actions.setText(source, '保留当前说明');
  const pending = actions.generate(source, selection);
  revision = 'content-2'; await actions.observe(source); start.resolve(run()); await pending;
  assert.equal(actions.state(source).context.revision, 'content-2');
  assert.equal(actions.state(source).text, '保留当前说明'); assert.equal(actions.state(source).generatedBy, null);
  assert.equal(actions.state(source).stale, true); assert.match(actions.state(source).generationError, /变更已更新.*重新生成/);
});

test('已发提交的迟到回复不能清除新编辑，来源不匹配的结果不能作为本来源成功', async () => {
  const write = deferred(), actions = create(client({commit: () => write.promise}));
  await actions.observe(source); actions.setText(source, 'submitted'); const pending = actions.commit(source, 'commit'); actions.setText(source, 'new draft'); write.resolve(result()); await pending;
  assert.equal(actions.state(source).text, 'new draft');
  const mismatch = create(client({commit: async () => result(other)})); await mismatch.observe(source); mismatch.setText(source, 'keep'); await mismatch.commit(source, 'commit');
  assert.equal(mismatch.state(source).gitResult, null); assert.equal(mismatch.state(source).text, 'keep'); assert.equal(mismatch.state(source).unknownCommit, true);
});

test('推送失败保留提交身份，重试只推原来源和已观察目标，不重复提交', async () => {
  const commits = [], pushes = [], actions = create(client({commit: async (...args) => {commits.push(args); return result(source, 'failed');}, push: async (...args) => {pushes.push(args); return result(source, 'succeeded');}}));
  await actions.observe(source); actions.setText(source, 'message'); await actions.commit(source, 'commit-push'); actions.setText(other, 'other'); await actions.retryPush(source);
  assert.equal(commits.length, 1); assert.equal(pushes.length, 1); assert.deepEqual(pushes[0], [source, {expectedHead: 'b'.repeat(40), expectedPushRevision: 'push-after-commit'}]);
  assert.equal(actions.state(source).gitResult.commit.hash, 'b'.repeat(40)); assert.equal(actions.state(other).text, 'other');
});

test('未知提交阻止直接重放，重新核对不自动提交；已知前置拒绝只保留草稿', async () => {
  let calls = 0; const actions = create(client({commit: async () => {calls++; throw Error('connection closed');}}));
  await actions.observe(source); actions.setText(source, 'keep'); await actions.commit(source, 'commit'); await actions.commit(source, 'commit');
  assert.equal(calls, 1); assert.equal(actions.state(source).unknownCommit, true); assert.equal(actions.state(source).text, 'keep');
  await actions.recheck(source); assert.equal(calls, 1); assert.equal(actions.state(source).unknownCommit, false);
  const rejected = create(client({commit: async () => {throw Object.assign(Error('changed'), {code: 'code_source_changed'});}})); await rejected.observe(source); rejected.setText(source, 'keep'); await rejected.commit(source, 'commit');
  assert.equal(rejected.state(source).unknownCommit, false); assert.equal(rejected.state(source).text, 'keep');
});

test('重试推送响应丢失保留已成立提交，标为未知并移除陈旧重试入口', async () => {
  let commits = 0, pushes = 0;
  const actions = create(client({commit: async () => {commits++; return result(source, 'failed');}, push: async () => {pushes++; throw Error('response lost');}}));
  await actions.observe(source); actions.setText(source, 'message'); await actions.commit(source, 'commit-push');
  await actions.retryPush(source); await actions.retryPush(source);
  const state = actions.state(source);
  assert.equal(commits, 1); assert.equal(pushes, 1); assert.equal(state.gitResult.commit.completed, true);
  assert.equal(state.gitResult.commit.hash, 'b'.repeat(40)); assert.equal(state.gitResult.push.status, 'unknown');
  assert.equal(state.gitResult.push.retry, null); assert.equal(state.unknownCommit, false);
  assert.match(state.gitResult.push.message, /重新核对远端/); assert.match(state.gitError, /推送结果尚未确认/);
});

test('读取过期回复不替换新观察，刷新失败不否定已经成立的提交', async () => {
  const first = deferred(), second = deferred(); let reads = 0;
  const actions = create(client({context: () => ++reads === 1 ? first.promise : second.promise})); const old = actions.observe(source), fresh = actions.observe(source);
  second.resolve(context(source, 'fresh')); await fresh; first.resolve(context(source, 'stale')); await old; assert.equal(actions.state(source).context.revision, 'fresh');
  const refreshFailure = create(client(), () => {throw Error('catalog offline');}); await refreshFailure.observe(source); refreshFailure.setText(source, 'message'); await refreshFailure.commit(source, 'commit');
  assert.equal(refreshFailure.state(source).gitResult.commit.completed, true); assert.match(refreshFailure.state(source).gitError, /刷新失败/);
});
