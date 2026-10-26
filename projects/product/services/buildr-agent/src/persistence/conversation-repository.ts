import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { AgentServiceError, fail } from '../domain/agent-state.ts';
import type { StoredConnection, StoredConversation } from '../domain/agent-state.ts';

const SCHEMA_VERSION = 1;

/** Sole owner of the application's private interaction database. Reads never initialize it. */
export class ConversationRepository {
  readonly filename: string;
  private readonly directory: string;
  constructor(directory: string) { this.directory = directory; this.filename = path.join(directory, 'conversations.sqlite'); }

  private open(write: boolean): DatabaseSync | undefined {
    if (!fs.existsSync(this.filename) && !write) return undefined;
    try {
      if (write) {
        fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
        if (fs.lstatSync(this.directory).isSymbolicLink()) fail('agent_storage_unsafe', '私有数据目录不能是符号链接。', 409);
      }
      if (fs.existsSync(this.filename)) {
        const stat = fs.lstatSync(this.filename);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('agent_storage_unsafe', '私有交互库来源不安全。', 409);
      }
      const db = new DatabaseSync(this.filename, { readOnly: !write });
      try {
        const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
        if (row.user_version > SCHEMA_VERSION) fail('agent_storage_newer', '此交互库来自较新版本，请使用匹配的 Buildr。', 409);
        if (row.user_version === 0) {
          if (!write) { db.close(); return undefined; }
          db.exec(`BEGIN IMMEDIATE;
            CREATE TABLE connections(id TEXT PRIMARY KEY, provider TEXT NOT NULL UNIQUE, revision TEXT NOT NULL, body TEXT NOT NULL);
            CREATE TABLE conversations(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT, hidden INTEGER NOT NULL, updated_at TEXT NOT NULL, revision TEXT NOT NULL, body TEXT NOT NULL);
            CREATE INDEX conversations_workspace ON conversations(workspace_id, updated_at DESC, id);
            CREATE INDEX conversations_task ON conversations(workspace_id, task_id);
            PRAGMA user_version=1; COMMIT;`);
        }
        if (write) fs.chmodSync(this.filename, 0o600);
        return db;
      } catch (error) { db.close(); throw error; }
    } catch (error) {
      if (error instanceof AgentServiceError) throw error;
      fail('agent_storage_unavailable', '私有交互库不可读写；原记录已保留，请检查目录权限或数据库状态。', 409);
    }
  }

  readConnection(id: string): StoredConnection | undefined {
    const db = this.open(false); if (!db) return;
    try { const row = db.prepare('SELECT body FROM connections WHERE id=?').get(id) as { body: string } | undefined; return row ? JSON.parse(row.body) : undefined; }
    finally { db.close(); }
  }
  listConnections(): StoredConnection[] {
    const db = this.open(false); if (!db) return [];
    try { return (db.prepare('SELECT body FROM connections ORDER BY provider').all() as { body: string }[]).map(row => JSON.parse(row.body)); }
    finally { db.close(); }
  }
  saveConnection(record: StoredConnection, priorRevision?: string): void {
    const db = this.open(true)!;
    try {
      db.exec('BEGIN IMMEDIATE');
      const prior = db.prepare('SELECT revision FROM connections WHERE id=?').get(record.view.id) as { revision: string } | undefined;
      if ((prior?.revision ?? undefined) !== priorRevision) fail('agent_revision_conflict', '接入配置已变化，请重新检查。', 409);
      db.prepare('INSERT INTO connections(id,provider,revision,body) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body').run(record.view.id, record.view.provider, record.view.revision, JSON.stringify(record));
      db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    finally { db.close(); }
  }
  readConversation(id: string): StoredConversation | undefined {
    const db = this.open(false); if (!db) return;
    try { const row = db.prepare('SELECT body FROM conversations WHERE id=?').get(id) as { body: string } | undefined; return row ? JSON.parse(row.body) : undefined; }
    finally { db.close(); }
  }
  listConversations(workspaceId: string, options: { taskId?: string; before?: string; limit: number; includeHidden?: boolean; query?: string }): StoredConversation[] {
    const db = this.open(false); if (!db) return [];
    try {
      const where = ['workspace_id=?']; const values: Array<string | number> = [workspaceId];
      if (!options.includeHidden) where.push('hidden=0');
      if (options.taskId) { where.push('task_id=?'); values.push(options.taskId); }
      if (options.query) {
        where.push("(instr(lower(json_extract(body,'$.view.title')),lower(?))>0 OR EXISTS(SELECT 1 FROM json_each(body,'$.view.entries') AS entry WHERE instr(lower(json_extract(entry.value,'$.text')),lower(?))>0))");
        values.push(options.query, options.query);
      }
      if (options.before) { where.push('(updated_at || \'/\' || id) < ?'); values.push(options.before); }
      values.push(options.limit);
      return (db.prepare(`SELECT body FROM conversations WHERE ${where.join(' AND ')} ORDER BY updated_at DESC,id DESC LIMIT ?`).all(...values) as { body: string }[]).map(row => JSON.parse(row.body));
    } finally { db.close(); }
  }
  listPending(includeActive = false): StoredConversation[] {
    const db = this.open(false); if (!db) return [];
    try { return (db.prepare('SELECT body FROM conversations ORDER BY updated_at DESC').all() as { body: string }[]).map(row => JSON.parse(row.body)).filter((record: StoredConversation) => record.view.requests.length || (includeActive ? ['starting', 'running', 'waiting-approval', 'waiting-question', 'stopping', 'unknown', 'tools-active'] : ['unknown', 'tools-active']).includes(record.view.run?.status ?? '')); }
    finally { db.close(); }
  }
  saveConversation(record: StoredConversation, priorRevision?: string): void {
    const db = this.open(true)!;
    try {
      db.exec('BEGIN IMMEDIATE');
      const prior = db.prepare('SELECT revision FROM conversations WHERE id=?').get(record.view.id) as { revision: string } | undefined;
      if ((prior?.revision ?? undefined) !== priorRevision) fail('agent_revision_conflict', '对话已变化，请重新读取。', 409);
      db.prepare('INSERT INTO conversations(id,workspace_id,task_id,hidden,updated_at,revision,body) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET hidden=excluded.hidden,updated_at=excluded.updated_at,revision=excluded.revision,body=excluded.body').run(record.view.id, record.view.workspaceId, record.view.taskId ?? null, Number(record.view.hidden), record.view.updatedAt, record.view.revision, JSON.stringify(record));
      db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    finally { db.close(); }
  }
}
