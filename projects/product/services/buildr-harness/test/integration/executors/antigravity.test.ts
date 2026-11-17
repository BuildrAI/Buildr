import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
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
    preferredBinding?: { identity: string; data?: Record<string, unknown> };
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
      ...(extra.preferredBinding ? { preferredBinding: extra.preferredBinding } : {}),
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
  assert.ok(events.some(event => event.type === 'item' && event.item.kind === 'message'
    && event.item.role === 'assistant' && event.item.text.includes('后台结果已读取')));
  assert.equal(events.some(event => event.type === 'item' && event.item.kind === 'message'
    && event.item.role === 'user' && event.item.text.includes('[[buildr:background-continuation]]')), false);
  assert.equal(events.filter(event => event.type === 'completed').length, 1);

  const persisted = await h.executor.readPersistedExecution!({
    configRoot: h.configRoot,
    executable: h.executable,
    bindingIdentity: rt.bindingIdentity,
    contextRef,
    executionRef: accepted.executionRef,
    cwd: h.cwd,
    nativeInputs: [{
      clientRequestId: 'late-command',
      text: '后台退出回执',
      createdAt: new Date(Date.now() - 10_000).toISOString(),
    }],
  });
  assert.ok(persisted);
  assert.equal(persisted.items.some(item => item.kind === 'message' && item.role === 'user'
    && item.text.includes('[[buildr:background-continuation]]')), false);
  assert.ok(persisted.items.some(item => item.kind === 'message' && item.role === 'assistant'
    && item.text.includes('后台结果已读取')));
});

test('Antigravity keeps the round unknown when background continuation cannot start', { timeout: 10_000 }, async t => {
  const h = await createHarness(t, { scenario: 'continuation-fails', autoAllow: true });
  const rt = await h.openRuntime();
  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const events: ExecutorEvent[] = [];
  const unknown = Promise.withResolvers<void>();
  await rt.send({
    contextRef, cwd: h.cwd, text: '后台续行失败', images: [], clientRequestId: 'continuation-fails',
    onEvent: event => {
      events.push(event);
      if (event.type === 'observation' && event.observation.diagnostic?.includes('后台结果未能交回模型')) unknown.resolve();
    },
  });
  const active = await rt.observe({ contextRef });
  assert.ok(active.backgroundWork);
  await unknown.promise;
  const ended = await rt.observe({ contextRef });
  assert.equal(ended.status, 'unknown');
  assert.equal(events.some(event => event.type === 'completed'), false);
  assert.ok(ended.diagnostic?.includes('后台结果未能交回模型'), ended.diagnostic);
});

