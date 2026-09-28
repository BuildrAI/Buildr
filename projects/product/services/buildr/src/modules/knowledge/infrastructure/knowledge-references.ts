import fs from 'node:fs';
import path from 'node:path';
import { knowledgeError } from '../domain/knowledge-index.ts';
import { digest, readKnowledgeFile, resolveKnowledgeFile } from './knowledge-files.ts';

export type KnowledgeReference = { kind: 'artifact' | 'source' | 'document'; id: string; links: string[] };
export type ReferenceFile = { root: string; path: string; content: string };
const imageTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

export function parseKnowledgeReference(value: string | null): KnowledgeReference {
  let item: unknown;
  try { item = JSON.parse(value || ''); } catch { throw knowledgeError('knowledge_reference_invalid', '引用入口无效。'); }
  const reference = item as KnowledgeReference;
  if (!reference || !['artifact', 'source', 'document'].includes(reference.kind) ||
      typeof reference.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(reference.id) ||
      !Array.isArray(reference.links) || reference.links.length > 12 ||
      reference.links.some(link => typeof link !== 'string' || !link || link.length > 2048))
    throw knowledgeError('knowledge_reference_invalid', '引用入口或引用链无效。');
  return reference;
}

function linkedPath(from: ReferenceFile, href: string) {
  if (!/\.md$/i.test(from.path)) throw knowledgeError('knowledge_reference_missing', '仅 Markdown 正文中的实际链接可以继续读取。');
  // Match the same inline link form supported by the reader, excluding code fences.
  let fenced = false;
  const markdown = from.content.split('\n').filter(line => {
    if (!fenced && /^```[\w-]*\s*$/.test(line)) { fenced = true; return false; }
    if (fenced && /^```\s*$/.test(line)) { fenced = false; return false; }
    return !fenced;
  }).join('\n').replace(/(\`+)([^\`]+?)\1/g, '');
  const links = [...markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]);
  if (!links.includes(href)) throw knowledgeError('knowledge_reference_missing', '该引用已不在当前正文中，请刷新原文。', 404);
  let relative: string;
  try { relative = decodeURIComponent(href.split(/[?#]/)[0]); } catch { throw knowledgeError('knowledge_path_forbidden', '引用路径无效。'); }
  if (!relative || /^[a-z][a-z0-9+.-]*:/i.test(relative) || relative.startsWith('/') || relative.includes('\\') || relative.includes('\0'))
    throw knowledgeError('knowledge_path_forbidden', '仅支持当前范围内的本地相对引用。');
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(from.path), relative));
  if (target === '..' || target.startsWith('../')) throw knowledgeError('knowledge_path_forbidden', '引用超出当前读取范围。');
  return target;
}

export function readKnowledgeReference(start: ReferenceFile, links: string[], image = false, allowed: (file: string) => boolean = () => true) {
  if (!links.length || links.length > 12) throw knowledgeError('knowledge_reference_invalid', '引用链长度无效。');
  let current = start;
  for (let i = 0; i < links.length; i++) {
    const relative = linkedPath(current, links[i]);
    const isImage = image && i === links.length - 1;
    const actual = resolveKnowledgeFile(current.root, relative, isImage ? Object.keys(imageTypes) : undefined);
    if (!allowed(actual)) throw knowledgeError('knowledge_source_scope_forbidden', '引用不属于当前范围、关联服务或公共说明。');
    // References never follow symlinks, including links that remain inside the root.
    if (actual !== path.join(fs.realpathSync(current.root), relative)) throw knowledgeError('knowledge_path_forbidden', '不能通过符号链接读取引用。');
    if (isImage) {
      const type = imageTypes[path.extname(relative).toLowerCase()];
      const fd = fs.openSync(actual, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw knowledgeError('knowledge_content_limit', '图片须为不超过 8 MiB 的普通文件。');
        const buffer = Buffer.alloc(Math.min(stat.size + 1, 8 * 1024 * 1024 + 1));
        const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
        const bytes = buffer.subarray(0, count);
        if (count > stat.size) throw knowledgeError('knowledge_content_limit', '图片在读取时变化，请刷新。');
        const valid = type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          : type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : type === 'image/gif' ? /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))
          : type === 'image/webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
        if (!valid) throw knowledgeError('knowledge_image_invalid', '图片内容与允许的图片类型不符。');
        return { path: relative, content: null, digest: digest(bytes), bytes, contentType: type };
      } finally { fs.closeSync(fd); }
    }
    current = { root: current.root, ...readKnowledgeFile(current.root, relative) };
  }
  return { path: current.path, content: current.content, digest: digest(current.content), bytes: null, contentType: null };
}
