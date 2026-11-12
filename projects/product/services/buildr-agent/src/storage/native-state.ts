import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { safeStoragePath, storageInUse, type StorageUse } from './files.ts';
import type { NativeSessionReferenceProof } from './native-sessions.ts';

/** Codex keeps a per-home SQLite projection of its rollout sessions
 * (`state_N.sqlite` thread index + `thread_history_N.sqlite` item projection).
 * DSH has no shared state database; its sessions are reclaimed as directories.
 * A thread is reclaimable exactly when its rollout context is unreferenced by
 * the same complete proof used for native sessions. Provider-owned schemas are
 * verified fail-closed; anything uncertain is retained. */
const providers = ['codex'] as const;

export interface NativeStateThread {
  provider: 'codex'; home: string; threadId: string; title: string; updatedAtMs: number;
  eligible: boolean; reason: string;
}
export interface NativeStateInventory { complete: boolean; threads: NativeStateThread[]; diagnostics: string[] }
export interface NativeStatePruneResult { home: string; threadId: string; status: 'removed' | 'retained'; reason: string }

export function codexStateDatabases(home: string): { state?: string; history?: string } {
  const found: { state?: string; history?: string } = {};
  try {
    for (const name of fs.readdirSync(home)) {
      if (/^state_\d+\.sqlite$/u.test(name)) found.state = path.join(home, name);
      else if (/^thread_history_\d+\.sqlite$/u.test(name)) found.history = path.join(home, name);
    }
  } catch { /* An unreadable home retains its threads by omission. */ }
  return found;
}

function codexHomes(root: string): string[] {
  const homes: string[] = [];
  for (const provider of providers) {
    const account = path.join(root, 'connections', provider);
    homes.push(path.join(account, 'codex-home'));
    const bindings = path.join(account, 'model-bindings');
    if (safeStoragePath(root, bindings)) for (const id of fs.readdirSync(bindings).sort()) {
      if (/^[a-f0-9]{64}$/u.test(id)) homes.push(path.join(bindings, id, 'codex-home'));
    }
  }
  return homes.filter(home => safeStoragePath(root, home));
}

/** Thread-level candidates reuse the complete conversation-header / native-tool
 * / handoff reference proof. A referenced thread, an uncertain provider, a busy
 * home or a recent thread is always retained. */
export function nativeStateThreads(root: string, use: StorageUse, cutoff: number, references: NativeSessionReferenceProof): NativeStateInventory {
  const threads: NativeStateThread[] = [], diagnostics: string[] = [];
  for (const home of codexHomes(root)) {
    const { state } = codexStateDatabases(home);
    if (!state || !fs.existsSync(state)) continue;
    const busy = storageInUse(home, use);
    let db: DatabaseSync | undefined;
    try { db = new DatabaseSync(state, { readOnly: true }); } catch { diagnostics.push('native_state_unreadable:' + home); continue; }
    try {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='threads'").get()) { diagnostics.push('native_state_schema_unknown:' + home); continue; }
      const columns = new Set((db.prepare('PRAGMA table_info(threads)').all() as Array<{ name: string }>).map(field => field.name));
      if (!columns.has('id')) { diagnostics.push('native_state_schema_unknown:' + home); continue; }
      const stamp = columns.has('updated_at_ms') ? 'updated_at_ms' : columns.has('updated_at') ? 'updated_at' : undefined;
      const title = columns.has('title') ? 'title' : "''";
      for (const row of db.prepare(`SELECT id, ${title} AS title${stamp ? ', ' + stamp + ' AS stamp' : ''} FROM threads`).all() as Array<{ id: unknown; title: unknown; stamp?: unknown }>) {
        const threadId = typeof row.id === 'string' ? row.id : '';
        if (!threadId) continue;
        const updatedAtMs = Number(row.stamp ?? 0);
        const referenced = references.contexts.has('codex:' + threadId);
        const reason = !references.complete ? 'native_state_reference_observation_failed'
          : references.unresolved.has('codex') ? 'native_state_binding_unresolved'
          : references.unknownContext.has('codex') ? 'native_state_context_unknown'
          : !use.complete ? 'storage_usage_unknown'
          : busy ? 'storage_in_use'
          : referenced ? 'native_state_thread_referenced'
          : !Number.isFinite(updatedAtMs) || updatedAtMs <= 0 || updatedAtMs > cutoff ? 'storage_recent'
          : 'unused_native_state_thread';
        threads.push({ provider: 'codex', home, threadId, title: typeof row.title === 'string' ? row.title : '', updatedAtMs, eligible: reason === 'unused_native_state_thread', reason });
      }
    } catch { diagnostics.push('native_state_inventory_failed:' + home); }
    finally { db.close(); }
  }
  return { complete: references.complete, threads, diagnostics };
}

