import { NativeContentReader } from '../storage/native-content.ts';
import { PendingSendRepository } from './pending-send-repository.ts';
import { normalizeParticipation } from '../domain/participation.ts';
import { projectParticipation, type ParticipationProjection } from '../domain/participation-record.ts';
import { createHash } from 'node:crypto';
import { summaryView, messageSignature, messageActivityAt, userActivityAt, pendingDecisionCount, conversationActive } from '../domain/conversation-activity.ts';
import type { ConversationView, RunView } from '../contracts.ts';
import { unfinishedRun } from '../domain/agent-state.ts';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { AgentServiceError, fail } from '../domain/agent-state.ts';
import type { StoredConnection, StoredConversation, StoredParticipant } from '../domain/agent-state.ts';
import { ConversationReadModel, type ConversationReadState } from './conversation-read-model.ts';
import { ConversationEntryStore } from './conversation-entry-store.ts';
import type { NativeToolContent } from '../native-content-contracts.ts';
import type { ConversationEntry } from '../contracts.ts';
import { beginConversationMigration, migrateConversationEntries } from './conversation-migration.ts';

export const CONVERSATION_SCHEMA_VERSION = 9;
const SCHEMA_VERSION = CONVERSATION_SCHEMA_VERSION;
// 附件准备不等于开始；已发送或结果未知的尝试仍必须可发现。
const LEGACY_HAS_WORK = "(json_array_length(json_extract(body,'$.view.entries'))>0 OR json_array_length(json_extract(body,'$.attempts'))>0 OR json_type(body,'$.view.run')='object' OR json_type(body,'$.view.childOf')='object')";
const hasWork = (db: DatabaseSync) => ConversationEntryStore.available(db)
  ? LEGACY_HAS_WORK.replace("json_array_length(json_extract(body,'$.view.entries'))", 'entry_count') : LEGACY_HAS_WORK;
// Legacy/offline readers must inspect optional JSON fields without materializing a full record.
const HAS_UNFINISHED = "EXISTS(SELECT 1 FROM json_each(body,'$.view.retainedRuns') AS retained WHERE json_extract(retained.value,'$.status') IN ('starting','running','waiting-approval','waiting-question','stopping','unknown','tools-active') OR EXISTS(SELECT 1 FROM json_each(retained.value,'$.tools') AS tool WHERE COALESCE(json_extract(tool.value,'$.status'),'unknown')<>'completed')) OR json_array_length(body,'$.view.requests')>0 OR json_extract(body,'$.view.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','unknown','tools-active') OR EXISTS(SELECT 1 FROM json_each(body,'$.view.run.tools') AS tool WHERE COALESCE(json_extract(tool.value,'$.status'),'unknown')<>'completed') OR json_extract(body,'$.view.titleState.status')='generating'";
const SEARCH_TERM_LIMIT = 6;
const SEARCH_ENTRY = "(json_extract(entry.value,'$.kind')='message' AND json_extract(entry.value,'$.role') IN ('user','assistant') AND coalesce(json_extract(entry.value,'$.thinking'),0)=0 AND instr(lower(json_extract(entry.value,'$.text')),lower(?))>0)";
const searchTerms = (query?: string) => (query ?? '').trim().split(/\s+/).filter(Boolean).slice(0, SEARCH_TERM_LIMIT);
const searchClause = (terms: string[], title: string) => terms.map(() => `(instr(lower(id),lower(?))>0 OR instr(lower(${title}),lower(?))>0 OR EXISTS(SELECT 1 FROM conversation_search_entries AS entry WHERE entry.owner_id=id AND ${SEARCH_ENTRY}))`).join(' AND ');
const searchSnippet = (terms: string[]) => {
  const text = "json_extract(entry.value,'$.text')";
  const starts = terms.map(() => `CASE WHEN instr(lower(${text}),lower(?))>0 THEN instr(lower(${text}),lower(?)) ELSE 1000000 END`).join(',');
  const match = terms.map(() => `instr(lower(${text}),lower(?))>0`).join(' OR ');
  return `(SELECT substr(${text},max(1,min(${starts},1000000)-40),120) FROM conversation_search_entries AS entry WHERE entry.owner_id=id AND json_extract(entry.value,'$.kind')='message' AND json_extract(entry.value,'$.role') IN ('user','assistant') AND coalesce(json_extract(entry.value,'$.thinking'),0)=0 AND (${match}) ORDER BY entry.sequence LIMIT 1)`;
};

