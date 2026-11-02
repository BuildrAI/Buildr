import { createHash } from 'node:crypto';
import type { ServiceEvent } from '../contracts.ts';

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
  private readonly url: string;
  private readonly secret: string;
  private readonly transport: typeof fetch;
  private constructor(url: string, secret: string, transport: typeof fetch) {
    this.url = url; this.secret = secret; this.transport = transport;
  }

  static configure(environment: NodeJS.ProcessEnv, transport: typeof fetch = fetch): ConversationWebhooks | undefined {
    const url = environment.BUILDR_AGENT_WEBHOOK_URL;
    const secret = environment.BUILDR_AGENT_WEBHOOK_SECRET;
    if (!url || !secret || !secret.trim() || /[^\x21-\x7e]/.test(secret)) return;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return;
      return new ConversationWebhooks(parsed.href, secret, transport);
    } catch { return; }
  }

  publish(event: Omit<ServiceEvent, 'cursor' | 'generation'>): void {
    if (this.closed || event.type !== 'conversation') return;
    const view = event.payload.conversation;
    if (!view) return;
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
      if (this.seen.has(eventId)) continue;
      this.seen.add(eventId);
      if (this.seen.size > 10_000) this.seen.delete(this.seen.values().next().value!);
      // Mark even dropped events: backpressure must never turn into delayed repeated attempts.
      if (this.active.size >= 16) continue;
      const controller = new AbortController();
      this.active.add(controller);
      const timer = setTimeout(() => controller.abort(), 5_000);
      timer.unref();
      const body = JSON.stringify({ eventId, conversationId: view.id, workspaceId: view.workspaceId,
        eventType: notification.type, summary: summaries[notification.type], timestamp: view.updatedAt });
      void (async () => {
        try {
          const response = await this.transport(this.url, { method: 'POST', redirect: 'error',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${this.secret}` },
            body, signal: controller.signal });
          await response.body?.cancel();
        } catch { /* Failure, including non-delivery, never changes conversation execution. No retry. */ }
        finally { clearTimeout(timer); this.active.delete(controller); }
      })();
    }
  }

  close(): void {
    this.closed = true;
    for (const controller of this.active) controller.abort();
  }
}
