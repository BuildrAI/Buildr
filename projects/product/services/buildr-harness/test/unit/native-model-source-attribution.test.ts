import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { createAgentService } from '../../src/application/agent-service.ts';
import type { AgentCapabilities, AgentExecutor, AgentRuntime, ExecutorOpenOptions, ModelGatewayConfiguration } from '../../src/contracts.ts';
import { createNativeExecutors } from '../../src/executors/index.ts';
import type { ModelOffering, ModelProvider } from '../../src/model-access/contracts.ts';

const builtinDescriptors = new Map(createNativeExecutors().map(executor => [executor.descriptor.id, executor.descriptor]));

const capabilities: AgentCapabilities = {
  text: true,
  images: true,
  approval: true,
  questions: true,
  stop: true,
  resume: true,
  permissionModes: ['default', 'full-access'],
  maxInputBytes: 64 * 1024,
};

interface SendCall {
  connectionId: string;
  contextId: string;
  model?: string;
  gateway?: ModelGatewayConfiguration;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function setupHarness(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'native-source-attr-')));
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });

  const sends: SendCall[] = [];
  const gates = new Map<string, ReturnType<typeof deferred>>();
  const releaseAllGates = () => {
    for (const gate of gates.values()) gate.resolve();
    gates.clear();
  };

  const makeExecutor = (
    id: 'codex' | 'dsh',
    label: string,
    nativeModels: Array<{ id: string; label: string; isDefault?: boolean }>,
  ): AgentExecutor => {
    let contextSeq = 0;
    const builtin = builtinDescriptors.get(id)!;
    return {
      descriptor: {
        id,
        label,
        capabilities,
        modelPolicy: builtin.modelPolicy,
        runtimeTraits: builtin.runtimeTraits,
      },
      async open(options: ExecutorOpenOptions): Promise<AgentRuntime> {
        let closed = false;
        const bindingIdentity = `binding:${id}:${options.gateway?.identity ?? 'native'}`;
        return {
          get closed() { return closed; },
          capabilities,
          bindingIdentity,
          bindingData: { format: 'test-binding/v1', provider: id, ...(options.gateway ? { gatewayIdentity: options.gateway.identity } : {}) },
          async verifyUpgrade() {},
          async inspectAccount() {
            return { status: 'ready', label: `${label} Account`, loginMethod: `${label} Login` };
          },
          async models() {
            return nativeModels;
          },
          async beginLogin() {},
          async cancelLogin() {},
          async createContext() {
            return { id: `${id}-ctx-${++contextSeq}`, data: { cwd: workspace } };
          },
          async resumeContext() {},
          async readHistory() { return []; },
          async send(input) {
            sends.push({ connectionId: id, contextId: input.contextRef.id, model: input.model, gateway: options.gateway });
            const execRef = { id: `exec-${sends.length}`, data: { resourceBinding: bindingIdentity, resourceContext: input.contextRef.id } };
            input.onEvent({ type: 'accepted', executionRef: execRef, inputItemId: `u-${sends.length}` });
            const gate = gates.get(input.clientRequestId);
            if (gate) await gate.promise;
            input.onEvent({ type: 'item', item: { id: `a-${sends.length}`, kind: 'message', role: 'assistant', text: `ok:${input.model ?? 'default'}`, status: 'completed', executionId: execRef.id } });
            input.onEvent({ type: 'observation', observation: { status: 'idle', executionRef: execRef, tools: [], backgroundWork: false } });
            input.onEvent({ type: 'completed', status: 'completed' });
          },
          async observe(input) {
            return { status: 'idle', executionRef: input.executionRef, tools: [], backgroundWork: false };
          },
          async canRelease() { return true; },
          async stop(input) {
            releaseAllGates();
            return { status: 'stopped', executionRef: input.executionRef, tools: [], backgroundWork: false };
          },
          async reply() {},
          async close() { closed = true; },
        };
      },
    };
  };

  const codexOffering: ModelOffering = {
    id: 'gpt-6.2-sol',
    label: 'GPT-6.2-Sol',
    images: true,
    tools: true,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    defaultServiceTier: 'default',
    serviceTiers: [
      { id: 'default', label: '标准', reasoningEfforts: [{ id: 'medium', label: '中' }, { id: 'high', label: '高' }], defaultReasoningEffort: 'medium' },
      { id: 'priority', label: '快速', reasoningEfforts: [{ id: 'medium', label: '中' }, { id: 'high', label: '高' }], defaultReasoningEffort: 'medium' },
    ],
    reasoningEfforts: [{ id: 'medium', label: '中' }, { id: 'high', label: '高' }],
    defaultReasoningEffort: 'medium',
  };
  const dshOffering: ModelOffering = {
    id: 'deepseek-chat',
    label: 'DeepSeek Chat',
    images: false,
    tools: true,
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
  };

  const providerStates = {
    'native-codex': { status: 'ready' as 'ready' | 'not-authenticated' | 'expired', identity: 'chatgpt-u1', label: 'ChatGPT · pro', models: [codexOffering] },
    'native-dsh': { status: 'ready' as 'ready' | 'not-authenticated' | 'expired', identity: 'deepseek-u1', label: 'DeepSeek', models: [dshOffering] },
  };

  const makeProvider = (id: 'native-codex' | 'native-dsh', connectionId: 'codex' | 'dsh'): ModelProvider => ({
    id,
    label: providerStates[id].label,
    connectionId,
    sharing: { kind: 'gateway' },
    inference: 'gateway',
    presentation: { vendorLabel: connectionId === 'codex' ? 'OpenAI' : 'DeepSeek', sourceLabel: connectionId === 'codex' ? 'ChatGPT' : 'DeepSeek', quotaLabel: connectionId === 'codex' ? 'ChatGPT' : 'DeepSeek' },
    async open() {
      const state = providerStates[id];
      return {
        protocol: connectionId === 'codex' ? 'responses' : 'anthropic-messages',
        identity: async () => state.identity,
        async inspect() {
          return {
            status: state.status,
            identity: state.identity,
            label: state.label,
            models: state.status === 'ready' ? state.models : [],
            quota: { available: true, remainingPercent: 90, observedAt: '2026-11-19T00:00:00.000Z' },
          };
        },
        async beginLogin() {},
        async cancelLogin() {},
        async infer() { return Response.json({}); },
        async close() {},
      };
    },
  });

  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const executables: Record<string, string> = {};
  for (const id of ['codex', 'dsh']) {
    const exe = path.join(binDir, id);
    fs.writeFileSync(exe, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    executables[id] = exe;
  }

  const service = createAgentService({
    dataRoot: path.join(root, 'data'),
    executors: [
      makeExecutor('codex', 'Codex', [
        { id: 'gpt-6.2-sol', label: 'GPT-6.2-Sol', isDefault: true },
        { id: 'codex-custom-model', label: 'Custom Endpoint Model' },
      ]),
      makeExecutor('dsh', 'DSH', [{ id: 'deepseek-chat', label: 'DeepSeek Chat', isDefault: true }]),
    ],
    modelProviders: [
      makeProvider('native-codex', 'codex'),
      makeProvider('native-dsh', 'dsh'),
    ],
    resolveWorkspace: async () => ({ rootPath: workspace }),
  });

  t.after(async () => {
    releaseAllGates();
    await service.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  return { service, executables, providerStates, sends, gates, releaseAllGates };
}

async function connectAndEnable(harness: ReturnType<typeof setupHarness>, enableCodexAccount = true) {
  const { service, executables } = harness;
  for (const id of ['codex', 'dsh'] as const) {
    const view = service.connections.read(id);
    await service.connections.connect(id, { expectedRevision: view.revision, executable: executables[id] });
  }
  await service.models.accounts.list({ refresh: true });
  for (const id of ['native-codex', 'native-dsh'] as const) {
    if (id === 'native-codex' && !enableCodexAccount) continue;
    const checked = await service.models.accounts.check(id);
    if (checked.status === 'ready') {
      await service.models.accounts.preferences(checked.id, {
        expectedRevision: checked.revision,
        models: checked.models.map(model => ({ id: model.id, enabled: true })),
      });
    }
  }
}

async function waitForStatus(
  service: ReturnType<typeof setupHarness>['service'],
  conversationId: string,
  runId: string,
  target: 'running' | 'completed',
) {
  for (let i = 0; i < 80; i++) {
    const view = service.conversations.read('ws', conversationId);
    if (view.run?.id === runId && view.run.status === target) return view;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  assert.fail(`run ${runId} did not reach ${target}`);
}

test('程序接口/草稿首发省略 modelAccountId 时自动归属已就绪关联订阅账号并在执行中模型统计合并', async t => {
  const harness = setupHarness(t);
  await connectAndEnable(harness, true);
  const { service, gates, releaseAllGates } = harness;

  const reqApi = '11111111-1111-4111-8111-111111111111';
  const reqWeb = '22222222-2222-4222-8222-222222222222';
  const reqDsh = '33333333-3333-4333-8333-333333333333';
  gates.set(reqApi, deferred());
  gates.set(reqWeb, deferred());
  gates.set(reqDsh, deferred());

  const draftApi = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const draftSnapshotApi = await service.conversations.readDraft('ws', draftApi);
  const startedApi = await service.conversations.startDraft('ws', draftApi, {
    connectionId: 'codex',
    text: '程序接口不传模型与账号的首发',
    expectedDraftRevision: draftSnapshotApi.revision,
    clientRequestId: reqApi,
  });

  assert.equal(startedApi.conversation.run?.modelAccountId, 'native-codex');
  assert.equal(startedApi.conversation.run?.model, 'gpt-6.2-sol');
  assert.equal(startedApi.conversation.run?.modelSourceLabel, 'ChatGPT · pro');

  const draftWeb = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const draftSnapshotWeb = await service.conversations.readDraft('ws', draftWeb);
  const startedWeb = await service.conversations.startDraft('ws', draftWeb, {
    connectionId: 'codex',
    modelAccountId: 'native-codex',
    model: 'gpt-6.2-sol',
    text: '网页端显式携带账号的首发',
    expectedDraftRevision: draftSnapshotWeb.revision,
    clientRequestId: reqWeb,
  });

  const draftDsh = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const draftSnapshotDsh = await service.conversations.readDraft('ws', draftDsh);
  const startedDsh = await service.conversations.startDraft('ws', draftDsh, {
    connectionId: 'dsh',
    text: 'DSH 省略模型与账号的首发',
    expectedDraftRevision: draftSnapshotDsh.revision,
    clientRequestId: reqDsh,
  });
  assert.equal(startedDsh.conversation.run?.modelAccountId, 'native-dsh');
  assert.equal(startedDsh.conversation.run?.model, 'deepseek-chat');
  assert.equal(startedDsh.conversation.run?.modelSourceLabel, 'DeepSeek');

  await waitForStatus(service, startedApi.conversation.id, startedApi.conversation.run!.id, 'running');
  await waitForStatus(service, startedWeb.conversation.id, startedWeb.conversation.run!.id, 'running');
  await waitForStatus(service, startedDsh.conversation.id, startedDsh.conversation.run!.id, 'running');

  const summary = service.conversations.listAll(['ws'], { limit: 10 });
  assert.deepEqual(summary.stats.modelExecutions, [
    { accountId: 'native-codex', accountLabel: 'ChatGPT · pro', model: 'gpt-6.2-sol', count: 2 },
    { accountId: 'native-dsh', accountLabel: 'DeepSeek', model: 'deepseek-chat', count: 1 },
  ]);

  releaseAllGates();
  await waitForStatus(service, startedApi.conversation.id, startedApi.conversation.run!.id, 'completed');
  await waitForStatus(service, startedWeb.conversation.id, startedWeb.conversation.run!.id, 'completed');
  await waitForStatus(service, startedDsh.conversation.id, startedDsh.conversation.run!.id, 'completed');
});

test('关联订阅账号未就绪、模型停用或使用原生自定义模型时不阻断直连执行且不猜供应商', async t => {
  const harness = setupHarness(t);
  await connectAndEnable(harness, false);
  const { service, providerStates, gates, releaseAllGates } = harness;

  // 1. 订阅账号未就绪：仍可走原生连接运行，统计如实记为供应商未记录
  providerStates['native-codex'].status = 'not-authenticated';
  await service.models.accounts.check('native-codex');
  const reqUnauth = '44444444-4444-4444-8444-444444444444';
  gates.set(reqUnauth, deferred());
  const draftA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const startedUnauth = await service.conversations.startDraft('ws', draftA, {
    connectionId: 'codex',
    text: '未认证订阅时走原生直连',
    expectedDraftRevision: (await service.conversations.readDraft('ws', draftA)).revision,
    clientRequestId: reqUnauth,
  });
  assert.equal(startedUnauth.conversation.run?.modelAccountId, undefined);
  assert.equal(startedUnauth.conversation.run?.model, 'gpt-6.2-sol');
  await waitForStatus(service, startedUnauth.conversation.id, startedUnauth.conversation.run!.id, 'running');
  const unauthStats = service.conversations.listAll(['ws'], { limit: 10 }).stats.modelExecutions;
  assert.deepEqual(unauthStats, [
    { accountId: `unknown:${startedUnauth.conversation.id}`, accountLabel: '供应商未记录', model: 'gpt-6.2-sol', count: 1 },
  ]);
  releaseAllGates();
  await waitForStatus(service, startedUnauth.conversation.id, startedUnauth.conversation.run!.id, 'completed');

  // 2. 订阅账号就绪但模型被停用或不在目录（原生自定义模型）：依然走原生直连
  providerStates['native-codex'].status = 'ready';
  const checked = await service.models.accounts.check('native-codex');
  await service.models.accounts.preferences(checked.id, {
    expectedRevision: checked.revision,
    models: [{ id: 'gpt-6.2-sol', enabled: false }],
  });

  const convDisabled = await service.conversations.create('ws', {});
  const sentDisabled = service.conversations.send('ws', convDisabled.id, {
    expectedRevision: convDisabled.revision,
    connectionId: 'codex',
    model: 'gpt-6.2-sol',
    text: '订阅里该模型已停用但原生连接可用',
    clientRequestId: '55555555-5555-4555-8555-555555555555',
  });
  assert.equal(sentDisabled.run.modelAccountId, undefined);
  await waitForStatus(service, convDisabled.id, sentDisabled.run.id, 'completed');

  const enabled = await service.models.accounts.preferences(service.models.accounts.read('native-codex').id, {
    expectedRevision: service.models.accounts.read('native-codex').revision,
    models: [{ id: 'gpt-6.2-sol', enabled: true }],
  });
  assert.equal(enabled.models[0]?.enabled, true);

  const convCustom = await service.conversations.create('ws', {});
  const sentCustom = service.conversations.send('ws', convCustom.id, {
    expectedRevision: convCustom.revision,
    connectionId: 'codex',
    model: 'codex-custom-model',
    text: '原生自定义模型不归入 ChatGPT 订阅',
    clientRequestId: '66666666-6666-4666-8666-666666666666',
  });
  assert.equal(sentCustom.run.modelAccountId, undefined);
  await waitForStatus(service, convCustom.id, sentCustom.run.id, 'completed');
});

test('存量无账号原生会话续聊复用原会话且不误判交接，显式切换非默认档位时正常开启新会话', async t => {
  const harness = setupHarness(t);
  await connectAndEnable(harness, false);
  const { service, providerStates, sends } = harness;

  // 第 1 轮在订阅账号未就绪时完成，形成无 modelAccountId 的存量原生参与者
  providerStates['native-codex'].status = 'not-authenticated';
  await service.models.accounts.check('native-codex');
  const conv = await service.conversations.create('ws', {});
  const round1 = service.conversations.send('ws', conv.id, {
    expectedRevision: conv.revision,
    connectionId: 'codex',
    model: 'gpt-6.2-sol',
    text: '存量首轮无账号',
    clientRequestId: '77777777-7777-4777-8777-777777777777',
  });
  const afterRound1 = await waitForStatus(service, conv.id, round1.run.id, 'completed');
  assert.equal(afterRound1.run?.modelAccountId, undefined);
  assert.equal(afterRound1.participants.length, 1);
  const initialContextId = sends[0]!.contextId;
  assert.equal(sends[0]!.gateway, undefined);

  // 随后订阅账号就绪并启用模型
  providerStates['native-codex'].status = 'ready';
  const checked = await service.models.accounts.check('native-codex');
  await service.models.accounts.preferences(checked.id, {
    expectedRevision: checked.revision,
    models: [{ id: 'gpt-6.2-sol', enabled: true }],
  });

  // 第 2 轮：省略 modelAccountId 且不传 previewToken（模拟程序接口续聊）
  const preview2 = service.conversations.prepareSend('ws', conv.id, {
    expectedRevision: afterRound1.revision,
    connectionId: 'codex',
    model: 'gpt-6.2-sol',
    text: '第 2 轮无预览令牌续聊',
  });
  assert.equal(preview2.switching, false);
  assert.deepEqual(preview2.handoff?.changes, []);
  assert.equal(preview2.participantId, afterRound1.participants[0]!.id);
  assert.equal(preview2.modelAccountId, 'native-codex');

  const round2 = service.conversations.send('ws', conv.id, {
    expectedRevision: afterRound1.revision,
    connectionId: 'codex',
    model: 'gpt-6.2-sol',
    text: '第 2 轮无预览令牌续聊',
    clientRequestId: '88888888-8888-4888-8888-888888888888',
  });
  const afterRound2 = await waitForStatus(service, conv.id, round2.run.id, 'completed');
  assert.equal(afterRound2.participants.length, 1);
  assert.equal(afterRound2.run?.modelAccountId, 'native-codex');
  assert.equal(afterRound2.run?.modelSourceLabel, 'ChatGPT · pro');
  assert.equal(afterRound2.entries.some(entry => entry.kind === 'handoff'), false);
  assert.equal(sends[1]!.contextId, initialContextId);
  assert.equal(sends[1]!.model, 'gpt-6.2-sol');
  assert.equal(sends[1]!.gateway, undefined);

  // 第 3 轮：显式传 modelAccountId + 默认档位（模拟网页续聊承接上轮 run.modelAccountId）
  const round3 = service.conversations.send('ws', conv.id, {
    expectedRevision: afterRound2.revision,
    connectionId: 'codex',
    modelAccountId: 'native-codex',
    model: 'gpt-6.2-sol',
    serviceTier: 'default',
    text: '第 3 轮显式默认档位续聊',
    clientRequestId: '99999999-9999-4999-8999-999999999999',
  });
  const afterRound3 = await waitForStatus(service, conv.id, round3.run.id, 'completed');
  assert.equal(afterRound3.participants.length, 1);
  assert.equal(afterRound3.run?.modelAccountId, 'native-codex');
  assert.equal(afterRound3.run?.modelSourceLabel, 'ChatGPT · pro');
  assert.equal(sends[2]!.contextId, initialContextId);
  assert.equal(sends[2]!.model, 'gpt-6.2-sol');

  // 第 4 轮：显式切换到非默认档位 priority，应正常识别为切换并开启网关会话
  const preview4 = service.conversations.prepareSend('ws', conv.id, {
    expectedRevision: afterRound3.revision,
    connectionId: 'codex',
    modelAccountId: 'native-codex',
    model: 'gpt-6.2-sol',
    serviceTier: 'priority',
    text: '切换到快速档位',
  });
  assert.equal(preview4.switching, true);
  assert.equal(preview4.participantId, undefined);

  const round4 = service.conversations.send('ws', conv.id, {
    expectedRevision: afterRound3.revision,
    previewToken: preview4.token,
    connectionId: 'codex',
    modelAccountId: 'native-codex',
    model: 'gpt-6.2-sol',
    serviceTier: 'priority',
    text: '切换到快速档位',
    clientRequestId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  });
  const afterRound4 = await waitForStatus(service, conv.id, round4.run.id, 'completed');
  assert.equal(afterRound4.participants.length, 2);
  assert.equal(afterRound4.run?.serviceTier, 'priority');
  assert.ok(sends[3]!.gateway);
});
