import { createHash } from 'node:crypto';
import type { ConversationView, PushbackEventType, PushbackProgress, PushbackRequest, PushbackStall, RunStatus, RunView } from '../contracts.ts';
import { finalReplyForRun } from './conversation-activity.ts';

export type PushbackRunState = {
  status: RunStatus;
  stalled?: boolean;
  /**
   * Epoch milliseconds of the last observed record. A snapshot written by an
   * older build may have no usable value; timing events must then stay off
   * instead of interpreting the absence as 1970-01-01.
   */
  lastActivityAt?: number;
  activitySignature: string;
  completedToolCount: number;
  startedAt: string;
  progressSignature?: string;
  lastProgressAt?: number;
  pendingProgress?: { text: string; messageSignature: string };
  /** Last terminal reply kept for delivery-time repair of an event enqueued by an older build. */
  finalReply?: string;
};
export type PushbackSnapshot = {
  title: string;
  workspaceId?: string;
  conversationId?: string;
  runs: Record<string, PushbackRunState>;
  requests: Record<string, string>;
};
export type PushbackNotification = {
  type: PushbackEventType;
  runId?: string;
  runStatus?: RunStatus;
  request?: PushbackRequest;
  finalReply?: string;
  finalReplyUrl?: string;
  progress?: PushbackProgress;
  stalled?: PushbackStall;
  summary: string;
  occurredAt: string;
  dedupKey: string;
};
export type PushbackContext = {
  now: number;
  stoppedByCredential: Set<string>;
  stalledThresholdMs: number;
  progressIntervalMs: number;
  progressEnabled: boolean;
  stalledEnabled: boolean;
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const SUMMARY_LIMIT = 500;
const RUNNING = new Set<RunStatus>(['starting', 'running', 'tools-active']);
const TERMINAL = new Set<RunStatus>(['completed', 'failed', 'stopped']);

/** Stalls are reserved for executions that can still produce records. */
export const isLiveRunStatus = (status: RunStatus | undefined): boolean => status !== undefined && RUNNING.has(status);

const detailUrl = (workspaceId: string, conversationId: string) => `/api/v1/programmatic/workspaces/${workspaceId}/conversations/${conversationId}`;
const finalReplyUrl = (workspaceId: string, conversationId: string, runId: string) =>
  `${detailUrl(workspaceId, conversationId)}/runs/${runId}/final-reply`;

function runEntries(view: ConversationView, run: RunView) {
  return view.entries.filter(entry => entry.runId ? entry.runId === run.id : entry.createdAt >= run.startedAt);
}
function activitySignature(view: ConversationView, run: RunView): string {
  return digest({
    status: run.status,
    tools: run.tools.map(tool => [tool.id, tool.status]),
    entries: runEntries(view, run).map(entry => [
      entry.id, entry.sequence, entry.kind, entry.role, entry.text, entry.parentToolId, entry.status, entry.createdAt,
    ]),
  });
}
function progressEntry(view: ConversationView, run: RunView) {
  return runEntries(view, run)
    // A native entry can appear before its text arrives. Empty text is not
    // progress and must not consume the throttle window.
    .filter(entry => entry.kind === 'message' && entry.role === 'assistant' && !entry.thinking && !entry.parentToolId && entry.status !== 'failed' && entry.text.trim() !== '')
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1);
}
function elapsedMs(run: RunView | undefined, startedAt: string, now: number): number {
  const started = Date.parse(run?.startedAt ?? startedAt);
  return Number.isFinite(started) ? Math.max(0, now - started) : 0;
}
function requestPayload(request: ConversationView['requests'][number], conversationRevision: string): PushbackRequest {
  const options = request.options?.map(option => ({
    optionId: option.id,
    label: option.label,
    ...(option.description === undefined ? {} : { description: option.description }),
  }));
  const questions = request.questions?.map(question => ({
    questionId: question.id,
    question: question.label,
    allowOther: question.allowOther === true,
    multiple: question.multiple === true,
    options: (question.options ?? []).map(option => ({
      optionId: option.id,
      label: option.label,
      ...(option.description === undefined ? {} : { description: option.description }),
    })),
  }));
  return {
    requestId: request.id,
    kind: request.kind,
    title: request.title,
    // Always present so receivers need no optional handling; absent card text is the empty string.
    description: request.description ?? '',
    runId: request.runId,
    participantId: request.participantId,
    generation: request.generation,
    conversationRevision,
    ...(options ? { options } : {}),
    ...(questions ? { questions } : {}),
  };
}
function progressPayload(state: PushbackRunState, now: number): PushbackProgress | undefined {
  if (!state.pendingProgress) return undefined;
  return {
    text: state.pendingProgress.text,
    elapsedMs: elapsedMs(undefined, state.startedAt, now),
    completedToolCount: state.completedToolCount,
  };
}
function stalledPayload(lastActivityAt: number, now: number): PushbackStall {
  return { idleMs: Math.max(0, now - lastActivityAt), lastActivityAt: new Date(lastActivityAt).toISOString() };
}
/**
 * Snapshots written by older builds can carry retired fields (for example the
 * removed five-minute unknown-status stall marker). Keep only the current shape.
 * A missing or non-finite lastActivityAt stays missing so a stall can never be
 * derived from an invented epoch timestamp.
 */
