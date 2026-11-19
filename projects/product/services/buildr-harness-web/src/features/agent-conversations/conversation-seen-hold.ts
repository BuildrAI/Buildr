import { activityState, isExecuting, sendActivity } from './conversation-activity.ts';
import type { ConversationPage } from './api/agent-conversations-api.ts';
import type { ConversationHistoryCache } from './conversation-history-page.ts';
import type { ConversationSummary, ConversationView } from './types.ts';

export type SeenActivity = NonNullable<ConversationSummary['activity']>;
export type SeenActivityMap = Record<string, SeenActivity>;

export type WorkspaceSeenHoldState = {
  conversationId: string;
  heldVersion: number | string;
  otherActivitySignature: string;
  pinnedIndex: number;
  pinnedRow: ConversationSummary;
  refreshedDuringHold: boolean;
};

const conversationKey = (workspaceId: string, conversationId: string) => `${workspaceId}:${conversationId}`;

function mergeLiveActivity(base?: SeenActivity, live?: SeenActivity): SeenActivity | undefined {
  if (!live) return base;
  if (!base) return live;
  if (live.version > base.version) return live;
  if (live.version < base.version) return base;
  const seenThrough = Math.max(base.seenThrough, live.seenThrough);
  const pendingSend = live.pendingSend;
  const pendingDecisionCount = live.pendingDecisionCount ?? base.pendingDecisionCount;
  const active = base.seenThrough > live.seenThrough
    ? Boolean(base.active || (pendingDecisionCount ?? 0) > 0 || pendingSend)
    : live.active;
  if (
    seenThrough === base.seenThrough
    && active === base.active
    && pendingSend === base.pendingSend
    && pendingDecisionCount === base.pendingDecisionCount
    && live.updatedAt === base.updatedAt
    && live.finalReplyAt === base.finalReplyAt
    && live.userInputAt === base.userInputAt
  ) {
    return base;
  }
  const merged: SeenActivity = {
    ...base,
    ...live,
    seenThrough,
    active,
    ...(pendingDecisionCount !== undefined ? { pendingDecisionCount } : {}),
  };
  if (pendingSend === undefined) delete merged.pendingSend;
  return merged;
}

/** Only advance seenThrough from a /seen receipt; never let an earlier receipt overwrite newer decisions or active state. */
function applySeenSnapshot(base?: SeenActivity, confirmed?: SeenActivity): SeenActivity | undefined {
  if (!confirmed) return base;
  if (!base) return confirmed;
  if (confirmed.version < base.version) return base;
  if (confirmed.version > base.version) return confirmed;
  if (confirmed.seenThrough <= base.seenThrough) return base;
  const active = Boolean(confirmed.active || (base.pendingDecisionCount ?? 0) > 0 || base.pendingSend);
  if (confirmed.seenThrough === base.seenThrough && active === base.active) return base;
  return {
    ...base,
    seenThrough: confirmed.seenThrough,
    active,
  };
}

/** Monotonically retain server-confirmed seen activity snapshots so list rows clear "待查看" without falling into "unknown". */
export function recordSeenActivity(
  current: SeenActivityMap,
  workspaceId: string,
  conversationId: string,
  activity: SeenActivity,
): SeenActivityMap {
  const key = conversationKey(workspaceId, conversationId);
  const previous = current[key];
  if (previous) {
    if (previous.version > activity.version) return current;
    if (
      previous.version === activity.version
      && previous.seenThrough >= activity.seenThrough
      && previous.active === activity.active
      && previous.pendingDecisionCount === activity.pendingDecisionCount
    ) {
      return current;
    }
  }
  return { ...current, [key]: activity };
}

function isNewerSummary(candidate: ConversationSummary, baseline: ConversationSummary): boolean {
  if (!baseline.activity) return true;
  if (!candidate.activity) return false;
  if (candidate.activity.version !== baseline.activity.version) {
    return candidate.activity.version > baseline.activity.version;
  }
  if (!baseline.updatedAt || !candidate.updatedAt) return true;
  return candidate.updatedAt >= baseline.updatedAt;
}

