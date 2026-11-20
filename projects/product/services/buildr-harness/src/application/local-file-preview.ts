import fs from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { AgentServiceError } from '../domain/agent-state.ts';

export const LOCAL_TEXT_PREVIEW_LIMIT = 1024 * 1024;
export const LOCAL_IMAGE_PREVIEW_LIMIT = 8 * 1024 * 1024;
export const LOCAL_HTML_PREVIEW_LIMIT = 20 * 1024 * 1024;
export const LOCAL_HTML_PREVIEW_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

export interface LocalFilePreview {
  kind: 'markdown' | 'html' | 'image' | 'text' | 'unsupported';
  path: string;
  content: string;
  truncated: boolean;
  htmlUrl?: string;
  message?: string;
}

const IMAGE_MIME_TYPES = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.bmp', 'image/bmp'],
  ['.ico', 'image/x-icon'],
]);

const KNOWN_BINARY_EXTENSIONS = new Set([
  '.pdf', '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.dmg', '.pkg', '.exe', '.dll', '.so', '.dylib', '.wasm',
  '.mp4', '.mov', '.webm', '.mp3', '.wav', '.flac', '.woff', '.woff2', '.ttf', '.otf',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.sqlite', '.db', '.class', '.jar', '.pyc',
]);

function readExactBytes(fd: number, length: number): Buffer {
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const read = fs.readSync(fd, bytes, offset, length - offset, offset);
    if (read <= 0) break;
    offset += read;
  }
  if (offset !== length) throw new AgentServiceError('agent_directory_file_changed', '来源文件已变化。', 409);
  return bytes;
}

function resolveLocalFile(input: { path: string; cwd?: string }): { selected: string; actual: string; stat: fs.Stats; ext: string } {
  if (typeof input.path !== 'string' || !input.path || input.path.length > 4096 || /[\u0000-\u001f\u007f]/u.test(input.path) || /^[/\\]{2}/u.test(input.path)) {
    throw new AgentServiceError('agent_directory_file_invalid', '来源文件路径无效。');
  }
  const selected = path.isAbsolute(input.path)
    ? path.normalize(input.path)
    : typeof input.cwd === 'string' && path.isAbsolute(input.cwd)
      ? path.resolve(input.cwd, input.path)
      : '';
  if (!selected) throw new AgentServiceError('agent_directory_file_invalid', '来源文件路径无效。');
  let actual: string, stat: fs.Stats;
  try {
    actual = fs.realpathSync(selected);
    stat = fs.statSync(actual);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EACCES') {
      throw new AgentServiceError('agent_directory_file_forbidden', '来源文件不可读取。', 403);
    }
    throw new AgentServiceError('agent_directory_file_missing', '来源文件不存在。', 404);
  }
  if (!stat.isFile()) throw new AgentServiceError('agent_directory_file_invalid', '目标不是可读取的普通文件。');
  return { selected, actual, stat, ext: path.extname(actual).toLowerCase() };
}

function openVerifiedFile(target: { selected: string; actual: string; stat: fs.Stats }): { fd: number; size: number } {
  const fd = fs.openSync(target.actual, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd);
    if (opened.ino !== target.stat.ino || opened.dev !== target.stat.dev || !opened.isFile()) {
      throw new AgentServiceError('agent_directory_file_changed', '来源文件已变化。', 409);
    }
    return { fd, size: opened.size };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

export async function previewLocalFile(input: { path: string; cwd?: string }): Promise<LocalFilePreview> {
  const target = resolveLocalFile(input);
  const imageMime = IMAGE_MIME_TYPES.get(target.ext);
  if (!imageMime && KNOWN_BINARY_EXTENSIONS.has(target.ext)) {
    return { kind: 'unsupported', path: target.actual, content: '此类型仅可复制路径，不执行或内嵌打开。', truncated: false };
  }
  const { fd, size } = openVerifiedFile(target);
  try {
    if (imageMime) {
      if (size > LOCAL_IMAGE_PREVIEW_LIMIT) {
        throw new AgentServiceError('agent_directory_file_too_large', '图片超出 8 MiB 预览上限。', 413);
      }
      const bytes = readExactBytes(fd, size);
      if (fs.realpathSync(target.selected) !== target.actual) {
        throw new AgentServiceError('agent_directory_file_changed', '来源路径已变化。', 409);
      }
      return { kind: 'image', path: target.actual, content: `data:${imageMime};base64,${bytes.toString('base64')}`, truncated: false };
    }
    const isHtml = target.ext === '.html' || target.ext === '.htm';
    if (isHtml && size > LOCAL_HTML_PREVIEW_LIMIT) {
      throw new AgentServiceError('agent_directory_file_too_large', 'HTML 文件超出 20 MiB 预览上限。', 413);
    }
    const bytes = readExactBytes(fd, Math.min(size, LOCAL_TEXT_PREVIEW_LIMIT));
    if (fs.realpathSync(target.selected) !== target.actual) {
      throw new AgentServiceError('agent_directory_file_changed', '来源路径已变化。', 409);
    }
    const truncated = size > bytes.length;
    if (isHtml) {
      let content: string;
      try {
        content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes, { stream: truncated });
      } catch {
        throw new AgentServiceError('agent_directory_file_encoding', '此 HTML 文件不是可预览的 UTF-8 文本。', 415);
      }
      return { kind: 'html', path: target.actual, content, truncated };
    }
    if (bytes.includes(0)) {
      return { kind: 'unsupported', path: target.actual, content: '此类型仅可复制路径，不执行或内嵌打开。', truncated: false };
    }
    let content: string;
    try {
      content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes, { stream: truncated });
    } catch {
      return { kind: 'unsupported', path: target.actual, content: '此文件不是可预览的 UTF-8 文本，仅可复制路径查看。', truncated: false };
    }
    return { kind: target.ext === '.md' || target.ext === '.markdown' ? 'markdown' : 'text', path: target.actual, content, truncated };
  } finally {
    fs.closeSync(fd);
  }
}

export async function readLocalHtmlFile(input: { path: string; cwd?: string }): Promise<{ path: string; html: string }> {
  const target = resolveLocalFile(input);
  if (target.ext !== '.html' && target.ext !== '.htm') {
    throw new AgentServiceError('agent_directory_file_unsupported', '仅支持预览 HTML 文件。', 415);
  }
  const { fd, size } = openVerifiedFile(target);
  try {
    if (size > LOCAL_HTML_PREVIEW_LIMIT) {
      throw new AgentServiceError('agent_directory_file_too_large', 'HTML 文件超出 20 MiB 预览上限。', 413);
    }
    const bytes = readExactBytes(fd, size);
    if (fs.realpathSync(target.selected) !== target.actual) {
      throw new AgentServiceError('agent_directory_file_changed', '来源路径已变化。', 409);
    }
    let html: string;
    try {
      html = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new AgentServiceError('agent_directory_file_encoding', '此 HTML 文件不是可预览的 UTF-8 文本。', 415);
    }
    return { path: target.actual, html };
  } finally {
    fs.closeSync(fd);
  }
}

export function writeIsolatedLocalHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': LOCAL_HTML_PREVIEW_CSP,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  });
  res.end(html);
}