test('Antigravity completes the same round when the native harness keeps it open', { timeout: 10_000 }, async t => {
  const h = await createHarness(t, { scenario: 'native-background-continuation', autoAllow: true });
  const rt = await h.openRuntime();
  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const events: ExecutorEvent[] = [];
  const finished = Promise.withResolvers<void>();
  await rt.send({
    contextRef, cwd: h.cwd, text: '原生自行续行', images: [], clientRequestId: 'native-continuation',
    onEvent: event => {
      events.push(event);
      if (event.type === 'completed') finished.resolve();
    },
  });
  await finished.promise;
  const ended = await rt.observe({ contextRef });
  assert.equal(ended.status, 'idle');
  assert.equal(events.filter(event => event.type === 'completed').length, 1);
  assert.ok(events.some(event => event.type === 'item' && event.item.kind === 'message'
    && event.item.role === 'assistant' && event.item.text.includes('已完成处理')));
  assert.equal(events.some(event => event.type === 'item' && event.item.kind === 'message'
    && event.item.text.includes('后台结果已读取')), false);
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

test('Antigravity completes both runs when the identical command is re-run in a turn', { timeout: 15_000 }, async t => {
  const h = await createHarness(t, { scenario: 'background-rerun-exit', autoAllow: true });
  const rt = await h.openRuntime();
  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const events: ExecutorEvent[] = [];
  const finished = Promise.withResolvers<void>();
  await rt.send({ contextRef, cwd: h.cwd, text: '重复命令退出', images: [], clientRequestId: 'rerun-exit',
    onEvent: event => { events.push(event); if (event.type === 'completed') finished.resolve(); },
  });
  const active = await rt.observe({ contextRef });
  const running = active.tools.filter(tool => tool.status === 'running');
  assert.ok(active.backgroundWork);
  assert.equal(running.length, 2, 'both identical command runs stay running until their own exit');
  await finished.promise;
  const ended = await rt.observe({ contextRef });
  assert.equal(ended.status, 'idle');
  assert.equal(ended.backgroundWork, false);
  for (const tool of running) {
    assert.equal(ended.tools.find(item => item.id === tool.id)?.status, 'completed', `tool ${tool.id} must complete`);
    assert.ok(events.some(event => event.type === 'item' && event.item.id === tool.id
      && event.item.status === 'completed' && event.item.text.includes('exited with code 0')));
  }
  assert.equal(events.filter(event => event.type === 'completed').length, 1);
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

test('3.5b: Antigravity merges native ask_question pairs into single allowOther questions and splits option/other answers', async t => {
  const h = await createHarness(t, { autoAllow: true });
  const rt = await h.openRuntime();
  const ctx = await rt.createContext({ cwd: h.cwd, permissionMode: 'full-access' });

  const capturedRequests: ExecutorRequest[] = [];
  const events: ExecutorEvent[] = [];
  await rt.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '原生 ask_question 配对表单测试 [ASK_NATIVE_QUESTION]',
    images: [],
    permissionMode: 'full-access',
    clientRequestId: 'req-native-question',
    onEvent: ev => {
      events.push(ev);
      if (ev.type === 'request' && ev.request.kind === 'question') {
        capturedRequests.push(ev.request);
        const accepted = events.find(
          (item): item is Extract<ExecutorEvent, { type: 'accepted' }> => item.type === 'accepted',
        )!;
        const answer = capturedRequests.length === 1
          ? { q1: '1' }
          : { q1: '使用已有应用', q2: ['cli', '以及文档'] };
        void rt.reply({
          contextRef: ctx,
          executionRef: accepted.executionRef,
          requestId: ev.request.id,
          answer,
        });
      }
    },
  });

  assert.equal(capturedRequests.length, 2);
  assert.equal(capturedRequests[0]!.title, '需要你的回复');
  assert.deepEqual(capturedRequests[0]!.questions?.map(q => ({ id: q.id, allowOther: q.allowOther, multiple: q.multiple })), [
    { id: 'q1', allowOther: true, multiple: false },
  ]);
  assert.equal(capturedRequests[1]!.title, '需要你的回复');
  assert.deepEqual(capturedRequests[1]!.questions?.map(q => ({ id: q.id, allowOther: q.allowOther, multiple: q.multiple })), [
    { id: 'q1', allowOther: true, multiple: false },
    { id: 'q2', allowOther: true, multiple: true },
  ]);

  const elicitations = await h.readFixtureJsonl('fixture-elicitations.jsonl');
  assert.equal(elicitations.length, 2);
  assert.deepEqual(elicitations[0]!.elicitation, {
    action: 'accept',
    content: { q1: '1' },
  });
  assert.deepEqual(elicitations[1]!.elicitation, {
    action: 'accept',
    content: { q1_other: '使用已有应用', q2: ['cli'], q2_other: '以及文档' },
  });
});

test('Antigravity accepts execution-time supplements and keeps the turn open until the last prompt ends', { timeout: 20_000 }, async t => {
  const h = await createHarness(t, { autoAllow: true });
  const rt = await h.openRuntime();
  assert.equal(h.executor.descriptor!.capabilities.supplement, true);
  assert.equal(rt.capabilities.supplement, true);
  const ctx = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });

  const events: ExecutorEvent[] = [];
  let resolveAccepted!: (event: Extract<ExecutorEvent, { type: 'accepted' }>) => void;
  const accepted = new Promise<Extract<ExecutorEvent, { type: 'accepted' }>>(resolve => {
    resolveAccepted = resolve;
  });
  const sending = rt.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '执行中追加测试 [STEERABLE]',
    images: [],
    clientRequestId: 'req-steer-main',
    onEvent: ev => {
      events.push(ev);
      if (ev.type === 'accepted') resolveAccepted(ev);
    },
  });
  const acceptedEvent = await accepted;

  const firstReceipt = await rt.supplement!({
    contextRef: ctx,
    cwd: h.cwd,
    executionRef: acceptedEvent.executionRef,
    text: '追加一：改用方案 A',
    images: [],
    clientRequestId: 'req-steer-1',
  });
  assert.equal(firstReceipt.executionRef.id, acceptedEvent.executionRef.id);
  assert.ok(firstReceipt.inputItemId);

  const secondReceipt = await rt.supplement!({
    contextRef: ctx,
    cwd: h.cwd,
    executionRef: acceptedEvent.executionRef,
    text: '追加二：再补充验证',
    images: [],
    clientRequestId: 'req-steer-2',
  });
  assert.equal(secondReceipt.executionRef.id, acceptedEvent.executionRef.id);
  assert.ok(secondReceipt.inputItemId);

  // The native steering reply resolves the original session/prompt early with
  // end_turn; that must not complete the Buildr turn.
  assert.equal(events.some(ev => ev.type === 'completed'), false, 'steering must not complete the turn early');
  await sending;

  const completed = events.find((ev): ev is Extract<ExecutorEvent, { type: 'completed' }> => ev.type === 'completed');
  assert.equal(completed?.status, 'completed');
  const assistant = events
    .filter((ev): ev is Extract<ExecutorEvent, { type: 'item' }> => ev.type === 'item' && ev.item.kind === 'message' && ev.item.role === 'assistant')
    .at(-1);
  assert.match(assistant?.item.text ?? '', /已接收追加：追加一：改用方案 A \/ 追加二：再补充验证/);

  const history = await rt.readHistory({ contextRef: ctx, cwd: h.cwd });
  assert.ok(history.some(item => item.role === 'user' && item.id === firstReceipt.inputItemId && item.clientRequestId === 'req-steer-1'));
  assert.ok(history.some(item => item.role === 'user' && item.id === secondReceipt.inputItemId && item.clientRequestId === 'req-steer-2'));
  assert.equal((await h.readFixtureJsonl('fixture-steers.jsonl')).length, 2);
});

