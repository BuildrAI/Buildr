import fs from 'node:fs';
import { selectedToolCache } from './toolchain-locations.ts';
import path from 'node:path';
import { toolCacheReclaimable } from './tool-cache.ts';
import { ensureStorageDirectory, safeStoragePath, storageCandidate, storageInUse, type StorageCandidate, type StorageUse } from './files.ts';

const day = 24 * 60 * 60_000;
export const sharedCachePolicy = { downloadRetentionDays: 30, compileRetentionDays: 7, unreferencedRuntimeRetentionDays: 30 };
/** Installed tools, _npx dependencies and Maven repositories are not disposable
 * downloads. A cache's size never shortens its retention period. */
const bodies = [
  { relative: 'npm/_cacache', key: 'npm-download', days: sharedCachePolicy.downloadRetentionDays },
  { relative: 'pip', key: 'pip-download', days: sharedCachePolicy.downloadRetentionDays },
  { relative: 'uv', key: 'uv-download', days: sharedCachePolicy.downloadRetentionDays },
  { relative: 'yarn/v6', key: 'yarn-download', days: sharedCachePolicy.downloadRetentionDays },
  { relative: 'node-compile', key: 'node-compile', days: sharedCachePolicy.compileRetentionDays },
  { relative: 'python', key: 'python-compile', days: sharedCachePolicy.compileRetentionDays },
];
/** Only the old service-owned bytecode directory is retired. Host caches stay
 * outside collection authority; their mere existence never permits deletion. */
function retiredCompileCache(root:string,relative:string):boolean {
  if(relative!=='node-compile'&&relative!=='python')return false;
  const selected=selectedToolCache(root,relative);
  return !!selected&&selected!==root&&!selected.startsWith(root+path.sep);
}
const stampPath = (root:string,key:string) => path.join(root,'toolchains/cache-use',key);
function lastPossibleUse(root:string,key:string):number|undefined {
  const file=stampPath(root,key);
  if(!safeStoragePath(root,path.dirname(file)))return;
  try {
    const stat=fs.lstatSync(file);
    if(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.size===0&&(!process.getuid||stat.uid===process.getuid()))return stat.mtimeMs;
  }catch{/* Missing evidence preserves the cache. */}
}

/** Zero-body service-owned observation stamps, not directory access times or a
 * package index. Every actual native turn may use any exposed tool cache. */
export function recordSharedCacheUse(root:string, now=Date.now(), keys?:readonly string[]):void {
  ensureStorageDirectory(root,path.join(root,'toolchains/cache-use'));
  for(const body of bodies){
    if(keys&&!keys.includes(body.key))continue;
    const file=stampPath(root,body.key),fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|(fs.constants.O_NOFOLLOW??0),0o600);
    try {
      const stat=fs.fstatSync(fd);
      if(!stat.isFile()||stat.nlink!==1||stat.size!==0||process.getuid&&stat.uid!==process.getuid())throw new Error('cache_use_observation_unsafe');
      const timestamp=new Date(Math.max(now,stat.mtimeMs));fs.futimesSync(fd,timestamp,timestamp);
    }finally{fs.closeSync(fd);}
  }
}
export function sharedCacheUnreferenced(root:string,use:StorageUse,dependencies:{complete:boolean;contexts:string[]}):boolean {
  return dependencies.complete&&dependencies.contexts.length===0&&
    ['connections','programs','program-probes','toolchains/cache'].every(relative=>!storageInUse(path.join(root,relative),use));
}
/** Only the worker writes observations; public inspection stays read-only.
 * Busy/unknown consumers renew the conservative latest-possible-use bound.
 * First observation starts a new window rather than guessing historical use. */
export function observeSharedCacheUse(root:string,use:StorageUse,dependencies:{complete:boolean;contexts:string[]},now=Date.now()):void {
  const busy=!sharedCacheUnreferenced(root,use,dependencies);
  const keys=bodies.filter(body=>busy||lastPossibleUse(root,body.key)===undefined).map(body=>body.key);
  if(keys.length)recordSharedCacheUse(root,now,keys);
}
export function sharedCacheReclaimable(root:string,item:StorageCandidate,use:StorageUse,dependencies:{complete:boolean;contexts:string[]},now=Date.now()):boolean {
  const body=bodies.find(value=>path.join(root,'toolchains/cache',value.relative)===item.path);
  if(!body||!['node-compile','python'].includes(body.relative)||!sharedCacheUnreferenced(root,use,dependencies))return false;
  if(retiredCompileCache(root,body.relative))return true;
  const observed=lastPossibleUse(root,body.key);
  return observed!==undefined&&observed<=now-body.days*day;
}
export function sharedCacheCandidates(root:string,use:StorageUse,dependencies:{complete:boolean;contexts:string[]},now=Date.now()):StorageCandidate[] {
  const base=path.join(root,'toolchains/cache'),owner=path.join(root,'connections');
  if(!safeStoragePath(root,base)||!safeStoragePath(root,owner))return [];
  return bodies.filter(body=>safeStoragePath(root,path.join(base,body.relative))).map(body=>{
    const retired=retiredCompileCache(root,body.relative);
    const item=storageCandidate(root,'shared-cache',path.join(base,body.relative),owner,use,retired?Infinity:now-body.days*day);
    const observed=lastPossibleUse(root,body.key);
    item.retentionDays=body.days;item.lastPossibleUseAt=observed;
    if(!toolCacheReclaimable(base,body.relative)){item.eligible=false;item.reason='cache_contents_retained';}
    if(!retired&&observed===undefined){item.eligible=false;item.reason='cache_usage_unobserved';}
    else if(!retired&&observed!==undefined&&observed>now-body.days*day){item.eligible=false;item.reason='shared_cache_recent_use';}
    if(['uv','yarn/v6'].includes(body.relative)){item.eligible=false;item.reason='shared_cache_installation_references_unproven';}
    if(!sharedCacheUnreferenced(root,use,dependencies)){item.eligible=false;item.reason='shared_cache_consumer_or_recovery_retained';}
    if(!['node-compile','python'].includes(body.relative)){item.eligible=false;item.reason='download_cache_reuse_value_unverified';}
    return item;
  });
}
