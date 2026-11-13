import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { createAgentService } from '../../src/application/agent-service.ts';
import type { AgentCapabilities, AgentExecutor, AgentRuntime, ExecutorOpenOptions, ModelGatewayConfiguration } from '../../src/contracts.ts';
import { createNativeExecutors } from '../../src/executors/index.ts';
import { qoderCnModelAccountId } from '../../src/executors/qoder/product.ts';
import type { ModelOffering, ModelProtocol, ModelProvider } from '../../src/model-access/contracts.ts';
import { createCustomModelProvider } from '../../src/model-access/providers/custom.ts';

const builtinDescriptors = new Map(createNativeExecutors().map(executor => [executor.descriptor.id, executor.descriptor]));

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

const baseCapabilities: AgentCapabilities = {
  text: true,
  images: true,
  approval: true,
  questions: true,
  stop: true,
  resume: true,
  permissionModes: ['default', 'full-access'],
  maxInputBytes: 64 * 1024,
};

interface FakeExecutorCall {
  connectionId: string;
  options: ExecutorOpenOptions;
  prompts: Array<{ contextId: string; text: string; permissionMode: string }>;
}

function createCharacterizedExecutor(
  id: 'codex' | 'dsh' | 'qoder' | 'qoder-cn' | 'claude-code',
  label: string,
  state: {
    status?: 'ready' | 'expired' | 'not-authenticated' | 'failed';
    nativeModels?: Array<{ id: string; label: string; isDefault?: boolean }>;
    calls: FakeExecutorCall[];
  },
): AgentExecutor {
  let contextCounter = 0;
  const builtin = builtinDescriptors.get(id);
  return {
    descriptor: {
      id,
      label,
      capabilities: baseCapabilities,
      ...(builtin?.modelPolicy ? { modelPolicy: builtin.modelPolicy } : {}),
      ...(builtin?.runtimeTraits ? { runtimeTraits: builtin.runtimeTraits } : {}),
    },
    async open(options): Promise<AgentRuntime> {
      const record: FakeExecutorCall = { connectionId: id, options, prompts: [] };
      state.calls.push(record);
      let closed = false;
      let lastExecRef: { id: string; data?: Record<string, unknown> } | undefined;
      const bindingIdentity = `binding:${id}:${options.gateway?.identity ?? 'native'}`;
      return {
        get closed() { return closed; },
        capabilities: baseCapabilities,
        bindingIdentity,
        bindingData: { format: 'test-binding/v1', provider: id, ...(options.gateway ? { gatewayIdentity: options.gateway.identity } : {}) },
        async verifyUpgrade() {},
        async inspectAccount() {
          const status = state.status ?? (id === 'claude-code' ? 'not-authenticated' : 'ready');
          return {
            status,
            label: `${label} Account`,
            loginMethod: `${label} Login`,
            ...(status === 'expired' ? { diagnostic: `${label} expired` } : {}),
          };
        },
        async models() {
          if (id === 'claude-code') return [];
          return (state.nativeModels ?? [{ id: `${id}-native-1`, label: `${label} Native`, isDefault: true, reasoningEfforts: [{ id: 'low', label: 'Low' }, { id: 'high', label: 'High' }], defaultReasoningEffort: 'low' }]);
        },
        async beginLogin() {},
        async cancelLogin() {},
        async createContext(input) {
          const cid = `${id === 'dsh' ? 'session-' : ''}${++contextCounter === 1 ? UUID_A : UUID_B}`;
          return { id: cid, data: { cwd: input.cwd } };
        },
        async resumeContext() {},
        async readHistory() { return []; },
        async send(input) {
          record.prompts.push({ contextId: input.contextRef.id, text: input.text, permissionMode: input.permissionMode ?? 'default' });
          const execRef = { id: `exec-${record.prompts.length}`, data: { resourceBinding: bindingIdentity, resourceContext: input.contextRef.id } };
          lastExecRef = execRef;
          input.onEvent({ type: 'accepted', executionRef: execRef, inputItemId: `u-${record.prompts.length}` });
          input.onEvent({ type: 'item', item: { id: `a-${record.prompts.length}`, kind: 'message', role: 'assistant', text: `reply:${id}`, status: 'completed', executionId: execRef.id } });
          input.onEvent({ type: 'observation', observation: { status: 'idle', executionRef: execRef, tools: [], backgroundWork: false } });
          input.onEvent({ type: 'completed', status: 'completed' });
        },
        async observe(input) {
          return { status: 'idle', executionRef: input.executionRef ?? lastExecRef, tools: [], backgroundWork: false };
        },
        async canRelease() { return true; },
        async stop(input) {
          return { status: 'stopped', executionRef: input.executionRef, tools: [], backgroundWork: false };
        },
        async reply() {},
        async close() { closed = true; },
      };
    },
  };
}

