import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Capture identities and change times without reading artifact contents.
export function artifactSnapshot(target: string): string {
  const hash = createHash('sha256');
  let remaining = 10_000;
  const device = fs.lstatSync(target).dev;
  function visit(file: string, name: string) {
    if (--remaining < 0) throw new Error('产物超过自动清理的检查上限');
    const stat = fs.lstatSync(file);
    if (stat.dev !== device || (process.getuid && stat.uid !== process.getuid()) ||
      (!stat.isDirectory() && !(stat.isFile() && stat.nlink === 1))) throw new Error('产物包含链接或不受管的文件');
    hash.update(JSON.stringify([name, stat.dev, stat.ino, stat.ctimeMs, stat.mtimeMs, stat.size, stat.mode]));
    if (stat.isDirectory()) for (const child of fs.readdirSync(file).sort()) visit(path.join(file, child), `${name}/${child}`);
  }
  visit(target, '');
  return hash.digest('hex');
}

export function observeArtifactPaths(): string[] | null {
  if (process.platform !== 'darwin' || !process.getuid) return null;
  try {
    const result = spawnSync('/usr/sbin/lsof', ['-nP', '-a', '-u', String(process.getuid()), '-Fpn'], {
      encoding: 'utf8', timeout: 5000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error || result.status !== 0 || result.stderr.trim()) return null;
    const paths = result.stdout.split('\n').filter(line => line.startsWith('n/')).map(line => line.slice(1).replace(/ \(deleted\)$/, ''));
    return paths.length ? paths : null;
  } catch { return null; }
}
