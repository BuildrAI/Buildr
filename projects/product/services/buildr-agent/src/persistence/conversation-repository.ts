import { createHash } from 'node:crypto';
import { summaryView, messageSignature, userActivityAt } from '../domain/conversation-activity.ts';
import type { ConversationView } from '../contracts.ts';
import { BUSY_STATES, conversationRuns, unfinishedRun } from '../domain/agent-state.ts';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { AgentServiceError, fail } from '../domain/agent-state.ts';
import type { StoredConnection, StoredConversation } from '../domain/agent-state.ts';
import { ConversationReadModel, type ConversationReadState } from './conversation-read-model.ts';

export const CONVERSATION_SCHEMA_VERSION = 4;
const SCHEMA_VERSION = CONVERSATION_SCHEMA_VERSION;
// 附件准备不等于开始；已发送或结果未知的尝试仍必须可发现。
const HAS_WORK = "(json_array_length(json_extract(body,'$.view.entries'))>0 OR json_array_length(json_extract(body,'$.attempts'))>0 OR json_type(body,'$.view.run')='object' OR json_type(body,'$.view.childOf')='object')";
// Legacy/offline readers must inspect optional JSON fields without materializing a full record.
const HAS_UNFINISHED = "EXISTS(SELECT 1 FROM json_each(body,'$.view.retainedRuns') AS retained WHERE json_extract(retained.value,'$.status') IN ('starting','running','waiting-approval','waiting-question','stopping','unknown','tools-active') OR EXISTS(SELECT 1 FROM json_each(retained.value,'$.tools') AS tool WHERE COALESCE(json_extract(tool.value,'$.status'),'unknown')<>'completed')) OR json_array_length(body,'$.view.requests')>0 OR json_extract(body,'$.view.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','unknown','tools-active') OR EXISTS(SELECT 1 FROM json_each(body,'$.view.run.tools') AS tool WHERE COALESCE(json_extract(tool.value,'$.status'),'unknown')<>'completed') OR json_extract(body,'$.view.titleState.status')='generating'";

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
      try {
        db.exec('PRAGMA busy_timeout=2000');
        const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
        if (row.user_version > SCHEMA_VERSION) fail('agent_storage_newer', '此交互库来自较新版本，请使用匹配的 Buildr。', 409);
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
          // Rebuildable acceleration, not a storage-version change. SQLite also
          // maintains this predicate when an older retained writer changes body.
          // Keeping the list fields here avoids reading large history pages.
          try {
            db.exec(`CREATE INDEX IF NOT EXISTS conversations_list_summary
              ON conversations(workspace_id,is_active DESC,user_at DESC,id DESC,hidden,activity_version,seen_version,summary)
              WHERE ${HAS_WORK}`);
          } catch (error) {
            // An unrelated damaged history must not make this optional
            // acceleration a prerequisite for saving an otherwise valid row.
            if (!(error instanceof Error) || error.message !== 'malformed JSON') throw error;
          }
          fs.chmodSync(this.filename, 0o600);
        }
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
    try { const modern=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version>=2; const row = db.prepare(`SELECT body${modern?',summary':''} FROM conversations WHERE id=?`).get(id) as {body:string;summary?:string}|undefined; if(!row)return;const record=JSON.parse(row.body) as StoredConversation;if(row.summary)record.view.activity=JSON.parse(row.summary).activity;return record; }
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
        const row=db.prepare('SELECT e.body,e.content_revision FROM conversation_read_entries e JOIN conversation_read_states s ON s.id=e.conversation_id AND s.message_revision=s.revision WHERE s.id=? AND e.id=?').get(id,entryId) as {body:string;content_revision:string}|undefined;
        if(row){if(row.content_revision!==revision)fail('agent_entry_changed','工具记录已变化，请重新读取当前对话。',409);return JSON.parse(row.body) as import('../contracts.ts').ConversationEntry;}
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
  listConversations(workspaceId: string, options: { parentConversationId?: string; taskId?: string; before?: string; limit: number; includeHidden?: boolean; query?: string }): StoredConversation[] {
    const db = this.open(false); if (!db) return [];
    try {
      const where = ['workspace_id=?']; const values: Array<string | number> = [workspaceId];
      // 已创建但从未发出内容的草稿不属于对话历史。
      where.push(HAS_WORK);
      if (!options.includeHidden) where.push('hidden=0');
      if (options.taskId) { where.push('task_id=?'); values.push(options.taskId); }
      if (options.parentConversationId) { where.push("json_extract(body,'$.view.childOf.conversationId')=?"); values.push(options.parentConversationId); }
      if (options.query) {
        where.push("(instr(lower(json_extract(body,'$.view.title')),lower(?))>0 OR EXISTS(SELECT 1 FROM json_each(body,'$.view.entries') AS entry WHERE instr(lower(json_extract(entry.value,'$.text')),lower(?))>0))");
        values.push(options.query, options.query);
      }
      if (options.before) { where.push('(updated_at || \'/\' || id) < ?'); values.push(options.before); }
      values.push(options.limit);
      const modern=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version>=2;
      return (db.prepare(`SELECT body${modern?',summary':''} FROM conversations WHERE ${where.join(' AND ')} ORDER BY updated_at DESC,id DESC LIMIT ?`).all(...values) as {body:string;summary?:string}[]).map(row=>{
        const record=JSON.parse(row.body) as StoredConversation;
        // Seen state is maintained independently of conversation revisions.
        if(row.summary)record.view.activity=JSON.parse(row.summary).activity;
        return record;
      });
    } finally { db.close(); }
  }
  listPending(includeActive = false): StoredConversation[] {
    const db = this.open(false); if (!db) return [];
    try { const sql=ConversationReadModel.available(db)?`SELECT c.body FROM conversation_read_states s JOIN conversations c ON c.id=s.id WHERE s.${includeActive?'active':'pending'}=1 UNION ALL SELECT c.body FROM conversations c LEFT JOIN conversation_read_states s ON c.id=s.id WHERE s.id IS NULL`:'SELECT body FROM conversations ORDER BY updated_at DESC';return (db.prepare(sql).all() as {body:string}[]).map(row=>JSON.parse(row.body) as StoredConversation).filter(record=>this.isPending(record,includeActive)); }
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
    try{return (db.prepare("SELECT body FROM conversations WHERE json_extract(body,'$.view.titleState.status')='generating' AND json_extract(body,'$.view.run.generation')<>?").all(generation) as Array<{body:string}>).map(row=>JSON.parse(row.body));}finally{db.close();}
  }
  listInterrupted(): StoredConversation[] {
    const db = this.open(false); if (!db) return [];
    try {
      return (db.prepare(`SELECT body FROM conversations WHERE json_extract(body,'$.interruption.runId')=json_extract(body,'$.view.run.id') OR json_extract(body,'$.view.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','unknown','tools-active') ORDER BY updated_at DESC`).all() as {body:string}[]).map(row=>JSON.parse(row.body));
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
      const indexed=version>=3&&!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='conversations_list_summary'").get();
      const table=indexed?'conversations INDEXED BY conversations_list_summary':'conversations';
      // Legacy reads remain zero-write and omit private records and full entries.
      const storedSource=version>=3?table:modern?'(SELECT *,activity_at AS user_at FROM conversations)':`(SELECT *,updated_at AS activity_at,updated_at AS user_at,0 AS activity_version,0 AS seen_version,CASE WHEN json_extract(body,'$.view.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown') THEN 1 ELSE 0 END AS is_active,json_set(json_extract(body,'$.view'),'$.entries',json('[]'),'$.requests',json('[]'),'$.activity',json_object('version',0,'seenThrough',0,'updatedAt',updated_at,'active',json(CASE WHEN json_extract(body,'$.view.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown') THEN 'true' ELSE 'false' END))) AS summary FROM conversations)`;
      const status = "json_extract(summary,'$.run.status')";
      // Parallel owners are still authoritative. Compute this from compact
      // summaries so activity counts and filters need not load full histories.
      const retained = input.generation && generationAlive ? (db.prepare(`SELECT DISTINCT json_extract(summary,'$.run.generation') AS generation FROM ${storedSource} WHERE ${indexed?`${HAS_WORK} AND `:''}${status} IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown')`).all() as Array<{generation:string|null}>).map(row=>row.generation).filter((generation):generation is string=>Boolean(generation&&generation!==input.generation&&generationAlive(generation))) : [];
      const generations = input.generation ? [...new Set([input.generation,...retained])].sort() : [];
      const effectiveStatus = generations.length ? `CASE WHEN coalesce(json_extract(summary,'$.run.generation'),'') NOT IN (${generations.map(()=>'?').join(',')}) AND ${status} IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown') THEN 'unknown' ELSE ${status} END` : status;
      const state = `CASE WHEN hidden=1 AND json_extract(summary,'$.run.executionState')='ended' AND json_extract(summary,'$.run.resourcesReleased')=1 AND effective_status='unknown' THEN NULL WHEN effective_status='unknown' THEN 'unknown' WHEN effective_status IN ('waiting-approval','waiting-question') THEN 'waiting' WHEN effective_status IN ('starting','running','stopping','tools-active') THEN 'running' WHEN activity_version>seen_version THEN 'unseen' ELSE NULL END`;
      const source=`(SELECT *,CASE WHEN activity_state IN ('waiting','unseen') THEN 2 WHEN is_active=1 THEN 1 ELSE 0 END AS sort_priority FROM (SELECT *,${state} AS activity_state FROM (SELECT *,${effectiveStatus} AS effective_status FROM ${storedSource})))`;
      const ids=[...new Set(workspaceIds)].sort();
      const scope=createHash('sha256').update(JSON.stringify(['attention-first-v1',ids,{...input,cursor:undefined,limit:undefined},generations])).digest('hex');
      const epoch=modern?(db.prepare('SELECT value FROM conversation_epoch WHERE id=1').get() as {value:number}).value:0;
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
        WHERE effective_status IN ('starting','running','stopping','tools-active')
      ) SELECT
        (SELECT json_object('active',count(activity_state),
          'running',coalesce(sum(activity_state='running'),0),
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
        where.push(input.activityState==='attention'?"activity_state IN ('waiting','unseen','unknown')":'activity_state=?');
        if(input.activityState!=='attention')values.push(input.activityState);
      }
      if(input.activeOnly)where.push('is_active=1');
      else {where.push('(is_active=1 OR hidden=?)');values.push(Number(input.hidden===true));}
      if(input.query){where.push("(instr(lower(json_extract(summary,'$.title')),lower(?))>0 OR EXISTS(SELECT 1 FROM json_each(body,'$.view.entries') AS e WHERE instr(lower(json_extract(e.value,'$.text')),lower(?))>0))");values.push(input.query,input.query);}
      if(input.agent||input.model)where.push("effective_status IN ('starting','running','stopping','tools-active')");
      if(input.agent){where.push("coalesce(nullif(json_extract(summary,'$.run.provider'),''),'未指定')=?");values.push(input.agent);}
      if(input.model){where.push("coalesce(nullif(json_extract(summary,'$.run.model'),''),'未指定')=?");values.push(input.model);}
      const total=(db.prepare(`SELECT count(*) AS n FROM ${source} WHERE ${where.join(' AND ')}`).get(...values) as {n:number}).n;
      if(input.cursor){
        let cursor:{scope:string;epoch:number;priority:number;at:string;id:string};
        try{cursor=JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8'));}catch{fail('agent_cursor_invalid','对话列表位置无效，请刷新列表。',409);}
        if(!cursor||typeof cursor!=='object'||cursor.scope!==scope||cursor.epoch!==epoch||typeof cursor.at!=='string'||typeof cursor.id!=='string'||![0,1,2].includes(cursor.priority))fail('agent_cursor_stale','对话列表顺序已变化，请刷新后继续。',409);
        where.push('(sort_priority < ? OR (sort_priority=? AND (user_at < ? OR (user_at=? AND id < ?))))');values.push(cursor.priority,cursor.priority,cursor.at,cursor.at,cursor.id);
      }
      const rows=db.prepare(`SELECT summary,sort_priority,user_at,id FROM ${source} WHERE ${where.join(' AND ')} ORDER BY sort_priority DESC,user_at DESC,id DESC LIMIT ?`).all(...values,input.limit+1) as Array<{summary:string;sort_priority:number;user_at:string;id:string}>;
      const chosen=rows.slice(0,input.limit),last=chosen.at(-1);
      return {conversations:chosen.map(row=>{const view=JSON.parse(row.summary) as ConversationView;return {...view,activity:view.activity?{...view.activity,userInputAt:row.user_at}:undefined,entries:[],requests:[],run:view.run?{...view.run,tools:[]}:undefined,participants:view.participants.map(participant=>({...participant,contextId:''}))};}),total,activityCounts:{...counts},stats,nextCursor:rows.length>input.limit&&last?Buffer.from(JSON.stringify({scope,epoch,priority:last.sort_priority,at:last.user_at,id:last.id})).toString('base64url'):undefined};
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
      const seen=Math.max(row.seen_version,through);
      const activity={version:row.activity_version,seenThrough:seen,updatedAt:view.activity!.updatedAt,active:conversationRuns(view).some(unfinishedRun)||row.activity_version>seen};
      if(seen!==row.seen_version){
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
      db.exec('BEGIN IMMEDIATE');
      const prior = db.prepare('SELECT revision,summary,message_signature,activity_at,user_at,activity_version,seen_version FROM conversations WHERE id=?').get(record.view.id) as {revision:string;summary:string;message_signature:string;activity_at:string;user_at:string;activity_version:number;seen_version:number}|undefined;
      if ((prior?.revision ?? undefined) !== priorRevision) fail('agent_revision_conflict', '对话已变化，请重新读取。', 409);
      ConversationReadModel.saveHeader(db, record);
      db.prepare('INSERT INTO conversations(id,workspace_id,task_id,hidden,updated_at,revision,body) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id,hidden=excluded.hidden,updated_at=excluded.updated_at,revision=excluded.revision,body=excluded.body').run(record.view.id, record.view.workspaceId, record.view.taskId ?? null, Number(record.view.hidden), record.view.updatedAt, record.view.revision, JSON.stringify(record));
      const signature=messageSignature(record);
      const version=(prior?.activity_version??0)+(prior&&prior.message_signature!==signature?1:0);
      const activityAt=prior&&prior.message_signature===signature?prior.activity_at:record.view.updatedAt;
      // 顺序只跟随用户输入；智能体输出与工具动作不改变位置。
      const latest=userActivityAt(record);
      const userAt=prior&&prior.user_at>=(latest??'')?prior.user_at:latest??prior?.user_at??record.view.updatedAt;
      const summary=summaryView(record,version,prior?.seen_version??0,activityAt);
      record.view.activity=summary.activity;
      ConversationReadModel.saveHeader(db, record);
      ConversationReadModel.saveEntries(db, record);
      db.prepare('UPDATE conversations SET summary=?,message_signature=?,activity_at=?,user_at=?,activity_version=?,is_active=? WHERE id=?').run(JSON.stringify(summary),signature,activityAt,userAt,version,Number(summary.activity!.active),record.view.id);
      const before=prior?.summary?JSON.parse(prior.summary) as ConversationView:undefined;
      const rank=(v:ConversationView|undefined)=>JSON.stringify([v?.title,v?.hidden,v?.run?.status,v?.activity,v?.run?.provider,v?.run?.model]);
      if(rank(before)!==rank(summary))db.exec('UPDATE conversation_epoch SET value=value+1 WHERE id=1');
      db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    finally { db.close(); }
  }
}
