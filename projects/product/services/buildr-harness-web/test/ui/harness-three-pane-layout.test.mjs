import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HARNESS_RAIL_WIDTH,
  THREE_PANE_DEFAULT_CONVERSATION_RATIO,
  THREE_PANE_FEED_MIN_WIDTH,
  THREE_PANE_HISTORY_DEFAULT_WIDTH,
  THREE_PANE_HISTORY_MAX_WIDTH,
  THREE_PANE_HISTORY_MIN_WIDTH,
  THREE_PANE_MIN_VIEWPORT_WIDTH,
  THREE_PANE_WORKSPACE_MIN_WIDTH,
  canUseHarnessThreePane,
  resizeThreePaneConversationRatio,
  resizeThreePaneHistory,
  resolveHarnessThreePaneLayout,
} from '../../src/shell/harness-layout.ts';

test('三分屏阈值区分移动端断点与三栏最小宽度总和', () => {
  assert.equal(THREE_PANE_MIN_VIEWPORT_WIDTH, 1172);
  assert.equal(canUseHarnessThreePane(1172, 1172), true);
  assert.equal(canUseHarnessThreePane(1171, 1171), false);
  assert.equal(canUseHarnessThreePane(1440, 760), false);
  assert.equal(canUseHarnessThreePane(1440, 761), true);
});

test('桌面宽屏三分屏始终保证核心对话信息流至少 520px 且宽度闭合', () => {
  for (const width of [1200, 1280, 1440, 1512, 1600, 1920]) {
    const layout = resolveHarnessThreePaneLayout({
      shellWidth: width,
      viewportWidth: width,
      historyOpen: true,
      workspaceOpen: true,
      preferredConversationRatio: THREE_PANE_DEFAULT_CONVERSATION_RATIO,
      preferredHistoryWidth: THREE_PANE_HISTORY_DEFAULT_WIDTH,
    });
    assert.equal(layout.canThreePane, true);
    assert.equal(layout.threePaneActive, true);
    assert.ok(layout.feedWidth >= THREE_PANE_FEED_MIN_WIDTH, `${width} feed=${layout.feedWidth}`);
    assert.ok(layout.historyWidth >= THREE_PANE_HISTORY_MIN_WIDTH, `${width} history=${layout.historyWidth}`);
    assert.ok(layout.workspaceWidth >= THREE_PANE_WORKSPACE_MIN_WIDTH, `${width} workspace=${layout.workspaceWidth}`);
    assert.equal(
      HARNESS_RAIL_WIDTH + layout.historyWidth + layout.feedWidth + layout.workspaceWidth,
      width,
    );
  }
});

test('视口低于 1172px 或仅打开工作区时退回双栏并继续保护信息流', () => {
  const narrowDesktop = resolveHarnessThreePaneLayout({
    shellWidth: 1024,
    viewportWidth: 1024,
    historyOpen: true,
    workspaceOpen: true,
  });
  assert.equal(narrowDesktop.canThreePane, false);
  assert.equal(narrowDesktop.threePaneActive, false);
  assert.ok(narrowDesktop.feedWidth >= THREE_PANE_FEED_MIN_WIDTH);
  assert.ok(narrowDesktop.workspaceWidth >= THREE_PANE_WORKSPACE_MIN_WIDTH);

  const historyClosed = resolveHarnessThreePaneLayout({
    shellWidth: 1440,
    viewportWidth: 1440,
    historyOpen: false,
    workspaceOpen: true,
  });
  assert.equal(historyClosed.canThreePane, true);
  assert.equal(historyClosed.threePaneActive, false);
  assert.ok(historyClosed.feedWidth >= THREE_PANE_FEED_MIN_WIDTH);
  assert.ok(historyClosed.workspaceWidth >= THREE_PANE_WORKSPACE_MIN_WIDTH);

  const workspaceClosed = resolveHarnessThreePaneLayout({
    shellWidth: 1440,
    viewportWidth: 1440,
    historyOpen: true,
    workspaceOpen: false,
  });
  assert.equal(workspaceClosed.workspaceWidth, 0);
  assert.equal(workspaceClosed.conversationRegionWidth, 1440);
});

