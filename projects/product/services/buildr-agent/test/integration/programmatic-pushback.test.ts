import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ProgrammaticPushback } from '../../src/application/programmatic-pushback.ts';
import type { ConversationView, RunView } from '../../src/contracts.ts';

const NOW = Date.parse('2026-11-01T00:00:00.000Z');
const SECRET = 'super-secret-token';
const URL = 'https://receiver.test/hook';

function run(id: string, status: RunView['status'], extra: Partial<RunView> = {}): RunView {
  return { id, participantId: 'p', provider: 'local', generation: 'g', status, accepted: true, tools: [], startedAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...extra };
}
function view(overrides: Partial<ConversationView> = {}): ConversationView {
  return { id: 'conversation-one', workspaceId: 'workspace-one', cwd: '/workspace', title: 'work', revision: 'r1', hidden: false, updatedAt: '2026-11-01T00:00:00.000Z', participants: [], requests: [], entries: [], ...overrides } as ConversationView;
}
function conversationEvent(current: ConversationView) {
  return { type: 'conversation' as const, workspaceId: current.workspaceId, conversationId: current.id, revision: current.revision, payload: { conversation: current } };
}
function receiver() {
  const calls: Array<{ url: string; init: any; body: any }> = [];
  let status = 200;
  const transport: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(String(init!.body)) });
    return new Response(null, { status });
  };
  return { calls, transport, fail: () => { status = 500; }, ok: () => { status = 200; } };
}
function setup(options: { backoffMs?: number[]; rateLimitMinute?: number; rateLimitHour?: number; stalledThresholdMs?: number; retentionMs?: number; readConversation?: (workspaceId: string, conversationId: string) => ConversationView | undefined } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-pushback-'));
  const dir = path.join(root, 'pushback');
  const fake = receiver();
  let current = NOW;
  const pb = new ProgrammaticPushback({ root: dir, transport: fake.transport, now: () => current, checkIntervalMs: 3600000, ...(options.backoffMs ? { backoffMs: options.backoffMs } : {}), ...(options.stalledThresholdMs === undefined ? {} : { stalledThresholdMs: options.stalledThresholdMs }), ...(options.retentionMs === undefined ? {} : { retentionMs: options.retentionMs }), ...(options.readConversation ? { readConversation: options.readConversation } : {}) });
  const flush = async () => { for (let i = 0; i < 25; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
  const rows = (sql: string, ...values: any[]) => { const db = new DatabaseSync(path.join(dir, 'pushback.sqlite')); try { return db.prepare(sql).all(...values) as any[]; } finally { db.close(); } };
  const exec = (sql: string, ...values: any[]) => { const db = new DatabaseSync(path.join(dir, 'pushback.sqlite')); try { return db.prepare(sql).run(...values); } finally { db.close(); } };
  const configure = (credentialId = 'cred-one', input: Partial<{ enabled: boolean; url: string; secret: string; rateLimitHour: number; rateLimitMinute: number }> = {}) => {
    const revision = pb.read(credentialId).revision;
    return pb.save(credentialId, { expectedRevision: revision, enabled: input.enabled ?? true, url: input.url ?? URL, secret: input.secret ?? SECRET, ...(input.rateLimitHour === undefined ? {} : { rateLimitHour: input.rateLimitHour }), ...(input.rateLimitMinute === undefined ? {} : { rateLimitMinute: input.rateLimitMinute }) });
  };
  const close = () => { pb.close(); fs.rmSync(root, { recursive: true, force: true }); };
  return { root, dir, pb, fake, flush, rows, exec, configure, advance: (ms: number) => { current += ms; }, now: () => current, close };
}

test('configuration reads never expose the secret; reveal is revision-checked and enable requires a secret', () => {
  const s = setup();
  try {
    const initial = s.pb.read('cred-one');
    assert.equal(initial.state, 'unconfigured');
    assert.equal(initial.hasSecret, false);
    assert.equal(initial.progressEnabled, true);
    assert.equal(initial.stalledEnabled, true);
    assert.equal((initial as any).secret, undefined);
    assert.throws(() => s.pb.save('cred-one', { expectedRevision: initial.revision, enabled: true, url: URL }), { code: 'agent_pushback_invalid' });
    const saved = s.configure();
    assert.equal(saved.state, 'enabled');
    assert.equal(saved.hasSecret, true);
    assert.equal((saved as any).secret, undefined, 'the public view never carries the secret');
    assert.equal(saved.url, URL);
    const tuned = s.pb.save('cred-one', { expectedRevision: saved.revision, enabled: true, url: URL, progressEnabled: false, stalledEnabled: false });
    assert.equal(tuned.progressEnabled, false);
    assert.equal(tuned.stalledEnabled, false);
    assert.throws(() => s.pb.reveal('cred-one', { expectedRevision: 'stale' }), { code: 'agent_pushback_conflict' });
    assert.equal(s.pb.reveal('cred-one', { expectedRevision: tuned.revision }).secret, SECRET);
    const retained = s.pb.save('cred-one', { expectedRevision: tuned.revision, enabled: true, url: URL, secret: '' });
    assert.equal(s.pb.reveal('cred-one', { expectedRevision: retained.revision }).secret, SECRET, 'an empty secret input retains the stored value');
    const disabled = s.pb.save('cred-one', { expectedRevision: retained.revision, enabled: false, url: URL });
    assert.equal(disabled.state, 'disabled');
    assert.equal(disabled.hasSecret, true, 'disabling keeps the configuration');
    assert.throws(() => s.pb.save('cred-one', { expectedRevision: 'stale', enabled: true, url: URL }), { code: 'agent_pushback_conflict' });
  } finally { s.close(); }
});

test('only conversations taken over by an enabled credential produce events', async () => {
  const s = setup();
  try {
    s.configure('cred-one');
    s.configure('cred-two');
    s.pb.setCredentialAccess('cred-one', { scopes: ['read', 'execute'], allowFullAccess: true });
    s.pb.publish(conversationEvent(view({ run: run('run-one', 'completed') })));
    await s.flush();
    assert.equal(s.fake.calls.length, 0, 'without a takeover marker no credential receives events');
    s.pb.markTakeover('workspace-one', 'conversation-one', 'cred-one');
    s.pb.publish(conversationEvent(view({ run: run('run-one', 'completed'), revision: 'r2' })));
    await s.flush();
    assert.equal(s.fake.calls.length, 1);
    assert.equal(s.fake.calls[0]!.url, URL);
    assert.equal(s.fake.calls[0]!.body.type, 'run.completed');
    assert.deepEqual(s.fake.calls[0]!.body.scopes, ['read', 'execute']);
    assert.equal(s.fake.calls[0]!.body.allowFullAccess, true);
    assert.equal(s.fake.calls[0]!.init.headers.authorization, `Bearer ${SECRET}`);
    assert.equal(s.fake.calls[0]!.init.redirect, 'error');
    assert.ok(s.fake.calls[0]!.init.signal, 'delivery is bounded by an abort signal');
    const none = s.pb.listEvents('cred-two', 'workspace-one', {});
    assert.deepEqual(none.events, [], 'a credential without the marker sees nothing');
    assert.equal(none.nextCursor, null);
    assert.equal(none.hasMore, false);
    const one = s.pb.listEvents('cred-one', 'workspace-one', {});
    assert.equal(one.events.length, 1);
    assert.equal(one.nextCursor, '1');
    assert.equal(one.hasMore, false);
  } finally { s.close(); }
});

test('disabled pushback records takeover events for backfill without delivering or retrying them', async () => {
  const s = setup();
  try {
    s.configure('cred-one', { enabled: false });
    s.pb.markTakeover('workspace-one', 'conversation-one', 'cred-one');
    s.pb.publish(conversationEvent(view({ run: run('run-one', 'completed') })));
    await s.flush();
    assert.equal(s.fake.calls.length, 0, 'disabled pushback never calls the receiver');
    assert.deepEqual(s.pb.listEvents('cred-one', 'workspace-one', {}).events.map(event => event.type), ['run.completed']);
    const stored = s.rows('SELECT deliveryState,held FROM events')[0];
    assert.equal(stored.deliveryState, 'undelivered', 'backfill events do not enter the retry queue');
    assert.equal(stored.held, 0);
    s.pb.drain();
    await s.flush();
    assert.equal(s.fake.calls.length, 0);
    s.pb.publish(conversationEvent(view({ run: run('run-one', 'completed'), revision: 'r2' })));
    await s.flush();
    assert.equal(s.pb.listEvents('cred-one', 'workspace-one', {}).events.length, 1, 'the same transition is recorded once');

    s.pb.publish(conversationEvent(view({ run: run('run-two', 'running'), revision: 'r3' })));
    s.advance(1200000);
    s.pb.tick();
    await s.flush();
    assert.ok(s.pb.listEvents('cred-one', 'workspace-one', {}).events.some(event => event.type === 'run.stalled'), 'stalled events are recorded while disabled');
    assert.equal(s.fake.calls.length, 0);
  } finally { s.close(); }
});

test('event bodies and views redact the secret and receiver address', async () => {
  const s = setup();
  try {
    s.configure();
    s.pb.markTakeover('workspace-one', 'conversation-one', 'cred-one');
    s.pb.publish(conversationEvent(view({ title: `work ${SECRET} ${URL}`, run: run('run-one', 'completed') })));
    await s.flush();
    const body = s.fake.calls[0]!.body;
    assert.ok(!JSON.stringify(body).includes(SECRET), 'the secret never leaves in the event');
    assert.ok(!JSON.stringify(body).includes(URL), 'the receiver address never leaves in the event');
    assert.match(body.title, /\[REDACTED\]/);
    const listed = s.pb.listEvents('cred-one', 'workspace-one', {}).events[0]!;
    assert.ok(!JSON.stringify(listed).includes(SECRET));
    assert.ok(!JSON.stringify(s.pb.read('cred-one')).includes(SECRET));
  } finally { s.close(); }
});

test('the test notification is isolated, marked test, never retried and requires an enabled config', async () => {
  const s = setup();
  try {
    await assert.rejects(s.pb.test('cred-one', { expectedRevision: s.pb.read('cred-one').revision }), { code: 'agent_pushback_unavailable' });
    const saved = s.configure();
    s.pb.setCredentialAccess('cred-one', { scopes: ['read', 'execute'], allowFullAccess: false });
    s.fake.fail();
    const result = await s.pb.test('cred-one', { expectedRevision: saved.revision });
    assert.equal(result.success, false);
    assert.equal(result.kind, 'test');
    assert.equal(s.fake.calls.length, 1, 'a failed test is not retried');
    assert.equal(s.fake.calls[0]!.body.type, 'test');
    assert.deepEqual(s.fake.calls[0]!.body.scopes, ['read', 'execute']);
    assert.equal(s.fake.calls[0]!.body.allowFullAccess, false);
    assert.equal(s.fake.calls[0]!.body.summary, 'Buildr 回推测试通知');
    assert.equal(s.fake.calls[0]!.init.redirect, 'error');
    assert.equal(s.pb.read('cred-one').lastDelivery!.kind, 'test');
    assert.deepEqual(s.pb.listEvents('cred-one', 'workspace-one', {}).events, [], 'the test notification is not a business event');
  } finally { s.close(); }
});

test('failure backs off 10/30/90/270/810 seconds then marks the event undelivered after five retries', async () => {
  const s = setup();
  try {
    s.configure();
    s.pb.markTakeover('workspace-one', 'conversation-one', 'cred-one');
    s.fake.fail();
    s.pb.publish(conversationEvent(view({ run: run('run-one', 'completed') })));
    await s.flush();
    const backoff = [10000, 30000, 90000, 270000, 810000];
    let expected = s.now();
    for (let attempt = 1; attempt <= 5; attempt++) {
      const row = s.rows('SELECT attempts,deliveryState,nextAttemptAt FROM events WHERE sequence=1')[0];
      assert.equal(row.attempts, attempt);
      assert.equal(row.deliveryState, 'pending');
      expected += backoff[attempt - 1];
      assert.equal(row.nextAttemptAt, expected, `retry ${attempt} waits ${backoff[attempt - 1]}ms`);
      s.advance(backoff[attempt - 1]);
      s.pb.drain();
      await s.flush();
    }
    const final = s.rows('SELECT attempts,deliveryState FROM events WHERE sequence=1')[0];
    assert.equal(final.attempts, 6);
    assert.equal(final.deliveryState, 'undelivered');
    assert.equal(s.fake.calls.length, 6, 'one initial attempt plus five retries');
    const listed = s.pb.listEvents('cred-one', 'workspace-one', {}).events;
    assert.equal(listed.length, 1, 'undelivered events remain queryable');
  } finally { s.close(); }
});

test('over-limit events merge by conversation and type while decision.requested is held without merging and released first', async () => {
  const s = setup({ rateLimitMinute: 2, rateLimitHour: 1000 });
  try {
    s.configure('cred-one', { rateLimitMinute: 2, rateLimitHour: 1000 });
    s.pb.markTakeover('workspace-one', 'conversation-one', 'cred-one');
    const completed = (id: string, retained: string[]) => view({ run: run(id, 'completed'), retainedRuns: retained.map(other => run(other, 'completed')), revision: id });
    s.pb.publish(conversationEvent(completed('run-one', [])));
    s.pb.publish(conversationEvent(completed('run-two', ['run-one'])));
    s.pb.publish(conversationEvent(completed('run-three', ['run-one', 'run-two'])));
    s.pb.publish(conversationEvent(completed('run-four', ['run-one', 'run-two', 'run-three'])));
    await s.flush();
    assert.equal(s.fake.calls.length, 2, 'only the minute quota is delivered immediately');
    const held = s.rows("SELECT sequence,type,held,mergedCount FROM events WHERE held=1");
    assert.equal(held.length, 1);
    assert.equal(held[0].type, 'run.completed');
    assert.equal(held[0].mergedCount, 2, 'run-three and run-four merge into one held event');
    const request = { id: 'permit-one', kind: 'approval', title: 'Write?', runId: 'run-five', participantId: 'p', generation: 'g', options: [] };
    s.pb.publish(conversationEvent(view({ run: run('run-five', 'waiting-approval'), requests: [request as any], revision: 'decision' })));
    await s.flush();
    const decisions = s.rows("SELECT sequence,type,held,mergedCount FROM events WHERE type='decision.requested'");
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].held, 1);
    assert.equal(decisions[0].mergedCount, 1, 'decision.requested is never merged');
    s.advance(60000);
    s.pb.drain();
    await s.flush();
    assert.equal(s.rows('SELECT sequence FROM events WHERE held=1').length, 0, 'quota recovery releases held events');
    const delivered = s.fake.calls.map(call => call.body.type);
    assert.equal(delivered[2], 'decision.requested', 'the held decision is released before the merged completion');
    assert.equal(delivered[3], 'run.completed');
    const merged = s.fake.calls[3]!.body;
    assert.equal(merged.mergedCount, 2);
  } finally { s.close(); }
});

