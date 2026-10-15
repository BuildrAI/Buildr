import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({resolve(specifier, context, next) {
  if (specifier === '../../../api' && /\/(?:agent-sessions-api|dsh-desktop-api|agent-operations-api|codex-desktop-api)\.ts$/u.test(context.parentURL || '')) return {url: 'data:text/javascript,export const api = () => { throw Error("unexpected real API"); };', shortCircuit: true};
  if (context.parentURL?.endsWith('/agent-session-model.ts') && specifier.startsWith('.')) return next(specifier + '.ts', context);
  return next(specifier, context);
}});
const {createAgentOperationsClient} = await import('../src/features/agents/api/agent-operations-api.ts');
const {createDshDesktopClient} = await import('../src/features/agents/api/dsh-desktop-api.ts');
const {createAgentSessionsClient} = await import('../src/features/agents/api/agent-sessions-api.ts');
const {agentSessionHref, assertDshSessionOpened, mergeAgentSessionObservation, sessionRelationKey} = await import('../src/features/task/agent-session-model.ts');
const {agentStatusLabel} = await import('../src/features/agents/agent-model.ts');

const relation = (provider, overrides = {}) => ({provider, id: 'relation-one', workspaceId: 'workspace-one', taskId: 'task-one', connectionId: 'connection-one', nativeSessionId: provider === 'codex' ? '11111111-1111-1111-1111-111111111111' : 'dsh-native-one', createdAt: '2026-10-13T00:00:00Z', revision: 'observed-relation', sessionUrl: null, taskUrl: '/workspaces/workspace-one/tasks/task-one', ...overrides});

test('DSH发现与连接维护只传候选、原登记及观察版本，连接状态读取不发模型请求', async () => {
  const requests = [], client = createAgentOperationsClient(async (...args) => {requests.push(args); return {};});
  const desktop = createDshDesktopClient(async (...args) => {requests.push(args); return {};});
  const signal = new AbortController().signal;
  await client.discoverDsh(signal);
  const input = {candidateId: 'dsh-candidate', existingAgentId: 'legacy-dsh', expectedDiscoveryRevision: 'observed-candidate', expectedRevision: 'observed-registry', makeDefault: false};
  await client.connectDsh(input); await desktop.connections(signal); await client.removeDsh('legacy-dsh', 'registry-after-check');
  assert.equal(requests[0][0], '/api/v1/app/agents/dsh/discovery'); assert.equal(requests[0][1].method, undefined); assert.equal(requests[0][1].signal, signal);
  assert.equal(requests[1][0], '/api/v1/app/agents/dsh/connect'); assert.equal(requests[1][1].method, 'POST'); assert.deepEqual(JSON.parse(requests[1][1].body), input);
  assert.equal(requests[2][0], '/api/v1/app/dsh/connections'); assert.equal(requests[2][1].method, undefined); assert.equal(requests[2][1].signal, signal);
  assert.equal(requests[3][0], '/api/v1/app/agents/dsh/remove'); assert.deepEqual(JSON.parse(requests[3][1].body), {agentId: 'legacy-dsh', expectedRevision: 'registry-after-check'});
  assert.ok([requests[1], requests[3]].every(([, options]) => options.signal === undefined));
});

test('通用任务会话查询明确工作空间及任务，解除与打开都携带提供者和关系版本', async () => {
  const requests = [], client = createAgentSessionsClient(async (...args) => {requests.push(args); return {};});
  const signal = new AbortController().signal, dsh = relation('dsh');
  await client.sessions('workspace/id', 'task/id', signal); await client.unlink('workspace/id', dsh); await client.open('workspace/id', dsh);
  const query = new URL(requests[0][0], 'http://local');
  assert.equal(query.pathname, '/api/v1/workspaces/workspace%2Fid/agent-sessions'); assert.equal(query.searchParams.get('taskId'), 'task/id'); assert.equal(requests[0][1].signal, signal);
  for (const [index, suffix] of [[1, '/unlink'], [2, '/open']]) {
    assert.equal(requests[index][0], '/api/v1/workspaces/workspace%2Fid/agent-sessions' + suffix);
    assert.deepEqual(JSON.parse(requests[index][1].body), {provider: 'dsh', relationId: dsh.id, expectedRevision: dsh.revision});
    assert.equal(requests[index][1].method, 'POST'); assert.equal(requests[index][1].signal, undefined);
  }
});

