import assert from 'node:assert/strict';
import test from 'node:test';
import { activityState } from '../../src/features/agent-conversations/conversation-activity.ts';
import { createConversationHistoryCache } from '../../src/features/agent-conversations/conversation-history-page.ts';
import {
  advanceWorkspaceSeenHold,
  applyConfirmedSeenActivity,
  executionStatsSignature,
  invalidateWorkspaceHistoryCache,
  pinHeldConversationRow,
  recordSeenActivity,
  shouldReleaseSeenHold,
} from '../../src/features/agent-conversations/conversation-seen-hold.ts';

const makeRow = (id, overrides = {}) => ({
  id,
  workspaceId: 'w1',
  cwd: '/tmp/w1',
  title: `对话-${id}`,
  hidden: false,
  revision: 'rev-1',
  updatedAt: '2026-11-18T02:00:00.000Z',
  participants: [],
  run: {
    id: `run-${id}`,
    participantId: 'p1',
    provider: 'codex',
    generation: 'g1',
    status: 'completed',
    tools: [],
  },
  retainedRuns: [],
  activity: {
    version: 4,
    seenThrough: 3,
    updatedAt: '2026-11-18T02:00:00.000Z',
    active: true,
    pendingDecisionCount: 0,
  },
  ...overrides,
});

test('已读快照在确认前保留待查看、确认后立即隐藏而不误判为状态待确认，有新消息时恢复待查看', () => {
  const row = makeRow('c1');
  assert.equal(activityState(applyConfirmedSeenActivity(row, {}, null)), 'unseen');

  // 停留在旧消息尚未触发 seen：activeConversation.activity 仍未读
  const readingOlder = {
    ...row,
    entries: [],
    requests: [],
  };
  assert.equal(activityState(applyConfirmedSeenActivity(row, {}, readingOlder)), 'unseen');

  // 确认看到最新消息：服务端返回 seenThrough=4 且 active=false
  let seenMap = recordSeenActivity({}, 'w1', 'c1', {
    version: 4,
    seenThrough: 4,
    updatedAt: '2026-11-18T02:00:01.000Z',
    active: false,
    pendingDecisionCount: 0,
  });
  const afterSeen = applyConfirmedSeenActivity(row, seenMap, {
    ...readingOlder,
    activity: seenMap['w1:c1'],
  });
  assert.equal(activityState(afterSeen), null);

  // 切走导致 activeConversation 置空或换人时，仍凭 seenMap 避免列表刷新前闪回待查看
  assert.equal(activityState(applyConfirmedSeenActivity(row, seenMap, null)), null);

  // 若服务端返回 active=true（例如另有历史未知执行），准确保留状态待确认而不是吞掉
  const seenWithUnknown = recordSeenActivity({}, 'w1', 'c2', {
    version: 4,
    seenThrough: 4,
    updatedAt: '2026-11-18T02:00:01.000Z',
    active: true,
    pendingDecisionCount: 0,
  });
  assert.equal(activityState(applyConfirmedSeenActivity(makeRow('c2'), seenWithUnknown, null)), 'unknown');

  // 后续出现更高 version=5 时，重新显示待查看
  const newerRow = makeRow('c1', {
    activity: {
      version: 5,
      seenThrough: 4,
      updatedAt: '2026-11-18T02:01:00.000Z',
      active: true,
      pendingDecisionCount: 0,
    },
  });
  assert.equal(activityState(applyConfirmedSeenActivity(newerRow, seenMap, null)), 'unseen');

  // 单调性：较旧的 seen 响应不得覆盖更新的版本
  const staleIgnored = recordSeenActivity(seenMap, 'w1', 'c1', {
    version: 3,
    seenThrough: 3,
    updatedAt: '2026-11-18T01:59:00.000Z',
    active: false,
    pendingDecisionCount: 0,
  });
  assert.equal(staleIgnored, seenMap);
});

