import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ExecutorEvent, ExecutorItem, ExecutorRequest } from '../../../src/contracts.ts';
import { ExecutorInputRejected, ExecutorObservationLost } from '../../../src/contracts.ts';
import { AgentServiceError } from '../../../src/domain/agent-state.ts';
import { interactionPolicy } from '../../../src/domain/interaction-policy.ts';
import { readAntigravityTool } from '../../../src/executors/antigravity/content.ts';
import { createAntigravityExecutor } from '../../../src/executors/antigravity/index.ts';
import { ownedProcessGroupIdle } from '../../../src/executors/native-process.ts';

const fixtureSource = fileURLToPath(new URL('./fixtures/antigravity-acp.mjs', import.meta.url));

async function createHarness(
  t: test.TestContext,
  initialControl: Record<string, unknown> = {},
  initialAuth?: Record<string, unknown>,
) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'buildr-agy-int-')));
  const cwd = path.join(root, 'workspace');
  const binDir = path.join(root, 'managed-bin');
  const configRoot = path.join(root, 'connections', 'antigravity');
  const cliDir = path.join(configRoot, 'home', '.gemini', 'antigravity-cli');
  const executable = path.join(binDir, 'antigravity-acp.mjs');
  const keyringFile = path.join(cliDir, 'fixture-keyring.json');
  const controlFile = path.join(cliDir, 'fixture-control.json');

  await mkdir(cwd, { recursive: true });
  await mkdir(binDir, { recursive: true });
  await mkdir(cliDir, { recursive: true });
  await copyFile(fixtureSource, executable);
  await writeFile(controlFile, JSON.stringify(initialControl, null, 2) + '\n');
  if (initialAuth) {
    await writeFile(keyringFile, JSON.stringify(initialAuth, null, 2) + '\n');
  }

  const environment: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: root,
  };

  const executor = createAntigravityExecutor();
  const openedRuntimes: Array<{ close(): Promise<void> }> = [];

  t.after(async () => {
    await Promise.allSettled(openedRuntimes.map(rt => rt.close()));
    await rm(root, { recursive: true, force: true });
  });

  async function setControl(patch: Record<string, unknown>) {
    const current = JSON.parse(await readFile(controlFile, 'utf8').catch(() => '{}'));
    await writeFile(controlFile, JSON.stringify({ ...current, ...patch }, null, 2) + '\n');
  }

  async function setAuth(nextAuth: Record<string, unknown>) {
    await writeFile(keyringFile, JSON.stringify(nextAuth, null, 2) + '\n');
  }

  async function readFixtureJsonl(fileName: string): Promise<any[]> {
    const target = path.join(configRoot, 'home', '.gemini', 'antigravity-cli', fileName);
    try {
      const text = await readFile(target, 'utf8');
      return text.split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  async function openRuntime(extra: {
    interactionInstructions?: string;
    binding?: { identity: string; data?: Record<string, unknown>; executable?: string; configRoot?: string };
    nativeSource?: {
      accountId: string;
      accountIdentity: string;
      modelId: string;
      model: { id: string; label: string; images?: boolean; tools?: boolean };
    };
  } = {}) {
    const rt = await executor.open({
      connectionId: 'antigravity',
      configRoot,
      executable,
      environment,
      ...(extra.interactionInstructions
        ? { interaction: { version: 'buildr-interaction/v1', instructions: extra.interactionInstructions } }
        : {}),
      ...(extra.binding ? { binding: extra.binding } : {}),
      ...(extra.nativeSource ? { nativeSource: extra.nativeSource } : {}),
    });
    openedRuntimes.push(rt);
    return rt;
  }

  return {
    root,
    cwd,
    configRoot,
    executable,
    environment,
    executor,
    setControl,
    setAuth,
    readFixtureJsonl,
    openRuntime,
  };
}

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

  // 1. Create context injects Buildr interaction policy + Chinese progress requirement.
  const ctx = await rt.createContext({ cwd: h.cwd, permissionMode: 'full-access' });
  const sessionsLog1 = await h.readFixtureJsonl('fixture-sessions.jsonl');
  const createdEntry = sessionsLog1.find(row => row.method === 'session/new' && row.sessionId === ctx.id);
  assert.ok(createdEntry);
  assert.equal(createdEntry.skipPermissions, true);
  assert.match(String(createdEntry.appendPrompt), /开始每一段工具执行前/);
  assert.match(String(createdEntry.appendPrompt), /简体中文/);

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

test('3.4 & 3.6: segmented process narrations around tools, thinking, plan, diff/failed/status-only tools, stopReasons, missing terminal frame, backgroundActive, images, usage & title', async t => {
  const h = await createHarness(t, { autoAllow: true });
  const rt = await h.openRuntime();
  const ctx = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });

  // Prepare a small valid PNG image and an oversized >8MB file.
  const validPng = path.join(h.root, 'small.png');
  await writeFile(validPng, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
  const hugePng = path.join(h.root, 'huge.png');
  await writeFile(hugePng, Buffer.alloc(8 * 1024 * 1024 + 64, 1));

  // Oversized image is rejected before admission.
  await assert.rejects(
    () =>
      rt.send({
        contextRef: ctx,
        cwd: h.cwd,
        text: '超限图片测试',
        images: [{ id: 'img-huge', path: hugePng, mimeType: 'image/png' }],
        clientRequestId: 'req-huge-img',
        onEvent: () => {},
      }),
    ExecutorInputRejected,
  );

  // Full turn with [DIFF_TOOL] and valid image: verifies narration1 -> tool1 -> narration2 -> tool2(file-change) -> final reply,
  // separate thinking, plan notice, usage_update (not billing usage!), and session_info_update title.
  const events: ExecutorEvent[] = [];
  await rt.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '检查并应用补丁 [DIFF_TOOL]',
    images: [{ id: 'img-1', path: validPng, mimeType: 'image/png' }],
    clientRequestId: 'req-rich-turn',
    onEvent: ev => events.push(ev),
  });

  const itemMap = new Map<string, ExecutorItem>();
  const itemOrder: string[] = [];
  for (const ev of events) {
    if (ev.type === 'item') {
      const key = `${ev.item.kind}:${ev.item.id}`;
      if (!itemMap.has(key)) itemOrder.push(key);
      itemMap.set(key, ev.item);
    }
  }
  const orderedItems = itemOrder.map(k => itemMap.get(k)!);
  const assistantMessages = orderedItems.filter(it => it.kind === 'message' && it.role === 'assistant');
  assert.equal(assistantMessages.length, 3, 'must produce narration 1, narration 2, and final reply as 3 distinct message items');
  assert.equal(assistantMessages[0]!.text, '我先读取项目文件确认现状。');
  assert.equal(assistantMessages[1]!.text, '文件读取完成，接下来执行构建检查并更新补丁。');
  assert.match(assistantMessages[2]!.text, /已完成处理.*含 1 张图片/);

  const thinkingItems = orderedItems.filter(it => it.kind === 'thinking');
  assert.equal(thinkingItems.length, 1);
  assert.equal(thinkingItems[0]!.thinking, true);

  const planItems = orderedItems.filter(it => it.kind === 'notice' && it.id.startsWith('plan:'));
  assert.equal(planItems.length, 1);
  assert.match(planItems[0]!.text, /1\. 读取配置与源码/);

  const toolItems = orderedItems.filter(it => it.kind === 'tool');
  assert.equal(toolItems.length, 2);
  // Tool 1 received a status-only tool_call_update without title/rawInput -> must preserve 'read' and merged path!
  assert.equal(toolItems[0]!.name, 'read');
  assert.match(String(toolItems[0]!.input), /README\.md/);
  assert.match(toolItems[0]!.text, /\[内容已截断/);
  // Tool 2 had diff content -> mapped to 'file-change'
  assert.equal(toolItems[1]!.name, 'file-change');

  // Context usage comes from usage_update (4096 / 1048576), ignoring PromptResult.usage (951_200).
  const usageEv = events.find((ev): ev is Extract<ExecutorEvent, { type: 'context-usage' }> => ev.type === 'context-usage');
  assert.ok(usageEv);
  assert.equal(usageEv.usedTokens, 4096);
  assert.equal(usageEv.windowTokens, 1048576);

  // Title event & readTitle
  const titleEv = events.find((ev): ev is Extract<ExecutorEvent, { type: 'title' }> => ev.type === 'title');
  assert.ok(titleEv);
  assert.equal(await rt.readTitle!({ contextRef: ctx, cwd: h.cwd }), titleEv.title);

  // `completed` must be followed by terminal `observation` (`status: 'idle'`).
  const completedIdx = events.findIndex(ev => ev.type === 'completed');
  const lastObsIdx = events.findLastIndex(ev => ev.type === 'observation');
  assert.ok(completedIdx >= 0 && lastObsIdx > completedIdx, 'terminal observation must follow completed event');

  // Failed tool + truncated final stream reconciliation
  await h.setControl({ scenario: 'failed-tool', autoAllow: true });
  const failedEvents: ExecutorEvent[] = [];
  await rt.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '工具失败测试',
    images: [],
    clientRequestId: 'req-failed-tool',
    onEvent: ev => failedEvents.push(ev),
  });
  const failedToolItem = failedEvents
    .filter((ev): ev is Extract<ExecutorEvent, { type: 'item' }> => ev.type === 'item' && ev.item.kind === 'tool')
    .map(ev => ev.item)
    .find(it => it.status === 'failed');
  assert.ok(failedToolItem, 'failed native tool must remain failed');

  // Missing terminal RPC response recovered via native transcript watcher + truncated final text reconciliation
  await h.setControl({ scenario: 'missing-terminal-response', autoAllow: true });
  const missingFrameEvents: ExecutorEvent[] = [];
  await rt.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '终态帧丢失兜底测试',
    images: [],
    clientRequestId: 'req-missing-frame',
    onEvent: ev => missingFrameEvents.push(ev),
  });
  assert.ok(missingFrameEvents.some(ev => ev.type === 'completed' && ev.status === 'completed'));

  // Stop reasons: max_tokens & refusal -> stopped with diagnostic (never completed!)
  for (const reasonScenario of ['max-tokens', 'refusal'] as const) {
    await h.setControl({ scenario: reasonScenario, autoAllow: true });
    const stopReasonEvents: ExecutorEvent[] = [];
    await rt.send({
      contextRef: ctx,
      cwd: h.cwd,
      text: `上限或拒绝测试 ${reasonScenario}`,
      images: [],
      clientRequestId: `req-${reasonScenario}`,
      onEvent: ev => stopReasonEvents.push(ev),
    });
    const comp = stopReasonEvents.find((ev): ev is Extract<ExecutorEvent, { type: 'completed' }> => ev.type === 'completed');
    assert.ok(comp);
    assert.equal(comp.status, 'stopped');
    assert.ok(comp.diagnostic);
  }

  // An unsettled command at end_turn keeps the original execution active.
  await h.setControl({ scenario: 'unsettled-tool', autoAllow: true });
  const unsettledEvents: ExecutorEvent[] = [];
  await rt.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '未结工具核对',
    images: [],
    clientRequestId: 'req-unsettled',
    onEvent: ev => unsettledEvents.push(ev),
  });
  assert.equal(unsettledEvents.some(ev => ev.type === 'completed' && ev.status === 'completed'), false);
  const lastUnsettledObs = unsettledEvents.findLast(
    (ev): ev is Extract<ExecutorEvent, { type: 'observation' }> => ev.type === 'observation',
  );
  assert.equal(lastUnsettledObs?.observation.status, 'running');
  assert.equal(lastUnsettledObs?.observation.backgroundWork, true);

  // Background continuation (`background-active`) -> stays running (`backgroundWork: true`), no premature completed!
  await h.setControl({ scenario: 'background-active', autoAllow: true });
  const bgCtx = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const bgEvents: ExecutorEvent[] = [];
  await rt.send({
    contextRef: bgCtx,
    cwd: h.cwd,
    text: '后台续跑测试',
    images: [],
    clientRequestId: 'req-bg',
    onEvent: ev => bgEvents.push(ev),
  });
  assert.equal(bgEvents.some(ev => ev.type === 'completed'), false);
  const bgObs = bgEvents.findLast((ev): ev is Extract<ExecutorEvent, { type: 'observation' }> => ev.type === 'observation');
  assert.equal(bgObs?.observation.status, 'running');
  assert.equal(bgObs?.observation.backgroundWork, true);
});