test('the global sequence stays continuous across a restart', async () => {
  const s = setup();
  try {
    s.configure();
    s.pb.markTakeover('workspace-one', 'conversation-one', 'cred-one');
    s.pb.publish(conversationEvent(view({ run: run('run-one', 'completed') })));
    await s.flush();
    assert.equal(s.pb.listEvents('cred-one', 'workspace-one', {}).events[0]!.sequence, 1);
    s.pb.close();
    const reopened = new ProgrammaticPushback({ root: s.dir, transport: s.fake.transport, now: s.now, checkIntervalMs: 3600000 });
    try {
      reopened.publish(conversationEvent(view({ run: run('run-two', 'completed'), retainedRuns: [run('run-one', 'completed')], revision: 'r2' })));
      await s.flush();
      const events = reopened.listEvents('cred-one', 'workspace-one', {}).events;
      assert.deepEqual(events.map(event => event.sequence), [1, 2]);
      assert.equal(new Set(events.map(event => event.eventId)).size, 2);
    } finally { reopened.close(); }
  } finally { fs.rmSync(s.root, { recursive: true, force: true }); }
});

test('listEvents returns ascending sequences including undelivered events with a bounded cursor', async () => {
  const s = setup({ backoffMs: [1, 2, 3, 4, 5] });
  try {
    s.configure();
    s.pb.markTakeover('workspace-one', 'conversation-one', 'cred-one');
    s.fake.fail();
    for (const id of ['run-one', 'run-two', 'run-three']) {
      s.pb.publish(conversationEvent(view({ run: run(id, 'completed'), revision: id })));
      await s.flush();
    }
    for (let i = 0; i < 8; i++) { s.advance(100); s.pb.drain(); await s.flush(); }
    const all = s.pb.listEvents('cred-one', 'workspace-one', {});
    assert.deepEqual(all.events.map(event => event.sequence), [1, 2, 3]);
    assert.equal(all.nextCursor, '3');
    assert.equal(all.hasMore, false);
    const page = s.pb.listEvents('cred-one', 'workspace-one', { limit: 2 });
    assert.deepEqual(page.events.map(event => event.sequence), [1, 2]);
    assert.equal(page.nextCursor, '2');
    assert.equal(page.hasMore, true);
    const next = s.pb.listEvents('cred-one', 'workspace-one', { after: page.nextCursor!, limit: 2 });
    assert.deepEqual(next.events.map(event => event.sequence), [3]);
    assert.equal(next.nextCursor, '3');
    assert.equal(next.hasMore, false);
    const empty = s.pb.listEvents('cred-one', 'workspace-one', { after: next.nextCursor! });
    assert.deepEqual(empty.events, []);
    assert.equal(empty.nextCursor, '3');
    assert.equal(empty.hasMore, false);
    assert.ok(s.rows('SELECT deliveryState FROM events').every(row => row.deliveryState === 'undelivered'));
  } finally { s.close(); }
});