test('并排点进待查看对话建立锁位冻结版本，停留零重刷，离开后立即释放并触发结算', () => {
  const unseen1 = makeRow('u1');
  const unseen2 = makeRow('u2');
  const read1 = makeRow('r1', {
    activity: { version: 2, seenThrough: 2, updatedAt: '2026-11-18T02:00:00.000Z', active: false, pendingDecisionCount: 0 },
  });
  const displayed = [unseen1, unseen2, read1];

  // 普通已读对话不建立锁位
  const onRead = advanceWorkspaceSeenHold({
    previous: null,
    activeViewingId: 'r1',
    workspaceId: 'w1',
    rawVersion: 'workspace:0',
    displayedRows: displayed,
    displayedVersion: 'workspace:0',
    activityRows: [unseen1, unseen2],
  });
  assert.equal(onRead.hold, null);
  assert.equal(onRead.effectiveVersion, 'workspace:0');

  // 点进待查看 u1，在 index=0 建立锁位
  const enter = advanceWorkspaceSeenHold({
    previous: null,
    activeViewingId: 'u1',
    workspaceId: 'w1',
    rawVersion: 'workspace:0',
    displayedRows: displayed,
    displayedVersion: 'workspace:0',
    activityRows: [unseen1, unseen2],
  });
  assert.ok(enter.hold);
  assert.equal(enter.hold.pinnedIndex, 0);
  assert.equal(enter.effectiveVersion, 'workspace:0');

  // u1 确认已读导致 rawVersion 推进到 workspace:1，且 u1 从 activityRows 移出，
  // 因为 u2（同空间其他对话）签名未变，保持 heldVersion='workspace:0' 不重刷列表
  const seenMap = recordSeenActivity({}, 'w1', 'u1', {
    version: 4,
    seenThrough: 4,
    updatedAt: '2026-11-18T02:00:01.000Z',
    active: false,
    pendingDecisionCount: 0,
  });
  const stayed = advanceWorkspaceSeenHold({
    previous: enter.hold,
    activeViewingId: 'u1',
    workspaceId: 'w1',
    rawVersion: 'workspace:1',
    displayedRows: displayed,
    displayedVersion: 'workspace:0',
    activityRows: [unseen2],
    seenActivities: seenMap,
  });
  assert.equal(stayed.hold, enter.hold);
  assert.equal(stayed.effectiveVersion, 'workspace:0');
  assert.equal(stayed.invalidateCache, false);

  // 直接从已读锁位 u1 切换到另一条待查看 u2：u1 即将结算退位，所以 u2 锁定到扣除 u1 后的 index=0
  const switchToU2 = advanceWorkspaceSeenHold({
    previous: stayed.hold,
    activeViewingId: 'u2',
    workspaceId: 'w1',
    rawVersion: 'workspace:1',
    displayedRows: displayed,
    displayedVersion: 'workspace:0',
    activityRows: [unseen2],
    seenActivities: seenMap,
  });
  assert.ok(switchToU2.hold);
  assert.equal(switchToU2.hold.conversationId, 'u2');
  assert.equal(switchToU2.hold.pinnedIndex, 0);
  assert.equal(switchToU2.effectiveVersion, 'workspace:1');

  // 离开当前对话（新建对话 / 收起或退出分屏）：清除锁位并用最新 rawVersion 刷新
  const left = advanceWorkspaceSeenHold({
    previous: switchToU2.hold,
    activeViewingId: null,
    workspaceId: 'w1',
    rawVersion: 'workspace:2',
    displayedRows: [unseen2, read1, unseen1],
    displayedVersion: 'workspace:1',
    activityRows: [],
    seenActivities: seenMap,
  });
  assert.equal(left.hold, null);
  assert.equal(left.effectiveVersion, 'workspace:2');
});

