import fs from 'node:fs';
import path from 'node:path';
import { selectedToolCache, ensureSharedCacheDirectory, sharedCacheFileSafe } from './toolchain-locations.ts';
import { runtimeFileHash } from './runtime-objects.ts';
import { randomUUID } from 'node:crypto';
import { observeStorageUse, removeStorageCandidate, safeStorageResource, storageInUse, storageUseRoot, storageVersion, type StorageCandidate } from './files.ts';

/** Only adapter-owned regenerable caches; no native state or package workspaces. */
export function sharedCacheDestination(root: string, relative: string): string | undefined {
  const destinations: Record<string, string> = {
    'tmp/node-compile-cache': 'node-compile', 'cache/node-compile': 'node-compile',
    'home/.npm/_cacache': 'npm/_cacache', 'cache/npm/_cacache': 'npm/_cacache',
    'home/Library/Caches/node-gyp': 'node-gyp', 'home/.cache/node/corepack/v1': 'corepack/v1',
    'home/Library/Caches/Yarn/v6': 'yarn/v6', 'home/.cache/yarn/v6': 'yarn/v6', 'cache/yarn/v6': 'yarn/v6',
  };
  const normalized=relative.split(path.sep).join('/');
  const entry=/^(?:home\/Library\/Caches\/Yarn|home\/\.cache\/yarn|cache\/yarn)\/v6\/(npm-[^/]+)$/.exec(normalized);
  const destination = destinations[normalized]??(entry?'yarn/v6/'+entry[1]:undefined);
  if(!destination)return;
  const [tool,...parts]=destination.split('/'),selected=selectedToolCache(root,tool as 'npm'|'yarn'|'corepack'|'node-gyp'|'node-compile');
  return selected?path.join(selected,...parts):path.join(root,'toolchains/cache',destination);
}

/** Called under the existing storage lock, in its worker. Publish missing cache
 * entries exclusively; existing shared entries win. Cache misses can regenerate.
 * Source remains intact on interruption, failed ownership/version/use checks, or
 * an unsupported link. Never link mutable caches to immutable runtime objects. */
export function migrateToolCache(root: string, item: StorageCandidate, deadline: number, observe = observeStorageUse, options: {publishOnly?:boolean;canRemove?:()=>boolean} = {}): boolean {
  const publicationBudget=Math.max(1,deadline-Date.now()),dataScoped=!!item.useRoot&&storageUseRoot(item)===item.path;
  let publicationMs=0;
  const target = sharedCacheDestination(root, path.relative(item.ownerRoot, item.path));
  if (!target || !item.eligible || !item.identity || !safeStorageResource(root, item.path) ||
      options.canRemove?.()===false || storageInUse(storageUseRoot(item), observe()) || storageVersion(item.path).identity !== item.identity) return false;
  ensureSharedCacheDirectory(root, target);
  const strictCollisions = target.includes(path.sep+'node-gyp') || target.includes(path.sep+'corepack');
  const copy = (source: string, destination: string): void => {
    // A large old bytecode cache can spend the whole window verifying an
    // already-published prefix. Charge only new writes for proven idle data
    // caches; full version/use/reference checks remain mandatory in this worker.
    if (dataScoped ? publicationMs>=publicationBudget : Date.now() > deadline) throw new Error('cache_migration_deferred');
    const stat = fs.lstatSync(source);
    if (stat.isDirectory()) {
      ensureSharedCacheDirectory(root, destination);
      for (const name of fs.readdirSync(source)) copy(path.join(source, name), path.join(destination, name));
    } else {
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('cache_migration_unsafe');
      if(!sharedCacheFileSafe(root,destination))throw new Error('shared_cache_destination_unsafe');
      const existing = fs.lstatSync(destination, { throwIfNoEntry: false });
      if (existing) { if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('cache_migration_conflict'); if(strictCollisions && runtimeFileHash(source)!==runtimeFileHash(destination))throw new Error('cache_migration_conflict'); return; }
      const temporary = path.join(path.dirname(destination), '.cache-migration-' + randomUUID());
      const began=performance.now();
      try {
        fs.copyFileSync(source, temporary, fs.constants.COPYFILE_FICLONE);
        // Corepack and expanded Yarn caches contain executables, not only data.
        fs.chmodSync(temporary, stat.mode & 0o777);
        try { fs.linkSync(temporary, destination); }
        catch (error) { if (!fs.lstatSync(destination, { throwIfNoEntry: false })?.isFile() || fs.lstatSync(destination).isSymbolicLink()) throw error; }
      } finally { fs.rmSync(temporary, { force: true });publicationMs+=performance.now()-began; }
    }
  };
  copy(item.path, target);
  // A concurrent environment selection cannot redirect a completed transfer.
  if (sharedCacheDestination(root, path.relative(item.ownerRoot, item.path)) !== target ||
      storageVersion(item.path).identity !== item.identity) return false;
  return options.publishOnly || removeStorageCandidate(root, item, observe,()=>options.canRemove?.()!==false);
}
