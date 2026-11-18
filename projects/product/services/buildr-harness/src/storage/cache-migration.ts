import fs from 'node:fs';
import path from 'node:path';
import { selectedToolCache, ensureSharedCacheDirectory, sharedCacheFileSafe } from './toolchain-locations.ts';
import { runtimeFileHash } from './runtime-objects.ts';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
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
    // Incomplete npm transfers and its verification timestamp are not reusable
    // content. A stable source is still required before retiring this directory.
    if (item.path.endsWith(path.sep + '_cacache') && ['tmp', '_lastverified'].includes(path.relative(item.path, source))) return;
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

interface NpmCacheEntry { key:string; integrity:string; size:number; path:string }
const npmCache = createRequire(import.meta.url)('cacache') as {
  ls: { stream(directory:string):AsyncIterable<NpmCacheEntry> };
  get: { info(directory:string,key:string):Promise<NpmCacheEntry|null>; stream:{byDigest(directory:string,integrity:string,options:{memoize:false}):AsyncIterable<Buffer>} };
};
const fileStamp=(file:string)=>{
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||process.getuid&&stat.uid!==process.getuid())throw new Error('npm_cache_file_unsafe');
  return JSON.stringify([stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs]);
};

/** The existing exclusive file publisher preserves destination index buckets.
 * npm's own reader verifies source bytes before publication, then checks every
 * destination digest and usable source key before retirement.
 * No credential files, installed _npx directories, cache age eviction or host
 * cleanup authority is involved. No durable migration index is necessary. */
export async function migrateVerifiedNpmCache(root:string,item:StorageCandidate,deadline:number,
  observe=observeStorageUse,canRemove:()=>boolean=()=>true) {
  const relative=path.relative(item.ownerRoot,item.path).split(path.sep).join('/');
  if(!['home/.npm/_cacache','cache/npm/_cacache'].includes(relative))throw new Error('npm_cache_scope_invalid');
  const target=sharedCacheDestination(root,relative);
  const result={removed:false,checkedContents:0,checkedEntries:0,destination:target,reason:'npm_cache_recheck_retained'};
  if(!target||target===item.path||!canRemove())return result;
  if(!item.identity||!safeStorageResource(root,item.path)||storageInUse(storageUseRoot(item),observe())||storageVersion(item.path).identity!==item.identity)return result;
  if(fs.readdirSync(item.path).some(name=>!['content-v2','index-v5','tmp','_lastverified'].includes(name)))return {...result,reason:'npm_cache_format_unknown'};
  const stamps=new Map<string,string>();
  const files=(directory:string):string[]=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const file=path.join(directory,entry.name);return entry.isDirectory()?files(file):[file];
  });
  const budget=()=>{if(Date.now()>deadline)throw new Error('npm_cache_migration_deferred');};
  const content=path.join(item.path,'content-v2');
  const contents:Array<{name:string;integrity:string}>=[];
  for(const file of fs.existsSync(content)?files(content):[]){
    budget();
    const name=path.relative(content,file).split(path.sep).join('/');
    const match=/^(sha1|sha256|sha512)\/([a-f0-9]{2})\/([a-f0-9]{2})\/([a-f0-9]+)$/.exec(name);
    if(!match)throw new Error('npm_cache_content_unknown');
    const [,algorithm,a,b,c]=match,hex=a!+b!+c!;
    if(hex.length!==({sha1:40,sha256:64,sha512:128}[algorithm!]??0))throw new Error('npm_cache_content_unknown');
    const integrity=algorithm+'-'+Buffer.from(hex,'hex').toString('base64');
    fileStamp(file);
    for await(const _chunk of npmCache.get.stream.byDigest(item.path,integrity,{memoize:false})){budget();}
    contents.push({name,integrity});
  }
  const index=path.join(item.path,'index-v5'),indexes=fs.existsSync(index)?files(index):[];
  if(indexes.some(file=>!/^([a-f0-9]{2})\/([a-f0-9]{2})\/([a-f0-9]{60})$/.test(path.relative(index,file).split(path.sep).join('/'))))throw new Error('npm_cache_index_unknown');
  if(!migrateToolCache(root,item,deadline,observe,{publishOnly:true,canRemove}))return result;
  for(const {name,integrity} of contents){
    const destination=path.join(target,'content-v2',name),before=fileStamp(destination);
    for await(const _chunk of npmCache.get.stream.byDigest(target,integrity,{memoize:false})){budget();}
    if(fileStamp(destination)!==before)throw new Error('npm_cache_destination_changed');
    stamps.set(destination,before);result.checkedContents++;
  }
  for(const file of indexes){
    const destination=path.join(target,'index-v5',path.relative(index,file));
    stamps.set(destination,fileStamp(destination));
  }
  for await(const entry of npmCache.ls.stream(item.path)){
    budget();
    // A host key can have a newer response. Its index is never overwritten;
    // source bytes remain available by verified integrity for lockfile reuse.
    const current=await npmCache.get.info(target,entry.key);
    if(!current||!sharedCacheFileSafe(root,current.path))throw new Error('npm_cache_index_uncovered');
    const before=fileStamp(current.path);
    if(stamps.get(current.path)!==before){
      for await(const _chunk of npmCache.get.stream.byDigest(target,current.integrity,{memoize:false})){budget();}
      if(fileStamp(current.path)!==before)throw new Error('npm_cache_destination_changed');
      stamps.set(current.path,before);
    }
    result.checkedEntries++;
  }
  const covered=()=>canRemove()&&sharedCacheDestination(root,relative)===target&&
    [...stamps].every(([file,stamp])=>sharedCacheFileSafe(root,file)&&fileStamp(file)===stamp);
  result.removed=removeStorageCandidate(root,item,observe,covered);
  result.reason=result.removed?'npm_cache_verified_in_shared_location':result.reason;
  return result;
}