/** Sole owner of the application's private interaction database. Reads never initialize it. */
export class ConversationRepository {
  readonly filename: string;
  private readonly directory: string;
  private repairs = new Set<string>();
  private repairScheduled = false;
  private stopped = false;
  private readonly savedRecords = new WeakMap<StoredConversation,string>();
  private readonly nativeReader: NativeContentReader;
  private readonly nativeTool?: (record:StoredConversation,entry:ConversationEntry)=>NativeToolContent|undefined;
  constructor(directory: string,nativeTool?:(record:StoredConversation,entry:ConversationEntry)=>NativeToolContent|undefined, readTool?:(reference:NativeToolContent)=>ConversationEntry|undefined) { this.nativeTool=nativeTool;this.nativeReader = new NativeContentReader(directory,readTool); this.directory = directory; this.filename = path.join(directory, 'conversations.sqlite'); }

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
      let migration: ReturnType<typeof beginConversationMigration> | undefined;
      try {
        db.exec('PRAGMA busy_timeout=2000');
        const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
        if (row.user_version > SCHEMA_VERSION) fail('agent_storage_newer', '此交互库来自较新版本，请使用匹配的 Buildr。', 409);
        if (write && row.user_version < SCHEMA_VERSION) migration = beginConversationMigration(db, this.directory);
        if (write && row.user_version===0) db.exec('PRAGMA auto_vacuum=INCREMENTAL');
        // Native tools may read/backup this same private database while events persist.
        // Readers must not turn a completed native operation into a failed observation.
        if (write && (db.prepare('PRAGMA journal_mode').get() as {journal_mode:string}).journal_mode !== 'wal') db.exec('PRAGMA journal_mode=WAL');
        if (row.user_version === 0) {
          if (!write) { db.close(); return undefined; }
          db.exec(`BEGIN IMMEDIATE;
            CREATE TABLE connections(id TEXT PRIMARY KEY, provider TEXT NOT NULL UNIQUE, revision TEXT NOT NULL, body TEXT NOT NULL);
            CREATE TABLE conversations(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT, hidden INTEGER NOT NULL, updated_at TEXT NOT NULL, revision TEXT NOT NULL, body TEXT NOT NULL);
            CREATE INDEX conversations_workspace ON conversations(workspace_id, updated_at DESC, id);
            CREATE INDEX conversations_task ON conversations(workspace_id, task_id);
            PRAGMA user_version=1; COMMIT;`);
        }
        if (write && row.user_version < 2) {
          db.exec(`BEGIN IMMEDIATE;
            ALTER TABLE conversations ADD COLUMN summary TEXT;
            ALTER TABLE conversations ADD COLUMN message_signature TEXT;
            ALTER TABLE conversations ADD COLUMN activity_at TEXT NOT NULL DEFAULT '';
            ALTER TABLE conversations ADD COLUMN activity_version INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE conversations ADD COLUMN seen_version INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE conversations ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0;
            CREATE TABLE conversation_epoch(id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL);
            INSERT INTO conversation_epoch VALUES(1,0);
            CREATE INDEX conversations_activity ON conversations(is_active DESC,activity_at DESC,id DESC);
            CREATE INDEX conversations_workspace_activity ON conversations(workspace_id,is_active DESC,activity_at DESC,id DESC);`);
          for (const item of db.prepare('SELECT id,body FROM conversations').all() as Array<{id:string;body:string}>) {
            const record=JSON.parse(item.body) as StoredConversation;
            const view=summaryView(record,0,0,record.view.updatedAt);
            db.prepare('UPDATE conversations SET summary=?,message_signature=?,activity_at=?,is_active=? WHERE id=?').run(JSON.stringify(view),messageSignature(record),record.view.updatedAt,Number(view.activity!.active),item.id);
          }
          db.exec('PRAGMA user_version=2; COMMIT;');
        }
        if (write && row.user_version < 3) {
          db.exec('BEGIN IMMEDIATE; ALTER TABLE conversations ADD COLUMN user_at TEXT NOT NULL DEFAULT \'\';');
          for (const item of db.prepare('SELECT id,body,activity_at FROM conversations').all() as Array<{id:string;body:string;activity_at:string}>) {
            const at=userActivityAt(JSON.parse(item.body) as StoredConversation)??item.activity_at;
            if (at) db.prepare('UPDATE conversations SET user_at=? WHERE id=?').run(at,item.id);
          }
          db.exec(`DROP INDEX IF EXISTS conversations_activity;
            DROP INDEX IF EXISTS conversations_workspace_activity;
            CREATE INDEX conversations_activity ON conversations(is_active DESC,user_at DESC,id DESC);
            CREATE INDEX conversations_workspace_activity ON conversations(workspace_id,is_active DESC,user_at DESC,id DESC);
            PRAGMA user_version=3; COMMIT;`);
        }
        if (write && row.user_version < 4) db.exec('PRAGMA user_version=4');
        if (write) {
          ConversationReadModel.install(db);
          if (row.user_version < 5) migrateConversationEntries(db);
          if (row.user_version < 6) {
            // The migration owner excludes incompatible writers. Enable incremental
            // reclamation once here, so normal maintenance never needs a full VACUUM.
            if (Number(db.prepare('PRAGMA auto_vacuum').get()!.auto_vacuum)!==2) {
              db.exec('PRAGMA auto_vacuum=INCREMENTAL; VACUUM');
            }
            db.exec(`BEGIN IMMEDIATE; DROP TRIGGER IF EXISTS conversation_body_format_insert; DROP TRIGGER IF EXISTS conversation_body_format_update;
              UPDATE conversations SET body=json_set(body,'$._bodyFormat',6);
              ${['INSERT','UPDATE OF body'].map((op,index) => `CREATE TRIGGER conversation_body_format_${index ? 'update' : 'insert'} BEFORE ${op} ON conversations
                WHEN json_extract(NEW.body,'$._bodyFormat') IS NOT 6 OR json_array_length(NEW.body,'$.view.entries')>0 OR json_array_length(NEW.body,'$.inheritedContext.entries')>0
                BEGIN SELECT RAISE(ABORT,'agent_storage_writer_incompatible'); END;`).join('\n')}
              PRAGMA user_version=6; COMMIT;`);
          }
          if(row.user_version<7) {
            db.exec(`BEGIN IMMEDIATE; DROP TRIGGER IF EXISTS conversation_body_format_insert; DROP TRIGGER IF EXISTS conversation_body_format_update;
              UPDATE conversations SET body=json_set(body,'$._bodyFormat',7);
              ${['INSERT','UPDATE OF body'].map((op,index)=>`CREATE TRIGGER conversation_body_format_${index?'update':'insert'} BEFORE ${op} ON conversations
                WHEN json_extract(NEW.body,'$._bodyFormat') IS NOT 7 OR json_array_length(NEW.body,'$.view.entries')>0 OR json_array_length(NEW.body,'$.inheritedContext.entries')>0
                BEGIN SELECT RAISE(ABORT,'agent_storage_writer_incompatible'); END;`).join('\n')}
              PRAGMA user_version=7; COMMIT;`);
          }
          if(row.user_version < 8) {
            db.exec(`BEGIN IMMEDIATE; DROP TRIGGER IF EXISTS conversation_body_format_insert; DROP TRIGGER IF EXISTS conversation_body_format_update;
              UPDATE conversations SET body=json_set(body,'$._bodyFormat',8);
              ${['INSERT','UPDATE OF body'].map((op,index)=>`CREATE TRIGGER conversation_body_format_${index?'update':'insert'} BEFORE ${op} ON conversations
                WHEN json_extract(NEW.body,'$._bodyFormat') IS NOT 8 OR json_array_length(NEW.body,'$.view.entries')>0 OR json_array_length(NEW.body,'$.inheritedContext.entries')>0
                BEGIN SELECT RAISE(ABORT,'agent_storage_writer_incompatible'); END;`).join('\n')}
              PRAGMA user_version=8; COMMIT;`);
          }
          if(row.user_version < 9) {
            db.exec(`BEGIN IMMEDIATE; DROP TRIGGER IF EXISTS conversation_body_format_insert; DROP TRIGGER IF EXISTS conversation_body_format_update;
              UPDATE conversations SET body=json_set(body,'$._bodyFormat',9);
              ${['INSERT','UPDATE OF body'].map((op,index)=>`CREATE TRIGGER conversation_body_format_${index?'update':'insert'} BEFORE ${op} ON conversations
                WHEN json_extract(NEW.body,'$._bodyFormat') IS NOT 9 OR json_array_length(NEW.body,'$.view.entries')>0 OR json_array_length(NEW.body,'$.inheritedContext.entries')>0
                BEGIN SELECT RAISE(ABORT,'agent_storage_writer_incompatible'); END;`).join('\n')}
              PRAGMA user_version=9; COMMIT;`);
          }
          const HAS_WORK = hasWork(db);
        db.exec('CREATE TABLE IF NOT EXISTS conversation_participation (id TEXT PRIMARY KEY, revision TEXT NOT NULL, body TEXT NOT NULL)');
          // Rebuildable acceleration, not a storage-version change. SQLite also
          // maintains this predicate when an older retained writer changes body.
          // Keeping the list fields here avoids reading large history pages.
          try {
            const listIndex = db.prepare("SELECT sql FROM sqlite_master WHERE name='conversations_list_summary'").get() as {sql:string}|undefined;
            if (listIndex && !listIndex.sql.includes('is_active DESC,user_at DESC')) db.exec('DROP INDEX conversations_list_summary');
            db.exec(`CREATE INDEX IF NOT EXISTS conversations_list_summary
              ON conversations(workspace_id,is_active DESC,user_at DESC,id DESC,hidden,activity_version,seen_version,summary,activity_at)
              WHERE ${HAS_WORK}`);
          } catch (error) {
            // An unrelated damaged history must not make this optional
            // acceleration a prerequisite for saving an otherwise valid row.
            if (!(error instanceof Error) || error.message !== 'malformed JSON') throw error;
          }
          // Rebuildable child lookup acceleration, same pattern as the list
          // index: expression keys are maintained on write so polling children
          // never parses every historical header.
          try {
            db.exec(`CREATE INDEX IF NOT EXISTS conversations_child_lookup
              ON conversations(workspace_id, json_extract(body,'$.view.childOf.conversationId'))
              WHERE json_valid(body)`);
          } catch (error) {
            if (!(error instanceof Error) || error.message !== 'malformed JSON') throw error;
          }
          fs.chmodSync(this.filename, 0o600);
        }
        ConversationEntryStore.installSearch(db);
        migration?.complete();
        return db;
      } catch (error) { db.close(); throw error; } finally { migration?.release(); }
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
  participationProjections(workspaceId: string): {projections: ParticipationProjection[]; incomplete: boolean} {
    const db=this.open(false); if(!db)return {projections:[],incomplete:false};
    try {
      if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='conversation_participation'").get())return {projections:[],incomplete:true};
      const projections:ParticipationProjection[]=[];let incomplete=false,bytes=0,count=0;
      for(const value of db.prepare('SELECT c.id,c.revision,p.revision AS indexed,p.body FROM conversations c LEFT JOIN conversation_participation p ON p.id=c.id WHERE c.workspace_id=? ORDER BY c.id').iterate(workspaceId)) {
        const row=value as {id:string;revision:string;indexed?:string;body?:string};
        if(++count>5000 || (bytes+=Buffer.byteLength(row.body??''))>16*1024*1024){incomplete=true;break;}
        if(row.indexed!==row.revision || !row.body){incomplete=true;this.queueReadRepair(row.id);continue;}
        try{const projection=JSON.parse(row.body) as ParticipationProjection;if(projection.version!==1||projection.parserVersion!==1)throw new Error('stale-participation-index');projections.push(projection);}catch{incomplete=true;this.queueReadRepair(row.id);}
      }
      return {projections,incomplete};
    }finally{db.close();}
  }
  readConversation(id: string): StoredConversation | undefined {
    const db = this.open(false); if (!db) return;
    try { const modern=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version>=2; const row = db.prepare(`SELECT body${modern?',summary':''} FROM conversations WHERE id=?`).get(id) as {body:string;summary?:string}|undefined; if(!row)return;const record=ConversationEntryStore.hydrate(db,JSON.parse(row.body) as StoredConversation,this.nativeReader);if(row.summary)record.view.activity=JSON.parse(row.summary).activity;return record; }
    finally { db.close(); }
  }
  /** Explicit startup maintenance; ordinary reads never initialize or migrate storage. */
  startReadModels(): void {
    if (!fs.existsSync(this.filename)) return;
    const db = this.open(true)!;
    try {
      for (const row of db.prepare("SELECT c.id FROM conversations c LEFT JOIN conversation_read_states s ON c.id=s.id LEFT JOIN conversation_participation p ON p.id=c.id WHERE s.message_revision IS NULL OR s.message_revision<>c.revision OR json_extract(s.state,'$.continuationVersion') IS NOT 1 OR p.revision IS NULL OR p.revision<>c.revision").all() as Array<{id:string}>) this.queueReadRepair(row.id);
    } finally { db.close(); }
  }
  stopReadModels(): void { this.stopped = true; this.repairs.clear(); }
  private queueReadRepair(id: string): void {
    if (this.stopped) return;
    this.repairs.add(id);
    if (this.repairScheduled) return;
    this.repairScheduled = true;
    setImmediate(() => {
      this.repairScheduled = false;
      const next = this.repairs.values().next().value;
      if (!next || this.stopped) return;
      this.repairs.delete(next);
      try { this.rebuildReadModel(next); } catch { /* Preserve the canonical row; another observation can retry this row. */ }
      const following = this.repairs.values().next().value;
      if (following) this.queueReadRepair(following);
    }).unref();
  }
  rebuildReadModel(id: string): void {
    const record = this.readConversation(id); if (!record) return;
    const db = this.open(true)!;
    try {
      db.exec('BEGIN IMMEDIATE');
      const current = db.prepare('SELECT revision FROM conversations WHERE id=?').get(id) as {revision:string}|undefined;
      if (current?.revision === record.view.revision) {
        // Ordinary saves already commit the header and entries atomically. The
        // queued participation refresh must not rewrite that canonical history.
        const messages = db.prepare("SELECT revision,message_revision,json_extract(state,'$.continuationVersion') AS continuation_version FROM conversation_read_states WHERE id=?").get(id) as {revision:string;message_revision:string|null;continuation_version:number|null}|undefined;
        if (messages?.revision !== current.revision || messages.message_revision !== current.revision || messages.continuation_version !== 1) {
          ConversationReadModel.saveHeader(db, record);
          ConversationReadModel.saveEntries(db, record);
        }
        db.prepare('INSERT INTO conversation_participation(id,revision,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body').run(id,record.view.revision,JSON.stringify(projectParticipation(record)));
      }
      else this.queueReadRepair(id);
      db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; } finally { db.close(); }
  }
  readPage(id:string, before?:number, limit?:number, compactTools=false): ConversationReadState | undefined {
    const db=this.open(false);if(!db)return;
    try {
      if (ConversationReadModel.available(db)) {
        db.exec('BEGIN');
        const page=ConversationReadModel.page(db,id,before,limit,compactTools,this.nativeReader);
        if(page)return page;
        this.queueReadRepair(id);
      }
    } finally {db.close();}
    return undefined;
  }
  readEntry(id:string,entryId:string,revision:string) {
    const db=this.open(false);if(!db)return;
    try {
      if(ConversationReadModel.available(db)){
        db.exec('BEGIN');
        if (ConversationEntryStore.available(db)) {
          const header=db.prepare('SELECT 1 FROM conversation_read_states WHERE id=? AND message_revision=revision').get(id);
          const row=header && ConversationEntryStore.content(db,id,entryId);
          if(row){if(row.content_revision!==revision)fail('agent_entry_changed','工具记录已变化，请重新读取当前对话。',409);return ConversationEntryStore.decode(row,this.nativeReader);}
        } else {
        const row=db.prepare('SELECT e.body,e.content_revision FROM conversation_read_entries e JOIN conversation_read_states s ON s.id=e.conversation_id AND s.message_revision=s.revision WHERE s.id=? AND e.id=?').get(id,entryId) as {body:string;content_revision:string}|undefined;
        if(row){if(row.content_revision!==revision)fail('agent_entry_changed','工具记录已变化，请重新读取当前对话。',409);return JSON.parse(row.body) as import('../contracts.ts').ConversationEntry;}
        }
      }
    }finally{db.close();}
    const entry=this.readConversation(id)?.view.entries.find(entry=>entry.id===entryId);
    if(entry){if(createHash('sha256').update(JSON.stringify(entry)).digest('hex')!==revision)fail('agent_entry_changed','工具记录已变化，请重新读取当前对话。',409);return entry;}
  }
  readToolReferences(id:string):Map<string,NativeToolContent> {
    const refs=new Map<string,NativeToolContent>(),db=this.open(false);if(!db)return refs;
    try{
      for(const row of db.prepare("SELECT c.* FROM conversation_entry_contents c JOIN conversation_read_entries e USING(conversation_id,content_revision) WHERE c.conversation_id=? AND c.codec='native-tool'").all(id)){
        const ref=ConversationEntryStore.reference(row as any);
        if(ref?.version===3&&ref.entry.kind==='tool'&&ref.entry.text===''&&!ref.entry.input&&!ref.text.length&&!ref.input?.length)refs.set(ref.entry.id+':'+row.content_revision,ref);
      }
      return refs;
    }finally{db.close();}
  }
  readNativeReference(ref:NativeToolContent,revision:string) {
    if(ref.version!==3||createHash('sha256').update(JSON.stringify(ref)).digest('hex')!==revision)fail('agent_entry_corrupt','原生工具引用的修订不一致。',409);
    return this.nativeReader.tool(ref,revision);
  }
  /** Every canonical header contributes native references, including historical
   * participants and all attempts. A missing database proves no conversations;
   * an unreadable one proves nothing and retains the affected scope. */
  readNativeHeaders(): { complete: boolean; headers: Array<{ view: { id: string; cwd: string }; participants: StoredParticipant[]; attempts: StoredConversation['attempts'] }> } {
    let db: DatabaseSync | undefined;
    try {
      db = this.open(false);
      if (!db) return { complete: true, headers: [] };
      db.exec('BEGIN');
      const headers: Array<{ view: { id: string; cwd: string }; participants: StoredParticipant[]; attempts: StoredConversation['attempts'] }> = [];
      for (const row of db.prepare(`SELECT json_object('view',json_object('id',json_extract(body,'$.view.id'),'cwd',json_extract(body,'$.view.cwd')),
        'participants',json_extract(body,'$.participants'),'attempts',json_extract(body,'$.attempts')) AS header FROM conversations`).iterate()) {
        const header = JSON.parse(row.header as string);
        if (typeof header?.view?.id !== 'string' || typeof header?.view?.cwd !== 'string' || !Array.isArray(header.participants) || !Array.isArray(header.attempts)) throw new Error('invalid_native_header');
        if (header.participants.some((participant: { id?: unknown; provider?: unknown }) => typeof participant?.id !== 'string' || typeof participant?.provider !== 'string') ||
            header.attempts.some((attempt: { participantId?: unknown; accepted?: unknown }) => typeof attempt?.participantId !== 'string' || attempt?.accepted !== undefined && typeof attempt.accepted !== 'boolean')) throw new Error('invalid_native_attempt');
        headers.push(header);
      }
      return { complete: true, headers };
    } catch { return { complete: false, headers: [] }; }
    finally { try { db?.exec('COMMIT'); } catch { /* No transaction to commit. */ } db?.close(); }
  }
  /** All durable native tool references, including legacy encodings and rows
   * no longer reachable from the current read model. */
  readNativeToolReferences(): { complete: boolean; references: NativeToolContent[] } {
    let db: DatabaseSync | undefined;
    try {
      db = this.open(false);
      if (!db) return { complete: true, references: [] };
      if (!ConversationEntryStore.available(db)) return { complete: false, references: [] };
      db.exec('BEGIN');
      const references: NativeToolContent[] = [];
      for (const row of db.prepare("SELECT codec,body,body_bytes,content_revision FROM conversation_entry_contents WHERE codec IN ('native-tool','native-v1','native-v2','native-v2-zstd')").iterate()) {
        const reference = ConversationEntryStore.reference(row as { content_revision: string; codec: string; body_bytes: number; body: string | Uint8Array });
        if (!reference) throw new Error('native_reference_unreadable');
        references.push(reference);
      }
      return { complete: true, references };
    } catch { return { complete: false, references: [] }; }
    finally { try { db?.exec('COMMIT'); } catch { /* No transaction to commit. */ } db?.close(); }
  }
  readRevision(id:string):{revision:string;seenThrough?:number}|undefined {
    const db=this.open(false);if(!db)return;
    try{if(ConversationReadModel.available(db)){const row=db.prepare("SELECT revision,json_extract(state,'$.view.activity.seenThrough') AS seenThrough FROM conversation_read_states WHERE id=?").get(id) as {revision:string;seenThrough?:number}|undefined;if(row)return row;}const row=db.prepare('SELECT revision,summary FROM conversations WHERE id=?').get(id) as {revision:string;summary:string}|undefined;return row?{revision:row.revision,seenThrough:JSON.parse(row.summary)?.activity?.seenThrough}:undefined;}finally{db.close();}
  }
  readState(id:string):ConversationReadState|undefined {
    const db=this.open(false);if(!db)return;
    try{if(ConversationReadModel.available(db)){const row=db.prepare('SELECT state FROM conversation_read_states WHERE id=?').get(id) as {state:string}|undefined;if(row)return JSON.parse(row.state);}}finally{db.close();}
    return this.readConversation(id);
  }
  /** Canonical headers only: maintenance never loads message bodies or trusts optional read caches. */
  storageDependencies(onReference?: (record: {view: Pick<StoredConversation['view'], 'id' | 'cwd'>}, participant: StoredParticipant, bindingIdentity?: string, consumer?: {run?: RunView; executionRef?: import('../contracts.ts').ExecutionRef; pending: boolean}) => void): { complete: boolean; contexts: string[] } {
    let db: DatabaseSync | undefined;
    try {
      db = this.open(false);
      if (!db) return { complete: false, contexts: [] };
      db.exec('BEGIN');
      const contexts = new Set<string>();
      const needsEvidence = (run: RunView) => unfinishedRun(run) || run.resourcesReleased !== true || run.executionState === 'unknown' || run.executionState === 'active';
      for (const row of db.prepare(`SELECT json_object(
        'view',json_object('id',json_extract(body,'$.view.id'),'cwd',json_extract(body,'$.view.cwd')),
        'participants',json_extract(body,'$.participants'),'attempts',json_extract(body,'$.attempts'),
        'outcomes',json_extract(body,'$.runOutcomes'),'run',json_extract(body,'$.view.run'),
        'retainedRuns',json_extract(body,'$.view.retainedRuns'),'requests',json_extract(body,'$.view.requests')) AS header FROM conversations`).iterate()) {
        const header = JSON.parse(row.header as string);
        if (!Array.isArray(header.participants) || !Array.isArray(header.requests) || !Array.isArray(header.attempts) ||
            !Array.isArray(header.retainedRuns ?? [])) throw new Error('invalid_storage_header');
        const runs = [header.run, ...(header.retainedRuns ?? [])].filter(Boolean);
        if ([...runs, ...header.attempts, ...header.requests].some(item =>
          !header.participants.some((participant: {id: string}) => participant.id === item.participantId))) throw new Error('invalid_storage_participant');
        for (const participant of header.participants) {
          if (typeof participant.id !== 'string' || typeof participant.provider !== 'string') throw new Error('invalid_storage_participant');
          const preserve = (context: unknown, bindingIdentity?: string, consumer?: {run?: RunView; executionRef?: import('../contracts.ts').ExecutionRef; pending: boolean}) => {
            if (context === undefined) { onReference?.({view: header.view}, participant, bindingIdentity, consumer); return; } // Starting work still owns its environment before native context creation.
            if (typeof context !== 'string' || !context) throw new Error('invalid_storage_context');
            contexts.add(`${participant.provider}:${context}`);
            onReference?.({view: header.view}, participant, bindingIdentity, consumer);
          };
          const pending = header.requests.some((request: {participantId: string; runId: string}) => request.participantId === participant.id || runs.some(run => run.id === request.runId && run.participantId === participant.id));
          if (pending) preserve(participant.contextRef?.id, undefined, {pending: true});
          for (const run of runs.filter(run => run.participantId === participant.id && needsEvidence(run))) {
            const attempt = header.attempts.find((attempt: {runId: string; participantId: string}) => attempt.runId === run.id && attempt.participantId === participant.id);
            preserve(participant.contextRef?.id, undefined, {run, executionRef: attempt?.executionRef, pending: false});
          }
          for (const attempt of header.attempts.filter((attempt: {participantId: string}) => attempt.participantId === participant.id)) {
            const run = runs.find(run => run.id === attempt.runId), outcome = header.outcomes?.[attempt.runId];
            // Retained rounds can still refer to a replaced context; current participant state is insufficient.
            if ((run ? needsEvidence(run) : !['completed', 'failed', 'stopped'].includes(outcome?.status)) ||
                header.requests.some((request: {runId: string}) => request.runId === attempt.runId)) {
              preserve(attempt.executionRef?.data?.resourceContext ?? participant.contextRef?.id, attempt.executionRef?.data?.resourceBinding, {run, executionRef: attempt.executionRef, pending: header.requests.some((request: {runId: string}) => request.runId === attempt.runId)});
            }
          }
        }
      }
      return { complete: true, contexts: [...contexts] };
    } catch { return { complete: false, contexts: [] }; }
    finally { db?.close(); }
  }
  listPendingStates(includeActive=false): ConversationReadState[] {
    const db=this.open(false);if(!db)return [];
    try{
      if(!ConversationReadModel.available(db))return this.listPending(includeActive).map(({view,participants,attachments})=>({view:{...view,entries:[]},participants,attachments}));
      db.exec('BEGIN');
      const field=includeActive?'active':'pending';
      const states=(db.prepare(`SELECT state FROM conversation_read_states WHERE ${field}=1 ORDER BY updated_at DESC`).all() as Array<{state:string}>).map(row=>JSON.parse(row.state) as ConversationReadState);
      // Unmigrated records are the only fallback; the anti-join reads IDs, not historical bodies.
      for(const row of db.prepare('SELECT c.body FROM conversations c LEFT JOIN conversation_read_states s ON c.id=s.id WHERE s.id IS NULL').all() as Array<{body:string}>){const record=JSON.parse(row.body) as StoredConversation;this.queueReadRepair(record.view.id);if(this.isPending(record,includeActive))states.push({view:{...record.view,entries:[]},participants:record.participants,attachments:record.attachments});}
      return states;
    }finally{db.close();}
  }
  private isPending(record:ConversationReadState,includeActive:boolean):boolean {
    return Boolean(record.view.requests.length || record.view.retainedRuns?.some(unfinishedRun) || record.view.run?.tools.some(tool=>tool.status!=='completed') || (includeActive ? ['starting','running','waiting-approval','waiting-question','stopping','unknown','tools-active'] : ['unknown','tools-active']).includes(record.view.run?.status ?? ''));
  }
  listConversations(workspaceId: string, options: { parentConversationId?: string; taskId?: string; workspaceIds?:string[]; before?: string; limit: number; includeHidden?: boolean; query?: string; active?: boolean; attention?: boolean }): ConversationReadState[] {
    const db = this.open(false); if (!db) return [];
    try {
      const modern=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version>=2;
      const HAS_WORK=hasWork(db);
      const indexed=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='conversations_list_summary'").get();
      const header=ConversationReadModel.available(db)?"coalesce((SELECT state FROM conversation_read_states s WHERE s.id=c.id AND s.revision=c.revision),json_set(c.body,'$.view.entries',json('[]')))":"json_set(c.body,'$.view.entries',json('[]'))";
      // The partial index proves HAS_WORK without parsing every historical body.
      // Version-matched headers carry task links, child identity and live tools.
      const childIndexed=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='conversations_child_lookup'").get();
      const childLookup=Boolean(options.parentConversationId)&&childIndexed;
      const sourceValues: Array<string | number> = childLookup ? [workspaceId, options.parentConversationId!] : [];
      const source=childLookup
        ?`(SELECT c.*,${header} AS read_state FROM conversations c INDEXED BY conversations_child_lookup WHERE c.workspace_id=? AND json_valid(c.body) AND json_extract(c.body,'$.view.childOf.conversationId')=? AND ${HAS_WORK})`
        :`(SELECT c.*,${header} AS read_state FROM conversations c ${indexed?'INDEXED BY conversations_list_summary':''} WHERE ${HAS_WORK})`;
      const where: string[] = options.taskId?[]:['workspace_id=?']; const values: Array<string | number> = options.taskId?[]:[workspaceId];
      if(options.taskId&&options.workspaceIds){if(!options.workspaceIds.length)return [];where.push(`workspace_id IN (${options.workspaceIds.map(()=>'?').join(',')})`);values.push(...options.workspaceIds);}
      if (!options.includeHidden) where.push('hidden=0');
      if (options.taskId) { where.push("(EXISTS(SELECT 1 FROM json_each(read_state,'$.view.taskLinks') WHERE json_extract(value,'$.workspaceId')=? AND json_extract(value,'$.taskId')=?) OR (json_type(read_state,'$.view.taskLinks') IS NULL AND workspace_id=? AND ((json_type(read_state,'$.view.taskIds') IS NULL AND task_id=?) OR EXISTS(SELECT 1 FROM json_each(read_state,'$.view.taskIds') WHERE value=?))))"); values.push(workspaceId,options.taskId,workspaceId,options.taskId,options.taskId); }
      if (options.parentConversationId && !childLookup) { where.push("json_extract(read_state,'$.view.childOf.conversationId')=?"); values.push(options.parentConversationId); }
      const terms = searchTerms(options.query);
      if (terms.length) { where.push(searchClause(terms, "json_extract(read_state,'$.view.title')")); for (const term of terms) values.push(term, term, term); }
      // Apply programmatic list filters before the page bound. Filtering after
      // LIMIT would return short pages even when more matching rows exist.
      // Older stores have no compact summary column; callers retain their
      // in-memory compatibility filter for that read-only case.
      const pendingActive = options.active && modern
        ? new PendingSendRepository(this.directory).activitySummaries(options.taskId ? (options.workspaceIds ?? [workspaceId]) : [workspaceId])
        : [];
      const pendingIds = [...new Set(pendingActive.map(item => item.conversationId))];
      if (options.active && modern) {
        where.push(pendingIds.length
          ? `(json_extract(summary,'$.activity.active')=1 OR id IN (${pendingIds.map(() => '?').join(',')}))`
          : "json_extract(summary,'$.activity.active')=1");
        values.push(...pendingIds);
      }
      if (options.attention && modern) where.push("(coalesce(json_extract(summary,'$.activity.pendingDecisionCount'),0)>0 OR coalesce(json_extract(summary,'$.run.status'),json_extract(read_state,'$.view.run.status')) IN ('failed','unknown'))");
      if (options.before) { where.push('(updated_at || \'/\' || id) < ?'); values.push(options.before); }
      values.push(options.limit);
      return (db.prepare(`SELECT read_state${modern?',summary':''} FROM ${source} WHERE ${where.length?where.join(' AND '):'1'} ORDER BY updated_at DESC,id DESC LIMIT ?`).all(...sourceValues,...values) as {read_state:string;summary?:string}[]).map(row=>{
        const record=JSON.parse(row.read_state) as ConversationReadState;
        if(row.summary)record.view.activity=JSON.parse(row.summary).activity;
        if(pendingIds.includes(record.view.id))record.view.activity={...(record.view.activity??{version:0,seenThrough:0,updatedAt:record.view.updatedAt}),active:true};
        return record;
      });
    } finally { db.close(); }
  }
  listPending(includeActive = false): StoredConversation[] {
    const db = this.open(false); if (!db) return [];
    try { const sql=ConversationReadModel.available(db)?`SELECT c.body FROM conversation_read_states s JOIN conversations c ON c.id=s.id WHERE s.${includeActive?'active':'pending'}=1 UNION ALL SELECT c.body FROM conversations c LEFT JOIN conversation_read_states s ON c.id=s.id WHERE s.id IS NULL`:'SELECT body FROM conversations ORDER BY updated_at DESC';return (db.prepare(sql).all() as {body:string}[]).map(row=>ConversationEntryStore.hydrate(db,JSON.parse(row.body) as StoredConversation,this.nativeReader)).filter(record=>this.isPending(record,includeActive)); }
    finally { db.close(); }
  }
  hasUnfinishedWork(): boolean {
    const db=this.open(false);if(!db)return false;
    try {
      if (ConversationReadModel.available(db)) {
        if (db.prepare('SELECT 1 FROM conversation_read_states WHERE active=1 UNION ALL SELECT 1 FROM conversation_read_states WHERE title_work=1 LIMIT 1').get()) return true;
        return !!db.prepare(`WITH unprojected AS MATERIALIZED (SELECT c.body FROM conversations c LEFT JOIN conversation_read_states s ON c.id=s.id WHERE s.id IS NULL) SELECT 1 FROM unprojected WHERE ${HAS_UNFINISHED} LIMIT 1`).get();
      }
      return !!db.prepare(`SELECT 1 FROM conversations WHERE ${HAS_UNFINISHED} LIMIT 1`).get();
    }
    finally{db.close();}
  }
  listInterruptedTitles(generation:string): StoredConversation[] {
    const db=this.open(false);if(!db)return [];
    try{return (db.prepare("SELECT body FROM conversations WHERE json_extract(body,'$.view.titleState.status')='generating' AND json_extract(body,'$.view.run.generation')<>?").all(generation) as Array<{body:string}>).map(row=>ConversationEntryStore.hydrate(db,JSON.parse(row.body) as StoredConversation,this.nativeReader));}finally{db.close();}
  }
  listTitleFailureCandidates(): StoredConversation[] {
    const db=this.open(false);if(!db)return [];
    try{return (db.prepare("SELECT body FROM conversations WHERE json_extract(body,'$.titleOrigin')='default' AND json_extract(body,'$.view.title')='新对话' AND json_extract(body,'$.view.titleState.status') IN ('failed','unavailable')").all() as Array<{body:string}>).map(row=>ConversationEntryStore.hydrate(db,JSON.parse(row.body) as StoredConversation,this.nativeReader));}finally{db.close();}
  }
  listInterrupted(): StoredConversation[] {
    const db = this.open(false); if (!db) return [];
    try {
      return (db.prepare(`SELECT body FROM conversations WHERE json_extract(body,'$.interruption.runId')=json_extract(body,'$.view.run.id') OR json_extract(body,'$.view.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','unknown','tools-active') ORDER BY updated_at DESC`).all() as {body:string}[]).map(row=>ConversationEntryStore.hydrate(db,JSON.parse(row.body) as StoredConversation,this.nativeReader));
    } finally { db.close(); }
  }
  querySummaries(workspaceIds: string[], input: {draftConversationIds?:string[];workspaceId?:string;activeOnly?:boolean;active?:boolean;attention?:boolean;hidden?:boolean;query?:string;agent?:string;model?:string;activityState?:string;generation?:string;cursor?:string;limit:number}, generationAlive?: (generation:string)=>boolean): {conversations:ConversationView[];nextCursor?:string;total:number;stats:{modelExecutions:Array<{accountId:string;accountLabel:string;model:string;count:number}>;agents:Array<{label:string;count:number}>;models:Array<{label:string;count:number}>;executions:Array<{provider:string;model:string;count:number}>};activityCounts:{pendingSend?:number;active:number;running:number;waiting:number;unseen:number;unknown:number;attention:number}} {
    const empty={conversations:[],total:0,stats:{agents:[],models:[],executions:[],modelExecutions:[]},activityCounts:{active:0,running:0,waiting:0,unseen:0,unknown:0,attention:0}};
    const db=this.open(false);if(!db||!workspaceIds.length){db?.close();return empty;}
    try {
      db.exec('BEGIN');
      const version=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,modern=version>=2;
      // Existing databases stay read-only until a normal write installs the
      // optional index. Prefer it explicitly: the narrower ordering index can
      // otherwise win the planner's estimate and force full-history reads.
      const pendingRows = new PendingSendRepository(this.directory).activitySummaries(input.workspaceId ? workspaceIds.filter(id=>id===input.workspaceId) : workspaceIds);
      const pending = new Map(pendingRows.map(({scope,conversationId,...display})=>[JSON.stringify([scope,conversationId]),JSON.stringify(display)]));
      db.function('buildr_pending_activity',{deterministic:true},(scope,id)=>pending.get(JSON.stringify([scope,id]))??null);
      const sendActivity = pending.size ? 'buildr_pending_activity(workspace_id,id)' : 'NULL';
      const HAS_WORK = pending.size ? `(${hasWork(db)} OR ${sendActivity} IS NOT NULL)` : hasWork(db);
      const indexed=!pending.size&&version>=3&&!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='conversations_list_summary'").get();
      const table=indexed?'conversations INDEXED BY conversations_list_summary':'conversations';
      // Legacy reads remain zero-write and omit private records and full entries.
      const storedSource=version>=3?table:modern?'(SELECT *,activity_at AS user_at FROM conversations)':`(SELECT *,updated_at AS activity_at,updated_at AS user_at,0 AS activity_version,0 AS seen_version,CASE WHEN json_extract(body,'$.view.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown') THEN 1 ELSE 0 END AS is_active,json_set(json_extract(body,'$.view'),'$.entries',json('[]'),'$.requests',json('[]'),'$.activity',json_object('version',0,'seenThrough',0,'updatedAt',updated_at,'active',json(CASE WHEN json_extract(body,'$.view.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown') THEN 'true' ELSE 'false' END))) AS summary FROM conversations)`;
      const ids=[...new Set(input.workspaceId?workspaceIds.filter(id=>id===input.workspaceId):workspaceIds)].sort();
      if(!ids.length)return empty;
      const compactDecisions="json_extract(summary,'$.activity.pendingDecisionCount')";
      // New summaries stay on the covering index. Only legacy/mismatched rows
      // need their current request header (or canonical legacy body) inspected.
      // Retained unknown runs are included because a completed conversation may
      // still carry an old unreleased unknown that should no longer be active.
      const historicalCandidate="is_active=1 AND (json_extract(summary,'$.run.status')='tools-active' OR (json_extract(summary,'$.run.status')='unknown' AND json_extract(summary,'$.run.stopRequested')=1 AND json_extract(summary,'$.run.accepted')=0) OR EXISTS(SELECT 1 FROM json_each(summary,'$.retainedRuns') AS historical WHERE json_extract(historical.value,'$.resourcesReleased')=1 OR json_extract(historical.value,'$.status') IN ('tools-active','unknown')))";
      const compatibility=modern?db.prepare(`SELECT max(${compactDecisions} IS NULL OR json_extract(summary,'$.revision')<>revision) AS decisions,max(${historicalCandidate}) AS historical FROM ${table} WHERE ${indexed?`${HAS_WORK} AND `:''}workspace_id IN (${ids.map(()=>'?').join(',')})`).get(...ids) as {decisions:number;historical:number}:undefined;
      const legacyDecisions=!modern || Boolean(compatibility?.decisions);
      let decisionCount=compactDecisions;
      if(legacyDecisions){
        db.function('buildr_pending_decisions',{deterministic:true},value=>pendingDecisionCount(JSON.parse(String(value))));
        const legacyView="json_remove(json_extract(body,'$.view'),'$.entries')";
        const header=ConversationReadModel.available(db)?`coalesce((SELECT json_extract(state,'$.view') FROM conversation_read_states AS decision_header WHERE decision_header.id=scoped_record.id AND decision_header.revision=scoped_record.revision),${legacyView})`:legacyView;
        decisionCount=`CASE WHEN json_extract(summary,'$.revision')=revision AND ${compactDecisions} IS NOT NULL THEN ${compactDecisions} ELSE buildr_pending_decisions(${header}) END`;
      }
      // Older writers may keep released historical uncertainty active. Reinterpret
      // only these candidate rows using the version-matched tool-bearing header;
      // never infer running tools from the compact summary (which omits them).
      if(compatibility?.historical)db.function('buildr_conversation_active',{deterministic:true},(value,version,seen)=>Number(conversationActive(JSON.parse(String(value)),Number(version),Number(seen))));
      const activityHeader=ConversationReadModel.available(db)?`coalesce((SELECT json_extract(state,'$.view') FROM conversation_read_states AS activity_header WHERE activity_header.id=scoped_record.id AND activity_header.revision=scoped_record.revision),json_remove(json_extract(body,'$.view'),'$.entries'))`:"json_remove(json_extract(body,'$.view'),'$.entries')";
      const listActive=compatibility?.historical?`CASE WHEN ${historicalCandidate} THEN buildr_conversation_active(${activityHeader},activity_version,seen_version) ELSE is_active END`:'is_active';
      const withDecisions=`(SELECT scoped_record.*,${decisionCount} AS pending_decision_count,(${listActive} OR ${sendActivity} IS NOT NULL) AS list_active,${sendActivity} AS send_activity FROM (SELECT * FROM ${storedSource}) AS scoped_record)`;
      const status = "json_extract(summary,'$.run.status')";
      // Parallel owners are still authoritative. Compute this from compact
      // summaries so activity counts and filters need not load full histories.
      const retained = input.generation && generationAlive ? (db.prepare(`SELECT DISTINCT json_extract(summary,'$.run.generation') AS generation FROM ${storedSource} WHERE ${indexed?`${HAS_WORK} AND `:''}workspace_id IN (${ids.map(()=>'?').join(',')}) AND ${status} IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown')`).all(...ids) as Array<{generation:string|null}>).map(row=>row.generation).filter((generation):generation is string=>Boolean(generation&&generation!==input.generation&&generationAlive(generation))) : [];
      const generations = input.generation ? [...new Set([input.generation,...retained])].sort() : [];
      const effectiveStatus = generations.length ? `CASE WHEN coalesce(json_extract(summary,'$.run.generation'),'') NOT IN (${generations.map(()=>'?').join(',')}) AND ${status} IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown') THEN 'unknown' ELSE ${status} END` : status;
      // Residual active rows (e.g. retained unknown runs) must stay explainable as pending confirmation, never silent.
      const state = `CASE WHEN send_activity IS NOT NULL THEN 'send-'||json_extract(send_activity,'$.state') WHEN pending_decision_count>0 THEN 'waiting' WHEN hidden=1 AND list_active=0 THEN NULL WHEN effective_status='unknown' AND list_active=1 THEN 'unknown' WHEN effective_status IN ('waiting-approval','waiting-question') THEN 'waiting' WHEN effective_status IN ('starting','running','stopping') THEN 'running' WHEN activity_version>seen_version THEN 'unseen' WHEN list_active=1 THEN 'unknown' ELSE NULL END`;
      const drafts=new Set(input.draftConversationIds??[]);
      if(drafts.size)db.function('buildr_has_draft',{deterministic:true},id=>Number(drafts.has(String(id))));
      const draftPriority=drafts.size?'WHEN buildr_has_draft(id)=1 THEN 1 ':'';
      const finalReplyAt="json_extract(summary,'$.activity.finalReplyAt')";
      const orderAt=`CASE WHEN sort_priority>1 THEN user_at WHEN json_extract(summary,'$.run.status')='completed' AND json_extract(summary,'$.run.supersededBy') IS NULL AND coalesce(${finalReplyAt},activity_at)>user_at THEN coalesce(${finalReplyAt},activity_at) ELSE user_at END`;
      const source=`(SELECT *,${orderAt} AS order_at FROM (SELECT *,CASE WHEN activity_state IN ('waiting','unseen','send-failed') THEN 3 WHEN list_active=1 THEN 2 ${draftPriority}ELSE 0 END AS sort_priority FROM (SELECT *,${state} AS activity_state FROM (SELECT *,${effectiveStatus} AS effective_status FROM ${withDecisions}))))`;
      // Resolved generations can change outside this scope. Any effect on the
      // actual filtered list is already captured by its membership/order keys.
      const scope=createHash('sha256').update(JSON.stringify(['final-reply-activity-v2',ids,{...input,draftConversationIds:[...drafts].sort(),cursor:undefined,limit:undefined}])).digest('hex');
      const where=[`workspace_id IN (${ids.map(()=>'?').join(',')})`];const values:Array<string|number>=[...generations,...ids];
      if(input.workspaceId){where.push('workspace_id=?');values.push(input.workspaceId);}
      where.push(HAS_WORK);
      const statsWhere=[...where],statsValues=[...values];
      // Materialize only compact, scoped facts once. Search, pagination and
      // execution filters must not narrow the overview's scope.
      const overview = db.prepare(`WITH scoped AS MATERIALIZED (
        SELECT activity_state,effective_status,pending_decision_count,send_activity,list_active,
          json_extract(summary,'$.run.status') AS run_status,
          coalesce(nullif(json_extract(summary,'$.run.provider'),''),'未指定') AS provider,
          coalesce(nullif(json_extract(summary,'$.run.model'),''),'未指定') AS model,
          coalesce(nullif(json_extract(summary,'$.run.modelAccountId'),''),'unknown:'||id) AS account_id,
          json_extract(summary,'$.run.modelSourceLabel') AS account_label
        FROM ${source} WHERE ${statsWhere.join(' AND ')}
      ), executing AS MATERIALIZED (
        SELECT provider,model,account_id,account_label FROM scoped
        WHERE effective_status IN ('starting','running','stopping')
      ) SELECT
        (SELECT json_object('active',coalesce(sum(list_active=1 OR pending_decision_count>0),0),
          'running',coalesce(sum(effective_status IN ('starting','running','stopping')),0),
          'waiting',coalesce(sum(activity_state='waiting' OR (send_activity IS NOT NULL AND (pending_decision_count>0 OR effective_status IN ('waiting-approval','waiting-question')))),0),
          'unseen',coalesce(sum(activity_state='unseen'),0),
          'unknown',coalesce(sum(activity_state='unknown'),0),
          'attention',coalesce(sum(pending_decision_count>0 OR run_status IN ('failed','unknown')),0)) FROM scoped) AS counts,
        (SELECT count(*) FROM scoped WHERE send_activity IS NOT NULL) AS send_count,
        (SELECT json_group_array(json_object('label',label,'count',n)) FROM (
          SELECT provider AS label,count(*) AS n FROM executing GROUP BY label ORDER BY n DESC,label
        )) AS agents,
        (SELECT json_group_array(json_object('label',label,'count',n)) FROM (
          SELECT model AS label,count(*) AS n FROM executing GROUP BY label ORDER BY n DESC,label
        )) AS models,
        (SELECT json_group_array(json_object('provider',provider,'model',model,'count',n)) FROM (
          SELECT provider,model,count(*) AS n FROM executing GROUP BY provider,model ORDER BY n DESC,provider,model
        )) AS executions,
        (SELECT json_group_array(json_object('accountId',account_id,'accountLabel',account_label,'model',model,'count',n)) FROM (
          SELECT account_id,coalesce(nullif(max(account_label),''),'供应商未记录') AS account_label,model,count(*) AS n
          FROM executing GROUP BY account_id,model ORDER BY n DESC,account_id,model
        )) AS model_executions`).get(...statsValues) as {counts:string;send_count:number;agents:string;models:string;executions:string;model_executions:string};
      const counts = {...JSON.parse(overview.counts),...(overview.send_count?{pendingSend:overview.send_count}:{})} as typeof empty.activityCounts;
      const stats = {
        agents: JSON.parse(overview.agents) as typeof empty.stats.agents,
        models: JSON.parse(overview.models) as typeof empty.stats.models,
        executions: JSON.parse(overview.executions) as typeof empty.stats.executions,
        modelExecutions: JSON.parse(overview.model_executions) as typeof empty.stats.modelExecutions,
      };
      if(input.activityState) {
        if(!['running','waiting','unseen','unknown','attention','send-waiting','send-failed'].includes(input.activityState))fail('agent_activity_state_invalid','活动分类无效。',400);
        where.push(input.activityState==='attention'?"(activity_state IN ('waiting','unseen','unknown') OR (send_activity IS NOT NULL AND pending_decision_count>0))":input.activityState==='running'?"effective_status IN ('starting','running','stopping')":input.activityState==='waiting'?"(activity_state='waiting' OR (send_activity IS NOT NULL AND (pending_decision_count>0 OR effective_status IN ('waiting-approval','waiting-question'))))":'activity_state=?');
        if(!['attention','running','waiting'].includes(input.activityState))values.push(input.activityState);
      }
      if(input.activeOnly||input.active)where.push('(list_active=1 OR pending_decision_count>0)');
      else {where.push('(list_active=1 OR pending_decision_count>0 OR hidden=?)');values.push(Number(input.hidden===true));}
      if(input.attention)where.push("(pending_decision_count>0 OR json_extract(summary,'$.run.status') IN ('failed','unknown'))");
      const terms=searchTerms(input.query);
      if(terms.length){where.push(searchClause(terms,"json_extract(summary,'$.title')"));for(const term of terms)values.push(term,term,term);}
      if(input.agent||input.model)where.push("effective_status IN ('starting','running','stopping')");
      if(input.agent){where.push("coalesce(nullif(json_extract(summary,'$.run.provider'),''),'未指定')=?");values.push(input.agent);}
      if(input.model){where.push("coalesce(nullif(json_extract(summary,'$.run.model'),''),'未指定')=?");values.push(input.model);}
      // A continuation protects the filtered membership and ordering, not every
      // persisted message/metadata update. The global epoch also changes for
      // streaming output and unrelated workspaces, making live lists unusable.
      // Aggregate compact keys alongside the existing count in this read
      // transaction; no full histories or server-side snapshots are retained.
      const membership=db.prepare(`SELECT count(*) AS n,
        json_group_array(json_array(id,sort_priority,order_at) ORDER BY id) AS keys
        FROM ${source} WHERE ${where.join(' AND ')}`).get(...values) as {n:number;keys:string};
      const total=membership.n;
      const epoch=createHash('sha256').update(membership.keys).digest('hex');
      if(input.cursor){
        let cursor:{scope:string;epoch:string;priority:number;at:string;id:string};
        try{cursor=JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8'));}catch{fail('agent_cursor_invalid','对话列表位置无效，请刷新列表。',409);}
        if(!cursor||typeof cursor!=='object'||cursor.scope!==scope||cursor.epoch!==epoch||typeof cursor.at!=='string'||typeof cursor.id!=='string'||![0,1,2,3].includes(cursor.priority))fail('agent_cursor_stale','对话列表顺序已变化，请刷新后继续。',409);
        where.push('(sort_priority < ? OR (sort_priority=? AND (order_at < ? OR (order_at=? AND id < ?))))');values.push(cursor.priority,cursor.priority,cursor.at,cursor.at,cursor.id);
      }
      const snippet=terms.length?`, ${searchSnippet(terms)} AS search_snippet`:'';
      const snippetValues=terms.length?[...terms.flatMap(term=>[term,term]),...terms]:[];
      const rows=db.prepare(`SELECT summary,sort_priority,list_active,user_at,activity_at,pending_decision_count,send_activity,id,order_at${snippet} FROM ${source} WHERE ${where.join(' AND ')} ORDER BY sort_priority DESC,order_at DESC,id DESC LIMIT ?`).all(...snippetValues,...values,input.limit+1) as Array<{summary:string;sort_priority:number;list_active:number;user_at:string;activity_at:string;pending_decision_count:number;send_activity:string|null;id:string;order_at:string;search_snippet?:string|null}>;
      const chosen=rows.slice(0,input.limit),last=chosen.at(-1);
      return {conversations:chosen.map(row=>{const view=JSON.parse(row.summary) as ConversationView;const snippetText=row.search_snippet?.replace(/\s+/g,' ').trim();return {...view,...(snippetText?{searchSnippet:snippetText}:{}),activity:view.activity?{...view.activity,userInputAt:row.user_at||undefined,updatedAt:row.activity_at,pendingDecisionCount:row.pending_decision_count,pendingSend:row.send_activity?JSON.parse(row.send_activity):undefined,active:Boolean(row.list_active)||row.pending_decision_count>0}:undefined,entries:[],requests:[],run:view.run?{...view.run,tools:[]}:undefined,participants:view.participants.map(participant=>({...participant,contextId:''}))};}),total,activityCounts:{...counts},stats,nextCursor:rows.length>input.limit&&last?Buffer.from(JSON.stringify({scope,epoch,priority:last.sort_priority,at:last.order_at,id:last.id})).toString('base64url'):undefined};
    }finally{db.close();}
  }
  /** Cheap change key for activity projections: epoch, row counts, unprojected
   * headers, pending sends and parallel-generation liveness. A stable key proves
   * the compact summary projection cannot differ; callers may reuse their last
   * result instead of recomputing the full overview. */
  activityEpoch(workspaceIds: string[], generationAlive?: (generation: string) => boolean): string | undefined {
    const db = this.open(false); if (!db) return undefined;
    try {
      if ((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version < 2) return undefined;
      const ids = [...new Set(workspaceIds)].sort(); if (!ids.length) return undefined;
      const placeholders = ids.map(() => '?').join(',');
      const unprojected = ConversationReadModel.available(db)
        ? (db.prepare(`SELECT count(*) AS n FROM conversation_read_states s JOIN conversations c ON c.id=s.id WHERE s.revision<>c.revision OR s.message_revision IS NULL OR s.message_revision<>c.revision`).get() as { n: number }).n
        : (db.prepare('SELECT count(*) AS n FROM conversations').get() as { n: number }).n;
      const row = db.prepare(`SELECT (SELECT value FROM conversation_epoch WHERE id=1) AS epoch,
        (SELECT count(*) FROM conversations WHERE workspace_id IN (${placeholders})) AS scoped,
        (SELECT count(*) FROM conversations) AS total,
        (SELECT max(updated_at) FROM conversations) AS latest`).get(...ids) as { epoch: number; scoped: number; total: number; latest: string | null };
      const pending = new PendingSendRepository(this.directory).activitySummaries(ids);
      const busy = (db.prepare(`SELECT DISTINCT json_extract(summary,'$.run.generation') AS generation FROM conversations WHERE is_active=1 AND json_extract(summary,'$.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown')`).all() as Array<{ generation: string | null }>)
        .map(item => item.generation).filter((generation): generation is string => Boolean(generation));
      const generations = generationAlive ? busy.map(generation => [generation, generationAlive(generation)]) : busy;
      return JSON.stringify([row.epoch, row.scoped, row.total, row.latest, unprojected, pending, generations]);
    } finally { db.close(); }
  }
  markSeen(workspaceId:string,id:string,through:number): NonNullable<ConversationView['activity']> {
    const db=this.open(true)!;
    try{
      db.exec('BEGIN IMMEDIATE');
      const row=db.prepare('SELECT activity_version,seen_version,summary FROM conversations WHERE id=? AND workspace_id=?').get(id,workspaceId) as {activity_version:number;seen_version:number;summary:string}|undefined;
      if(!row)fail('agent_conversation_missing','该工作空间中没有此对话。',404);
      if(!Number.isSafeInteger(through)||through<0||through>row.activity_version)fail('agent_seen_invalid','查看位置不属于已观察的消息。',409);
      const view=JSON.parse(row.summary) as ConversationView;
      const header=db.prepare("SELECT state FROM conversation_read_states WHERE id=? AND revision=(SELECT revision FROM conversations WHERE id=?)").get(id,id) as {state:string}|undefined;
      const fullView=header?JSON.parse(header.state).view:JSON.parse((db.prepare('SELECT body FROM conversations WHERE id=?').get(id) as {body:string}).body).view;
      const seen=Math.max(row.seen_version,through);
      const activity={...view.activity!,version:row.activity_version,seenThrough:seen,active:conversationActive(fullView,row.activity_version,seen)};
      if(seen!==row.seen_version || activity.active!==view.activity?.active){
        view.activity=activity;
        db.prepare('UPDATE conversations SET seen_version=?,is_active=?,summary=? WHERE id=?').run(seen,Number(activity.active),JSON.stringify(view),id);
        db.exec('UPDATE conversation_epoch SET value=value+1 WHERE id=1');
      }
      db.exec('COMMIT');return activity;
    }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}
  }
  /** textEntryId is only for a caller-proven single-entry mutation of the same saved record. */
  saveConversation(record: StoredConversation, priorRevision?: string, options: {participationUnchanged?:boolean;textEntryId?:string} = {}) {
    const startedAt = performance.now();
    // Preserve optional observations in the original private record, not strict legacy public DTOs.
    for(const entry of record.view.entries)if(entry.participation){const value=normalizeParticipation(entry.participation);delete entry.participation;if(value)(record.participationTools??={})[entry.id]={...value,entryRevision:record.nativeTools?.[entry.id]?undefined:createHash('sha256').update(JSON.stringify(entry)).digest('hex')};}
    const db = this.open(true)!;
    try {
      const textUpdate=priorRevision!==undefined&&options.participationUnchanged&&options.textEntryId&&this.savedRecords.get(record)===priorRevision
        ?ConversationEntryStore.prepareText(db,record,options.textEntryId):undefined;
      this.savedRecords.delete(record);
      const prepared=textUpdate?undefined:ConversationEntryStore.prepare(db,record,this.nativeTool?entry=>this.nativeTool!(record,entry):undefined);
      for(const row of prepared??[]) if(record.nativeTools?.[row.entry.id] && record.participationTools?.[row.entry.id]) record.participationTools[row.entry.id]!.entryRevision=row.revision;
      const preparedAt = performance.now();
      db.exec('BEGIN IMMEDIATE');
      const lockedAt = performance.now();
      const prior = db.prepare('SELECT revision,summary,message_signature,activity_at,user_at,activity_version,seen_version FROM conversations WHERE id=?').get(record.view.id) as {revision:string;summary:string;message_signature:string;activity_at:string;user_at:string;activity_version:number;seen_version:number}|undefined;
      if ((prior?.revision ?? undefined) !== priorRevision) fail('agent_revision_conflict', '对话已变化，请重新读取。', 409);
      const physical=Object.keys(record.attachments).length?db.prepare("SELECT json_extract(body,'$.attachments') AS attachments FROM conversations WHERE id=?").get(record.view.id) as {attachments:string}|undefined:undefined;
      if (physical) {
        const attachments=JSON.parse(physical.attachments) as StoredConversation['attachments'];
        for (const [id,meta] of Object.entries(record.attachments)) {
          const current=attachments[id];
          if (current?.nativeContent && !meta.nativeContent && current.size===meta.size && current.mimeType===meta.mimeType) meta.nativeContent=current.nativeContent;
        }
      }

      ConversationReadModel.saveHeader(db, record);
      db.prepare('INSERT INTO conversations(id,workspace_id,task_id,hidden,updated_at,revision,body,entry_count,inherited_count) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id,hidden=excluded.hidden,updated_at=excluded.updated_at,revision=excluded.revision,body=excluded.body,entry_count=excluded.entry_count,inherited_count=excluded.inherited_count').run(record.view.id, record.view.workspaceId, record.view.taskId ?? null, Number(record.view.hidden), record.view.updatedAt, record.view.revision, ConversationEntryStore.header(record), record.view.entries.length, record.inheritedContext?.entries.length ?? 0);
      const signature=messageSignature(record);
      const version=(prior?.activity_version??0)+(prior&&prior.message_signature!==signature?1:0);
      const messageAt=messageActivityAt(record);
      const activityAt=prior?.activity_at && prior.activity_at >= (messageAt??'') ? prior.activity_at : messageAt??record.view.updatedAt;
      // 保留用户输入时间；列表顺序独立使用消息活动时间。
      const latest=userActivityAt(record);
      const userAt=prior&&prior.user_at>=(latest??'')?prior.user_at:latest??prior?.user_at??record.view.updatedAt;
      const summary=summaryView(record,version,prior?.seen_version??0,activityAt);
      record.view.activity=summary.activity;
      ConversationReadModel.saveHeader(db, record);
      if(textUpdate)ConversationEntryStore.saveText(db,record.view.id,textUpdate);
      else ConversationReadModel.saveEntries(db, record, prepared);
      db.prepare('UPDATE conversations SET summary=?,message_signature=?,activity_at=?,user_at=?,activity_version=?,is_active=? WHERE id=?').run(JSON.stringify(summary),signature,activityAt,userAt,version,Number(summary.activity!.active),record.view.id);
      const before=prior?.summary?JSON.parse(prior.summary) as ConversationView:undefined;
      const rank=(v:ConversationView|undefined)=>JSON.stringify([v?.title,v?.hidden,v?.run?.status,v?.activity,v?.run?.provider,v?.run?.model]);
      if(rank(before)!==rank(summary))db.exec('UPDATE conversation_epoch SET value=value+1 WHERE id=1');
      // Assistant text changes neither tool evidence nor input participation.
      // Carry forward only a valid projection of the exact previous revision;
      // missing/stale projections still take the existing repair path.
      const participationCurrent = options.participationUnchanged && priorRevision !== undefined &&
        db.prepare(`UPDATE conversation_participation SET revision=?,body=json_set(body,'$.revision',?)
          WHERE id=? AND revision=? AND CASE WHEN json_valid(body)
            THEN json_extract(body,'$.version')=1 AND json_extract(body,'$.parserVersion')=1 ELSE 0 END`)
          .run(record.view.revision,record.view.revision,record.view.id,priorRevision).changes === 1;
      db.exec('COMMIT');
      const committedAt = performance.now();
      this.savedRecords.set(record,record.view.revision);
      if (!participationCurrent) this.queueReadRepair(record.view.id);
      return {
        prepareMs: Math.round(preparedAt - startedAt),
        lockWaitMs: Math.round(lockedAt - preparedAt),
        sqliteWriteMs: Math.round(committedAt - lockedAt),
      };
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    finally { db.close(); }
  }
}
