import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MAX_BYTES = 512 * 1024;
const MAX_ENTRIES = 500;
const textExtensions = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.py', '.sh', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.html', '.xml', '.csv']);
export function skillContentError(message: string, status = 400): Error {
  return Object.assign(new Error(message), { status, code: 'skill_content_unavailable' });
}
function safeRelative(value: string): string[] {
  if (!value || path.isAbsolute(value) || value.includes('\\') || value.includes('\0') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw skillContentError('技能文件路径必须位于已登记的源目录内。');
  }
  return value.split('/');
}
function safePath(root: string, relative: string): string {
  let target = root;
  for (const part of safeRelative(relative)) {
    target = path.join(target, part);
    if (fs.lstatSync(target).isSymbolicLink()) throw skillContentError('不读取符号链接指向的技能内容。');
  }
  return target;
}
export function skillSourceRoot(workspaceRoot: string, relative: string): string {
  const directory = safePath(fs.realpathSync(workspaceRoot), `skills/${relative}`);
  if (!fs.statSync(directory).isDirectory()) throw skillContentError('技能源不是目录。');
  return directory;
}
export function readSkillText(directory: string, relative: string) {
  const target = safePath(directory, relative);
  const stat = fs.lstatSync(target);
  if (!stat.isFile()) throw skillContentError('只支持读取普通文本文件。');
  if (stat.size > MAX_BYTES) throw skillContentError('文件超过 512 KiB，暂不支持在线阅读。', 413);
  if (path.basename(relative) !== 'SKILL.md' && !textExtensions.has(path.extname(relative).toLowerCase())) throw skillContentError('此文件类型暂不支持在线阅读。', 415);
  const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.size > MAX_BYTES) throw skillContentError('文件已变化或超过阅读限制。');
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    const size = fs.readSync(fd, bytes, 0, bytes.length, 0);
    if (size > MAX_BYTES) throw skillContentError('文件超过 512 KiB，暂不支持在线阅读。', 413);
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)); } catch { throw skillContentError('此文件不是有效的 UTF-8 文本。', 415); }
    if (content.includes('\0')) throw skillContentError('此文件不是可预览的文本。', 415);
    return { path: relative, content, format: path.extname(relative).toLowerCase() === '.md' ? 'markdown' : 'text', digest: `sha256-${crypto.createHash('sha256').update(bytes.subarray(0, size)).digest('hex')}` };
  } finally { fs.closeSync(fd); }
}
export function skillReadingBody(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
}
export function skillHeading(content: string): string | null {
  return skillReadingBody(content).replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '').match(/^#\s+(.+)$/m)?.[1]?.trim() || null;
}
export function listSkillFiles(directory: string) {
  const files: { path: string; size: number; readable: boolean; reason: string | null }[] = [];
  let visited = 0;
  let truncated = false;
  function walk(relative: string, depth: number) {
    if (depth > 12) { truncated = true; return; }
    const current = relative ? safePath(directory, relative) : directory;
    const dir = fs.opendirSync(current);
    try {
      let entry: fs.Dirent | null;
      while ((entry = dir.readSync())) {
        if (++visited > MAX_ENTRIES) { truncated = true; break; }
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const rel = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(rel, depth + 1);
        else {
          const stat = fs.lstatSync(path.join(directory, rel));
          const reason = entry.isSymbolicLink() ? '符号链接不支持读取' : !stat.isFile() ? '不是普通文件' : stat.size > MAX_BYTES ? '文件超过 512 KiB' : !textExtensions.has(path.extname(rel).toLowerCase()) ? '暂不支持在线阅读此类型' : null;
          files.push({ path: rel, size: stat.size, readable: reason === null, reason });
        }
        if (truncated) break;
      }
    } finally { dir.closeSync(); }
  }
  walk('', 0);
  return { files: files.sort((a, b) => a.path.localeCompare(b.path)), truncated };
}
export function skillReadMessage(error: unknown): string {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '本地技能内容不存在。';
  if (error instanceof Error && 'code' in error && error.code === 'skill_content_unavailable') return error.message;
  return '技能内容暂时无法读取，请核对源目录。';
}
