import assert from 'node:assert/strict';
import test from 'node:test';
import { executionConfigSummary } from '../src/features/agents/agent-model.ts';

test('配置摘要只表达确认值，未知模型和推理级别不推断默认值', () => {
  assert.equal(executionConfigSummary(null), '');
  assert.equal(executionConfigSummary({model: null, modelProvider: null, reasoningEffort: null}), '');
  assert.equal(executionConfigSummary({model: 'confirmed-model', modelProvider: 'confirmed-provider', reasoningEffort: 'high'}), '模型：confirmed-model · 提供方：confirmed-provider · 推理级别：high');
  assert.equal(executionConfigSummary({model: 'partial-model', modelProvider: null, reasoningEffort: null}), '模型：partial-model');
});
