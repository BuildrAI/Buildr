import { randomUUID, createHash } from 'node:crypto';
import { hostname } from 'node:os';
import type { ServiceEvent, ConversationView, PushbackEvent, PushbackEventPage, PushbackDeliveryResult, PushbackSettingsInput, PushbackSettingsView } from '../contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { ProgrammaticPushbackStore, type PushbackConfig, type PushbackClaim } from '../persistence/programmatic-pushback-store.ts';
import { pushbackNotifications, type PushbackSnapshot, type PushbackNotification } from '../domain/programmatic-pushback-notifications.ts';

export type PushbackOptions = { root: string; transport?: typeof fetch; now?: () => number; backoffMs?: number[]; checkIntervalMs?: number; concurrency?: number; stalledThresholdMs?: number; retentionMs?: number };
const DEFAULT_BACKOFF = [10000, 30000, 90000, 270000, 810000];
const GLOBAL_MIGRATION_KEY = 'global-webhook';
const HOUR = 3600000, MINUTE = 60000;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const failure = (code: string, message: string, status = 409) => new AgentServiceError(code, message, status);
export function validPushbackTarget(url: string, secret: string): boolean {
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !!secret && !/[^\x21-\x7e]/.test(secret); } catch { return false; }
}
function validUrl(url: string): boolean {
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password; } catch { return false; }
}
function redact<T>(value: T, secret: string, url: string): T {
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== 'string') return item;
    const withoutSecret = secret ? item.split(secret).join('[REDACTED]') : item;
    return url ? withoutSecret.split(url).join('[REDACTED]') : withoutSecret;
  })) as T;
}
const detailUrl = (workspaceId: string, conversationId: string) => `/api/v1/programmatic/workspaces/${workspaceId}/conversations/${conversationId}`;
const eventsUrl = (workspaceId: string) => `/api/v1/programmatic/workspaces/${workspaceId}/events`;

