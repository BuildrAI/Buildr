import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { StoredConversation } from '../domain/agent-state.ts';
import type { NativeAttachmentContent, NativeToolContent } from '../native-content-contracts.ts';
import { ConversationEntryStore, type Content } from './conversation-entry-store.ts';

/** Physical replacement never changes message identity or overwrites a newer conversation. */
export class NativeContentStore {
  readonly db: DatabaseSync;
  private readonly filename: string;
  constructor(filename: string, write: boolean) {
    this.filename=filename;
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('native_store_unsafe');
    this.db = new DatabaseSync(filename, { readOnly: !write });
    this.db.exec('PRAGMA busy_timeout=100');
    const version = Number(this.db.prepare('PRAGMA user_version').get()!.user_version);
    if (version < (write ? 7 : 5) || version > 9) { this.db.close(); throw new Error('native_store_version'); }
    if (write) this.db.exec('CREATE TABLE IF NOT EXISTS conversation_storage_cursor(id INTEGER PRIMARY KEY CHECK(id=1),entry INTEGER NOT NULL,attachment TEXT NOT NULL); INSERT OR IGNORE INTO conversation_storage_cursor VALUES(1,0,\'\')');
  }
  /** Release at most 2 MiB per pass; a busy reader/writer merely defers reclamation. */
  reclaim(): number {
    try {
      if (Number(this.db.prepare('PRAGMA auto_vacuum').get()!.auto_vacuum)!==2) return 0;
      const pageSize=Number(this.db.prepare('PRAGMA page_size').get()!.page_size);
      const before=fs.statSync(this.filename).size;
      const pages=Math.max(1,Math.floor(2*1024*1024/pageSize));
      this.db.exec(`PRAGMA incremental_vacuum(${pages})`);
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      return Math.max(0,before-fs.statSync(this.filename).size);
    } catch { return 0; }
  }
  close(): void { this.db.close(); }
  cursor(): {entry:number; attachment:string} {
    return this.db.prepare('SELECT entry,attachment FROM conversation_storage_cursor WHERE id=1').get() as unknown as {entry:number;attachment:string};
  }
  advance(entry: number, attachment: string): void { this.db.prepare('UPDATE conversation_storage_cursor SET entry=?,attachment=? WHERE id=1').run(entry, attachment); }
  entries(after: number, limit: number) {
    return this.db.prepare(`SELECT c.rowid AS position,c.*,v.body AS header,v.revision AS conversation_revision
      FROM conversation_entry_contents c JOIN conversations v ON v.id=c.conversation_id
      WHERE c.rowid>? ORDER BY c.rowid LIMIT ?`).all(after, limit) as unknown as Array<Content & {position:number;conversation_id:string;header:string;conversation_revision:string}>;
  }
  attachments(after: string, limit: number) {
    const split=after.indexOf('#'),id=split<0?after:after.slice(0,split);
    return this.db.prepare(`SELECT id,body FROM conversations WHERE id${split<0?'>':'>='}? AND json_extract(body,'$.attachments')<>'{}' ORDER BY id LIMIT ?`).all(id, limit) as Array<{id:string;body:string}>;
  }
  replaceTool(row: Content & {conversation_id:string;header:string}, reference: NativeToolContent, verify: () => boolean): boolean {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.db.prepare('SELECT body FROM conversations WHERE id=?').get(row.conversation_id);
      if (current?.body !== row.header || !verify()) { this.db.exec('ROLLBACK'); return false; }
      const encoded=ConversationEntryStore.encodeReference(reference);
      const result = this.db.prepare('UPDATE conversation_entry_contents SET codec=?,body=? WHERE conversation_id=? AND content_revision=? AND codec=? AND body=?')
        .run(encoded.codec,encoded.body,row.conversation_id,row.content_revision,row.codec,row.body);
      if (result.changes) {
        const compact = JSON.stringify(ConversationEntryStore.compact(ConversationEntryStore.decode(row),row.content_revision,true));
        this.db.prepare('UPDATE conversation_read_entries SET compact=?,compact_bytes=? WHERE conversation_id=? AND content_revision=?')
          .run(compact,Buffer.byteLength(compact),row.conversation_id,row.content_revision);
      }
      this.db.exec('COMMIT'); return !!result.changes;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  referenceAttachment(header: string, id: string, reference: NativeAttachmentContent, verify: () => boolean): boolean {
    const record = JSON.parse(header) as StoredConversation;
    if (!record.attachments[id]) return false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.db.prepare('SELECT body FROM conversations WHERE id=?').get(record.view.id);
      if (current?.body !== header || !verify()) { this.db.exec('ROLLBACK'); return false; }
      record.attachments[id]!.nativeContent = reference;
      this.db.prepare('UPDATE conversations SET body=? WHERE id=? AND body=?').run(JSON.stringify(record),record.view.id,header);
      // Only the private media address changes; preserve message projection validity and logical revision.
      this.db.prepare("UPDATE conversation_read_states SET state=json_set(state,'$.attachments',json(?)) WHERE id=? AND revision=?")
        .run(JSON.stringify(record.attachments),record.view.id,record.view.revision);
      this.db.exec('COMMIT'); return true;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
