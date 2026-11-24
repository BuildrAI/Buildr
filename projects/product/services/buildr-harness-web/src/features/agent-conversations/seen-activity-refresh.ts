import { activityState } from './conversation-activity.ts';
import { conversationStreamTurns, conversationTurnExpanded, groupConversationStream } from './conversation-state.ts';
import type { ConversationEntry, ConversationRun, ConversationSummary, ConversationView } from './types.ts';

type Timer = ReturnType<typeof setTimeout>;
const STREAMING_STATUSES = new Set(['starting', 'running', 'stopping']);

export function isStreamingSeenStatus(status?: string): boolean {
  return Boolean(status && STREAMING_STATUSES.has(status));
}

export function seenAttemptKey(
  chat: Pick<ConversationView, 'workspaceId' | 'id' | 'activity' | 'run'>,
): string | null {
  const version = chat.activity?.version;
  if (version === undefined || version <= (chat.activity?.seenThrough ?? 0)) return null;
  return `${chat.workspaceId}:${chat.id}:${version}:${isStreamingSeenStatus(chat.run?.status) ? 'streaming' : 'settled'}`;
}

export function resolveSeenRefreshTarget(
  sent: ConversationView,
  current: ConversationView | null | undefined,
): ConversationView {
  if (current && current.id === sent.id && current.workspaceId === sent.workspaceId) {
    return {
      ...current,
      activity: current.activity
        ? {
            ...current.activity,
            seenThrough: Math.min(current.activity.seenThrough, sent.activity?.seenThrough ?? current.activity.seenThrough),
          }
        : sent.activity,
    };
  }
  return sent;
}

export function createStreamingSeenScheduler(options: {
  send: (value: ConversationView) => Promise<boolean | void>;
  intervalMs?: number;
  retryDelayMs?: number;
  maxRetries?: number;
  shouldRetry?: (value: ConversationView) => boolean;
  now?: () => number;
  schedule?: (callback: () => void, milliseconds: number) => Timer;
  cancel?: (timer: Timer) => void;
}) {
  const intervalMs = options.intervalMs ?? 1500;
  const retryDelayMs = options.retryDelayMs ?? 3000;
  const maxRetries = options.maxRetries ?? 3;
  const now = options.now ?? (() => Date.now());
  const schedule = options.schedule ?? ((callback, ms) => setTimeout(callback, ms));
  const cancel = options.cancel ?? (timer => clearTimeout(timer));
  let timer: Timer | null = null;
  let retryTimer: Timer | null = null;
  let pendingValue: ConversationView | null = null;
  let retryValue: ConversationView | null = null;
  let retryCount = 0;
  let disposed = false;
  let dispatchId = 0;
  let lastSentKey: string | null = null;
  let lastSentAt = 0;

  const clearTimer = () => {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  };

  const clearRetry = () => {
    if (retryTimer !== null) {
      cancel(retryTimer);
      retryTimer = null;
    }
    retryValue = null;
    retryCount = 0;
  };

  const runSend = async (value: ConversationView, isRetry = false): Promise<boolean> => {
    const id = ++dispatchId;
    if (!isRetry) clearRetry();
    lastSentAt = now();
    lastSentKey = `${value.workspaceId}:${value.id}`;
    let ok = false;
    try {
      const result = await options.send(value);
      ok = result !== false;
    } catch {
      ok = false;
    }
    if (ok) {
      if (id === dispatchId) {
        retryValue = null;
        retryCount = 0;
      }
      return true;
    }
    if (
      !disposed &&
      id === dispatchId &&
      !pendingValue &&
      retryCount < maxRetries &&
      (!options.shouldRetry || options.shouldRetry(value))
    ) {
      const delay = retryDelayMs * 2 ** retryCount;
      retryCount++;
      retryValue = value;
      retryTimer = schedule(() => {
        retryTimer = null;
        const next = retryValue;
        retryValue = null;
        if (!disposed && next && (!options.shouldRetry || options.shouldRetry(next))) {
          void runSend(next, true);
        }
      }, delay);
    }
    return false;
  };

  const dispatch = (value: ConversationView): Promise<boolean> => {
    clearTimer();
    pendingValue = null;
    return runSend(value, false);
  };

  return {
    notify(value: ConversationView): Promise<boolean> {
      const version = value.activity?.version;
      if (version === undefined || version <= (value.activity?.seenThrough ?? 0)) return Promise.resolve(true);
      const key = `${value.workspaceId}:${value.id}`;
      if (pendingValue && `${pendingValue.workspaceId}:${pendingValue.id}` !== key) {
        void dispatch(pendingValue);
      } else if (retryValue && `${retryValue.workspaceId}:${retryValue.id}` !== key) {
        clearRetry();
      }
      if (!isStreamingSeenStatus(value.run?.status)) {
        return dispatch(value);
      }
      clearRetry();
      const elapsed = Math.max(0, now() - lastSentAt);
      if (lastSentKey !== key || (timer === null && elapsed >= intervalMs)) {
        return dispatch(value);
      }
      pendingValue = value;
      if (timer === null) {
        const delay = Math.max(0, intervalMs - elapsed);
        timer = schedule(() => {
          timer = null;
          const next = pendingValue;
          pendingValue = null;
          if (next) {
            void runSend(next, false);
          }
        }, delay);
      }
      return Promise.resolve(true);
    },
    flushMatching(value: ConversationView): Promise<boolean> | null {
      const version = value.activity?.version;
      if (
        !pendingValue ||
        pendingValue.workspaceId !== value.workspaceId ||
        pendingValue.id !== value.id ||
        version === undefined ||
        (pendingValue.activity?.version ?? -1) < version ||
        version <= (value.activity?.seenThrough ?? 0) ||
        isStreamingSeenStatus(value.run?.status)
      ) {
        return null;
      }
      clearTimer();
      pendingValue = null;
      return runSend(value, false);
    },
    flush(): Promise<boolean> {
      clearTimer();
      clearRetry();
      const next = pendingValue;
      pendingValue = null;
      if (!next) return Promise.resolve(true);
      return runSend(next, false);
    },
    dispose(): void {
      disposed = true;
      clearTimer();
      clearRetry();
      pendingValue = null;
    },
  };
}

