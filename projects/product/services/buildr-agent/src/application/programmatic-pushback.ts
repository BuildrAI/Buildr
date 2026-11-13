import { randomUUID, createHash } from 'node:crypto';
import { hostname } from 'node:os';
import type { ServiceEvent, ConversationView, RunView, PushbackCredentialAccess, PushbackEvent, PushbackEventPage, PushbackDeliveryResult, PushbackSettingsInput, PushbackSettingsView } from '../contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { ProgrammaticPushbackStore, type PushbackConfig, type PushbackClaim } from '../persistence/programmatic-pushback-store.ts';
import { pushbackNotifications, timedPushbackNotifications, isLiveRunStatus, type PushbackSnapshot, type PushbackNotification } from '../domain/programmatic-pushback-notifications.ts';

export type PushbackOptions = { root: string; transport?: typeof fetch; now?: () => number; backoffMs?: number[]; checkIntervalMs?: number; concurrency?: number; stalledThresholdMs?: number; progressIntervalMs?: number; retentionMs?: number; readRunLiveness?: (workspaceId: string, conversationId: string) => { runs: RunView[] } | undefined };
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
const finalReplyUrl = (workspaceId: string, conversationId: string, runId: string) => `${detailUrl(workspaceId, conversationId)}/runs/${runId}/final-reply`;
const eventsUrl = (workspaceId: string) => `/api/v1/programmatic/workspaces/${workspaceId}/events`;
const emptyAccess: PushbackCredentialAccess = { scopes: [], allowFullAccess: false };