/** Overlay live activity summaries, active conversation facts, and server-confirmed seen state onto list or reminder rows. */
export function applyConfirmedSeenActivity(
  row: ConversationSummary,
  seenActivities?: SeenActivityMap,
  activeConversation?: ConversationView | null,
  activityRows?: readonly ConversationSummary[],
): ConversationSummary {
  const key = conversationKey(row.workspaceId, row.id);
  const activityRow = activityRows?.find(item => item.workspaceId === row.workspaceId && item.id === row.id);
  let baseRow = row;
  if (activityRow && activityRow !== row && isNewerSummary(activityRow, row)) {
    const nextActivity = mergeLiveActivity(row.activity, activityRow.activity);
    baseRow = {
      ...row,
      title: activityRow.title,
      hidden: activityRow.hidden,
      run: activityRow.run,
      retainedRuns: activityRow.retainedRuns,
      activity: nextActivity,
    };
  }
  const live = activeConversation?.workspaceId === row.workspaceId && activeConversation.id === row.id
    ? activeConversation
    : null;
  const confirmed = seenActivities?.[key];
  const canApplyLiveFields = Boolean(
    live && (
      isNewerSummary(live, baseRow)
      || isExecuting(live)
      || Boolean(sendActivity(live))
      || (Boolean(sendActivity(baseRow)) && live.pendingSend === undefined)
    ),
  );
  let mergedLiveActivity = canApplyLiveFields && live
    ? mergeLiveActivity(baseRow.activity, live.activity)
    : baseRow.activity;
  if (canApplyLiveFields && live!.pendingSend === undefined && mergedLiveActivity?.pendingSend !== undefined) {
    const cleared = { ...mergedLiveActivity };
    delete cleared.pendingSend;
    mergedLiveActivity = cleared;
  }
  const nextActivity = applySeenSnapshot(mergedLiveActivity, confirmed);
  if (!canApplyLiveFields) {
    return nextActivity === baseRow.activity ? baseRow : { ...baseRow, activity: nextActivity };
  }
  const nextPendingSend = live!.pendingSend;
  if (
    nextActivity === baseRow.activity
    && live!.title === baseRow.title
    && live!.run === baseRow.run
    && live!.retainedRuns === baseRow.retainedRuns
    && live!.requests === baseRow.requests
    && nextPendingSend === baseRow.pendingSend
  ) {
    return baseRow;
  }
  return {
    ...baseRow,
    title: live!.title,
    run: live!.run,
    retainedRuns: live!.retainedRuns,
    requests: live!.requests,
    pendingSend: nextPendingSend,
    activity: nextActivity,
  };
}

export function workspaceOtherActivitySignature(
  workspaceId: string,
  excludedConversationId: string,
  activityRows: readonly ConversationSummary[],
): string {
  const entries = activityRows
    .filter(row => row.workspaceId === workspaceId && row.id !== excludedConversationId)
    .map(row => [
      row.id,
      row.title,
      row.hidden,
      row.run?.id,
      row.run?.status,
      row.run?.model,
      row.run?.provider,
      row.run?.modelAccountId,
      row.run?.modelSourceLabel,
      row.activity?.updatedAt,
      row.activity?.userInputAt,
      row.activity?.active,
      row.activity?.pendingDecisionCount,
      row.activity?.pendingSend?.state,
      row.activity?.pendingSend?.reason,
      Boolean(row.activity && row.activity.version > row.activity.seenThrough),
    ]);
  return JSON.stringify(entries);
}

/** Release the held slot immediately when the stayed conversation starts executing, queues a send, or waits for a decision. */
export function shouldReleaseSeenHold(effectiveRow: ConversationSummary): boolean {
  return isExecuting(effectiveRow) || Boolean(sendActivity(effectiveRow)) || activityState(effectiveRow) === 'waiting';
}

