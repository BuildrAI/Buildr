import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({resolve(specifier, context, next) {
  if (specifier === '../../../api' && /\/(?:codex-desktop-api|agent-operations-api)\.ts$/u.test(context.parentURL || '')) return {url: 'data:text/javascript,export const api = () => { throw Error("unexpected real API"); };', shortCircuit: true};
  if (specifier.startsWith('.') && /\/codex-connection-state\.ts$/u.test(context.parentURL || '')) return {url: new URL(specifier + '.ts', context.parentURL).href, shortCircuit: true};
  return next(specifier, context);
}});
const {createCodexDesktopClient, codexSessionHref, codexConnectionStatus} = await import('../src/features/agents/api/codex-desktop-api.ts');
const {createAgentOperationsClient} = await import('../src/features/agents/api/agent-operations-api.ts');
const {codexDesktopState} = await import('../src/features/agents/codex-connection-state.ts');

test('首次关联配置读取显示加载，已有快照刷新保留真实状态而不退回加载', () => {
  assert.equal(codexDesktopState({connections: null, loading: true, error: ''}, 'codex-one').label, '正在读取…');
  for (const [status, label] of [['configured', '已配置'], ['unavailable', '需检查'], ['disconnected', '已移除']]) {
    const connection = {agentId: 'codex-one', status};
    const result = codexDesktopState({connections: [connection], loading: true, error: ''}, 'codex-one');
    assert.equal(result.label, label); assert.equal(result.connection, connection);
  }
  assert.equal(codexDesktopState({connections: [], loading: true, error: ''}, 'codex-one').label, '未配置', '成功的无记录快照也不在刷新时闪回初载');
});

test('关联配置读取失败立即变为未确认，后台重试保留错误且真实恢复可更新', () => {
  const connection = {agentId: 'codex-one', status: 'configured'};
  for (const connections of [null, [connection]]) {
    const result = codexDesktopState({connections, loading: true, error: '连接状态读取失败'}, 'codex-one');
    assert.equal(result.label, '未能确认'); assert.equal(result.tone, 'warning'); assert.equal(result.connection, null);
  }
  assert.equal(codexDesktopState({connections: [connection], loading: false, error: ''}, 'codex-one').label, '已配置');
});

test('本机发现是只读，确认仅传候选身份和观察版本，不从网页指定程序路径', async () => {
  const requests = [], client = createAgentOperationsClient(async (...args) => {requests.push(args); return {};});
  const signal = new AbortController().signal;
  await client.discoverCodex(signal);
  const input = {candidateId: 'candidate', expectedDiscoveryRevision: 'observed-installation', expectedRevision: 'observed-registry', makeDefault: false};
  await client.connectCodex(input);
  assert.equal(requests[0][0], '/api/v1/app/agents/codex/discovery'); assert.equal(requests[0][1].signal, signal); assert.equal(requests[0][1].method, undefined);
  assert.equal(requests[1][0], '/api/v1/app/agents/codex/connect'); assert.equal(requests[1][1].method, 'POST'); assert.deepEqual(JSON.parse(requests[1][1].body), input); assert.equal(requests[1][1].signal, undefined);
});

test('Codex移除只提交接入身份与已观察登记版本，已断开状态保留原生会话深链', async () => {
  const requests = [], client = createAgentOperationsClient(async (...args) => {requests.push(args); return {};});
  await client.removeCodex('codex-one', 'registry-observed');
  assert.equal(requests[0][0], '/api/v1/app/agents/codex/remove'); assert.equal(requests[0][1].method, 'POST'); assert.deepEqual(JSON.parse(requests[0][1].body), {agentId: 'codex-one', expectedRevision: 'registry-observed'});
  assert.equal(codexConnectionStatus({status: 'disconnected'}), '已移除');
  assert.equal(codexSessionHref('01a128ff-e8ad-72b2-adc0-8a0fd43fa98c'), 'codex://threads/01a128ff-e8ad-72b2-adc0-8a0fd43fa98c');
});

test('任务关联查询按明确工作空间隔离，解除只传关系版本，网页不再创建卡片绑定请求', async () => {
  const requests = [], client = createCodexDesktopClient(async (...args) => {requests.push(args); return {};});
  await client.connections(); await client.sessions('workspace/id', 'task/id'); await client.unlink('workspace/id', {id: 'edge', revision: 'edge-revision'});
  assert.equal(requests[0][0], '/api/v1/app/codex/connections');
  assert.equal(new URL(requests[1][0], 'http://local').pathname, '/api/v1/workspaces/workspace%2Fid/codex/sessions'); assert.equal(new URL(requests[1][0], 'http://local').searchParams.get('taskId'), 'task/id');
  assert.deepEqual(JSON.parse(requests[2][1].body), {relationId: 'edge', expectedRevision: 'edge-revision'});
  assert.equal(requests.length, 3); assert.equal(client.bind, undefined); assert.equal(client.binding, undefined);
  assert.equal(codexSessionHref('01a128ff-e8ad-72b2-adc0-8a0fd43fa98c'), 'codex://threads/01a128ff-e8ad-72b2-adc0-8a0fd43fa98c');
  for (const value of ['../../other', 'javascript:alert(1)', 'id#other', 'id/other', '']) assert.equal(codexSessionHref(value), null);
});
