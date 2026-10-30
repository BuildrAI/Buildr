import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ConversationEntry } from '../contracts.ts';
import { unfinishedRun, type StoredConversation } from '../domain/agent-state.ts';

export type ConversationReadState = Pick<StoredConversation, 'view' | 'participants' | 'attachments'>;
const busy = "('starting','running','waiting-approval','waiting-question','stopping','unknown','tools-active')";
const tools = (value: string) => `EXISTS(SELECT 1 FROM json_each(${value},'$.tools') AS pending_tool WHERE coalesce(json_extract(pending_tool.value,'$.status'),'unknown')<>'completed')`;
const retained = `EXISTS(SELECT 1 FROM json_each(NEW.body,'$.view.retainedRuns') AS retained_run WHERE json_extract(retained_run.value,'$.status') IN ${busy} OR ${tools('retained_run.value')})`;
const common = `(coalesce(json_array_length(NEW.body,'$.view.requests'),0)>0 OR ${retained} OR ${tools("json_extract(NEW.body,'$.view.run')")})`;
const header = `json_object('view',json_set(json_extract(NEW.body,'$.view'),'$.entries',json('[]')),'participants',json(coalesce(json_extract(NEW.body,'$.participants'),'[]')),'attachments',json(coalesce(json_extract(NEW.body,'$.attachments'),'{}')))`;
const digest = (body: string) => createHash('sha256').update(body).digest('hex');

