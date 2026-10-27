import test from 'node:test';
import assert from 'node:assert/strict';
import { executionModelKey, executionModelOptions, selectedExecutionModel } from '../src/lib/execution-model.ts';

const model = overrides => ({accountId: 'account', accountLabel: 'Qoder · Lite', modelId: 'fast', label: 'Fast', enabled: true, available: true, accountIdentity: 'identity', accountRevision: 'r1', defaultServiceTier: 'quick', ...overrides});

test('执行模型选择只提供模型配置中已启用的模型', () => {
  const options = executionModelOptions([model({}), model({modelId: 'off', label: 'Off', enabled: false}), model({modelId: 'legacy', label: 'Legacy', enabled: undefined})]);
  assert.deepEqual(options.map(option => option.modelId), ['fast', 'legacy']);
  const original = model({});
  executionModelOptions([original]);
  assert.deepEqual(original, model({}));
});

test('执行模型选项保留真实来源、观察版本和默认档位', () => {
  const [option] = executionModelOptions([model({available: false, defaultServiceTier: undefined})]);
  assert.deepEqual(option, {key: JSON.stringify(['account', 'fast']), label: 'Qoder · Lite / Fast', available: false, accountId: 'account', modelId: 'fast', accountIdentity: 'identity', accountRevision: 'r1', serviceTier: undefined});
  assert.equal(executionModelKey('account', 'fast'), option.key);
});

test('记住的模型按账号和模型身份恢复，停用或已消失的选择不恢复', () => {
  const options = executionModelOptions([model({}), model({accountId: 'other', modelId: 'fast'})]);
  assert.equal(selectedExecutionModel(options, JSON.stringify(['other', 'fast']))?.accountId, 'other');
  assert.equal(selectedExecutionModel(options, JSON.stringify(['account', 'fast']))?.accountId, 'account');
  assert.equal(selectedExecutionModel(options, JSON.stringify(['account', 'gone'])), null);
  assert.equal(selectedExecutionModel(options, null), null);
  assert.equal(selectedExecutionModel(executionModelOptions([model({enabled: false})]), JSON.stringify(['account', 'fast'])), null);
});