test('Antigravity refuses a supplement while a native question or approval is pending', { timeout: 15_000 }, async t => {
  const h = await createHarness(t, { autoAllow: false });
  const rt = await h.openRuntime();
  const ctx = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });

  let acceptedEvent: Extract<ExecutorEvent, { type: 'accepted' }> | undefined;
  let refusal: Promise<void> | undefined;
  await rt.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '执行中追加审批拒绝测试',
    images: [],
    clientRequestId: 'req-steer-pending',
    onEvent: ev => {
      if (ev.type === 'accepted') acceptedEvent = ev;
      if (ev.type === 'request' && ev.request.kind === 'approval' && !refusal) {
        refusal = (async () => {
          assert.ok(acceptedEvent);
          await assert.rejects(
            () => rt.supplement!({
              contextRef: ctx,
              cwd: h.cwd,
              executionRef: acceptedEvent!.executionRef,
              text: '审批未处理时追加',
              images: [],
              clientRequestId: 'req-steer-refused',
            }),
            (error: unknown) => error instanceof ExecutorInputRejected && /问题或授权/.test(error.message),
          );
          await rt.reply({
            contextRef: ctx,
            executionRef: acceptedEvent!.executionRef,
            requestId: ev.request.id,
            answer: 'allow_once',
          });
        })();
      }
    },
  });
  await refusal;
  assert.equal((await h.readFixtureJsonl('fixture-steers.jsonl')).length, 0, 'refused supplement must not reach the native prompt');
});

test('Antigravity keeps the original prompt owner when the native steer is refused', { timeout: 15_000 }, async t => {
  const h = await createHarness(t, { scenario: 'steer-rejected', autoAllow: true });
  const rt = await h.openRuntime();
  const ctx = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });

  const events: ExecutorEvent[] = [];
  let acceptedEvent: Extract<ExecutorEvent, { type: 'accepted' }> | undefined;
  const sending = rt.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '原生拒绝追加测试 [STEERABLE]',
    images: [],
    clientRequestId: 'req-steer-refusal-main',
    onEvent: ev => {
      events.push(ev);
      if (ev.type === 'accepted') acceptedEvent = ev;
    },
  });
  while (!acceptedEvent) await new Promise(resolve => setTimeout(resolve, 10));

  await assert.rejects(
    () => rt.supplement!({
      contextRef: ctx,
      cwd: h.cwd,
      executionRef: acceptedEvent!.executionRef,
      text: '会被原生拒绝的追加',
      images: [],
      clientRequestId: 'req-steer-refused-native',
    }),
    (error: unknown) => error instanceof ExecutorInputRejected && /拒绝了这条追加/.test(error.message),
  );
  await sending;

  const completed = events.find((ev): ev is Extract<ExecutorEvent, { type: 'completed' }> => ev.type === 'completed');
  assert.equal(completed?.status, 'completed', 'refused steering must not break the original turn');
  assert.equal((await h.readFixtureJsonl('fixture-steers.jsonl')).length, 0);
});

