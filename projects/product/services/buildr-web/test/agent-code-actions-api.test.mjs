import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({resolve(specifier, context, next) {
  if (specifier === '../../../api' && /\/(?:code-actions-api|agent-operations-api)\.ts$/.test(context.parentURL || '')) return {url: 'data:text/javascript,export const api = () => { throw Error("unexpected real API"); }; export class LocalSessionAdapter {writeHeaders(){return {};}}', shortCircuit: true};
  if (context.parentURL?.endsWith('/code-actions-api.ts') && specifier.endsWith('/agent-operations-api')) return next(specifier + '.ts', context);
  return next(specifier, context);
}});
const {createCodeActionsClient} = await import('../src/features/code/api/code-actions-api.ts');
const selection={id:'model-key',modelAccountId:'account',modelId:'model',accountIdentity:'identity',accountRevision:'v1',label:'Model'};

test('生成、提交及推送使用独立接口并传完整来源和精确观察，写入不随页面AbortSignal撤销', async () => {
  const requests = [], client = createCodeActionsClient(async (...args) => {requests.push(args); return {};});
  const source = {workspaceId: 'ws/id', repositoryId: 'repo-id', worktreeId: 'checkout-id', branch: 'dev'}, signal = new AbortController().signal;
  await client.context(source, signal); await client.generate(source, 'exact-content', selection); await client.commit(source, 'exact-content', 'subject\n\nbody', 'commit-push'); await client.push(source, {expectedHead: 'a'.repeat(40), expectedPushRevision: 'fixed-upstream'});
  const url = new URL(requests[0][0], 'http://local'); assert.equal(url.pathname, '/api/v1/workspaces/ws%2Fid/code/commit-context'); assert.equal(url.searchParams.get('repositoryId'), source.repositoryId); assert.equal(url.searchParams.get('worktreeId'), source.worktreeId); assert.equal(requests[0][1].signal, signal);
  assert.equal(new URL(requests[1][0], 'http://local').pathname.endsWith('/code/commit-message'), true); assert.deepEqual(JSON.parse(requests[1][1].body), {repositoryId: source.repositoryId, worktreeId: source.worktreeId, expectedRevision: 'exact-content', modelAccountId:'account',modelId:'model',accountIdentity:'identity',accountRevision:'v1',label:'Model'});
  assert.equal(requests[2][0].endsWith('/code/commit-changes'), true); assert.equal(JSON.parse(requests[2][1].body).message, 'subject\n\nbody'); assert.equal(JSON.parse(requests[2][1].body).mode, 'commit-push');
  assert.equal(requests[3][0].endsWith('/code/push'), true); assert.deepEqual(JSON.parse(requests[3][1].body), {repositoryId: source.repositoryId, worktreeId: source.worktreeId, expectedHead: 'a'.repeat(40), expectedPushRevision: 'fixed-upstream'});
  assert.ok(requests.slice(1).every(([, options]) => options.method === 'POST' && options.signal === undefined));
});

test('提交并同步在一次提交请求内传入来源和版本，不拆成后续同步请求', async () => {
  const requests = [], client = createCodeActionsClient(async (...args) => {requests.push(args); return {};});
  const source = {workspaceId: 'workspace', repositoryId: 'repository', worktreeId: 'worktree', branch: 'dev'};
  await client.commit(source, 'observed-content', '同步提交', 'commit-sync');
  assert.equal(requests.length, 1); assert.equal(requests[0][0], '/api/v1/workspaces/workspace/code/commit-changes');
  assert.equal(requests[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(requests[0][1].body), {repositoryId: 'repository', worktreeId: 'worktree', expectedRevision: 'observed-content', message: '同步提交', mode: 'commit-sync'});
  assert.equal(requests[0][1].signal, undefined);
});

test('查询和取消限定工作空间并使用准确运行身份',async()=>{
 const requests=[],client=createCodeActionsClient(async(...args)=>{requests.push(args);return {};},{writeHeaders:()=>({'x-buildr-session':'session'})});
 const source={workspaceId:'ws',repositoryId:'repo',worktreeId:'tree',branch:'dev'};
 await client.run(source,'run/id');await client.cancel(source,'run/id');
 assert.equal(requests[0][0],'/api/v1/workspaces/ws/code/commit-message-runs?runId=run%2Fid');
 assert.deepEqual(requests[0][1].headers,{'x-buildr-session':'session'});
 assert.equal(requests[1][0],'/api/v1/workspaces/ws/code/commit-message-cancel');assert.equal(requests[1][1].method,'POST');
 assert.deepEqual(JSON.parse(requests[1][1].body),{runId:'run/id'});
});
