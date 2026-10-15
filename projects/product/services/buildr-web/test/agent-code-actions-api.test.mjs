import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({resolve(specifier, context, next) {
  if (specifier === '../../../api' && /\/(?:code-actions-api|agent-operations-api)\.ts$/.test(context.parentURL || '')) return {url: 'data:text/javascript,export const api = () => { throw Error("unexpected real API"); };', shortCircuit: true};
  if (context.parentURL?.endsWith('/code-actions-api.ts') && specifier.endsWith('/agent-operations-api')) return next(specifier + '.ts', context);
  return next(specifier, context);
}});
const {createCodeActionsClient} = await import('../src/features/code/api/code-actions-api.ts');
const {createAgentOperationsClient} = await import('../src/features/agents/api/agent-operations-api.ts');

test('全局登记、条件默认选择与运行查询始终使用app路径，取消是显式写请求', async () => {
  const requests = [], client = createAgentOperationsClient(async (...args) => {requests.push(args); return {};});
  await client.list(); await client.select('registered-id', 'observed-registry'); await client.run('run/id'); await client.cancel('run/id');
  assert.equal(requests[0][0], '/api/v1/app/agents');
  assert.equal(requests[1][0], '/api/v1/app/agents/select'); assert.deepEqual(JSON.parse(requests[1][1].body), {agentId: 'registered-id', expectedRevision: 'observed-registry'});
  assert.equal(new URL(requests[2][0], 'http://local').searchParams.get('runId'), 'run/id'); assert.equal(requests[2][1].method, undefined);
  assert.equal(requests[3][1].method, 'POST'); assert.deepEqual(JSON.parse(requests[3][1].body), {runId: 'run/id'});
});

test('生成、提交及推送使用独立接口并传完整来源和精确观察，写入不随页面AbortSignal撤销', async () => {
  const requests = [], client = createCodeActionsClient(async (...args) => {requests.push(args); return {};});
  const source = {workspaceId: 'ws/id', repositoryId: 'repo-id', worktreeId: 'checkout-id', branch: 'dev'}, signal = new AbortController().signal;
  await client.context(source, signal); await client.generate(source, 'exact-content', 'selected-agent'); await client.commit(source, 'exact-content', 'subject\n\nbody', 'commit-push'); await client.push(source, {expectedHead: 'a'.repeat(40), expectedPushRevision: 'fixed-upstream'});
  const url = new URL(requests[0][0], 'http://local'); assert.equal(url.pathname, '/api/v1/workspaces/ws%2Fid/code/commit-context'); assert.equal(url.searchParams.get('repositoryId'), source.repositoryId); assert.equal(url.searchParams.get('worktreeId'), source.worktreeId); assert.equal(requests[0][1].signal, signal);
  assert.equal(new URL(requests[1][0], 'http://local').pathname.endsWith('/code/commit-message'), true); assert.deepEqual(JSON.parse(requests[1][1].body), {repositoryId: source.repositoryId, worktreeId: source.worktreeId, expectedRevision: 'exact-content', agentId: 'selected-agent'});
  assert.equal(requests[2][0].endsWith('/code/commit-changes'), true); assert.equal(JSON.parse(requests[2][1].body).message, 'subject\n\nbody'); assert.equal(JSON.parse(requests[2][1].body).mode, 'commit-push');
  assert.equal(requests[3][0].endsWith('/code/push'), true); assert.deepEqual(JSON.parse(requests[3][1].body), {repositoryId: source.repositoryId, worktreeId: source.worktreeId, expectedHead: 'a'.repeat(40), expectedPushRevision: 'fixed-upstream'});
  assert.ok(requests.slice(1).every(([, options]) => options.method === 'POST' && options.signal === undefined));
});
