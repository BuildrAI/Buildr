import assert from 'node:assert/strict';
import { readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ExecutorEvent } from '../../../src/contracts.ts';
import { ExecutorInputRejected } from '../../../src/contracts.ts';
import { AgentServiceError } from '../../../src/domain/agent-state.ts';
import { interactionPolicy } from '../../../src/domain/interaction-policy.ts';
import { createHarness } from '../../support/antigravity-harness.ts';

test('Antigravity accepts device-only fingerprint drift but still rejects a changed executable', async t => {
  const h = await createHarness(t);
  const initial = await h.openRuntime();
  const info = await stat(h.executable);
  const priorDev = info.dev + 4096;
  const provenance: Record<string, unknown> = { ...initial.bindingData!, dev: priorDev };
  delete provenance.observedVersion;
  delete provenance.executableDigest;
  const identity = createHash('sha256').update(JSON.stringify(provenance)).digest('hex');
  const executableDigest = createHash('sha256').update(JSON.stringify([await realpath(h.executable), priorDev, info.ino, info.size, info.mtimeMs])).digest('hex');
  const binding = { identity, data: { ...provenance, executableDigest }, executable: h.executable };
  await initial.close();
  const reopened = await h.openRuntime({ binding });
  assert.equal(reopened.bindingIdentity, identity);
  assert.notEqual(reopened.bindingData!.executableDigest, executableDigest, 'new metadata is observed without changing the native binding');
  await reopened.close();
  const marker = path.join(h.root, 'changed-program-ran');
  const original = await readFile(h.executable, 'utf8');
  await writeFile(h.executable, original.replace('\n', `\nawait import('node:fs').then(fs => fs.writeFileSync(${JSON.stringify(marker)}, 'ran'));\n`));
  await assert.rejects(h.openRuntime({ binding }), /agent_context_binding_mismatch/);
  await assert.rejects(readFile(marker), { code: 'ENOENT' }, 'changed program must be rejected before even --version runs');
});

test('cold Antigravity runtime preserves a verified participant binding across device drift', async t => {
  const h = await createHarness(t);
  const initial = await h.openRuntime();
  const provenance: Record<string, unknown> = { ...initial.bindingData!, dev: Number(initial.bindingData!.dev) + 4096 };
  delete provenance.observedVersion;
  delete provenance.executableDigest;
  const identity = createHash('sha256').update(JSON.stringify(provenance)).digest('hex');
  const preferredBinding = { identity, data: provenance };
  await initial.close();
  const resumed = await h.openRuntime({
    binding: { identity: initial.bindingIdentity, data: initial.bindingData },
    preferredBinding,
  });
  assert.equal(resumed.bindingIdentity, identity, 'the participant fingerprint must not be replaced by the connection fingerprint');
  await resumed.close();
  const tampered = await h.openRuntime({
    binding: { identity: initial.bindingIdentity, data: initial.bindingData },
    preferredBinding: { identity, data: { ...provenance, ino: Number(provenance.ino) + 1 } },
  });
  assert.equal(tampered.bindingIdentity, initial.bindingIdentity, 'changed config provenance must never be adopted');
});

