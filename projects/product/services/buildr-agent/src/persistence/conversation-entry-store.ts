import { registerEntryRevision } from '../domain/entry-revision.ts';
import { NativeContentReader } from '../storage/native-content.ts';
import type { NativeToolContent } from '../native-content-contracts.ts';
import { createHash } from 'node:crypto';
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import type { DatabaseSync } from 'node:sqlite';
import type { ConversationEntry } from '../contracts.ts';
import { AgentServiceError, type StoredConversation } from '../domain/agent-state.ts';
import { presentedFilesForEntry } from '../domain/presented-files.ts';

const maximumDecoded = 64 * 1024 * 1024;
const digest = (body: string | Uint8Array) => createHash('sha256').update(body).digest('hex');
export type Content = { content_revision: string; codec: string; body_bytes: number; body: string | Uint8Array };
type Position = { scope: string; entry: ConversationEntry; round: string; revision: string; compact: string | null; bytes: number; compactBytes: number; content?: Content };
export type PreparedEntries = Position[];
const lazyEntries = new WeakMap<ConversationEntry, { row: Content; compact: string; metadata: string; untouched(): boolean }>();
const metadata = (entry: ConversationEntry) => JSON.stringify(Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(entry)).filter(([key]) => key !== 'text' && key !== 'input').map(([key, descriptor]) => [key, descriptor.value])));


