import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import type { ExecutorEvent } from '../../../src/contracts.ts';
import { ExecutorInputRejected, ExecutorObservationLost } from '../../../src/contracts.ts';
import { BACKGROUND_CONTINUATION_LIMIT_DIAGNOSTIC } from '../../../src/domain/agent-state.ts';
import { antigravitySessionRecordPath, readAntigravityTool } from '../../../src/executors/antigravity/content.ts';
import { MAX_BACKGROUND_CONTINUATIONS, createAntigravityExecutor } from '../../../src/executors/antigravity/index.ts';
import { ownedProcessGroupIdle } from '../../../src/executors/native-process.ts';
import { createHarness } from '../../support/antigravity-harness.ts';

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

test('Antigravity default background continuation limit is 20 and reaching the limit closes idle process for physical release', { timeout: 15_000 }, async t => {
  assert.equal(MAX_BACKGROUND_CONTINUATIONS, 20);
  const h = await createHarness(t, {
    scenario: 'late-command-result',
    autoAllow: true,
    backgroundContinuationRepeats: 5,
    backgroundExitDelay: 40,
  });
  const rt = await createAntigravityExecutor({ maxBackgroundContinuations: 2 }).open({
    connectionId: 'antigravity',
    configRoot: h.configRoot,
    executable: h.executable,
    environment: h.environment,
  });
  t.after(() => rt.close());

  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const events: ExecutorEvent[] = [];
  const limitReached = Promise.withResolvers<void>();
  await rt.send({
    contextRef,
    cwd: h.cwd,
    text: '触发后台续行上限暂停',
    images: [],
    clientRequestId: 'bg-limit-pause',
    onEvent: event => {
      events.push(event);
      if (event.type === 'observation' && event.observation.diagnostic === BACKGROUND_CONTINUATION_LIMIT_DIAGNOSTIC) {
        limitReached.resolve();
      } else if (event.type === 'completed') {
        limitReached.reject(new Error(`Unexpected completion event: ${event.status}`));
      }
    },
  });
  await limitReached.promise;

  const finalObs = await rt.observe({ contextRef });
  assert.equal(finalObs.status, 'unknown');
  assert.equal(finalObs.backgroundWork, false);
  assert.equal(finalObs.executionRef?.data?.backgroundWork, false);
  assert.equal(finalObs.diagnostic, BACKGROUND_CONTINUATION_LIMIT_DIAGNOSTIC);
  assert.ok(finalObs.tools.length >= 3 && finalObs.tools.every(tool => tool.status === 'completed'));
  assert.equal(events.some(event => event.type === 'completed'), false);

  const prompts = await h.readFixtureJsonl('fixture-prompts.jsonl');
  assert.equal(prompts.filter(row => row.text.includes('[[buildr:background-continuation]]')).length, 2);

  assert.equal(await rt.prepareRelease!({ contextRef, executionRef: finalObs.executionRef! }), true);
  assert.equal(await rt.canRelease!({ contextRef, executionRef: finalObs.executionRef! }), true);
  if (process.platform !== 'win32') {
    assert.equal(await ownedProcessGroupIdle(Number(finalObs.executionRef!.data!.resourceGroup)), true);
  }
});

