import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationProductActionSelection, recoverConversationProductAction, startConversationProductAction } from '../src/features/agent-conversations/conversation-product-action.ts';
import { firstConversationSubmissions } from '../src/features/agent-conversations/conversation-first-submission.ts';

const connection = { id: 'codex', provider: 'codex', label: 'Codex', enabled: true, status: 'ready', revision: 'one', models: [{ id: 'native', label: 'Native', isDefault: true }], capabilities: { text: true, images: false, approval: true, questions: true, stop: true, resume: true, maxInputBytes: 100000, permissionModes: ['default', 'full-access'] } };
const catalog = [{ accountId: 'native-codex', accountIdentity: 'account-one', accountRevision: 'revision-one', modelId: 'native', label: 'Native', provider: 'codex', available: true, enabled: true }];
const modulePreference = { version: 1, agent: { connectionId: 'codex' }, permission: { mode: 'full-access' } };
const selection = { choice: { connectionId: 'codex', model: 'native', modelAccountId: 'native-codex', modelAccountIdentity: 'account-one', modelAccountRevision: 'revision-one', serviceTier: undefined }, permissionMode: 'full-access' };
const conversation = { id: 'conversation-one', workspaceId: 'workspace-one', revision: 'conversation-one-revision' };
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values };
};
const ids = () => { const values = ['draft-one', 'request-one']; return () => values.shift() || 'unexpected-id'; };

test('产品动作只选择已启用就绪且支持当前权限的连接', () => {
  assert.deepEqual(conversationProductActionSelection('workspace-one', modulePreference, null, [connection], catalog), selection);
  assert.equal(conversationProductActionSelection('workspace-one', modulePreference, null, [{ ...connection, status: 'disconnected' }], catalog), null);
  assert.equal(conversationProductActionSelection('workspace-one', modulePreference, null, [{ ...connection, enabled: false }], catalog), null);
  assert.equal(conversationProductActionSelection('workspace-one', modulePreference, null, [{ ...connection, capabilities: { ...connection.capabilities, permissionModes: ['default'] } }], catalog), null);
});

test('文本产品动作复用首选模型与首条提交身份，成功后清除待核对记录', async () => {
  const store = storage(), submissions = firstConversationSubmissions(store, 'test-submission');
  const calls = [];
  const client = {
    async draftImages(id) { calls.push(['draftImages', id]); return { revision: 'draft-revision', images: [] }; },
    async startDraft(workspaceId, draftId, input) { calls.push(['startDraft', workspaceId, draftId, input]); return { conversation }; },
    async lookupDraft() { throw new Error('成功提交不需要补查'); },
  };
  const result = await startConversationProductAction({ client, input: { workspaceId: 'workspace-one', cwd: '/workspaces/one', text: '配置服务' }, selection, submissions, uuid: ids() });
  assert.deepEqual(result, { status: 'started', conversation });
  assert.equal(calls[0][1], 'draft-one');
  assert.deepEqual(calls[1], ['startDraft', 'workspace-one', 'draft-one', { ...selection.choice, permissionMode: 'full-access', text: '配置服务', attachmentIds: [], expectedDraftRevision: 'draft-revision', clientRequestId: 'request-one', cwd: '/workspaces/one' }]);
  assert.equal(submissions.read(), undefined);
});

test('未知提交先保留身份并核对，后续调用不会再次发送', async () => {
  const store = storage(), submissions = firstConversationSubmissions(store, 'test-submission');
  let starts = 0, lookups = 0;
  const client = {
    async draftImages() { return { revision: 'draft-revision', images: [] }; },
    async startDraft() { starts++; throw new Error('连接中断'); },
    async lookupDraft() { lookups++; return { found: false }; },
  };
  const input = { workspaceId: 'workspace-one', cwd: '/workspaces/one', text: '配置服务' };
  const first = await startConversationProductAction({ client, input, selection, submissions, uuid: ids() });
  assert.deepEqual(first, { status: 'recovering', reason: 'submission-unknown' });
  assert.equal(submissions.read().input.clientRequestId, 'request-one');
  const second = await startConversationProductAction({ client, input, selection, submissions, uuid: ids() });
  assert.deepEqual(second, { status: 'recovering', reason: 'existing-submission' });
  assert.equal(starts, 1);
  assert.equal(lookups, 2);
});

test('迟到查询证明原请求已受理时按原对话完成，不生成新请求', async () => {
  const store = storage(), submissions = firstConversationSubmissions(store, 'test-submission');
  let starts = 0;
  const client = {
    async draftImages() { return { revision: 'draft-revision', images: [] }; },
    async startDraft() { starts++; throw new Error('响应丢失'); },
    async lookupDraft() { return { found: true, conversation }; },
  };
  const result = await startConversationProductAction({ client, input: { workspaceId: 'workspace-one', cwd: '/workspaces/one', text: '配置服务' }, selection, submissions, uuid: ids() });
  assert.deepEqual(result, { status: 'started', conversation });
  assert.equal(starts, 1);
  assert.equal(submissions.read(), undefined);
});

test('明确拒绝证明未受理时清理提交身份并允许安全交接', async () => {
  const store = storage(), submissions = firstConversationSubmissions(store, 'test-submission');
  const client = {
    async draftImages() { return { revision: 'draft-revision', images: [] }; },
    async startDraft() { throw Object.assign(new Error('权限不支持'), { status: 409, code: 'agent_permission_unsupported' }); },
    async lookupDraft() { throw new Error('明确拒绝不需要补查'); },
  };
  await assert.rejects(startConversationProductAction({ client, input: { workspaceId: 'workspace-one', cwd: '/workspaces/one', text: '配置服务' }, selection, submissions, uuid: ids() }), /权限不支持/);
  assert.equal(submissions.read(), undefined);
});

test('原提交核对独立于当前连接目录，找到原对话后释放身份但不发送新请求', async () => {
  const submissions = firstConversationSubmissions();
  submissions.save({ workspaceId: 'original-workspace', draftId: 'original-draft', input: { clientRequestId: 'original-request', text: '原请求' } });
  const calls = [];
  const client = {
    async connections() { throw new Error('连接读取不可用'); },
    async lookupDraft(...args) { calls.push(args); return { found: true, conversation }; },
  };
  assert.deepEqual(await recoverConversationProductAction(client, submissions), { status: 'recovering', reason: 'existing-submission', conversation });
  assert.deepEqual(calls, [['original-workspace', 'original-draft', 'original-request']]);
  assert.equal(submissions.read(), undefined);
});

test('准备产品动作期间出现手工首条提交时，保留并恢复原身份', async () => {
  const submissions = firstConversationSubmissions();
  const pending = { workspaceId: 'original-workspace', draftId: 'manual-draft', input: { clientRequestId: 'manual-request', text: '手工内容' } };
  const client = {
    async draftImages() { submissions.save(pending); return { revision: 'draft-revision', images: [] }; },
    async lookupDraft() { throw new Error('暂时无法核对'); },
    async startDraft() { throw new Error('不应发送新请求'); },
  };
  assert.deepEqual(await startConversationProductAction({ client, input: { workspaceId: 'workspace-one', cwd: '/one', text: '产品动作' }, selection, submissions, uuid: ids() }), { status: 'recovering', reason: 'existing-submission' });
  assert.deepEqual(submissions.read(), pending);
});
