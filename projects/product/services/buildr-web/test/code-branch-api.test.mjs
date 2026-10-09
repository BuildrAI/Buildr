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
