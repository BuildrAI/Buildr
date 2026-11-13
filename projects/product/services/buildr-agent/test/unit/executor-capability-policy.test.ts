import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { createAgentService } from '../../src/application/agent-service.ts';
import {
  ExecutorObservationLost,
  type AgentCapabilities,
  type AgentExecutor,
  type AgentRuntime,
  type ExecutorOpenOptions,
  type ModelGatewayConfiguration,
} from '../../src/contracts.ts';
import { executorCompatibilityForSource, resolveExecutionModelPath, sourceCompatibility } from '../../src/domain/model-policy.ts';
import { hasNativeToolContent, nativeContentSpec, readNativeTool } from '../../src/executors/index.ts';
import { checkedGateway, checkedNativeSource, consumerBinding } from '../../src/executors/model-gateway.ts';
import { opaqueReference } from '../../src/executors/native-process.ts';
import { createModelAccess } from '../../src/model-access/application.ts';
import { ModelAccessError, type ModelOffering, type ModelProvider } from '../../src/model-access/contracts.ts';
import { defineNativeContent, type NativeToolContent } from '../../src/native-content-contracts.ts';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { NativeContentReader, nativeContentHash, nativeContentPath } from '../../src/storage/native-content.ts';

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

const sampleOffering: ModelOffering = {
  id: 'gemini-2.5-pro',
  label: 'Gemini 2.5 Pro',
  images: true,
  tools: true,
  contextWindow: 1_000_000,
  maxOutputTokens: 65_536,
  reasoningEfforts: [{ id: 'low', label: 'Low' }, { id: 'high', label: 'High' }],
  defaultReasoningEffort: 'high',
};

test('checkedGateway and consumerBinding enforce mutual exclusion and gateway-lease executor identity', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cap-policy-gw-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const exe = path.join(root, 'agy');
  fs.writeFileSync(exe, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const cfg = path.join(root, 'cfg');
  fs.mkdirSync(cfg, { recursive: true });

  const validGateway: ModelGatewayConfiguration = {
    identity: 'lease-1',
    baseUrl: 'http://127.0.0.1:43120/v1',
    apiKey: 'local-key',
    models: [{ id: 'qoder-pro', label: 'Qoder Pro', vision: true, tools: true }],
    nativeModel: { provider: 'qoder', id: 'qoder-pro', accountIdentity: 'acc-1' },
  };

  assert.equal(
    checkedGateway(validGateway, { executorId: 'qoder', nativeBinding: 'gateway-lease' })?.nativeModel?.provider,
    'qoder',
  );
  assert.throws(
    () => checkedGateway(validGateway, { executorId: 'codex', nativeBinding: 'gateway-lease' }),
    /agent_gateway_lease_invalid/,
  );
  assert.throws(
    () => checkedGateway(validGateway, { executorId: 'qoder', nativeBinding: 'account-identity' }),
    /agent_gateway_lease_invalid/,
  );
  assert.throws(
    () => checkedGateway(validGateway, { executorId: 'qoder' }),
    /agent_gateway_lease_invalid/,
  );

  const nativeSource = {
    accountId: 'native-agy',
    accountIdentity: 'google:user-1',
    provider: 'native-agy',
    modelId: sampleOffering.id,
    model: sampleOffering,
  };
  assert.deepEqual(checkedNativeSource(nativeSource), nativeSource);
  assert.throws(
    () => checkedNativeSource({ ...nativeSource, modelId: 'mismatch' }),
    /agent_native_source_invalid/,
  );
  await assert.rejects(
    () => consumerBinding('codex', exe, '0.120.0', cfg, {
      connectionId: 'codex',
      configRoot: cfg,
      executable: exe,
      environment: {},
      signal: AbortSignal.timeout(1_000),
      gateway: validGateway,
      nativeSource,
    } as unknown as ExecutorOpenOptions),
    /agent_model_binding_conflict/,
  );

  const bound = await consumerBinding('codex', exe, '0.120.0', cfg, {
    connectionId: 'codex',
    configRoot: cfg,
    executable: exe,
    environment: {},
    signal: AbortSignal.timeout(1_000),
    nativeSource,
  } as ExecutorOpenOptions);
  assert.equal(typeof bound.data.nativeSourceIdentity, 'string');
  assert.equal(bound.data.gatewayIdentity, undefined);
});