function tableHasColumn(db: DatabaseSync, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(field => field.name === column);
}

/** Delete only provably unreferenced threads, then shrink. Runs under the
 * service storage lock with a freshly read reference proof; re-checks occupancy
 * and schema, uses a fail-fast write transaction, and verifies integrity and the
 * exact before/after thread set. Any failure retains the whole home. */
export function pruneNativeStateThreads(root: string, planned: NativeStateThread[], references: NativeSessionReferenceProof,
  observe: () => StorageUse, deadline: number): { results: NativeStatePruneResult[]; diagnostics: string[] } {
  const results: NativeStatePruneResult[] = [], diagnostics: string[] = [];
  const byHome = new Map<string, NativeStateThread[]>();
  for (const thread of planned) { if (!thread.eligible) continue; const list = byHome.get(thread.home) ?? []; list.push(thread); byHome.set(thread.home, list); }
  for (const [home, threads] of byHome) {
    const retained = (reason: string) => { for (const thread of threads) results.push({ home, threadId: thread.threadId, status: 'retained', reason }); };
    if (Date.now() > deadline) { retained('storage_batch_deferred'); continue; }
    if (!safeStoragePath(root, home)) { retained('storage_path_unsafe'); continue; }
    const use = observe();
    if (!use.complete || storageInUse(home, use)) { retained('storage_in_use'); continue; }
    if (!references.complete || references.unresolved.has('codex') || references.unknownContext.has('codex')) { retained('native_state_reference_observation_failed'); continue; }
    const { state, history } = codexStateDatabases(home);
    if (!state) { retained('native_state_schema_unknown'); continue; }
    const unreferenced = threads.filter(thread => !references.contexts.has('codex:' + thread.threadId));
    if (!unreferenced.length) { retained('native_state_thread_referenced'); continue; }
    const ids = unreferenced.map(thread => thread.threadId);
    let stateDb: DatabaseSync | undefined, historyDb: DatabaseSync | undefined;
    try {
      stateDb = new DatabaseSync(state);
      stateDb.exec('PRAGMA busy_timeout=0');
      if (!tableHasColumn(stateDb, 'threads', 'id')) { retained('native_state_schema_unknown'); continue; }
      const before = new Set((stateDb.prepare('SELECT id FROM threads').all() as Array<{ id: string }>).map(row => row.id));
      const targets = ids.filter(id => before.has(id));
      if (!targets.length) { retained('native_state_thread_referenced'); continue; }
      let historyTables: string[] = [];
      if (history && fs.existsSync(history)) {
        historyDb = new DatabaseSync(history);
        historyDb.exec('PRAGMA busy_timeout=0');
        historyTables = ['thread_items', 'thread_turns', 'thread_history_projection_state', 'thread_realtime_items']
          .filter(table => (historyDb!.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) && tableHasColumn(historyDb!, table, 'thread_id'));
      }
      const placeholders = targets.map(() => '?').join(',');
      stateDb.exec('BEGIN IMMEDIATE');
      try {
        stateDb.prepare(`DELETE FROM threads WHERE id IN (${placeholders})`).run(...targets);
        if (historyDb) for (const table of historyTables) historyDb.prepare(`DELETE FROM ${table} WHERE thread_id IN (${placeholders})`).run(...targets);
        stateDb.exec('COMMIT');
      } catch (error) { try { stateDb.exec('ROLLBACK'); } catch { /* already rolled back */ } throw error; }
      const after = new Set((stateDb.prepare('SELECT id FROM threads').all() as Array<{ id: string }>).map(row => row.id));
      const exact = targets.every(id => !after.has(id)) && [...after].every(id => before.has(id));
      const integrity = (stateDb.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined)?.integrity_check;
      if (!exact || integrity !== 'ok') { diagnostics.push('native_state_identity_or_integrity_retained:' + home); retained('native_state_identity_or_integrity_retained'); continue; }
      try { stateDb.exec('PRAGMA wal_checkpoint(TRUNCATE)'); stateDb.exec('VACUUM'); } catch { diagnostics.push('native_state_shrink_deferred:' + home); }
      if (historyDb) { try { historyDb.exec('PRAGMA wal_checkpoint(TRUNCATE)'); historyDb.exec('VACUUM'); } catch { diagnostics.push('native_state_shrink_deferred:' + home); } }
      for (const thread of threads) results.push({ home, threadId: thread.threadId, status: targets.includes(thread.threadId) ? 'removed' : 'retained', reason: targets.includes(thread.threadId) ? 'unused_native_state_thread' : 'native_state_thread_referenced' });
    } catch { retained('native_state_prune_failed'); }
    finally { try { historyDb?.close(); } catch { /* ignore */ } try { stateDb?.close(); } catch { /* ignore */ } }
  }
  return { results, diagnostics };
}
