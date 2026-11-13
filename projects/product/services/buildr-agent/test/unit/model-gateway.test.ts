import test from 'node:test';

import assert from 'node:assert/strict';

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createModelAccess } from '../../src/model-access/application.ts';
import { createCustomModelProvider } from '../../src/model-access/providers/custom.ts';
import { type ExecutorGateway } from '../../src/executors/model-gateway.ts';
import { qoderGatewayPolicy, qoderGatewaySettings } from '../../src/executors/qoder/gateway.ts';
import { dshGatewayEffort, dshGatewayModels, dshCommandDeadlinePatch } from '../../src/executors/dsh/index.ts';

import type { ProtocolJson } from '../../src/model-access/contracts.ts';

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

test('Qoder selects its exact native model while retaining leased parameters and rejecting other routes', () => {
  const gateway: ExecutorGateway = { ...structuredClone(lease), nativeModel: {provider:'qoder',id:'qmodel_38max',accountIdentity:'account-fingerprint'} };
  const policy = qoderGatewayPolicy(gateway, gateway.models[0].id, 'high');
  assert.equal(policy.model, 'qmodel_38max');
  assert.deepEqual(policy.parameters, {contextWindow:200000,reasoningEffort:'high'});
  assert.throws(() => qoderGatewayPolicy(gateway,'other-model'), /model_mismatch/);
  assert.throws(() => qoderGatewayPolicy(gateway,undefined,'ultra'), (error:any) => error.code === 'agent_reasoning_unavailable');
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
  assert.deepEqual(dshGatewayModels(gateway), [{ id: 'opaque-model-route', name: 'GPT · Devin', contextWindow: 200000, input: ['text', 'image'], reasoningEfforts: { high: 'high', max: 'max' } }]);
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

test('DSH leaves request output and window adaptation native-owned without rewriting capabilities',()=>{
 for(const window of [500000,200000,100000,65536,undefined]){
  const gateway=structuredClone(lease);gateway.models[0].contextWindow=window;gateway.models[0].maxOutputTokens=393216;
  const before=structuredClone(gateway);const [model]=dshGatewayModels(gateway);
  assert.equal(model.contextWindow,window);assert.equal('maxTokens' in model,false);assert.deepEqual(gateway,before);
 }
 const gateway=structuredClone(lease);delete gateway.models[0].maxOutputTokens;assert.equal('maxTokens' in dshGatewayModels(gateway)[0],false);
});
test('isolated DSH foreground deadline policy keeps explicit background capability intact',()=>{
 const patches=dshCommandDeadlinePatch();assert.equal(patches.length,2);
 for(const patch of patches){assert.equal(patch.config.promoteOnTimeout,false);assert.equal('enableRunInBackground' in patch.config,false);}
 assert.deepEqual(patches.map(p=>p.id),['tool-bash','tool-pwsh']);
});

test('custom accounts stream tools and cancellation through the local gateway without exposing the upstream endpoint or key', {timeout:10000}, async t => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-custom-gateway-'));
  const upstream: Array<{ url: string; authorization: string | null; body: ProtocolJson }> = [];
  let cancelled = false, started!: () => void;
  const startedPromise = new Promise<void>(resolve => { started = resolve; });
  const sse = (events: unknown[]) => new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } });
  const mock: typeof fetch = async (url, init = {}) => {
    const target = String(url), authorization = new Headers(init.headers).get('authorization');
    if (target === 'https://gateway.example.com/v1/models') return Response.json({ data: [{ id: 'my-model-v2' }] });
    if (target !== 'https://gateway.example.com/v1/chat/completions') throw new Error('unexpected_test_network');
    const body = JSON.parse(String(init.body)) as ProtocolJson;
    upstream.push({ url: target, authorization, body });
    if (JSON.stringify(body).includes('hold-request')) {
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { started(); init.signal?.addEventListener('abort', () => { cancelled = true; controller.close(); }, { once: true }); } }), { headers: { 'content-type': 'text/event-stream' } });
    }
    return sse([
      { choices: [{ delta: { content: 'reading' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'read_file', arguments: '{"path":"README.md"}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
    ]);
  };
  const access = createModelAccess({ root, providers: [createCustomModelProvider({ fetch: mock })] });
  t.after(async () => { await access.close(); await rm(root, { recursive: true, force: true }); });
  const added = await access.accounts.add({ provider: 'custom', custom: { label: '我的网关', baseUrl: 'https://gateway.example.com/v1', protocol: 'chat-completions', useApiKey: true, apiKey: 'sk-upstream', models: [{ id: 'my-model-v2' }] } });
  await access.accounts.preferences(added.id, { expectedRevision: added.revision, models: [{ id: 'my-model-v2', enabled: true }] });
  const leaseInput = { accountId: added.id, modelId: 'my-model-v2', agentId: 'codex', conversationId: 'custom-chat', runId: 'custom-run' };
  const lease = await access.leases.create(leaseInput);
  assert.ok(lease.baseUrl.startsWith('http://127.0.0.1:') && !lease.baseUrl.includes('gateway.example.com'));
  assert.notEqual(lease.apiKey, 'sk-upstream');
  const tool = { type: 'function', name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } };
  const responses = await fetch(lease.baseUrl + '/responses', { method: 'POST', headers: { authorization: 'Bearer ' + lease.apiKey, 'content-type': 'application/json' }, body: JSON.stringify({ model: lease.model, stream: true, input: 'inspect', tools: [tool] }) });
  const text = await responses.text();
  assert.equal(responses.status, 200);
  assert.match(text, /read_file/); assert.match(text, /README\.md/); assert.match(text, /response\.completed/);
  assert.equal(upstream[0]?.url, 'https://gateway.example.com/v1/chat/completions');
  assert.equal(upstream[0]?.authorization, 'Bearer sk-upstream');
  assert.equal(upstream[0]?.body.model, 'my-model-v2');
  assert.ok(JSON.stringify(upstream[0]?.body).includes('read_file'));
  const cancelLease = await access.leases.create({ ...leaseInput, conversationId: 'custom-cancel', runId: 'custom-cancel-run' });
  const pending = fetch(cancelLease.baseUrl + '/responses', { method: 'POST', headers: { authorization: 'Bearer ' + cancelLease.apiKey, 'content-type': 'application/json' }, body: JSON.stringify({ model: cancelLease.model, stream: true, input: 'hold-request' }) });
  await startedPromise; access.leases.stopRun('custom-cancel', 'custom-cancel-run');
  await pending.catch(() => undefined);
  for (let i = 0; i < 100 && !cancelled; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(cancelled, true);
  const late = await fetch(cancelLease.baseUrl + '/responses', { method: 'POST', headers: { authorization: 'Bearer ' + cancelLease.apiKey, 'content-type': 'application/json' }, body: JSON.stringify({ model: cancelLease.model, stream: true, input: 'hold-request' }) });
  assert.equal(late.status, 409);
  assert.ok(!JSON.stringify(access.accounts.list()).includes('sk-upstream'));
});
