import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import type { ExecutorEvent, ExecutorItem, ExecutorRequest } from '../../../src/contracts.ts';
import { ExecutorInputRejected } from '../../../src/contracts.ts';
import { AgentServiceError } from '../../../src/domain/agent-state.ts';
import { appendAntigravitySessionRow, readAntigravityTool } from '../../../src/executors/antigravity/content.ts';
import { createHarness } from '../../support/antigravity-harness.ts';

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

test('Antigravity readHistory truncates oversized durable tool output and input previews while preserving full on-demand nativeContent', async t => {
  const h = await createHarness(t, { autoAllow: true });
  const rt = await h.openRuntime();
  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const hugeInput = JSON.stringify({ path: 'src/Big.java', content: 'I'.repeat(12_000) });
  const hugeOutput = 'O'.repeat(1_600 * 1024);

  appendAntigravitySessionRow(h.configRoot, contextRef.id, {
    type: 'tool_call',
    toolCallId: 'call-huge-1',
    cwd: h.cwd,
    name: 'file-change',
    fullInput: hugeInput,
    status: 'running',
  });
  appendAntigravitySessionRow(h.configRoot, contextRef.id, {
    type: 'tool_result',
    toolCallId: 'call-huge-1',
    cwd: h.cwd,
    name: 'file-change',
    fullInput: hugeInput,
    status: 'completed',
    output: hugeOutput,
  });

  const history = await rt.readHistory({ contextRef, cwd: h.cwd });
  const toolItem = history.find(item => item.kind === 'tool' && item.id === 'call-huge-1');
  assert.ok(toolItem, 'expected oversized tool in readHistory');
  assert.equal(toolItem.nativeTool, true);
  assert.ok(Buffer.byteLength(toolItem.text, 'utf8') < 64 * 1024);
  assert.match(toolItem.text, /\[内容已截断/);
  assert.ok(toolItem.input && Buffer.byteLength(toolItem.input, 'utf8') < 8 * 1024);
  assert.match(toolItem.input, /\[内容已截断/);

  const fullDetail = readAntigravityTool(h.root, {
    version: 3,
    provider: 'antigravity',
    contextId: contextRef.id,
    nativeId: 'call-huge-1',
    text: [],
    entry: {
      id: 'entry-huge-1',
      sequence: 1,
      kind: 'tool',
      role: 'assistant',
      name: 'file-change',
      status: 'completed',
      text: '',
      createdAt: new Date().toISOString(),
    },
    session: {
      config: 'connections/antigravity',
      cwd: h.cwd,
    },
  });
  assert.ok(fullDetail);
  assert.equal(fullDetail.input, hugeInput);
  assert.equal(fullDetail.text, hugeOutput);
});