test('Antigravity refuses to reset continuation budget on rejected supplement', { timeout: 15_000 }, async t => {
  const h = await createHarness(t, {
    scenario: 'late-command-result',
    autoAllow: true,
    backgroundContinuationRepeats: 5,
    backgroundExitDelay: 40,
    backgroundContinuationExitDelay: 1200,
  });
  const rt = await createAntigravityExecutor({ maxBackgroundContinuations: 1 }).open({
    connectionId: 'antigravity',
    configRoot: h.configRoot,
    executable: h.executable,
    environment: h.environment,
  });
  t.after(() => rt.close());

  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const events: ExecutorEvent[] = [];
  const acceptedReady = Promise.withResolvers<ExecutorEvent>();
  const limitReached = Promise.withResolvers<void>();
  const sendPromise = rt.send({
    contextRef,
    cwd: h.cwd,
    text: '测试被拒追加不重置预算',
    images: [],
    clientRequestId: 'bg-refuse-no-reset',
    onEvent: event => {
      events.push(event);
      if (event.type === 'accepted') acceptedReady.resolve(event);
      if (event.type === 'observation' && event.observation.diagnostic === BACKGROUND_CONTINUATION_LIMIT_DIAGNOSTIC) {
        limitReached.resolve();
      } else if (event.type === 'completed') {
        limitReached.reject(new Error(`Unexpected completion event: ${event.status}`));
      }
    },
  });

  const accepted = await acceptedReady.promise;
  assert.equal(accepted.type, 'accepted');
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const prompts = await h.readFixtureJsonl('fixture-prompts.jsonl');
    if (prompts.filter(row => row.text.includes('[[buildr:background-continuation]]')).length === 1) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal((await h.readFixtureJsonl('fixture-prompts.jsonl')).filter(row => row.text.includes('[[buildr:background-continuation]]')).length, 1);

  await h.setControl({ scenario: 'background-supplement-refused' });
  await assert.rejects(
    () => rt.supplement!({
      contextRef,
      executionRef: accepted.executionRef,
      cwd: h.cwd,
      text: '被拒绝的追加',
      images: [],
      clientRequestId: 'bg-refused-supplement',
    }),
    ExecutorInputRejected,
  );
  await h.setControl({ scenario: 'late-command-result', backgroundContinuationExitDelay: 40 });
  await Promise.all([sendPromise, limitReached.promise]);

  const finalObs = await rt.observe({ contextRef });
  assert.equal(finalObs.status, 'unknown');
  assert.equal(finalObs.diagnostic, BACKGROUND_CONTINUATION_LIMIT_DIAGNOSTIC);
  const prompts = await h.readFixtureJsonl('fixture-prompts.jsonl');
  assert.equal(prompts.filter(row => row.text.includes('[[buildr:background-continuation]]')).length, 1);
});

