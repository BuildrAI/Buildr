import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkedGateway, consumerBinding, gatewayModel, qoderGatewayPolicy, type ExecutorGateway } from '../../src/executors/model-gateway.ts';
import { writeGatewayPatch, DshRuntime } from '../../src/executors/dsh/index.ts';
import { createCodexExecutor } from '../../src/executors/codex/index.ts';
import { createQoderExecutor } from '../../src/executors/qoder/index.ts';

const lease: ExecutorGateway = { identity: 'source/account/model/conversation', baseUrl: 'http://127.0.0.1:8317/v1', apiKey: 'local-only-lease', models: [{ id: 'opaque-model-route', label: 'GPT · Devin', contextWindow: 200000, maxOutputTokens: 32000, vision: true, tools: true, reasoningEfforts: [{ id: 'high', label: 'High' }], defaultReasoningEffort: 'high' }] };
test('a model lease binds source identity across endpoint/key rotation and refuses another source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-gateway-binding-'));
  try {
    const executable = join(root, 'codex.mjs'); await writeFile(executable, '');
    const options = { connectionId: 'c', configRoot: root, environment: {}, gateway: lease };
    const binding = await consumerBinding('codex', executable, '0.163.0', root, options);
    const rotated = await consumerBinding('codex', executable, '0.164.0', root, { ...options, gateway: { ...lease, apiKey: 'replacement', baseUrl: 'http://127.0.0.1:9000/v1' }, binding });
    assert.equal(rotated.identity, binding.identity);
    await assert.rejects(consumerBinding('codex', executable, '0.163.0', root, { ...options, gateway: { ...lease, identity: 'other-source' }, binding }), /binding_mismatch/);
    await assert.rejects(consumerBinding('codex', executable, '0.163.0', root, { ...options, gateway: undefined, binding }), /binding_mismatch/);
    assert.throws(() => checkedGateway({ ...lease, baseUrl: 'https://remote.example/v1' }), /lease_invalid/);
    assert.throws(() => gatewayModel(lease, 'unbound-model'), /model_mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('Qoder receives only the local credential and validated capabilities for every purpose', () => {
  const policy = qoderGatewayPolicy(lease);
  assert.equal(policy.model.api_key, 'local-only-lease');
  assert.equal(policy.model.url, 'http://127.0.0.1:8317/v1');
  assert.equal(policy.model.model, 'opaque-model-route');
  assert.deepEqual(policy.parameters, { contextWindow: 200000, reasoningEffort: 'high' });
  assert.throws(() => qoderGatewayPolicy(lease, undefined, 'max'), /reasoning_unavailable/);
});
test('DSH overlay adds the gateway route without putting secrets into configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-dsh-gateway-'));
  try {
    await writeFile(join(root, 'cordis.patch.yml'), 'existing-user-content\n');
    const patch = JSON.parse(await readFile(await writeGatewayPatch(root, lease), 'utf8'));
    assert.equal(patch[0].config.providers['buildr-models'].api, 'openai-responses');
    assert.equal(patch[0].config.providers['buildr-models'].models[0].contextWindow, 200000);
    assert.ok(!JSON.stringify(patch).includes(lease.apiKey));
    assert.equal(await readFile(join(root, 'cordis.patch.yml'), 'utf8'), 'existing-user-content\n');
    const runtime = Reflect.construct(DshRuntime, ['binding', {}, { remote: { account: { getState() { throw new Error('native account must not be required'); } } } }]);
    runtime.gateway = lease;
    assert.equal((await runtime.inspectAccount()).status, 'ready');
    assert.equal((await runtime.models())[0].id, 'opaque-model-route');
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('Codex gateway consumes a private catalog and can run without an OpenAI account', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-codex-gateway-')); let runtime: Awaited<ReturnType<ReturnType<typeof createCodexExecutor>['open']>> | undefined;
  try {
    const executable = join(root, 'codex.mjs');
    const source = (await readFile(new URL('./fixtures/codex-cli.mjs', import.meta.url), 'utf8')).replace("if(m.method==='initialize'){", "if(m.method==='initialize'){fs.writeFileSync(path.join(process.env.CODEX_HOME,'launch.json'),JSON.stringify({args:process.argv,key:process.env.BUILDR_MODEL_GATEWAY_KEY}));").replace("{account:{type:'chatgpt',planType:'fixture'}}", "{account:null,requiresOpenaiAuth:false}");
    await writeFile(executable, source);
    runtime = await createCodexExecutor().open({ connectionId: 'codex', configRoot: root, executable, environment: { PATH: process.env.PATH ?? '' }, gateway: lease });
    assert.equal((await runtime.inspectAccount()).status, 'ready');
    assert.equal((await runtime.models())[0].id, lease.models[0].id);
    const launch = JSON.parse(await readFile(join(root, 'codex-home/launch.json'), 'utf8'));
    assert.equal(launch.key, lease.apiKey);
    assert.ok(launch.args.includes('model_providers.buildr-models.requires_openai_auth=false'));
    assert.ok(!launch.args.join(' ').includes(lease.apiKey));
    const catalog = JSON.parse(await readFile(join(root, 'codex-home/buildr-model-catalog.json'), 'utf8'));
    assert.equal(catalog.models[0].slug, lease.models[0].id);
    assert.equal(catalog.models[0].context_window, 200000);
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});
test('Qoder SDK injects the same gateway model into main, title, compression and subagent requests', { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-gateway-')); let runtime: Awaited<ReturnType<ReturnType<typeof createQoderExecutor>['open']>> | undefined;
  try {
    const executable = join(root, 'qoder.mjs');
    const source = (await readFile(new URL('./fixtures/qoder-cli.mjs', import.meta.url), 'utf8'))
      .replace("import{createInterface}", "import fs from'node:fs';import path from'node:path';const policies=[];import{createInterface}")
      .replace("if(m.type==='user'){input=m;", "if(m.type==='control_response'&&m.response.request_id.startsWith('policy-')){policies.push(m.response.response);fs.writeFileSync(path.join(process.env.QODER_CONFIG_DIR,'policies.json'),JSON.stringify(policies));if(policies.length===5)emit({type:'result',subtype:'success',is_error:false,terminal_reason:'completed',session_id:sid,uuid:'end',num_turns:1,usage:{},modelUsage:{},permission_denials:[],result:'ok'});return;}if(m.type==='user'){sid=m.session_id;for(const purpose of ['main','plan','title','compression','subagent'])emit({type:'control_request',request_id:'policy-'+purpose,request:{type:'get_model_policy',purpose,sessionId:sid,turnIndex:0,resolvedModel:'fixture-model',models:[]}});return;input=m;");
    await writeFile(executable, source);
    runtime = await createQoderExecutor().open({ connectionId: 'qoder', configRoot: root, nativeAccountConfigRoot: join(root, 'native-account'), executable, environment: { PATH: process.env.PATH ?? '' }, gateway: lease });
    const contextRef = await runtime.createContext({ cwd: root });
    await runtime.send({ contextRef, cwd: root, text: 'local protocol test', images: [], model: lease.models[0].id, reasoningEffort: 'high', clientRequestId: 'd147cb04-e958-48e4-98c3-010f0727ece5', onEvent() {} });
    const policies = JSON.parse(await readFile(join(root, 'native-account/qoder-config/policies.json'), 'utf8'));
    assert.equal(policies.length, 5);
    for (const policy of policies) {
      assert.equal(policy.model, lease.models[0].id);
      assert.equal(policy.custom_model.api_key, lease.apiKey);
      assert.equal(policy.custom_model.url, lease.baseUrl);
      assert.equal(policy.parameters.reasoningEffort, 'high');
    }
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});
test('Qoder reports its required platform login without demanding native paid models', { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-qoder-auth-gateway-'));
  try {
    const executable = join(root, 'qoder.mjs');
    const source = (await readFile(new URL('./fixtures/qoder-cli.mjs', import.meta.url), 'utf8')).replace("account:{userId:'fixture-user',subscriptionType:'test'}", 'account:{}').replace("ack(m.request_id,{userId:'fixture-user'});", 'ack(m.request_id,{});');
    await writeFile(executable, source);
    await assert.rejects(createQoderExecutor().open({ connectionId: 'qoder', configRoot: root, executable, environment: { PATH: process.env.PATH ?? '' }, gateway: lease }), /qoder_platform_login_required/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
