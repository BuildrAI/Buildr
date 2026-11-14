import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export interface StorageUse { complete: boolean; paths: readonly string[]; diagnostic?: string }
export interface StorageCandidate {
  kind: 'cache' | 'runtime' | 'diagnostic' | 'test-artifact' | 'runtime-share' | 'runtime-object' | 'shared-cache' | 'program-package' | 'native-session' | 'native-home'; path: string; ownerRoot: string;
  sizeBytes: number; identity?: string; eligible: boolean; reason: string; boundaryRoot?: string; orphanReclaim?: boolean;
  rootChanged?: number;
  /** Only regenerable cache data with a fresh execution/recovery proof may
   * narrow occupancy to its own subtree; account ownership remains unchanged. */
  useRoot?: string;
  /** Declared regenerable legacy cache: retire without publishing a public copy. */
  retire?: boolean;
  retentionDays?: number; lastPossibleUseAt?: number;
  /** Exact nested Buildr profile, discovered only under a private native HOME. */
  runtimeDataRoot?: string;
  diagnostic?: { provider: string; producerPid?: number; contextId?: string; config?:string; database?:string };
  /** Exact native session identity read from the provider-owned layout. */
  nativeSession?: { provider: 'codex' | 'dsh' | 'claude-code'; contextId: string; binding: string };
  /** Whole legacy lease home reclaimable only after a complete no-reference proof. */
  nativeHome?: { provider: 'codex' | 'dsh' | 'claude-code' };
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

export function ownStorageDirectory(directory: string): boolean {
  try {
    const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
    return Boolean(stat && stat.isDirectory() && !stat.isSymbolicLink() && (!process.getuid || stat.uid === process.getuid() || (stat.uid === 0 && (stat.mode & 0o1000) !== 0)));
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
    // Child read-only files (immutable object views) omit inode ctime so unlinking peer hard-links does not invalidate sibling candidates.
    const entryChanged = file === directory ? renamedRootChanged ?? stat.ctimeMs : stat.isFile() && (stat.mode & 0o222) === 0 ? 0 : stat.ctimeMs;
    hash.update(JSON.stringify([path.relative(directory, file), stat.dev, stat.ino, stat.uid, stat.mode, stat.size, stat.mtimeMs, entryChanged]));
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
export function removeStorageCandidate(root: string, item: StorageCandidate, observe = observeStorageUse, unreferenced: (directory: string) => boolean = () => true, allowedBoundaries?: ReadonlySet<string>): boolean {
  const boundary = item.boundaryRoot && allowedBoundaries?.has(item.boundaryRoot) ? item.boundaryRoot : root;
  const safe = () => item.kind === 'diagnostic' || item.kind === 'native-session' || item.kind === 'native-home' ? safeStorageResource(boundary, item.path) : safeStoragePath(boundary, item.path);
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

/** A verified SQLite diagnostic and its WAL/SHM form one bounded family.
 * Stage and validate every member before deleting any; main file is last. */
export function removeDiagnosticDatabaseFamily(root:string,items:StorageCandidate[],unreferenced:(item:StorageCandidate)=>boolean,
  observe=observeStorageUse,deadline=Date.now()+3000):string[]{
  const database=items[0]?.diagnostic?.database,config=items[0]?.diagnostic?.config;
  if(!database||!config||!items.length||items.length>3||items.some(item=>item.ownerRoot!==config||item.diagnostic?.database!==database||!['','-wal','-shm'].some(suffix=>item.path===database+suffix)))return [];
  return removeSmallResourceBatch(root,[...items].sort((a,b)=>Number(a.path===database)-Number(b.path===database)),unreferenced,observe,deadline,'diagnostic',true);
}

/** Caller has verified and published each regenerable cache entry. The same
 * before/after observation and per-object identity proof used for diagnostics
 * applies; this grants no authority to classify arbitrary directories. */
export function removeCacheBatch(root:string,items:StorageCandidate[],observe=observeStorageUse,deadline=Date.now()+3000,unreferenced:(item:StorageCandidate)=>boolean=()=>true):string[]{
  return removeSmallResourceBatch(root,items,unreferenced,observe,deadline,'cache');
}

/** Only individually proven, unreferenced native sessions are staged. Native
 * files can be large; they keep the same before/after occupancy and identity
 * proof, and never inherit authority from another candidate kind. */
export function removeNativeSessionBatch(root:string,items:StorageCandidate[],unreferenced:(item:StorageCandidate)=>boolean,
  observe=observeStorageUse,deadline=Date.now()+3000):string[]{
  return removeSmallResourceBatch(root,items,unreferenced,observe,deadline,'native-session');
}
function removeSmallResourceBatch(root:string,items:StorageCandidate[],unreferenced:(item:StorageCandidate)=>boolean,
  observe:typeof observeStorageUse,deadline:number,kind:'diagnostic'|'cache'|'native-session',database=false):string[]{
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
        if(kind==='native-session'?!info.isFile()&&!info.isDirectory():database?!info.isFile():!info.isFile()&&!info.isDirectory())continue;
        if(!database&&kind!=='native-session'&&version.sizeBytes>256*1024)continue;
        if(version.identity!==item.identity)continue;
        const retired=path.join(path.dirname(item.path),'.reclaim-'+randomUUID());fs.renameSync(item.path,retired);
        const moved={item,retired,changed:0};renamed.push(moved);moved.changed=fs.lstatSync(retired).ctimeMs;
      }catch{/* A changed or unavailable file is retained independently. */}
    }
    if(!renamed.length||database&&renamed.length!==items.length)return removed;
    const after=observe();
    if(database&&!renamed.every(({item,retired,changed})=>{
      const version=storageVersion(retired,item.rootChanged);
      return !storageInUse(item.ownerRoot,after)&&!storageInUse(retired,after)&&unreferenced(item)&&version.identity===item.identity&&version.rootChanged===changed;
    }))return removed;
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

const orphanReclaimPattern = /^\.reclaim-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const orphanWalkSkips = new Set(['node_modules', '.git', 'sessions', 'projects', 'plugins', '_cacache', 'tmp']);

export function orphanReclaimCandidates(root: string, use: StorageUse, recentCutoff = Date.now() - 15 * 60_000): StorageCandidate[] {
  const items: StorageCandidate[] = [], seen = new Set<string>(), dataRoot = path.dirname(root);
  const scanDir = (boundary: string, parent: string) => {
    if (parent === boundary ? !ownStorageDirectory(boundary) : !safeStoragePath(boundary, parent)) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(parent, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!orphanReclaimPattern.test(entry.name) || entry.isSymbolicLink() || !entry.isDirectory()) continue;
      const target = path.join(parent, entry.name);
      if (seen.has(target)) continue;
      seen.add(target);
      const item = storageCandidate(boundary, 'cache', target, target, use, recentCutoff);
      item.orphanReclaim = true;
      if (boundary !== root) item.boundaryRoot = boundary;
      if (item.eligible) item.reason = 'orphan_reclaim';
      items.push(item);
    }
  };
  let nodes = 0;
  const walk = (boundary: string, directory: string, depth: number) => {
    scanDir(boundary, directory);
    if (depth >= 4 || nodes >= 4096) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (++nodes > 4096) return;
      if (!entry.isDirectory() || entry.isSymbolicLink() || orphanReclaimPattern.test(entry.name) || orphanWalkSkips.has(entry.name)) continue;
      const child = path.join(directory, entry.name);
      if (safeStoragePath(boundary, child)) walk(boundary, child, depth + 1);
    }
  };
  walk(root, root, 0);
  scanDir(root, path.join(root, 'program-probes', 'tmp'));
  scanDir(dataRoot, path.join(dataRoot, 'runtimes'));
  return items;
}

export function probeTempCandidates(root: string, use: StorageUse, recentCutoff = Date.now() - 15 * 60_000): StorageCandidate[] {
  const probeTmp = path.join(root, 'program-probes', 'tmp');
  if (!safeStoragePath(root, probeTmp)) return [];
  const items: StorageCandidate[] = [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(probeTmp, { withFileTypes: true }); } catch { return []; }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || orphanReclaimPattern.test(entry.name)) continue;
    const target = path.join(probeTmp, entry.name);
    if (safeStoragePath(root, target)) items.push(storageCandidate(root, 'cache', target, target, use, recentCutoff));
  }
  return items;
}