test('sourceCompatibility, sharing, inference:none, executorCompatibility, and built-in provider declarations', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cap-policy-models-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const executors = [
    {
      id: 'codex',
      label: 'Codex',
      capabilities: baseCapabilities,
      modelPolicy: { account: 'native' as const, gateway: { protocol: 'responses' as const } },
    },
    {
      id: 'agy',
      label: 'Antigravity',
      capabilities: baseCapabilities,
      modelPolicy: {
        account: 'source-required' as const,
        native: {
          sourceProviders: ['native-agy'],
          exclusive: true,
          binding: 'account-identity' as const,
          defaultSourceAccountId: 'native-agy',
        },
      },
    },
  ];

  const sharedProvider: ModelProvider = {
    id: 'shared-api',
    label: 'Shared API',
    singleton: true,
    sharing: { kind: 'gateway' },
    inference: 'gateway',
    presentation: { vendorLabel: 'Shared Vendor', sourceLabel: 'API Key', quotaLabel: 'Shared Quota' },
    async open() {
      return {
        protocol: 'chat-completions',
        identity: async () => 'shared-id-1',
        inspect: async () => ({ status: 'ready', identity: 'shared-id-1', models: [sampleOffering] }),
        beginLogin: async () => {},
        cancelLogin: async () => {},
        infer: async () => Response.json({ id: '1', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }),
        close: async () => {},
      };
    },
  };

  const exclusiveGatewayProvider: ModelProvider = {
    id: 'exclusive-gw',
    label: 'Codex-Only Gateway',
    singleton: true,
    sharing: { kind: 'executor-exclusive', executors: ['codex'], reason: '该来源仅授权给 Codex 执行器使用。' },
    inference: 'gateway',
    presentation: { vendorLabel: 'Exclusive Vendor', sourceLabel: 'Exclusive Plan' },
    async open() {
      return {
        protocol: 'responses',
        identity: async () => 'excl-id-1',
        inspect: async () => ({ status: 'ready', identity: 'excl-id-1', models: [sampleOffering] }),
        beginLogin: async () => {},
        cancelLogin: async () => {},
        infer: async () => Response.json({ id: 'r1', output_text: 'ok', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }] }),
        close: async () => {},
      };
    },
  };

  const nativeOnlyProvider: ModelProvider = {
    id: 'native-agy',
    label: 'Google Personal Account',
    connectionId: 'agy',
    sharing: {
      kind: 'executor-exclusive',
      executors: ['agy'],
      reason: 'Google 个人账号 OAuth 仅限 Antigravity 原生进程使用，不支持网关转发。',
    },
    inference: 'none',
    presentation: {
      vendorLabel: 'Google',
      sourceLabel: 'Google 个人账号',
      quotaUnavailableNote: '官方 CLI 暂未公开剩余额度百分比。',
      billing: { url: 'https://one.google.com/about/ai-plans', label: 'Google AI 套餐说明' },
    },
    async open() {
      return {
        protocol: 'gemini',
        identity: async () => 'google:sub-123',
        inspect: async () => ({ status: 'ready', identity: 'google:sub-123', label: 'alice@example.com', models: [sampleOffering] }),
        beginLogin: async () => {},
        cancelLogin: async () => {},
        infer: async () => { throw new Error('must never be called when inference is none'); },
        close: async () => {},
      };
    },
  };

  const access = createModelAccess({
    root,
    executors,
    providers: [sharedProvider, exclusiveGatewayProvider, nativeOnlyProvider],
  });
  t.after(() => access.close());

  await access.ensureLinked();
  const sharedAcc = await access.accounts.add({ provider: 'shared-api' });
  const exclAcc = await access.accounts.add({ provider: 'exclusive-gw' });
  for (const id of [sharedAcc.id, exclAcc.id, 'native-agy']) {
    const checked = await access.accounts.check(id);
    await access.accounts.preferences(id, {
      expectedRevision: checked.revision,
      models: [{ id: sampleOffering.id, enabled: true }],
    });
  }

  // Verify account view projections: sharing, inference, presentation, executorCompatibility
  const agyAccount = access.accounts.read('native-agy');
  assert.equal(agyAccount.inference, 'none');
  assert.deepEqual(agyAccount.sharing, {
    kind: 'executor-exclusive',
    executors: ['agy'],
    reason: 'Google 个人账号 OAuth 仅限 Antigravity 原生进程使用，不支持网关转发。',
  });
  assert.equal(agyAccount.presentation?.vendorLabel, 'Google');
  assert.equal(agyAccount.presentation?.billing?.url, 'https://one.google.com/about/ai-plans');
  assert.deepEqual(agyAccount.executorCompatibility, [
    {
      connectionId: 'codex',
      compatible: false,
      reasonCode: 'agent_model_source_unsupported',
      reason: 'Google 个人账号 OAuth 仅限 Antigravity 原生进程使用，不支持网关转发。',
    },
    {
      connectionId: 'agy',
      compatible: true,
    },
  ]);

  const sharedView = access.accounts.read(sharedAcc.id);
  assert.deepEqual(sharedView.executorCompatibility, [
    { connectionId: 'codex', compatible: true },
    {
      connectionId: 'agy',
      compatible: false,
      reasonCode: 'agent_model_source_unsupported',
      reason: 'Antigravity Agent 暂不支持选择其他供应商的模型，请改用 Antigravity 原生模型。',
    },
  ]);

  // Verify resolveExecutionModelPath
  assert.equal(resolveExecutionModelPath(executors[0]!, undefined), 'native-connection');
  assert.equal(resolveExecutionModelPath(executors[0]!, sharedView), 'gateway');
  assert.equal(resolveExecutionModelPath(executors[1]!, agyAccount), 'account-identity');
  assert.equal(sourceCompatibility(executors[1]!, sharedView).compatible, false);

  // Verify leases.create rejects inference: 'none' even for its own executor!
  await assert.rejects(
    () => access.leases.create({
      accountId: 'native-agy',
      modelId: sampleOffering.id,
      conversationId: 'c1',
      runId: 'r1',
      agentId: 'agy',
    }),
    (err: unknown) => err instanceof ModelAccessError && err.code === 'model_source_inference_unavailable',
  );

  // Verify leases.create rejects executor-exclusive for other executors, but allows listed executor
  await assert.rejects(
    () => access.leases.create({
      accountId: exclAcc.id,
      modelId: sampleOffering.id,
      conversationId: 'c1',
      runId: 'r1',
      agentId: 'agy',
    }),
    (err: unknown) => err instanceof ModelAccessError && err.code === 'model_source_executor_incompatible',
  );
  const validLease = await access.leases.create({
    accountId: exclAcc.id,
    modelId: sampleOffering.id,
    conversationId: 'c1',
    runId: 'r1',
    agentId: 'codex',
  });
  assert.ok(validLease.baseUrl);

  // Verify catalog projects inference: 'none' and sharing so gateway pickers exclude it while conversation pickers inspect executorCompatibility
  const catalog = access.catalog.list();
  const agyCatalogItem = catalog.models.find(model => model.accountId === 'native-agy');
  assert.ok(agyCatalogItem);
  assert.equal(agyCatalogItem.inference, 'none');
  assert.equal(agyCatalogItem.sharing?.kind, 'executor-exclusive');

  await assert.rejects(
    () => access.generate({
      accountId: 'native-agy',
      modelId: sampleOffering.id,
      agentId: 'commit-message',
      conversationId: 'c1',
      runId: 'r1',
      prompt: 'test',
      signal: AbortSignal.timeout(2_000),
    }),
    (err: unknown) => err instanceof ModelAccessError && err.code === 'model_source_inference_unavailable',
  );
  await assert.rejects(
    () => access.generate({
      accountId: exclAcc.id,
      modelId: sampleOffering.id,
      agentId: 'commit-message',
      conversationId: 'c1',
      runId: 'r1',
      prompt: 'test',
      signal: AbortSignal.timeout(2_000),
    }),
    (err: unknown) => err instanceof ModelAccessError && err.code === 'model_source_executor_incompatible',
  );

  // Built-in default providers all expose sharing, inference, presentation, and executorCompatibility
  const defaultSvcRoot = path.join(root, 'default-svc');
  const defaultSvc = createAgentService({
    dataRoot: defaultSvcRoot,
    resolveWorkspace: async () => ({ rootPath: root }),
  });
  t.after(() => defaultSvc.close());
  const defaultList = await defaultSvc.models.accounts.list();
  assert.ok(defaultList.providers.length >= 9);
  for (const provider of defaultList.providers) {
    assert.ok(provider.sharing, `${provider.id} has sharing`);
    assert.ok(provider.inference, `${provider.id} has inference`);
    assert.ok(provider.presentation?.vendorLabel, `${provider.id} has presentation.vendorLabel`);
  }
  assert.deepEqual(executorCompatibilityForSource(executors, agyAccount), agyAccount.executorCompatibility);
  assert.equal(sourceCompatibility(executors[1]!, agyAccount).compatible, true);
});