test('2.3: handshake validation, in-place binary tamper detection, per-conversation process groups and storage reclaim', async t => {
  const h = await createHarness(t);

  await h.setControl({ scenario: 'missing-prompt-capability' });
  await assert.rejects(
    () => h.openRuntime(),
    (err: unknown) => err instanceof AgentServiceError && err.code === 'agent_protocol_capability_missing',
  );

  await h.setControl({ scenario: 'missing-resume-capability' });
  await assert.rejects(
    () => h.openRuntime(),
    (err: unknown) => err instanceof AgentServiceError && err.code === 'agent_protocol_capability_missing',
  );

  await h.setControl({ scenario: '', autoAllow: true });
  const rt = await h.openRuntime();

  const ctxA = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const ctxB = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  assert.notEqual(ctxA.id, ctxB.id);

  const eventsA: ExecutorEvent[] = [];
  const eventsB: ExecutorEvent[] = [];
  await Promise.all([
    rt.send({
      contextRef: ctxA,
      cwd: h.cwd,
      text: '对话 A 检查 [AUTO_ALLOW]',
      images: [],
      clientRequestId: 'req-a-1',
      onEvent: ev => eventsA.push(ev),
    }),
    rt.send({
      contextRef: ctxB,
      cwd: h.cwd,
      text: '对话 B 检查 [AUTO_ALLOW]',
      images: [],
      clientRequestId: 'req-b-1',
      onEvent: ev => eventsB.push(ev),
    }),
  ]);

  const acceptedA = eventsA.find((ev): ev is Extract<ExecutorEvent, { type: 'accepted' }> => ev.type === 'accepted');
  const acceptedB = eventsB.find((ev): ev is Extract<ExecutorEvent, { type: 'accepted' }> => ev.type === 'accepted');
  assert.ok(acceptedA);
  assert.ok(acceptedB);
  if (process.platform !== 'win32') {
    assert.notEqual(
      acceptedA.executionRef.data?.resourceGroup,
      acceptedB.executionRef.data?.resourceGroup,
      'each conversation must run in its own isolated OS process group',
    );
  }

  assert.equal(await rt.prepareRelease!({ contextRef: ctxA, executionRef: acceptedA.executionRef }), true);
  assert.equal(await rt.canRelease!({ contextRef: ctxA, executionRef: acceptedA.executionRef }), true);
  assert.equal(await rt.canReclaimStorage!(), false, 'active runtime must not allow storage reclamation before close');

  await rt.close();
  assert.equal(await rt.canReclaimStorage!(), true);

  // Simulate external in-place tampering of the bound managed executable.
  const originalContent = await readFile(h.executable, 'utf8');
  await writeFile(h.executable, `${originalContent}\n// external modification\n`);
  await assert.rejects(
    () =>
      h.openRuntime({
        binding: {
          identity: rt.bindingIdentity,
          data: rt.bindingData,
          executable: h.executable,
          configRoot: h.configRoot,
        },
      }),
    /agent_context_binding_mismatch/,
  );
});