test('Antigravity stop after a supplement settles the steered turn without reporting completion', { timeout: 15_000 }, async t => {
  const h = await createHarness(t, { autoAllow: true });
  const rt = await h.openRuntime();
  const ctx = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });

  const events: ExecutorEvent[] = [];
  let acceptedEvent: Extract<ExecutorEvent, { type: 'accepted' }> | undefined;
  let resolveToolStarted!: () => void;
  const toolStarted = new Promise<void>(resolve => {
    resolveToolStarted = resolve;
  });
  const sending = rt.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '长命令中追加后停止 [LONG_COMMAND]',
    images: [],
    clientRequestId: 'req-steer-stop',
    onEvent: ev => {
      events.push(ev);
      if (ev.type === 'accepted') acceptedEvent = ev;
      if (ev.type === 'item' && ev.item.kind === 'tool' && ev.item.status === 'running') resolveToolStarted();
    },
  });
  await toolStarted;
  assert.ok(acceptedEvent);

  await rt.supplement!({
    contextRef: ctx,
    cwd: h.cwd,
    executionRef: acceptedEvent!.executionRef,
    text: '追加：准备停止',
    images: [],
    clientRequestId: 'req-steer-stop-input',
  });
  const stopped = await rt.stop({ contextRef: ctx, executionRef: acceptedEvent!.executionRef });
  await sending;

  assert.equal(stopped.status, 'stopped');
  assert.equal(events.some(ev => ev.type === 'completed' && ev.status === 'completed'), false);
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

test('antigravity stop clears backgroundWork release proof and cold prepareRelease stays symmetric with canRelease', { timeout: 15_000 }, async t => {
  const h = await createHarness(t, { scenario: 'continuation-fails', autoAllow: true });
  const rt = await h.openRuntime();
  const ctx = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });

  await rt.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '触发后台命令后立即停止',
    images: [],
    clientRequestId: 'bg-stop-proof',
    onEvent: () => {},
  });
  const active = await rt.observe({ contextRef: ctx });
  assert.equal(active.backgroundWork, true);
  assert.equal(active.executionRef?.data?.backgroundWork, true);

  const stopObs = await rt.stop({ contextRef: ctx, executionRef: active.executionRef! });
  assert.equal(stopObs.status, 'stopped');
  assert.equal(stopObs.executionRef?.data?.backgroundWork, false, 'confirmed stop must clear backgroundWork in returned executionRef');
  await rt.close();

  if (process.platform !== 'win32') {
    assert.equal(
      await h.executor.readReleasedControl!({
        bindingIdentity: rt.bindingIdentity,
        contextRef: ctx,
        executionRef: stopObs.executionRef!,
        cwd: h.cwd,
      }),
      true,
      'cold readReleasedControl must accept stopped executionRef once backgroundWork is cleared',
    );
  }

  // Reopen cold runtime and open a reader handle via resumeContext:
  // stale backgroundWork=true must return false from prepareRelease WITHOUT closing the resumed handle,
  // while cleared stopObs.executionRef must return true from both prepareRelease and canRelease.
  await h.setControl({ scenario: '', autoAllow: true });
  const rtCold = await h.openRuntime();
  await rtCold.resumeContext({ contextRef: ctx, cwd: h.cwd, permissionMode: 'default' });

  const staleBgRef = {
    ...stopObs.executionRef!,
    data: { ...stopObs.executionRef!.data, backgroundWork: true },
  };
  assert.equal(await rtCold.prepareRelease!({ contextRef: ctx, executionRef: staleBgRef }), false);
  assert.equal(await rtCold.canRelease!({ contextRef: ctx, executionRef: staleBgRef }), false);

  // Confirm the resumed conversation handle was not prematurely closed by prepareRelease failing/returning.
  const followUpEvents: ExecutorEvent[] = [];
  await rtCold.send({
    contextRef: ctx,
    cwd: h.cwd,
    text: '冷态预检后继续发送',
    images: [],
    clientRequestId: 'cold-after-prepare',
    onEvent: ev => followUpEvents.push(ev),
  });
  assert.equal(followUpEvents.some(ev => ev.type === 'completed' && ev.status === 'completed'), true);
  const followUpAccepted = followUpEvents.find((ev): ev is Extract<ExecutorEvent, { type: 'accepted' }> => ev.type === 'accepted')!;

  if (process.platform !== 'win32') {
    assert.equal(await rtCold.prepareRelease!({ contextRef: ctx, executionRef: stopObs.executionRef! }), true);
    assert.equal(await rtCold.prepareRelease!({ contextRef: ctx, executionRef: followUpAccepted.executionRef }), true);
    assert.equal(await rtCold.canRelease!({ contextRef: ctx, executionRef: followUpAccepted.executionRef }), true);
    assert.equal(await rtCold.canReclaimStorage!(), false, 'prepareRelease must not prematurely reclaim runtime storage before close');
  }

  await rtCold.close();
  if (process.platform !== 'win32') {
    assert.equal(await rtCold.canRelease!({ contextRef: ctx, executionRef: stopObs.executionRef! }), true);
    assert.equal(await rtCold.canRelease!({ contextRef: ctx, executionRef: followUpAccepted.executionRef }), true);
  }
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

