import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type MarkdownImageContext = { documentDigest: string; sourceIdentity: string };
export type MarkdownImageSource = { root: string; path: string; identity: unknown };
export type MarkdownImageRequest = MarkdownImageContext & { href: string };
export const MAX_DOCUMENT_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_MARKDOWN_BYTES = 512 * 1024;
const imageTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const sha = (value: string | Uint8Array) => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
const failure = (code: string, message: string, status = 400) => Object.assign(new Error(message), { code, status });

export function assertMarkdownImageSourceRoot(scopeRoot: string, sourceRoot: string): void {
  const base = path.resolve(scopeRoot), target = path.resolve(sourceRoot);
  const relative = path.relative(base, target);
  const directories = !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    ? [base, ...relative.split(path.sep).filter(Boolean).map((_, index, parts) => path.join(base, ...parts.slice(0, index + 1)))] : [target];
  for (const directory of directories) {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw failure('document_image_path_forbidden', '图片来源目录不能通过符号链接或非普通目录读取。');
  }
}

function relativeFile(value: string): void {
  if (!value || value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value) || /^[a-z][a-z0-9+.-]*:/i.test(value) || path.posix.normalize(value) !== value || value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.') || /^(node_modules|credentials?|secrets?|passwords?|tokens?|id_rsa|id_ed25519)$/i.test(part)) || /(?:credential|secret|password|token|\.pem$|\.key$|\.p12$|\.pfx$)/i.test(path.posix.basename(value))) throw failure('document_image_path_forbidden', '图片或正文路径不在可读取的普通资料范围内。');
}

function filePath(root: string, relative: string): string {
  relativeFile(relative);
  const base = path.resolve(root);
  const rootStat = fs.lstatSync(base);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw failure('document_image_path_forbidden', '图片来源根不是普通目录。');
  let current = base;
  for (const [index, part] of relative.split('/').entries()) {
    current = path.join(current, part);
    const entry = fs.lstatSync(current);
    if (entry.isSymbolicLink() || (index < relative.split('/').length - 1 && !entry.isDirectory())) throw failure('document_image_path_forbidden', '不能通过符号链接或非普通目录读取图片。');
  }
  if (fs.realpathSync(current) !== path.join(fs.realpathSync(base), relative)) throw failure('document_image_path_forbidden', '图片真实路径已变化。');
  return current;
}

const unchanged = (a: fs.Stats, b: fs.Stats) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
function readFile(root: string, relative: string, limit: number): Buffer {
  const file = filePath(root, relative);
  const observed = fs.lstatSync(file);
  if (!observed.isFile() || observed.size > limit) throw failure('document_image_content_limit', '图片或正文不是允许大小的普通文件。');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size > limit || !unchanged(observed, before)) throw failure('document_image_changed', '图片或正文在读取前变化，请刷新原文。', 409);
    const bytes = Buffer.alloc(Math.min(before.size + 1, limit + 1));
    let count = 0;
    while (count < bytes.length) {
      const size = fs.readSync(fd, bytes, count, bytes.length - count, null);
      if (!size) break;
      count += size;
    }
    const after = fs.fstatSync(fd);
    if (count !== before.size || !unchanged(before, after) || filePath(root, relative) !== file || !unchanged(after, fs.lstatSync(file))) throw failure('document_image_changed', '图片或正文在读取时变化，请刷新原文。', 409);
    return bytes.subarray(0, count);
  } finally { fs.closeSync(fd); }
}

export function markdownImageContext(source: MarkdownImageSource, documentDigest: string): MarkdownImageContext {
  relativeFile(source.path);
  const root = path.resolve(source.root);
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure('document_image_path_forbidden', '图片来源根不是普通目录。');
  return { documentDigest, sourceIdentity: sha(JSON.stringify([source.identity, fs.realpathSync(root), stat.dev, stat.ino, source.path])) };
}

/** Optional observation never changes the existing document's readability. */
export function observeMarkdownImageContext(source: MarkdownImageSource, content: string | null, actualDigest?: string | null): MarkdownImageContext | undefined {
  if (!content?.trim()) return undefined;
  try {
    const bytes = readFile(source.root, source.path, MAX_MARKDOWN_BYTES);
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const digest = sha(bytes);
    if (text !== content || (actualDigest && actualDigest !== digest)) return undefined;
    return markdownImageContext(source, digest);
  } catch { return undefined; }
}