/** Per-credential durable pushback: view diff, sliding-window rate limit with merge, bounded backoff delivery. */
export class ProgrammaticPushback {
  private readonly store: ProgrammaticPushbackStore;
  private readonly transport: typeof fetch;
  private readonly clock: () => number;
  private readonly backoffMs: number[];
  private readonly concurrency: number;
  private readonly stalledThresholdMs: number;
  private readonly retentionMs: number;
  private readonly owner = randomUUID();
  private readonly active = new Set<AbortController>();
  private readonly tests = new Set<AbortController>();
  private readonly deliveries = new Map<string, PushbackDeliveryResult[]>();
  private readonly interval: ReturnType<typeof setInterval>;
  private deliveryTimer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private storageFailed = false;
  constructor(options: PushbackOptions) {
    this.store = new ProgrammaticPushbackStore(options.root);
    this.transport = options.transport ?? fetch;
    this.clock = options.now ?? Date.now;
    this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF;
    this.concurrency = options.concurrency ?? 16;
    this.stalledThresholdMs = options.stalledThresholdMs ?? 300000;
    this.retentionMs = options.retentionMs ?? 7 * 24 * HOUR;
    this.interval = setInterval(() => this.tick(), options.checkIntervalMs ?? 30000); this.interval.unref();
  }
  private machine(): { id: string; name: string } { return { id: this.store.instanceId, name: hostname() }; }
  private recordDelivery(credentialId: string, result: PushbackDeliveryResult): void {
    const list = this.deliveries.get(credentialId) ?? [];
    list.push(result); while (list.length > 20) list.shift();
    this.deliveries.set(credentialId, list);
  }
  private snapshot(credentialId: string): { revision: string; state: PushbackSettingsView['state']; config?: PushbackConfig; secret?: string } {
    const config = this.store.getConfig(credentialId);
    if (!config) return { revision: digest(['unconfigured', credentialId]), state: 'unconfigured' };
    const secret = this.store.readSecret(config.secretFilePath);
    const valid = validUrl(config.url) && !!secret && !/[^\x21-\x7e]/.test(secret);
    return { revision: config.revision, state: !valid ? 'invalid' : config.enabled ? 'enabled' : 'disabled', config, ...(secret === undefined ? {} : { secret }) };
  }
  read(credentialId: string): PushbackSettingsView {
    const current = this.snapshot(credentialId);
    const recent = this.deliveries.get(credentialId) ?? [];
    return {
      credentialId, revision: current.revision, state: current.state, url: current.config?.url ?? '', hasSecret: !!current.secret,
      rateLimitHour: current.config?.rateLimitHour ?? 180, rateLimitMinute: current.config?.rateLimitMinute ?? 20,
      ...(recent.length ? { lastDelivery: recent.at(-1)!, recentDeliveries: [...recent] } : {}),
    };
  }
  save(credentialId: string, input: PushbackSettingsInput): PushbackSettingsView {
    const current = this.snapshot(credentialId);
    if (current.revision !== input.expectedRevision) throw failure('agent_pushback_conflict', '回推配置已变化，请重新读取后再操作。');
    const url = input.url;
    const secret = input.secret || current.secret || '';
    if (typeof url !== 'string' || url.length > 8192 || !validUrl(url)) throw failure('agent_pushback_invalid', '请输入有效的 HTTP(S) 地址，地址不能含账号密码。', 400);
    if (input.secret !== undefined && (input.secret.length > 4096 || /[^\x21-\x7e]/.test(input.secret))) throw failure('agent_pushback_invalid', '密钥必须为非空可打印 ASCII。', 400);
    if (input.enabled && !validPushbackTarget(url, secret)) throw failure('agent_pushback_invalid', '启用回推需要有效地址与非空密钥。', 400);
    const rateLimitHour = input.rateLimitHour ?? current.config?.rateLimitHour ?? 180;
    const rateLimitMinute = input.rateLimitMinute ?? current.config?.rateLimitMinute ?? 20;
    if (!Number.isInteger(rateLimitHour) || rateLimitHour < 1 || rateLimitHour > 100000 || !Number.isInteger(rateLimitMinute) || rateLimitMinute < 1 || rateLimitMinute > 10000) throw failure('agent_pushback_invalid', '速率限制必须为正整数。', 400);
    const revision = randomUUID();
    const secretFilePath = input.secret ? this.store.writeSecret(credentialId, secret) : current.config?.secretFilePath ?? this.store.writeSecret(credentialId, secret);
    this.store.putConfig({ credentialId, url, enabled: input.enabled, rateLimitHour, rateLimitMinute, revision, secretFilePath, updatedAt: new Date(this.clock()).toISOString() });
    return this.read(credentialId);
  }
  reveal(credentialId: string, input: { expectedRevision: string }): { secret: string } {
    const current = this.snapshot(credentialId);
    if (current.revision !== input.expectedRevision) throw failure('agent_pushback_conflict', '回推配置已变化，请重新读取后再操作。');
    if (!current.secret) throw failure('agent_pushback_unavailable', '当前没有可查看的有效密钥。');
    return { secret: current.secret };
  }
  async test(credentialId: string, input: { expectedRevision: string }): Promise<PushbackDeliveryResult> {
    const current = this.snapshot(credentialId);
    if (current.revision !== input.expectedRevision) throw failure('agent_pushback_conflict', '回推配置已变化，请重新读取后再操作。');
    if (current.state !== 'enabled' || !current.config || !current.secret) throw failure('agent_pushback_unavailable', '请先保存并启用有效回推配置。');
    if (this.tests.size) throw failure('agent_pushback_test_busy', '已有测试通知正在发送。');
    const controller = new AbortController(); this.tests.add(controller);
    const timer = setTimeout(() => controller.abort(), 5000); timer.unref();
    let success = false, status: number | undefined;
    try {
      const response = await this.transport(current.config.url, { method: 'POST', redirect: 'error', signal: controller.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${current.secret}` }, body: JSON.stringify({ eventId: randomUUID(), type: 'test', occurredAt: new Date(this.clock()).toISOString(), machine: this.machine(), summary: 'Buildr 回推测试通知' }) });
      success = response.ok; status = response.status; await response.body?.cancel();
    } catch { /* A failed or uncertain test is never retried; network details stay private. */ }
    finally { clearTimeout(timer); this.tests.delete(controller); }
    const result: PushbackDeliveryResult = { at: new Date(this.clock()).toISOString(), success, kind: 'test', ...(status === undefined ? {} : { status }) };
    if (!this.closed) this.recordDelivery(credentialId, result);
    return result;
  }
  markTakeover(workspaceId: string, conversationId: string, credentialId: string): void {
    this.store.markTakeover(workspaceId, conversationId, credentialId, new Date(this.clock()).toISOString());
  }
  recordStop(workspaceId: string, conversationId: string, runId: string, credentialId: string): void {
    this.store.recordStop(workspaceId, conversationId, runId, credentialId);
  }
  listEvents(credentialId: string, workspaceId: string, input: { after?: string; limit?: number }): PushbackEventPage {
    const limit = Math.max(1, Math.min(Number.isFinite(input.limit) ? Math.trunc(input.limit!) : 50, 200));
    if (input.after !== undefined && (!/^\d+$/.test(input.after) || !Number.isSafeInteger(Number(input.after)))) throw failure('programmatic_input_invalid', 'after 必须为上一页返回的 nextCursor。', 400);
    const after = input.after === undefined ? 0 : Number(input.after);
    return this.store.listEvents(credentialId, workspaceId, after, limit);
  }
  migrateGlobal(credentialId: string, input: { url: string; secret: string }): { migrated: boolean } {
    if (this.store.migration(GLOBAL_MIGRATION_KEY)) return { migrated: false };
    if (!this.store.getConfig(credentialId)) {
      const secretFilePath = this.store.writeSecret(credentialId, input.secret);
      this.store.putConfig({ credentialId, url: input.url, enabled: false, rateLimitHour: 180, rateLimitMinute: 20, revision: randomUUID(), secretFilePath, updatedAt: new Date(this.clock()).toISOString() });
    }
    this.store.recordMigration(GLOBAL_MIGRATION_KEY, credentialId, new Date(this.clock()).toISOString());
    return { migrated: true };
  }
  publish(event: Omit<ServiceEvent, 'cursor' | 'generation'>): void {
    if (this.closed || event.type !== 'conversation' || !event.payload.conversation) return;
    try { this.project(event.payload.conversation); this.drain(); }
    catch { this.storageFailure(); }
  }
  private project(view: ConversationView): void {
    const credentials = this.store.takeoversForConversation(view.workspaceId, view.id);
    for (const credentialId of credentials) {
      const config = this.store.getConfig(credentialId);
      if (!config) continue;
      const secret = config.enabled ? this.store.readSecret(config.secretFilePath) : undefined;
      // Delivery needs a usable credential; disabled pushback still records
      // the same takeover events so /events can backfill them.
      if (config.enabled && !secret) continue;
      const prior = this.store.getProjection<PushbackSnapshot>(credentialId, view.workspaceId, view.id);
      const next = pushbackNotifications(view, prior, { now: this.clock(), stoppedByCredential: this.store.stoppedRuns(view.workspaceId, view.id, credentialId), stalledThresholdMs: this.stalledThresholdMs });
      this.store.putProjection(credentialId, view.workspaceId, view.id, next.snapshot);
      for (const notification of next.events) {
        if (config.enabled && secret) this.enqueueNotification(credentialId, config, secret, view, notification);
        else this.persistNotification(credentialId, config, view, notification);
      }
    }
  }
  private enqueueNotification(credentialId: string, config: PushbackConfig, secret: string, view: ConversationView, notification: PushbackNotification): void {
    this.enqueue(credentialId, config, view.workspaceId, view.id, notification.type, notification.dedupKey, secret, config.url, (sequence, eventId, mergedCount) => this.notificationEvent(view, notification, sequence, eventId, mergedCount));
  }
  private notificationEvent(view: ConversationView, notification: PushbackNotification, sequence: number, eventId: string, mergedCount = 1): PushbackEvent {
    const machine = this.machine();
    return {
      eventId, type: notification.type, occurredAt: notification.occurredAt, machine, workspaceId: view.workspaceId, conversationId: view.id, title: view.title,
      ...(notification.runId === undefined ? {} : { runId: notification.runId }), ...(notification.runStatus === undefined ? {} : { runStatus: notification.runStatus }),
      ...(notification.request === undefined ? {} : { request: notification.request }), summary: notification.summary, detailUrl: detailUrl(view.workspaceId, view.id), sequence,
      ...(mergedCount > 1 ? { mergedCount } : {}),
    };
  }
  private persistNotification(credentialId: string, config: PushbackConfig, view: ConversationView, notification: PushbackNotification): void {
    this.persist(credentialId, config, view.workspaceId, view.id, notification.type, notification.dedupKey, (sequence, eventId) => this.notificationEvent(view, notification, sequence, eventId));
  }
  /** Persist a takeover event without entering the delivery/retry queue. */
  private persist(credentialId: string, config: PushbackConfig, workspaceId: string, conversationId: string, type: string, dedupKey: string, build: (sequence: number, eventId: string) => PushbackEvent): void {
    const secret = this.store.readSecret(config.secretFilePath);
    this.store.appendEvent({ credentialId, workspaceId, conversationId, type, dedupKey, held: false, mergeKey: null, now: this.clock(), deliveryState: 'undelivered', build: (sequence, eventId) => redact(build(sequence, eventId), secret ?? '', config.url) });
  }
  private enqueue(credentialId: string, config: PushbackConfig, workspaceId: string, conversationId: string, type: string, dedupKey: string, secret: string, url: string, build: (sequence: number, eventId: string, mergedCount: number) => PushbackEvent): void {
    const safe = (sequence: number, eventId: string, mergedCount: number) => redact(build(sequence, eventId, mergedCount), secret, url);
    this.store.transaction(() => {
      const now = this.clock();
      const within = this.store.countRate(credentialId, now, HOUR) < config.rateLimitHour && this.store.countRate(credentialId, now, MINUTE) < config.rateLimitMinute;
      const base = { credentialId, workspaceId, conversationId, type, dedupKey, now };
      if (within) { this.store.recordRate(credentialId, now); this.store.appendEvent({ ...base, held: false, mergeKey: null, build: (s, e) => safe(s, e, 1) }); }
      else if (type === 'decision.requested') this.store.appendEvent({ ...base, held: true, mergeKey: null, build: (s, e) => safe(s, e, 1) });
      else {
        const held = this.store.findHeld(credentialId, conversationId, type);
        if (held) this.store.mergeHeld(held.sequence, held.mergedCount + 1, (s, e) => safe(s, e, held.mergedCount + 1), held.eventId);
        else this.store.appendEvent({ ...base, held: true, mergeKey: `${conversationId}:${type}`, build: (s, e) => safe(s, e, 1) });
      }
    });
  }
  tick(): void {
    if (this.closed) return;
    try { this.checkStalled(); this.cleanup(); this.drain(); this.storageFailed = false; }
    catch { this.storageFailure(); }
  }
  private checkStalled(): void {
    const now = this.clock();
    for (const projection of this.store.listProjections()) {
      const config = this.store.getConfig(projection.credentialId);
      if (!config) continue;
      const secret = config.enabled ? this.store.readSecret(config.secretFilePath) : undefined;
      if (config.enabled && !secret) continue;
      const snapshot = JSON.parse(projection.snapshot) as PushbackSnapshot;
      let changed = false;
      for (const [runId, state] of Object.entries(snapshot.runs)) {
        if (state.status !== 'unknown' || state.stalled || state.unknownSince === undefined || now - state.unknownSince < this.stalledThresholdMs) continue;
        state.stalled = true; changed = true;
        const machine = this.machine();
        const build = (sequence: number, eventId: string) => ({
          eventId, type: 'run.stalled', occurredAt: new Date(now).toISOString(), machine, workspaceId: projection.workspaceId, conversationId: projection.conversationId, title: snapshot.title,
          runId, runStatus: 'unknown', summary: '执行状态未知已超过 5 分钟', detailUrl: detailUrl(projection.workspaceId, projection.conversationId), sequence,
        }) as PushbackEvent;
        if (config.enabled && secret) this.enqueue(projection.credentialId, config, projection.workspaceId, projection.conversationId, 'run.stalled', digest([runId, 'unknown']), secret, config.url, build);
        else this.persist(projection.credentialId, config, projection.workspaceId, projection.conversationId, 'run.stalled', digest([runId, 'unknown']), build);
      }
      if (changed) this.store.putProjection(projection.credentialId, projection.workspaceId, projection.conversationId, snapshot);
    }
  }
  private cleanup(): void {
    const now = this.clock();
    for (const group of this.store.cleanup(now, this.retentionMs)) {
      const config = this.store.getConfig(group.credentialId);
      if (!config?.enabled) continue;
      const secret = this.store.readSecret(config.secretFilePath);
      if (!secret) continue;
      const machine = this.machine();
      this.enqueue(group.credentialId, config, group.workspaceId, '', 'events_dropped', digest(['dropped', group.workspaceId, now]), secret, config.url, (sequence, eventId) => ({
        eventId, type: 'events_dropped', occurredAt: new Date(now).toISOString(), machine, workspaceId: group.workspaceId, conversationId: '', title: '',
        summary: `${group.dropped} 条事件已超出保留期被丢弃`, detailUrl: eventsUrl(group.workspaceId), sequence, droppedCount: group.dropped,
      }));
    }
  }
  private releaseHeld(): void {
    const now = this.clock();
    for (const config of this.store.listConfigs()) {
      if (!config.enabled) continue;
      for (;;) {
        if (this.store.countRate(config.credentialId, now, HOUR) >= config.rateLimitHour || this.store.countRate(config.credentialId, now, MINUTE) >= config.rateLimitMinute) break;
        const next = this.store.nextHeld(config.credentialId);
        if (!next) break;
        this.store.transaction(() => { this.store.recordRate(config.credentialId, now); this.store.releaseHeld(next.sequence, now); });
      }
    }
  }
  drain(): void {
    if (this.closed) return;
    try {
      this.releaseHeld();
      const now = this.clock();
      const room = this.concurrency - this.active.size;
      if (room > 0) for (const claim of this.store.claimDeliverable(now, this.owner, room)) this.deliver(claim);
      this.storageFailed = false;
      this.scheduleDelivery();
    } catch { this.storageFailure(); }
  }
  private scheduleDelivery(): void {
    if (this.closed) return;
    clearTimeout(this.deliveryTimer);
    const now = this.clock();
    const due = this.store.nextDeliveryTime(now);
    const delay = due === undefined ? 30000 : this.active.size >= this.concurrency ? 1000 : Math.max(1, Math.min(30000, due - now));
    this.deliveryTimer = setTimeout(() => { this.deliveryTimer = undefined; this.drain(); }, delay); this.deliveryTimer.unref();
  }
  private deliver(claim: PushbackClaim): void {
    const config = this.store.getConfig(claim.credentialId);
    const secret = config ? this.store.readSecret(config.secretFilePath) : undefined;
    if (!config?.enabled || !secret) { this.store.settle(claim.sequence, claim.claim, 'undelivered', this.clock()); return; }
    const controller = new AbortController(); this.active.add(controller);
    const timeout = setTimeout(() => controller.abort(), 5000); timeout.unref();
    void (async () => {
      let success = false, status: number | undefined;
      try {
        const response = await this.transport(config.url, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: claim.body, signal: controller.signal });
        success = response.ok; status = response.status; await response.body?.cancel();
      } catch { /* Retry the same immutable event, including uncertain delivery. */ }
      finally {
        clearTimeout(timeout); this.active.delete(controller);
        if (!this.closed) {
          this.recordDelivery(claim.credentialId, { at: new Date(this.clock()).toISOString(), success, kind: 'event', ...(status === undefined ? {} : { status }) });
          const now = this.clock();
          if (success) this.store.settle(claim.sequence, claim.claim, 'delivered', now);
          else if (claim.attempts <= this.backoffMs.length) this.store.settle(claim.sequence, claim.claim, 'pending', now + this.backoffMs[claim.attempts - 1]!);
          else this.store.settle(claim.sequence, claim.claim, 'undelivered', now);
          this.drain();
        }
      }
    })();
  }
  private storageFailure(): void {
    if (this.closed || this.storageFailed) return;
    this.storageFailed = true;
    console.warn('[agent_pushback_storage_unavailable] 回推存储暂不可用，保留既有记录并等待恢复。');
  }
  close(): void {
    if (this.closed) return; this.closed = true;
    clearInterval(this.interval); clearTimeout(this.deliveryTimer);
    for (const controller of this.active) controller.abort();
    for (const controller of this.tests) controller.abort();
    try { this.store.close(this.owner); } catch { console.warn('[agent_pushback_storage_unavailable] 回推租约未能释放，恢复后按租约期限核对。'); }
  }
}
