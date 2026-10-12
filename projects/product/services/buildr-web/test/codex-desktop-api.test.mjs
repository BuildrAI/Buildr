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

test('首次桌面读取显示加载，已有快照刷新保留真实状态而不退回加载', () => {
  assert.equal(codexDesktopState({connections: null, loading: true, error: ''}, 'codex-one').label, '正在读取桌面状态…');
  for (const [status, label] of [['ready', '桌面已连接'], ['awaiting-desktop', '待桌面加载'], ['unavailable', '桌面连接不可用']]) {
    const connection = {agentId: 'codex-one', status};
    const result = codexDesktopState({connections: [connection], loading: true, error: ''}, 'codex-one');
    assert.equal(result.label, label); assert.equal(result.connection, connection);
  }
  assert.equal(codexDesktopState({connections: [], loading: true, error: ''}, 'codex-one').label, '桌面未连接', '成功的无记录快照也不在刷新时闪回初载');
});

test('桌面读取失败立即变为未确认，后台重试保留错误且真实恢复可更新', () => {
  const connection = {agentId: 'codex-one', status: 'ready'};
  for (const connections of [null, [connection]]) {
    const result = codexDesktopState({connections, loading: true, error: '连接状态读取失败'}, 'codex-one');
    assert.equal(result.label, '桌面状态未能确认'); assert.equal(result.tone, 'warning'); assert.equal(result.connection, null);
  }
  assert.equal(codexDesktopState({connections: [connection], loading: false, error: ''}, 'codex-one').label, '桌面已连接');
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

test('Codex移除只提交接入身份与已观察登记版本，已断开状态保留原聊天深链', async () => {
  const requests = [], client = createAgentOperationsClient(async (...args) => {requests.push(args); return {};});
  await client.removeCodex('codex-one', 'registry-observed');
  assert.equal(requests[0][0], '/api/v1/app/agents/codex/remove'); assert.equal(requests[0][1].method, 'POST'); assert.deepEqual(JSON.parse(requests[0][1].body), {agentId: 'codex-one', expectedRevision: 'registry-observed'});
  assert.equal(codexConnectionStatus({status: 'disconnected'}), '已断开');
  assert.equal(codexSessionHref('01a128ff-e8ad-72b2-adc0-8a0fd43fa98c'), 'codex://threads/01a128ff-e8ad-72b2-adc0-8a0fd43fa98c');
});

test('任务关联查询按明确工作空间隔离，解除只传关系版本，绑定不手填原聊天身份', async () => {
  const requests = [], client = createCodexDesktopClient(async (...args) => {requests.push(args); return {};});
  await client.connections(); await client.sessions('workspace/id', 'task/id'); await client.unlink('workspace/id', {id: 'edge', revision: 'edge-revision'}); await client.bind('workspace/id', 'connection', 'task/id', 'known-request-before-post'); await client.binding('workspace/id', 'binding/id');
  assert.equal(requests[0][0], '/api/v1/app/codex/connections');
  assert.equal(new URL(requests[1][0], 'http://local').pathname, '/api/v1/workspaces/workspace%2Fid/codex/sessions'); assert.equal(new URL(requests[1][0], 'http://local').searchParams.get('taskId'), 'task/id');
  assert.deepEqual(JSON.parse(requests[2][1].body), {relationId: 'edge', expectedRevision: 'edge-revision'});
  assert.deepEqual(JSON.parse(requests[3][1].body), {connectionId: 'connection', taskId: 'task/id', bindingRequestId: 'known-request-before-post'});
  assert.equal(requests[4][0], '/api/v1/workspaces/workspace%2Fid/codex/bindings/binding%2Fid');
  assert.equal(codexSessionHref('01a128ff-e8ad-72b2-adc0-8a0fd43fa98c'), 'codex://threads/01a128ff-e8ad-72b2-adc0-8a0fd43fa98c');
  for (const value of ['../../other', 'javascript:alert(1)', 'id#other', 'id/other', '']) assert.equal(codexSessionHref(value), null);
});
