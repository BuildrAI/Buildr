import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { VideoAttachment } from '../contracts.ts';
import { expected, fail } from '../domain/agent-state.ts';

export interface DraftImageView { id: string; name: string; mimeType: string; size: number; frame?: boolean; video?: VideoAttachment }
export interface DraftImagesView { revision: string; images: DraftImageView[] }
type Row = DraftImageView & { bytes: Uint8Array };
const uuid = /^[a-f0-9-]{36}$/;
export function imageBytes(input: { mimeType: string; bytes: Uint8Array }): Buffer {
  if (!(input.bytes instanceof Uint8Array)) fail('agent_image_invalid', '图片内容无效。');
  const bytes = Buffer.from(input.bytes);
  if (!bytes.length || bytes.length > (input.mimeType.startsWith('video/') ? 32 : 8) * 1024 * 1024) fail(input.mimeType.startsWith('video/') ? 'agent_video_invalid' : 'agent_image_invalid', input.mimeType.startsWith('video/') ? '视频为空或超过32 MiB。' : '图片内容无效或超过8 MiB。', 413);
  const video = input.mimeType === 'video/webm' ? bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) && bytes.subarray(0,4096).includes(Buffer.from('webm')) : ['video/mp4','video/quicktime'].includes(input.mimeType) && bytes.length >= 16 && bytes.subarray(4,8).toString() === 'ftyp' && /^(?:isom|iso[2-9]|mp4[12]|avc1|M4V |qt  |MSNV|dash)/.test(bytes.subarray(8,12).toString());
  const valid = video || (input.mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : input.mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : input.mimeType === 'image/gif' ? ['GIF87a','GIF89a'].includes(bytes.subarray(0, 6).toString())
    : input.mimeType === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP');
  if (!valid) fail('agent_image_invalid', '图片内容与声明类型不符。');
  return bytes;
}

/** Private staging is source-scoped, not workspace- or conversation-scoped.
 * Bytes and membership share a transaction, so refresh cannot observe half an upload. */
