import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { PendingSendView, SendDraft } from '../contracts.ts';
import { fail } from '../domain/agent-state.ts';

export interface PendingSendRecord extends Omit<PendingSendView, 'state'> {
  state: PendingSendView['state'] | 'cancelled' | 'delivered';
  scope: string;
  conversationId: string;
  submissionDigest: string;
  owner?: string;
  handoffStopRequested?: boolean;
}
const active = (value: PendingSendRecord) => value.state !== 'cancelled' && value.state !== 'delivered';
/** A single durable next instruction per conversation, separate from native acceptance. */
export class PendingSendRepository {
  private readonly filename: string;
  constructor(root: string) { this.filename = path.join(root, 'pending-sends.sqlite'); }
  private use<T>(write: boolean, work: (db: DatabaseSync) => T, absent: T): T {
    if (!write && !fs.existsSync(this.filename)) return absent;
    const directory = path.dirname(this.filename);
    if (write) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(directory).isSymbolicLink() || fs.existsSync(this.filename) && (fs.lstatSync(this.filename).isSymbolicLink() || !fs.lstatSync(this.filename).isFile() || fs.lstatSync(this.filename).nlink !== 1)) fail('agent_storage_unsafe', '待发送存储来源不安全。', 409);
    const db = new DatabaseSync(this.filename, { readOnly: !write });
    try {
      db.exec('PRAGMA busy_timeout=2000');
      if (write) {
        db.exec("CREATE TABLE IF NOT EXISTS submissions(scope TEXT NOT NULL,conversation_id TEXT NOT NULL,id TEXT NOT NULL,state TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(scope,conversation_id,id)); CREATE UNIQUE INDEX IF NOT EXISTS single_pending_send ON submissions(scope,conversation_id) WHERE state NOT IN ('cancelled','delivered')");
        fs.chmodSync(this.filename, 0o600);
        db.exec('BEGIN IMMEDIATE');
      }
      const result = work(db);
      if (write) db.exec('COMMIT');
      return result;
    } catch (error) { if (write) { try { db.exec('ROLLBACK'); } catch {} } throw error; }
    finally { db.close(); }
  }
  private rows(db: DatabaseSync, scope?: string, id?: string): PendingSendRecord[] {
    const rows = scope === undefined ? db.prepare('SELECT body FROM submissions').all() : db.prepare('SELECT body FROM submissions WHERE scope=? AND conversation_id=?').all(scope, id!);
    return (rows as Array<{ body: string }>).map(row => JSON.parse(row.body));
  }
  private write(db: DatabaseSync, value: PendingSendRecord): PendingSendRecord {
    db.prepare('INSERT INTO submissions(scope,conversation_id,id,state,body) VALUES(?,?,?,?,?) ON CONFLICT(scope,conversation_id,id) DO UPDATE SET state=excluded.state,body=excluded.body').run(value.scope, value.conversationId, value.id, value.state, JSON.stringify(value));
    return value;
  }
  read(scope: string, id: string): PendingSendRecord | undefined { return this.use(false, db => this.rows(db, scope, id).find(active), undefined); }
  lookup(scope: string, id: string, requestId: string): PendingSendRecord | undefined { return this.use(false, db => this.rows(db, scope, id).find(row => row.id === requestId), undefined); }
  list(): PendingSendRecord[] { return this.use(false, db => this.rows(db).filter(active), []); }
  view(record: PendingSendRecord | undefined): PendingSendView | undefined {
    if (!record || !active(record)) return;
    const { id, revision, state, draft, reason, createdAt, updatedAt, waitingQuestions } = record;
    return structuredClone({ id, revision, state: state as PendingSendView['state'], draft, reason, createdAt, updatedAt, ...(waitingQuestions ? {waitingQuestions} : {}) });
  }
  submit(scope: string, id: string, draft: SendDraft, requestId: string, expectedRevision?: string, submitted = draft, waitingQuestions?: PendingSendView['waitingQuestions'], retryStop = false): PendingSendRecord {
    const submissionDigest = createHash('sha256').update(JSON.stringify(submitted)).digest('hex');
    return this.use(true, db => {
      const rows = this.rows(db, scope, id), existing = rows.find(row => row.id === requestId);
      if (expectedRevision === undefined && existing) {
        if (existing.submissionDigest !== submissionDigest) fail('agent_pending_conflict', '此提交身份的内容已经变化，请重新读取。', 409);
        return existing;
      }
      const current = rows.find(active);
      if (expectedRevision !== undefined && (!current || current.id !== requestId || current.revision !== expectedRevision || current.state === 'dispatching')) fail('agent_pending_conflict', '待发送内容已变化或正在发送，请重新读取。', 409);
      if (expectedRevision === undefined && current) fail('agent_pending_conflict', '已有待发送内容，请修改或取消后继续。', 409);
      const now = new Date().toISOString();
      return this.write(db, { scope, conversationId: id, id: requestId, revision: randomUUID(), state: 'waiting', draft, ...(waitingQuestions ? {waitingQuestions} : {}), ...(current?.handoffStopRequested && !retryStop ? {handoffStopRequested:true} : {}), reason: draft.waitingHandoff ? '交接内容已保存，正在准备投递；原执行及未回答问题继续保留。' : '新要求已保存，等待当前接收后台就绪；不等待原命令退出。', submissionDigest: existing?.submissionDigest ?? submissionDigest, createdAt: current?.createdAt ?? now, updatedAt: now });
    }, undefined as never);
  }
  cancel(scope: string, id: string, revision: string): void {
    this.use(true, db => {
      const row = this.rows(db, scope, id).find(active);
      if (!row || row.revision !== revision || row.state === 'dispatching') fail('agent_pending_conflict', '待发送内容已变化或正在发送，请重新读取。', 409);
      this.write(db, { ...row, state: 'cancelled', revision: randomUUID(), updatedAt: new Date().toISOString() });
    }, undefined);
  }
  claim(row: PendingSendRecord, generation: string, ownerAlive: (generation: string) => boolean): PendingSendRecord | undefined {
    return this.use(true, db => {
      const current = this.rows(db, row.scope, row.conversationId).find(value => value.id === row.id);
      if (!current || current.revision !== row.revision || current.state === 'failed' || !active(current) || current.state === 'dispatching' && current.owner && ownerAlive(current.owner)) return;
      return this.write(db, { ...current, state: 'dispatching', owner: generation, revision: randomUUID(), updatedAt: new Date().toISOString() });
    }, undefined);
  }
  finish(row: PendingSendRecord, state: PendingSendRecord['state'], reason: string): void {
    this.use(true, db => {
      const current = this.rows(db, row.scope, row.conversationId).find(value => value.id === row.id);
      if (!current || current.revision !== row.revision || current.owner !== row.owner) return;
      if (current.state === state && current.reason === reason && !current.owner) return;
      this.write(db, { ...current, state, reason, owner: undefined, revision: randomUUID(), updatedAt: new Date().toISOString() });
    }, undefined);
  }
}
