import { createHash } from 'node:crypto';
import { summaryView, messageSignature } from '../domain/conversation-activity.ts';
import type { ConversationView } from '../contracts.ts';
import { BUSY_STATES } from '../domain/agent-state.ts';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { AgentServiceError, fail } from '../domain/agent-state.ts';
import type { StoredConnection, StoredConversation } from '../domain/agent-state.ts';

const SCHEMA_VERSION = 2;
// 附件准备不等于开始；已发送或结果未知的尝试仍必须可发现。
const HAS_WORK = "(json_array_length(json_extract(body,'$.view.entries'))>0 OR json_array_length(json_extract(body,'$.attempts'))>0 OR json_type(body,'$.view.run')='object')";

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
    try { const modern=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version>=2; const row = db.prepare(`SELECT body${modern?',summary':''} FROM conversations WHERE id=?`).get(id) as {body:string;summary?:string}|undefined; if(!row)return;const record=JSON.parse(row.body) as StoredConversation;if(row.summary)record.view.activity=JSON.parse(row.summary).activity;return record; }
    finally { db.close(); }
  }
  listConversations(workspaceId: string, options: { taskId?: string; before?: string; limit: number; includeHidden?: boolean; query?: string }): StoredConversation[] {
    const db = this.open(false); if (!db) return [];
    try {
      const where = ['workspace_id=?']; const values: Array<string | number> = [workspaceId];
      // 已创建但从未发出内容的草稿不属于对话历史。
      where.push(HAS_WORK);
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
  querySummaries(workspaceIds: string[], input: {workspaceId?:string;activeOnly?:boolean;hidden?:boolean;query?:string;agent?:string;model?:string;cursor?:string;limit:number}): {conversations:ConversationView[];nextCursor?:string;total:number;stats:{agents:Array<{label:string;count:number}>;models:Array<{label:string;count:number}>}} {
    const empty={conversations:[],total:0,stats:{agents:[],models:[]}};
    const db=this.open(false);if(!db||!workspaceIds.length){db?.close();return empty;}
    try {
      db.exec('BEGIN');
      const modern=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version>=2;
      // Legacy reads remain zero-write and omit private records and full entries.
      const source=modern?'conversations':`(SELECT *,updated_at AS activity_at,0 AS activity_version,0 AS seen_version,CASE WHEN json_extract(body,'$.view.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown') THEN 1 ELSE 0 END AS is_active,json_set(json_extract(body,'$.view'),'$.entries',json('[]'),'$.requests',json('[]'),'$.activity',json_object('version',0,'seenThrough',0,'updatedAt',updated_at,'active',json(CASE WHEN json_extract(body,'$.view.run.status') IN ('starting','running','waiting-approval','waiting-question','stopping','tools-active','unknown') THEN 'true' ELSE 'false' END))) AS summary FROM conversations)`;
      const ids=[...new Set(workspaceIds)].sort();
      const scope=createHash('sha256').update(JSON.stringify([ids,{...input,cursor:undefined,limit:undefined}])).digest('hex');
      const epoch=modern?(db.prepare('SELECT value FROM conversation_epoch WHERE id=1').get() as {value:number}).value:0;
      const where=[`workspace_id IN (${ids.map(()=>'?').join(',')})`];const values:Array<string|number>=[...ids];
      if(input.workspaceId){where.push('workspace_id=?');values.push(input.workspaceId);}
      where.push(HAS_WORK);
      const statsWhere=[...where],statsValues=[...values];
      if(input.activeOnly)where.push('is_active=1');
      else {where.push('(is_active=1 OR hidden=?)');values.push(Number(input.hidden===true));}
      if(input.query){where.push("(instr(lower(json_extract(summary,'$.title')),lower(?))>0 OR EXISTS(SELECT 1 FROM json_each(body,'$.view.entries') AS e WHERE instr(lower(json_extract(e.value,'$.text')),lower(?))>0))");values.push(input.query,input.query);}
      if(input.agent||input.model)where.push("json_extract(summary,'$.run.status') IN ('starting','running','stopping','tools-active')");
      if(input.agent){where.push("coalesce(nullif(json_extract(summary,'$.run.provider'),''),'未指定')=?");values.push(input.agent);}
      if(input.model){where.push("coalesce(nullif(json_extract(summary,'$.run.model'),''),'未指定')=?");values.push(input.model);}
      const total=(db.prepare(`SELECT count(*) AS n FROM ${source} WHERE ${where.join(' AND ')}`).get(...values) as {n:number}).n;
      if(input.cursor){
        let cursor:{scope:string;epoch:number;active:number;at:string;id:string};
        try{cursor=JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8'));}catch{fail('agent_cursor_invalid','对话列表位置无效，请刷新列表。',409);}
        if(!cursor||typeof cursor!=='object'||cursor.scope!==scope||cursor.epoch!==epoch||typeof cursor.at!=='string'||typeof cursor.id!=='string'||![0,1].includes(cursor.active))fail('agent_cursor_stale','对话列表顺序已变化，请刷新后继续。',409);
        where.push('(is_active < ? OR (is_active=? AND (activity_at < ? OR (activity_at=? AND id < ?))))');values.push(cursor.active,cursor.active,cursor.at,cursor.at,cursor.id);
      }
      const rows=db.prepare(`SELECT summary,is_active,activity_at,id FROM ${source} WHERE ${where.join(' AND ')} ORDER BY is_active DESC,activity_at DESC,id DESC LIMIT ?`).all(...values,input.limit+1) as Array<{summary:string;is_active:number;activity_at:string;id:string}>;
      const chosen=rows.slice(0,input.limit),last=chosen.at(-1);
      const group=(field:'provider'|'model')=>(db.prepare(`SELECT coalesce(nullif(json_extract(summary,'$.run.${field}'),''),'未指定') AS label,count(*) AS count FROM ${source} WHERE ${statsWhere.join(' AND ')} AND json_extract(summary,'$.run.status') IN ('starting','running','stopping','tools-active') GROUP BY label ORDER BY count DESC,label`).all(...statsValues) as Array<{label:string|null;count:number}>).map(row=>({label:row.label||'未指定',count:row.count}));
      return {conversations:chosen.map(row=>{const view=JSON.parse(row.summary) as ConversationView;return {...view,entries:[],requests:[],run:view.run?{...view.run,tools:[]}:undefined,participants:view.participants.map(participant=>({...participant,contextId:''}))};}),total,stats:{agents:group('provider'),models:group('model')},nextCursor:rows.length>input.limit&&last?Buffer.from(JSON.stringify({scope,epoch,active:last.is_active,at:last.activity_at,id:last.id})).toString('base64url'):undefined};
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
      const activity={version:row.activity_version,seenThrough:seen,updatedAt:view.activity!.updatedAt,active:BUSY_STATES.has(view.run?.status as never)||row.activity_version>seen};
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
      const prior = db.prepare('SELECT revision,summary,message_signature,activity_at,activity_version,seen_version FROM conversations WHERE id=?').get(record.view.id) as {revision:string;summary:string;message_signature:string;activity_at:string;activity_version:number;seen_version:number}|undefined;
      if ((prior?.revision ?? undefined) !== priorRevision) fail('agent_revision_conflict', '对话已变化，请重新读取。', 409);
      db.prepare('INSERT INTO conversations(id,workspace_id,task_id,hidden,updated_at,revision,body) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET task_id=excluded.task_id,hidden=excluded.hidden,updated_at=excluded.updated_at,revision=excluded.revision,body=excluded.body').run(record.view.id, record.view.workspaceId, record.view.taskId ?? null, Number(record.view.hidden), record.view.updatedAt, record.view.revision, JSON.stringify(record));
      const signature=messageSignature(record);
      const version=(prior?.activity_version??0)+(prior&&prior.message_signature!==signature?1:0);
      const activityAt=prior&&prior.message_signature===signature?prior.activity_at:record.view.updatedAt;
      const summary=summaryView(record,version,prior?.seen_version??0,activityAt);
      record.view.activity=summary.activity;
      db.prepare('UPDATE conversations SET summary=?,message_signature=?,activity_at=?,activity_version=?,is_active=? WHERE id=?').run(JSON.stringify(summary),signature,activityAt,version,Number(summary.activity!.active),record.view.id);
      const before=prior?.summary?JSON.parse(prior.summary) as ConversationView:undefined;
      const rank=(v:ConversationView|undefined)=>JSON.stringify([v?.title,v?.hidden,v?.run?.status,v?.activity,v?.run?.provider,v?.run?.model]);
      if(rank(before)!==rank(summary))db.exec('UPDATE conversation_epoch SET value=value+1 WHERE id=1');
      db.exec('COMMIT');
    } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    finally { db.close(); }
  }
}