export class DraftImageRepository {
  private readonly filename: string;
  constructor(root: string) { this.filename = path.join(root, 'draft-images.sqlite'); }
  private use<T>(write: boolean, work: (db: DatabaseSync) => T, absent: T): T {
    if (!write && !fs.existsSync(this.filename)) return absent;
    const directory = path.dirname(this.filename);
    if (write) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(this.filename, { throwIfNoEntry: false });
    if (fs.lstatSync(directory).isSymbolicLink() || stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)) fail('agent_storage_unsafe', '草稿图片存储来源不安全。', 409);
    const db = new DatabaseSync(this.filename, { readOnly: !write });
    try {
      db.exec('PRAGMA busy_timeout=2000');
      if (write) {
        db.exec('CREATE TABLE IF NOT EXISTS images(source TEXT NOT NULL,draft TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,mimeType TEXT NOT NULL,size INTEGER NOT NULL,bytes BLOB NOT NULL,PRIMARY KEY(source,draft,id))');
        if (!(db.prepare('PRAGMA table_info(images)').all() as Array<{name:string}>).some(column => column.name === 'metadata')) db.exec("ALTER TABLE images ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
        fs.chmodSync(this.filename, 0o600);
        db.exec('BEGIN IMMEDIATE');
      }
      const value = work(db);
      if (write) db.exec('COMMIT');
      return value;
    } catch (error) { if (write) { try { db.exec('ROLLBACK'); } catch {} } throw error; }
    finally { db.close(); }
  }
  private check(draft: string) { if (!uuid.test(draft)) fail('agent_draft_invalid', '草稿身份无效。'); }
  private view(rows: DraftImageView[]): DraftImagesView {
    return { revision: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), images: rows };
  }
  private rows(db: DatabaseSync, source: string, draft: string): DraftImageView[] {
    const metadata = (db.prepare('PRAGMA table_info(images)').all() as Array<{name:string}>).some(column => column.name === 'metadata');
    return (db.prepare(`SELECT id,name,mimeType,size,${metadata ? 'metadata' : "'{}' AS metadata"} FROM images WHERE source=? AND draft=? ORDER BY rowid`).all(source, draft) as unknown as Array<DraftImageView & {metadata:string}>).map(({metadata,...row}) => ({...row,...JSON.parse(metadata)}));
  }
  list(source: string, draft: string): DraftImagesView {
    this.check(draft);
    return this.use(false, db => this.view(this.rows(db, source, draft)), this.view([]));
  }
  add(source: string, draft: string, input: { expectedRevision: string; name: string; mimeType: string; bytes: Uint8Array; frame?: boolean; video?: VideoAttachment }): DraftImagesView {
    this.check(draft);
    const bytes = imageBytes(input);
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 255) fail('agent_image_invalid', '图片名称无效。');
    return this.use(true, db => {
      const rows = this.rows(db, source, draft);
      expected(this.view(rows).revision, input.expectedRevision);
      if (input.mimeType.startsWith('video/')) {
        const video=input.video;
        if(input.frame || !video || !Number.isFinite(video.duration) || video.duration<=0 || !video.frames.length || video.frames.length>8 || new Set(video.frames.map(f=>f.id)).size!==video.frames.length) fail('agent_video_invalid','视频抽样画面无效。');
        let previous=-1;
        for(const frame of video.frames){const found=rows.find(row=>row.id===frame.id);if(!found?.frame || !found.mimeType.startsWith('image/') || !Number.isFinite(frame.time) || frame.time<0 || frame.time>video.duration || frame.time<=previous || rows.some(row=>row.video?.frames.some(f=>f.id===frame.id)))fail('agent_video_invalid','视频必须引用本草稿尚未使用的有序画面。');previous=frame.time;}
      } else if(input.video) fail('agent_video_invalid','图片不能声明视频画面。');
      const total = db.prepare('SELECT coalesce(sum(size),0) AS total FROM images WHERE source=?').get(source) as { total: number };
      if ((!input.frame && rows.filter(row=>!row.frame).length >= 4) || rows.length >= 36 || total.total + bytes.length > 256 * 1024 * 1024) fail('agent_attachment_capacity', '每份草稿最多4份材料，本机未发送材料最多256 MiB；请移除不需要的图片。', 413);
      db.prepare('INSERT INTO images(source,draft,id,name,mimeType,size,bytes,metadata) VALUES(?,?,?,?,?,?,?,?)').run(source, draft, randomUUID(), input.name, input.mimeType, bytes.length, bytes, JSON.stringify({...input.frame ? {frame:true} : {},...input.video ? {video:input.video} : {}}));
      return this.view(this.rows(db, source, draft));
    }, undefined as never);
  }
  read(source: string, draft: string, id: string): Row {
    this.check(draft);
    const row = this.use(false, db => db.prepare('SELECT id,name,mimeType,size,bytes FROM images WHERE source=? AND draft=? AND id=?').get(source, draft, id) as unknown as Row | undefined, undefined);
    if (!row) fail('agent_attachment_missing', '草稿图片已不存在，请重新读取。', 404);
    return { ...row, ...this.list(source,draft).images.find(image=>image.id===id) };
  }
  remove(source: string, draft: string, ids: string[], revision?: string): DraftImagesView {
    this.check(draft);
    return this.use(true, db => {
      if (revision !== undefined) expected(this.view(this.rows(db, source, draft)).revision, revision);
      const rows=this.rows(db,source,draft), removing=new Set(ids);
      for(const row of rows)if(removing.has(row.id))for(const frame of row.video?.frames??[])removing.add(frame.id);
      if(rows.some(row=>!removing.has(row.id)&&row.video?.frames.some(frame=>removing.has(frame.id))))fail('agent_video_invalid','画面仍被草稿视频使用。',409);
      for (const id of removing) db.prepare('DELETE FROM images WHERE source=? AND draft=? AND id=?').run(source, draft, id);
      return this.view(this.rows(db, source, draft));
    }, undefined as never);
  }
}
