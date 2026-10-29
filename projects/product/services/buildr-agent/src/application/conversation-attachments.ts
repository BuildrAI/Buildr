import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { AttachmentInput, ExecutorImage } from '../contracts.ts';
import { expected, fail, type StoredConversation } from '../domain/agent-state.ts';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 32 * 1024 * 1024;
export const MAX_VISUAL_INPUTS = 32;
const TEMP_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TEMP_BYTES = 256 * 1024 * 1024;
const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Private media files and their derived visual inputs share the conversation's save/version boundary. */
export class ConversationAttachments {
  private readonly options: { root: string; now(): string; save(record: StoredConversation): void };
  constructor(options: ConversationAttachments['options']) { this.options = options; }
  inherit(source: StoredConversation, target: StoredConversation): void {
    const ids = new Set(target.view.entries.flatMap(entry => entry.attachments ?? []));
    for (const id of [...ids]) for (const frame of source.attachments[id]?.video?.frames ?? []) ids.add(frame.id);
    if (!ids.size) return;
    const directory = path.join(this.options.root, 'attachments', target.view.id);
    for (const location of [path.dirname(directory), directory]) {
      fs.mkdirSync(location, { recursive: true, mode: 0o700 });
      if (!fs.lstatSync(location).isDirectory() || fs.lstatSync(location).isSymbolicLink()) fail('agent_attachment_unsafe', '附件目录来源不安全。', 409);
    }
    for (const id of ids) {
      const material = this.read(source, id);
      fs.writeFileSync(path.join(directory, id), material.bytes, { flag: 'wx', mode: 0o600 });
      target.attachments[id] = structuredClone(source.attachments[id]!);
    }
    this.options.save(target);
  }
  get(record: StoredConversation, id: string): ExecutorImage {
    const meta = record.attachments[id];
    if (!meta || !/^[a-f0-9-]{36}$/.test(id)) fail('agent_attachment_missing', '附件不属于此对话。', 404);
    const filename = path.join(this.options.root, 'attachments', record.view.id, id);
    const stat = fs.lstatSync(filename, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== meta.size) fail('agent_attachment_changed', '附件来源已变化，请重新添加。', 409);
    return { id, path: filename, mimeType: meta.mimeType };
  }
  expand(record: StoredConversation, ids: string[]): { images: ExecutorImage[]; description: string } {
    const images: ExecutorImage[] = [], videos: unknown[] = [];
    for (const id of ids) {
      const original = this.get(record, id), meta = record.attachments[id]!;
      if (!meta.video) {
        if (!imageTypes.includes(original.mimeType)) fail('agent_attachment_changed', '视频画面尚未准备好，请重新添加。', 409);
        images.push(original);
      } else {
        const frames = meta.video.frames.map(frame => ({ ...this.get(record, frame.id), time: frame.time }));
        images.push(...frames);
        videos.push({ ...original, duration: meta.video.duration, frames });
      }
    }
    return { images: [...new Map(images.map(image => [image.id, image])).values()], description: videos.length ? '\n\n用户附加视频（仅交付以下时间点的抽样画面，不含音轨；不能据此声称连续观看；原件可按当前权限按需读取）：\n' + JSON.stringify(videos) : '' };
  }
  describe(record: StoredConversation, id: string) {
    return { ...this.get(record, id), ...(record.attachments[id]!.video ? { video: { ...record.attachments[id]!.video, frames: record.attachments[id]!.video!.frames.map(frame => ({ ...this.get(record, frame.id), time: frame.time })) } } : {}) };
  }
  add(record: StoredConversation, input: AttachmentInput, pendingIds: string[]) {
    if (input.expectedAttachmentRevision !== undefined) expected(hash(record.attachments), input.expectedAttachmentRevision);
    else expected(record.view.revision, input.expectedRevision);
    const video = videoTypes.includes(input.mimeType);
    if ((!video && !imageTypes.includes(input.mimeType)) || !(input.bytes instanceof Uint8Array)) fail('agent_image_invalid', '请选择图片或 MP4、WebM、MOV 视频。');
    const bytes = Buffer.from(input.bytes), limit = video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (!bytes.length || bytes.length > limit) fail(video ? 'agent_video_invalid' : 'agent_image_invalid', video ? '视频为空或超过32 MiB。' : '图片内容无效或超过8 MiB。', 413);
    const magic = video ? input.mimeType === 'video/webm' ? bytes.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) && bytes.subarray(0,4096).includes(Buffer.from('webm')) : bytes.length >= 16 && bytes.subarray(4,8).toString() === 'ftyp' && /^(?:isom|iso[2-9]|mp4[12]|avc1|M4V |qt  |MSNV|dash)/.test(bytes.subarray(8,12).toString())
      : input.mimeType === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : input.mimeType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : input.mimeType === 'image/gif' ? ['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString()) : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
    if (!magic) fail(video ? 'agent_video_invalid' : 'agent_image_invalid', '附件类型与实际内容不符。');
    if (video) {
      const info = input.video;
      if (!info || !Number.isFinite(info.duration) || info.duration <= 0 || !Array.isArray(info.frames) || !info.frames.length || info.frames.length > 8 || new Set(info.frames.map(frame => frame.id)).size !== info.frames.length) fail('agent_video_invalid', '视频抽样画面无效，请重新添加。');
      let previous = -1;
      for (const frame of info.frames) {
        if (!Number.isFinite(frame.time) || frame.time < 0 || frame.time > info.duration || frame.time <= previous) fail('agent_video_invalid', '视频画面时间无效。');
        previous = frame.time;
        const image = this.get(record, frame.id);
        if (!imageTypes.includes(image.mimeType) || record.attachments[frame.id]!.video) fail('agent_video_invalid', '视频必须引用同一对话的图片画面。');
      }
    } else if (input.video !== undefined) fail('agent_video_invalid', '图片不能声明视频画面。');
    const directory = path.join(this.options.root, 'attachments', record.view.id);
    for (const location of [path.dirname(directory), directory]) {
      fs.mkdirSync(location, { recursive: true, mode: 0o700 });
      if (fs.lstatSync(location).isSymbolicLink()) fail('agent_attachment_unsafe', '附件目录来源不安全。', 409);
    }
    const referenced = new Set([...record.view.entries.flatMap(entry => entry.attachments ?? []), ...pendingIds]);
    for (const id of [...referenced]) for (const frame of record.attachments[id]?.video?.frames ?? []) referenced.add(frame.id);
    // Frames keep the parent's age; they must not expire seconds before an unsent video.
    const parentAge = new Map<string, number>();
    for (const meta of Object.values(record.attachments)) for (const frame of meta.video?.frames ?? []) parentAge.set(frame.id, Math.max(parentAge.get(frame.id) ?? 0, Date.parse(meta.createdAt ?? '') || 0));
    const expired: string[] = [], now = Date.parse(this.options.now());
    let temporaryBytes = 0, temporaryCount = 0;
    for (const [key, meta] of Object.entries(record.attachments)) {
      if (!/^[a-f0-9-]{36}$/.test(key)) fail('agent_attachment_unsafe', '附件记录来源不安全。', 409);
      if (referenced.has(key)) continue;
      const filename = path.join(directory, key);
      const createdAt = Math.max(meta.createdAt ? Date.parse(meta.createdAt) : fs.lstatSync(filename, { throwIfNoEntry: false })?.mtimeMs ?? 0, parentAge.get(key) ?? 0);
      if (now - createdAt >= TEMP_TTL_MS) { delete record.attachments[key]; expired.push(filename); }
      else { temporaryBytes += meta.size; temporaryCount++; }
    }
    if (expired.length) {
      this.options.save(record);
      for (const filename of expired) { try { fs.unlinkSync(filename); } catch { /* Registered references were already removed. */ } }
    }
    if (temporaryCount >= 64 || temporaryBytes + bytes.length > MAX_TEMP_BYTES) fail('agent_attachment_capacity', '未发送附件已达64份或256 MiB；临时附件保留24小时。', 413);
    // Cleanup may have removed an expired frame referenced by this new upload.
    for (const frame of input.video?.frames ?? []) this.get(record, frame.id);
    const id = randomUUID(), filename = path.join(directory, id);
    fs.writeFileSync(filename, bytes, { flag: 'wx', mode: 0o600 });
    record.attachments[id] = { mimeType: input.mimeType, size: bytes.length, createdAt: this.options.now(), ...(input.video ? { video: structuredClone(input.video) } : {}) };
    try { this.options.save(record); } catch (error) { fs.unlinkSync(filename); throw error; }
    return { id, mimeType: input.mimeType, size: bytes.length, revision: record.view.revision, attachmentRevision: hash(record.attachments) };
  }
  read(record: StoredConversation, id: string): { bytes: Buffer; mimeType: string } {
    const attachment = this.get(record, id), limit = attachment.mimeType.startsWith('video/') ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const descriptor = fs.openSync(attachment.path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size !== record.attachments[id]!.size || stat.size > limit) fail('agent_attachment_changed', '附件来源已变化。', 409);
      return { bytes: fs.readFileSync(descriptor), mimeType: attachment.mimeType };
    } finally { fs.closeSync(descriptor); }
  }
}
