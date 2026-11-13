import { activityState } from './conversation-activity';
import type { ConversationSummary, ConversationView } from './types';

type Timer = ReturnType<typeof setTimeout>;
const STREAMING_STATUSES = new Set(['starting', 'running', 'stopping']);

export function createStreamingSeenScheduler(options: {
  send: (value: ConversationView) => Promise<void>;
  intervalMs?: number;
  now?: () => number;
  schedule?: (callback: () => void, milliseconds: number) => Timer;
  cancel?: (timer: Timer) => void;
}) {
  const intervalMs = options.intervalMs ?? 1500;
  const now = options.now ?? (() => Date.now());
  const schedule = options.schedule ?? ((callback, ms) => setTimeout(callback, ms));
  const cancel = options.cancel ?? (timer => clearTimeout(timer));
  let timer: Timer | null = null;
  let pendingValue: ConversationView | null = null;
  let lastSentKey: string | null = null;
  let lastSentAt = 0;

  const clearTimer = () => {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  };

  const dispatch = (value: ConversationView): Promise<void> => {
    clearTimer();
    pendingValue = null;
    lastSentAt = now();
    lastSentKey = `${value.workspaceId}:${value.id}`;
    return options.send(value);
  };

  return {
    notify(value: ConversationView): Promise<void> {
      const version = value.activity?.version;
      if (version === undefined || version <= (value.activity?.seenThrough ?? 0)) return Promise.resolve();
      const key = `${value.workspaceId}:${value.id}`;
      if (pendingValue && (`${pendingValue.workspaceId}:${pendingValue.id}` !== key)) {
        void dispatch(pendingValue);
      }
      const status = value.run?.status;
      if (!status || !STREAMING_STATUSES.has(status)) {
        return dispatch(value);
      }
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
            lastSentAt = now();
            lastSentKey = `${next.workspaceId}:${next.id}`;
            void options.send(next);
          }
        }, delay);
      }
      return Promise.resolve();
    },
    flush(): Promise<void> {
      clearTimer();
      const next = pendingValue;
      pendingValue = null;
      if (!next) return Promise.resolve();
      lastSentAt = now();
      lastSentKey = `${next.workspaceId}:${next.id}`;
      return options.send(next);
    },
    dispose(): void {
      clearTimer();
      pendingValue = null;
    },
  };
}

/** Called only after the server acknowledges viewing actual message content. */
export async function refreshSeenActivity(
  viewed: ConversationSummary,
  displayed: ConversationSummary | undefined,
  invalidate: () => void,
  refresh: () => Promise<void>,
): Promise<void> {
  if (activityState(viewed) !== 'unseen' && (!displayed || activityState(displayed) !== 'unseen')) return;
  // A pre-acknowledgement observation cannot prove the resulting counts. Do not
  // wait for it or let it overwrite the fresh read triggered by this action.
  invalidate();
  await refresh();
}
