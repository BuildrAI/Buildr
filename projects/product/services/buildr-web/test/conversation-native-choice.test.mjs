import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeConversationChoice} from '../src/features/agent-conversations/conversation-options.ts';

const connection = {id: 'codex', models: [{id: 'gpt-6.1-sol', label: 'GPT-6.1-Sol', isDefault: true}, {id: 'fast', label: 'Fast'}]};
const source = {accountId: 'native-codex', accountIdentity: 'identity', accountRevision: 'revision', provider: 'native-codex', modelId: 'gpt-6.1-sol', label: 'GPT-6.1-Sol', available: true, enabled: true, defaultServiceTier: 'default'};

test('首条发送为实际提供的原生模型补上账号身份', () => {
  assert.deepEqual(nativeConversationChoice({connectionId: 'codex'}, connection, [source]), {connectionId: 'codex'});
  assert.equal(nativeConversationChoice({connectionId: 'codex', model: 'gpt-6.1-sol', reasoningEffort: 'high'}, connection, [source]).modelAccountId, 'native-codex');
});

test('已有账号、别的来源或不可用来源都不被改写或推断', () => {
  assert.equal(nativeConversationChoice({connectionId: 'codex', modelAccountId: 'account-a'}, connection, [source]).modelAccountId, 'account-a');
  assert.equal(nativeConversationChoice({connectionId: 'codex', model: 'other'}, connection, [source]).modelAccountId, undefined);
  assert.equal(nativeConversationChoice({connectionId: 'codex'}, connection, [{...source, available: false}]).modelAccountId, undefined);
  assert.equal(nativeConversationChoice({connectionId: 'codex'}, connection, [{...source, enabled: false}]).modelAccountId, undefined);
  assert.equal(nativeConversationChoice({connectionId: 'codex'}, connection, [{...source, accountId: 'account-a'}]).modelAccountId, undefined);
});
