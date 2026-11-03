import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { ConversationView, ServiceEvent, WebhookDeliveryResult, WebhookSettingsInput, WebhookSettingsView } from '../contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { ConversationWebhooks } from './conversation-webhooks.ts';
import { WebhookSettings } from './webhook-settings.ts';

/** Stable event sink; retained processes re-read the same private authority before publishing. */
export class WebhookManagement {
  private readonly settings: WebhookSettings;
  private delivery?: ConversationWebhooks;
  private revision?: string;
  private lastDelivery?: WebhookDeliveryResult;
  private readonly timer: ReturnType<typeof setInterval>;
  private closed = false;
  private readonly tests = new Set<AbortController>();
  private readonly root: string;
  private readonly recoveryPage: (after?: string) => ConversationView[];
  private readonly transport: typeof fetch;
  constructor(environment: NodeJS.ProcessEnv, root: string, recoveryPage: (after?: string) => ConversationView[], transport: typeof fetch = fetch) {
    this.root = root; this.recoveryPage = recoveryPage; this.transport = transport;
    this.settings = new WebhookSettings(environment);
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 1000); this.timer.unref();
  }
  private refresh(): void {
    if (this.closed) return;
    const current = this.settings.snapshot();
    if (this.revision === current.revision) return;
    this.delivery?.close(); this.delivery = undefined;
    for (const test of this.tests) test.abort();
    this.revision = current.revision; this.lastDelivery = undefined;
    if (current.state !== 'enabled' || !current.config) return;
    const revision = current.revision;
    this.delivery = ConversationWebhooks.configure({ BUILDR_AGENT_WEBHOOK_URL: current.config.url, BUILDR_AGENT_WEBHOOK_SECRET: current.config.secret }, this.transport, { root: this.root, onDelivery: result => { if (this.revision === revision && !this.closed) this.lastDelivery = result; } });
    const delivery = this.delivery;
    if (delivery) setImmediate(() => { if (!this.closed && this.delivery === delivery) void delivery.recover(this.recoveryPage).catch(() => {}); });
  }
  read(): WebhookSettingsView {
    this.refresh();
    const view = this.settings.view();
    return { ...view, state: view.state === 'enabled' && !this.delivery ? 'invalid' : view.state, ...(this.lastDelivery ? { lastDelivery: this.lastDelivery } : {}) };
  }
  save(input: WebhookSettingsInput): WebhookSettingsView { this.settings.save(input); this.refresh(); return this.read(); }
  reveal(input: { expectedRevision: string }): { secret: string } { return this.settings.reveal(input); }
  async test(input: { expectedRevision: string }): Promise<WebhookDeliveryResult> {
    this.refresh();
    const current = this.settings.current(input.expectedRevision);
    if (current.state !== 'enabled' || !current.config || !this.delivery) throw new AgentServiceError('agent_webhook_unavailable', '请先保存并启用有效通知配置。', 409);
    if (this.tests.size) throw new AgentServiceError('agent_webhook_test_busy', '已有测试通知正在发送。', 409);
    const controller = new AbortController(); this.tests.add(controller);
    const timer = setTimeout(() => controller.abort(), 5000); timer.unref();
    let success = false, status: number | undefined;
    try {
      const response = await this.transport(current.config.url, { method: 'POST', redirect: 'error', signal: controller.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${current.config.secret}` }, body: JSON.stringify({ eventId: randomUUID(), eventType: 'test', agent: { name: 'Buildr', id: this.delivery.agentId }, machine: hostname(), summary: 'Buildr Webhook 测试通知', timestamp: new Date().toISOString() }) });
      success = response.ok; status = response.status; await response.body?.cancel();
    } catch { /* A failed or uncertain test is never retried. Do not expose network details. */ }
    finally { clearTimeout(timer); this.tests.delete(controller); }
    const result: WebhookDeliveryResult = { at: new Date().toISOString(), success, kind: 'test', ...(status === undefined ? {} : { status }) };
    if (!this.closed && this.revision === current.revision) this.lastDelivery = result;
    return result;
  }
  publish(event: Omit<ServiceEvent, 'cursor' | 'generation'>): void { this.refresh(); this.delivery?.publish(event); }
  replay(scope: string, id: string, eventId: string): { eventId: string; queued: true } {
    this.refresh();
    if (!this.delivery) throw new AgentServiceError('agent_webhook_unavailable', '本实例未配置有效通知目标。', 409);
    return this.delivery.replay(scope, id, eventId);
  }
  close(): void { this.closed = true; clearInterval(this.timer); for (const test of this.tests) test.abort(); this.delivery?.close(); }
}