test('3.1 & 3.2: interaction policy injection, policy change handling, model/effort readback, and full-access permission round-trip', async t => {
  const h = await createHarness(t);
  const rt = await h.openRuntime();

  // 1. Create context injects unified Buildr interaction policy + system prompt without adapter-specific overrides.
  const ctx = await rt.createContext({ cwd: h.cwd, permissionMode: 'full-access' });
  const sessionsLog1 = await h.readFixtureJsonl('fixture-sessions.jsonl');
  const createdEntry = sessionsLog1.find(row => row.method === 'session/new' && row.sessionId === ctx.id);
  assert.ok(createdEntry);
  assert.equal(createdEntry.skipPermissions, true);
  assert.match(String(createdEntry.appendPrompt), /开始每一段工具执行前/);
  assert.match(String(createdEntry.appendPrompt), /简体中文/);
  assert.equal(createdEntry.appendPrompt, interactionPolicy.instructions);

  // 2. Run first turn in full-access: tool executes WITHOUT approval prompt.
  const fullAccessEvents: ExecutorEvent[] = [];
  await rt.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '第一轮完全访问执行',
    images: [],
    model: 'gemini-2.5-flash',
    reasoningEffort: 'medium',
    permissionMode: 'full-access',
    clientRequestId: 'req-fa-1',
    onEvent: ev => fullAccessEvents.push(ev),
  });
  assert.equal(
    fullAccessEvents.some(ev => ev.type === 'request' && ev.request.kind === 'approval'),
    false,
    'full-access mode must run without per-tool approval prompts',
  );

  // 3. Invalid model and readback mismatch must throw ExecutorInputRejected with zero prompt work.
  await assert.rejects(
    () =>
      rt.send({
        contextRef: ctx,
        cwd: h.cwd,
        text: '不应送达的非法模型请求',
        images: [],
        model: 'non-existent-model',
        permissionMode: 'full-access',
        clientRequestId: 'req-bad-model',
        onEvent: () => {},
      }),
    ExecutorInputRejected,
  );

  await h.setControl({ scenario: 'model-readback-mismatch' });
  await assert.rejects(
    () =>
      rt.send({
        contextRef: ctx,
        cwd: h.cwd,
        text: '不应送达的回读不一致请求',
        images: [],
        model: 'claude-sonnet-4-5',
        permissionMode: 'full-access',
        clientRequestId: 'req-mismatch-model',
        onEvent: () => {},
      }),
    ExecutorInputRejected,
  );
  await h.setControl({ scenario: '' });

  // 4. Switch back from full-access to default permission on the SAME session:
  //    process must be rebuilt without --dangerously-skip-permissions and tool MUST require approval again!
  let sawApprovalOnDefault = false;
  const defaultTurnEvents: ExecutorEvent[] = [];
  const sendPromise = rt.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '切回默认权限后的第二轮',
    images: [],
    permissionMode: 'default',
    clientRequestId: 'req-def-2',
    onEvent: ev => {
      defaultTurnEvents.push(ev);
      if (ev.type === 'request' && ev.request.kind === 'approval') {
        sawApprovalOnDefault = true;
        const accepted = defaultTurnEvents.find(
          (item): item is Extract<ExecutorEvent, { type: 'accepted' }> => item.type === 'accepted',
        )!;
        void rt.reply({
          contextRef: ctx,
          executionRef: accepted.executionRef,
          requestId: ev.request.id,
          answer: 'allow_once',
        });
      }
    },
  });
  await sendPromise;
  assert.equal(sawApprovalOnDefault, true, 'switching back to default mode must rebuild process and require tool approval again');

  // 5. Missing native session throws agent_context_unavailable.
  await assert.rejects(
    () =>
      rt.resumeContext({
        contextRef: {
          ...ctx,
          id: 'missing_session_12345',
          data: {
            ...ctx.data,
            native: JSON.stringify({
              version: 1,
              provider: 'antigravity',
              nativeSessionId: 'missing_session_12345',
              cwd: h.cwd,
              bindingIdentity: rt.bindingIdentity,
            }),
          },
        },
        cwd: h.cwd,
        permissionMode: 'default',
      }),
    (err: unknown) => err instanceof AgentServiceError && err.code === 'agent_context_unavailable',
  );
  await rt.close();

  // 6. Policy update when `systemPrompt.append` IS supported updates prompt via session/resume;
  //    when NOT supported (`no-prompt-append`), throws `agent_context_policy_changed`.
  const rtUpdatedPolicy = await h.openRuntime({
    interactionInstructions: `${interactionPolicy.instructions}\n新增策略条款 v2`,
  });
  await rtUpdatedPolicy.resumeContext({ contextRef: ctx, cwd: h.cwd, permissionMode: 'default' });
  const sessionsAfterResume = await h.readFixtureJsonl('fixture-sessions.jsonl');
  const resumedWithNewPolicy = sessionsAfterResume.findLast(row => row.method === 'session/resume' && row.sessionId === ctx.id);
  assert.ok(resumedWithNewPolicy);
  assert.match(String(resumedWithNewPolicy.appendPrompt), /新增策略条款 v2/);
  await rtUpdatedPolicy.close();

  await h.setControl({ scenario: 'no-prompt-append' });
  const rtNoAppend1 = await h.openRuntime({ interactionInstructions: '策略版本 v1' });
  const ctxNoAppend = await rtNoAppend1.createContext({ cwd: h.cwd, permissionMode: 'default' });
  assert.equal(ctxNoAppend.data?.supportsResumePolicyUpdate, false);
  await rtNoAppend1.close();

  const rtNoAppend2 = await h.openRuntime({ interactionInstructions: '策略版本 v2（已变更）' });
  await assert.rejects(
    () => rtNoAppend2.resumeContext({ contextRef: ctxNoAppend, cwd: h.cwd, permissionMode: 'default' }),
    (err: unknown) =>
      err instanceof AgentServiceError
      && err.code === 'agent_context_policy_changed'
      && /本轮将开启新的 Antigravity 会话/.test(err.message),
  );
});

