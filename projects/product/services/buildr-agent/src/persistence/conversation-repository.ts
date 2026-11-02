import { createHash } from 'node:crypto';
import { summaryView, messageSignature, messageActivityAt, userActivityAt, pendingDecisionCount, conversationActive } from '../domain/conversation-activity.ts';
import type { ConversationView } from '../contracts.ts';
import { BUSY_STATES, unfinishedRun } from '../domain/agent-state.ts';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { AgentServiceError, fail } from '../domain/agent-state.ts';
import type { StoredConnection, StoredConversation } from '../domain/agent-state.ts';
import { ConversationReadModel, type ConversationReadState } from './conversation-read-model.ts';
import { ConversationEntryStore } from './conversation-entry-store.ts';
import { beginConversationMigration, migrateConversationEntries } from './conversation-migration.ts';

export const CONVERSATION_SCHEMA_VERSION = 5;
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
const searchClause = (terms: string[], title: string, body: string) => terms.map(() => `(instr(lower(${title}),lower(?))>0 OR EXISTS(SELECT 1 FROM conversation_search_entries AS entry WHERE entry.owner_id=id AND ${SEARCH_ENTRY}))`).join(' AND ');
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
      let migration: ReturnType<typeof beginConversationMigration> | undefined;
      try {
        db.exec('PRAGMA busy_timeout=2000');
        const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
        if (row.user_version > SCHEMA_VERSION) fail('agent_storage_newer', '此交互库来自较新版本，请使用匹配的 Buildr。', 409);
        if (write && row.user_version < SCHEMA_VERSION) migration = beginConversationMigration(db, this.directory);
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
          if (row.user_version < SCHEMA_VERSION) migrateConversationEntries(db);
          const HAS_WORK = hasWork(db);
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
  readConversation(id: string): StoredConversation | undefined {
    const db = this.open(false); if (!db) return;
    try { const modern=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version>=2; const row = db.prepare(`SELECT body${modern?',summary':''} FROM conversations WHERE id=?`).get(id) as {body:string;summary?:string}|undefined; if(!row)return;const record=ConversationEntryStore.hydrate(db,JSON.parse(row.body) as StoredConversation);if(row.summary)record.view.activity=JSON.parse(row.summary).activity;return record; }
    finally { db.close(); }
  }
  /** Explicit startup maintenance; ordinary reads never initialize or migrate storage. */
  startReadModels(): void {
    if (!fs.existsSync(this.filename)) return;
    const db = this.open(true)!;
    try {
      for (const row of db.prepare('SELECT c.id FROM conversations c LEFT JOIN conversation_read_states s ON c.id=s.id WHERE s.message_revision IS NULL OR s.message_revision<>c.revision').all() as Array<{id:string}>) this.queueReadRepair(row.id);
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
      if (current?.revision === record.view.revision) { ConversationReadModel.saveHeader(db, record); ConversationReadModel.saveEntries(db, record); }
      else this.queueReadRepair(id);
      db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; } finally { db.close(); }
  }
  readPage(id:string, before?:number, limit?:number, compactTools=false): ConversationReadState | undefined {
    const db=this.open(false);if(!db)return;
    try {
      if (ConversationReadModel.available(db)) {
        db.exec('BEGIN');
        const page=ConversationReadModel.page(db,id,before,limit,compactTools);
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
          if(row){if(row.content_revision!==revision)fail('agent_entry_changed','工具记录已变化，请重新读取当前对话。',409);return ConversationEntryStore.decode(row);}
        } else {
        const row=db.prepare('SELECT e.body,e.content_revision FROM conversation_read_entries e JOIN conversation_read_states s ON s.id=e.conversation_id AND s.message_revision=s.revision WHERE s.id=? AND e.id=?').get(id,entryId) as {body:string;content_revision:string}|undefined;
        if(row){if(row.content_revision!==revision)fail('agent_entry_changed','工具记录已变化，请重新读取当前对话。',409);return JSON.parse(row.body) as import('../contracts.ts').ConversationEntry;}
        }
      }
    }finally{db.close();}
    const entry=this.readConversation(id)?.view.entries.find(entry=>entry.id===entryId);
    if(entry){if(createHash('sha256').update(JSON.stringify(entry)).digest('hex')!==revision)fail('agent_entry_changed','工具记录已变化，请重新读取当前对话。',409);return entry;}
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
  listConversations(workspaceId: string, options: { parentConversationId?: string; taskId?: string; workspaceIds?:string[]; before?: string; limit: number; includeHidden?: boolean; query?: string }): ConversationReadState[] {
    const db = this.open(false); if (!db) return [];
    try {
      const modern=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version>=2;
      const HAS_WORK=hasWork(db);
      const indexed=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='conversations_list_summary'").get();
      const header=ConversationReadModel.available(db)?"coalesce((SELECT state FROM conversation_read_states s WHERE s.id=c.id AND s.revision=c.revision),json_set(c.body,'$.view.entries',json('[]')))":"json_set(c.body,'$.view.entries',json('[]'))";
      // The partial index proves HAS_WORK without parsing every historical body.
      // Version-matched headers carry task links, child identity and live tools.
      const source=`(SELECT c.*,${header} AS read_state FROM conversations c ${indexed?'INDEXED BY conversations_list_summary':''} WHERE ${HAS_WORK})`;
      const where: string[] = options.taskId?[]:['workspace_id=?']; const values: Array<string | number> = options.taskId?[]:[workspaceId];
      if(options.taskId&&options.workspaceIds){if(!options.workspaceIds.length)return [];where.push(`workspace_id IN (${options.workspaceIds.map(()=>'?').join(',')})`);values.push(...options.workspaceIds);}
      if (!options.includeHidden) where.push('hidden=0');
      if (options.taskId) { where.push("(EXISTS(SELECT 1 FROM json_each(read_state,'$.view.taskLinks') WHERE json_extract(value,'$.workspaceId')=? AND json_extract(value,'$.taskId')=?) OR (json_type(read_state,'$.view.taskLinks') IS NULL AND workspace_id=? AND ((json_type(read_state,'$.view.taskIds') IS NULL AND task_id=?) OR EXISTS(SELECT 1 FROM json_each(read_state,'$.view.taskIds') WHERE value=?))))"); values.push(workspaceId,options.taskId,workspaceId,options.taskId,options.taskId); }
      if (options.parentConversationId) { where.push("json_extract(read_state,'$.view.childOf.conversationId')=?"); values.push(options.parentConversationId); }
      const terms = searchTerms(options.query);
      if (terms.length) { where.push(searchClause(terms, "json_extract(read_state,'$.view.title')", 'body')); for (const term of terms) values.push(term, term); }
      if (options.before) { where.push('(updated_at || \'/\' || id) < ?'); values.push(options.before); }
      values.push(options.limit);
      return (db.prepare(`SELECT read_state${modern?',summary':''} FROM ${source} WHERE ${where.length?where.join(' AND '):'1'} ORDER BY updated_at DESC,id DESC LIMIT ?`).all(...values) as {read_state:string;summary?:string}[]).map(row=>{
        const record=JSON.parse(row.read_state) as ConversationReadState;
        if(row.summary)record.view.activity=JSON.parse(row.summary).activity;
        return record;
      });
    } finally { db.close(); }
  }
  listPending(includeActive = false): StoredConversation[] {
    const db = this.open(false); if (!db) return [];
    try { const sql=ConversationReadModel.available(db)?`SELECT c.body FROM conversation_read_states s JOIN conversations c ON c.id=s.id WHERE s.${includeActive?'active':'pending'}=1 UNION ALL SELECT c.body FROM conversations c LEFT JOIN conversation_read_states s ON c.id=s.id WHERE s.id IS NULL`:'SELECT body FROM conversations ORDER BY updated_at DESC';return (db.prepare(sql).all() as {body:string}[]).map(row=>ConversationEntryStore.hydrate(db,JSON.parse(row.body) as StoredConversation)).filter(record=>this.isPending(record,includeActive)); }
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
    try{return (db.prepare("SELECT body FROM conversations WHERE json_extract(body,'$.view.titleState.status')='generating' AND json_extract(body,'$.view.run.generation')<>?").all(generation) as Array<{body:string}>).map(row=>ConversationEntryStore.hydrate(db,JSON.parse(row.body) as StoredConversation));}finally{db.close();}
  }
  listInterrupted(): StoredConversation[] {
    const db = this.open(false); if (!db) return [];
    try {
      return (db.prepare(`SELECT body FROM conversations WHERE json_extract(body,'$.interruption.runId')=json_extract(body,'$.view.run.id') OR json_extract(body,'$.view.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','unknown','tools-active') ORDER BY updated_at DESC`).all() as {body:string}[]).map(row=>ConversationEntryStore.hydrate(db,JSON.parse(row.body) as StoredConversation));
    } finally { db.close(); }
  }
  querySummaries(workspaceIds: string[], input: {workspaceId?:string;activeOnly?:boolean;hidden?:boolean;query?:string;agent?:string;model?:string;activityState?:string;generation?:string;cursor?:string;limit:number}, generationAlive?: (generation:string)=>boolean): {conversations:ConversationView[];nextCursor?:string;total:number;stats:{modelExecutions:Array<{accountId:string;accountLabel:string;model:string;count:number}>;agents:Array<{label:string;count:number}>;models:Array<{label:string;count:number}>;executions:Array<{provider:string;model:string;count:number}>};activityCounts:{active:number;running:number;waiting:number;unseen:number;unknown:number;attention:number}} {
    const empty={conversations:[],total:0,stats:{agents:[],models:[],executions:[],modelExecutions:[]},activityCounts:{active:0,running:0,waiting:0,unseen:0,unknown:0,attention:0}};
    const db=this.open(false);if(!db||!workspaceIds.length){db?.close();return empty;}
    try {
      db.exec('BEGIN');
      const version=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,modern=version>=2;
      // Existing databases stay read-only until a normal write installs the
      // optional index. Prefer it explicitly: the narrower ordering index can
      // otherwise win the planner's estimate and force full-history reads.
      const HAS_WORK=hasWork(db);
      const indexed=version>=3&&!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='conversations_list_summary'").get();
      const table=indexed?'conversations INDEXED BY conversations_list_summary':'conversations';
      // Legacy reads remain zero-write and omit private records and full entries.
      const storedSource=version>=3?table:modern?'(SELECT *,activity_at AS user_at FROM conversations)':`(SELECT *,updated_at AS activity_at,updated_at AS user_at,0 AS activity_version,0 AS seen_version,CASE WHEN json_extract(body,'$.view.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown') THEN 1 ELSE 0 END AS is_active,json_set(json_extract(body,'$.view'),'$.entries',json('[]'),'$.requests',json('[]'),'$.activity',json_object('version',0,'seenThrough',0,'updatedAt',updated_at,'active',json(CASE WHEN json_extract(body,'$.view.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown') THEN 'true' ELSE 'false' END))) AS summary FROM conversations)`;
      const ids=[...new Set(input.workspaceId?workspaceIds.filter(id=>id===input.workspaceId):workspaceIds)].sort();
      if(!ids.length)return empty;
      const compactDecisions="json_extract(summary,'$.activity.pendingDecisionCount')";
      // New summaries stay on the covering index. Only legacy/mismatched rows
      // need their current request header (or canonical legacy body) inspected.
      const historicalCandidate="is_active=1 AND (json_extract(summary,'$.run.status')='tools-active' OR EXISTS(SELECT 1 FROM json_each(summary,'$.retainedRuns') AS historical WHERE json_extract(historical.value,'$.resourcesReleased')=1 OR json_extract(historical.value,'$.status')='tools-active'))";
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
      const withDecisions=`(SELECT scoped_record.*,${decisionCount} AS pending_decision_count,${listActive} AS list_active FROM (SELECT * FROM ${storedSource}) AS scoped_record)`;
      const status = "json_extract(summary,'$.run.status')";
      // Parallel owners are still authoritative. Compute this from compact
      // summaries so activity counts and filters need not load full histories.
      const retained = input.generation && generationAlive ? (db.prepare(`SELECT DISTINCT json_extract(summary,'$.run.generation') AS generation FROM ${storedSource} WHERE ${indexed?`${HAS_WORK} AND `:''}workspace_id IN (${ids.map(()=>'?').join(',')}) AND ${status} IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown')`).all(...ids) as Array<{generation:string|null}>).map(row=>row.generation).filter((generation):generation is string=>Boolean(generation&&generation!==input.generation&&generationAlive(generation))) : [];
      const generations = input.generation ? [...new Set([input.generation,...retained])].sort() : [];
      const effectiveStatus = generations.length ? `CASE WHEN coalesce(json_extract(summary,'$.run.generation'),'') NOT IN (${generations.map(()=>'?').join(',')}) AND ${status} IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown') THEN 'unknown' ELSE ${status} END` : status;
      const state = `CASE WHEN pending_decision_count>0 THEN 'waiting' WHEN hidden=1 AND is_active=0 THEN NULL WHEN effective_status='unknown' THEN 'unknown' WHEN effective_status IN ('waiting-approval','waiting-question') THEN 'waiting' WHEN effective_status IN ('starting','running','stopping') THEN 'running' WHEN activity_version>seen_version THEN 'unseen' ELSE NULL END`;
      const source=`(SELECT *,CASE WHEN activity_state IN ('waiting','unseen') THEN 2 WHEN list_active=1 THEN 1 ELSE 0 END AS sort_priority FROM (SELECT *,${state} AS activity_state FROM (SELECT *,${effectiveStatus} AS effective_status FROM ${withDecisions})))`;
      // Resolved generations can change outside this scope. Any effect on the
      // actual filtered list is already captured by its membership/order keys.
      const scope=createHash('sha256').update(JSON.stringify(['message-activity-first-v2',ids,{...input,cursor:undefined,limit:undefined}])).digest('hex');
      const where=[`workspace_id IN (${ids.map(()=>'?').join(',')})`];const values:Array<string|number>=[...generations,...ids];
      if(input.workspaceId){where.push('workspace_id=?');values.push(input.workspaceId);}
      where.push(HAS_WORK);
      const statsWhere=[...where],statsValues=[...values];
      // Materialize only compact, scoped facts once. Search, pagination and
      // execution filters must not narrow the overview's scope.
      const overview = db.prepare(`WITH scoped AS MATERIALIZED (
        SELECT activity_state,effective_status,
          coalesce(nullif(json_extract(summary,'$.run.provider'),''),'未指定') AS provider,
          coalesce(nullif(json_extract(summary,'$.run.model'),''),'未指定') AS model,
          coalesce(nullif(json_extract(summary,'$.run.modelAccountId'),''),'unknown:'||id) AS account_id,
          json_extract(summary,'$.run.modelSourceLabel') AS account_label
        FROM ${source} WHERE ${statsWhere.join(' AND ')}
      ), executing AS MATERIALIZED (
        SELECT provider,model,account_id,account_label FROM scoped
        WHERE effective_status IN ('starting','running','stopping')
      ) SELECT
        (SELECT json_object('active',count(activity_state),
          'running',coalesce(sum(effective_status IN ('starting','running','stopping')),0),
          'waiting',coalesce(sum(activity_state='waiting'),0),
          'unseen',coalesce(sum(activity_state='unseen'),0),
          'unknown',coalesce(sum(activity_state='unknown'),0),
          'attention',coalesce(sum(activity_state IN ('waiting','unseen','unknown')),0)) FROM scoped) AS counts,
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
          SELECT account_id,coalesce(nullif(max(account_label),''),'账号未记录') AS account_label,model,count(*) AS n
          FROM executing GROUP BY account_id,model ORDER BY n DESC,account_id,model
        )) AS model_executions`).get(...statsValues) as {counts:string;agents:string;models:string;executions:string;model_executions:string};
      const counts = JSON.parse(overview.counts) as typeof empty.activityCounts;
      const stats = {
        agents: JSON.parse(overview.agents) as typeof empty.stats.agents,
        models: JSON.parse(overview.models) as typeof empty.stats.models,
        executions: JSON.parse(overview.executions) as typeof empty.stats.executions,
        modelExecutions: JSON.parse(overview.model_executions) as typeof empty.stats.modelExecutions,
      };
      if(input.activityState) {
        if(!['running','waiting','unseen','unknown','attention'].includes(input.activityState))fail('agent_activity_state_invalid','活动分类无效。',400);
        where.push(input.activityState==='attention'?"activity_state IN ('waiting','unseen','unknown')":input.activityState==='running'?"effective_status IN ('starting','running','stopping')":'activity_state=?');
        if(!['attention','running'].includes(input.activityState))values.push(input.activityState);
      }
      if(input.activeOnly)where.push('(list_active=1 OR pending_decision_count>0)');
      else {where.push('(list_active=1 OR pending_decision_count>0 OR hidden=?)');values.push(Number(input.hidden===true));}
      const terms=searchTerms(input.query);
      if(terms.length){where.push(searchClause(terms,"json_extract(summary,'$.title')",'body'));for(const term of terms)values.push(term,term);}
      if(input.agent||input.model)where.push("effective_status IN ('starting','running','stopping')");
      if(input.agent){where.push("coalesce(nullif(json_extract(summary,'$.run.provider'),''),'未指定')=?");values.push(input.agent);}
      if(input.model){where.push("coalesce(nullif(json_extract(summary,'$.run.model'),''),'未指定')=?");values.push(input.model);}
      // A continuation protects the filtered membership and ordering, not every
      // persisted message/metadata update. The global epoch also changes for
      // streaming output and unrelated workspaces, making live lists unusable.
      // Aggregate compact keys alongside the existing count in this read
      // transaction; no full histories or server-side snapshots are retained.
      const membership=db.prepare(`SELECT count(*) AS n,
        json_group_array(json_array(id,sort_priority,user_at) ORDER BY id) AS keys
        FROM ${source} WHERE ${where.join(' AND ')}`).get(...values) as {n:number;keys:string};
      const total=membership.n;
      const epoch=createHash('sha256').update(membership.keys).digest('hex');
      if(input.cursor){
        let cursor:{scope:string;epoch:string;priority:number;at:string;id:string};
        try{cursor=JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8'));}catch{fail('agent_cursor_invalid','对话列表位置无效，请刷新列表。',409);}
        if(!cursor||typeof cursor!=='object'||cursor.scope!==scope||cursor.epoch!==epoch||typeof cursor.at!=='string'||typeof cursor.id!=='string'||![0,1,2].includes(cursor.priority))fail('agent_cursor_stale','对话列表顺序已变化，请刷新后继续。',409);
        where.push('(sort_priority < ? OR (sort_priority=? AND (user_at < ? OR (user_at=? AND id < ?))))');values.push(cursor.priority,cursor.priority,cursor.at,cursor.at,cursor.id);
      }
      const snippet=terms.length?`, ${searchSnippet(terms)} AS search_snippet`:'';
      const snippetValues=terms.length?[...terms.flatMap(term=>[term,term]),...terms]:[];
      const rows=db.prepare(`SELECT summary,sort_priority,list_active,user_at,activity_at,pending_decision_count,id${snippet} FROM ${source} WHERE ${where.join(' AND ')} ORDER BY sort_priority DESC,user_at DESC,id DESC LIMIT ?`).all(...snippetValues,...values,input.limit+1) as Array<{summary:string;sort_priority:number;list_active:number;user_at:string;activity_at:string;pending_decision_count:number;id:string;search_snippet?:string|null}>;
      const chosen=rows.slice(0,input.limit),last=chosen.at(-1);
      return {conversations:chosen.map(row=>{const view=JSON.parse(row.summary) as ConversationView;const snippetText=row.search_snippet?.replace(/\s+/g,' ').trim();return {...view,...(snippetText?{searchSnippet:snippetText}:{}),activity:view.activity?{...view.activity,userInputAt:row.user_at,updatedAt:row.activity_at,pendingDecisionCount:row.pending_decision_count,active:Boolean(row.list_active)||row.pending_decision_count>0}:undefined,entries:[],requests:[],run:view.run?{...view.run,tools:[]}:undefined,participants:view.participants.map(participant=>({...participant,contextId:''}))};}),total,activityCounts:{...counts},stats,nextCursor:rows.length>input.limit&&last?Buffer.from(JSON.stringify({scope,epoch,priority:last.sort_priority,at:last.user_at,id:last.id})).toString('base64url'):undefined};
    }finally{db.close();}
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
  saveConversation(record: StoredConversation, priorRevision?: string): void {
    const db = this.open(true)!;
    try {
      const prepared=ConversationEntryStore.prepare(db,record);
      db.exec('BEGIN IMMEDIATE');
      const prior = db.prepare('SELECT revision,summary,message_signature,activity_at,user_at,activity_version,seen_version FROM conversations WHERE id=?').get(record.view.id) as {revision:string;summary:string;message_signature:string;activity_at:string;user_at:string;activity_version:number;seen_version:number}|undefined;
      if ((prior?.revision ?? undefined) !== priorRevision) fail('agent_revision_conflict', '对话已变化，请重新读取。', 409);
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
      ConversationReadModel.saveEntries(db, record, prepared);
      db.prepare('UPDATE conversations SET summary=?,message_signature=?,activity_at=?,user_at=?,activity_version=?,is_active=? WHERE id=?').run(JSON.stringify(summary),signature,activityAt,userAt,version,Number(summary.activity!.active),record.view.id);
      const before=prior?.summary?JSON.parse(prior.summary) as ConversationView:undefined;
      const rank=(v:ConversationView|undefined)=>JSON.stringify([v?.title,v?.hidden,v?.run?.status,v?.activity,v?.run?.provider,v?.run?.model]);
      if(rank(before)!==rank(summary))db.exec('UPDATE conversation_epoch SET value=value+1 WHERE id=1');
      db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    finally { db.close(); }
  }
}