/** Rebuildable read projections. Canonical records and the storage version stay compatible with retained writers. */
export class ConversationReadModel {
  static available(db: DatabaseSync): boolean {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='conversation_read_states'").get();
  }
  static install(db: DatabaseSync): void {
    if (this.available(db)) return;
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE conversation_read_states(id TEXT PRIMARY KEY,revision TEXT NOT NULL,updated_at TEXT NOT NULL,state TEXT NOT NULL,pending INTEGER NOT NULL,active INTEGER NOT NULL,title_work INTEGER NOT NULL,message_revision TEXT);
      CREATE INDEX conversation_read_pending ON conversation_read_states(pending,updated_at DESC,id);
      CREATE INDEX conversation_read_active ON conversation_read_states(active,updated_at DESC,id);
      CREATE INDEX conversation_read_titles ON conversation_read_states(title_work,id);
      CREATE TABLE conversation_read_entries(conversation_id TEXT NOT NULL,sequence INTEGER NOT NULL,id TEXT NOT NULL,round_id TEXT NOT NULL,content_revision TEXT NOT NULL,compact TEXT NOT NULL,body_bytes INTEGER NOT NULL,compact_bytes INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(conversation_id,sequence),UNIQUE(conversation_id,id));
      CREATE INDEX conversation_read_entry_positions ON conversation_read_entries(conversation_id,sequence DESC,round_id,body_bytes,compact_bytes);
      ${['INSERT', 'UPDATE OF body,revision'].map((operation, index) => `CREATE TRIGGER conversation_read_legacy_${index} AFTER ${operation} ON conversations
        WHEN NOT EXISTS(SELECT 1 FROM conversation_read_states WHERE id=NEW.id AND revision=NEW.revision)
        BEGIN
          INSERT INTO conversation_read_states(id,revision,updated_at,state,pending,active,title_work) VALUES(NEW.id,NEW.revision,NEW.updated_at,${header},coalesce(${common} OR json_extract(NEW.body,'$.view.run.status') IN ('unknown','tools-active'),0),coalesce(${common} OR json_extract(NEW.body,'$.view.run.status') IN ${busy},0),coalesce(json_extract(NEW.body,'$.view.titleState.status')='generating',0))
          ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,updated_at=excluded.updated_at,state=excluded.state,pending=excluded.pending,active=excluded.active,title_work=excluded.title_work,message_revision=NULL;
        END;`).join('\n')}
      CREATE TRIGGER conversation_read_activity AFTER UPDATE OF summary ON conversations
        WHEN NEW.summary IS NOT NULL BEGIN
          UPDATE conversation_read_states SET state=json_set(state,'$.view.activity',json_extract(NEW.summary,'$.activity')) WHERE id=NEW.id;
        END;
      CREATE TRIGGER conversation_read_delete AFTER DELETE ON conversations BEGIN
        DELETE FROM conversation_read_states WHERE id=OLD.id;
        DELETE FROM conversation_read_entries WHERE conversation_id=OLD.id;
      END;
      COMMIT;`);
  }
  static saveHeader(db: DatabaseSync, record: ConversationReadState): void {
    const view = record.view;
    const common = view.requests.length > 0 || view.retainedRuns?.some(unfinishedRun) || view.run?.tools.some(tool => tool.status !== 'completed');
    db.prepare(`INSERT INTO conversation_read_states(id,revision,updated_at,state,pending,active,title_work) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,updated_at=excluded.updated_at,state=excluded.state,pending=excluded.pending,active=excluded.active,title_work=excluded.title_work,message_revision=NULL`).run(
      view.id, view.revision, view.updatedAt, JSON.stringify({view: {...view, entries: []}, participants: record.participants, attachments: record.attachments}),
      Number(Boolean(common || ['unknown', 'tools-active'].includes(view.run?.status ?? ''))),
      Number(Boolean(common || view.run && unfinishedRun(view.run))), Number(view.titleState?.status === 'generating'));
  }
  static saveEntries(db: DatabaseSync, record: ConversationReadState): void {
    const prior = new Map((db.prepare('SELECT sequence,content_revision,round_id FROM conversation_read_entries WHERE conversation_id=?').all(record.view.id) as Array<{sequence: number; content_revision: string; round_id:string}>).map(row => [row.sequence, row]));
    const write = db.prepare(`INSERT INTO conversation_read_entries(conversation_id,sequence,id,round_id,content_revision,compact,body_bytes,compact_bytes,body) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(conversation_id,sequence) DO UPDATE SET id=excluded.id,round_id=excluded.round_id,content_revision=excluded.content_revision,body=excluded.body,compact=excluded.compact,body_bytes=excluded.body_bytes,compact_bytes=excluded.compact_bytes`);
    let round = {id: 'legacy:0'};
    const entries = record.view.entries;
    const rounds = entries.map(entry => {
      const identified = entry.runId ? 'run:' + entry.runId : undefined;
      if (entry.kind === 'message' && entry.role === 'user') {
        if (!identified || round.id !== identified) round = {id: identified ?? 'legacy:' + entry.id};
      } else if (identified && round.id !== identified) {
        if (round.id.startsWith('legacy:')) round.id = identified;
        else round = {id: identified};
      }
      return round;
    });
    entries.forEach((entry, index) => {
      const body = JSON.stringify(entry), revision = digest(body);
      // Round inference can change when legacy entries acquire their execution identity.
      if (prior.get(entry.sequence)?.content_revision === revision) {
        if(prior.get(entry.sequence)?.round_id!==rounds[index]!.id)db.prepare('UPDATE conversation_read_entries SET round_id=? WHERE conversation_id=? AND sequence=? AND round_id<>?').run(rounds[index]!.id, record.view.id, entry.sequence, rounds[index]!.id);
      } else {
        const compact = JSON.stringify(this.compact(entry, revision));
        write.run(record.view.id, entry.sequence, entry.id, rounds[index]!.id, revision, compact, Buffer.byteLength(body), Buffer.byteLength(compact), body);
      }
      prior.delete(entry.sequence);
    });
    for (const sequence of prior.keys()) db.prepare('DELETE FROM conversation_read_entries WHERE conversation_id=? AND sequence=?').run(record.view.id, sequence);
    db.prepare('UPDATE conversation_read_states SET message_revision=revision WHERE id=? AND revision=?').run(record.view.id, record.view.revision);
  }
  static compact(entry: ConversationEntry, revision = digest(JSON.stringify(entry))): ConversationEntry {
    if (entry.kind !== 'tool' || Buffer.byteLength(entry.text) + Buffer.byteLength(entry.input ?? '') <= 16 * 1024) return entry;
    // Keep a bounded, explicit preview; the original invocation and output remain separately readable.
    return {...entry, text: entry.text.slice(0, 512), input: entry.input && entry.input.length <= 4096 ? entry.input : undefined, detail: {revision}};
  }
  static page(db: DatabaseSync, id: string, before?: number, limit?: number, compact = false): ConversationReadState | undefined {
    const row = db.prepare('SELECT state FROM conversation_read_states WHERE id=? AND message_revision=revision').get(id) as {state: string} | undefined;
    if (!row) return;
    const record = JSON.parse(row.state) as ConversationReadState;
    const column = compact ? 'compact' : 'body', bytes = compact ? 'compact_bytes' : 'body_bytes';
    // Select only positions/sizes first. Large omitted bodies never cross the database boundary.
    const positions = db.prepare(`SELECT sequence,round_id,${bytes} AS bytes FROM conversation_read_entries WHERE conversation_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?`).all(id, before ?? Number.MAX_SAFE_INTEGER, (limit ?? 200) + 1) as Array<{sequence: number; round_id: string; bytes: number}>;
    const rounds = new Set<string>(); let size = 2; const selected: number[] = [];
    for (const position of positions) {
      if (selected.length >= (limit ?? 200) || limit === undefined && !rounds.has(position.round_id) && rounds.size >= 5 || selected.length && size + position.bytes + 1 > (compact ? 256 * 1024 : 4 * 1024 * 1024)) break;
      selected.push(position.sequence); rounds.add(position.round_id); size += position.bytes + 1;
    }
    record.view.entries = selected.length ? (db.prepare(`SELECT ${column} AS body FROM conversation_read_entries WHERE conversation_id=? AND sequence>=? AND sequence<? ORDER BY sequence`).all(id, selected.at(-1)!, before ?? Number.MAX_SAFE_INTEGER) as Array<{body: string}>).map(row => JSON.parse(row.body)) : [];
    record.view.nextEntryCursor = positions.length > selected.length ? selected.at(-1) : undefined;
    return record;
  }
}