export type SeenFallbackTarget = { kind: 'entry'; id: string } | { kind: 'turn'; id: string };

/** Dual-pane focus mode keeps the conversation transcript visible beside the history list. */
export function isConversationViewVisible(
  open: boolean,
  view: 'conversation' | 'history',
  focusSplit: boolean,
): boolean {
  return open && (view === 'conversation' || focusSplit);
}

/**
 * Locate the DOM element that represents `latest` when its raw entry id is absent
 * from the viewport (for example, collapsed inside a settled process block or
 * merged into an earlier assistant segment). Normal visible final replies keep
 * their own entry target so long answers scrolled above do not mark seen early.
 */
export function findSeenFallbackTarget(
  latest: ConversationEntry,
  visibleEntries: readonly ConversationEntry[],
  currentRun?: ConversationRun,
  retainedRuns: readonly ConversationRun[] = [],
  expanded: Record<string, boolean> = {},
): SeenFallbackTarget | null {
  const runs = [...retainedRuns, ...(currentRun ? [currentRun] : [])];
  const turns = conversationStreamTurns(groupConversationStream(visibleEntries, currentRun, retainedRuns), runs);
  const canMatchMergedSegment = latest.kind === 'message' && latest.role === 'assistant';
  const entryMatchesMerged = (entry: ConversationEntry) =>
    canMatchMergedSegment &&
    !entry.parentToolId &&
    !entry.thinking &&
    entry.kind === 'message' &&
    entry.role === 'assistant' &&
    entry.runId === latest.runId &&
    entry.sequence <= latest.sequence;

  let owner = null as (typeof turns)[number] | null;
  let exactInTurn = false;
  for (let index = turns.length - 1; index >= 0; index--) {
    const candidate = turns[index]!;
    const exact =
      candidate.prompt?.id === latest.id ||
      candidate.items.some(item =>
        item.type === 'entry'
          ? item.entry.id === latest.id
          : item.entries.some(entry => entry.id === latest.id),
      );
    if (exact) {
      owner = candidate;
      exactInTurn = true;
      break;
    }
  }
  if (!owner && canMatchMergedSegment) {
    for (let index = turns.length - 1; index >= 0; index--) {
      const candidate = turns[index]!;
      const merged = candidate.items.some(
        item => item.type === 'process-block' && item.entries.some(entryMatchesMerged),
      );
      if (merged) {
        owner = candidate;
        break;
      }
    }
  }
  if (!owner) return null;

  if (conversationTurnExpanded(owner, currentRun, expanded)) {
    for (let index = owner.items.length - 1; index >= 0; index--) {
      const item = owner.items[index]!;
      if (item.type === 'entry' && item.entry.id === latest.id) return { kind: 'entry', id: item.entry.id };
      if (item.type === 'process-block') {
        if (exactInTurn && item.entries.some(entry => entry.id === latest.id)) {
          return { kind: 'entry', id: latest.id };
        }
        for (let entryIndex = item.entries.length - 1; entryIndex >= 0; entryIndex--) {
          const entry = item.entries[entryIndex]!;
          if (entryMatchesMerged(entry)) return { kind: 'entry', id: entry.id };
        }
        for (let entryIndex = item.entries.length - 1; entryIndex >= 0; entryIndex--) {
          const entry = item.entries[entryIndex]!;
          if (!entry.parentToolId && !entry.thinking && entry.kind === 'message' && entry.role === 'assistant') {
            return { kind: 'entry', id: entry.id };
          }
        }
      }
    }
    return owner.prompt ? { kind: 'entry', id: owner.prompt.id } : { kind: 'turn', id: owner.key };
  }

  const collapsedSupplementalUser = owner.items.some(
    item =>
      item.type === 'entry' &&
      item.entry.id === latest.id &&
      item.entry.kind === 'message' &&
      item.entry.role === 'user',
  );
  const collapsedProcess =
    owner.items.some(
      item =>
        item.type === 'process-block' &&
        (exactInTurn ? item.entries.some(entry => entry.id === latest.id) : item.entries.some(entryMatchesMerged)),
    ) && !owner.items.some(item => item.type === 'entry' && item.entry.id === latest.id);

  if (collapsedSupplementalUser || collapsedProcess) {
    return { kind: 'turn', id: owner.key };
  }
  return { kind: 'entry', id: latest.id };
}