test('account-identity native passthrough: zero gateway lease, per-conversation runtime, pre-send & pre-execution validation, and ExecutorObservationLost recovery', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cap-policy-account-id-')));
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });

  const openCalls: ExecutorOpenOptions[] = [];
  const promptCalls: Array<{ contextId: string; text: string; model?: string; nativeSourceAccount?: string }> = [];
  let failWithObservationLost = false;
  const lostExecutionIds = new Set<string>();
  let contextSeq = 0;

  const agyExecutor: AgentExecutor = {
    descriptor: {
      id: 'agy',
      label: 'Antigravity',
      capabilities: baseCapabilities,
      modelPolicy: {
        account: 'source-required',
        native: {
          sourceProviders: ['native-agy'],
          exclusive: true,
          binding: 'account-identity',
          defaultSourceAccountId: 'native-agy',
        },
      },
      runtimeTraits: {
        transientAccountProbe: true,
      },
    },
    async open(options): Promise<AgentRuntime> {
      openCalls.push(options);
      assert.equal(options.gateway, undefined, 'account-identity executor never receives a gateway configuration');
      let closed = false;
      const checkedSource = checkedNativeSource(options.nativeSource);
      const binding = {
        identity: `agy:${options.configRoot}:${checkedSource ? `${checkedSource.accountId}:${checkedSource.accountIdentity}` : 'program'}`,
        data: {
          format: 'test-native-source-binding/v1',
          ...(checkedSource ? { nativeSourceIdentity: `${checkedSource.accountId}:${checkedSource.accountIdentity}` } : {}),
        },
      };
      let lastExecRef: { id: string; data: Record<string, unknown> } | undefined;
      return {
        get closed() { return closed; },
        capabilities: baseCapabilities,
        bindingIdentity: binding.identity,
        bindingData: binding.data,
        async inspectAccount() {
          return { status: 'ready', label: 'alice@example.com', loginMethod: 'Google Personal' };
        },
        async models() { return []; },
        async beginLogin() {},
        async cancelLogin() {},
        async createContext(input) {
          return { id: `agy-ctx-${++contextSeq}`, data: { cwd: input.cwd } };
        },
        async resumeContext() {},
        async readHistory() { return []; },
        async send(input) {
          promptCalls.push({
            contextId: input.contextRef.id,
            text: input.text,
            model: input.model,
            nativeSourceAccount: options.nativeSource?.accountIdentity,
          });
          const execRef = {
            id: `agy-exec-${promptCalls.length}`,
            data: { resourceBinding: binding.identity, resourceContext: input.contextRef.id },
          };
          lastExecRef = execRef;
          input.onEvent({ type: 'accepted', executionRef: execRef, inputItemId: `u-${promptCalls.length}` });
          if (failWithObservationLost) {
            failWithObservationLost = false;
            lostExecutionIds.add(execRef.id);
            closed = true;
            throw new ExecutorObservationLost('execution', 'agy_acp_disconnected');
          }
          input.onEvent({
            type: 'item',
            item: { id: `a-${promptCalls.length}`, kind: 'message', role: 'assistant', text: `ok:${input.model}`, status: 'completed', executionId: execRef.id },
          });
          input.onEvent({ type: 'observation', observation: { status: 'idle', executionRef: execRef, tools: [], backgroundWork: false } });
          input.onEvent({ type: 'completed', status: 'completed' });
        },
        async observe(input) {
          const ref = input.executionRef ?? lastExecRef;
          const status = ref && lostExecutionIds.has(ref.id) ? 'stopped' : 'idle';
          return { status, executionRef: ref, tools: [], backgroundWork: false };
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

  let sourceStatus: 'ready' | 'expired' | 'failed' = 'ready';
  let sourceIdentity = 'google:alice-1';
  let inferCalled = 0;

  const agySourceProvider: ModelProvider = {
    id: 'native-agy',
    label: 'Google Personal Account',
    connectionId: 'agy',
    sharing: {
      kind: 'executor-exclusive',
      executors: ['agy'],
      reason: 'Google 个人账号 OAuth 仅限 Antigravity 原生进程使用。',
    },
    inference: 'none',
    presentation: { vendorLabel: 'Google', sourceLabel: 'Google 个人账号' },
    async open() {
      return {
        protocol: 'gemini',
        identity: async () => sourceIdentity,
        inspect: async () => ({
          status: sourceStatus,
          identity: sourceIdentity,
          label: 'alice@example.com',
          models: sourceStatus === 'ready'
            ? [
                sampleOffering,
                { ...sampleOffering, id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
              ]
            : [],
        }),
        beginLogin: async () => {},
        cancelLogin: async () => {},
        infer: async () => {
          inferCalled++;
          throw new Error('inference:none must never infer');
        },
        close: async () => {},
      };
    },
  };

  const exe = path.join(root, 'agy');
  fs.writeFileSync(exe, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

  const service = createAgentService({
    dataRoot: path.join(root, 'data'),
    executors: [agyExecutor],
    modelProviders: [agySourceProvider],
    autoContinueInterrupted: true,
    resolveWorkspace: async () => ({ rootPath: workspace }),
  });
  t.after(async () => {
    await service.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const conn = service.connections.read('agy');
  await service.connections.connect('agy', { expectedRevision: conn.revision, executable: exe });
  await service.models.accounts.list({ refresh: true });
  const checked = await service.models.accounts.check('native-agy');
  const enabled = await service.models.accounts.preferences('native-agy', {
    expectedRevision: checked.revision,
    models: [
      { id: 'gemini-2.5-pro', enabled: true },
      { id: 'gemini-2.5-flash', enabled: true },
    ],
  });

  // Connection presentation mirrors defaultSourceAccountId models and ready status
  const presentedConn = service.connections.read('agy');
  assert.equal(presentedConn.status, 'ready');
  assert.deepEqual(presentedConn.models.map(m => m.id), ['gemini-2.5-pro', 'gemini-2.5-flash']);

  const waitRun = async (conversationId: string, runId: string) => {
    for (let i = 0; i < 80; i++) {
      const view = service.conversations.read('ws', conversationId);
      if (view.run?.id === runId && ['completed', 'failed'].includes(view.run.status)) return view;
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    assert.fail(`run ${runId} did not settle`);
  };

  // 1. Successful prepare + send via defaultSourceAccountId -> zero gateway lease, nativeSource passed!
  openCalls.length = 0;
  const chat1 = await service.conversations.create('ws', {});
  const preview1 = service.conversations.prepareSend('ws', chat1.id, {
    expectedRevision: chat1.revision,
    connectionId: 'agy',
    text: '第一轮原生直通',
  });
  assert.equal(preview1.modelAccountId, 'native-agy');
  assert.equal(preview1.model, 'gemini-2.5-pro');
  assert.equal(openCalls.length, 0, 'prepareSend never opens runtime');

  const sent1 = service.conversations.send('ws', chat1.id, {
    expectedRevision: chat1.revision,
    previewToken: preview1.token,
    clientRequestId: 'req-agy-1',
    connectionId: 'agy',
    text: '第一轮原生直通',
  });
  const done1 = await waitRun(chat1.id, sent1.run.id);
  assert.equal(done1.run?.status, 'completed');
  assert.equal(promptCalls.length, 1);
  assert.equal(openCalls.length, 1);
  assert.equal(openCalls[0]!.nativeSource?.accountId, 'native-agy');
  assert.equal(openCalls[0]!.nativeSource?.accountIdentity, enabled.identity);
  assert.equal(openCalls[0]!.nativeSource?.modelId, 'gemini-2.5-pro');
  assert.equal(inferCalled, 0);

  // Switching models on the SAME conversation + account (with handoff confirmation) reuses the conversation's nativeSourceRuntime!
  const preview1b = service.conversations.prepareSend('ws', chat1.id, {
    expectedRevision: done1.revision,
    connectionId: 'agy',
    modelAccountId: 'native-agy',
    model: 'gemini-2.5-flash',
    text: '同对话切换模型',
  });
  const sent1b = service.conversations.send('ws', chat1.id, {
    expectedRevision: done1.revision,
    previewToken: preview1b.token,
    clientRequestId: 'req-agy-1b',
    connectionId: 'agy',
    modelAccountId: 'native-agy',
    model: 'gemini-2.5-flash',
    text: '同对话切换模型',
  });
  const done1b = await waitRun(chat1.id, sent1b.run.id);
  assert.equal(done1b.run?.status, 'completed');
  assert.equal(openCalls.length, 1, 'same conversation + same account reuses nativeSourceRuntime');

  // A SECOND conversation gets its own isolated nativeSourceRuntime instance, while sharing bindingIdentity!
  const chat2 = await service.conversations.create('ws', {});
  const sent2 = service.conversations.send('ws', chat2.id, {
    expectedRevision: chat2.revision,
    clientRequestId: 'req-agy-2',
    connectionId: 'agy',
    text: '第二个独立对话',
  });
  const done2 = await waitRun(chat2.id, sent2.run.id);
  assert.equal(done2.run?.status, 'completed');
  assert.equal(openCalls.length, 2, 'second conversation opens isolated runtime');

  // 2. Identity mismatch -> rejected with agent_model_source_changed and ZERO work input
  const promptsBeforeRejects = promptCalls.length;
  assert.throws(
    () => service.conversations.prepareSend('ws', chat2.id, {
      expectedRevision: done2.revision,
      connectionId: 'agy',
      modelAccountId: 'native-agy',
      modelAccountIdentity: 'stale-google-identity',
      model: 'gemini-2.5-pro',
      text: '身份不符',
    }),
    (err: any) => err?.code === 'agent_model_source_changed',
  );

  // 3. Disabled model -> rejected with agent_model_disabled and ZERO work input
  const disabledPref = await service.models.accounts.preferences('native-agy', {
    expectedRevision: service.models.accounts.read('native-agy').revision,
    models: [{ id: 'gemini-2.5-flash', enabled: false }],
  });
  assert.throws(
    () => service.conversations.prepareSend('ws', chat2.id, {
      expectedRevision: done2.revision,
      connectionId: 'agy',
      modelAccountId: 'native-agy',
      model: 'gemini-2.5-flash',
      text: '停用模型',
    }),
    (err: any) => err?.code === 'agent_model_disabled',
  );

  // 4. Unready/expired source -> rejected with agent_model_source_unavailable and ZERO work input
  sourceStatus = 'expired';
  await service.models.accounts.check('native-agy');
  assert.throws(
    () => service.conversations.prepareSend('ws', chat2.id, {
      expectedRevision: done2.revision,
      connectionId: 'agy',
      modelAccountId: 'native-agy',
      model: 'gemini-2.5-pro',
      text: '过期账号',
    }),
    (err: any) => err?.code === 'agent_model_source_unavailable',
  );
  assert.equal(promptCalls.length, promptsBeforeRejects, 'rejected validations dispatch zero work inputs');

  // Restore ready source under a new identity and verify mid-flight change between prepareSend and send fails cleanly with zero work input!
  sourceStatus = 'ready';
  await service.models.accounts.check('native-agy');
  await service.models.accounts.preferences('native-agy', {
    expectedRevision: service.models.accounts.read('native-agy').revision,
    models: [{ id: 'gemini-2.5-pro', enabled: true }, { id: 'gemini-2.5-flash', enabled: true }],
  });
  const previewMid = service.conversations.prepareSend('ws', chat2.id, {
    expectedRevision: done2.revision,
    connectionId: 'agy',
    modelAccountId: 'native-agy',
    model: 'gemini-2.5-pro',
    text: '准备后换号',
  });
  sourceIdentity = 'google:bob-2';
  await service.models.accounts.check('native-agy');
  await service.models.accounts.preferences('native-agy', {
    expectedRevision: service.models.accounts.read('native-agy').revision,
    models: [{ id: 'gemini-2.5-pro', enabled: true }],
  });
  // Even if send passes previewToken, prepare() revalidates or execute() catches identity mismatch -> zero work input!
  assert.throws(
    () => service.conversations.send('ws', chat2.id, {
      expectedRevision: done2.revision,
      previewToken: previewMid.token,
      clientRequestId: 'req-agy-mid',
      connectionId: 'agy',
      modelAccountId: 'native-agy',
      modelAccountIdentity: disabledPref.identity,
      model: 'gemini-2.5-pro',
      text: '准备后换号',
    }),
    (err: any) => err?.code === 'agent_model_source_changed',
  );
  assert.equal(promptCalls.length, promptsBeforeRejects, 'identity change after preview dispatches zero work inputs');

  // 5. ExecutorObservationLost enters transport interruption recovery and auto-continues once!
  failWithObservationLost = true;
  const chatRecover = await service.conversations.create('ws', {});
  const sentRecover = service.conversations.send('ws', chatRecover.id, {
    expectedRevision: chatRecover.revision,
    clientRequestId: 'req-agy-recover',
    connectionId: 'agy',
    text: '验证传输中断恢复',
  });
  for (let i = 0; i < 120; i++) {
    const view = service.conversations.read('ws', chatRecover.id);
    if (view.entries.some(e => e.role === 'assistant' && e.text.startsWith('ok:'))) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  const recovered = service.conversations.read('ws', chatRecover.id);
  assert.equal(recovered.run?.status, 'completed', `expected completed after ExecutorObservationLost recovery, got ${recovered.run?.status} (${recovered.run?.diagnostic})`);
  assert.notEqual(recovered.run?.id, sentRecover.run.id, 'transport interruption continued in a follow-up run');
});

test('nativeContent registration: registered executor projects nativeDetail and reads detail; unregistered executor omits nativeTools and returns unavailable', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cap-policy-native-detail-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const exe = path.join(root, 'fake-bin');
  fs.writeFileSync(exe, '#!/bin/sh\necho 1.0.0\n', { mode: 0o755 });

  // Built-in registration vs unregistered lookup
  for (const id of ['codex', 'dsh', 'qoder', 'qoder-cn', 'claude-code']) {
    assert.equal(hasNativeToolContent(id), true, `${id} registers nativeContent`);
    assert.ok(nativeContentSpec(id)?.allowedPath, `${id} declares allowedPath`);
  }
  assert.equal(hasNativeToolContent('unregistered-exec'), false);
  assert.equal(nativeContentSpec('unregistered-exec'), undefined);

  const syntheticRef: NativeToolContent = {
    version: 3,
    provider: 'unregistered-exec',
    contextId: '11111111-2222-4333-8444-555555555555',
    nativeId: 'call-1',
    entry: { id: 'e1', sequence: 1, kind: 'tool', role: 'system', name: 'command', status: 'completed', text: '', createdAt: '2026-11-13T00:00:00Z' },
    session: { config: 'connections/unregistered-exec', cwd: workspace },
    text: [],
  };
  assert.equal(readNativeTool(path.join(root, 'agent-service'), syntheticRef), undefined);
  assert.throws(
    () => nativeContentPath(path.join(root, 'agent-service'), 'unregistered-exec', 'connections/unregistered-exec/session.jsonl'),
    (err: any) => err?.code === 'agent_native_content_unavailable',
  );
  const directReader = new NativeContentReader(path.join(root, 'agent-service'), ref => readNativeTool(path.join(root, 'agent-service'), ref));
  assert.throws(
    () => directReader.tool(syntheticRef, nativeContentHash(JSON.stringify(syntheticRef))),
    (err: any) => err?.code === 'agent_native_content_unavailable',
  );

  // End-to-end via AgentService: custom registered executor vs custom unregistered executor
  const ctxReg = '22222222-3333-4444-8555-666666666666';
  const ctxPlain = '33333333-4444-4555-8666-777777777777';

  const makeTestExec = (id: string, withNativeContent: boolean): AgentExecutor => ({
    descriptor: {
      id,
      label: id,
      capabilities: baseCapabilities,
      modelPolicy: { account: 'native' },
      runtimeTraits: { transientAccountProbe: true },
    },
    ...(withNativeContent ? {
      nativeContent: defineNativeContent({
        allowedPath: /^custom-sessions\/.+\.jsonl$/,
        readTool(serviceRoot, ref) {
          if (ref.provider !== id || !ref.session || ref.nativeId !== 'tool-reg') return undefined;
          const rel = `${ref.session.config}/custom-sessions/${ref.contextId}.jsonl`;
          const file = nativeContentPath(serviceRoot, id, rel, this);
          const row = JSON.parse(fs.readFileSync(file, 'utf8').trim());
          return { ...ref.entry, input: row.input, text: row.output };
        },
      }),
    } : {}),
    async open(options): Promise<AgentRuntime> {
      let closed = false;
      const binding = `bind:${id}`;
      const ctxId = withNativeContent ? ctxReg : ctxPlain;
      return {
        get closed() { return closed; },
        capabilities: baseCapabilities,
        bindingIdentity: binding,
        async inspectAccount() { return { status: 'ready', label: id }; },
        async models() { return [{ id: 'm1', label: 'M1', isDefault: true }]; },
        async beginLogin() {},
        async cancelLogin() {},
        async createContext(input) {
          return { id: ctxId, data: { native: opaqueReference(id, ctxId, input.cwd, binding) } };
        },
        async resumeContext() {},
        async readHistory() { return []; },
        async send(input) {
          const execRef = { id: `exec-${id}`, data: { resourceBinding: binding, resourceContext: input.contextRef.id } };
          input.onEvent({ type: 'accepted', executionRef: execRef, inputItemId: `u-${id}` });
          if (withNativeContent) {
            const transcript = path.join(options.configRoot, 'custom-sessions', `${input.contextRef.id}.jsonl`);
            fs.mkdirSync(path.dirname(transcript), { recursive: true, mode: 0o700 });
            fs.writeFileSync(transcript, JSON.stringify({ input: 'echo reg', output: 'registered full output' }) + '\n', { mode: 0o600 });
          }
          input.onEvent({
            type: 'item',
            item: {
              id: withNativeContent ? 'tool-reg' : 'tool-plain',
              nativeTool: true,
              kind: 'tool',
              role: 'system',
              name: 'command',
              input: withNativeContent ? 'echo reg' : 'echo plain',
              text: withNativeContent ? 'summary reg' : 'inline summary only',
              status: 'completed',
              executionId: execRef.id,
            },
          });
          input.onEvent({
            type: 'item',
            item: { id: `ans-${id}`, kind: 'message', role: 'assistant', text: 'done', status: 'completed', executionId: execRef.id },
          });
          input.onEvent({ type: 'observation', observation: { status: 'idle', executionRef: execRef, tools: [], backgroundWork: false } });
          input.onEvent({ type: 'completed', status: 'completed' });
        },
        async observe() { return { status: 'idle', tools: [], backgroundWork: false }; },
        async canRelease() { return true; },
        async stop(input) { return { status: 'stopped', executionRef: input.executionRef, tools: [], backgroundWork: false }; },
        async reply() {},
        async close() { closed = true; },
      };
    },
  });

  const service = createAgentService({
    dataRoot: root,
    executors: [makeTestExec('reg-exec', true), makeTestExec('plain-exec', false)],
    modelProviders: [],
    resolveWorkspace: async () => ({ rootPath: workspace }),
  });
  t.after(() => service.close());

  for (const id of ['reg-exec', 'plain-exec']) {
    await service.connections.connect(id, { expectedRevision: service.connections.read(id).revision, executable: exe });
  }

  // Registered executor: records nativeTools, projects nativeDetail: true, and serves full detail via readEntry
  const regChat = await service.conversations.create('ws', {});
  service.conversations.send('ws', regChat.id, {
    expectedRevision: regChat.revision,
    clientRequestId: 'req-reg',
    connectionId: 'reg-exec',
    text: 'run reg',
  });
  for (let i = 0; i < 80; i++) {
    if (service.conversations.read('ws', regChat.id).run?.status === 'completed') break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const regView = service.conversations.read('ws', regChat.id, { compactTools: true });
  const regTool = regView.entries.find(e => e.kind === 'tool')!;
  assert.equal(regTool.nativeDetail, true);
  assert.ok(regTool.detail?.revision);
  const fullRegTool = service.conversations.readEntry('ws', regChat.id, regTool.id, regTool.detail!.revision);
  assert.equal(fullRegTool.text, 'registered full output');

  // Unregistered executor: even when item.nativeTool is true, does NOT record nativeTools, omits nativeDetail, keeps saved summary
  const plainChat = await service.conversations.create('ws', {});
  service.conversations.send('ws', plainChat.id, {
    expectedRevision: plainChat.revision,
    clientRequestId: 'req-plain',
    connectionId: 'plain-exec',
    text: 'run plain',
  });
  for (let i = 0; i < 80; i++) {
    if (service.conversations.read('ws', plainChat.id).run?.status === 'completed') break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const plainView = service.conversations.read('ws', plainChat.id, { compactTools: true });
  const plainTool = plainView.entries.find(e => e.kind === 'tool')!;
  assert.equal(plainTool.nativeDetail, undefined);
  assert.equal(plainTool.detail, undefined);
  assert.equal(plainTool.text, 'inline summary only');
  const repo = new ConversationRepository(path.join(root, 'agent-service'));
  try {
    assert.equal(repo.readConversation(plainChat.id)?.nativeTools, undefined);
  } finally {
    repo.stopReadModels();
  }
});
