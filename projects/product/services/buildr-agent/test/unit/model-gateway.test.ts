import test from 'node:test';

import assert from 'node:assert/strict';

import { qoderGatewayPolicy, qoderGatewaySettings, type ExecutorGateway } from '../../src/executors/model-gateway.ts';
import { dshGatewayEffort, dshGatewayModels } from '../../src/executors/dsh/index.ts';

const lease: ExecutorGateway = { identity: 'source/account/model/conversation', baseUrl: 'http://127.0.0.1:8317/v1', apiKey: 'local-only-lease', models: [{ id: 'opaque-model-route', label: 'GPT · Devin', contextWindow: 200000, maxOutputTokens: 32000, vision: true, tools: true, reasoningEfforts: [{ id: 'high', label: 'High' }], defaultReasoningEffort: 'high' }] };

test('Qoder registers one query-local direct provider with validated model capabilities', () => {
  const original = structuredClone(lease);
  const settings = qoderGatewaySettings(lease), ids = Object.keys(settings.providers);
  assert.equal(ids.length, 1);
  const provider = settings.providers[ids[0]];
  assert.deepEqual(provider, { type: 'openai-compatible', protocol: 'openai', authType: 'bearer', baseUrl: lease.baseUrl, apiKey: '${BUILDR_MODEL_GATEWAY_KEY}', displayName: 'Buildr', model: lease.models[0].id, models: [{ model: lease.models[0].id, displayName: lease.models[0].label, contextWindow: 200000, maxOutputTokens: 32000, capabilities: { tools: true, vision: true, thinking: { modes: ['enabled'], preferredMode: 'enabled', supportsEffort: true, supportedEffortLevels: ['high'] } } }] });
  assert.ok(!JSON.stringify(settings).includes(lease.apiKey));
  const policy = qoderGatewayPolicy(lease);
  assert.equal(policy.model, ids[0] + '/' + lease.models[0].id);
  assert.deepEqual(policy.parameters, { contextWindow: 200000, reasoningEffort: 'high' });
  assert.equal(qoderGatewayPolicy({ ...lease, baseUrl: 'http://127.0.0.1:9000/v1', apiKey: 'rotated' }).model, policy.model);
  assert.notEqual(qoderGatewayPolicy({ ...lease, identity: 'other-source' }).model, policy.model);
  assert.throws(() => qoderGatewayPolicy(lease, 'unbound-model'), /model_mismatch/);
  assert.deepEqual(lease, original);
});

test('Qoder filters unsupported declarations and rejects selected or default effort without downgrading', () => {
  const gateway = structuredClone(lease), model = gateway.models[0];
  model.reasoningEfforts = ['off', 'none', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map(id => ({ id, label: id }));
  model.defaultReasoningEffort = 'ultra';
  model.tools = false; model.vision = false;
  const original = structuredClone(gateway), provider = Object.values(qoderGatewaySettings(gateway).providers)[0];
  assert.deepEqual(provider.models[0].capabilities, { tools: false, vision: false, thinking: { modes: ['enabled'], preferredMode: 'enabled', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] } });
  assert.equal(qoderGatewayPolicy(gateway, undefined, 'high').parameters.reasoningEffort, 'high');
  for (const effort of ['off', 'none', 'ultra', 'unadvertised']) assert.throws(() => qoderGatewayPolicy(gateway, undefined, effort), (error: any) => error.code === 'agent_reasoning_unavailable');
  assert.throws(() => qoderGatewayPolicy(gateway), (error: any) => error.code === 'agent_reasoning_unavailable');
  assert.deepEqual(gateway, original);
  model.reasoningEfforts = [{ id: 'ultra', label: 'Ultra' }]; delete model.defaultReasoningEffort;
  assert.throws(() => qoderGatewayPolicy(gateway), (error: any) => error.code === 'agent_reasoning_unavailable');
  model.reasoningEfforts = [];
  assert.equal(Object.values(qoderGatewaySettings(gateway).providers)[0].models[0].capabilities.thinking, undefined);
  assert.equal(qoderGatewayPolicy(gateway).parameters.reasoningEffort, undefined);
});

test('DSH keeps supported reasoning levels when a model also offers an unrepresentable level', () => {
  const gateway = structuredClone(lease);
  gateway.models[0].reasoningEfforts = [{ id: 'high', label: 'High' }, { id: 'max', label: 'Maximum' }, { id: 'ultra', label: 'Ultra' }];
  const original = structuredClone(gateway);
  assert.deepEqual(dshGatewayModels(gateway), [{ id: 'opaque-model-route', name: 'GPT · Devin', contextWindow: 200000, maxTokens: 32000, input: ['text', 'image'], reasoningEfforts: { high: 'high', max: 'max' } }]);
  assert.equal(dshGatewayEffort(gateway, undefined, 'high'), 'high');
  assert.throws(() => dshGatewayEffort(gateway, undefined, 'ultra'), (error: any) => error.code === 'agent_reasoning_unavailable');
  assert.deepEqual(gateway, original);
});

test('DSH does not silently replace an unsupported default or treat it as no reasoning', () => {
  const gateway = structuredClone(lease);
  gateway.models[0].reasoningEfforts = [{ id: 'ultra', label: 'Ultra' }];
  gateway.models[0].defaultReasoningEffort = 'ultra';
  assert.throws(() => dshGatewayEffort(gateway), (error: any) => error.code === 'agent_reasoning_unavailable');
  delete gateway.models[0].defaultReasoningEffort;
  assert.throws(() => dshGatewayEffort(gateway), (error: any) => error.code === 'agent_reasoning_unavailable');
  gateway.models[0].reasoningEfforts = [];
  assert.deepEqual(dshGatewayModels(gateway)[0].reasoningEfforts, false);
  assert.equal(dshGatewayEffort(gateway), undefined);
});