test('Antigravity groups native variants and uses the same series on consecutive turns', async t => {
  const h = await createHarness(t, { scenario: 'series-catalog', autoAllow: true, models: [
    { modelId: 'gemini-4-carbon-medium', name: 'Gemini 4 Carbon (Medium)' },
    { modelId: 'gemini-4-carbon-low', name: 'Gemini 4 Carbon (Low)' },
    { modelId: 'gemini-4-hydrogen-xhigh', name: 'Gemini 4 Hydrogen (XHigh)' },
    { modelId: 'gemini-pro-orchestrator', name: 'Orchestrator (Carbon)' },
  ] });
  const rt = await h.openRuntime();
  const models = await rt.models();
  assert.deepEqual(models.map(model => [model.id, model.reasoningEfforts?.map(depth => depth.id)]), [
    ['gemini-4-carbon', ['low', 'medium']], ['gemini-4-hydrogen', ['xhigh']], ['gemini-pro-orchestrator', undefined],
  ]);
  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  for (const id of ['one', 'two']) {
    const events: ExecutorEvent[] = [];
    await rt.send({ contextRef, cwd: h.cwd, model: 'gemini-4-carbon', reasoningEffort: 'low',
      text: id, images: [], clientRequestId: id, onEvent: event => events.push(event) });
    assert.ok(events.some(event => event.type === 'completed' && event.status === 'completed'));
  }
  const configs = await h.readFixtureJsonl('fixture-configs.jsonl');
  assert.equal(configs.filter(row => row.method === 'session/set_model').length, 0);
  assert.equal(configs.filter(row => row.configId === 'thought_level' && row.value === 'low').length, 1);
  const history = await rt.readHistory({ contextRef, cwd: h.cwd });
  assert.equal(history.filter(item => item.role === 'user').length, 2);
  assert.ok(history.filter(item => item.role === 'assistant' && item.kind === 'message').every(item => item.id.startsWith('message:')));
});

test('Antigravity generically groups Gemini 4 Neon variants across series-catalog and per-variant model catalogs', async t => {
  const catalog = [
    { modelId: 'gemini-4-neon-high', name: 'Gemini 4 Neon (High)' },
    { modelId: 'gemini-4-neon-xhigh', name: 'Gemini 4 Neon (XHigh)' },
    { modelId: 'gemini-4-neon-medium', name: 'Gemini 4 Neon (Medium)' },
    { modelId: 'gemini-4-neon-low', name: 'Gemini 4 Neon (Low)' },
    { modelId: 'gemini-4-carbon-low', name: 'Gemini 4 Carbon (Low)' },
    { modelId: 'gemini-4-carbon-medium', name: 'Gemini 4 Carbon (Medium)' },
    { modelId: 'gemini-pro-orchestrator-neon', name: 'Orchestrator (Neon)' },
  ];

  // 1. series-catalog mode maps grouped series + reasoningEffort to configOptions (model + thought_level)
  const hSeries = await createHarness(t, { scenario: 'series-catalog', autoAllow: true, models: catalog });
  const rtSeries = await hSeries.openRuntime();
  const groupedModels = await rtSeries.models();
  const neon = groupedModels.find(model => model.id === 'gemini-4-neon');
  const carbon = groupedModels.find(model => model.id === 'gemini-4-carbon');
  const orchestrator = groupedModels.find(model => model.id === 'gemini-pro-orchestrator-neon');
  assert.deepEqual(neon, {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon',
    isDefault: true,
    reasoningEfforts: [
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
      { id: 'xhigh', label: 'Extra' },
    ],
    defaultReasoningEffort: 'high',
  });
  assert.deepEqual(carbon, {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    reasoningEfforts: [
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
    ],
    defaultReasoningEffort: 'medium',
  });
  assert.deepEqual(orchestrator, {
    id: 'gemini-pro-orchestrator-neon',
    label: 'Orchestrator (Neon)',
  });

  const ctxSeries = await rtSeries.createContext({ cwd: hSeries.cwd, permissionMode: 'default' });
  for (const [clientRequestId, reasoningEffort] of [['neon-xhigh', 'xhigh'], ['neon-low', 'low']] as const) {
    const events: ExecutorEvent[] = [];
    await rtSeries.send({
      contextRef: ctxSeries,
      cwd: hSeries.cwd,
      model: 'gemini-4-neon',
      reasoningEffort,
      text: clientRequestId,
      images: [],
      clientRequestId,
      onEvent: event => events.push(event),
    });
    assert.ok(events.some(event => event.type === 'completed' && event.status === 'completed'));
  }
  await assert.rejects(
    () => rtSeries.send({
      contextRef: ctxSeries,
      cwd: hSeries.cwd,
      model: 'gemini-4-carbon',
      reasoningEffort: 'xhigh',
      text: 'unsupported-depth',
      images: [],
      clientRequestId: 'neon-unsupported-depth',
      onEvent: () => {},
    }),
    ExecutorInputRejected,
  );
  const seriesConfigs = await hSeries.readFixtureJsonl('fixture-configs.jsonl');
  assert.deepEqual(
    seriesConfigs.filter(row => row.configId === 'thought_level').map(row => row.value),
    ['xhigh', 'low'],
  );

  // 2. Per-variant catalog mode maps grouped series + reasoningEffort (and legacy variant IDs) to session/set_model
  const hVariant = await createHarness(t, { autoAllow: true, models: catalog });
  const rtVariant = await hVariant.openRuntime();
  const ctxVariant = await rtVariant.createContext({ cwd: hVariant.cwd, permissionMode: 'default' });
  for (const [clientRequestId, model, reasoningEffort] of [
    ['variant-xhigh', 'gemini-4-neon', 'xhigh'],
    ['variant-low', 'gemini-4-neon', 'low'],
    ['variant-legacy', 'gemini-4-neon-high', undefined],
  ] as const) {
    const events: ExecutorEvent[] = [];
    await rtVariant.send({
      contextRef: ctxVariant,
      cwd: hVariant.cwd,
      model,
      ...(reasoningEffort ? { reasoningEffort } : {}),
      text: clientRequestId,
      images: [],
      clientRequestId,
      onEvent: event => events.push(event),
    });
    assert.ok(events.some(event => event.type === 'completed' && event.status === 'completed'));
  }
  const variantConfigs = await hVariant.readFixtureJsonl('fixture-configs.jsonl');
  assert.deepEqual(
    variantConfigs.filter(row => row.method === 'session/set_model').map(row => row.modelId),
    ['gemini-4-neon-xhigh', 'gemini-4-neon-low', 'gemini-4-neon-high'],
  );
});