test('停留期间若直接发送、进入等待决策或同空间其他对话变化，正确释放或钉住原席位并在离开时失效缓存', () => {
  const u1 = makeRow('u1');
  const other = makeRow('other');
  const r1 = makeRow('r1', {
    activity: { version: 2, seenThrough: 2, updatedAt: '2026-11-18T02:00:00.000Z', active: false, pendingDecisionCount: 0 },
  });
  const seenMap = recordSeenActivity({}, 'w1', 'u1', {
    version: 4,
    seenThrough: 4,
    updatedAt: '2026-11-18T02:00:01.000Z',
    active: false,
    pendingDecisionCount: 0,
  });

  const enter = advanceWorkspaceSeenHold({
    previous: null,
    activeViewingId: 'u1',
    workspaceId: 'w1',
    rawVersion: 'workspace:0',
    displayedRows: [other, u1, r1],
    displayedVersion: 'workspace:0',
    activityRows: [other, u1],
  });
  assert.equal(enter.hold?.pinnedIndex, 1);

  // 同空间其他对话 other 进入执行中：允许列表按 rawVersion='workspace:1' 刷新以更新 other，
  // 同时 pinHeldConversationRow 保住 u1 的席位 1（哪怕 u1 掉出当前页也能插回并维持窗口长度）
  const otherRunning = makeRow('other', {
    run: { id: 'run-other', participantId: 'p1', provider: 'codex', generation: 'g1', status: 'running', tools: [] },
  });
  const bgChange = advanceWorkspaceSeenHold({
    previous: enter.hold,
    activeViewingId: 'u1',
    workspaceId: 'w1',
    rawVersion: 'workspace:1',
    displayedRows: [other, u1, r1],
    displayedVersion: 'workspace:0',
    activityRows: [otherRunning],
    seenActivities: seenMap,
  });
  assert.equal(bgChange.effectiveVersion, 'workspace:1');
  assert.equal(bgChange.hold?.refreshedDuringHold, true);

  const serverRefreshedWithU1 = [otherRunning, r1, u1];
  const pinnedInPage = pinHeldConversationRow(serverRefreshedWithU1, bgChange.hold);
  assert.equal(pinnedInPage.displaced, true);
  assert.deepEqual(pinnedInPage.rows.map(row => row.id), ['other', 'u1', 'r1']);

  const r2 = makeRow('r2', {
    activity: { version: 1, seenThrough: 1, updatedAt: '2026-11-18T01:58:00.000Z', active: false, pendingDecisionCount: 0 },
  });
  const pinnedDropped = pinHeldConversationRow([otherRunning, r1, r2], bgChange.hold);
  assert.equal(pinnedDropped.displaced, true);
  assert.deepEqual(pinnedDropped.rows.map(row => row.id), ['other', 'u1', 'r1']);

  // 停留期间在当前对话直接发起发送：立即解除锁位
  const sending = {
    ...u1,
    entries: [],
    requests: [],
    pendingSend: { id: 'ps-1', revision: 'p1', state: 'waiting', reason: '等待受理', createdAt: '2026-11-18T02:00:05.000Z', updatedAt: '2026-11-18T02:00:05.000Z' },
  };
  assert.equal(shouldReleaseSeenHold(applyConfirmedSeenActivity(u1, seenMap, sending)), true);
  const releasedOnSend = advanceWorkspaceSeenHold({
    previous: bgChange.hold,
    activeViewingId: 'u1',
    workspaceId: 'w1',
    rawVersion: 'workspace:2',
    displayedRows: [otherRunning, r1, u1],
    displayedVersion: 'workspace:1',
    activityRows: [otherRunning],
    seenActivities: seenMap,
    activeConversation: sending,
  });
  assert.equal(releasedOnSend.hold, null);
  assert.equal(releasedOnSend.invalidateCache, true);
  assert.equal(releasedOnSend.effectiveVersion, 'workspace:2');

  // 缓存失效只作用于目标工作空间
  const cache = createConversationHistoryCache();
  cache.pages.set(JSON.stringify(['w1', '', false, undefined, undefined, 5, null]), { page: { conversations: [] }, error: '', version: 'workspace:1' });
  cache.pages.set(JSON.stringify(['w2', '', false, undefined, undefined, 5, null]), { page: { conversations: [] }, error: '', version: 'workspace:1' });
  invalidateWorkspaceHistoryCache(cache, 'w1');
  assert.equal(cache.pages.get(JSON.stringify(['w1', '', false, undefined, undefined, 5, null])).version, -1);
  assert.equal(cache.pages.get(JSON.stringify(['w2', '', false, undefined, undefined, 5, null])).version, 'workspace:1');
});

test('顶部执行中模型统计签名仅随真实执行态变化，不受纯待查看已读确认影响', () => {
  const stats = { agents: [], models: [], executions: [], modelExecutions: [] };
  const unseen = makeRow('u1');
  const running = makeRow('run1', {
    run: { id: 'r-run', participantId: 'p1', provider: 'codex', generation: 'g1', model: 'gpt-6.1', status: 'running', tools: [] },
  });

  const beforeSeen = executionStatsSignature(stats, [running, unseen], undefined, 1);
  const afterSeen = executionStatsSignature(stats, [running], undefined, 2);
  assert.equal(beforeSeen, afterSeen);

  const afterNewExec = executionStatsSignature(
    { ...stats, modelExecutions: [{ accountId: 'a1', accountLabel: 'ChatGPT', model: 'gpt-6.1', count: 2 }] },
    [running, makeRow('run2', { run: { id: 'r-run2', participantId: 'p1', provider: 'codex', generation: 'g1', model: 'gpt-6.1', status: 'running', tools: [] } })],
    undefined,
    3,
  );
  assert.notEqual(afterNewExec, afterSeen);
  assert.equal(executionStatsSignature(undefined, [], undefined, 4), null);
});