test('Antigravity resets continuation budget on admitted supplement while keeping monotonic continuation ids', { timeout: 20_000 }, async t => {
  const h = await createHarness(t, {
    scenario: 'late-command-result',
    autoAllow: true,
    backgroundContinuationRepeats: 10,
    backgroundExitDelay: 40,
    backgroundContinuationExitDelay: 40,
  });
  const rt = await createAntigravityExecutor({ maxBackgroundContinuations: 2 }).open({
    connectionId: 'antigravity',
    configRoot: h.configRoot,
    executable: h.executable,
    environment: h.environment,
  });
  t.after(() => rt.close());

  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'default' });
  const acceptedReady = Promise.withResolvers<ExecutorEvent>();
  const limitReached = Promise.withResolvers<void>();
  const sendPromise = rt.send({
    contextRef,
    cwd: h.cwd,
    text: '测试已受理追加重置续行预算',
    images: [],
    clientRequestId: 'bg-admit-reset-budget',
    onEvent: event => {
      if (event.type === 'accepted') acceptedReady.resolve(event);
      if (event.type === 'observation' && event.observation.diagnostic === BACKGROUND_CONTINUATION_LIMIT_DIAGNOSTIC) {
        limitReached.resolve();
      } else if (event.type === 'completed') {
        limitReached.reject(new Error(`Unexpected completion event: ${event.status}`));
      }
    },
  });

  const accepted = await acceptedReady.promise;
  assert.equal(accepted.type, 'accepted');

  const deadline1 = Date.now() + 8000;
  while (Date.now() < deadline1) {
    const prompts = await h.readFixtureJsonl('fixture-prompts.jsonl');
    if (prompts.filter(row => row.text.includes('[[buildr:background-continuation]]')).length >= 1) break;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  await h.setControl({ backgroundContinuationExitDelay: 1200 });

  const deadline2 = Date.now() + 8000;
  while (Date.now() < deadline2) {
    const prompts = await h.readFixtureJsonl('fixture-prompts.jsonl');
    if (prompts.filter(row => row.text.includes('[[buildr:background-continuation]]')).length >= 2) break;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  assert.equal((await rt.observe({ contextRef })).backgroundWork, true);

  await h.setControl({ scenario: 'background-supplement', supplementDelay: 20 });
  const receipt = await rt.supplement!({
    contextRef,
    executionRef: accepted.executionRef,
    cwd: h.cwd,
    text: '重置当前轮次续行预算',
    images: [],
    clientRequestId: 'bg-admit-reset-supplement',
  });
  assert.equal(receipt.executionRef.id, accepted.executionRef.id);

  await h.setControl({ scenario: 'late-command-result', backgroundContinuationExitDelay: 40 });
  await Promise.all([sendPromise, limitReached.promise]);

  const finalObs = await rt.observe({ contextRef });
  assert.equal(finalObs.status, 'unknown');
  assert.equal(finalObs.diagnostic, BACKGROUND_CONTINUATION_LIMIT_DIAGNOSTIC);

  const prompts = await h.readFixtureJsonl('fixture-prompts.jsonl');
  assert.equal(prompts.filter(row => row.text.includes('[[buildr:background-continuation]]')).length, 4);

  const sessionRows = (await readFile(antigravitySessionRecordPath(h.configRoot, contextRef.id), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as { type?: string; id?: string });
  const continuationIds = sessionRows.filter(row => row.type === 'continuation').map(row => row.id);
  assert.deepEqual(continuationIds, [
    `continuation:${accepted.executionRef.id}:1`,
    `continuation:${accepted.executionRef.id}:2`,
    `continuation:${accepted.executionRef.id}:3`,
    `continuation:${accepted.executionRef.id}:4`,
  ]);
});

test('Antigravity keeps Run schedule active on end_turn and continues on ACP completion or supplement', { timeout: 15_000 }, async t => {
  const h = await createHarness(t, { scenario: 'schedule-acp-complete', autoAllow: true, backgroundExitDelay: 400 });
  const rt = await h.openRuntime();
  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'full-access' });
  const events: ExecutorEvent[] = [];
  const finished = Promise.withResolvers<void>();
  await rt.send({
    contextRef, cwd: h.cwd, text: 'wait timer acp', images: [], clientRequestId: 'schedule-acp',
    onEvent: event => { events.push(event); if (event.type === 'completed') finished.resolve(); },
  });
  const accepted = events.find(event => event.type === 'accepted');
  assert.ok(accepted);
  const waitingObs = await rt.observe({ contextRef, executionRef: accepted.executionRef });
  assert.equal(waitingObs.status, 'running');
  assert.equal(waitingObs.backgroundWork, true);
  assert.equal(waitingObs.tools.some(tool => tool.label === 'Run schedule' && tool.status === 'running'), true);
  assert.equal(events.some(event => event.type === 'observation' && event.observation.status === 'unknown'), false);
  await finished.promise;
  const endedObs = await rt.observe({ contextRef, executionRef: accepted.executionRef });
  assert.equal(endedObs.status, 'idle');
  assert.equal(endedObs.backgroundWork, false);
});

