import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { AgentServiceError } from '../domain/agent-state.ts';
import type { PushbackCredentialAccess, PushbackEvent } from '../contracts.ts';

export type PushbackConfig = { credentialId: string; url: string; enabled: boolean; rateLimitHour: number; rateLimitMinute: number; progressEnabled?: boolean; stalledEnabled?: boolean; revision: string; secretFilePath: string; updatedAt: string };
export type PushbackTakeover = { workspaceId: string; conversationId: string; credentialId: string; firstAt: string };
export type PushbackClaim = { sequence: number; eventId: string; credentialId: string; workspaceId: string; conversationId: string; type: string; body: string; attempts: number; claim: string };
const unsafe = (message: string) => new AgentServiceError('agent_pushback_storage_unsafe', message, 409);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Private per-credential pushback authority. Reads never create state; the first write opens the store. */
export class ProgrammaticPushbackStore {
  private opened?: { db: DatabaseSync; instanceId: string };
  private readonly root: string;
  constructor(root: string) { this.root = root; }
  private open(): { db: DatabaseSync; instanceId: string } {
    if (this.opened) return this.opened;
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(this.root).isSymbolicLink()) throw unsafe('回推存储目录身份不安全。');
    const filename = path.join(this.root, 'pushback.sqlite');
    const info = fs.lstatSync(filename, { throwIfNoEntry: false });
    if (info && (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)) throw unsafe('回推存储来源不安全。');
    const db = new DatabaseSync(filename);
    fs.chmodSync(filename, 0o600);
    db.exec(`PRAGMA busy_timeout=2000;
      CREATE TABLE IF NOT EXISTS identity(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS configs(credentialId TEXT PRIMARY KEY, url TEXT NOT NULL, enabled INTEGER NOT NULL, rateLimitHour INTEGER NOT NULL, rateLimitMinute INTEGER NOT NULL, progressEnabled INTEGER NOT NULL DEFAULT 1, stalledEnabled INTEGER NOT NULL DEFAULT 1, revision TEXT NOT NULL, secretFilePath TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS takeovers(workspaceId TEXT NOT NULL, conversationId TEXT NOT NULL, credentialId TEXT NOT NULL, firstAt TEXT NOT NULL, PRIMARY KEY(workspaceId,conversationId,credentialId));
      CREATE TABLE IF NOT EXISTS stop_initiators(workspaceId TEXT NOT NULL, conversationId TEXT NOT NULL, runId TEXT NOT NULL, credentialId TEXT NOT NULL, PRIMARY KEY(workspaceId,conversationId,runId,credentialId));
      CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY AUTOINCREMENT, eventId TEXT UNIQUE NOT NULL, credentialId TEXT NOT NULL, workspaceId TEXT NOT NULL, conversationId TEXT NOT NULL, type TEXT NOT NULL, dedupKey TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, deliveryState TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, nextAttemptAt INTEGER NOT NULL DEFAULT 0, mergedCount INTEGER NOT NULL DEFAULT 1, held INTEGER NOT NULL DEFAULT 0, mergeKey TEXT, owner TEXT, claim TEXT, lease INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS pushback_pending ON events(deliveryState,held,nextAttemptAt,lease,sequence);
      CREATE INDEX IF NOT EXISTS pushback_scope ON events(credentialId,workspaceId,sequence);
      CREATE INDEX IF NOT EXISTS pushback_merge ON events(credentialId,conversationId,type,held,deliveryState);
      CREATE TABLE IF NOT EXISTS projections(credentialId TEXT NOT NULL, workspaceId TEXT NOT NULL, conversationId TEXT NOT NULL, snapshot TEXT NOT NULL, PRIMARY KEY(credentialId,workspaceId,conversationId));
      CREATE TABLE IF NOT EXISTS rate_log(credentialId TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS pushback_rate ON rate_log(credentialId,at);
      CREATE TABLE IF NOT EXISTS migrations(key TEXT PRIMARY KEY, value TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS credential_access(credentialId TEXT PRIMARY KEY, scopes TEXT NOT NULL, allowFullAccess INTEGER NOT NULL);`);
    const configColumns = new Set((db.prepare('PRAGMA table_info(configs)').all() as Array<{name:string}>).map(column => column.name));
    if (!configColumns.has('progressEnabled')) db.exec('ALTER TABLE configs ADD COLUMN progressEnabled INTEGER NOT NULL DEFAULT 1');
    if (!configColumns.has('stalledEnabled')) db.exec('ALTER TABLE configs ADD COLUMN stalledEnabled INTEGER NOT NULL DEFAULT 1');
    const eventColumns = new Set((db.prepare('PRAGMA table_info(events)').all() as Array<{name:string}>).map(column => column.name));
    if (!eventColumns.has('dedupKey')) db.exec("ALTER TABLE events ADD COLUMN dedupKey TEXT NOT NULL DEFAULT ''");
    // Existing rows predate durable dedup; their eventId is already unique and
    // therefore a safe per-row key. The unique index then makes duplicate
    // logical notifications impossible across processes and restarts.
    db.exec("UPDATE events SET dedupKey=eventId WHERE dedupKey=''");
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS pushback_dedup ON events(credentialId,conversationId,type,dedupKey)');
    db.prepare('INSERT OR IGNORE INTO identity(id,value) VALUES(1,?)').run(randomUUID());
    const instanceId = (db.prepare('SELECT value FROM identity WHERE id=1').get() as { value: string }).value;
    return this.opened = { db, instanceId };
  }
  private get db(): DatabaseSync { return this.open().db; }
  get instanceId(): string { return this.open().instanceId; }
  private existing(): DatabaseSync | undefined {
    if (this.opened) return this.opened.db;
    return fs.existsSync(path.join(this.root, 'pushback.sqlite')) ? this.open().db : undefined;
  }
  transaction<T>(work: () => T): T {
    const db = this.db;
    if (db.isTransaction) return work();
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  private secretDirectory(): string {
    const dir = path.join(this.root, 'secrets');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(dir).isSymbolicLink() || fs.realpathSync(dir) !== path.join(fs.realpathSync(this.root), 'secrets')) throw unsafe('回推密钥目录身份不安全。');
    fs.chmodSync(this.root, 0o700); fs.chmodSync(dir, 0o700);
    return dir;
  }
  writeSecret(credentialId: string, secret: string): string {
    const dir = this.secretDirectory();
    const file = path.join(dir, `${credentialId}.secret`);
    const temporary = path.join(dir, `${credentialId}.${randomUUID()}.tmp`);
    const descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
    try {
      fs.fchmodSync(descriptor, 0o600);
      fs.writeFileSync(descriptor, secret + '\n', 'utf8');
      fs.fsyncSync(descriptor);
    } catch (error) { fs.closeSync(descriptor); fs.unlinkSync(temporary); throw error; }
    fs.closeSync(descriptor);
    const target = fs.lstatSync(file, { throwIfNoEntry: false });
    if (target && (!target.isFile() || target.isSymbolicLink() || target.nlink !== 1)) { fs.unlinkSync(temporary); throw unsafe('回推密钥文件身份不安全。'); }
    fs.renameSync(temporary, file);
    return path.resolve(file);
  }
  readSecret(secretFilePath: string): string | undefined {
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(secretFilePath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | (fs.constants.O_NOFOLLOW ?? 0));
      const info = fs.fstatSync(descriptor);
      if (!info.isFile() || (info.mode & 0o077) || info.size > 65536 || (process.getuid && info.uid !== process.getuid())) return undefined;
      return fs.readFileSync(descriptor, 'utf8').replace(/\n$/, '');
    } catch { return undefined; }
    finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
  }
  getConfig(credentialId: string): PushbackConfig | undefined {
    const db = this.existing(); if (!db) return undefined;
    const row = db.prepare('SELECT * FROM configs WHERE credentialId=?').get(credentialId) as (Omit<PushbackConfig, 'enabled' | 'progressEnabled' | 'stalledEnabled'> & { enabled: number; progressEnabled: number; stalledEnabled: number }) | undefined;
    return row ? { ...row, enabled: Boolean(row.enabled), progressEnabled: row.progressEnabled !== 0, stalledEnabled: row.stalledEnabled !== 0 } : undefined;
  }
  listConfigs(): PushbackConfig[] {
    const db = this.existing(); if (!db) return [];
    return (db.prepare('SELECT * FROM configs').all() as Array<Omit<PushbackConfig, 'enabled' | 'progressEnabled' | 'stalledEnabled'> & { enabled: number; progressEnabled: number; stalledEnabled: number }>)
      .map(row => ({ ...row, enabled: Boolean(row.enabled), progressEnabled: row.progressEnabled !== 0, stalledEnabled: row.stalledEnabled !== 0 }));
  }
  putConfig(config: PushbackConfig): void {
    this.db.prepare('INSERT INTO configs(credentialId,url,enabled,rateLimitHour,rateLimitMinute,progressEnabled,stalledEnabled,revision,secretFilePath,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(credentialId) DO UPDATE SET url=excluded.url,enabled=excluded.enabled,rateLimitHour=excluded.rateLimitHour,rateLimitMinute=excluded.rateLimitMinute,progressEnabled=excluded.progressEnabled,stalledEnabled=excluded.stalledEnabled,revision=excluded.revision,secretFilePath=excluded.secretFilePath,updatedAt=excluded.updatedAt')
      .run(config.credentialId, config.url, Number(config.enabled), config.rateLimitHour, config.rateLimitMinute, Number(config.progressEnabled !== false), Number(config.stalledEnabled !== false), config.revision, config.secretFilePath, config.updatedAt);
  }
  putCredentialAccess(credentialId: string, access: PushbackCredentialAccess): void {
    this.db.prepare('INSERT INTO credential_access(credentialId,scopes,allowFullAccess) VALUES(?,?,?) ON CONFLICT(credentialId) DO UPDATE SET scopes=excluded.scopes,allowFullAccess=excluded.allowFullAccess')
      .run(credentialId, JSON.stringify(access.scopes), Number(access.allowFullAccess));
  }
  getCredentialAccess(credentialId: string): PushbackCredentialAccess | undefined {
    const db = this.existing(); if (!db) return undefined;
    const row = db.prepare('SELECT scopes,allowFullAccess FROM credential_access WHERE credentialId=?').get(credentialId) as { scopes: string; allowFullAccess: number } | undefined;
    if (!row) return undefined;
    try {
      const scopes = JSON.parse(row.scopes) as unknown;
      return { scopes: Array.isArray(scopes) ? scopes.filter((scope): scope is string => typeof scope === 'string') : [], allowFullAccess: row.allowFullAccess !== 0 };
    } catch { return { scopes: [], allowFullAccess: row.allowFullAccess !== 0 }; }
  }
  markTakeover(workspaceId: string, conversationId: string, credentialId: string, firstAt: string): void {
    this.db.prepare('INSERT OR IGNORE INTO takeovers(workspaceId,conversationId,credentialId,firstAt) VALUES(?,?,?,?)').run(workspaceId, conversationId, credentialId, firstAt);
  }
  takeoversForConversation(workspaceId: string, conversationId: string): string[] {
    const db = this.existing(); if (!db) return [];
    return (db.prepare('SELECT credentialId FROM takeovers WHERE workspaceId=? AND conversationId=?').all(workspaceId, conversationId) as Array<{ credentialId: string }>).map(row => row.credentialId);
  }
  listTakeovers(): PushbackTakeover[] {
    const db = this.existing(); if (!db) return [];
    return db.prepare('SELECT workspaceId,conversationId,credentialId,firstAt FROM takeovers').all() as PushbackTakeover[];
  }
  recordStop(workspaceId: string, conversationId: string, runId: string, credentialId: string): void {
    this.db.prepare('INSERT OR IGNORE INTO stop_initiators(workspaceId,conversationId,runId,credentialId) VALUES(?,?,?,?)').run(workspaceId, conversationId, runId, credentialId);
  }
  stoppedRuns(workspaceId: string, conversationId: string, credentialId: string): Set<string> {
    const db = this.existing(); if (!db) return new Set();
    return new Set((db.prepare('SELECT runId FROM stop_initiators WHERE workspaceId=? AND conversationId=? AND credentialId=?').all(workspaceId, conversationId, credentialId) as Array<{ runId: string }>).map(row => row.runId));
  }
  getProjection<T>(credentialId: string, workspaceId: string, conversationId: string): T | undefined {
    const db = this.existing(); if (!db) return undefined;
    const row = db.prepare('SELECT snapshot FROM projections WHERE credentialId=? AND workspaceId=? AND conversationId=?').get(credentialId, workspaceId, conversationId) as { snapshot: string } | undefined;
    return row ? JSON.parse(row.snapshot) as T : undefined;
  }
  putProjection(credentialId: string, workspaceId: string, conversationId: string, snapshot: unknown): void {
    this.db.prepare('INSERT INTO projections(credentialId,workspaceId,conversationId,snapshot) VALUES(?,?,?,?) ON CONFLICT(credentialId,workspaceId,conversationId) DO UPDATE SET snapshot=excluded.snapshot').run(credentialId, workspaceId, conversationId, JSON.stringify(snapshot));
  }
  listProjections(): Array<{ credentialId: string; workspaceId: string; conversationId: string; snapshot: string }> {
    const db = this.existing(); if (!db) return [];
    return db.prepare('SELECT credentialId,workspaceId,conversationId,snapshot FROM projections').all() as Array<{ credentialId: string; workspaceId: string; conversationId: string; snapshot: string }>;
  }
  countRate(credentialId: string, now: number, windowMs: number): number {
    const db = this.existing(); if (!db) return 0;
    return (db.prepare('SELECT count(*) AS n FROM rate_log WHERE credentialId=? AND at>?').get(credentialId, now - windowMs) as { n: number }).n;
  }
  recordRate(credentialId: string, now: number): void { this.db.prepare('INSERT INTO rate_log(credentialId,at) VALUES(?,?)').run(credentialId, now); }
  findHeld(credentialId: string, conversationId: string, type: string): { sequence: number; eventId: string; mergedCount: number } | undefined {
    const db = this.existing(); if (!db) return undefined;
    return db.prepare("SELECT sequence,eventId,mergedCount FROM events WHERE credentialId=? AND conversationId=? AND type=? AND held=1 AND deliveryState='pending' ORDER BY sequence DESC LIMIT 1").get(credentialId, conversationId, type) as { sequence: number; eventId: string; mergedCount: number } | undefined;
  }
  appendEvent(input: { credentialId: string; workspaceId: string; conversationId: string; type: string; dedupKey: string; held: boolean; mergeKey: string | null; now: number; deliveryState?: 'pending' | 'undelivered'; build: (sequence: number, eventId: string) => PushbackEvent }): { sequence: number; eventId: string } | undefined {
    return this.transaction(() => {
      const db = this.db;
      const temporary = randomUUID();
      const deliveryState = input.deliveryState ?? 'pending';
      const info = db.prepare("INSERT OR IGNORE INTO events(eventId,credentialId,workspaceId,conversationId,type,dedupKey,body,deliveryState,attempts,nextAttemptAt,mergedCount,held,mergeKey,createdAt) VALUES(?,?,?,?,?,?,'',?,0,?,1,?,?,?)")
        .run(temporary, input.credentialId, input.workspaceId, input.conversationId, input.type, input.dedupKey, deliveryState, input.now, Number(input.held), input.mergeKey, input.now);
      // A duplicate logical notification (same credential, conversation, type
      // and dedup key) is already recorded; callers must not deliver it again.
      if (Number(info.changes) === 0) return undefined;
      const sequence = Number(info.lastInsertRowid);
      const eventId = digest([this.instanceId, sequence, input.credentialId, input.dedupKey]);
      const body = JSON.stringify(input.build(sequence, eventId));
      db.prepare('UPDATE events SET eventId=?,body=? WHERE sequence=?').run(eventId, body, sequence);
      return { sequence, eventId };
    });
  }
  mergeHeld(sequence: number, mergedCount: number, build: (sequence: number, eventId: string) => PushbackEvent, eventId: string): void {
    this.db.prepare('UPDATE events SET body=?,mergedCount=? WHERE sequence=?').run(JSON.stringify(build(sequence, eventId)), mergedCount, sequence);
  }
  releaseHeld(sequence: number, now: number): void { this.db.prepare('UPDATE events SET held=0,nextAttemptAt=? WHERE sequence=?').run(now, sequence); }
  nextHeld(credentialId: string): { sequence: number; type: string } | undefined {
    const db = this.existing(); if (!db) return undefined;
    return db.prepare("SELECT sequence,type FROM events WHERE credentialId=? AND held=1 AND deliveryState='pending' ORDER BY (type='decision.requested') DESC,sequence ASC LIMIT 1").get(credentialId) as { sequence: number; type: string } | undefined;
  }
  claimDeliverable(now: number, owner: string, limit: number): PushbackClaim[] {
    const db = this.existing(); if (!db) return [];
    return this.transaction(() => {
      const rows = db.prepare("SELECT sequence,eventId,credentialId,workspaceId,conversationId,type,body,attempts FROM events WHERE deliveryState='pending' AND held=0 AND nextAttemptAt<=? AND lease<=? ORDER BY (type='decision.requested') DESC,sequence ASC LIMIT ?").all(now, now, limit) as Array<Omit<PushbackClaim, 'claim'>>;
      const claims: PushbackClaim[] = [];
      for (const row of rows) {
        const claim = randomUUID();
        db.prepare('UPDATE events SET owner=?,claim=?,lease=?,attempts=attempts+1 WHERE sequence=?').run(owner, claim, now + 30000, row.sequence);
        claims.push({ ...row, attempts: row.attempts + 1, claim });
      }
      return claims;
    });
  }
  settle(sequence: number, claim: string, state: 'delivered' | 'undelivered' | 'pending', nextAttemptAt: number): void {
    this.db.prepare('UPDATE events SET deliveryState=?,nextAttemptAt=?,owner=NULL,claim=NULL,lease=0 WHERE sequence=? AND claim=?').run(state, nextAttemptAt, sequence, claim);
  }
  markUndelivered(credentialId: string): void {
    this.db.prepare("UPDATE events SET deliveryState='undelivered',owner=NULL,claim=NULL,lease=0 WHERE credentialId=? AND deliveryState='pending'").run(credentialId);
  }
  /** Only events still queued for delivery may be validated; stored bodies are never rewritten. */
  listPendingEvents(): Array<{ sequence: number; credentialId: string; workspaceId: string; conversationId: string; type: string; body: string }> {
    const db = this.existing(); if (!db) return [];
    return db.prepare("SELECT sequence,credentialId,workspaceId,conversationId,type,body FROM events WHERE deliveryState='pending' ORDER BY sequence").all() as Array<{ sequence: number; credentialId: string; workspaceId: string; conversationId: string; type: string; body: string }>;
  }
  /** Retire one event without delivering it again, including a held event. */
  retireEvent(sequence: number): void {
    this.db.prepare("UPDATE events SET deliveryState='undelivered',held=0,owner=NULL,claim=NULL,lease=0 WHERE sequence=?").run(sequence);
  }
  nextDeliveryTime(now: number): number | undefined {
    const db = this.existing(); if (!db) return undefined;
    const row = db.prepare("SELECT min(max(nextAttemptAt,lease)) AS due FROM events WHERE deliveryState='pending' AND held=0").get() as { due: number | null };
    return row.due === null ? undefined : Math.max(now, row.due);
  }
  listEvents(credentialId: string, workspaceId: string, after: number, limit: number): { events: PushbackEvent[]; hasMore: boolean } {
    const db = this.existing(); if (!db) return { events: [], hasMore: false };
    const rows = db.prepare('SELECT body,sequence FROM events WHERE credentialId=? AND workspaceId=? AND sequence>? ORDER BY sequence ASC LIMIT ?').all(credentialId, workspaceId, after, limit + 1) as Array<{ body: string; sequence: number }>;
    const chosen = rows.slice(0, limit);
    return { events: chosen.map(row => JSON.parse(row.body) as PushbackEvent), hasMore: rows.length > limit };
  }
  cleanup(now: number, retentionMs: number): Array<{ credentialId: string; workspaceId: string; dropped: number }> {
    const db = this.existing(); if (!db) return [];
    return this.transaction(() => {
      const groups = db.prepare('SELECT credentialId,workspaceId,count(*) AS dropped FROM events WHERE createdAt<? GROUP BY credentialId,workspaceId').all(now - retentionMs) as Array<{ credentialId: string; workspaceId: string; dropped: number }>;
      db.prepare('DELETE FROM events WHERE createdAt<?').run(now - retentionMs);
      db.prepare('DELETE FROM rate_log WHERE at<=?').run(now - 3600000);
      return groups;
    });
  }
  migration(key: string): string | undefined {
    const db = this.existing(); if (!db) return undefined;
    const row = db.prepare('SELECT value FROM migrations WHERE key=?').get(key) as { value: string } | undefined;
    return row?.value;
  }
  recordMigration(key: string, value: string, at: string): void { this.db.prepare('INSERT OR IGNORE INTO migrations(key,value,at) VALUES(?,?,?)').run(key, value, at); }
  close(owner: string): void {
    const opened = this.opened; this.opened = undefined;
    if (!opened) return;
    try { opened.db.prepare("UPDATE events SET owner=NULL,claim=NULL,lease=0 WHERE owner=? AND deliveryState='pending'").run(owner); }
    finally { opened.db.close(); }
  }
}
