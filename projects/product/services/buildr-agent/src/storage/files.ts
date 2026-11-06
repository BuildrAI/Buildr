import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export interface StorageUse { complete: boolean; paths: readonly string[]; diagnostic?: string }
export interface StorageCandidate {
  kind: 'cache' | 'runtime' | 'diagnostic' | 'test-artifact' | 'runtime-share' | 'runtime-object' | 'shared-cache'; path: string; ownerRoot: string;
  sizeBytes: number; identity?: string; eligible: boolean; reason: string;
  rootChanged?: number;
  /** Only regenerable cache data with a fresh execution/recovery proof may
   * narrow occupancy to its own subtree; account ownership remains unchanged. */
  useRoot?: string;
  /** Declared regenerable legacy cache: retire without publishing a public copy. */
  retire?: boolean;
  retentionDays?: number; lastPossibleUseAt?: number;
  /** Exact nested Buildr profile, discovered only under a private native HOME. */
  runtimeDataRoot?: string;
  diagnostic?: { provider: string; producerPid?: number; contextId?: string };
}
export interface StorageVersion { identity: string; sizeBytes: number; modified: number; rootChanged: number }
export const storageUseRoot=(item:StorageCandidate)=>item.kind==='cache'&&item.useRoot===item.path?item.path:item.ownerRoot;

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
    if (!fs.existsSync(current)) { try { fs.mkdirSync(current, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; } }
    if (!safeStoragePath(root, current)) throw new Error('storage_path_unsafe');
  }
}

/** Diagnostic files may be individual event segments. Never follow links or remove shared files. */
export function safeStorageResource(root: string, target: string, maximumNodes=Infinity): boolean {
  if (!safeStoragePath(root, path.dirname(target))) return false;
  let nodes=0;
  const walk = (file: string): boolean => {
    if(++nodes>maximumNodes)return false;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || process.getuid && stat.uid !== process.getuid()) return false;
    if (stat.isDirectory()) return fs.readdirSync(file).every(name => walk(path.join(file, name)));
    return stat.isFile() && stat.nlink === 1;
  };
  try { return walk(target); } catch { return false; }
}

export function storageVersion(directory: string, renamedRootChanged?: number): StorageVersion {
  const hash = createHash('sha256'); let sizeBytes = 0, modified = 0;
  const rootChanged = fs.lstatSync(directory).ctimeMs;
  const walk = (file: string) => {
    const stat = fs.lstatSync(file);
    // Only the collector's own rename may normalize root ctime; previews include it to detect rewrites.
    hash.update(JSON.stringify([path.relative(directory, file), stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, file === directory ? renamedRootChanged ?? stat.ctimeMs : stat.ctimeMs]));
    modified = Math.max(modified, stat.mtimeMs);
    if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) walk(path.join(file, name));
    else sizeBytes += stat.blocks * 512;
  };
  walk(directory); return { identity: hash.digest('hex'), sizeBytes, modified, rootChanged };
}

export function storageCandidate(root: string, kind: StorageCandidate['kind'], directory: string, ownerRoot: string, use: StorageUse, cutoff: number): StorageCandidate {
  const item: StorageCandidate = { kind, path: directory, ownerRoot, sizeBytes: 0, eligible: false, reason: 'storage_path_unsafe' };
  if (!safeStoragePath(root, directory) || !(ownerRoot === root || safeStoragePath(root, ownerRoot))) return item;
  try {
    const version = storageVersion(directory); Object.assign(item, { identity: version.identity, sizeBytes: version.sizeBytes, rootChanged: version.rootChanged });
    item.reason = !use.complete ? 'storage_usage_unknown' : storageInUse(ownerRoot, use) ? 'storage_in_use' : version.modified > cutoff ? 'storage_recent' : 'unused_rebuildable';
    item.eligible = item.reason === 'unused_rebuildable';
  } catch { item.reason = 'storage_observation_failed'; }
  return item;
}