/** Per-credential durable pushback: view diff, sliding-window rate limit with merge, bounded backoff delivery. */
export class ProgrammaticPushback {
  private readonly store: ProgrammaticPushbackStore;
  private readonly transport: typeof fetch;
  private readonly clock: () => number;
  private readonly backoffMs: number[];
  private readonly concurrency: number;
  private readonly stalledThresholdMs: number;
  private readonly progressIntervalMs: number;
  private readonly retentionMs: number;
  private readonly readRunLiveness?: (workspaceId: string, conversationId: string) => { runs: RunView[] } | undefined;
  private readonly owner = randomUUID();
  private readonly active = new Set<AbortController>();
  private readonly tests = new Set<AbortController>();
  private readonly deliveries = new Map<string, PushbackDeliveryResult[]>();
  private readonly interval: ReturnType<typeof setInterval>;
  private deliveryTimer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private storageFailed = false;
  private repaired = false;
  constructor(options: PushbackOptions) {
    this.store = new ProgrammaticPushbackStore(options.root);
    this.transport = options.transport ?? fetch;
    this.clock = options.now ?? Date.now;
    this.backoffMs = options.backoffMs ?? DEFAULT_BACKOFF;
    this.concurrency = options.concurrency ?? 16;
    this.stalledThresholdMs = options.stalledThresholdMs ?? 20 * MINUTE;
    this.progressIntervalMs = options.progressIntervalMs ?? 5 * MINUTE;
    this.retentionMs = options.retentionMs ?? 7 * 24 * HOUR;
    this.readRunLiveness = options.readRunLiveness;
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
      progressEnabled: current.config?.progressEnabled !== false, stalledEnabled: current.config?.stalledEnabled !== false,
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
    const progressEnabled = input.progressEnabled ?? current.config?.progressEnabled ?? true;
    const stalledEnabled = input.stalledEnabled ?? current.config?.stalledEnabled ?? true;
    if (!Number.isInteger(rateLimitHour) || rateLimitHour < 1 || rateLimitHour > 100000 || !Number.isInteger(rateLimitMinute) || rateLimitMinute < 1 || rateLimitMinute > 10000) throw failure('agent_pushback_invalid', '速率限制必须为正整数。', 400);
    if (typeof progressEnabled !== 'boolean' || typeof stalledEnabled !== 'boolean') throw failure('agent_pushback_invalid', '回推事件开关必须为布尔值。', 400);
    const revision = randomUUID();
    const secretFilePath = input.secret ? this.store.writeSecret(credentialId, secret) : current.config?.secretFilePath ?? this.store.writeSecret(credentialId, secret);
    this.store.putConfig({ credentialId, url, enabled: input.enabled, rateLimitHour, rateLimitMinute, progressEnabled, stalledEnabled, revision, secretFilePath, updatedAt: new Date(this.clock()).toISOString() });
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
      const access = this.store.getCredentialAccess(credentialId) ?? emptyAccess;
      const response = await this.transport(current.config.url, { method: 'POST', redirect: 'error', signal: controller.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${current.secret}` }, body: JSON.stringify({ eventId: randomUUID(), type: 'test', occurredAt: new Date(this.clock()).toISOString(), machine: this.machine(), scopes: access.scopes, allowFullAccess: access.allowFullAccess, summary: 'Buildr 回推测试通知' }) });
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
  setCredentialAccess(credentialId: string, access: PushbackCredentialAccess): void {
    if (typeof credentialId !== 'string' || !credentialId || !access || !Array.isArray(access.scopes) ||
      access.scopes.some(scope => typeof scope !== 'string') || typeof access.allowFullAccess !== 'boolean') {
      throw failure('agent_pushback_invalid', '凭据权限快照无效。', 400);
    }
    this.store.putCredentialAccess(credentialId, { scopes: [...new Set(access.scopes)], allowFullAccess: access.allowFullAccess });
  }
  recordStop(workspaceId: string, conversationId: string, runId: string, credentialId: string): void {
    this.store.recordStop(workspaceId, conversationId, runId, credentialId);
  }
  listEvents(credentialId: string, workspaceId: string, input: { after?: string; limit?: number }): PushbackEventPage {
    const limit = Math.max(1, Math.min(Number.isFinite(input.limit) ? Math.trunc(input.limit!) : 50, 200));
    if (input.after !== undefined && (!/^\d+$/.test(input.after) || !Number.isSafeInteger(Number(input.after)))) throw failure('programmatic_input_invalid', 'after 必须为上一页返回的 nextCursor。', 400);
    const after = input.after === undefined ? 0 : Number(input.after);
    const page = this.store.listEvents(credentialId, workspaceId, after, limit);
    const nextCursor = page.events.length ? String(page.events.at(-1)!.sequence) : input.after ?? null;
    return { events: page.events, nextCursor, hasMore: page.hasMore };
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
      const next = pushbackNotifications(view, prior, {
        now: this.clock(),
        stoppedByCredential: this.store.stoppedRuns(view.workspaceId, view.id, credentialId),
        stalledThresholdMs: this.stalledThresholdMs,
        progressIntervalMs: this.progressIntervalMs,
        progressEnabled: config.progressEnabled !== false,
        stalledEnabled: config.stalledEnabled !== false,
      });
      this.store.putProjection(credentialId, view.workspaceId, view.id, next.snapshot);
      for (const notification of next.events) {
        if (config.enabled && secret) this.enqueueNotification(credentialId, config, secret, view, notification);
        else this.persistNotification(credentialId, config, view, notification);
      }
    }
  }
  private enqueueNotification(credentialId: string, config: PushbackConfig, secret: string, view: ConversationView, notification: PushbackNotification): void {
    this.enqueue(credentialId, config, view.workspaceId, view.id, notification.type, notification.dedupKey, secret, config.url, (sequence, eventId, mergedCount) => this.notificationEvent(credentialId, view, notification, sequence, eventId, mergedCount));
  }
  private notificationEvent(credentialId: string, view: ConversationView, notification: PushbackNotification, sequence: number, eventId: string, mergedCount = 1): PushbackEvent {
    const machine = this.machine();
    const access = this.store.getCredentialAccess(credentialId) ?? emptyAccess;
    return {
      eventId, type: notification.type, occurredAt: notification.occurredAt, machine, workspaceId: view.workspaceId, conversationId: view.id, title: view.title,
      ...(notification.runId === undefined ? {} : { runId: notification.runId }), ...(notification.runStatus === undefined ? {} : { runStatus: notification.runStatus }),
      ...(notification.request === undefined ? {} : { request: notification.request }),
      ...(notification.finalReply === undefined ? {} : { finalReply: notification.finalReply }),
      ...(notification.finalReplyUrl === undefined ? {} : { finalReplyUrl: notification.finalReplyUrl }),
      ...(notification.progress === undefined ? {} : { progress: notification.progress }),
      ...(notification.stalled === undefined ? {} : { stalled: notification.stalled }),
      scopes: access.scopes, allowFullAccess: access.allowFullAccess,
      summary: notification.summary, detailUrl: detailUrl(view.workspaceId, view.id), sequence,
      ...(mergedCount > 1 ? { mergedCount } : {}),
    };
  }
  private persistNotification(credentialId: string, config: PushbackConfig, view: ConversationView, notification: PushbackNotification): void {
    this.persist(credentialId, config, view.workspaceId, view.id, notification.type, notification.dedupKey, (sequence, eventId) => this.notificationEvent(credentialId, view, notification, sequence, eventId));
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
      if (within) {
        const appended = this.store.appendEvent({ ...base, held: false, mergeKey: null, build: (s, e) => safe(s, e, 1) });
        if (appended) this.store.recordRate(credentialId, now);
      }
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
    try { this.checkTimedEvents(); this.cleanup(); this.drain(); this.storageFailed = false; }
    catch { this.storageFailure(); }
  }
  /**
   * Stored event bodies are immutable history: readers may already have seen
   * them through /events, so a newer build must never backfill fields or
   * rewrite payloads. Only queued events whose shape was retired (empty
   * progress, unknown-status stalls) are withheld from delivery. Retiring
   * changes delivery state only; the body stays exactly as stored.
   */
  private validateQueuedEvents(): void {
    for (const row of this.store.listPendingEvents()) {
      let body: PushbackEvent;
      try { body = JSON.parse(row.body) as PushbackEvent; } catch { continue; }
      if (!body || typeof body !== 'object') continue;
      if (body.type === 'run.stalled') {
        // The retired unknown-status five-minute path, a missing payload or a
        // terminal/non-live status must never be delivered.
        if (!body.stalled || !Number.isFinite(body.stalled.idleMs) || typeof body.stalled.lastActivityAt !== 'string' || !isLiveRunStatus(body.runStatus)) {
          this.store.retireEvent(row.sequence);
        }
        continue;
      }
      if (body.type === 'run.progress' &&
        (!body.progress || typeof body.progress.text !== 'string' || body.progress.text.trim() === '')) {
        this.store.retireEvent(row.sequence);
      }
    }
  }
  private checkTimedEvents(): void {
    const now = this.clock();
    for (const projection of this.store.listProjections()) {
      const config = this.store.getConfig(projection.credentialId);
      if (!config) continue;
      const secret = config.enabled ? this.store.readSecret(config.secretFilePath) : undefined;
      if (config.enabled && !secret) continue;
      // Periodic events are only trustworthy when the current conversation
      // still contains the run and confirms a live status. Without that fact
      // (unreadable conversation, retired run, terminal run) never emit.
      let liveness: { runs: RunView[] } | undefined;
      try { liveness = this.readRunLiveness?.(projection.workspaceId, projection.conversationId); } catch { liveness = undefined; }
      if (!liveness) continue;
      const snapshot = JSON.parse(projection.snapshot) as PushbackSnapshot;
      const next = timedPushbackNotifications(snapshot, {
        now,
        stalledThresholdMs: this.stalledThresholdMs,
        progressIntervalMs: this.progressIntervalMs,
        progressEnabled: config.progressEnabled !== false,
        stalledEnabled: config.stalledEnabled !== false,
      }, liveness.runs);
      for (const notification of next.events) {
        const build = (sequence: number, eventId: string) => ({
          eventId, type: notification.type, occurredAt: notification.occurredAt, machine: this.machine(),
          workspaceId: projection.workspaceId, conversationId: projection.conversationId, title: snapshot.title ?? '',
          ...(notification.runId === undefined ? {} : { runId: notification.runId }),
          ...(notification.runStatus === undefined ? {} : { runStatus: notification.runStatus }),
          ...(notification.progress === undefined ? {} : { progress: notification.progress }),
          ...(notification.stalled === undefined ? {} : { stalled: notification.stalled }),
          scopes: (this.store.getCredentialAccess(projection.credentialId) ?? emptyAccess).scopes,
          allowFullAccess: (this.store.getCredentialAccess(projection.credentialId) ?? emptyAccess).allowFullAccess,
          summary: notification.summary, detailUrl: detailUrl(projection.workspaceId, projection.conversationId), sequence,
        }) as PushbackEvent;
        if (config.enabled && secret) this.enqueue(projection.credentialId, config, projection.workspaceId, projection.conversationId, notification.type, notification.dedupKey, secret, config.url, build);
        else this.persist(projection.credentialId, config, projection.workspaceId, projection.conversationId, notification.type, notification.dedupKey, build);
      }
      const reconciled = JSON.stringify(next.snapshot);
      if (reconciled !== projection.snapshot) this.store.putProjection(projection.credentialId, projection.workspaceId, projection.conversationId, next.snapshot);
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
      const access = this.store.getCredentialAccess(group.credentialId) ?? emptyAccess;
      this.enqueue(group.credentialId, config, group.workspaceId, '', 'events_dropped', digest(['dropped', group.workspaceId, now]), secret, config.url, (sequence, eventId) => ({
        eventId, type: 'events_dropped', occurredAt: new Date(now).toISOString(), machine, workspaceId: group.workspaceId, conversationId: '', title: '',
        scopes: access.scopes, allowFullAccess: access.allowFullAccess, summary: `${group.dropped} 条事件已超出保留期被丢弃`,
        detailUrl: eventsUrl(group.workspaceId), sequence, droppedCount: group.dropped,
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
      // Withhold retired event shapes before the first claim without ever
      // rewriting the stored bodies that /events may already have returned.
      if (!this.repaired) { this.validateQueuedEvents(); this.repaired = true; }
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
