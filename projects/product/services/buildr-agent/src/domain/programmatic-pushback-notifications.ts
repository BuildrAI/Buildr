import { createHash } from 'node:crypto';
import type { ConversationView, PushbackEventType, PushbackRequest, RunStatus, RunView } from '../contracts.ts';

export type PushbackRunState = { status: RunStatus; unknownSince?: number; stalled?: boolean };
export type PushbackSnapshot = { title: string; runs: Record<string, PushbackRunState>; requests: Record<string, string> };
export type PushbackNotification = { type: PushbackEventType; runId?: string; runStatus?: RunStatus; request?: PushbackRequest; summary: string; occurredAt: string; dedupKey: string };
export type PushbackContext = { now: number; stoppedByCredential: Set<string>; stalledThresholdMs: number };
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const SUMMARY_LIMIT = 500;

function finalReply(view: ConversationView, runId: string): string {
  const replies = view.entries.filter(entry => entry.kind === 'message' && entry.role === 'assistant' && !entry.thinking && !entry.parentToolId && entry.status !== 'failed' && (entry.runId ? entry.runId === runId : true));
  const text = replies.at(-1)?.text?.trim();
  return text ? text.slice(0, SUMMARY_LIMIT) : '对话执行已完成';
}
function requestOptions(request: ConversationView['requests'][number]): PushbackRequest['options'] {
  const options = request.options ?? request.questions?.[0]?.options;
  return options?.map(option => ({ id: option.id, label: option.label, ...(option.description === undefined ? {} : { description: option.description }) }));
}

/** Pure view diff: only the five pushback events, never process fragments, streaming or title generation. */
export function pushbackNotifications(view: ConversationView, prior: PushbackSnapshot | undefined, context: PushbackContext): { snapshot: PushbackSnapshot; events: PushbackNotification[] } {
  const snapshot: PushbackSnapshot = { title: view.title, runs: { ...prior?.runs }, requests: { ...prior?.requests } };
  const events: PushbackNotification[] = [];
  const occurredAt = view.updatedAt;
  const emit = (type: PushbackEventType, dedupKey: string, fields: Omit<PushbackNotification, 'type' | 'dedupKey' | 'occurredAt'>) => events.push({ type, dedupKey, occurredAt, ...fields });
  const runs = [view.run, ...(view.retainedRuns ?? [])].filter((run): run is RunView => Boolean(run));
  for (const run of runs) {
    const previous = prior?.runs[run.id];
    const state: PushbackRunState = { status: run.status, ...(previous?.stalled ? { stalled: true } : {}) };
    if (run.status !== previous?.status) {
      if (run.status === 'completed') emit('run.completed', digest([run.id, 'completed']), { runId: run.id, runStatus: run.status, summary: finalReply(view, run.id) });
      else if (run.status === 'failed') emit('run.failed', digest([run.id, 'failed']), { runId: run.id, runStatus: run.status, summary: (run.diagnostic ?? '对话执行出错').slice(0, SUMMARY_LIMIT) });
      else if (run.status === 'stopped' && !context.stoppedByCredential.has(run.id)) emit('run.stopped', digest([run.id, 'stopped']), { runId: run.id, runStatus: run.status, summary: '对话执行已停止' });
    }
    if (run.fault && !state.stalled) { state.stalled = true; emit('run.stalled', digest([run.id, 'fault']), { runId: run.id, runStatus: run.status, summary: '执行出现障碍，状态待核对' }); }
    if (run.status === 'unknown') {
      state.unknownSince = previous?.unknownSince ?? context.now;
      if (!state.stalled && context.now - state.unknownSince >= context.stalledThresholdMs) { state.stalled = true; emit('run.stalled', digest([run.id, 'unknown']), { runId: run.id, runStatus: run.status, summary: '执行状态未知已超过 5 分钟' }); }
    }
    snapshot.runs[run.id] = state;
  }
  for (const request of view.requests) {
    const key = JSON.stringify([request.runId, request.id]);
    const signature = digest({ id: request.id, kind: request.kind, title: request.title, options: request.options, questions: request.questions });
    if (prior?.requests[key] !== signature) {
      const options = requestOptions(request);
      emit('decision.requested', digest([key, signature]), { runId: request.runId, runStatus: runs.find(run => run.id === request.runId)?.status, request: { requestId: request.id, kind: request.kind, title: request.title, ...(options ? { options } : {}) }, summary: request.title.slice(0, SUMMARY_LIMIT) || '对话等待决策' });
    }
    snapshot.requests[key] = signature;
  }
  return { snapshot, events };
}