/** The caller holds the service storage lock; recheck immediately around the narrow rename. */
export function removeStorageCandidate(root: string, item: StorageCandidate, observe = observeStorageUse, unreferenced: (directory: string) => boolean = () => true): boolean {
  const safe = () => item.kind === 'diagnostic' ? safeStorageResource(root, item.path) : safeStoragePath(root, item.path);
  if (!item.eligible || !item.identity || !safe() || !unreferenced(item.path) || storageInUse(storageUseRoot(item), observe())) return false;
  if (storageVersion(item.path).identity !== item.identity) return false;
  const retired = path.join(path.dirname(item.path), '.reclaim-' + randomUUID());
  fs.renameSync(item.path, retired);
  try {
    const renamedRootChanged = fs.lstatSync(retired).ctimeMs;
    const use = observe();
    const permitted = unreferenced(retired), version = storageVersion(retired, item.rootChanged);
    if (!permitted || !use.complete || storageInUse(storageUseRoot(item), use) || storageInUse(retired, use) ||
        version.identity !== item.identity || version.rootChanged !== renamedRootChanged) {
      if (!fs.existsSync(item.path)) fs.renameSync(retired, item.path);
      return false;
    }
    fs.rmSync(retired, { recursive: true }); return true;
  } catch (error) { if (fs.existsSync(retired) && !fs.existsSync(item.path)) fs.renameSync(retired, item.path); throw error; }
}

/** Rename a bounded set of small diagnostic files, then observe all renamed
 * paths together before unlinking. Every file keeps its own version/dependency
 * checks; system observation is shared rather than spawned twice per file. */
export function removeDiagnosticFileBatch(root: string, items: StorageCandidate[], unreferenced: (item:StorageCandidate)=>boolean,
  observe=observeStorageUse, deadline=Date.now()+3000): string[] {
  return removeSmallResourceBatch(root,items,unreferenced,observe,deadline,'diagnostic');
}

/** Caller has verified and published each regenerable cache entry. The same
 * before/after observation and per-object identity proof used for diagnostics
 * applies; this grants no authority to classify arbitrary directories. */
export function removeCacheBatch(root:string,items:StorageCandidate[],observe=observeStorageUse,deadline=Date.now()+3000,unreferenced:(item:StorageCandidate)=>boolean=()=>true):string[]{
  return removeSmallResourceBatch(root,items,unreferenced,observe,deadline,'cache');
}
function removeSmallResourceBatch(root:string,items:StorageCandidate[],unreferenced:(item:StorageCandidate)=>boolean,
  observe:typeof observeStorageUse,deadline:number,kind:'diagnostic'|'cache'):string[]{
  const remaining=Math.max(0,deadline-Date.now());if(!remaining)return [];
  // System observation has its own subprocess timeout. Charge the file-work
  // budget after it completes, so a slow lsof cannot starve every small batch.
  const before=observe(), renameDeadline=Date.now()+remaining;
  const renamed:Array<{item:StorageCandidate;retired:string;changed:number}>=[],removed:string[]=[];
  const restore=(item:StorageCandidate,retired:string)=>{if(fs.existsSync(retired)&&!fs.existsSync(item.path))fs.renameSync(retired,item.path);};
  try {
    for(const item of items.slice(0,256)) {
      if(Date.now()>renameDeadline)break;
      try {
        if(item.kind!==kind||!item.eligible||!item.identity||!safeStorageResource(root,item.path,kind==='cache'?5000:64)||storageInUse(item.ownerRoot,before)||!unreferenced(item))continue;
        const info=fs.lstatSync(item.path),version=storageVersion(item.path);
        if((!info.isFile()&&!info.isDirectory())||version.sizeBytes>256*1024||version.identity!==item.identity)continue;
        const retired=path.join(path.dirname(item.path),'.reclaim-'+randomUUID());fs.renameSync(item.path,retired);
        const moved={item,retired,changed:0};renamed.push(moved);moved.changed=fs.lstatSync(retired).ctimeMs;
      }catch{/* A changed or unavailable file is retained independently. */}
    }
    if(!renamed.length)return removed;
    const after=observe();
    for(const {item,retired,changed} of renamed) {
      try {
        const version=storageVersion(retired,item.rootChanged);
        if(storageInUse(item.ownerRoot,after)||storageInUse(retired,after)||!unreferenced(item)||version.identity!==item.identity||version.rootChanged!==changed){restore(item,retired);continue;}
        fs.rmSync(retired,{recursive:true});removed.push(item.path);
      }catch{restore(item,retired);}
    }
  }finally{for(const{item,retired}of renamed)try{restore(item,retired);}catch{/* Keep the renamed file rather than overwrite a replacement. */}}
  return removed;
}