for (const withImage of [false, true]) {
  test(`Antigravity executes a background supplement without replacing its command (image=${withImage})`, { timeout: 10_000 }, async t => {
    const h = await createHarness(t, { scenario: 'late-command-result', autoAllow: true, backgroundExitDelay: 900 });
    const rt = await h.openRuntime();
    const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
    const events: ExecutorEvent[] = [];
    const finished = Promise.withResolvers<void>();
    await rt.send({ contextRef, cwd: h.cwd, text: '后台原任务', images: [], clientRequestId: 'bg-original',
      onEvent: event => { events.push(event); if (event.type === 'completed') finished.resolve(); } });
    const accepted = events.find(event => event.type === 'accepted');
    assert.ok(accepted);
    const input = { contextRef, executionRef: accepted.executionRef };
    const before = await rt.observe(input);
    assert.equal(before.backgroundWork, true);
    const command = before.tools.find(tool => tool.status === 'running');
    assert.ok(command);
    await h.setControl({ scenario: 'background-supplement' });
    const image = path.join(h.cwd, 'supplement.png');
    if (withImage) await writeFile(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=', 'base64'));
    const receipt = await rt.supplement!({ ...input, cwd: h.cwd, text: '请先报告进度',
      images: withImage ? [{ id: 'bg-supplement-image', path: image, mimeType: 'image/png' }] : [], clientRequestId: 'bg-supplement' });
    assert.equal(receipt.executionRef.id, accepted.executionRef.id);
    await finished.promise;
    const after = await rt.observe(input);
    assert.equal(after.status, 'idle');
    assert.equal(after.tools.find(tool => tool.id === command.id)?.status, 'completed');
    assert.ok(events.some(event => event.type === 'item' && event.item.role === 'assistant'
      && event.item.text.includes(`后台追加已执行：请先报告进度（图片 ${withImage ? 1 : 0}）`)));
    const prompts = await h.readFixtureJsonl('fixture-prompts.jsonl');
    assert.equal(prompts.filter(row => row.text === '请先报告进度').length, 1);
    assert.ok(prompts.every(row => row.sessionId === contextRef.id));
    assert.equal(prompts.filter(row => row.text.includes('[[buildr:background-continuation]]')).length, 1);
    assert.equal((await h.readFixtureJsonl('fixture-cancels.jsonl')).length, 0);
    const history = await rt.readHistory({ contextRef, cwd: h.cwd });
    assert.ok(history.some(item => item.clientRequestId === 'bg-supplement' && item.id === receipt.inputItemId));
  });
}

test('Antigravity restores background observation after a definite background supplement refusal', { timeout: 10_000 }, async t => {
  const h = await createHarness(t, { scenario: 'late-command-result', autoAllow: true, backgroundExitDelay: 900 });
  const rt = await h.openRuntime();
  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const events: ExecutorEvent[] = [];
  await rt.send({ contextRef, cwd: h.cwd, text: '后台任务', images: [], clientRequestId: 'bg-refusal-original', onEvent: e => events.push(e) });
  const accepted = events.find(e => e.type === 'accepted'); assert.ok(accepted);
  const input = { contextRef, executionRef: accepted.executionRef };
  await h.setControl({ scenario: 'background-supplement-refused' });
  await assert.rejects(() => rt.supplement!({ ...input, cwd: h.cwd, text: '原生拒绝', images: [], clientRequestId: 'bg-refused' }), ExecutorInputRejected);
  assert.equal((await rt.observe(input)).backgroundWork, true);
  await h.setControl({ scenario: 'background-supplement' });
  const deadline = Date.now() + 4000;
  while ((await rt.observe(input)).status !== 'idle' && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
  assert.equal((await rt.observe(input)).status, 'idle');
  assert.equal((await h.readFixtureJsonl('fixture-prompts.jsonl')).filter(row => row.text === '原生拒绝').length, 1);
});

test('Antigravity serializes a background exit with two supplements and stops the same execution', { timeout: 10_000 }, async t => {
  const h = await createHarness(t, { scenario: 'late-command-result', autoAllow: true, backgroundExitDelay: 350 });
  const rt = await h.openRuntime();
  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const events: ExecutorEvent[] = [];
  await rt.send({ contextRef, cwd: h.cwd, text: '后台任务', images: [], clientRequestId: 'bg-stop-original', onEvent: e => events.push(e) });
  const accepted = events.find(e => e.type === 'accepted'); assert.ok(accepted);
  const input = { contextRef, executionRef: accepted.executionRef };
  await h.setControl({ scenario: 'background-supplement', supplementDelay: 2500 });
  const first = await rt.supplement!({ ...input, cwd: h.cwd, text: '追加一', images: [], clientRequestId: 'bg-stop-first' });
  const second = await rt.supplement!({ ...input, cwd: h.cwd, text: '追加二', images: [], clientRequestId: 'bg-stop-second' });
  assert.equal(first.executionRef.id, second.executionRef.id);
  assert.equal(events.some(e => e.type === 'completed'), false);
  const stopped = await rt.stop(input);
  assert.equal(stopped.status, 'stopped');
  const prompts = await h.readFixtureJsonl('fixture-prompts.jsonl');
  assert.equal(prompts.filter(row => row.text.includes('[[buildr:background-continuation]]')).length, 0);
  assert.equal(prompts.filter(row => row.text === '追加一').length, 1);
  assert.equal(prompts.filter(row => row.text === '追加二').length, 1);
  assert.equal(prompts.filter(row => row.text === '后台任务').length, 1);
});

test('Antigravity handles a background command exit during the new prompt without automatic duplicate prompting', { timeout: 10_000 }, async t => {
  const h = await createHarness(t, { scenario: 'late-command-result', autoAllow: true, backgroundExitDelay: 300 });
  const rt = await h.openRuntime();
  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const events: ExecutorEvent[] = [];
  const finished = Promise.withResolvers<void>();
  await rt.send({ contextRef, cwd: h.cwd, text: '后台任务', images: [], clientRequestId: 'bg-race-original',
    onEvent: e => { events.push(e); if (e.type === 'completed') finished.resolve(); } });
  const accepted = events.find(e => e.type === 'accepted'); assert.ok(accepted);
  const input = { contextRef, executionRef: accepted.executionRef };
  const command = (await rt.observe(input)).tools.find(tool => tool.status === 'running'); assert.ok(command);
  await h.setControl({ scenario: 'background-supplement', supplementDelay: 600 });
  await rt.supplement!({ ...input, cwd: h.cwd, text: '处理追加', images: [], clientRequestId: 'bg-race-supplement' });
  await finished.promise;
  assert.equal((await rt.observe(input)).tools.find(tool => tool.id === command.id)?.status, 'completed');
  const prompts = await h.readFixtureJsonl('fixture-prompts.jsonl');
  assert.equal(prompts.length, 2);
  assert.equal(prompts.filter(row => row.text === '处理追加').length, 1);
});
