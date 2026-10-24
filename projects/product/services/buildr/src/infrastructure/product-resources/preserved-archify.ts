import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ResourceSet } from './shared-resources.ts';

export const LEGACY_ARCHIFY_SOURCE = 'workspace/skills/buildr/archify/';
export const preservedArchifyRoot = (sharedRoot: string) => path.join(path.dirname(sharedRoot), 'local/preserved-skills/archify');

/** A migration source for existing installations, never part of the new package. */
export function preserveArchifyBeforeReplacement(sharedRoot: string, old: ResourceSet, inspect: (root: string) => ResourceSet, assertPlain: (file: string) => void): void {
  const entries = old.files.filter(file => file.source.startsWith(LEGACY_ARCHIFY_SOURCE));
  if (!entries.length) return;
  const prefix = 'skills/buildr/archify/';
  const files = entries.map(file => {
    if (!file.path || file.path.includes('\\') || file.path.includes('\0') || path.posix.normalize(file.path) !== file.path || file.path.split('/').includes('..')) throw new Error('Archify 历史文件路径无效，未修改原目录。');
    if (!file.path.startsWith(prefix) || file.path.slice(prefix.length) !== file.source.slice(LEGACY_ARCHIFY_SOURCE.length)) throw new Error('Archify 历史来源映射不一致，已保留原目录。');
    return { ...file, path: `files/${file.path.slice(prefix.length)}` };
  });
  if (!files.some(file => file.path === 'files/SKILL.md')) throw new Error('Archify 历史来源缺少入口，已保留原目录。');
  const id = `${old.version}-${crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex')}`;
  const target = preservedArchifyRoot(sharedRoot), stage = `${target}.next`;
  assertPlain(target); assertPlain(stage);
  if (fs.existsSync(target)) {
    if (JSON.stringify(inspect(target).files) !== JSON.stringify(files)) throw new Error('存在不同的 Archify 历史来源，未覆盖保留数据。');
    fs.rmSync(stage, { recursive: true, force: true });
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage);
  try {
    for (const [index, entry] of entries.entries()) {
      const source = path.join(sharedRoot, entry.path); assertPlain(source);
      const stat = fs.lstatSync(source);
      if (!stat.isFile()) throw new Error(`Archify 历史来源不是普通文件：${entry.path}`);
      const bytes = fs.readFileSync(source);
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256 || (process.platform !== 'win32' && (stat.mode & 0o111) !== (entry.mode & 0o111))) throw new Error(`Archify 历史来源已变化，未删除：${entry.path}`);
      const destination = path.join(stage, files[index]!.path); assertPlain(destination);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, bytes, { flag: 'wx', mode: entry.mode });
    }
    fs.writeFileSync(path.join(stage, 'resource-set.json'), JSON.stringify({ schemaVersion: old.schemaVersion, version: old.version, id, files }), { flag: 'wx' });
    inspect(stage);
    fs.renameSync(stage, target);
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}
