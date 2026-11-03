import { createHash, randomUUID } from 'node:crypto';
import type { ServiceEvent, ConversationView } from '../contracts.ts';

type EventType = 'completed' | 'error' | 'pending_question' | 'pending_approval';
const summaries: Record<EventType, string> = {
  completed: '对话执行已完成', error: '对话执行出错',
  pending_question: '对话等待问题回答', pending_approval: '对话等待审批',
};

/** Best-effort, process-local notification. Never log configuration or transport errors. */
export class ConversationWebhooks {
  private readonly seen = new Set<string>();
  private readonly active = new Set<AbortController>();
  private closed = false;
  private readonly generation = randomUUID();
  private sequence = 0;
  private readonly startedAt = new Date().toISOString();
  private readonly conversations = new Map<string, { entries: Map<string, string>; requests: Set<string>; state?: string; runs?: string; runIds?: Set<string> }>();
  private readonly queue: string[] = [];
  private queuedBytes = 0;
  private readonly url: string;
  private readonly secret: string;
  private readonly transport: typeof fetch;
  private readonly sourceUrl: string;
  private constructor(url: string, secret: string, transport: typeof fetch, sourceUrl: string = url) {
    this.url = url; this.sourceUrl = sourceUrl; this.secret = secret; this.transport = transport;
  }

