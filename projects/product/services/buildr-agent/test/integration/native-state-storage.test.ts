import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { nativeSessionReferences } from '../../src/application/native-session-references.ts';
import { nativeStateThreads, pruneNativeStateThreads } from '../../src/storage/native-state.ts';
import { observeStorageUse } from '../../src/storage/files.ts';
import { opaqueReference } from '../../src/executors/native-process.ts';
import type { StoredConversation } from '../../src/domain/agent-state.ts';

const day = 24 * 60 * 60_000;
const darwin = process.platform === 'darwin';

function fixture(t: test.TestContext) {
  const dataRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-native-state-')));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const root = path.join(dataRoot, 'agent-service'); fs.mkdirSync(root);
  return { dataRoot, root };
}
function sharedHome(root: string) { const home = path.join(root, 'connections', 'codex', 'codex-home'); fs.mkdirSync(home, { recursive: true }); return home; }
function makeState(home: string, threads: Array<{ id: string; updatedAtMs: number; title?: string }>) {
  const db = new DatabaseSync(path.join(home, 'state_5.sqlite'));
  try {
    db.exec('CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, updated_at INTEGER, updated_at_ms INTEGER)');
    for (const thread of threads) db.prepare('INSERT INTO threads(id,title,updated_at,updated_at_ms) VALUES(?,?,?,?)').run(thread.id, thread.title ?? '', thread.updatedAtMs, thread.updatedAtMs);
  } finally { db.close(); }
}
function makeHistory(home: string, threadIds: string[], itemBytes = 16) {
  const db = new DatabaseSync(path.join(home, 'thread_history_1.sqlite'));
  try {
    db.exec('CREATE TABLE thread_items (thread_id TEXT, turn_id TEXT, item_id TEXT, item_json TEXT, PRIMARY KEY(thread_id,turn_id,item_id))');
    db.exec('CREATE TABLE thread_turns (thread_id TEXT, turn_id TEXT, PRIMARY KEY(thread_id,turn_id))');
    db.exec('CREATE TABLE thread_history_projection_state (thread_id TEXT PRIMARY KEY, next_rollout_byte_offset INTEGER, next_rollout_ordinal INTEGER)');
    db.exec('CREATE TABLE thread_realtime_items (thread_id TEXT, item_id TEXT, PRIMARY KEY(thread_id,item_id))');
    for (const id of threadIds) {
      db.prepare('INSERT INTO thread_items VALUES(?,?,?,?)').run(id, 'turn', 'item', 'x'.repeat(itemBytes));
      db.prepare('INSERT INTO thread_turns VALUES(?,?)').run(id, 'turn');
      db.prepare('INSERT INTO thread_history_projection_state VALUES(?,?,?)').run(id, 0, 0);
    }
  } finally { db.close(); }
}
function conversation(root: string, contextId: string, input: { modelAccountId?: string; attemptContext?: boolean } = {}) {
  const repo = new ConversationRepository(root), cwd = '/workspace', participantId = randomUUID();
  const record: StoredConversation = {
    view: { id: randomUUID(), workspaceId: 'ws', revision: 'r1', cwd, title: 'state', updatedAt: 'now', hidden: false, requests: [], participants: [], entries: [] },
    participants: [{ id: participantId, connectionId: 'codex', provider: 'codex', label: 'codex', bindingIdentity: 'binding', deliveredThrough: 0,
      ...(input.modelAccountId ? { modelAccountId: input.modelAccountId } : {}),
      contextRef: { id: contextId, data: { native: opaqueReference('codex', contextId, cwd, 'binding') } } }],
    sources: {}, nativeTools: {}, attachments: {}, requests: {},
    attempts: [{ clientRequestId: randomUUID(), inputDigest: 'digest', runId: randomUUID(), participantId, through: 0, userEntryId: 'user', accepted: true,
      ...(input.attemptContext === false ? {} : { executionRef: { id: randomUUID(), data: { resourceContext: contextId } } }) }],
  };
  repo.saveConversation(record); return repo;
}
const references = (root: string) => nativeSessionReferences(root, new ConversationRepository(root));
const inventory = (root: string) => nativeStateThreads(root, observeStorageUse(), Date.now() - day, references(root));
const threadIds = (home: string, table: string) => {
  const file = path.join(home, table === 'threads' ? 'state_5.sqlite' : 'thread_history_1.sqlite');
  const db = new DatabaseSync(file, { readOnly: true });
  try { return (db.prepare(`SELECT ${table === 'threads' ? 'id' : 'thread_id'} AS id FROM ${table}`).all() as Array<{ id: string }>).map(row => row.id); }
  finally { db.close(); }
};

