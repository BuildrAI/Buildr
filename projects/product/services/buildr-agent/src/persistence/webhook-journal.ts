import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AgentServiceError } from '../domain/agent-state.ts';

import type { WebhookEnvelope } from '../domain/conversation-notifications.ts';
export type WebhookDelivery = { eventId: string; body: string; claim: string; attempts: number };

/** Private notification data only. Reads never initialize it; the first projection opens the store. */
export class WebhookJournal {
  private opened?: { db: DatabaseSync; instanceId: string };
  private readonly root?: string;
  constructor(root?: string) { this.root = root; }
  private open(): { db: DatabaseSync; instanceId: string } {
    if (this.opened) return this.opened;
    let filename = ':memory:';
    if (this.root) {
      fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
      filename = path.join(this.root, 'webhook-events.sqlite');
      const info = fs.lstatSync(filename, { throwIfNoEntry: false });
      if (fs.lstatSync(this.root).isSymbolicLink() || info && (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)) throw new AgentServiceError('agent_storage_unsafe', '通知存储来源不安全。', 409);
    }
    const db = new DatabaseSync(filename);
    if (this.root) fs.chmodSync(filename, 0o600);
    db.exec(`PRAGMA busy_timeout=2000;
      CREATE TABLE IF NOT EXISTS identity(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS projections(target TEXT NOT NULL,scope TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(target,scope,id));
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,target TEXT NOT NULL,scope TEXT NOT NULL,conversation TEXT NOT NULL,body TEXT NOT NULL,priority INTEGER NOT NULL,due INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,delivered INTEGER NOT NULL DEFAULT 0,owner TEXT,claim TEXT,lease INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS pending_webhooks ON events(target,delivered,due,lease,priority);`);
    db.prepare('INSERT OR IGNORE INTO identity(id,value) VALUES(1,?)').run(randomUUID());
    const instanceId = (db.prepare('SELECT value FROM identity WHERE id=1').get() as {value:string}).value;
    return this.opened = { db, instanceId };
  }
  private get db(): DatabaseSync { return this.open().db; }
  get instanceId(): string { return this.open().instanceId; }
  /** Reads open only an existing store; a fresh profile must not gain private state. */
  private available(): boolean {
    if (this.opened) return true;
    return !!this.root && fs.existsSync(path.join(this.root, 'webhook-events.sqlite'));
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  project<T>(target: string, scope: string, id: string, build: (prior?: T) => { snapshot: T; events: WebhookEnvelope[] }): void {
    this.transaction(() => {
      // Projection identity belongs to the source, not the current recipient.
      const row = this.db.prepare('SELECT body FROM projections WHERE target=? AND scope=? AND id=?').get('',scope,id) as {body:string}|undefined;
      const next = build(row ? JSON.parse(row.body) : undefined);
      for (const event of next.events) {
        const priority = ['pending_question','pending_approval','completed','error'].includes(event.eventType) ? 0 : 1;
        this.db.prepare('INSERT OR IGNORE INTO events(id,target,scope,conversation,body,priority,due) VALUES(?,?,?,?,?,?,0)').run(event.eventId,target,scope,id,JSON.stringify(event),priority);
      }
      const body=JSON.stringify(next.snapshot);
      if (body !== row?.body) this.db.prepare('INSERT INTO projections VALUES(?,?,?,?) ON CONFLICT(target,scope,id) DO UPDATE SET body=excluded.body').run('',scope,id,body);
    });
  }
  claim(target: string, owner: string, now: number): WebhookDelivery | undefined {
    if (!this.available()) return undefined;
    return this.transaction(() => {
      const row=this.db.prepare('SELECT id,body,attempts FROM events WHERE target=? AND delivered=0 AND due<=? AND lease<=? ORDER BY priority,due,rowid LIMIT 1').get(target,now,now) as {id:string;body:string;attempts:number}|undefined;
      if (!row) return;
      const claim=randomUUID();
      this.db.prepare('UPDATE events SET owner=?,claim=?,lease=?,attempts=attempts+1 WHERE id=?').run(owner,claim,now+30000,row.id);
      return {eventId:row.id,body:row.body,claim,attempts:row.attempts+1};
    });
  }
  settle(item: WebhookDelivery, success: boolean, due: number): void {
    this.db.prepare('UPDATE events SET delivered=?,due=?,owner=NULL,claim=NULL,lease=0 WHERE id=? AND claim=?').run(success?1:0,due,item.eventId,item.claim);
  }
  next(target: string, now: number): number | undefined {
    if (!this.available()) return undefined;
    const row=this.db.prepare('SELECT min(max(due,lease)) AS due FROM events WHERE target=? AND delivered=0').get(target) as {due:number|null};
    return row.due === null ? undefined : Math.max(now,row.due);
  }
  replay(target: string, scope: string, conversation: string, eventId: string): {eventId:string;queued:true} {
    return this.transaction(() => {
      const row=this.db.prepare('SELECT id FROM events WHERE id=? AND target=? AND scope=? AND conversation=?').get(eventId,target,scope,conversation);
      if (!row) throw new AgentServiceError('agent_webhook_event_missing','事件不存在、不属于该对话或目标配置已变化。',404);
      this.db.prepare('UPDATE events SET delivered=0,due=0,attempts=0 WHERE id=?').run(eventId);
      return {eventId,queued:true};
    });
  }
  close(owner: string): void {
    const opened = this.opened; this.opened = undefined;
    if (!opened) return;
    try {opened.db.prepare('UPDATE events SET owner=NULL,claim=NULL,lease=0 WHERE owner=? AND delivered=0').run(owner);}
    finally {opened.db.close();}
  }
}
