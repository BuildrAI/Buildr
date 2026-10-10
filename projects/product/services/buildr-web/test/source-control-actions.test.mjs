import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceControlActions, actionSourceKey, commitMessageOutput } from '../src/features/code/source-control-actions.ts';

const source = {workspaceId: 'w', repositoryId: 'repo', worktreeId: 'checkout-a', branch: 'dev'};
const other = {...source, worktreeId: 'checkout-b', branch: 'feature'};
const identity = value => ({repositoryId: value.repositoryId, checkoutId: value.worktreeId, worktreeId: value.worktreeId, worktreeGroupId: 'main', taskId: null, commitHash: null, location: '/fixture/' + value.worktreeId, version: 'current', kind: 'default'});
const context = (value, revision = 'content-1') => ({source: identity(value), revision, head: 'a'.repeat(40), branch: value.branch, hasChanges: true, fileCount: 2, push: {revision: 'push-1', target: 'origin/dev', available: true, reason: null, ahead: 2}});
const run = (status = 'succeeded', output = {commitMessage: 'generated'}, agentId = 'codex') => ({id: 'run-1', agentId, registrationRevision: 'registry-1', status, output, error: null, executionConfig: null});
const result = (value = source, pushStatus = 'not-requested') => ({source: identity(value), commit: {completed: true, hash: 'b'.repeat(40), message: 'submitted', status: 'succeeded'}, push: {status: pushStatus, target: 'origin/dev', message: pushStatus, retry: pushStatus === 'failed' ? {expectedHead: 'b'.repeat(40), expectedPushRevision: 'push-after-commit'} : null}, effects: {indexUpdated: true, warnings: []}});
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const client = (overrides = {}) => ({context: async value => context(value), generate: async () => run(), run: async () => run(), cancel: async () => run('cancelled', null), commit: async value => result(value), push: async value => result(value, 'succeeded'), ...overrides});
const create = (api, refresh = () => {}) => new SourceControlActions(api, refresh, () => {}, async () => {});

test('来源键同时区分工作空间、代码库、工作树与分支，结构化输出拒绝缺失或空说明', () => {
  for (const next of [{...source, workspaceId: 'other'}, {...source, repositoryId: 'other'}, other, {...source, branch: 'other'}]) assert.notEqual(actionSourceKey(next), actionSourceKey(source));
  for (const value of [null, {}, {commitMessage: ' '}, {commitMessage: 2}, 'text']) assert.equal(commitMessageOutput(value), null);
  assert.equal(commitMessageOutput({commitMessage: 'subject\n\nbody'}), 'subject\n\nbody');
});

test('来源切换保留独立草稿，迟到生成只写原来源并固定执行者，覆盖开始即消费', async () => {
  const start = deferred(), calls = [], actions = create(client({generate: (...args) => {calls.push(args); return start.promise;}}));
  await Promise.all([actions.observe(source), actions.observe(other)]);
  actions.setText(source, 'original'); actions.setText(other, 'other draft'); actions.setOverride(source, 'codex');
  const pending = actions.generate(source, {id: 'codex', label: 'Codex'});
  assert.equal(actions.state(source).overrideId, null); assert.equal(actions.state(source).generation.agentId, 'codex');
  actions.setOverride(other, 'other-agent'); start.resolve(run()); await pending;
  assert.equal(actions.state(source).text, 'generated'); assert.equal(actions.state(source).generatedBy.agentId, 'codex');
  assert.equal(actions.state(other).text, 'other draft'); assert.equal(calls[0][2], 'codex');
});

test('取消先于开始响应仍发送取消，迟到成功不覆盖原草稿', async () => {
  const start = deferred(), cancelled = [], actions = create(client({generate: () => start.promise, cancel: async id => {cancelled.push(id); return run('cancelled', null);}}));
  await actions.observe(source); actions.setText(source, 'edited');
  const pending = actions.generate(source, {id: 'codex', label: 'Codex'}); await actions.cancel(source);
  start.resolve(run('running', null)); await pending;
  assert.deepEqual(cancelled, ['run-1']); assert.equal(actions.state(source).text, 'edited'); assert.equal(actions.state(source).generation, null);
});

test('生成来源固定本次确认配置的独立快照，另一次配置和未知值不改写旧结果', async () => {
  let confirmed = {model: 'confirmed-first', modelProvider: 'provider-first', reasoningEffort: 'high'};
  const actions = create(client({generate: async () => ({...run(), executionConfig: confirmed})}));
  await Promise.all([actions.observe(source), actions.observe(other)]);
  await actions.generate(source, {id: 'codex', label: 'Codex'});
  confirmed.model = 'mutated-after-response';
  assert.equal(actions.state(source).generatedBy.executionConfig.model, 'confirmed-first');
  confirmed = {model: 'confirmed-later', modelProvider: null, reasoningEffort: null};
  await actions.generate(other, {id: 'codex', label: 'Codex'});
  assert.equal(actions.state(other).generatedBy.executionConfig.model, 'confirmed-later');
  assert.equal(actions.state(source).generatedBy.executionConfig.model, 'confirmed-first');
  confirmed = null; await actions.generate(other, {id: 'codex', label: 'Codex'});
  assert.equal(actions.state(other).generatedBy.executionConfig, null);
  assert.equal(actions.state(other).text, 'generated');
});

test('生成期间的新草稿与失败结果都不被覆盖；内容漂移保留说明', async () => {
  const start = deferred(), actions = create(client({generate: () => start.promise}));
  await actions.observe(source); actions.setText(source, 'old'); const pending = actions.generate(source, {id: 'codex', label: 'Codex'});
  actions.setText(source, 'new edit'); start.resolve(run()); await pending; assert.equal(actions.state(source).text, 'new edit');
  const failed = create(client({generate: async () => ({...run('failed', null), error: {code: 'code_source_changed', message: '内容变化'}})}));
  await failed.observe(source); failed.setText(source, 'keep'); await failed.generate(source, {id: 'codex', label: 'Codex'});
  assert.equal(failed.state(source).text, 'keep'); assert.equal(failed.state(source).stale, true);
});

test('手写提交不调用智能体，清除的仅是提交时说明并刷新真实读取', async () => {
  let writes = 0, refreshes = 0;
  const actions = create(client({generate: async () => {throw Error('must not call agent');}, commit: async value => {writes++; return result(value);}}), () => {refreshes++;});
  await actions.observe(source); actions.setText(source, 'manual'); actions.setText(other, 'keep other'); await actions.commit(source, 'commit');
  assert.equal(writes, 1); assert.equal(refreshes, 1); assert.equal(actions.state(source).text, ''); assert.equal(actions.state(other).text, 'keep other');
  assert.equal(actions.state(source).gitResult.commit.hash, 'b'.repeat(40));
});

test('重新观察到新内容后，旧版本已完成的迟到生成不能覆盖草稿或解除过期提示', async () => {
  const start = deferred(); let revision = 'content-1';
  const actions = create(client({context: async value => context(value, revision), generate: () => start.promise}));
  await actions.observe(source); actions.setText(source, '保留当前说明');
  const pending = actions.generate(source, {id: 'codex', label: 'Codex'});
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