/** Freeze row order and suppress self-induced list refreshes while viewing an unseen conversation side-by-side. */
export function advanceWorkspaceSeenHold(input: {
  previous: WorkspaceSeenHoldState | null;
  activeViewingId: string | null;
  workspaceId: string;
  rawVersion: number | string;
  displayedRows: readonly ConversationSummary[];
  displayedVersion?: number | string;
  activityRows: readonly ConversationSummary[];
  seenActivities?: SeenActivityMap;
  activeConversation?: ConversationView | null;
}): {
  hold: WorkspaceSeenHoldState | null;
  effectiveVersion: number | string;
  invalidateCache: boolean;
} {
  if (!input.activeViewingId) {
    return {
      hold: null,
      effectiveVersion: input.rawVersion,
      invalidateCache: Boolean(input.previous?.refreshedDuringHold),
    };
  }

  if (input.previous && input.previous.conversationId === input.activeViewingId) {
    const latestRaw = input.displayedRows.find(row => row.id === input.activeViewingId) ?? input.previous.pinnedRow;
    const effective = applyConfirmedSeenActivity(latestRaw, input.seenActivities, input.activeConversation);
    if (shouldReleaseSeenHold(effective)) {
      return {
        hold: null,
        effectiveVersion: input.rawVersion,
        invalidateCache: input.previous.refreshedDuringHold,
      };
    }
    const nextOtherSignature = workspaceOtherActivitySignature(input.workspaceId, input.activeViewingId, input.activityRows);
    if (nextOtherSignature === input.previous.otherActivitySignature) {
      return {
        hold: input.previous,
        effectiveVersion: input.previous.heldVersion,
        invalidateCache: false,
      };
    }
    return {
      hold: {
        ...input.previous,
        heldVersion: input.rawVersion,
        otherActivitySignature: nextOtherSignature,
        pinnedRow: latestRaw,
        refreshedDuringHold: true,
      },
      effectiveVersion: input.rawVersion,
      invalidateCache: false,
    };
  }

  const invalidatePrevious = Boolean(input.previous?.refreshedDuringHold);
  const rawIndex = input.displayedRows.findIndex(row => row.id === input.activeViewingId);
  if (rawIndex < 0) {
    return {
      hold: null,
      effectiveVersion: input.rawVersion,
      invalidateCache: invalidatePrevious,
    };
  }
  const rawRow = input.displayedRows[rawIndex]!;
  if (activityState(rawRow) !== 'unseen') {
    return {
      hold: null,
      effectiveVersion: input.rawVersion,
      invalidateCache: invalidatePrevious,
    };
  }
  const effective = applyConfirmedSeenActivity(rawRow, input.seenActivities, input.activeConversation);
  if (shouldReleaseSeenHold(effective)) {
    return {
      hold: null,
      effectiveVersion: input.rawVersion,
      invalidateCache: invalidatePrevious,
    };
  }

  // When switching directly from an already-read held conversation C1 to another
  // unseen conversation C2, C1 settles down immediately, so pin C2 at its post-settle index.
  let pinnedIndex = 0;
  for (let index = 0; index < rawIndex; index++) {
    const preceding = input.displayedRows[index]!;
    const settledPreceding = applyConfirmedSeenActivity(preceding, input.seenActivities, input.activeConversation);
    const settlingAway = activityState(preceding) === 'unseen' && activityState(settledPreceding) === null;
    if (!settlingAway) pinnedIndex++;
  }

  const heldVersion = input.previous
    ? input.rawVersion
    : (input.displayedVersion !== undefined && input.displayedVersion !== -1 ? input.displayedVersion : input.rawVersion);

  return {
    hold: {
      conversationId: input.activeViewingId,
      heldVersion,
      otherActivitySignature: workspaceOtherActivitySignature(input.workspaceId, input.activeViewingId, input.activityRows),
      pinnedIndex,
      pinnedRow: rawRow,
      refreshedDuringHold: false,
    },
    effectiveVersion: heldVersion,
    invalidateCache: invalidatePrevious,
  };
}

/** Keep the held conversation at its entered index when unrelated workspace updates refresh the list. */
export function pinHeldConversationRow(
  rows: readonly ConversationSummary[],
  hold: WorkspaceSeenHoldState | null,
): { rows: readonly ConversationSummary[]; displaced: boolean } {
  if (!hold || !rows.length) return { rows, displaced: false };
  const existingIndex = rows.findIndex(row => row.id === hold.conversationId);
  const maxIndex = existingIndex >= 0 ? rows.length - 1 : rows.length;
  const targetIndex = Math.max(0, Math.min(hold.pinnedIndex, maxIndex));
  if (existingIndex === targetIndex) return { rows, displaced: false };
  const next = rows.slice();
  const targetRow = existingIndex >= 0 ? next.splice(existingIndex, 1)[0]! : hold.pinnedRow;
  next.splice(targetIndex, 0, targetRow);
  return {
    rows: existingIndex >= 0 ? next : next.slice(0, rows.length),
    displaced: true,
  };
}

export function invalidateWorkspaceHistoryCache(cache: ConversationHistoryCache | undefined, workspaceId: string): void {
  if (!cache) return;
  for (const [key, value] of cache.pages) {
    try {
      if (JSON.parse(key)[0] === workspaceId && value.version !== -1) {
        cache.pages.set(key, { ...value, version: -1 });
      }
    } catch { /* Ignore non-group keys if any. */ }
  }
}

/** Drive top execution stats refreshes solely from real execution changes, ignoring seen-only activity ticks. */
export function executionStatsSignature(
  stats: ConversationPage['stats'] | undefined,
  activityRows: readonly ConversationSummary[],
  activityCursor: string | undefined,
  _activityTick: number,
): string | null {
  if (stats === undefined || activityCursor) return null;
  const executing = activityRows
    .filter(isExecuting)
    .map(row => [
      row.workspaceId,
      row.id,
      row.run?.id,
      row.run?.status,
      row.run?.provider,
      row.run?.model,
      row.run?.modelAccountId,
      row.run?.modelSourceLabel,
    ]);
  return JSON.stringify([stats, executing]);
}