test('拉宽左侧列表仅在信息流触及 520px 后推挤右侧工作区，缩窄时优先还给信息流', () => {
  const shellWidth = 1440;
  // 默认 60% 下对话区域 864px（含导轨），可先在不推挤工作区的情况下扩列表至 292px
  const withinSlack = resizeThreePaneHistory(
    { shellWidth, conversationRatio: 0.6 },
    290,
  );
  assert.equal(withinSlack.historyWidth, 290);
  assert.equal(withinSlack.conversationRatio, 0.6);

  // 拉到 360px 时，信息流触及 520px，需要从右侧工作区借用空间
  const pushedRight = resizeThreePaneHistory(
    { shellWidth, conversationRatio: 0.6 },
    360,
  );
  assert.equal(pushedRight.historyWidth, 360);
  const pushedLayout = resolveHarnessThreePaneLayout({
    shellWidth,
    historyOpen: true,
    workspaceOpen: true,
    preferredConversationRatio: pushedRight.conversationRatio,
    preferredHistoryWidth: pushedRight.historyWidth,
  });
  assert.equal(pushedLayout.feedWidth, THREE_PANE_FEED_MIN_WIDTH);
  assert.equal(pushedLayout.workspaceWidth, 1440 - 52 - 360 - 520);

  // 极限拉宽不超过 THREE_PANE_HISTORY_MAX_WIDTH（420）且工作区保持 >= 360px
  const maxed = resizeThreePaneHistory(
    { shellWidth, conversationRatio: 0.6 },
    640,
  );
  assert.equal(maxed.historyWidth, THREE_PANE_HISTORY_MAX_WIDTH);
  const maxLayout = resolveHarnessThreePaneLayout({
    shellWidth,
    historyOpen: true,
    workspaceOpen: true,
    preferredConversationRatio: maxed.conversationRatio,
    preferredHistoryWidth: maxed.historyWidth,
  });
  assert.ok(maxLayout.feedWidth >= THREE_PANE_FEED_MIN_WIDTH);
  assert.ok(maxLayout.workspaceWidth >= THREE_PANE_WORKSPACE_MIN_WIDTH);

  // 从推挤后的状态把列表缩窄回 250px：工作区保持不变，空间全部归还给核心信息流
  const shrunk = resizeThreePaneHistory(
    { shellWidth, conversationRatio: pushedRight.conversationRatio },
    250,
  );
  assert.equal(shrunk.historyWidth, 250);
  assert.equal(shrunk.conversationRatio, pushedRight.conversationRatio);
  const shrunkLayout = resolveHarnessThreePaneLayout({
    shellWidth,
    historyOpen: true,
    workspaceOpen: true,
    preferredConversationRatio: shrunk.conversationRatio,
    preferredHistoryWidth: shrunk.historyWidth,
  });
  assert.equal(shrunkLayout.workspaceWidth, pushedLayout.workspaceWidth);
  assert.equal(shrunkLayout.feedWidth, pushedLayout.feedWidth + (360 - 250));
});

test('拉宽右侧工作区仅在信息流触底后压缩列表至 240px，缩窄工作区时列表不跳动', () => {
  const shellWidth = 1440;
  // 从 280px 列表向左拉宽工作区至对话仅剩 832px：信息流保持 520px，列表平稳压到 260px
  const mildSqueeze = resizeThreePaneConversationRatio(
    { shellWidth, historyWidth: 280, threePaneActive: true },
    832 / shellWidth,
  );
  assert.equal(mildSqueeze.historyWidth, 260);
  const mildLayout = resolveHarnessThreePaneLayout({
    shellWidth,
    historyOpen: true,
    workspaceOpen: true,
    preferredConversationRatio: mildSqueeze.conversationRatio,
    preferredHistoryWidth: mildSqueeze.historyWidth,
  });
  assert.equal(mildLayout.feedWidth, THREE_PANE_FEED_MIN_WIDTH);
  assert.equal(mildLayout.historyWidth, 260);

  // 极限向左拖工作区：对话区域在 52 + 240 + 520 = 812px 处止步
  const hardSqueeze = resizeThreePaneConversationRatio(
    { shellWidth, historyWidth: 280, threePaneActive: true },
    0.3,
  );
  assert.equal(hardSqueeze.historyWidth, THREE_PANE_HISTORY_MIN_WIDTH);
  const hardLayout = resolveHarnessThreePaneLayout({
    shellWidth,
    historyOpen: true,
    workspaceOpen: true,
    preferredConversationRatio: hardSqueeze.conversationRatio,
    preferredHistoryWidth: hardSqueeze.historyWidth,
  });
  assert.equal(hardLayout.conversationRegionWidth, HARNESS_RAIL_WIDTH + THREE_PANE_HISTORY_MIN_WIDTH + THREE_PANE_FEED_MIN_WIDTH);
  assert.equal(hardLayout.feedWidth, THREE_PANE_FEED_MIN_WIDTH);
  assert.equal(hardLayout.historyWidth, THREE_PANE_HISTORY_MIN_WIDTH);

  // 向右收缩工作区（对话区域扩至 1008px）：列表保持原宽 280px，释放空间全归信息流
  const expanded = resizeThreePaneConversationRatio(
    { shellWidth, historyWidth: 280, threePaneActive: true },
    0.7,
  );
  assert.equal(expanded.historyWidth, 280);
  const expandedLayout = resolveHarnessThreePaneLayout({
    shellWidth,
    historyOpen: true,
    workspaceOpen: true,
    preferredConversationRatio: expanded.conversationRatio,
    preferredHistoryWidth: expanded.historyWidth,
  });
  assert.equal(expandedLayout.historyWidth, 280);
  assert.equal(expandedLayout.feedWidth, 1008 - HARNESS_RAIL_WIDTH - 280);
});