test('migrateGlobal writes a disabled configuration once and is idempotent', () => {
  const s = setup();
  try {
    const first = s.pb.migrateGlobal('cred-one', { url: URL, secret: SECRET });
    assert.deepEqual(first, { migrated: true });
    const view = s.pb.read('cred-one');
    assert.equal(view.state, 'disabled');
    assert.equal(view.hasSecret, true);
    assert.equal(view.url, URL);
    assert.deepEqual(s.pb.migrateGlobal('cred-one', { url: URL, secret: SECRET }), { migrated: false });
    assert.deepEqual(s.pb.migrateGlobal('cred-two', { url: URL, secret: SECRET }), { migrated: false }, 'the global migration happens once');
  } finally { s.close(); }
});

test('migrateGlobal never overwrites an existing credential configuration', () => {
  const s = setup();
  try {
    const enabled = s.configure('cred-one');
    assert.equal(enabled.state, 'enabled');
    assert.deepEqual(s.pb.migrateGlobal('cred-one', { url: URL, secret: SECRET }), { migrated: true });
    assert.equal(s.pb.read('cred-one').state, 'enabled');
    assert.equal(s.pb.read('cred-one').revision, enabled.revision, 'the existing configuration is preserved');
  } finally { s.close(); }
});

test('the periodic check raises run.stalled after continuous inactivity and cleanup emits events_dropped past retention', async () => {
  const s = setup({ stalledThresholdMs: 300000, retentionMs: 1000 });
  try {
    s.configure();
    s.pb.markTakeover('workspace-one', 'conversation-one', 'cred-one');
    s.pb.publish(conversationEvent(view({ run: run('run-one', 'running') })));
    await s.flush();
    assert.equal(s.fake.calls.length, 0, 'a running execution is not yet stalled');
    s.advance(300000);
    s.pb.tick();
    await s.flush();
    assert.deepEqual(s.fake.calls.map(call => call.body.type), ['run.stalled']);
    s.pb.tick();
    await s.flush();
    assert.equal(s.fake.calls.length, 1, 'a stalled run is not re-announced');
    s.advance(2000);
    s.pb.tick();
    await s.flush();
    const dropped = s.fake.calls.at(-1)!.body;
    assert.equal(dropped.type, 'events_dropped');
    assert.ok(dropped.droppedCount >= 1);
    assert.equal(dropped.conversationId, '');
  } finally { s.close(); }
});

