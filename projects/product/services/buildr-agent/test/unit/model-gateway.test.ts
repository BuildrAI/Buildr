import test from 'node:test';

import assert from 'node:assert/strict';

import { qoderGatewayPolicy, type ExecutorGateway } from '../../src/executors/model-gateway.ts';

const lease: ExecutorGateway = { identity: 'source/account/model/conversation', baseUrl: 'http://127.0.0.1:8317/v1', apiKey: 'local-only-lease', models: [{ id: 'opaque-model-route', label: 'GPT · Devin', contextWindow: 200000, maxOutputTokens: 32000, vision: true, tools: true, reasoningEfforts: [{ id: 'high', label: 'High' }], defaultReasoningEffort: 'high' }] };

test('Qoder receives only the local credential and validated capabilities for every purpose', () => {
  const policy = qoderGatewayPolicy(lease);
  assert.equal(policy.model.api_key, 'local-only-lease');
  assert.equal(policy.model.url, 'http://127.0.0.1:8317/v1');
  assert.equal(policy.model.model, 'opaque-model-route');
  assert.deepEqual(policy.parameters, { contextWindow: 200000, reasoningEffort: 'high' });
  assert.throws(() => qoderGatewayPolicy(lease, undefined, 'max'), /reasoning_unavailable/);
});
