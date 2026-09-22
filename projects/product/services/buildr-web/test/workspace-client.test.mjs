import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient } from '../src/api/client.ts';
import { createWorkspaceClient } from '../src/features/workspace/api/workspace-client.ts';

test('卡片设置显式读取并保存目标工作空间，不借用当前浏览范围或目录版本', async t => {
  const requests = [];
  let browsingWorkspace = 'currently-open';
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({
      revision: 'workspace-file-revision', rootPath: '/work/target',
      workspace: { id: 'card-target', name: 'Target', description: 'Target workspace' },
    }), { headers: { 'content-type': 'application/json' } });
  });
  const client = createWorkspaceClient(createApiClient({
    getWorkspaceId: () => browsingWorkspace,
    sessionAdapter: { writeHeaders: () => ({ 'x-buildr-session': 'write-session' }) },
  }));
  const observed = await client.readById('card-target');
  browsingWorkspace = 'another-open-workspace';
  await client.updateById('card-target', { revision: observed.revision, name: 'Changed target', description: 'Only this card changes' });
  assert.deepEqual(requests.map(request => request.url), ['/api/v1/workspaces/card-target', '/api/v1/workspaces/card-target']);
  assert.equal(requests[0].init.headers.has('x-buildr-session'), false);
  assert.equal(requests[1].init.method, 'PUT');
  assert.equal(requests[1].init.headers.get('x-buildr-session'), 'write-session');
  assert.deepEqual(JSON.parse(requests[1].init.body), { revision: 'workspace-file-revision', name: 'Changed target', description: 'Only this card changes' });
  assert.equal(browsingWorkspace, 'another-open-workspace');
});

test('全局工作空间目录也可以按身份读取；当前空间方法保持兼容', async t => {
  const urls = [];
  let browsingWorkspace = null;
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(url);
    return new Response('{}', { headers: { 'content-type': 'application/json' } });
  });
  const client = createWorkspaceClient(createApiClient({
    getWorkspaceId: () => browsingWorkspace,
    sessionAdapter: { writeHeaders: () => ({}) },
  }));
  await client.readById('target/from-card');
  browsingWorkspace = 'current';
  await client.read();
  assert.deepEqual(urls, ['/api/v1/workspaces/target%2Ffrom-card', '/api/v1/workspaces/current']);
});

test('设置冲突保留服务端错误码和最新版本供界面重新判断', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    error: { code: 'workspace_revision_conflict', message: '工作空间已修改', details: { currentRevision: 'newer-revision' } },
  }), { status: 409, headers: { 'content-type': 'application/json' } }));
  const client = createWorkspaceClient(createApiClient({
    getWorkspaceId: () => null,
    sessionAdapter: { writeHeaders: () => ({ 'x-buildr-session': 'write-session' }) },
  }));
  await assert.rejects(client.updateById('target', { revision: 'old-revision', name: 'My draft' }), error => {
    assert.equal(error.code, 'workspace_revision_conflict');
    assert.equal(error.details.currentRevision, 'newer-revision');
    return true;
  });
});