test('run.stalled carries complete fields and one idle period is announced once across concurrent processes and restarts', async () => {
  const s = setup();
  let restarted: ProgrammaticPushback | undefined;
  try {
    s.configure();
    s.pb.setCredentialAccess('cred-one', { scopes: ['read', 'execute'], allowFullAccess: false });
    s.pb.markTakeover('workspace-one', 'conversation-one', 'cred-one');
    s.pb.publish(conversationEvent(view({ run: run('run-one', 'running') })));
    await s.flush();
    // A second runtime sharing the same durable store must not duplicate the event.
    restarted = new ProgrammaticPushback({ root: s.dir, transport: s.fake.transport, now: s.now, checkIntervalMs: 3600000 });
    s.advance(1200000);
    s.pb.tick();
    restarted.tick();
    await s.flush();
    const stalledCalls = s.fake.calls.filter(call => call.body.type === 'run.stalled');
    assert.equal(stalledCalls.length, 1, 'concurrent processes deduplicate the same idle period');
    const payload = stalledCalls[0]!.body;
    assert.deepEqual(payload.stalled, { idleMs: 1200000, lastActivityAt: '2026-11-01T00:00:00.000Z' });
    assert.deepEqual(payload.scopes, ['read', 'execute']);
    assert.equal(payload.allowFullAccess, false);
    restarted.close(); restarted = undefined;
    const again = new ProgrammaticPushback({ root: s.dir, transport: s.fake.transport, now: s.now, checkIntervalMs: 3600000 });
    try {
      s.advance(600000);
      again.tick();
      await s.flush();
      assert.equal(s.fake.calls.filter(call => call.body.type === 'run.stalled').length, 1, 'a restart does not re-announce the same idle period');
    } finally { again.close(); }
  } finally { restarted?.close(); s.close(); }
});