/** The only persisted full entry bodies. Positions/previews are not another body store. */
export class ConversationEntryStore {
  static available(db: DatabaseSync): boolean {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='conversation_entry_contents'").get();
  }
  static install(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE conversation_entry_contents(
        conversation_id TEXT NOT NULL, content_revision TEXT NOT NULL,
        codec TEXT NOT NULL, body_bytes INTEGER NOT NULL, body BLOB NOT NULL,
        PRIMARY KEY(conversation_id,content_revision));
      CREATE TABLE conversation_read_entries(
        conversation_id TEXT NOT NULL, scope TEXT NOT NULL, sequence INTEGER NOT NULL,
        id TEXT NOT NULL, round_id TEXT NOT NULL, content_revision TEXT NOT NULL,
        compact TEXT, body_bytes INTEGER NOT NULL, compact_bytes INTEGER NOT NULL,
        visible INTEGER NOT NULL,
        PRIMARY KEY(conversation_id,scope,sequence), UNIQUE(conversation_id,scope,id));
      CREATE INDEX conversation_read_entry_positions
        ON conversation_read_entries(conversation_id,scope,sequence DESC,round_id,body_bytes,compact_bytes);
      CREATE INDEX conversation_visible_entries ON conversation_read_entries(conversation_id,visible,sequence);
      CREATE TRIGGER conversation_contents_delete AFTER DELETE ON conversations BEGIN
        DELETE FROM conversation_entry_contents WHERE conversation_id=OLD.id;
      END;
      CREATE TRIGGER conversation_body_format_insert BEFORE INSERT ON conversations
        WHEN json_extract(NEW.body,'$._bodyFormat') IS NOT 6 OR json_array_length(NEW.body,'$.view.entries')>0 OR json_array_length(NEW.body,'$.inheritedContext.entries')>0
        BEGIN SELECT RAISE(ABORT,'agent_storage_writer_incompatible'); END;
      CREATE TRIGGER conversation_body_format_update BEFORE UPDATE OF body ON conversations
        WHEN json_extract(NEW.body,'$._bodyFormat') IS NOT 6 OR json_array_length(NEW.body,'$.view.entries')>0 OR json_array_length(NEW.body,'$.inheritedContext.entries')>0
        BEGIN SELECT RAISE(ABORT,'agent_storage_writer_incompatible'); END;`);
  }
  static header(record: StoredConversation): string {
    return JSON.stringify({
      ...record, _bodyFormat: 6, view: { ...record.view, entries: [] },
      ...(record.inheritedContext ? { inheritedContext: { ...record.inheritedContext, entries: [] } } : {}),
    });
  }
  static compact(entry: ConversationEntry, revision = digest(JSON.stringify(entry)), force = false): ConversationEntry {
    if (entry.kind !== 'tool' || !force && Buffer.byteLength(entry.text) + Buffer.byteLength(entry.input ?? '') <= 16 * 1024) return entry;
    return { ...entry, ...(presentedFilesForEntry(entry).length ? { presentedFiles: presentedFilesForEntry(entry) } : {}),
      text: entry.text.slice(0, 512), input: entry.input && entry.input.length <= 4096 ? entry.input : undefined, detail: { revision } };
  }
  /** Prepare expensive compression before the ordinary write transaction. */
  static prepare(db: DatabaseSync, record: StoredConversation): PreparedEntries {
    const existing = new Set((db.prepare('SELECT content_revision FROM conversation_entry_contents WHERE conversation_id=?').all(record.view.id) as Array<{content_revision: string}>).map(row => row.content_revision));
    const result: PreparedEntries = [];
    for (const [scope, entries] of [['main', record.view.entries], ['inherited', record.inheritedContext?.entries ?? []]] as const) {
      let round = { id: 'legacy:0' };
      const rounds = entries.map(entry => {
        const identified = entry.runId ? 'run:' + entry.runId : undefined;
        if (entry.kind === 'message' && entry.role === 'user') {
          if (!identified || round.id !== identified) round = { id: identified ?? 'legacy:' + entry.id };
        } else if (identified && round.id !== identified) {
          if (round.id.startsWith('legacy:')) round.id = identified;
          else round = { id: identified };
        }
        return round;
      });
      entries.forEach((entry, index) => {
        const lazy = lazyEntries.get(entry);
        if (lazy && lazy.untouched() && lazy.metadata === metadata(entry) && existing.has(lazy.row.content_revision)) {
          result.push({ scope, entry, round: rounds[index]!.id, revision: lazy.row.content_revision, compact: lazy.compact,
            bytes: lazy.row.body_bytes, compactBytes: Buffer.byteLength(lazy.compact) });
          return;
        }
        const body = JSON.stringify(entry), revision = digest(body), bytes = Buffer.byteLength(body);
        const preview = JSON.stringify(this.compact(entry, revision));
        let content: Content | undefined;
        if (!existing.has(revision)) {
          let stored: string | Uint8Array = body, codec = 'raw';
          if (entry.kind === 'tool' && ['completed', 'failed'].includes(entry.status ?? '') && bytes > 16 * 1024 && bytes <= maximumDecoded) {
            const compressed = zstdCompressSync(Buffer.from(body));
            if (compressed.length < bytes) { stored = compressed; codec = 'zstd'; }
          }
          content = { content_revision: revision, codec, body_bytes: bytes, body: stored };
          existing.add(revision);
        }
        result.push({ scope, entry, round: rounds[index]!.id, revision, compact: preview === body ? null : preview, bytes, compactBytes: Buffer.byteLength(preview), content });
      });
    }
    return result;
  }
  static save(db: DatabaseSync, record: StoredConversation, prepared = this.prepare(db, record)): void {
    const prior = new Map((db.prepare('SELECT scope,sequence,content_revision,round_id FROM conversation_read_entries WHERE conversation_id=?').all(record.view.id) as Array<{scope:string;sequence:number;content_revision:string;round_id:string}>).map(row => [row.scope + ':' + row.sequence, row]));
    const content = db.prepare('INSERT OR IGNORE INTO conversation_entry_contents(conversation_id,content_revision,codec,body_bytes,body) VALUES(?,?,?,?,?)');
    const position = db.prepare(`INSERT INTO conversation_read_entries(conversation_id,scope,sequence,id,round_id,content_revision,compact,body_bytes,compact_bytes,visible)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(conversation_id,scope,sequence) DO UPDATE SET id=excluded.id,round_id=excluded.round_id,
      content_revision=excluded.content_revision,compact=excluded.compact,body_bytes=excluded.body_bytes,compact_bytes=excluded.compact_bytes,visible=excluded.visible`);
    for (const row of prepared) {
      if (row.content) content.run(record.view.id, row.revision, row.content.codec, row.bytes, row.content.body);
      const key = row.scope + ':' + row.entry.sequence, old = prior.get(key);
      if (old?.content_revision !== row.revision || old.round_id !== row.round) {
        position.run(record.view.id, row.scope, row.entry.sequence, row.entry.id, row.round, row.revision, row.compact, row.bytes, row.compactBytes,
          Number(row.scope === 'main' && row.entry.kind === 'message' && ['user', 'assistant'].includes(row.entry.role) && !row.entry.thinking));
      }
      prior.delete(key);
    }
    for (const row of prior.values()) db.prepare('DELETE FROM conversation_read_entries WHERE conversation_id=? AND scope=? AND sequence=?').run(record.view.id, row.scope, row.sequence);
    db.prepare(`DELETE FROM conversation_entry_contents WHERE conversation_id=? AND NOT EXISTS(
      SELECT 1 FROM conversation_read_entries e WHERE e.conversation_id=conversation_entry_contents.conversation_id AND e.content_revision=conversation_entry_contents.content_revision)`).run(record.view.id);
  }
  static decode(row: Content, reader?: NativeContentReader, lazy = false, compact?: string | null): ConversationEntry {
    if (row.codec === 'native-v1') {
      let ref: NativeToolContent;
      try { ref = JSON.parse(Buffer.from(row.body).toString('utf8')); if (ref.version !== 1 || ref.entry.kind !== 'tool' || !reader) throw new Error(); }
      catch { throw new AgentServiceError('agent_native_content_unavailable', '原生正文引用不可读；已保留记录，不会重发操作。', 409); }
      if (!lazy) return reader.tool(ref, row.content_revision);
      const entry = structuredClone(ref.entry); let resolved: ConversationEntry | undefined, changed = false;
      for (const key of ['text', ...(ref.input ? ['input'] : [])] as Array<'text' | 'input'>) {
        Object.defineProperty(entry, key, { enumerable: true, configurable: true,
          get: () => (resolved ??= reader.tool(ref, row.content_revision))[key],
          set: value => { changed = true; resolved ??= reader.tool(ref, row.content_revision); resolved[key] = value; } });
      }
      const original = metadata(entry);
      lazyEntries.set(entry, { row, compact: compact!, metadata: original, untouched: () => !changed });
      registerEntryRevision(entry, () => !changed && metadata(entry) === original ? row.content_revision : undefined);
      return entry;
    }
    try {
      let bytes: Buffer;
      if (row.codec === 'raw') bytes = typeof row.body === 'string' ? Buffer.from(row.body) : Buffer.from(row.body);
      else if (row.codec === 'zstd' && Number.isSafeInteger(row.body_bytes) && row.body_bytes > 0 && row.body_bytes <= maximumDecoded) {
        bytes = zstdDecompressSync(Buffer.from(row.body), { maxOutputLength: row.body_bytes });
      } else throw new Error('entry_codec_or_size_invalid');
      if (bytes.length !== row.body_bytes || digest(bytes) !== row.content_revision) throw new Error('entry_digest_mismatch');
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as ConversationEntry;
    } catch { throw new AgentServiceError('agent_entry_corrupt', '消息正文损坏、编码不支持或超出解压预算；原记录已保留，不会重发操作。', 409); }
  }
  static load(db: DatabaseSync, id: string, scope = 'main', reader?: NativeContentReader, lazy = false): ConversationEntry[] {
    this.assertPositions(db, id, scope);
    return (db.prepare(`SELECT c.*,e.compact FROM conversation_read_entries e LEFT JOIN conversation_entry_contents c
      ON c.conversation_id=e.conversation_id AND c.content_revision=e.content_revision
      WHERE e.conversation_id=? AND e.scope=? ORDER BY e.sequence`).all(id, scope) as unknown as (Content & {compact:string|null})[]).map(row => this.decode(row, reader, lazy, row.compact));
  }
  static assertPositions(db: DatabaseSync, id: string, scope = 'main'): void {
    const expected = db.prepare(`SELECT ${scope === 'main' ? 'entry_count' : 'inherited_count'} AS n FROM conversations WHERE id=?`).get(id);
    const actual = db.prepare('SELECT count(*) AS n FROM conversation_read_entries WHERE conversation_id=? AND scope=?').get(id, scope);
    if (!expected || expected.n !== actual!.n) throw new AgentServiceError('agent_entry_corrupt', '消息位置缺失或与对话不一致；原数据和备份已保留。', 409);
  }
  static hydrate(db: DatabaseSync, record: StoredConversation, reader?: NativeContentReader): StoredConversation {
    if (!this.available(db)) return record;
    delete (record as StoredConversation & { _bodyFormat?: number })._bodyFormat;
    record.view.entries = this.load(db, record.view.id, 'main', reader, !!reader);
    if (record.inheritedContext) record.inheritedContext.entries = this.load(db, record.view.id, 'inherited', reader, !!reader);
    return record;
  }
  /** Search is a read-only projection of visible raw messages, never compressed tools. */
  static installSearch(db: DatabaseSync): void {
    db.function('conversation_search_body', (body, revision, codec, bytes) => {
      this.decode({ body: body as string, content_revision: revision as string, codec: codec as string, body_bytes: bytes as number });
      return body as string;
    });
    const source = this.available(db)
      ? `SELECT e.conversation_id AS owner_id,e.sequence,CASE WHEN e.visible=1 THEN conversation_search_body(c.body,c.content_revision,c.codec,c.body_bytes) ELSE '{}' END AS value
         FROM conversation_read_entries e LEFT JOIN conversation_entry_contents c ON c.conversation_id=e.conversation_id AND c.content_revision=e.content_revision WHERE e.scope='main' AND e.visible=1`
      : `SELECT c.id AS owner_id,entry.key AS sequence,entry.value FROM conversations c,json_each(c.body,'$.view.entries') entry`;
    db.exec(`CREATE TEMP VIEW conversation_search_entries AS ${source}`);
  }
  static content(db: DatabaseSync, id: string, entryId: string): (Content & { compact: string | null }) | undefined {
    return db.prepare(`SELECT c.*,e.content_revision,e.compact FROM conversation_read_entries e LEFT JOIN conversation_entry_contents c
      ON c.conversation_id=e.conversation_id AND c.content_revision=e.content_revision
      WHERE e.conversation_id=? AND e.scope='main' AND e.id=?`).get(id, entryId) as unknown as (Content & {compact:string|null}) | undefined;
  }
}
