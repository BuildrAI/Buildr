import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AgentServiceError, type StoredConversation } from '../domain/agent-state.ts';
import { claim, claimStorage, live, readLock, readProcessInstances } from '../process/ownership.ts';
import { ConversationEntryStore } from './conversation-entry-store.ts';
import { ConversationReadModel } from './conversation-read-model.ts';

function identity(db: DatabaseSync): string {
  const hash = createHash('sha256');
  const version=Number(db.prepare('PRAGMA user_version').get()!.user_version);
  hash.update(String(version));
  for (const table of ['connections', 'conversations', 'conversation_entry_contents', 'conversation_read_entries']) {
    if (version<5 && table.startsWith('conversation_')) continue;
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
    for (const row of db.prepare(`SELECT * FROM ${table} ORDER BY ${table.startsWith('conversation_') ? 'conversation_id,' + (table.endsWith('contents') ? 'content_revision' : 'scope,sequence') : 'id'}`).iterate()) {
      const {body,...fields}=row; hash.update(JSON.stringify(fields));
      if (typeof body==='string' || body instanceof Uint8Array) hash.update(body);
    }
  }
  return hash.digest('hex');
}

/** Hold the same ownership boundary as process admission, not merely a SQLite write lock. */
export function beginConversationMigration(db: DatabaseSync, directory: string): { release(): void; complete(): void } {
  const dataRoot = path.basename(directory) === 'agent-service' ? path.dirname(directory) : directory;
  let owner: ReturnType<typeof claim> | undefined, storage: ReturnType<typeof claim> | undefined;
  const release = () => { storage?.release(); owner?.release(); };
  try {
    if (readLock(dataRoot, 'owner')?.pid !== process.pid) owner = claim(dataRoot, 'owner');
    if (readLock(dataRoot, 'storage')?.pid !== process.pid) storage = claimStorage(dataRoot);
    if (readProcessInstances(dataRoot).some(record => record.identity.pid !== process.pid && live(record.identity.pid))) {
      throw new AgentServiceError('agent_storage_migration_busy', '旧执行后台尚未释放，存储迁移已推迟；原工作和原库保留。', 409);
    }
    let cleanup: (() => void) | undefined;
    const version = db.prepare('PRAGMA user_version').get()!.user_version as number;
    if (version > 0) {
      const fingerprint = identity(db), filename = path.join(directory, `conversations.pre-v6-${fingerprint}.sqlite`);
      if (!fs.existsSync(filename)) {
        const fd = fs.openSync(filename, 'wx', 0o600); fs.closeSync(fd);
        try { db.prepare('VACUUM INTO ?').run(filename); }
        catch (error) { fs.unlinkSync(filename); throw error; }
      }
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('backup_source_unsafe');
      const backup = new DatabaseSync(filename, { readOnly: true });
      try {
        if (Object.values(backup.prepare('PRAGMA quick_check').get()!)[0] !== 'ok' || identity(backup) !== fingerprint) throw new Error('backup_verification_failed');
      } finally { backup.close(); }
      cleanup = () => {
        // Reopen committed data before removing only this migration's recovery point.
        let current: DatabaseSync | undefined, source: DatabaseSync | undefined;
        try {
          current = new DatabaseSync(path.join(directory, 'conversations.sqlite'), { readOnly: true });
          if (current.prepare('PRAGMA user_version').get()!.user_version !== 6 ||
              Object.values(current.prepare('PRAGMA integrity_check').get()!)[0] !== 'ok') return;
          source = new DatabaseSync(filename, { readOnly: true });
          if (identity(source) !== fingerprint) return;
          const count = (store: DatabaseSync) => store.prepare('SELECT count(*) AS n FROM conversations').get()!.n;
          if (count(current) !== count(source)) return;
          for (const row of source.prepare('SELECT id,body FROM conversations').iterate()) {
            const old = ConversationEntryStore.hydrate(source, JSON.parse(row.body as string) as StoredConversation);
            const next = current.prepare('SELECT body FROM conversations WHERE id=?').get(row.id!);
            if (!next) return;
            const restored = ConversationEntryStore.hydrate(current, JSON.parse(next.body as string));
            if (JSON.stringify(restored) !== JSON.stringify(old)) return;
          }
          source.close(); source = undefined; current.close(); current = undefined;
          const observed = fs.lstatSync(filename);
          if (!observed.isFile() || observed.isSymbolicLink() || observed.nlink !== 1 ||
              observed.dev !== stat.dev || observed.ino !== stat.ino || observed.size !== stat.size || observed.mtimeMs !== stat.mtimeMs) return;
          fs.unlinkSync(filename);
        } catch { /* Validation/deletion failure retains the backup, not a failed new database. */ }
        finally { source?.close(); current?.close(); }
      };
    }
    return { release, complete() { cleanup?.(); } };
  } catch (error) { release(); throw error; }
}

/** Convert only canonical legacy rows; stale projections are never migration sources. */
export function migrateConversationEntries(db: DatabaseSync): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DROP TABLE conversation_read_entries; ALTER TABLE conversations ADD COLUMN entry_count INTEGER NOT NULL DEFAULT 0; ALTER TABLE conversations ADD COLUMN inherited_count INTEGER NOT NULL DEFAULT 0; DROP INDEX IF EXISTS conversations_list_summary;');
    ConversationEntryStore.install(db);
    // Keyset reads bound migration memory to one conversation, not the whole database.
    let previousId: string | undefined;
    for (;;) {
      const row = (previousId === undefined
        ? db.prepare('SELECT id,body FROM conversations ORDER BY id LIMIT 1').get()
        : db.prepare('SELECT id,body FROM conversations WHERE id>? ORDER BY id LIMIT 1').get(previousId)) as {id:string;body:string} | undefined;
      if (!row) break;
      previousId = row.id;
      const record = JSON.parse(row.body) as StoredConversation;
      if (record.view.id !== row.id) throw new Error('conversation_identity_mismatch');
      const prepared = ConversationEntryStore.prepare(db, record);
      ConversationEntryStore.save(db, record, prepared);
      ConversationReadModel.saveHeader(db, record);
      db.prepare('UPDATE conversations SET body=?,entry_count=?,inherited_count=? WHERE id=?')
        .run(ConversationEntryStore.header(record), record.view.entries.length, record.inheritedContext?.entries.length ?? 0, row.id);
      // Verify every original entry before the old canonical body can be removed.
      if (JSON.stringify(ConversationEntryStore.load(db, row.id)) !== JSON.stringify(record.view.entries) ||
          JSON.stringify(ConversationEntryStore.load(db, row.id, 'inherited')) !== JSON.stringify(record.inheritedContext?.entries ?? [])) throw new Error('conversation_migration_mismatch');
      db.prepare('UPDATE conversation_read_states SET message_revision=revision WHERE id=?').run(row.id);
    }
    db.exec('PRAGMA user_version=5; COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  // Reclamation is optional. Its failure must not roll back or overwrite a valid new database.
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* Retain free pages and the verified backup. */ }
}
