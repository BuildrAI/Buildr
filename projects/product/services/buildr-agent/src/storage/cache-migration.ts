import fs from 'node:fs';
import path from 'node:path';
import { runtimeFileHash } from './runtime-objects.ts';
import { randomUUID } from 'node:crypto';
import { ensureStorageDirectory, observeStorageUse, removeStorageCandidate, safeStorageResource, storageInUse, storageVersion, type StorageCandidate } from './files.ts';

/** Only adapter-owned regenerable caches; no native state or package workspaces. */
export function sharedCacheDestination(root: string, relative: string): string | undefined {
  const destinations: Record<string, string> = {
    'tmp/node-compile-cache': 'node-compile', 'cache/node-compile': 'node-compile',
    'home/.npm/_cacache': 'npm/_cacache', 'cache/npm/_cacache': 'npm/_cacache',
    'home/Library/Caches/node-gyp': 'node-gyp', 'home/.cache/node/corepack/v1': 'corepack/v1',
    'home/Library/Caches/Yarn/v6': 'yarn/v6', 'home/.cache/yarn/v6': 'yarn/v6', 'cache/yarn/v6': 'yarn/v6',
  };
  const destination = destinations[relative.split(path.sep).join('/')];
  return destination ? path.join(root, 'toolchains/cache', destination) : undefined;
}

/** Called under the existing storage lock, in its worker. Publish missing cache
 * entries exclusively; existing shared entries win. Cache misses can regenerate.
 * Source remains intact on interruption, failed ownership/version/use checks, or
 * an unsupported link. Never link mutable caches to immutable runtime objects. */
export function migrateToolCache(root: string, item: StorageCandidate, deadline: number, observe = observeStorageUse): boolean {
  const target = sharedCacheDestination(root, path.relative(item.ownerRoot, item.path));
  if (!target || !item.eligible || !item.identity || !safeStorageResource(root, item.path) ||
      storageInUse(item.ownerRoot, observe()) || storageVersion(item.path).identity !== item.identity) return false;
  ensureStorageDirectory(root, target);
  const strictCollisions = target.includes(path.sep+'node-gyp') || target.includes(path.sep+'corepack');
  const copy = (source: string, destination: string): void => {
    if (Date.now() > deadline) throw new Error('cache_migration_deferred');
    const stat = fs.lstatSync(source);
    if (stat.isDirectory()) {
      ensureStorageDirectory(root, destination);
      for (const name of fs.readdirSync(source)) copy(path.join(source, name), path.join(destination, name));
    } else {
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('cache_migration_unsafe');
      const existing = fs.lstatSync(destination, { throwIfNoEntry: false });
      if (existing) { if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('cache_migration_conflict'); if(strictCollisions && runtimeFileHash(source)!==runtimeFileHash(destination))throw new Error('cache_migration_conflict'); return; }
      const temporary = path.join(path.dirname(destination), '.cache-migration-' + randomUUID());
      try {
        fs.copyFileSync(source, temporary, fs.constants.COPYFILE_FICLONE);
        fs.chmodSync(temporary, 0o600);
        try { fs.linkSync(temporary, destination); }
        catch (error) { if (!fs.lstatSync(destination, { throwIfNoEntry: false })?.isFile() || fs.lstatSync(destination).isSymbolicLink()) throw error; }
      } finally { fs.rmSync(temporary, { force: true }); }
    }
  };
  copy(item.path, target);
  return removeStorageCandidate(root, item, observe);
}
