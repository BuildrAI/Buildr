import assert from 'node:assert/strict';
import test from 'node:test';
import {dshTaskResource, dshResourceDestination} from '../src/app/dsh-resource-navigation.ts';

const workspace = '11111111-1111-1111-1111-111111111111', nonce = '22222222-2222-2222-2222-222222222222';
const path = `/workspaces/${workspace}/tasks/target-task`, search = `?buildrDshPage=${nonce}`;
test('仅准确工作空间任务与单一有效DSH页面身份保留真实资源路由', () => {
  assert.equal(dshTaskResource(workspace, path, search)?.id, 'target-task');
  for (const [scope, route, query] of [[workspace,path,''],[workspace,path,'?buildrDshPage=invalid'],[workspace,path,search + '&buildrDshPage=' + nonce],['other',path,search],[workspace,path + '/document',search],[workspace,`/workspaces/${workspace}/codex`,search],[workspace,path + '%2fescape',search]]) assert.equal(dshTaskResource(scope, route, query), null);
});
test('DSH页面点击其他任务改变真实地址保留nonce，其他资源回普通路由', () => {
  assert.equal(dshResourceDestination(workspace, `/workspaces/${workspace}/tasks/next-task`, search), `/workspaces/${workspace}/tasks/next-task${search}`);
  assert.equal(dshResourceDestination(workspace, `/workspaces/${workspace}/services/service-one${search}`, search), `/workspaces/${workspace}/services/service-one`);
  assert.equal(dshResourceDestination(workspace, '/workspaces/33333333-3333-3333-3333-333333333333/tasks/another', search), '/workspaces/33333333-3333-3333-3333-333333333333/tasks/another');
});