test('同消息版本已读快照绝不覆盖新增的待决策或状态待确认，且支持实时叠加 activityRows 与清除已取消待发送', () => {
  // 1) 对话在 version=5 已看过最新消息（seenMap 记录 seenThrough=5, pendingDecisionCount=0, active=true），
  // 随后智能体不发新消息而是边运行边提问：列表行与当前对话均必须保持 waiting（待决策），不能被旧 seenMap 覆盖为 running。
  const seenAt5 = recordSeenActivity({}, 'w1', 'c-ask', {
    version: 5,
    seenThrough: 5,
    updatedAt: '2026-11-18T03:00:00.000Z',
    active: true,
    pendingDecisionCount: 0,
  });
  const runningRowWithAsk = makeRow('c-ask', {
    updatedAt: '2026-11-18T03:00:10.000Z',
    run: { id: 'run-ask', participantId: 'p1', provider: 'codex', generation: 'g1', status: 'running', tools: [] },
    activity: { version: 5, seenThrough: 5, updatedAt: '2026-11-18T03:00:10.000Z', active: true, pendingDecisionCount: 1 },
  });
  assert.equal(activityState(applyConfirmedSeenActivity(runningRowWithAsk, seenAt5, null)), 'waiting');

  // 即使列表分页里还停留在 seenThrough=4 的旧行，叠加 activityRows 或 seenMap 也不能把 pendingDecisionCount=1 冲掉。
  const staleAskRow = makeRow('c-ask', {
    updatedAt: '2026-11-18T03:00:05.000Z',
    run: { id: 'run-ask', participantId: 'p1', provider: 'codex', generation: 'g1', status: 'running', tools: [] },
    activity: { version: 5, seenThrough: 4, updatedAt: '2026-11-18T03:00:05.000Z', active: true, pendingDecisionCount: 1 },
  });
  assert.equal(activityState(applyConfirmedSeenActivity(staleAskRow, seenAt5, null)), 'waiting');
  const staleListBeforeAsk = makeRow('c-ask', {
    updatedAt: '2026-11-18T02:59:59.000Z',
    run: { id: 'run-ask', participantId: 'p1', provider: 'codex', generation: 'g1', status: 'running', tools: [] },
    activity: { version: 5, seenThrough: 5, updatedAt: '2026-11-18T02:59:59.000Z', active: true, pendingDecisionCount: 0 },
  });
  assert.equal(activityState(applyConfirmedSeenActivity(staleListBeforeAsk, seenAt5, null, [runningRowWithAsk])), 'waiting');

  // 2) 空闲已读后（active=false），同版本变为状态待确认（active=true）：不得被旧 seenMap 吞成 null。
  const seenIdle = recordSeenActivity({}, 'w1', 'c-unknown', {
    version: 5,
    seenThrough: 5,
    updatedAt: '2026-11-18T03:00:00.000Z',
    active: false,
    pendingDecisionCount: 0,
  });
  const becameUnknown = makeRow('c-unknown', {
    updatedAt: '2026-11-18T03:00:12.000Z',
    run: { id: 'run-u', participantId: 'p1', provider: 'codex', generation: 'g1', status: 'unknown', tools: [] },
    activity: { version: 5, seenThrough: 5, updatedAt: '2026-11-18T03:00:12.000Z', active: true, pendingDecisionCount: 0 },
  });
  assert.equal(activityState(applyConfirmedSeenActivity(becameUnknown, seenIdle, null)), 'unknown');

  // 3) 当前打开对话已取消或已投递 pendingSend 时，旧列表行上的发送等待/失败提示立即消除。
  const cachedSendFailed = makeRow('c-send', {
    updatedAt: '2026-11-18T03:00:00.000Z',
    activity: {
      version: 5,
      seenThrough: 5,
      updatedAt: '2026-11-18T03:00:00.000Z',
      active: true,
      pendingDecisionCount: 0,
      pendingSend: { state: 'failed', reason: '发送失败', updatedAt: '2026-11-18T03:00:00.000Z' },
    },
  });
  const liveCleared = {
    ...cachedSendFailed,
    updatedAt: '2026-11-18T03:00:20.000Z',
    entries: [],
    requests: [],
    pendingSend: undefined,
    activity: { version: 5, seenThrough: 5, updatedAt: '2026-11-18T03:00:20.000Z', active: false, pendingDecisionCount: 0 },
  };
  assert.equal(activityState(applyConfirmedSeenActivity(cachedSendFailed, {}, liveCleared)), null);
});