function createFakeSourceProvider(spec: {
  id: string;
  label: string;
  connectionId?: string;
  linked?: boolean;
  singleton?: boolean;
  protocol?: ModelProtocol;
  state: {
    status: 'ready' | 'expired' | 'not-authenticated' | 'failed';
    identity: string;
    models: ModelOffering[];
    inferCalls: Array<{ modelId: string; agentId: string; body: unknown }>;
  };
}): ModelProvider {
  const protocol = spec.protocol ?? 'chat-completions';
  return {
    id: spec.id,
    label: spec.label,
    ...(spec.connectionId ? { connectionId: spec.connectionId } : {}),
    ...(spec.linked ? { linked: true } : {}),
    ...(spec.singleton ? { singleton: true } : {}),
    async open() {
      return {
        protocol,
        identity: async () => spec.state.identity,
        async inspect() {
          return {
            status: spec.state.status,
            identity: spec.state.identity,
            label: `${spec.label} Account`,
            models: spec.state.status === 'ready' ? spec.state.models : [],
            quota: { available: true, remainingPercent: 80, observedAt: '2026-11-13T00:00:00.000Z' },
          };
        },
        async beginLogin() {},
        async cancelLogin() {},
        async infer(input) {
          spec.state.inferCalls.push({ modelId: input.modelId, agentId: input.context.agentId, body: input.body });
          return Response.json({
            id: 'gen-1',
            choices: [{ index: 0, message: { role: 'assistant', content: '{"title":"生成标题"}' }, finish_reason: 'stop' }],
          });
        },
        async close() {},
      };
    },
  };
}