  static configure(environment: NodeJS.ProcessEnv, transport: typeof fetch = fetch): ConversationWebhooks | undefined {
    const url = environment.BUILDR_AGENT_WEBHOOK_URL;
    const secret = environment.BUILDR_AGENT_WEBHOOK_SECRET;
    if (!url || !secret || !secret.trim() || /[^\x21-\x7e]/.test(secret)) return;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return;
      return new ConversationWebhooks(parsed.href, secret, transport, url);
    } catch { return; }
  }

  publish(event: Omit<ServiceEvent, 'cursor' | 'generation'>): void {
    if (this.closed || event.type !== 'conversation') return;
    const view = event.payload.conversation;
    if (!view) return;
    this.processChange(view);
    const notifications: Array<{ type: EventType; identity: string }> = [];
    for (const run of [view.run, ...(view.retainedRuns ?? [])]) {
      if (run?.status === 'completed' || run?.status === 'failed') {
        notifications.push({ type: run.status === 'completed' ? 'completed' : 'error', identity: run.id });
      }
    }
    for (const request of view.requests) {
      notifications.push({ type: request.kind === 'approval' ? 'pending_approval' : 'pending_question', identity: `${request.runId}:${request.id}` });
    }
    for (const notification of notifications) {
      const eventId = createHash('sha256').update(JSON.stringify([view.workspaceId, view.id, notification.type, notification.identity])).digest('hex');
      this.enqueue(eventId, { eventId, conversationId: view.id, workspaceId: view.workspaceId,
        eventType: notification.type, summary: summaries[notification.type], timestamp: view.updatedAt });
    }
  }

  private processChange(view: ConversationView): void {
    const key = JSON.stringify([view.workspaceId, view.id]);
    let prior = this.conversations.get(key);
    const initial = !prior;
    if (!prior) {
      prior = { entries: new Map(), requests: new Set() };
      this.conversations.set(key, prior);
      if (this.conversations.size > 1000) this.conversations.delete(this.conversations.keys().next().value!);
    }
    const entries: Array<Record<string, unknown>> = [];
    for (const entry of view.entries) {
      if (entry.thinking) continue;
      // Keep unsent streaming text out of both the payload and semantic fingerprint.
      const owner = entry.runId ? [view.run, ...(view.retainedRuns ?? [])].find(run => run?.id === entry.runId) : view.run;
      const terminal = owner && ['completed', 'failed', 'stopped'].includes(owner.status);
      if (entry.kind === 'message' && entry.role === 'assistant'
        && !['completed', 'failed'].includes(entry.status ?? '') && !terminal) continue;
      const safe = { id: entry.id, sequence: entry.sequence, kind: entry.kind, role: entry.role,
        runId: entry.runId, participantId: entry.participantId, status: entry.status,
        createdAt: entry.createdAt, ...this.entryContent(entry) };
      const fingerprint = createHash('sha256').update(JSON.stringify(safe)).digest('hex');
      if (prior.entries.get(entry.id) !== fingerprint && (!initial || entry.createdAt >= this.startedAt)) entries.push(safe);
      prior.entries.set(entry.id, fingerprint);
      if (prior.entries.size > 10000) prior.entries.delete(prior.entries.keys().next().value!);
    }
    const requests = view.requests.map(request => ({ id: request.id, runId: request.runId,
      participantId: request.participantId, kind: request.kind, blocking: request.blocking,
      ...(request.kind === 'question' ? { title: this.redact(request.title),
        description: request.description && this.redact(request.description),
        options: request.options, questions: request.questions } : {}) }));
    const currentRequests = new Set(view.requests.map(request => JSON.stringify([request.runId, request.id])));
    const closedRequests = [...prior.requests].filter(id => !currentRequests.has(id)).map(id => {
      const [runId, requestId] = JSON.parse(id) as [string, string];
      return { runId, requestId, status: 'closed' };
    });
    prior.requests = currentRequests;
    const runs = [view.run, ...(view.retainedRuns ?? [])].flatMap(run => run ? [{
      id: run.id, participantId: run.participantId, generation: run.generation, status: run.status,
      executionState: run.executionState, stopRequested: run.stopRequested, accepted: run.accepted,
      resourcesReleased: run.resourcesReleased, interrupted: run.interrupted, canContinue: run.canContinue,
      tools: run.tools?.map(tool => ({ id: tool.id, status: tool.status, canStop: tool.canStop })),
    }] : []);
    const conversation = { title: view.title, hidden: view.hidden, titleState: view.titleState?.status };
    const pendingSend = view.pendingSend ? { id: view.pendingSend.id, revision: view.pendingSend.revision,
      state: view.pendingSend.state, text: view.pendingSend.draft.text } : null;
    const state = JSON.stringify({ conversation, pendingSend, runs, requests });
    const runState = JSON.stringify(runs);
    const changedRuns = prior.runs !== undefined && prior.runs !== runState;
    const started = prior.runIds !== undefined && runs.some(run => !prior.runIds!.has(run.id)
      && !['completed', 'failed', 'stopped'].includes(run.status));
    const meaningful = prior.state !== state || entries.length > 0 || closedRequests.length > 0;
    prior.state = state; prior.runs = runState; prior.runIds = new Set(runs.map(run => run.id));
    if (!meaningful) return;
    const sequence = ++this.sequence;
    const eventId = createHash('sha256').update(JSON.stringify([this.generation, key, sequence])).digest('hex');
    const base = { conversationId: view.id, workspaceId: view.workspaceId, timestamp: view.updatedAt,
      revision: view.revision, generation: this.generation, sequence };
    this.enqueue(eventId, { ...base, eventId, eventType: 'conversation_updated', summary: '对话过程已更新',
      conversation, pendingSend, runs, requests, closedRequests, entries });
    const classified = (eventType: string, content: Record<string, unknown>) => {
      const id = createHash('sha256').update(JSON.stringify([eventId, eventType])).digest('hex');
      this.enqueue(id, { ...base, eventId: id, eventType, ...content });
    };
    if (started) classified('task_started', { runs });
    const tools = entries.filter(entry => entry.kind === 'tool');
    if (changedRuns || tools.length) classified('status_changed', { runs, ...(tools.length ? { tools } : {}) });
    const replies = entries.filter(entry => entry.kind === 'message' && entry.role === 'assistant');
    if (replies.length) classified('reply', { entries: replies });
  }

  private entryContent(entry: ConversationView['entries'][number]): Record<string, unknown> {
    if (entry.kind === 'message') return { text: this.redact(entry.text) };
    // Formal answers are user notices, not ordinary messages. Export the answer,
    // never the embedded approval command/title copied by the local audit record.
    if (entry.kind === 'notice' && entry.role === 'user' && entry.id.startsWith('reply-')) {
      try {
        const reply = JSON.parse(entry.text);
        if (reply && typeof reply === 'object' && typeof reply['请求标识'] === 'string') {
          return { requestId: reply['请求标识'], answer: reply['回答'] };
        }
      } catch { /* Unknown notice format remains metadata-only. */ }
    }
    return {};
  }

  private redact(value: string): string {
    return value.split(this.secret).join('[REDACTED]').split(this.url).join('[REDACTED]').split(this.sourceUrl).join('[REDACTED]');
  }

  private enqueue(eventId: string, value: unknown): void {
    if (this.seen.has(eventId)) return;
    this.seen.add(eventId);
    if (this.seen.size > 10000) this.seen.delete(this.seen.values().next().value!);
    if (this.queue.length >= 512) return;
    // Recursive string sanitization also covers question labels/options and object identities.
    const body = JSON.stringify(value, (_key, item: unknown) => typeof item === 'string' ? this.redact(item) : item);
    if (this.queuedBytes + Buffer.byteLength(body) > 16 * 1024 * 1024) return;
    this.queuedBytes += Buffer.byteLength(body);
    this.queue.push(body);
    this.drain();
  }

  private drain(): void {
    while (!this.closed && this.active.size < 16 && this.queue.length) {
      const body = this.queue.shift()!;
      this.queuedBytes -= Buffer.byteLength(body);
      const controller = new AbortController();
      this.active.add(controller);
      const timer = setTimeout(() => controller.abort(), 5000);
      timer.unref();
      void (async () => {
        try {
          const response = await this.transport(this.url, { method: 'POST', redirect: 'error',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${this.secret}` },
            body, signal: controller.signal });
          await response.body?.cancel();
        } catch { /* Best effort: never log sensitive errors or retry unknown delivery. */ }
        finally { clearTimeout(timer); this.active.delete(controller); this.drain(); }
      })();
    }
  }

  close(): void {
    this.closed = true;
    this.queue.length = 0;
    this.queuedBytes = 0;
    this.conversations.clear();
    for (const controller of this.active) controller.abort();
  }
}