/** Check both active activity rows and currently valid history cache pages for an unseen row. */
export function findDisplayedUnseenConversation(
  workspaceId: string,
  conversationId: string,
  activityRows: readonly ConversationSummary[],
  cachedPages?: Iterable<{ page?: { conversations: readonly ConversationSummary[] }; version: number | string }>,
  validVersions: ReadonlySet<number | string> = new Set(),
): ConversationSummary | undefined {
  const fromActivity = activityRows.find(row => row.id === conversationId && row.workspaceId === workspaceId);
  if (fromActivity && activityState(fromActivity) === 'unseen') return fromActivity;
  if (cachedPages) {
    for (const entry of cachedPages) {
      if (!validVersions.has(entry.version) || !entry.page) continue;
      const match = entry.page.conversations.find(
        row => row.id === conversationId && row.workspaceId === workspaceId && activityState(row) === 'unseen',
      );
      if (match) return match;
    }
  }
  return fromActivity;
}

/** Called only after the server acknowledges viewing actual message content. */
export async function refreshSeenActivity(
  viewed: ConversationSummary,
  displayed: ConversationSummary | undefined,
  invalidate: () => void,
  refresh: () => Promise<void>,
): Promise<boolean> {
  if (activityState(viewed) !== 'unseen' && (!displayed || activityState(displayed) !== 'unseen')) return false;
  // A pre-acknowledgement observation cannot prove the resulting counts. Do not
  // wait for it or let it overwrite the fresh read triggered by this action.
  invalidate();
  await refresh();
  return true;
}