test('state threads require a complete proof, a quiescent home and explicit eligibility; referenced threads are retained', async t => {
  if (!darwin) return;
  const f = fixture(t), home = sharedHome(f.root);
  const live = randomUUID(), dead = randomUUID();
  makeState(home, [{ id: live, updatedAtMs: Date.now() - 3 * day }, { id: dead, updatedAtMs: Date.now() - 3 * day }]);
  makeHistory(home, [live, dead]);
  conversation(f.root, live);
  const plan = inventory(f.root);
  assert.equal(plan.threads.find(thread => thread.threadId === live)?.reason, 'native_state_thread_referenced');
  assert.equal(plan.threads.find(thread => thread.threadId === dead)?.eligible, true);
  assert.equal(plan.threads.find(thread => thread.threadId === dead)?.reason, 'unused_native_state_thread');
});

test('confirmed pruning removes only unreferenced threads from both databases and shrinks them', async t => {
  if (!darwin) return;
  const f = fixture(t), home = sharedHome(f.root);
  const live = randomUUID(), dead = randomUUID();
  makeState(home, [{ id: live, updatedAtMs: Date.now() - 3 * day }, { id: dead, updatedAtMs: Date.now() - 3 * day }]);
  makeHistory(home, [live, dead], 512 * 1024);
  conversation(f.root, live);
  const historyFile = path.join(home, 'thread_history_1.sqlite');
  const beforeBytes = fs.statSync(historyFile).size;
  const plan = inventory(f.root);
  const eligible = plan.threads.filter(thread => thread.eligible);
  const result = pruneNativeStateThreads(f.root, eligible, references(f.root), observeStorageUse, Date.now() + 30000);
  assert.equal(result.results.find(item => item.threadId === dead)?.status, 'removed');
  assert.deepEqual(threadIds(home, 'threads').sort(), [live].sort());
  assert.deepEqual(threadIds(home, 'thread_items').sort(), [live].sort());
  assert.deepEqual(threadIds(home, 'thread_turns').sort(), [live].sort());
  assert.deepEqual(threadIds(home, 'thread_history_projection_state').sort(), [live].sort());
  assert.ok(fs.statSync(historyFile).size < beforeBytes, 'VACUUM shrinks the projection database');
  const db = new DatabaseSync(path.join(home, 'state_5.sqlite'), { readOnly: true });
  try { assert.equal((db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check, 'ok'); } finally { db.close(); }
});

test('uncertain references, a busy home and recent threads retain state threads', async t => {
  if (!darwin) return;
  const unresolved = fixture(t); {
    const home = sharedHome(unresolved.root), dead = randomUUID();
    makeState(home, [{ id: dead, updatedAtMs: Date.now() - 3 * day }]); makeHistory(home, [dead]);
    conversation(unresolved.root, randomUUID(), { modelAccountId: 'account-without-binding' });
    assert.equal(inventory(unresolved.root).threads.find(thread => thread.threadId === dead)?.reason, 'native_state_binding_unresolved');
  }
  const recent = fixture(t); {
    const home = sharedHome(recent.root), fresh = randomUUID();
    makeState(home, [{ id: fresh, updatedAtMs: Date.now() }]); makeHistory(home, [fresh]);
    assert.equal(inventory(recent.root).threads.find(thread => thread.threadId === fresh)?.reason, 'storage_recent');
  }
  const unknown = fixture(t); {
    const home = sharedHome(unknown.root), dead = randomUUID();
    makeState(home, [{ id: dead, updatedAtMs: Date.now() - 3 * day }]); makeHistory(home, [dead]);
    conversation(unknown.root, randomUUID(), { attemptContext: false });
    assert.equal(inventory(unknown.root).threads.find(thread => thread.threadId === dead)?.reason, 'native_state_context_unknown');
  }
});

test('an unknown schema is retained fail-closed and never pruned', async t => {
  if (!darwin) return;
  const f = fixture(t), home = sharedHome(f.root);
  const db = new DatabaseSync(path.join(home, 'state_5.sqlite'));
  try { db.exec('CREATE TABLE something_else (id TEXT)'); } finally { db.close(); }
  const plan = inventory(f.root);
  assert.equal(plan.threads.length, 0);
  assert.ok(plan.diagnostics.some(entry => entry.startsWith('native_state_schema_unknown:')));
});