function normalizeRunState(state: PushbackRunState): PushbackRunState {
  const { unknownSince: _retiredUnknownSince, ...rest } = state as PushbackRunState & { unknownSince?: unknown };
  return {
    ...rest,
    ...(Number.isFinite(rest.lastActivityAt) ? { lastActivityAt: rest.lastActivityAt } : { lastActivityAt: undefined }),
    // Stalls only exist for live executions. A retired unknown-status marker
    // must never suppress a later, real idle period.
    ...(RUNNING.has(rest.status) ? {} : { stalled: false }),
  };
}
function normalizeSnapshot(snapshot: PushbackSnapshot): PushbackSnapshot {
  return {
    ...snapshot,
    runs: Object.fromEntries(Object.entries(snapshot.runs ?? {}).map(([runId, state]) => [runId, normalizeRunState(state)])),
  };
}
function timedNotifications(
  snapshot: PushbackSnapshot,
  context: Pick<PushbackContext, 'now' | 'stalledThresholdMs' | 'progressIntervalMs' | 'progressEnabled' | 'stalledEnabled'>,
): { snapshot: PushbackSnapshot; events: PushbackNotification[] } {
  snapshot = normalizeSnapshot(snapshot);
  const events: PushbackNotification[] = [];
  const occurredAt = new Date(context.now).toISOString();
  for (const [runId, state] of Object.entries(snapshot.runs)) {
    // A snapshot written before the empty-text guard can still hold an empty
    // pending message; it must never be pushed nor consume the throttle.
    if (state.pendingProgress && state.pendingProgress.text.trim() === '') state.pendingProgress = undefined;
    if (context.progressEnabled && RUNNING.has(state.status) && state.pendingProgress &&
      (state.lastProgressAt === undefined || context.now - state.lastProgressAt >= context.progressIntervalMs)) {
      const progress = progressPayload(state, context.now);
      if (progress) {
        events.push({
          type: 'run.progress', runId, runStatus: state.status, progress, occurredAt,
          // Stable per message so two processes sharing the store cannot push
          // the same intermediate message twice.
          dedupKey: digest([runId, 'progress', state.pendingProgress.messageSignature]),
          summary: progress.text.slice(0, SUMMARY_LIMIT) || '执行仍在进行',
        });
        state.lastProgressAt = context.now;
        state.pendingProgress = undefined;
      }
    }
    if (context.stalledEnabled && RUNNING.has(state.status) && !state.stalled && Number.isFinite(state.lastActivityAt) &&
      context.now - state.lastActivityAt! >= context.stalledThresholdMs) {
      const stalled = stalledPayload(state.lastActivityAt!, context.now);
      events.push({
        type: 'run.stalled', runId, runStatus: state.status, stalled, occurredAt,
        dedupKey: digest([runId, 'stalled', state.lastActivityAt!]),
        summary: `执行已连续 ${Math.floor(stalled.idleMs / 60000)} 分钟没有新记录`,
      });
      state.stalled = true;
    }
  }
  return { snapshot, events };
}

/**
 * Reconcile persisted timers with the current conversation facts before any
 * periodic event. Runs that no longer exist in the conversation are removed
 * instead of being reported with their stale status, and live runs adopt the
 * current status and newest real activity time.
 */
function reconcileTimedRuns(snapshot: PushbackSnapshot, runs: RunView[]): void {
  const present = new Map(runs.map(run => [run.id, run]));
  for (const [runId, state] of Object.entries(snapshot.runs)) {
    const run = present.get(runId);
    if (!run) { delete snapshot.runs[runId]; continue; }
    state.status = run.status;
    state.startedAt = run.startedAt;
    state.completedToolCount = run.tools.filter(tool => tool.status === 'completed').length;
    const observed = Date.parse(run.updatedAt);
    // Only advance a real timestamp. A missing value stays missing so an
    // incomplete snapshot can never be turned into an epoch-based stall.
    if (Number.isFinite(observed) && Number.isFinite(state.lastActivityAt) && observed > state.lastActivityAt!) {
      state.lastActivityAt = observed;
      state.stalled = false;
    }
    if (!RUNNING.has(run.status)) {
      delete state.pendingProgress;
      state.stalled = false;
    }
  }
}

