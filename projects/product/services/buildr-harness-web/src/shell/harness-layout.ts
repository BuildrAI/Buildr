export const HARNESS_RAIL_WIDTH = 52;
export const HARNESS_MOBILE_BREAKPOINT = 760;
export const THREE_PANE_HISTORY_MIN_WIDTH = 240;
export const THREE_PANE_HISTORY_DEFAULT_WIDTH = 280;
export const THREE_PANE_HISTORY_MAX_WIDTH = 420;
export const THREE_PANE_FEED_MIN_WIDTH = 520;
export const THREE_PANE_WORKSPACE_MIN_WIDTH = 360;
export const THREE_PANE_DEFAULT_CONVERSATION_RATIO = 0.6;
export const THREE_PANE_MIN_VIEWPORT_WIDTH =
  HARNESS_RAIL_WIDTH + THREE_PANE_HISTORY_MIN_WIDTH + THREE_PANE_FEED_MIN_WIDTH + THREE_PANE_WORKSPACE_MIN_WIDTH;
export const TWO_PANE_WORKSPACE_MIN_CONVERSATION_WIDTH = HARNESS_RAIL_WIDTH + THREE_PANE_FEED_MIN_WIDTH;

export type HarnessThreePaneLayout = {
  canThreePane: boolean;
  threePaneActive: boolean;
  minConversationRegion: number;
  minWorkspace: number;
  conversationRatio: number;
  conversationRegionWidth: number;
  workspaceWidth: number;
  historyWidth: number;
  historyMinWidth: number;
  historyMaxWidth: number;
  feedWidth: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function canUseHarnessThreePane(shellWidth: number, viewportWidth = shellWidth): boolean {
  return (
    Number.isFinite(shellWidth) &&
    Number.isFinite(viewportWidth) &&
    viewportWidth > HARNESS_MOBILE_BREAKPOINT &&
    shellWidth >= THREE_PANE_MIN_VIEWPORT_WIDTH
  );
}

export function resolveHarnessThreePaneLayout(input: {
  shellWidth: number;
  viewportWidth?: number;
  historyOpen: boolean;
  workspaceOpen: boolean;
  preferredConversationRatio?: number;
  preferredHistoryWidth?: number;
}): HarnessThreePaneLayout {
  const shellWidth = Number.isFinite(input.shellWidth) && input.shellWidth > 0 ? Math.round(input.shellWidth) : 0;
  const viewportWidth =
    input.viewportWidth !== undefined && Number.isFinite(input.viewportWidth) ? input.viewportWidth : shellWidth;
  const baseRatio =
    input.preferredConversationRatio !== undefined &&
    Number.isFinite(input.preferredConversationRatio) &&
    input.preferredConversationRatio > 0 &&
    input.preferredConversationRatio < 1
      ? input.preferredConversationRatio
      : THREE_PANE_DEFAULT_CONVERSATION_RATIO;
  const baseHistory =
    input.preferredHistoryWidth !== undefined && Number.isFinite(input.preferredHistoryWidth) && input.preferredHistoryWidth > 0
      ? input.preferredHistoryWidth
      : THREE_PANE_HISTORY_DEFAULT_WIDTH;

  if (!input.workspaceOpen) {
    const panelWidth = Math.max(0, shellWidth - HARNESS_RAIL_WIDTH);
    return {
      canThreePane: false,
      threePaneActive: false,
      minConversationRegion: shellWidth,
      minWorkspace: THREE_PANE_WORKSPACE_MIN_WIDTH,
      conversationRatio: baseRatio,
      conversationRegionWidth: shellWidth,
      workspaceWidth: 0,
      historyWidth: Math.round(clamp(baseHistory, THREE_PANE_HISTORY_MIN_WIDTH, THREE_PANE_HISTORY_MAX_WIDTH)),
      historyMinWidth: THREE_PANE_HISTORY_MIN_WIDTH,
      historyMaxWidth: THREE_PANE_HISTORY_MAX_WIDTH,
      feedWidth: panelWidth,
    };
  }

  const canThreePane = canUseHarnessThreePane(shellWidth, viewportWidth);
  const threePaneActive = input.historyOpen && canThreePane;
  const minConversationRegion = threePaneActive
    ? HARNESS_RAIL_WIDTH + THREE_PANE_HISTORY_MIN_WIDTH + THREE_PANE_FEED_MIN_WIDTH
    : TWO_PANE_WORKSPACE_MIN_CONVERSATION_WIDTH;
  const minWorkspace = THREE_PANE_WORKSPACE_MIN_WIDTH;

  let conversationRegionWidth = 0;
  if (shellWidth > 0) {
    if (shellWidth >= minConversationRegion + minWorkspace) {
      conversationRegionWidth = clamp(
        Math.round(shellWidth * baseRatio),
        minConversationRegion,
        shellWidth - minWorkspace,
      );
    } else {
      const scale = shellWidth / (minConversationRegion + minWorkspace);
      const scaledMinConv = Math.round(minConversationRegion * scale);
      const scaledMinWork = shellWidth - scaledMinConv;
      conversationRegionWidth = clamp(
        Math.round(shellWidth * baseRatio),
        Math.min(scaledMinConv, shellWidth),
        Math.max(0, shellWidth - scaledMinWork),
      );
    }
  }

  const workspaceWidth = Math.max(0, shellWidth - conversationRegionWidth);
  const conversationRatio = shellWidth > 0 ? conversationRegionWidth / shellWidth : baseRatio;
  const panelWidth = Math.max(0, conversationRegionWidth - HARNESS_RAIL_WIDTH);

  if (threePaneActive) {
    const localMaxHistory = Math.max(
      THREE_PANE_HISTORY_MIN_WIDTH,
      Math.min(THREE_PANE_HISTORY_MAX_WIDTH, panelWidth - THREE_PANE_FEED_MIN_WIDTH),
    );
    const historyMaxWidth = Math.max(
      THREE_PANE_HISTORY_MIN_WIDTH,
      Math.min(
        THREE_PANE_HISTORY_MAX_WIDTH,
        shellWidth - HARNESS_RAIL_WIDTH - THREE_PANE_FEED_MIN_WIDTH - minWorkspace,
      ),
    );
    const historyWidth = clamp(Math.round(baseHistory), THREE_PANE_HISTORY_MIN_WIDTH, localMaxHistory);
    const feedWidth = Math.max(0, panelWidth - historyWidth);
    return {
      canThreePane,
      threePaneActive,
      minConversationRegion,
      minWorkspace,
      conversationRatio,
      conversationRegionWidth,
      workspaceWidth,
      historyWidth,
      historyMinWidth: THREE_PANE_HISTORY_MIN_WIDTH,
      historyMaxWidth,
      feedWidth,
    };
  }

  const clampedHistory = clamp(Math.round(baseHistory), THREE_PANE_HISTORY_MIN_WIDTH, THREE_PANE_HISTORY_MAX_WIDTH);
  return {
    canThreePane,
    threePaneActive: false,
    minConversationRegion,
    minWorkspace,
    conversationRatio,
    conversationRegionWidth,
    workspaceWidth,
    historyWidth: clampedHistory,
    historyMinWidth: THREE_PANE_HISTORY_MIN_WIDTH,
    historyMaxWidth: THREE_PANE_HISTORY_MAX_WIDTH,
    feedWidth: panelWidth,
  };
}

export function resizeThreePaneHistory(
  input: { shellWidth: number; conversationRatio: number; historyWidth?: number },
  targetHistoryWidth: number,
): { historyWidth: number; conversationRatio: number } {
  const shellWidth = Number.isFinite(input.shellWidth) && input.shellWidth > 0 ? Math.round(input.shellWidth) : 0;
  if (shellWidth <= 0) {
    return {
      historyWidth: clamp(
        Math.round(targetHistoryWidth),
        THREE_PANE_HISTORY_MIN_WIDTH,
        THREE_PANE_HISTORY_MAX_WIDTH,
      ),
      conversationRatio: input.conversationRatio,
    };
  }
  const totalMaxHistory = Math.max(
    THREE_PANE_HISTORY_MIN_WIDTH,
    Math.min(
      THREE_PANE_HISTORY_MAX_WIDTH,
      shellWidth - HARNESS_RAIL_WIDTH - THREE_PANE_FEED_MIN_WIDTH - THREE_PANE_WORKSPACE_MIN_WIDTH,
    ),
  );
  const nextHistory = clamp(Math.round(targetHistoryWidth), THREE_PANE_HISTORY_MIN_WIDTH, totalMaxHistory);
  const minConv = HARNESS_RAIL_WIDTH + THREE_PANE_HISTORY_MIN_WIDTH + THREE_PANE_FEED_MIN_WIDTH;
  const maxConv = Math.max(minConv, shellWidth - THREE_PANE_WORKSPACE_MIN_WIDTH);
  const currentConv = clamp(Math.round(shellWidth * input.conversationRatio), minConv, maxConv);
  const neededConv = HARNESS_RAIL_WIDTH + nextHistory + THREE_PANE_FEED_MIN_WIDTH;
  if (currentConv < neededConv) {
    const nextConv = Math.min(maxConv, neededConv);
    return {
      historyWidth: nextHistory,
      conversationRatio: nextConv / shellWidth,
    };
  }
  return {
    historyWidth: nextHistory,
    conversationRatio: input.conversationRatio,
  };
}

export function resizeThreePaneConversationRatio(
  input: { shellWidth: number; historyWidth: number; threePaneActive: boolean },
  targetConversationRatio: number,
): { conversationRatio: number; historyWidth: number } {
  const shellWidth = Number.isFinite(input.shellWidth) && input.shellWidth > 0 ? Math.round(input.shellWidth) : 0;
  if (shellWidth <= 0) {
    return {
      conversationRatio: clamp(targetConversationRatio, 0, 1),
      historyWidth: input.historyWidth,
    };
  }
  if (!input.threePaneActive) {
    const minConv = TWO_PANE_WORKSPACE_MIN_CONVERSATION_WIDTH;
    const minWork = THREE_PANE_WORKSPACE_MIN_WIDTH;
    let nextConv: number;
    if (shellWidth >= minConv + minWork) {
      nextConv = clamp(Math.round(shellWidth * targetConversationRatio), minConv, shellWidth - minWork);
    } else {
      const scale = shellWidth / (minConv + minWork);
      const scaledMinConv = Math.round(minConv * scale);
      const scaledMinWork = shellWidth - scaledMinConv;
      nextConv = clamp(
        Math.round(shellWidth * targetConversationRatio),
        Math.min(scaledMinConv, shellWidth),
        Math.max(0, shellWidth - scaledMinWork),
      );
    }
    return {
      conversationRatio: nextConv / shellWidth,
      historyWidth: input.historyWidth,
    };
  }

  const minConv = HARNESS_RAIL_WIDTH + THREE_PANE_HISTORY_MIN_WIDTH + THREE_PANE_FEED_MIN_WIDTH;
  const maxConv = Math.max(minConv, shellWidth - THREE_PANE_WORKSPACE_MIN_WIDTH);
  const nextConv = clamp(Math.round(shellWidth * targetConversationRatio), minConv, maxConv);
  const maxAllowedHistory = nextConv - HARNESS_RAIL_WIDTH - THREE_PANE_FEED_MIN_WIDTH;
  const nextHistory =
    input.historyWidth > maxAllowedHistory
      ? Math.max(THREE_PANE_HISTORY_MIN_WIDTH, maxAllowedHistory)
      : input.historyWidth;
  return {
    conversationRatio: nextConv / shellWidth,
    historyWidth: nextHistory,
  };
}
