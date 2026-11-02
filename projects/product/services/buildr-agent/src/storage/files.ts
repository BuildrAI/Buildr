import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export interface StorageUse { complete: boolean; paths: readonly string[]; diagnostic?: string }
export interface StorageCandidate {
  kind: 'cache' | 'runtime'; path: string; ownerRoot: string;
  sizeBytes: number; identity?: string; eligible: boolean; reason: string;
}
export interface StorageVersion { identity: string; sizeBytes: number; modified: number }

/** No file bodies, process environments or command arguments enter the maintenance result. */
export function observeStorageUse(): StorageUse {
  if (process.platform !== 'darwin' || process.getuid === undefined) return { complete: false, paths: [], diagnostic: 'storage_usage_unavailable' };
  try {
    const result = spawnSync('/usr/sbin/lsof', ['-nP', '-a', '-u', String(process.getuid()), '-Fpn'], { encoding: 'utf8', timeout: 5000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.error || result.status !== 0 || result.stderr.trim()) throw new Error('incomplete_storage_observation');
    const paths = result.stdout.split('\n').filter(line => line.startsWith('n/')).map(line => line.slice(1).replace(/ \(deleted\)$/, ''));
    if (!paths.length) throw new Error('empty_storage_observation');
    return { complete: true, paths };
  } catch { return { complete: false, paths: [], diagnostic: 'storage_usage_unavailable' }; }
}

export function storageInUse(owner: string, use: StorageUse): boolean {
  return !use.complete || use.paths.some(file => file === owner || file.startsWith(owner + path.sep));
}

/** Reject links in every ancestor under the owned root; nested links are never followed. */
export function safeStoragePath(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
  try {
    const base = fs.lstatSync(root);
    if (!base.isDirectory() || base.isSymbolicLink()) return false;
    let current = root;
    for (const part of relative.split(path.sep)) {
      current = path.join(current, part);
      const stat = fs.lstatSync(current, { throwIfNoEntry: false });
      if (!stat || !stat.isDirectory() || stat.isSymbolicLink() || process.getuid && stat.uid !== process.getuid()) return false;
    }
    return true;
  } catch { return false; }
}

export function ensureStorageDirectory(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || fs.lstatSync(root).isSymbolicLink()) throw new Error('storage_path_unsafe');
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) fs.mkdirSync(current, { mode: 0o700 });
    if (!safeStoragePath(root, current)) throw new Error('storage_path_unsafe');
  }
}

export function storageVersion(directory: string): StorageVersion {
  const hash = createHash('sha256'); let sizeBytes = 0, modified = 0;
  const walk = (file: string) => {
    const stat = fs.lstatSync(file);
    // Renaming the root for removal changes ctime, but not its contents or inode.
    hash.update(JSON.stringify([path.relative(directory, file), stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, file === directory ? 0 : stat.ctimeMs]));
    modified = Math.max(modified, stat.mtimeMs);
    if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) walk(path.join(file, name));
    else sizeBytes += stat.blocks * 512;
  };
  walk(directory); return { identity: hash.digest('hex'), sizeBytes, modified };
}

export function storageCandidate(root: string, kind: StorageCandidate['kind'], directory: string, ownerRoot: string, use: StorageUse, cutoff: number): StorageCandidate {
  const item: StorageCandidate = { kind, path: directory, ownerRoot, sizeBytes: 0, eligible: false, reason: 'storage_path_unsafe' };
  if (!safeStoragePath(root, directory) || !(ownerRoot === root || safeStoragePath(root, ownerRoot))) return item;
  try {
    const version = storageVersion(directory); Object.assign(item, { identity: version.identity, sizeBytes: version.sizeBytes });
    item.reason = !use.complete ? 'storage_usage_unknown' : storageInUse(ownerRoot, use) ? 'storage_in_use' : version.modified > cutoff ? 'storage_recent' : 'unused_rebuildable';
    item.eligible = item.reason === 'unused_rebuildable';
  } catch { item.reason = 'storage_observation_failed'; }
  return item;
}

/** The caller holds the service storage lock; recheck immediately around the narrow rename. */
export function removeStorageCandidate(root: string, item: StorageCandidate, observe = observeStorageUse, unreferenced = () => true): boolean {
  if (!item.eligible || !item.identity || !safeStoragePath(root, item.path) || !unreferenced() || storageInUse(item.ownerRoot, observe())) return false;
  if (storageVersion(item.path).identity !== item.identity) return false;
  const retired = path.join(path.dirname(item.path), '.reclaim-' + randomUUID());
  fs.renameSync(item.path, retired);
  try {
    const use = observe();
    if (!unreferenced() || !use.complete || storageInUse(item.ownerRoot, use) || storageInUse(retired, use) || storageVersion(retired).identity !== item.identity) {
      if (!fs.existsSync(item.path)) fs.renameSync(retired, item.path);
      return false;
    }
    fs.rmSync(retired, { recursive: true }); return true;
  } catch (error) { if (fs.existsSync(retired) && !fs.existsSync(item.path)) fs.renameSync(retired, item.path); throw error; }
}
