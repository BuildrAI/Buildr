import assert from 'node:assert/strict';
import test from 'node:test';
import { executeRuntimeConfiguration } from '../src/features/service-runtime/configurationAction.ts';

const workspace = { name: '演示工作空间', rootPath: '/workspaces/team' };
const service = { code: 'front', name: '运营前端' };

test('已接入时直接提交同一简短请求，不进入复制交接', async () => {
  const calls = [];
  const result = await executeRuntimeConfiguration({ workspaceId: 'workspace-one', workspace, service, start: async input => { calls.push(input); return { status: 'started', conversation: { id: 'conversation', workspaceId: 'workspace-one' } }; } });
  assert.deepEqual(result, { status: 'started' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workspaceId, 'workspace-one');
  assert.equal(calls[0].cwd, workspace.rootPath);
  assert.match(calls[0].text, /服务编码："front"/);
  assert.match(calls[0].text, /references\/local-services\.md/);
});

test('未接入与提交前明确失败才打开复制，并保留具体原因', async () => {
  assert.deepEqual(await executeRuntimeConfiguration({ workspaceId: 'workspace-one', workspace, service }), { status: 'copy', tone: 'info', message: '当前没有可用的内部智能体。复制指令后，发送给你正在使用的智能体。' });
  assert.deepEqual(await executeRuntimeConfiguration({ workspaceId: 'workspace-one', workspace, service, start: async () => ({ status: 'unavailable', message: '没有就绪连接' }) }), { status: 'copy', tone: 'warning', message: '没有就绪连接' });
  assert.deepEqual(await executeRuntimeConfiguration({ workspaceId: 'workspace-one', workspace, service, start: async () => ({ status: 'failed', message: '权限不受支持' }) }), { status: 'copy', tone: 'error', message: '权限不受支持' });
});

test('待核对与忙碌状态不退回复制，身份不完整时不调用执行', async () => {
  let calls = 0;
  const start = async () => { calls++; return { status: 'recovering', reason: 'submission-unknown', message: '结果待核对' }; };
  assert.deepEqual(await executeRuntimeConfiguration({ workspaceId: 'workspace-one', workspace, service, start }), { status: 'recovering', message: '结果待核对' });
  assert.deepEqual(await executeRuntimeConfiguration({ workspaceId: 'workspace-one', workspace, service, start: async () => ({ status: 'busy', message: '正在提交' }) }), { status: 'busy', message: '正在提交' });
  const missing = await executeRuntimeConfiguration({ workspaceId: 'workspace-one', workspace: { ...workspace, rootPath: '' }, service, start });
  assert.equal(missing.status, 'copy');
  assert.equal(missing.tone, 'error');
  assert.equal(calls, 1);
});