export function disposableGatewayLease(root: string, leaseRoot: string): boolean {
  if (!safeStoragePath(root, leaseRoot)) return false;
  let nodes = 0;
  const walk = (directory: string, depth: number, inTopTmp: boolean): boolean => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (++nodes > 256) return false;
      const full = path.join(directory, entry.name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) return false;
      if (stat.isDirectory()) {
        if (!walk(full, depth + 1, depth === 0 && entry.name === 'tmp' || inTopTmp)) return false;
        continue;
      }
      if (!stat.isFile() || stat.nlink !== 1) return false;
      if (depth > 0 && !inTopTmp) return false;
    }
    return true;
  };
  try { return walk(leaseRoot, 0, false); } catch { return false; }
}

/** Re-stat non-symlink regular files under an active tree on macOS so XNU vnode path cache stays anchored on live hard-link owners. */
export function reanchorSharedDentries(directory: string): void {
  if (process.platform !== 'darwin') return;
  try {
    const rootStat = fs.lstatSync(directory, { throwIfNoEntry: false });
    if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink()) return;
  } catch { return; }
  const walk = (current: string, depth: number) => {
    if (depth >= 16) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile()) {
        try {
          const stat = fs.lstatSync(full, { throwIfNoEntry: false });
          if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.nlink <= 1) continue;
          const fd = fs.openSync(full, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
          fs.closeSync(fd);
        } catch { /* Ignore transient changes. */ }
      }
    }
  };
  walk(directory, 0);
}