test('Antigravity supports schedule supplement, transcript Timer wakeup and full-access unknown resume', { timeout: 15_000 }, async t => {
  const h = await createHarness(t, { scenario: 'schedule-acp-complete', autoAllow: true, backgroundExitDelay: 900 });
  const rt = await h.openRuntime();
  const ctxSup = await rt.createContext({ cwd: h.cwd, permissionMode: 'full-access' });
  const evSup: ExecutorEvent[] = [];
  const doneSup = Promise.withResolvers<void>();
  await rt.send({
    contextRef: ctxSup, cwd: h.cwd, permissionMode: 'full-access', text: 'wait supplement', images: [], clientRequestId: 'schedule-sup-1',
    onEvent: e => { evSup.push(e); if (e.type === 'completed') doneSup.resolve(); },
  });
  const acc = evSup.find(e => e.type === 'accepted')!;
  await h.setControl({ scenario: 'background-supplement', supplementDelay: 40 });
  const rec = await rt.supplement!({
    contextRef: ctxSup, executionRef: acc.executionRef, cwd: h.cwd, text: 'already open', images: [], clientRequestId: 'schedule-sup-2',
  });
  assert.equal(rec.executionRef.id, acc.executionRef.id);
  await doneSup.promise;

  await h.setControl({ scenario: 'schedule-transcript-trigger', backgroundExitDelay: 300 });
  const ctxTr = await rt.createContext({ cwd: h.cwd, permissionMode: 'full-access' });
  const doneTr = Promise.withResolvers<void>();
  await rt.send({
    contextRef: ctxTr, cwd: h.cwd, permissionMode: 'full-access', text: 'wait transcript', images: [], clientRequestId: 'schedule-tr',
    onEvent: e => { if (e.type === 'completed') doneTr.resolve(); },
  });
  assert.equal((await rt.observe({ contextRef: ctxTr })).backgroundWork, true);
  await assert.rejects(rt.resumeContext({ contextRef: ctxTr, cwd: h.cwd, permissionMode: 'full-access' }), { code: 'agent_execution_active' });
  await doneTr.promise;
  const prompts = await h.readFixtureJsonl('fixture-prompts.jsonl');
  assert.ok(prompts.some(row => row.text.includes('定时等待已到期')));

  await h.setControl({ scenario: 'unsettled-read-tool' });
  const ctxRead = await rt.createContext({ cwd: h.cwd, permissionMode: 'full-access' });
  await rt.send({ contextRef: ctxRead, cwd: h.cwd, permissionMode: 'full-access', text: 'read unsettled', images: [], clientRequestId: 'read-unsettled', onEvent: () => {} });
  const obs = await rt.observe({ contextRef: ctxRead });
  assert.equal(obs.status, 'unknown');
  const beforeFullAccessLaunches = (await h.readFixtureJsonl('fixture-launches.jsonl'))
    .filter(row => row.subcommand === 'acp' && row.skipPermissions === true).length;
  const beforeResumes = (await h.readFixtureJsonl('fixture-sessions.jsonl'))
    .filter(row => row.sessionId === ctxRead.id && row.method === 'session/resume').length;
  await rt.resumeContext({ contextRef: ctxRead, cwd: h.cwd, permissionMode: 'full-access' });
  const afterFullAccessLaunches = (await h.readFixtureJsonl('fixture-launches.jsonl'))
    .filter(row => row.subcommand === 'acp' && row.skipPermissions === true).length;
  const afterResumes = (await h.readFixtureJsonl('fixture-sessions.jsonl'))
    .filter(row => row.sessionId === ctxRead.id && row.method === 'session/resume').length;
  assert.equal(afterFullAccessLaunches, beforeFullAccessLaunches);
  assert.equal(afterResumes, beforeResumes);
});