/** Pure view diff for durable pushback events. Intermediate assistant messages are throttled per run. */
export function pushbackNotifications(view: ConversationView, prior: PushbackSnapshot | undefined, context: PushbackContext): { snapshot: PushbackSnapshot; events: PushbackNotification[] } {
  const previousRuns = prior ? normalizeSnapshot(prior).runs : undefined;
  const snapshot: PushbackSnapshot = {
    title: view.title,
    workspaceId: view.workspaceId,
    conversationId: view.id,
    runs: { ...previousRuns },
    requests: { ...prior?.requests },
  };
  const runs = [view.run, ...(view.retainedRuns ?? [])].filter((run): run is RunView => Boolean(run));
  // Runs absent from the current conversation can never become active again;
  // keeping them in the projection is what let retired executions be timed.
  const present = new Set(runs.map(run => run.id));
  for (const runId of Object.keys(snapshot.runs)) if (!present.has(runId)) delete snapshot.runs[runId];
  const events: PushbackNotification[] = [];
  const emit = (type: PushbackEventType, dedupKey: string, fields: Omit<PushbackNotification, 'type' | 'dedupKey' | 'occurredAt'>) =>
    events.push({ type, dedupKey, occurredAt: view.updatedAt, ...fields });
  for (const run of runs) {
    const previous = previousRuns?.[run.id];
    const signature = activitySignature(view, run);
    const latest = progressEntry(view, run);
    const completedToolCount = run.tools.filter(tool => tool.status === 'completed').length;
    const state: PushbackRunState = previous ? {
      ...previous,
      status: run.status,
      startedAt: run.startedAt,
      activitySignature: signature,
      completedToolCount,
      ...(signature !== previous.activitySignature ? { lastActivityAt: context.now, stalled: false } : {}),
    } : {
      status: run.status,
      lastActivityAt: context.now,
      activitySignature: signature,
      completedToolCount,
      startedAt: run.startedAt,
      ...(latest ? { progressSignature: digest([latest.id, latest.text]) } : {}),
    };

    if (run.status !== previous?.status) {
      if (run.status === 'completed') {
        const finalReply = finalReplyForRun(view, run.id, run.startedAt);
        state.finalReply = finalReply;
        emit('run.completed', digest([run.id, 'completed']), {
          runId: run.id, runStatus: run.status, summary: (finalReply || '对话执行已完成').slice(0, SUMMARY_LIMIT),
          finalReply, finalReplyUrl: finalReplyUrl(view.workspaceId, view.id, run.id),
        });
      } else if (run.status === 'failed') {
        const finalReply = finalReplyForRun(view, run.id, run.startedAt);
        state.finalReply = finalReply;
        emit('run.failed', digest([run.id, 'failed']), {
          runId: run.id, runStatus: run.status, summary: (run.diagnostic ?? '对话执行出错').slice(0, SUMMARY_LIMIT),
          finalReply, finalReplyUrl: finalReplyUrl(view.workspaceId, view.id, run.id),
        });
      } else if (run.status === 'stopped' && !context.stoppedByCredential.has(run.id)) {
        const finalReply = finalReplyForRun(view, run.id, run.startedAt);
        state.finalReply = finalReply;
        emit('run.stopped', digest([run.id, 'stopped']), {
          runId: run.id, runStatus: run.status, summary: '对话执行已停止',
          finalReply, finalReplyUrl: finalReplyUrl(view.workspaceId, view.id, run.id),
        });
      }
    }

    if (TERMINAL.has(run.status)) {
      state.pendingProgress = undefined;
      if (latest) state.progressSignature = digest([latest.id, latest.text]);
    } else if (latest && context.progressEnabled && previous) {
      const messageSignature = digest([latest.id, latest.text]);
      state.progressSignature = messageSignature;
      if (messageSignature !== previous.progressSignature) {
        state.pendingProgress = { text: latest.text, messageSignature };
        if (state.lastProgressAt === undefined || context.now - state.lastProgressAt >= context.progressIntervalMs) {
          const progress = progressPayload(state, context.now)!;
          emit('run.progress', digest([run.id, 'progress', messageSignature]), {
            runId: run.id, runStatus: run.status, progress,
            summary: progress.text.slice(0, SUMMARY_LIMIT) || '执行仍在进行',
          });
          state.lastProgressAt = context.now;
          state.pendingProgress = undefined;
        }
      }
    } else if (latest) {
      state.progressSignature = digest([latest.id, latest.text]);
    }
    snapshot.runs[run.id] = state;
  }
  for (const request of view.requests) {
    const key = JSON.stringify([request.runId, request.id]);
    const signature = digest(request);
    if (prior?.requests[key] !== signature) {
      emit('decision.requested', digest([key, signature]), {
        runId: request.runId,
        runStatus: runs.find(run => run.id === request.runId)?.status,
        request: requestPayload(request, view.revision),
        summary: request.title.slice(0, SUMMARY_LIMIT) || '对话等待决策',
      });
    }
    snapshot.requests[key] = signature;
  }
  const timed = timedNotifications(snapshot, context);
  return { snapshot: timed.snapshot, events: [...events, ...timed.events] };
}

/**
 * Advance timers without a new conversation publication. When the current runs
 * are supplied, stale projection entries are dropped and live states are
 * refreshed from the conversation fact before progress/stall decisions.
 */
export function timedPushbackNotifications(
  snapshot: PushbackSnapshot,
  context: Pick<PushbackContext, 'now' | 'stalledThresholdMs' | 'progressIntervalMs' | 'progressEnabled' | 'stalledEnabled'>,
  runs?: RunView[],
) {
  const copy = structuredClone(snapshot);
  if (runs) reconcileTimedRuns(copy, runs);
  return timedNotifications(copy, context);
}