test('Antigravity keeps the original background command until its late exit result', { timeout: 10_000 }, async t => {
  const h = await createHarness(t, { scenario: 'late-command-result', autoAllow: true });
  const rt = await h.openRuntime();
  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const events: ExecutorEvent[] = [];
  const finished = Promise.withResolvers<void>();
  await rt.send({
    contextRef, cwd: h.cwd, text: '后台退出回执', images: [], clientRequestId: 'late-command',
    onEvent: event => {
      events.push(event);
      if (event.type === 'completed') finished.resolve();
    },
  });
  const accepted = events.find(event => event.type === 'accepted');
  assert.ok(accepted);
  const input = { contextRef, executionRef: accepted.executionRef };
  const active = await rt.observe(input);
  assert.equal(active.backgroundWork, true);
  const original = active.tools.find(tool => tool.status === 'running');
  assert.ok(original);
  assert.equal(events.some(event => event.type === 'completed'), false);
  await finished.promise;
  const ended = await rt.observe(input);
  assert.equal(ended.status, 'idle');
  assert.equal(ended.backgroundWork, false);
  assert.equal(ended.tools.find(tool => tool.id === original.id)?.status, 'completed');
  assert.ok(events.some(event => event.type === 'item' && event.item.id === original.id
    && event.item.status === 'completed' && event.item.text === 'original command exited with code 0'));
  assert.equal(events.filter(event => event.type === 'completed').length, 1);
});