test('3.3: pre-turn account identity verification rejects terminal account switch and corrupted identity with zero work input', async t => {
  const h = await createHarness(
    t,
    { autoAllow: true },
    {
      authenticated: true,
      methodId: 'oauth-personal',
      email: 'alice@example.com',
      tier: { id: 'g1-pro-tier', name: 'Google AI Pro' },
    },
  );
  const rt = await h.openRuntime();
  const ctx = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });

  // Simulate terminal switching to another Google account (`bob@example.com`) + cache expiry / fresh check.
  await h.setAuth({
    authenticated: true,
    methodId: 'oauth-personal',
    email: 'bob@example.com',
    tier: { id: 'g1-ultra-tier', name: 'Google AI Ultra' },
  });
  await rt.inspectModelSource!({ forceFresh: true });

  const eventsOnSwitchedAccount: ExecutorEvent[] = [];
  await assert.rejects(
    () =>
      rt.send({
        contextRef: ctx,
        cwd: h.cwd,
        text: '换号后不应继续在旧对话执行',
        images: [],
        clientRequestId: 'req-switched',
        onEvent: ev => eventsOnSwitchedAccount.push(ev),
      }),
    (err: unknown) => err instanceof ExecutorInputRejected && /账号已变化/.test(err.message),
  );
  assert.equal(eventsOnSwitchedAccount.length, 0, 'zero events/work input must occur when account changed');

  // Corrupted explicit account field (`email: ""`) must mark status failed / identityUnconfirmed and reject before input.
  await h.setAuth({
    authenticated: true,
    methodId: 'oauth-personal',
    email: '   ',
    tier: { id: 'g1-pro-tier', name: 'Google AI Pro' },
  });
  const corruptedProbe = await rt.inspectModelSource!({ forceFresh: true });
  assert.equal(corruptedProbe.status, 'failed');
  assert.equal(corruptedProbe.identityUnconfirmed, true);
  await assert.rejects(
    () =>
      rt.send({
        contextRef: ctx,
        cwd: h.cwd,
        text: '身份不可确认时拒绝发送',
        images: [],
        clientRequestId: 'req-corrupted-id',
        onEvent: () => {},
      }),
    ExecutorInputRejected,
  );
});