test('Codex深链保持，DSH不用伪深链，跨品牌同编号互不混淆', () => {
  const codex = relation('codex'), dsh = relation('dsh');
  assert.equal(agentSessionHref(codex), 'codex://threads/' + codex.nativeSessionId); assert.equal(agentSessionHref(dsh), null);
  assert.notEqual(sessionRelationKey(codex), sessionRelationKey(dsh));
  assert.equal(agentSessionHref(relation('codex', {nativeSessionId: 'javascript:alert(1)', sessionUrl: 'javascript:alert(1)'})), null);
});

test('单方诊断保留该方旧关系并替换另一方本次结果，不把局部失败当完整空列表', () => {
  const previous = [relation('codex'), relation('dsh')], nextCodex = relation('codex', {id: 'codex-new', revision: 'new'});
  const result = {workspaceId: 'workspace-one', relations: [nextCodex], diagnostics: [{provider: 'dsh', code: 'dsh_read_failed', message: 'DSH关系暂不可读取'}]};
  assert.deepEqual(mergeAgentSessionObservation(previous, result, 'workspace-one', 'task-one'), [nextCodex, previous[1]]);
  assert.deepEqual(mergeAgentSessionObservation([relation('dsh', {taskId: 'other-task'})], result, 'workspace-one', 'task-one'), [nextCodex], '旧快照不能跨任务保留');
  assert.deepEqual(mergeAgentSessionObservation(previous, {workspaceId: 'workspace-one', relations: [], diagnostics: []}, 'workspace-one', 'task-one'), []);
  assert.deepEqual(mergeAgentSessionObservation(previous, {...result, relations: [nextCodex, relation('codex', {taskId: 'other-task'})]}, 'workspace-one', 'task-one'), [nextCodex, previous[1]], '解除返回整个工作空间时只选择当前任务');
  assert.throws(() => mergeAgentSessionObservation(previous, {...result, relations: [relation('codex', {workspaceId: 'other-workspace'})]}, 'workspace-one', 'task-one'), /当前任务不匹配/u);
  assert.throws(() => mergeAgentSessionObservation(previous, {...result, relations: [nextCodex, nextCodex]}, 'workspace-one', 'task-one'), /重复身份/u);
});

test('DSH打开只接受准确目标确认，失败不能把发送请求表述成已打开', () => {
  const dsh = relation('dsh');
  assert.doesNotThrow(() => assertDshSessionOpened({provider: 'dsh', opened: true, nativeSessionId: dsh.nativeSessionId}, dsh));
  for (const result of [null, {provider: 'codex', opened: true, nativeSessionId: dsh.nativeSessionId}, {provider: 'dsh', opened: false, nativeSessionId: dsh.nativeSessionId}, {provider: 'dsh', opened: true, nativeSessionId: 'other-session'}]) assert.throws(() => assertDshSessionOpened(result, dsh), /未能确认/u);
});

test('DSH状态表达连接而非启动独立生成进程，Codex原状态保持', () => {
  const agent = {availability: 'available', runtimeStatus: 'stopped', safeReason: null};
  assert.equal(agentStatusLabel({...agent, kind: 'dsh'}), '按需连接'); assert.equal(agentStatusLabel({...agent, kind: 'dsh', runtimeStatus: 'idle'}), '已连接');
  assert.equal(agentStatusLabel({...agent, kind: 'codex'}), '按需启动');
});