test('Antigravity correlates a system exit receipt with the original command and retains failure', { timeout: 10_000 }, async t => {
  const h = await createHarness(t, { scenario: 'background-transcript-exit', autoAllow: true });
  const rt = await h.openRuntime();
  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const events: ExecutorEvent[] = [];
  const finished = Promise.withResolvers<void>();
  await rt.send({ contextRef, cwd: h.cwd, text: '退出回执', images: [], clientRequestId: 'system-exit',
    onEvent: event => { events.push(event); if (event.type === 'completed') finished.resolve(); },
  });
  const active = await rt.observe({ contextRef });
  const original = active.tools.find(tool => tool.status === 'running');
  assert.ok(active.backgroundWork && original);
  await finished.promise;
  assert.ok(events.some(event => event.type === 'item' && event.item.id === original.id
    && event.item.status === 'failed' && event.item.text.includes('exited with code 7')));
  assert.equal((await rt.observe({ contextRef })).status, 'idle');
});

test('3.5: approval excludes persistent grants, preserves request on invalid answer, and full-access still waits on business questions', async t => {
  const h = await createHarness(t, { scenario: 'include-persistent-option', autoAllow: false });
  const rt = await h.openRuntime();
  const ctx = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });

  let capturedApproval: ExecutorRequest | undefined;
  let invalidRejected = false;
  const approvalEvents: ExecutorEvent[] = [];

  await rt.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '测试持久授权过滤与单次审批',
    images: [],
    permissionMode: 'default',
    clientRequestId: 'req-perm-check',
    onEvent: ev => {
      approvalEvents.push(ev);
      if (ev.type === 'request' && ev.request.kind === 'approval') {
        capturedApproval = ev.request;
        const accepted = approvalEvents.find(
          (item): item is Extract<ExecutorEvent, { type: 'accepted' }> => item.type === 'accepted',
        )!;
        void (async () => {
          // Persistent option (`allow_always`) must not appear in options AND must be rejected if forged!
          assert.equal(ev.request.options?.some(opt => opt.id === 'allow_always'), false);
          try {
            await rt.reply({
              contextRef: ctx,
              executionRef: accepted.executionRef,
              requestId: ev.request.id,
              answer: 'allow_always',
            });
          } catch (err) {
            if (err instanceof AgentServiceError && err.code === 'agent_request_answer_invalid') {
              invalidRejected = true;
            }
          }
          // Pending request is still alive and accepts valid single-turn `allow_once`.
          await rt.reply({
            contextRef: ctx,
            executionRef: accepted.executionRef,
            requestId: ev.request.id,
            answer: 'allow_once',
          });
        })();
      }
    },
  });
  assert.ok(capturedApproval);
  assert.equal(invalidRejected, true, 'forged persistent option must be rejected while keeping the approval pending');

  // Business question (`elicitation/create`) under `full-access` mode must STILL wait for user answer,
  // and unexpressible nested object schema must be cancelled with diagnostic!
  await h.setControl({ scenario: '' });
  const fullCtx = await rt.createContext({ cwd: h.cwd, permissionMode: 'full-access' });
  let sawQuestionInFullAccess = false;
  const qEvents: ExecutorEvent[] = [];
  await rt.send({
    contextRef: fullCtx,
    cwd: h.cwd,
    text: '完全访问下的业务提问与不可表达表单 [ASK_QUESTION] [ASK_INVALID_QUESTION]',
    images: [],
    permissionMode: 'full-access',
    clientRequestId: 'req-question-fa',
    onEvent: ev => {
      qEvents.push(ev);
      if (ev.type === 'request' && ev.request.kind === 'question') {
        sawQuestionInFullAccess = true;
        const accepted = qEvents.find(
          (item): item is Extract<ExecutorEvent, { type: 'accepted' }> => item.type === 'accepted',
        )!;
        void rt.reply({
          contextRef: fullCtx,
          executionRef: accepted.executionRef,
          requestId: ev.request.id,
          answer: { env: 'staging', checks: ['unit', 'e2e'], note: '按预发回归' },
        });
      }
    },
  });
  assert.equal(sawQuestionInFullAccess, true);
  assert.equal(
    qEvents.some(ev => ev.type === 'diagnostic' && /取消该请求/.test(ev.message)),
    true,
    'unexpressible elicitation schema must be cancelled with diagnostic',
  );
  const elicitations = await h.readFixtureJsonl('fixture-elicitations.jsonl');
  assert.equal(elicitations.length, 2);
  assert.deepEqual(elicitations[0]!.elicitation, {
    action: 'accept',
    content: { env: 'staging', checks: ['unit', 'e2e'], note: '按预发回归' },
  });
  assert.deepEqual(elicitations[1]!.elicitation, { action: 'cancel' });
});