test('antigravity probe cleans up temporary conversation DB and brain directories while preserving real sessions', async t => {
  const h = await createHarness(
    t,
    { createCliSessionArtifacts: true },
    {
      authenticated: true,
      methodId: 'oauth-personal',
      email: 'probe-cleanup@example.com',
      tier: { id: 'g1-ultra-tier', name: 'Google AI Ultra' },
    },
  );
  const rt = await h.openRuntime();
  const observed = await rt.inspectModelSource!({ forceFresh: true });
  assert.equal(observed.status, 'ready');

  const cliDir = path.join(h.configRoot, 'home', '.gemini', 'antigravity-cli');
  assert.deepEqual(await readdir(path.join(cliDir, 'conversations')), []);
  assert.deepEqual(await readdir(path.join(cliDir, 'brain')), []);

  const realCtx = await rt.createContext({ cwd: h.cwd });
  assert.deepEqual(await readdir(path.join(cliDir, 'conversations')), [
    `${realCtx.id}.db`,
    `${realCtx.id}.db-wal`,
  ]);
  assert.deepEqual(await readdir(path.join(cliDir, 'brain')), [realCtx.id]);

  // A subsequent explicit probe must clean up only its own probe session and leave real sessions untouched.
  await rt.inspectModelSource!({ forceFresh: true });
  assert.deepEqual(await readdir(path.join(cliDir, 'conversations')), [
    `${realCtx.id}.db`,
    `${realCtx.id}.db-wal`,
  ]);
  assert.deepEqual(await readdir(path.join(cliDir, 'brain')), [realCtx.id]);
});

test('antigravity generateTitle runs isolated, downgrades orchestrator to lightweight model, returns Simplified Chinese, and enforces tool/language guards', async t => {
  const models = [
    { modelId: 'gemini-pro-orchestrator', name: 'Orchestrator (Carbon)' },
    { modelId: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  ];
  const h = await createHarness(
    t,
    { createCliSessionArtifacts: true, models },
    {
      authenticated: true,
      methodId: 'oauth-personal',
      email: 'title-zh@example.com',
      tier: { id: 'g1-ultra-tier', name: 'Google AI Ultra' },
      models,
    },
  );
  const rt = await h.openRuntime();
  const realCtx = await rt.createContext({ cwd: h.cwd, permissionMode: 'full-access' });

  const description = JSON.stringify({ messages: [{ role: 'user', text: '优化重启后自动接续与中文标题' }] });
  const generated = await rt.generateTitle!({
    contextRef: realCtx,
    cwd: h.cwd,
    model: 'gemini-pro-orchestrator',
    description,
    signal: new AbortController().signal,
  });
  assert.equal(generated, 'Antigravity 中文智能标题摘要');

  const sessions = await h.readFixtureJsonl('fixture-sessions.jsonl');
  const titleSession = sessions.findLast(row => row.method === 'session/new' && row.sessionId !== realCtx.id);
  assert.ok(titleSession, 'generateTitle must create an isolated auxiliary session');
  assert.notEqual(titleSession.cwd, h.cwd, 'auxiliary title session must use an isolated empty cwd');
  assert.equal(titleSession.skipPermissions, false, 'auxiliary title session must never enable skipPermissions');

  const configs = await h.readFixtureJsonl('fixture-configs.jsonl');
  assert.ok(
    configs.some(row => row.sessionId === titleSession.sessionId && row.configId === 'model' && row.value === 'gemini-2.5-flash'),
    'orchestrator title request must downgrade to a lightweight non-orchestrator Gemini model',
  );

  const cliDir = path.join(h.configRoot, 'home', '.gemini', 'antigravity-cli');
  assert.deepEqual(await readdir(path.join(cliDir, 'conversations')), [
    `${realCtx.id}.db`,
    `${realCtx.id}.db-wal`,
  ]);
  assert.deepEqual(await readdir(path.join(cliDir, 'brain')), [realCtx.id]);

  await h.setControl({ scenario: 'title-tool-attempt', createCliSessionArtifacts: true, models });
  await assert.rejects(
    rt.generateTitle!({
      contextRef: realCtx,
      cwd: h.cwd,
      model: 'gemini-2.5-flash',
      description,
      signal: new AbortController().signal,
    }),
    /agent_title_tools_forbidden/,
  );

  await h.setControl({ scenario: 'title-english-only', createCliSessionArtifacts: true, models });
  await assert.rejects(
    rt.generateTitle!({
      contextRef: realCtx,
      cwd: h.cwd,
      model: 'gemini-2.5-flash',
      description,
      signal: new AbortController().signal,
    }),
    /agent_title_output_invalid/,
  );
});
