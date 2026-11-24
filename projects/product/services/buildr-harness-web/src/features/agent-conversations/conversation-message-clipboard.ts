import { copyText } from '../../lib/copyText.ts';
import type { ConversationView } from './types.ts';

const storagePrefix = 'buildr:conversation-message-copy:v1:';
const lifetime = 60 * 60 * 1000;
const marker = /<span\b[^<>]*\bdata-buildr-message-copy="([\da-f-]{36})"/i;
export type MessageAttachmentSource = Pick<ConversationView, 'workspaceId' | 'id'>;
type AttachmentCopy = MessageAttachmentSource & { ids: string[] };

async function digest(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.replace(/\r\n/g, '\n')));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(text: string) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export async function copyMessageWithAttachments(profile: string, text: string, source: AttachmentCopy): Promise<'complete' | 'text' | 'failed'> {
  try {
    const token = crypto.randomUUID();
    const key = storagePrefix + profile;
    const html = `<span data-buildr-message-copy="${token}">${escapeHtml(text).replaceAll('\n', '<br>')}</span>`;
    await navigator.clipboard.write([new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      'text/html': new Blob([html], { type: 'text/html' }),
    })]);
    try {
      localStorage.setItem(key, JSON.stringify({ token, textDigest: await digest(text), expires: Date.now() + lifetime, source }));
      return 'complete';
    } catch { return text ? 'text' : 'failed'; }
  } catch { return text && await copyText(text) ? 'text' : 'failed'; }
}

/** HTML is only a token carrier; it cannot nominate a source or be rendered here. */
export function pastedMessageAttachments(profile: string, html: string, storage?: Pick<Storage, 'getItem'>): AttachmentCopy | 'unavailable' | undefined {
  const token = marker.exec(html)?.[1];
  if (!token) return;
  try {
    const record = JSON.parse((storage ?? localStorage).getItem(storagePrefix + profile) ?? 'null');
    const source = record?.source;
    if (record?.token === token && Number.isFinite(record.expires) && record.expires > Date.now()
      && typeof source?.workspaceId === 'string' && source.workspaceId && typeof source.id === 'string' && source.id
      && Array.isArray(source.ids) && source.ids.length > 0 && source.ids.length <= 9 && source.ids.every((id: unknown) => typeof id === 'string' && id)) {
      return source;
    }
  } catch { /* Storage is unavailable or no longer contains this copy. */ }
  return 'unavailable';
}

/** Plain-text controls may omit HTML from the paste event even when the clipboard has it. */
export async function readPastedMessageAttachments(profile: string, html: string, text: string) {
  const direct = pastedMessageAttachments(profile, html);
  if (direct || html) return direct;
  let record;
  try { record = JSON.parse(localStorage.getItem(storagePrefix + profile) ?? 'null'); }
  catch { return; }
  if (!record || !Number.isFinite(record.expires) || record.expires <= Date.now()) return;
  try {
    if (record.textDigest !== await digest(text)) return;
    for (const item of await navigator.clipboard.read()) {
      if (!item.types.includes('text/html')) continue;
      const source = pastedMessageAttachments(profile, await (await item.getType('text/html')).text());
      if (source && source !== 'unavailable' && item.types.includes('text/plain')
        && await digest(await (await item.getType('text/plain')).text()) === record.textDigest) return source;
      if (source === 'unavailable') return source;
    }
  } catch { return 'unavailable'; }
}

export async function readCopiedMessageAttachments(source: AttachmentCopy, read: (source: MessageAttachmentSource, id: string, signal: AbortSignal) => Promise<Blob>, signal: AbortSignal): Promise<File[]> {
  const files: File[] = [];
  for (const [index, id] of source.ids.entries()) {
    signal.throwIfAborted();
    try {
      const blob = await read(source, id, signal);
      signal.throwIfAborted();
      files.push(blob instanceof File ? blob : new File([blob], `附件 ${index + 1}`, { type: blob.type }));
    } catch {
      signal.throwIfAborted();
      throw new Error(`未能读取第 ${index + 1} 份附件，未添加复制的附件。`);
    }
  }
  return files;
}