test('4.1 & 4.2: concurrent per-conversation stop isolation (including cancel timeout), disconnect recovery, cold readHistory deduplication & nativeContent bounds', async t => {
  const h = await createHarness(t, { autoAllow: true });
  const rt = await h.openRuntime();

  // 1. Two conversations running concurrently: Conversation A ignores `session/cancel` and spawns a child process;
  //    stopping Conversation A kills ONLY Conversation A's process group, while Conversation B completes unaffected!
  const ctxStopA = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const ctxKeepB = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });

  const eventsA: ExecutorEvent[] = [];
  const eventsB: ExecutorEvent[] = [];
  let execRefA: { id: string; data?: Record<string, unknown> } | undefined;
  let toolStartedResolve!: () => void;
  const toolStartedA = new Promise<void>(resolve => {
    toolStartedResolve = resolve;
  });

  const runAPromise = rt.send({
    contextRef: ctxStopA,
    cwd: h.cwd,
    text: '长命令且忽略取消 [LONG_COMMAND] [CANCEL_IGNORED] [AUTO_ALLOW]',
    images: [],
    clientRequestId: 'req-stop-a',
    onEvent: ev => {
      eventsA.push(ev);
      if (ev.type === 'accepted') execRefA = ev.executionRef;
      if (ev.type === 'item' && ev.item.kind === 'tool' && ev.item.status === 'running') {
        toolStartedResolve();
      }
    },
  });

  await toolStartedA;
  assert.ok(execRefA);

  const [stopObsA, _runB] = await Promise.all([
    rt.stop({ contextRef: ctxStopA, executionRef: execRefA }),
    rt.send({
      contextRef: ctxKeepB,
      cwd: h.cwd,
      text: '并发对话 B 不受停止影响 [AUTO_ALLOW]',
      images: [],
      clientRequestId: 'req-keep-b',
      onEvent: ev => eventsB.push(ev),
    }),
    runAPromise,
  ]);

  assert.equal(stopObsA.status, 'stopped');
  assert.equal(stopObsA.tools[0]?.status, 'unknown', 'unsettled tool after process-group kill must be marked unknown');
  if (process.platform !== 'win32') {
    const groupA = Number(execRefA.data?.resourceGroup);
    assert.equal(await ownedProcessGroupIdle(groupA), true, 'Conversation A process group including child must be idle');
    assert.equal(
      await h.executor.readReleasedControl!({
        bindingIdentity: rt.bindingIdentity,
        contextRef: ctxStopA,
        executionRef: execRefA,
        cwd: h.cwd,
      }),
      true,
    );
  }
  assert.equal(
    eventsB.some(ev => ev.type === 'completed' && ev.status === 'completed'),
    true,
    'Conversation B must continue and complete unaffected when Conversation A process group is killed',
  );

  // 2. Unexpected mid-turn disconnect throws ExecutorObservationLost('execution') and leaves running state unknown without replay.
  const ctxDisc = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  await h.setControl({ scenario: 'disconnect', autoAllow: true });
  const discEvents: ExecutorEvent[] = [];
  await assert.rejects(
    () =>
      rt.send({
        contextRef: ctxDisc,
        cwd: h.cwd,
        text: '模拟意外断连',
        images: [],
        clientRequestId: 'req-disconnect',
        onEvent: ev => discEvents.push(ev),
      }),
    (err: unknown) => err instanceof ExecutorObservationLost && err.scope === 'execution',
  );
  const lastDiscObs = discEvents.findLast(
    (ev): ev is Extract<ExecutorEvent, { type: 'observation' }> => ev.type === 'observation',
  );
  assert.equal(lastDiscObs?.observation.status, 'unknown');
  assert.deepEqual(lastDiscObs?.observation.fault, { kind: 'transport' });

  // 3. Cold restart: reopen runtime, readHistory on `ctxKeepB` must NOT duplicate user/assistant/tool entries,
  //    readAntigravityTool returns full untruncated tool output and rejects wrong session or traversal,
  //    and readPersistedExecution recovers durable terminal completion!
  await h.setControl({ scenario: '', autoAllow: true });
  await rt.close();

  const rtCold = await h.openRuntime();
  await rtCold.resumeContext({ contextRef: ctxKeepB, cwd: h.cwd, permissionMode: 'default' });
  const historyB = await rtCold.readHistory({ contextRef: ctxKeepB, cwd: h.cwd });
  const userHistoryB = historyB.filter(it => it.role === 'user');
  assert.equal(userHistoryB.length, 1, 'cold readHistory must deduplicate durable rows and session/load replay');
  const readToolHistory = historyB.find(it => it.kind === 'tool' && it.name === 'read');
  assert.ok(readToolHistory);

  // Full tool output via `readAntigravityTool` (`nativeContent`)
  const fullToolDetail = readAntigravityTool(h.root, {
    version: 3,
    provider: 'antigravity',
    contextId: ctxKeepB.id,
    nativeId: readToolHistory.id,
    text: [],
    entry: {
      id: 'entry-tool-1',
      sequence: 2,
      createdAt: new Date().toISOString(),
      kind: 'tool',
      role: 'assistant',
      text: 'truncated preview',
      status: 'completed',
    },
    session: {
      config: 'connections/antigravity',
      cwd: h.cwd,
    },
  });
  assert.ok(fullToolDetail);
  assert.ok(fullToolDetail.text.length > 16_000, 'nativeContent readTool must return untruncated full output');

  // Wrong session or path traversal in `nativeContent` must return undefined.
  assert.equal(
    readAntigravityTool(h.root, {
      version: 3,
      provider: 'antigravity',
      contextId: ctxStopA.id,
      nativeId: readToolHistory.id,
      text: [],
      entry: {
        id: 'entry-tool-1',
        sequence: 2,
        createdAt: new Date().toISOString(),
        kind: 'tool',
        role: 'assistant',
        text: '',
      },
      session: {
        config: 'connections/antigravity',
        cwd: h.cwd,
      },
    }),
    undefined,
  );
  assert.equal(
    readAntigravityTool(h.root, {
      version: 3,
      provider: 'antigravity',
      contextId: ctxKeepB.id,
      nativeId: readToolHistory.id,
      text: [],
      entry: {
        id: 'entry-tool-1',
        sequence: 2,
        createdAt: new Date().toISOString(),
        kind: 'tool',
        role: 'assistant',
        text: '',
      },
      session: {
        config: '../outside',
        cwd: h.cwd,
      },
    }),
    undefined,
  );

  // `readPersistedExecution` recovers terminal completion from durable session records without opening a child process.
  const acceptedB = eventsB.find((ev): ev is Extract<ExecutorEvent, { type: 'accepted' }> => ev.type === 'accepted')!;
  const persisted = await h.executor.readPersistedExecution!({
    configRoot: h.configRoot,
    executable: h.executable,
    bindingIdentity: rtCold.bindingIdentity,
    contextRef: ctxKeepB,
    executionRef: acceptedB.executionRef,
    cwd: h.cwd,
    nativeInputs: [
      {
        clientRequestId: 'req-keep-b',
        text: '并发对话 B 不受停止影响 [AUTO_ALLOW]',
        createdAt: new Date(Date.now() - 10_000).toISOString(),
      },
    ],
  });
  assert.ok(persisted);
  assert.equal(persisted.observation.status, 'idle');
});