function setupHarness(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'executor-policy-char-')));
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const execCalls: FakeExecutorCall[] = [];
  const executorStates = {
    codex: { status: 'ready' as 'ready' | 'expired' | 'not-authenticated' | 'failed', calls: execCalls },
    dsh: { status: 'ready' as 'ready' | 'expired' | 'not-authenticated' | 'failed', calls: execCalls },
    qoder: { status: 'ready' as 'ready' | 'expired' | 'not-authenticated' | 'failed', calls: execCalls },
    'qoder-cn': { status: 'ready' as 'ready' | 'expired' | 'not-authenticated' | 'failed', calls: execCalls },
    'claude-code': { status: 'not-authenticated' as 'ready' | 'expired' | 'not-authenticated' | 'failed', calls: execCalls },
  };
  const executors = [
    createCharacterizedExecutor('codex', 'Codex', executorStates.codex),
    createCharacterizedExecutor('dsh', 'DSH', executorStates.dsh),
    createCharacterizedExecutor('qoder', 'Qoder', executorStates.qoder),
    createCharacterizedExecutor('qoder-cn', 'Qoder CN', executorStates['qoder-cn']),
    createCharacterizedExecutor('claude-code', 'Claude Code', executorStates['claude-code']),
  ];
  const makeOffering = (id: string, label: string): ModelOffering => ({
    id,
    label,
    images: true,
    tools: true,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    reasoningEfforts: [{ id: 'low', label: 'Low' }, { id: 'high', label: 'High' }],
    defaultReasoningEffort: 'low',
  });
  const sourceStates = {
    codex: { status: 'ready' as 'ready' | 'expired' | 'not-authenticated' | 'failed', identity: 'id-codex-1', models: [makeOffering('gpt-5-codex', 'GPT-5 Codex')], inferCalls: [] as Array<{ modelId: string; agentId: string; body: unknown }> },
    'native-qoder': { status: 'ready' as 'ready' | 'expired' | 'not-authenticated' | 'failed', identity: 'qoder:u1', models: [makeOffering('qoder-pro', 'Qoder Pro')], inferCalls: [] as Array<{ modelId: string; agentId: string; body: unknown }> },
    [qoderCnModelAccountId]: { status: 'ready' as 'ready' | 'expired' | 'not-authenticated' | 'failed', identity: 'qoder-cn:u1', models: [makeOffering('qoder-cn-pro', 'Qoder CN Pro')], inferCalls: [] as Array<{ modelId: string; agentId: string; body: unknown }> },
    devin: { status: 'ready' as 'ready' | 'expired' | 'not-authenticated' | 'failed', identity: 'id-devin-1', models: [makeOffering('swe-1.5', 'SWE-1.5')], inferCalls: [] as Array<{ modelId: string; agentId: string; body: unknown }> },
    openai: { status: 'ready' as 'ready' | 'expired' | 'not-authenticated' | 'failed', identity: 'id-openai-1', models: [makeOffering('gpt-4.1', 'GPT-4.1')], inferCalls: [] as Array<{ modelId: string; agentId: string; body: unknown }> },
    anthropic: { status: 'ready' as 'ready' | 'expired' | 'not-authenticated' | 'failed', identity: 'id-anthropic-1', models: [makeOffering('claude-sonnet-4-5', 'Claude Sonnet 4.5')], inferCalls: [] as Array<{ modelId: string; agentId: string; body: unknown }> },
  };
  const customFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/models')) {
      return Response.json({ data: [{ id: 'custom-m1', name: 'Custom M1' }] });
    }
    sourceStates.openai.inferCalls.push({ modelId: 'custom-m1', agentId: 'custom', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json({ id: 'c1', choices: [{ index: 0, message: { role: 'assistant', content: '{"title":"自定义标题"}' }, finish_reason: 'stop' }] });
  };
  const modelProviders: ModelProvider[] = [
    createFakeSourceProvider({ id: 'codex', label: 'Codex / ChatGPT', singleton: true, state: sourceStates.codex }),
    createFakeSourceProvider({ id: 'native-qoder', label: 'Qoder', connectionId: 'qoder', state: sourceStates['native-qoder'] }),
    createFakeSourceProvider({ id: qoderCnModelAccountId, label: 'Qoder CN', linked: true, state: sourceStates[qoderCnModelAccountId] }),
    createFakeSourceProvider({ id: 'devin', label: 'Devin', singleton: true, state: sourceStates.devin }),
    createFakeSourceProvider({ id: 'openai', label: 'ChatGPT API', singleton: true, state: sourceStates.openai }),
    createFakeSourceProvider({ id: 'anthropic', label: 'Claude API', singleton: true, protocol: 'anthropic-messages', state: sourceStates.anthropic }),
    createCustomModelProvider({ fetch: customFetch }),
  ];
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const executables: Record<string, string> = {};
  for (const id of ['codex', 'dsh', 'qoder', 'qoder-cn', 'claude-code']) {
    const exe = path.join(binDir, id);
    fs.writeFileSync(exe, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    executables[id] = exe;
  }
  const service = createAgentService({
    dataRoot: path.join(root, 'data'),
    executors,
    modelProviders,
    resolveWorkspace: async () => ({ rootPath: workspace }),
  });
  t.after(async () => {
    await service.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, workspace, service, execCalls, executorStates, sourceStates, executables };
}

async function prepareSourcesAndConnections(harness: ReturnType<typeof setupHarness>) {
  const { service, executables } = harness;
  for (const id of ['codex', 'dsh', 'qoder', 'qoder-cn'] as const) {
    const view = service.connections.read(id);
    await service.connections.connect(id, { expectedRevision: view.revision, executable: executables[id] });
  }
  const claudeView = service.connections.read('claude-code');
  await service.connections.connect('claude-code', { expectedRevision: claudeView.revision, executable: executables['claude-code'] });

  const accounts: Record<string, { id: string; modelId: string }> = {};
  await service.models.accounts.list({ refresh: true });
  const enableAll = async (accountId: string) => {
    const checked = await service.models.accounts.check(accountId);
    assert.equal(checked.status, 'ready', accountId);
    const enabled = await service.models.accounts.preferences(checked.id, {
      expectedRevision: checked.revision,
      models: checked.models.map(m => ({ id: m.id, enabled: true })),
    });
    return { id: enabled.id, modelId: enabled.models[0]!.id };
  };
  for (const providerId of ['codex', 'devin', 'openai', 'anthropic'] as const) {
    const created = await service.models.accounts.add({ provider: providerId });
    accounts[providerId] = await enableAll(created.id);
  }
  accounts['native-qoder'] = await enableAll('native-qoder');
  accounts['qoder-cn'] = await enableAll(qoderCnModelAccountId);
  const customCreated = await service.models.accounts.add({
    provider: 'custom',
    label: 'Custom Gateway',
    custom: { label: 'Custom Gateway', protocol: 'chat-completions', baseUrl: 'https://api.example.com/v1', useApiKey: true, apiKey: 'sk-custom-test', models: [{ id: 'custom-m1', label: 'Custom M1' }] },
  });
  accounts.custom = await enableAll(customCreated.id);
  return accounts;
}

test('characterization: 5 executors × representative model sources send validation outcomes and error codes', async t => {
  const harness = setupHarness(t);
  const accounts = await prepareSourcesAndConnections(harness);
  const { service } = harness;

  const expectAccepted = async (connectionId: string, modelAccountId?: string, model?: string) => {
    const chat = await service.conversations.create('ws', {});
    const preview = service.conversations.prepareSend('ws', chat.id, {
      expectedRevision: chat.revision,
      connectionId,
      ...(modelAccountId ? { modelAccountId } : {}),
      ...(model ? { model } : {}),
      text: '验证配对',
    });
    assert.equal(preview.connectionId, connectionId);
    assert.equal(preview.fits, true);
    return preview;
  };

  const expectRejected = async (connectionId: string, code: string, messagePattern: RegExp, draft: Partial<{ modelAccountId: string; modelAccountIdentity: string; model: string; permissionMode: 'default' | 'full-access' }> = {}) => {
    const chat = await service.conversations.create('ws', {});
    assert.throws(
      () => service.conversations.prepareSend('ws', chat.id, {
        expectedRevision: chat.revision,
        connectionId,
        text: '验证拒绝',
        ...draft,
      }),
      (error: any) => {
        assert.equal(error?.code, code, `${connectionId} expected ${code}, got ${error?.code}: ${error?.message}`);
        assert.match(String(error?.message ?? ''), messagePattern);
        return true;
      },
    );
  };

  // 1. Native (omitted modelAccountId):
  await expectAccepted('codex');
  await expectAccepted('dsh');
  await expectAccepted('qoder');
  const qoderCnDefault = await expectAccepted('qoder-cn');
  assert.equal(qoderCnDefault.modelAccountId, qoderCnModelAccountId);
  assert.equal(qoderCnDefault.model, 'qoder-cn-pro');
  await expectRejected('claude-code', 'agent_account_unavailable', /连接所选模型供应商/);

  // 2. Gateway-capable executors (codex, dsh, claude-code) accept all 7 shared/gateway sources:
  for (const executorId of ['codex', 'dsh', 'claude-code'] as const) {
    for (const sourceKey of ['codex', 'native-qoder', 'qoder-cn', 'devin', 'openai', 'anthropic', 'custom'] as const) {
      const target = accounts[sourceKey]!;
      const preview = await expectAccepted(executorId, target.id, target.modelId);
      assert.equal(preview.modelAccountId, target.id);
      assert.equal(preview.model, target.modelId);
    }
  }

  // 3. Exclusive native executors (qoder, qoder-cn) accept ONLY their own native source and reject all other sources:
  await expectAccepted('qoder', accounts['native-qoder']!.id, accounts['native-qoder']!.modelId);
  for (const other of ['codex', 'qoder-cn', 'devin', 'openai', 'anthropic', 'custom'] as const) {
    await expectRejected('qoder', 'agent_model_source_unsupported', /Qoder Agent 暂不支持选择其他供应商的模型，请改用 Qoder 原生模型/, {
      modelAccountId: accounts[other]!.id,
      model: accounts[other]!.modelId,
    });
  }

  await expectAccepted('qoder-cn', accounts['qoder-cn']!.id, accounts['qoder-cn']!.modelId);
  for (const other of ['codex', 'native-qoder', 'devin', 'openai', 'anthropic', 'custom'] as const) {
    await expectRejected('qoder-cn', 'agent_model_source_unsupported', /Qoder CN Agent 暂不支持选择其他供应商的模型，请改用 Qoder CN 原生模型/, {
      modelAccountId: accounts[other]!.id,
      model: accounts[other]!.modelId,
    });
  }
});

test('characterization: send validation rejection order and Qoder CN readySourceSupersedesConnection exception', async t => {
  const harness = setupHarness(t);
  const accounts = await prepareSourcesAndConnections(harness);
  const { service, executorStates, sourceStates } = harness;

  // Step 4 vs Step 6: Qoder expired connection beats missing/unready source lookup
  executorStates.qoder.status = 'expired';
  await service.connections.check('qoder');
  {
    const chat = await service.conversations.create('ws', {});
    assert.throws(
      () => service.conversations.prepareSend('ws', chat.id, {
        expectedRevision: chat.revision,
        connectionId: 'qoder',
        modelAccountId: 'missing-account-id',
        text: '测试顺序',
      }),
      (error: any) => error?.code === 'qoder_platform_login_expired',
    );
  }

  // Step 4 platformLogin: Qoder not-authenticated + explicit source -> qoder_platform_login_required (before source compatibility!)
  executorStates.qoder.status = 'not-authenticated';
  await service.connections.check('qoder');
  {
    const chat = await service.conversations.create('ws', {});
    assert.throws(
      () => service.conversations.prepareSend('ws', chat.id, {
        expectedRevision: chat.revision,
        connectionId: 'qoder',
        modelAccountId: accounts.openai!.id,
        model: accounts.openai!.modelId,
        text: '测试平台登录',
      }),
      (error: any) => error?.code === 'qoder_platform_login_required',
    );
  }
  executorStates.qoder.status = 'ready';
  await service.connections.check('qoder');

  // Step 3 Qoder CN exception: stale connection status ('expired' or 'not-authenticated') does NOT veto when Qoder CN model account is ready!
  for (const staleStatus of ['expired', 'not-authenticated'] as const) {
    executorStates['qoder-cn'].status = staleStatus;
    await service.connections.check('qoder-cn');
    const chat = await service.conversations.create('ws', {});
    const preview = service.conversations.prepareSend('ws', chat.id, {
      expectedRevision: chat.revision,
      connectionId: 'qoder-cn',
      text: 'CN 就绪来源优先',
    });
    assert.equal(preview.modelAccountId, qoderCnModelAccountId);
    assert.equal(preview.model, 'qoder-cn-pro');
  }

  // Conversely, when Qoder CN model account itself is expired AND connection is expired -> qoder_platform_login_expired
  sourceStates[qoderCnModelAccountId].status = 'expired';
  await service.models.accounts.check(qoderCnModelAccountId);
  executorStates['qoder-cn'].status = 'expired';
  await service.connections.check('qoder-cn');
  {
    const chat = await service.conversations.create('ws', {});
    assert.throws(
      () => service.conversations.prepareSend('ws', chat.id, {
        expectedRevision: chat.revision,
        connectionId: 'qoder-cn',
        text: 'CN 均过期',
      }),
      (error: any) => error?.code === 'qoder_platform_login_expired',
    );
  }
  sourceStates[qoderCnModelAccountId].status = 'ready';
  await service.models.accounts.check(qoderCnModelAccountId);
  executorStates['qoder-cn'].status = 'ready';
  await service.connections.check('qoder-cn');

  // Step 6 vs Step 7: Unauthenticated or changed source fails with source status/identity error BEFORE incompatibility
  sourceStates.openai.status = 'expired';
  await service.models.accounts.check(accounts.openai!.id);
  {
    const chat = await service.conversations.create('ws', {});
    assert.throws(
      () => service.conversations.prepareSend('ws', chat.id, {
        expectedRevision: chat.revision,
        connectionId: 'qoder',
        modelAccountId: accounts.openai!.id,
        model: accounts.openai!.modelId,
        text: '过期优先于不兼容',
      }),
      (error: any) => error?.code === 'agent_model_source_unavailable',
    );
  }
  sourceStates.openai.status = 'ready';
  const refreshedOpenai = await service.models.accounts.check(accounts.openai!.id);
  {
    const chat = await service.conversations.create('ws', {});
    assert.throws(
      () => service.conversations.prepareSend('ws', chat.id, {
        expectedRevision: chat.revision,
        connectionId: 'qoder',
        modelAccountId: refreshedOpenai.id,
        modelAccountIdentity: 'stale-identity',
        model: accounts.openai!.modelId,
        text: '身份变化优先于不兼容',
      }),
      (error: any) => error?.code === 'agent_model_source_changed',
    );
  }

  // Step 7 vs Step 8: Incompatible source fails with agent_model_source_unsupported BEFORE missing/disabled model
  {
    const chat = await service.conversations.create('ws', {});
    assert.throws(
      () => service.conversations.prepareSend('ws', chat.id, {
        expectedRevision: chat.revision,
        connectionId: 'qoder',
        modelAccountId: refreshedOpenai.id,
        model: 'non-existent-model',
        text: '不兼容优先于模型不存在',
      }),
      (error: any) => error?.code === 'agent_model_source_unsupported',
    );
  }

  // Step 8: Compatible source with disabled model returns agent_model_disabled (never incompatible)
  await service.models.accounts.preferences(refreshedOpenai.id, {
    expectedRevision: refreshedOpenai.revision,
    models: [{ id: accounts.openai!.modelId, enabled: false }],
  });
  {
    const chat = await service.conversations.create('ws', {});
    assert.throws(
      () => service.conversations.prepareSend('ws', chat.id, {
        expectedRevision: chat.revision,
        connectionId: 'codex',
        modelAccountId: refreshedOpenai.id,
        model: accounts.openai!.modelId,
        text: '兼容但模型停用',
      }),
      (error: any) => error?.code === 'agent_model_disabled',
    );
  }
});

test('characterization: prepare vs send lease issuance, nativeModel passthrough, shared native home, Devin+Codex permission hash, and models.generate', async t => {
  const harness = setupHarness(t);
  const accounts = await prepareSourcesAndConnections(harness);
  const { service, execCalls, sourceStates, root } = harness;

  const waitRun = async (conversationId: string, runId: string) => {
    for (let i = 0; i < 60; i++) {
      const view = service.conversations.read('ws', conversationId);
      if (view.run?.id === runId && view.run.status === 'completed') return view;
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    assert.fail(`run ${runId} did not settle`);
  };

  execCalls.length = 0;
  // 1. prepareSend does NOT open executor runtime or create gateway runtimes
  const chatCodex = await service.conversations.create('ws', {});
  const previewCodex = service.conversations.prepareSend('ws', chatCodex.id, {
    expectedRevision: chatCodex.revision,
    connectionId: 'codex',
    modelAccountId: accounts.openai!.id,
    model: accounts.openai!.modelId,
    permissionMode: 'default',
    text: '第一轮 Codex + OpenAI',
  });
  assert.equal(execCalls.length, 0);

  // 2. send opens gateway runtime without nativeModel, and with shared nativeHomeRoot for codex/dsh
  const sentCodex = service.conversations.send('ws', chatCodex.id, {
    expectedRevision: chatCodex.revision,
    previewToken: previewCodex.token,
    clientRequestId: 'req-codex-1',
    connectionId: 'codex',
    modelAccountId: accounts.openai!.id,
    model: accounts.openai!.modelId,
    permissionMode: 'default',
    text: '第一轮 Codex + OpenAI',
  });
  await waitRun(chatCodex.id, sentCodex.run.id);
  const codexGatewayCall = execCalls.find(call => call.connectionId === 'codex' && call.options.gateway);
  assert.ok(codexGatewayCall);
  const codexGateway = codexGatewayCall.options.gateway as ModelGatewayConfiguration;
  assert.match(codexGateway.baseUrl, /^http:\/\/127\.0\.0\.1:\d+\/v1$/);
  assert.equal(codexGateway.nativeModel, undefined);
  assert.equal(codexGateway.nativeHomeRoot, path.join(root, 'data', 'agent-service', 'connections', 'codex'));

  // Switching permissionMode on Codex + OpenAI reuses the same participant & context!
  const afterTurn1 = service.conversations.read('ws', chatCodex.id);
  const sentCodex2 = service.conversations.send('ws', chatCodex.id, {
    expectedRevision: afterTurn1.revision,
    clientRequestId: 'req-codex-2',
    connectionId: 'codex',
    modelAccountId: accounts.openai!.id,
    model: accounts.openai!.modelId,
    permissionMode: 'full-access',
    text: '第二轮切换权限但复用上下文',
  });
  const afterTurn2 = await waitRun(chatCodex.id, sentCodex2.run.id);
  assert.equal(afterTurn2.participants.length, 1, 'Codex + OpenAI reuses participant across permission switch');

  // 3. Devin + Codex binds permissionMode into configuration hash -> switching permission opens a fresh participant/context!
  const chatDevin = await service.conversations.create('ws', {});
  const runDevin1 = service.conversations.send('ws', chatDevin.id, {
    expectedRevision: chatDevin.revision,
    clientRequestId: 'req-devin-1',
    connectionId: 'codex',
    modelAccountId: accounts.devin!.id,
    model: accounts.devin!.modelId,
    permissionMode: 'default',
    text: 'Devin 默认权限',
  });
  const viewDevin1 = await waitRun(chatDevin.id, runDevin1.run.id);
  const runDevin2 = service.conversations.send('ws', chatDevin.id, {
    expectedRevision: viewDevin1.revision,
    clientRequestId: 'req-devin-2',
    connectionId: 'codex',
    modelAccountId: accounts.devin!.id,
    model: accounts.devin!.modelId,
    permissionMode: 'full-access',
    text: 'Devin 完全访问',
  });
  const viewDevin2 = await waitRun(chatDevin.id, runDevin2.run.id);
  assert.equal(viewDevin2.participants.length, 2, 'Codex + Devin isolates participant when permissionMode changes');

  // 4. Qoder & Qoder CN native passthrough: issues gateway lease WITH nativeModel{provider, id, accountIdentity} and NO shared nativeHomeRoot
  for (const [connectionId, sourceKey] of [['qoder', 'native-qoder'], ['qoder-cn', 'qoder-cn']] as const) {
    const chat = await service.conversations.create('ws', {});
    const target = accounts[sourceKey]!;
    const accountSnap = service.models.accounts.read(target.id);
    const sent = service.conversations.send('ws', chat.id, {
      expectedRevision: chat.revision,
      clientRequestId: `req-${connectionId}-1`,
      connectionId,
      modelAccountId: target.id,
      model: target.modelId,
      permissionMode: 'default',
      text: `${connectionId} 原生直通`,
    });
    await waitRun(chat.id, sent.run.id);
    const call = execCalls.findLast(item => item.connectionId === connectionId && item.options.gateway);
    assert.ok(call, connectionId);
    assert.equal(call.options.gateway?.nativeHomeRoot, undefined);
    assert.deepEqual(call.options.gateway?.nativeModel, {
      provider: connectionId,
      id: target.modelId,
      accountIdentity: accountSnap.identity,
    });
  }

  // 5. Claude Code + Anthropic: gateway lease WITHOUT nativeModel and WITHOUT shared nativeHomeRoot
  {
    const chat = await service.conversations.create('ws', {});
    const target = accounts.anthropic!;
    const sent = service.conversations.send('ws', chat.id, {
      expectedRevision: chat.revision,
      clientRequestId: 'req-claude-1',
      connectionId: 'claude-code',
      modelAccountId: target.id,
      model: target.modelId,
      permissionMode: 'default',
      text: 'Claude + Anthropic',
    });
    await waitRun(chat.id, sent.run.id);
    const call = execCalls.findLast(item => item.connectionId === 'claude-code' && item.options.gateway);
    assert.ok(call);
    assert.equal(call.options.gateway?.nativeModel, undefined);
    assert.equal(call.options.gateway?.nativeHomeRoot, undefined);
  }

  // 6. Single-shot models.generate selects gateway source and forwards non-executor agentId ('commit-message')
  const openaiSnap = service.models.accounts.read(accounts.openai!.id);
  const generated = await service.models.generate({
    accountId: openaiSnap.id,
    modelId: accounts.openai!.modelId,
    expectedIdentity: openaiSnap.identity,
    expectedRevision: openaiSnap.revision,
    agentId: 'commit-message',
    conversationId: 'gen-conv-1',
    runId: 'gen-run-1',
    prompt: '请生成标题',
    signal: AbortSignal.timeout(3_000),
  });
  assert.equal(generated, '{"title":"生成标题"}');
  assert.equal(sourceStates.openai.inferCalls.at(-1)?.agentId, 'commit-message');
});

test('executor declarations project public modelPolicy and Claude Code reports source-required without fake account', async t => {
  const harness = setupHarness(t);
  await prepareSourcesAndConnections(harness);
  const { service } = harness;

  assert.deepEqual(service.connections.read('codex').modelPolicy, {
    account: 'native',
    gateway: { protocol: 'responses' },
  });
  assert.deepEqual(service.connections.read('dsh').modelPolicy, {
    account: 'native',
    gateway: { protocol: 'responses' },
  });
  assert.deepEqual(service.connections.read('qoder').modelPolicy, {
    account: 'native',
    gateway: { protocol: 'chat-completions' },
    native: {
      sourceProviders: ['qoder', 'native-qoder'],
      exclusive: true,
      binding: 'gateway-lease',
      platformLogin: 'required-for-sources',
    },
  });
  assert.deepEqual(service.connections.read('qoder-cn').modelPolicy, {
    account: 'native',
    gateway: { protocol: 'chat-completions' },
    native: {
      sourceProviders: ['qoder-cn', qoderCnModelAccountId],
      exclusive: true,
      binding: 'gateway-lease',
      defaultSourceAccountId: qoderCnModelAccountId,
      platformLogin: 'required-for-sources',
    },
  });
  const claude = service.connections.read('claude-code');
  assert.deepEqual(claude.modelPolicy, {
    account: 'source-required',
    gateway: { protocol: 'anthropic-messages' },
  });
  assert.equal(claude.status, 'not-authenticated');
  assert.equal(claude.account, undefined);
  assert.deepEqual(claude.models, []);
});
