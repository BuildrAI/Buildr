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
type TextUpdate = {position:Position; previousRevision:string};
export type PreparedEntries = Position[];
const lazyEntries = new WeakMap<ConversationEntry, { row: Content; compact: string; metadata: string; untouched(): boolean }>();
const nativePositions = new WeakMap<ConversationEntry, {signature:string; position:Position}>();
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
        WHEN json_extract(NEW.body,'$._bodyFormat') IS NOT 9 OR json_array_length(NEW.body,'$.view.entries')>0 OR json_array_length(NEW.body,'$.inheritedContext.entries')>0
        BEGIN SELECT RAISE(ABORT,'agent_storage_writer_incompatible'); END;
      CREATE TRIGGER conversation_body_format_update BEFORE UPDATE OF body ON conversations
        WHEN json_extract(NEW.body,'$._bodyFormat') IS NOT 9 OR json_array_length(NEW.body,'$.view.entries')>0 OR json_array_length(NEW.body,'$.inheritedContext.entries')>0
        BEGIN SELECT RAISE(ABORT,'agent_storage_writer_incompatible'); END;`);
  }
  static header(record: StoredConversation): string {
    return JSON.stringify({
      ...record, _bodyFormat: 9, view: { ...record.view, entries: [] },
      ...(record.inheritedContext ? { inheritedContext: { ...record.inheritedContext, entries: [] } } : {}),
    });
  }
  static compact(entry: ConversationEntry, revision = digest(JSON.stringify(entry)), force = false): ConversationEntry {
    if (entry.kind !== 'tool' || !force && Buffer.byteLength(entry.text) + Buffer.byteLength(entry.input ?? '') <= 16 * 1024) return entry;
    return { ...entry, ...(presentedFilesForEntry(entry).length ? { presentedFiles: presentedFilesForEntry(entry) } : {}),
      text: entry.text.slice(0, 512), input: force ? entry.input?.slice(0,256) : entry.input && entry.input.length <= 4096 ? entry.input : undefined, detail: { revision } };
  }
  /** Prepare expensive compression before the ordinary write transaction. */
  static prepare(db: DatabaseSync, record: StoredConversation, nativeTool?:(entry:ConversationEntry)=>NativeToolContent|undefined): PreparedEntries {
    const existing = new Set((db.prepare('SELECT content_revision FROM conversation_entry_contents WHERE conversation_id=?').all(record.view.id) as Array<{content_revision: string}>).map(row => row.content_revision));
    let semantic: Map<string, NativeToolContent> | undefined;
    const references = () => {
      if (!semantic) {
        semantic = new Map();
        for(const row of db.prepare("SELECT c.* FROM conversation_entry_contents c WHERE conversation_id=? AND codec='native-tool'").all(record.view.id) as unknown as Content[]) {
          const reference = this.reference(row)!;
          semantic.set(reference.entry.id,reference);
        }
      }
      return semantic;
    };
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
        let nativeIdentityUnproven = false;
        if (lazy && lazy.untouched() && lazy.metadata === metadata(entry) && existing.has(lazy.row.content_revision)) {
          result.push({ scope, entry, round: rounds[index]!.id, revision: lazy.row.content_revision, compact: lazy.compact,
            bytes: lazy.row.body_bytes, compactBytes: Buffer.byteLength(lazy.compact) });
          return;
        }
        if(record.nativeTools?.[entry.id]) {
          const skeleton = {...entry,text: ''};
          delete skeleton.input;delete skeleton.detail;
          const signature = JSON.stringify(skeleton), cached = nativePositions.get(entry);
          if (cached?.signature === signature && existing.has(cached.position.revision)) {
            entry.detail = {revision:cached.position.revision};
            result.push({...cached.position,scope,entry,round:rounds[index]!.id,content:undefined});
            return;
          }
          const previous = references().get(entry.id);
          const reference = previous ? {...previous,entry:skeleton} : nativeTool?.(entry);
          if(reference?.version === 3) {
            const body = JSON.stringify(reference), revision = digest(body);
            const compact = JSON.stringify({...reference.entry, detail: {revision}});
            entry.detail = {revision};
            const position:Position={scope, entry, round: rounds[index]!.id, revision, compact: null, bytes: Buffer.byteLength(body), compactBytes: Buffer.byteLength(compact)};
            nativePositions.set(entry,{signature,position});
            result.push({...position,content: existing.has(revision) ? undefined : {...this.encodeReference(reference), content_revision: revision, body_bytes: Buffer.byteLength(body)}});
            return;
          }
          // 本次无法重新证明原生身份（例如运行被停止后原会话不再可就地绑定）。
          // 只用已捕获的本地内容保存这一条，并保留原生标记：之后可证明时仍升级为引用。
          // 若因此拒绝整次保存，这条记录会让该对话之后的每轮写入都失败。
          nativeIdentityUnproven = true;
          delete entry.detail;
        }
        const body = JSON.stringify(entry), revision = digest(body), bytes = Buffer.byteLength(body);
        let preview = JSON.stringify(this.compact(entry, revision,!!lazy?.untouched()));
        let content: Content | undefined;
        if (!existing.has(revision)) {
          if(lazy?.untouched()) {
            const reference=this.reference(lazy.row);
            if(reference) {
              const skeleton={...entry,text:''};if(reference.input)skeleton.input='';
              const encoded=this.encodeReference({...reference,entry:skeleton});
              content={...encoded,content_revision:revision,body_bytes:bytes};
            }
          }
          if(!content) {
          let stored: string | Uint8Array = body, codec = 'raw';
          if (entry.kind === 'tool' && ['completed', 'failed'].includes(entry.status ?? '') && bytes > 16 * 1024 && bytes <= maximumDecoded) {
            const compressed = zstdCompressSync(Buffer.from(body));
            if (compressed.length < bytes) { stored = compressed; codec = 'zstd'; }
          }
          content = { content_revision: revision, codec, body_bytes: bytes, body: stored };
          const reference=nativeIdentityUnproven?undefined:nativeTool?.(entry);
          if(reference){
            const encoded=this.encodeReference(reference),compact=JSON.stringify(this.compact(entry,revision,true));
            const priorPreview=preview===body?0:Buffer.byteLength(preview);
            if(Buffer.byteLength(stored)-Buffer.byteLength(encoded.body)-(Buffer.byteLength(compact)-priorPreview)>128){content={...encoded,content_revision:revision,body_bytes:bytes};preview=compact;}
          }
          }
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
    // Build the live revision set once. A correlated lookup scans the positions
    // for every body and makes each streamed character quadratic in history size.
    // Both scopes participate so inherited entries keep their pinned revisions.
    db.prepare(`DELETE FROM conversation_entry_contents WHERE conversation_id=? AND content_revision NOT IN(
      SELECT content_revision FROM conversation_read_entries WHERE conversation_id=?)`).run(record.view.id, record.view.id);
  }
  /** Only a previously saved, unchanged-size record may use the caller's exact text mutation. */
  static prepareText(db:DatabaseSync,record:StoredConversation,entryId:string):TextUpdate|undefined {
    const entry=record.view.entries.find(entry=>entry.id===entryId);
    if(!entry||entry.kind!=='message'||entry.role!=='assistant'||!entry.runId||record.nativeTools?.[entry.id])return;
    const old=db.prepare(`SELECT e.content_revision,e.round_id,c.entry_count,c.inherited_count
      FROM conversation_read_entries e JOIN conversations c ON c.id=e.conversation_id
      WHERE e.conversation_id=? AND e.scope='main' AND e.sequence=? AND e.id=?`).get(record.view.id,entry.sequence,entry.id) as {content_revision:string;round_id:string;entry_count:number;inherited_count:number}|undefined;
    if(!old||old.entry_count!==record.view.entries.length||old.inherited_count!==(record.inheritedContext?.entries.length??0)||old.round_id!=='run:'+entry.runId)return;
    const body=JSON.stringify(entry),revision=digest(body),bytes=Buffer.byteLength(body);
    return {previousRevision:old.content_revision,position:{scope:'main',entry,round:old.round_id,revision,compact:null,bytes,compactBytes:bytes,
      content:{content_revision:revision,codec:'raw',body_bytes:bytes,body}}};
  }
  /** Keep all other positions, including inherited pins, untouched in the same transaction. */
  static saveText(db:DatabaseSync,id:string,update:TextUpdate):void {
    const p=update.position;
    db.prepare('INSERT OR IGNORE INTO conversation_entry_contents(conversation_id,content_revision,codec,body_bytes,body) VALUES(?,?,?,?,?)').run(id,p.revision,'raw',p.bytes,p.content!.body);
    const changed=db.prepare(`UPDATE conversation_read_entries SET round_id=?,content_revision=?,compact=NULL,body_bytes=?,compact_bytes=?,visible=?
      WHERE conversation_id=? AND scope='main' AND sequence=? AND id=? AND content_revision=?`).run(p.round,p.revision,p.bytes,p.compactBytes,Number(!p.entry.thinking),id,p.entry.sequence,p.entry.id,update.previousRevision).changes;
    if(changed!==1)throw new AgentServiceError('agent_entry_corrupt','文本消息位置已变化；原记录已保留。',409);
    if(update.previousRevision!==p.revision)db.prepare(`DELETE FROM conversation_entry_contents WHERE conversation_id=? AND content_revision=?
      AND NOT EXISTS(SELECT 1 FROM conversation_read_entries WHERE conversation_id=? AND content_revision=?)`).run(id,update.previousRevision,id,update.previousRevision);
    db.prepare('UPDATE conversation_read_states SET message_revision=revision WHERE id=?').run(id);
  }
  static decode(row: Content, reader?: NativeContentReader, lazy = false, compact?: string | null): ConversationEntry {
    if(lazy&&compact&&['raw','zstd'].includes(row.codec)){
      const preview=JSON.parse(compact) as ConversationEntry;
      if(preview.kind==='tool'){
        const entry={...preview};delete entry.detail;
        let resolved:ConversationEntry|undefined,changed=false;
        for(const key of ['text','input'] as const)Object.defineProperty(entry,key,{enumerable:true,configurable:true,
          get:()=>(resolved??=this.decode(row,reader))[key],
          set:value=>{changed=true;resolved??=this.decode(row,reader);resolved[key]=value;}});
        const original=metadata(entry);
        lazyEntries.set(entry,{row,compact,metadata:original,untouched:()=>!changed});
        registerEntryRevision(entry,()=>!changed&&metadata(entry)===original?row.content_revision:undefined);
        return entry;
      }
    }
    if (['native-v1','native-v2','native-v2-zstd','native-tool'].includes(row.codec)) {
      let ref: NativeToolContent;
      try {
        ref=this.reference(row)!;if(!reader)throw new Error();
      }
      catch { throw new AgentServiceError('agent_native_content_unavailable', '原生正文引用不可读；已保留记录，不会重发操作。', 409); }
      if(ref.version === 3 && digest(JSON.stringify(ref)) !== row.content_revision) throw new AgentServiceError('agent_entry_corrupt','原生工具引用的内容版本不一致。',409);
      if(ref.version === 3 && lazy) {
        const entry = {...ref.entry, detail: {revision: row.content_revision}};
        registerEntryRevision(entry, () => row.content_revision);
        return entry;
      }
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
  /** Display a deferred tool without invoking its body getters. */
  static preview(entry: ConversationEntry): ConversationEntry {
    const lazy = lazyEntries.get(entry);
    if (!lazy?.untouched()) return entry;
    return {...JSON.parse(lazy.compact),...JSON.parse(metadata(entry))};
  }
  static encodeReference(reference: NativeToolContent): {codec:string;body:string|Uint8Array} {
    const body=JSON.stringify(reference);
    if(reference.version === 3) return {codec: 'native-tool', body};
    if(reference.version===1)return {codec:'native-v1',body};
    const compressed=zstdCompressSync(Buffer.from(body));
    return compressed.length<Buffer.byteLength(body)?{codec:'native-v2-zstd',body:compressed}:{codec:'native-v2',body};
  }
  static reference(row: Content): NativeToolContent|undefined {
    if(!['native-v1','native-v2','native-v2-zstd','native-tool'].includes(row.codec))return;
    const bytes=row.codec==='native-v2-zstd'?zstdDecompressSync(Buffer.from(row.body),{maxOutputLength:maximumDecoded}):Buffer.from(row.body);
    const reference=JSON.parse(bytes.toString('utf8')) as NativeToolContent;
    if(![1,2,3].includes(reference.version)||reference.entry?.kind!=='tool')throw new Error('native_reference_invalid');
    return reference;
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
      WHERE e.conversation_id=? AND e.id=? ORDER BY (e.scope='main') DESC LIMIT 1`).get(id, entryId) as unknown as (Content & {compact:string|null}) | undefined;
  }
}
