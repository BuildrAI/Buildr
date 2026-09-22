export const PUBLICATION_ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
export const PUBLICATION_STATUSES = ['draft', 'planned', 'published'] as const;
export const MAX_PUBLICATION_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PUBLICATION_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_PUBLICATION_JSON_BYTES = 1024 * 1024;
export const MAX_PUBLICATION_UPLOAD_JSON_BYTES = 14 * 1024 * 1024;

export const PUBLICATION_ASSET_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.gif': 'image/gif', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.json': 'application/json', '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
});

export const PUBLICATION_PLATFORM_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'buildr-web': 'buildr-web', 'local-app': 'buildr-web',
});

export function canonicalPublicationPlatform(value: string) { return PUBLICATION_PLATFORM_ALIASES[value] || value; }

export function publicationError(code: string, message: string, status = 400, details?: unknown) {
  return Object.assign(new Error(message), { code, status, ...(details === undefined ? {} : { details }) });
}

export function assertPublicationId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !PUBLICATION_ID.test(id) || id.length > 128) throw publicationError('publication_reference_invalid', '文章 ID 不合法。');
}

export function validatePublicationFields(input: any, currentStatus?: string) {
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 150) throw publicationError('publication_title_invalid', '文章标题须为 1 至 150 个字符。');
  if (typeof input.summary !== 'string' || input.summary.length > 2000 || typeof input.content !== 'string') throw publicationError('publication_content_invalid', '文章摘要或正文不合法。');
  if (typeof input.status !== 'string' || (!PUBLICATION_STATUSES.includes(input.status) && input.status !== currentStatus)) throw publicationError('publication_status_invalid', '稿件状态不合法。');
  if (Buffer.byteLength(input.content, 'utf8') > MAX_PUBLICATION_JSON_BYTES - 16 * 1024) throw publicationError('publication_content_too_large', '文章正文超过允许大小。', 413);
  return { title: input.title.trim(), summary: input.summary, content: input.content, status: input.status };
}

export function decodePublicationUpload(filename: unknown, contentBase64: unknown) {
  if (typeof filename !== 'string' || !filename.trim() || filename.length > 240 || /[/\\\u0000-\u001f\u007f]/.test(filename) || filename === '.' || filename === '..') throw publicationError('publication_asset_invalid', '资源文件名不合法。');
  const extension = filename.match(/\.[^.]+$/)?.[0].toLowerCase() || '';
  const contentType = PUBLICATION_ASSET_TYPES[extension];
  if (!contentType) throw publicationError('publication_asset_type_forbidden', '不支持这种文件类型。请上传图片、文档或压缩包。');
  const isImage = contentType.startsWith('image/');
  const maxBytes = isImage ? MAX_PUBLICATION_IMAGE_BYTES : MAX_PUBLICATION_ATTACHMENT_BYTES;
  if (typeof contentBase64 !== 'string' || contentBase64.length > 4 * Math.ceil(maxBytes / 3)) throw publicationError('publication_asset_too_large', isImage ? '图片不能超过 5 MiB。' : '附件不能超过 10 MiB。', 413);
  if (!contentBase64 || contentBase64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(contentBase64)) throw publicationError('publication_asset_invalid', '上传内容不是有效的 Base64 文件。');
  const bytes = Buffer.from(contentBase64, 'base64');
  if (bytes.toString('base64') !== contentBase64) throw publicationError('publication_asset_invalid', '上传内容不是有效的 Base64 文件。');
  if (bytes.length > maxBytes) throw publicationError('publication_asset_too_large', isImage ? '图片不能超过 5 MiB。' : '附件不能超过 10 MiB。', 413);
  const validImage = extension === '.png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : extension === '.jpg' || extension === '.jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : extension === '.gif' ? ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))
    : extension === '.webp' ? bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    : true;
  if (!validImage) throw publicationError('publication_asset_signature_invalid', '文件内容与图片类型不符。');
  let stem = filename.slice(0, -extension.length).normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^[.-]+/, '').slice(0, 80);
  while (Buffer.byteLength(stem) > 140) stem = stem.slice(0, -1);
  return { bytes, extension, stem: stem || 'attachment', contentType, isImage };
}