test('legacy unknown-status stalls never deliver and pending old-format events are repaired before delivery', async () => {
  const conversation = view({
    run: run('run-legacy', 'completed'),
    entries: [{ id: 'm1', sequence: 1, kind: 'message', role: 'assistant', text: '旧轮次的完整最终回复', createdAt: '2026-11-01T00:00:01.000Z', runId: 'run-legacy', status: 'completed' }] as any,
  });
  const s = setup({ readConversation: () => conversation });
  let restarted: ProgrammaticPushback | undefined;
  try {
    s.configure();
    s.pb.setCredentialAccess('cred-one', { scopes: ['read', 'execute', 'answer'], allowFullAccess: true });
    s.pb.markTakeover('workspace-one', 'conversation-one', 'cred-one');
    s.pb.publish(conversationEvent(view({ run: run('run-legacy', 'running') })));
    await s.flush();
    s.fake.calls.length = 0;
    const legacy = (type: string, runId: string | undefined, extra: Record<string, unknown>) => JSON.stringify({
      eventId: 'legacy-' + type, type, occurredAt: '2026-11-02T00:00:00.000Z',
      machine: { id: 'm', name: 'n' }, workspaceId: 'workspace-one', conversationId: 'conversation-one',
      title: 'work', ...(runId ? { runId } : {}), summary: 'legacy', detailUrl: '/legacy', sequence: 0, ...extra,
    });
    const insert = (eventId: string, type: string, body: string) =>
      s.exec("INSERT INTO events(eventId,credentialId,workspaceId,conversationId,type,dedupKey,body,deliveryState,attempts,nextAttemptAt,mergedCount,held,mergeKey,createdAt) VALUES(?,?,?,?,?,?,?,'pending',0,0,1,0,NULL,?)", eventId, 'cred-one', 'workspace-one', 'conversation-one', type, eventId, body, s.now());
    insert('legacy-run.completed', 'run.completed', legacy('run.completed', 'run-legacy', { runStatus: 'completed' }));
    insert('legacy-run.stalled', 'run.stalled', legacy('run.stalled', 'run-legacy', { runStatus: 'unknown', summary: '执行状态未知已超过 5 分钟' }));
    insert('legacy-run.progress', 'run.progress', legacy('run.progress', 'run-legacy', { runStatus: 'running', progress: { text: '', elapsedMs: 1000, completedToolCount: 0 } }));
    // A projection written by the retired build still carries its old marker.
    s.exec("UPDATE projections SET snapshot=? WHERE credentialId='cred-one' AND conversationId='conversation-one'", JSON.stringify({
      title: 'work', workspaceId: 'workspace-one', conversationId: 'conversation-one',
      runs: { 'run-legacy': { status: 'unknown', stalled: true, unknownSince: s.now() - 600000, lastActivityAt: s.now() - 1800000, activitySignature: 'legacy', completedToolCount: 0, startedAt: '2026-11-01T00:00:00.000Z' } },
      requests: {},
    }));
    restarted = new ProgrammaticPushback({ root: s.dir, transport: s.fake.transport, now: s.now, checkIntervalMs: 3600000, readConversation: () => conversation });
    restarted.tick();
    await s.flush();
    const delivered = s.fake.calls.filter(call => {
      try { return call.body.eventId === 'legacy-run.completed'; } catch { return false; }
    });
    assert.equal(delivered.length, 1, 'the pending completion is delivered');
    assert.equal(delivered[0]!.body.finalReply, '旧轮次的完整最终回复');
    assert.equal(delivered[0]!.body.finalReplyUrl, '/api/v1/programmatic/workspaces/workspace-one/conversations/conversation-one/runs/run-legacy/final-reply');
    assert.deepEqual(delivered[0]!.body.scopes, ['read', 'execute', 'answer']);
    assert.equal(delivered[0]!.body.allowFullAccess, true);
    assert.ok(!s.fake.calls.some(call => call.body.eventId === 'legacy-run.stalled'), 'the retired unknown-status stall is not delivered');
    assert.ok(!s.fake.calls.some(call => call.body.eventId === 'legacy-run.progress'), 'an empty progress event is not delivered');
    const retired = s.rows("SELECT eventId,deliveryState FROM events WHERE eventId IN ('legacy-run.stalled','legacy-run.progress')");
    assert.ok(retired.every(row => row.deliveryState === 'undelivered'));
    restarted.tick();
    await s.flush();
    assert.equal(s.fake.calls.filter(call => call.body.eventId === 'legacy-run.completed').length, 1, 'repaired events are not replayed');
  } finally { restarted?.close(); s.close(); }
});

test('run.stopped is suppressed for the credential that recorded the stop', async () => {
  const s = setup();
  try {
    s.configure('cred-one');
    s.configure('cred-two');
    s.pb.markTakeover('workspace-one', 'conversation-one', 'cred-one');
    s.pb.markTakeover('workspace-one', 'conversation-one', 'cred-two');
    s.pb.recordStop('workspace-one', 'conversation-one', 'run-one', 'cred-one');
    s.pb.publish(conversationEvent(view({ run: run('run-one', 'running') })));
    await s.flush();
    s.fake.calls.length = 0;
    s.pb.publish(conversationEvent(view({ run: run('run-one', 'stopped'), revision: 'r2' })));
    await s.flush();
    const stopped = s.fake.calls.filter(call => call.body.type === 'run.stopped');
    assert.equal(stopped.length, 1, 'only the non-initiating credential receives run.stopped');
    assert.deepEqual(s.pb.listEvents('cred-one', 'workspace-one', {}).events.map(event => event.type), []);
    assert.deepEqual(s.pb.listEvents('cred-two', 'workspace-one', {}).events.map(event => event.type), ['run.stopped']);
  } finally { s.close(); }
});