function imageReference(document: string, documentPath: string, href: string): string {
  let fenced: { marker: string; length: number } | null = null;
  const prose = document.split('\n').filter(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenced) {
      if (marker && marker[1][0] === fenced.marker && marker[1].length >= fenced.length && /^[ \t\r]*$/.test(marker[2])) fenced = null;
      return false;
    }
    if (marker && (marker[1][0] === '~' || !marker[2].includes('`'))) {
      fenced = { marker: marker[1][0], length: marker[1].length };
      return false;
    }
    return true;
  }).join('\n');
  // Exact-length backtick runs delimit code spans, including spans containing
  // shorter runs. Index their next matching run once to avoid repeated scans.
  const runs = [...prose.matchAll(/`+/g)];
  const next = new Map<number, number>(), closing: number[] = [];
  for (let index = runs.length - 1; index >= 0; index--) {
    closing[index] = next.get(runs[index][0].length) ?? -1;
    next.set(runs[index][0].length, index);
  }
  let cursor = 0, visible = '';
  for (let index = 0; index < runs.length; index++) {
    if (runs[index].index < cursor || closing[index] < 0) continue;
    visible += prose.slice(cursor, runs[index].index);
    const end = runs[closing[index]];
    cursor = end.index + end[0].length;
    index = closing[index];
  }
  visible += prose.slice(cursor);
  if (![...visible.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].some(match => {
    let escaped = 0;
    for (let index = match.index - 1; index >= 0 && visible[index] === '\\'; index--) escaped++;
    return escaped % 2 === 0 && match[1] === href;
  })) throw failure('document_image_reference_missing', '图片引用已不在当前正文中，请刷新原文。', 404);
  let relative: string;
  try { relative = decodeURIComponent(href.split(/[?#]/)[0]); }
  catch { throw failure('document_image_path_forbidden', '图片引用路径编码无效。'); }
  if (!relative || relative.includes('\\') || relative.includes('\0') || relative.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(relative)) throw failure('document_image_path_forbidden', '只支持范围内的本地相对图片。');
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(documentPath), relative));
  relativeFile(resolved);
  if (!imageTypes[path.posix.extname(resolved).toLowerCase()]) throw failure('document_image_type_forbidden', '仅支持 PNG、JPEG、GIF 和 WebP 图片。');
  return resolved;
}

function validImage(bytes: Buffer, type: string): boolean {
  return type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : type === 'image/gif' ? /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))
    : type === 'image/webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

function snapshot(source: MarkdownImageSource) {
  const bytes = readFile(source.root, source.path, MAX_MARKDOWN_BYTES);
  let content: string;
  try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw failure('document_image_document_invalid', '图片所属正文不是合法 UTF-8。'); }
  return { content, context: markdownImageContext(source, sha(bytes)) };
}

function readCurrentMarkdownImage(resolveSource: () => MarkdownImageSource, input: MarkdownImageRequest) {
  if (typeof input.href !== 'string' || !input.href || input.href.length > 2048 || !/^sha256-[0-9a-f]{64}$/.test(input.documentDigest) || !/^sha256-[0-9a-f]{64}$/.test(input.sourceIdentity)) throw failure('document_image_input_invalid', '图片请求必须提供合法引用及已观察正文与来源。');
  const source = resolveSource();
  const before = snapshot(source);
  const matches = (context: MarkdownImageContext) => context.documentDigest === input.documentDigest && context.sourceIdentity === input.sourceIdentity;
  if (!matches(before.context)) throw failure('document_image_context_changed', '图片所属正文或实际来源已变化，请刷新原文。', 409);
  const relative = imageReference(before.content, source.path, input.href);
  const bytes = readFile(source.root, relative, MAX_DOCUMENT_IMAGE_BYTES);
  const contentType = imageTypes[path.posix.extname(relative).toLowerCase()];
  if (!validImage(bytes, contentType)) throw failure('document_image_invalid', '图片实际内容与允许类型不符。');
  const after = snapshot(resolveSource());
  if (!matches(after.context)) throw failure('document_image_context_changed', '图片所属正文或实际来源在读取时变化，请刷新原文。', 409);
  return { bytes, contentType, filename: path.posix.basename(relative) };
}

export function readMarkdownImage(resolveSource: () => MarkdownImageSource, input: MarkdownImageRequest) {
  try { return readCurrentMarkdownImage(resolveSource, input); }
  catch (cause) {
    const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null;
    if (code === 'ENOENT' || code === 'ENOTDIR') throw failure('document_image_unavailable', '图片或所属正文当前不存在，请刷新原文。', 404);
    if (code === 'EACCES' || code === 'EPERM') throw failure('document_image_unavailable', '图片或所属正文当前不可读取。', 403);
    if (code === 'ELOOP') throw failure('document_image_path_forbidden', '图片路径不能经过符号链接。');
    throw cause;
  }
}

export function documentImageQuery(searchParams: URLSearchParams, withPath = false) {
  const fields = new Set(['href', 'expectedDocumentDigest', 'expectedSourceIdentity', ...(withPath ? ['documentPath'] : [])]);
  if ([...searchParams.keys()].some(key => !fields.has(key) || searchParams.getAll(key).length !== 1) || [...fields].some(key => !searchParams.get(key))) throw failure('document_image_input_invalid', '图片请求参数不完整、重复或不受支持。');
  return { href: searchParams.get('href')!, documentDigest: searchParams.get('expectedDocumentDigest')!, sourceIdentity: searchParams.get('expectedSourceIdentity')!, ...(withPath ? { path: searchParams.get('documentPath')! } : {}) };
}