test('Antigravity silence watchdog wakes turn for silent non-daemon command and settles when canceled', { timeout: 15_000 }, async t => {
  const h = await createHarness(t, { scenario: 'background-silent-command', cancelOnSilence: true, autoAllow: true });
  const rt = await createAntigravityExecutor({ backgroundCommandSilenceMs: 120, backgroundPollIntervalMs: 30 }).open({
    connectionId: 'antigravity',
    configRoot: h.configRoot,
    executable: h.executable,
    environment: h.environment,
  });
  t.after(() => rt.close());

  const contextRef = await rt.createContext({ cwd: h.cwd, permissionMode: 'full-access' });
  const finished = Promise.withResolvers<void>();
  const events: ExecutorEvent[] = [];
  await rt.send({
    contextRef,
    cwd: h.cwd,
    permissionMode: 'full-access',
    text: 'run interactive command',
    images: [],
    clientRequestId: 'silence-watchdog-1',
    onEvent: event => {
      events.push(event);
      if (event.type === 'completed') finished.resolve();
    },
  });

  await finished.promise;
  const prompts = await h.readFixtureJsonl('fixture-prompts.jsonl');
  const silencePrompt = prompts.find(row => row.text.includes('长时间无新输出'));
  assert.ok(silencePrompt, 'expected silence watchdog continuation prompt');
  assert.ok(silencePrompt.text.includes('Ok to proceed? (y)'), 'expected task log tail in silence prompt');
  const exitPrompt = prompts.find(row => row.text.includes('退出码：130'));
  assert.ok(exitPrompt, 'expected canceled task result to settle with code 130');
  const obs = await rt.observe({ contextRef });
  assert.equal(obs.status, 'idle');
  assert.equal(obs.tools.some(tool => tool.status === 'running'), false);
});

test('Antigravity silence watchdog ignores IsDaemon commands and resets when task log actively grows', { timeout: 15_000 }, async t => {
  const h = await createHarness(t, { scenario: 'background-silent-command', isDaemon: true, autoAllow: true });
  const rt = await createAntigravityExecutor({ backgroundCommandSilenceMs: 200, backgroundPollIntervalMs: 30 }).open({
    connectionId: 'antigravity',
    configRoot: h.configRoot,
    executable: h.executable,
    environment: h.environment,
  });
  t.after(() => rt.close());

  const daemonCtx = await rt.createContext({ cwd: h.cwd, permissionMode: 'full-access' });
  await rt.send({
    contextRef: daemonCtx,
    cwd: h.cwd,
    permissionMode: 'full-access',
    text: 'start daemon server',
    images: [],
    clientRequestId: 'silence-daemon-1',
    onEvent: () => {},
  });
  await new Promise(resolve => setTimeout(resolve, 320));
  const daemonPrompts = (await h.readFixtureJsonl('fixture-prompts.jsonl')).filter(row => row.sessionId === daemonCtx.id);
  assert.equal(daemonPrompts.length, 1, 'daemon command must never trigger silence nudge');
  const daemonObs = await rt.observe({ contextRef: daemonCtx });
  await rt.stop({ contextRef: daemonCtx, executionRef: daemonObs.executionRef! });

  await h.setControl({ scenario: 'background-silent-command', isDaemon: false, cancelOnSilence: true });
  const activeCtx = await rt.createContext({ cwd: h.cwd, permissionMode: 'full-access' });
  const finished = Promise.withResolvers<void>();
  await rt.send({
    contextRef: activeCtx,
    cwd: h.cwd,
    permissionMode: 'full-access',
    text: 'run active noisy command',
    images: [],
    clientRequestId: 'silence-active-1',
    onEvent: event => { if (event.type === 'completed') finished.resolve(); },
  });
  const logFile = path.join(h.configRoot, 'home', '.gemini', 'antigravity-cli', 'brain', activeCtx.id, '.system_generated', 'tasks', 'task-201.log');
  for (let tick = 0; tick < 4; tick += 1) {
    await new Promise(resolve => setTimeout(resolve, 60));
    await writeFile(logFile, `progress line ${tick}\n`, { flag: 'a' });
  }
  const duringGrowth = (await h.readFixtureJsonl('fixture-prompts.jsonl')).filter(row => row.sessionId === activeCtx.id);
  assert.equal(duringGrowth.length, 1, 'active log output must reset silence tracking without nudging');
  await finished.promise;
  const afterSilence = (await h.readFixtureJsonl('fixture-prompts.jsonl')).filter(row => row.sessionId === activeCtx.id);
  assert.ok(afterSilence.some(row => row.text.includes('progress line 3')), 'after activity stops, silence nudge reports latest log tail');
});
