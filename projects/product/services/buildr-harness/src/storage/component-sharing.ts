import fs from 'node:fs';
import { cloneViewCurrent, recordCloneView } from './clone-views.ts';
import { selectedToolCache, ensureSharedCacheDirectory, sharedCacheFileSafe } from './toolchain-locations.ts';
import { sharedCacheDestination } from './cache-migration.ts';
import { cloneFile } from './clone-file.ts';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { verifiedPackageFiles } from './package-archive.ts';
import { toolCacheReclaimable } from './tool-cache.ts';
import { materializeRuntimeObject, runtimeFileHash } from './runtime-objects.ts';
import { observeStorageUse, safeStoragePath, storageInUse, storageVersion, type StorageCandidate, type StorageUse } from './files.ts';

export interface ComponentSharingState {
  locks:string[]; next:number; cacheNext?:number;
  installations?:Record<string,{identity:string;nextFile:number;nextPackage?:number;deferredPackages?:number[];complete:boolean}>;
  completedCaches?:Record<string,string>;
  cache?:{path:string;pending:Array<{directory:string;after:string}>};
  cacheCursors?:Record<string,Array<{directory:string;after:string}>>;
  cacheConflicts?:Record<string,boolean>;
}
export interface ComponentSharingResult {
  state:ComponentSharingState; complete:boolean; clonedBytes:number; reusedFiles:number;
  observations:Array<{path:string;status:'shared'|'retained';reason:string;files?:number}>;
}
const componentReason=(error:unknown)=>error instanceof Error&&/^component_[a-z_]+$/.test(error.message)?error.message:'component_observation_failed';
const unchanged=(a:fs.Stats,b:fs.Stats)=>a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
const owned=(s:fs.Stats)=>s.isFile()&&!s.isSymbolicLink()&&(!process.getuid||s.uid===process.getuid());

/** A writable view must never be hardlinked to the immutable pool. A forced
 * clone shares extents but gives the tool an independent inode on first write.
 * Caller holds the profile storage lock. Preserve the original until recheck. */
function cloneComponentFile(root:string,file:string,owner:string,observe=observeStorageUse,sharedSource?:string):boolean {
  if(!safeStoragePath(root,path.dirname(file))||!safeStoragePath(root,owner)||storageInUse(owner,observe()))return false;
  const before=fs.lstatSync(file);if(!owned(before)||before.nlink!==1)return false;
  const object=sharedSource??materializeRuntimeObject(root,file,undefined,true);
  const stage=path.join(path.dirname(file),'.component-clone-'+randomUUID()),retired=path.join(path.dirname(file),'.component-retired-'+randomUUID());
  let published=false,retainOriginal=false;
  try{
    cloneFile(object,stage);
    fs.chmodSync(stage,before.mode&0o777);fs.utimesSync(stage,before.atime,before.mtime);
    const digest=runtimeFileHash(stage);
    if(digest!==runtimeFileHash(file)||!unchanged(before,fs.lstatSync(file))||storageInUse(owner,observe()))return false;
    // Keep an exact original inode without ever removing the public path.
    fs.linkSync(file,retired);
    const linked=fs.lstatSync(retired);
    if(linked.ino!==before.ino||linked.dev!==before.dev||linked.size!==before.size||linked.mtimeMs!==before.mtimeMs||runtimeFileHash(retired)!==digest||storageInUse(owner,observe())||!unchanged(linked,fs.lstatSync(file)))return false;
    fs.renameSync(stage,file);published=true;retainOriginal=true;
    const original=fs.lstatSync(retired),use=observe();
    if(original.size!==before.size||original.mtimeMs!==before.mtimeMs||runtimeFileHash(retired)!==digest||!unchanged(original,fs.lstatSync(retired))){
      // A writer raced on the old inode. Preserve both versions; never roll
      // back over a new writer's published path or discard the old write.
      retainOriginal=true;return false;
    }
    retainOriginal=!use.complete||storageInUse(owner,use);
    return !retainOriginal;
  }finally{
    if(!retainOriginal&&fs.existsSync(retired))fs.unlinkSync(retired);
    if(!published)fs.rmSync(stage,{force:true});
  }
}

export function shareComponentFile(root:string,file:string,owner:string,observe=observeStorageUse):boolean {
  if(cloneViewCurrent(root,file))return true;
  if(!cloneComponentFile(root,file,owner,observe))return false;
  const stat=fs.lstatSync(file),digest=runtimeFileHash(file),identity=digest+'-'+(stat.mode&0o111).toString(8);
  const object=path.join(root,'toolchains/objects',digest.slice(0,2),identity,process.platform==='win32'?'payload.exe':'payload');
  recordCloneView(root,file,object);return true;
}

/** Parse only ordinary package archive files. No extraction, scripts, links,
 * path traversal, credentials or unbounded decompression. Unsupported archives
 * are retained; package.json alone never grants sharing permission. */

function readJson(file:string,maximum=4*1024*1024):unknown{
  const stat=fs.lstatSync(file);if(!owned(stat)||stat.size>maximum)throw new Error('component_manifest_unsafe');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function homeOwner(root:string,file:string):string|undefined{
  const relative=path.relative(root,file).split(path.sep).join('/');
  if(relative.split('/').some(part=>/^\.(?:ssh|aws|config|codex|dsh|qoder)(?:-|$)/.test(part)))return;
  const match=/^(connections\/[a-z][a-z0-9-]*(?:\/model-bindings\/[a-f0-9]{64})?)\/home\//.exec(relative);
  return match?path.join(root,match[1]!):undefined;
}
function cacheArchive(root:string,owner:string,integrity:string):string|undefined{
  const match=/^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(integrity);if(!match)return;
  const digest=Buffer.from(match[1]!,'base64');if(digest.length!==64)return;
  const hex=digest.toString('hex');
  for(const base of [selectedToolCache(root,'npm')&&path.join(selectedToolCache(root,'npm')!,'_cacache'),'toolchains/cache/npm/_cacache',path.relative(root,path.join(owner,'cache/npm/_cacache')),path.relative(root,path.join(owner,'home/.npm/_cacache'))]){
    if(!base)continue;const file=path.join(path.isAbsolute(base)?base:path.join(root,base),'content-v2/sha512',hex.slice(0,2),hex.slice(2,4),hex.slice(4));
    if(!sharedCacheFileSafe(root,file))continue;
    const stat=fs.lstatSync(file,{throwIfNoEntry:false});if(!stat||!owned(stat)||stat.size>128*1024*1024)continue;
    if(createHash('sha512').update(fs.readFileSync(file)).digest().equals(digest))return file;
  }
}

/** Generic npm installation protocol, independent of package/Agent names.
 * Only archive-equal package files qualify; extra local data stays untouched. */
export function npmComponentFiles(root:string,lock:string,packageIndex?:number):{owner:string;files:string[];packages:number}{
  const owner=homeOwner(root,lock);if(!owner||!safeStoragePath(root,path.dirname(lock))||path.basename(lock)!=='.package-lock.json'||path.basename(path.dirname(lock))!=='node_modules')throw new Error('component_owner_unknown');
  const data=readJson(lock) as {lockfileVersion?:number;packages?:Record<string,{integrity?:string;link?:boolean}>};
  if(![2,3].includes(data.lockfileVersion??0)||!data.packages||typeof data.packages!=='object')throw new Error('component_install_manifest_missing');
  const base=path.dirname(path.dirname(lock)),files:string[]=[];
  const packages=Object.entries(data.packages).filter(([relative])=>!!relative);
  const selected=packageIndex===undefined?packages:packages.slice(packageIndex,packageIndex+1);
  for(const [relative,pkg]of selected){
    if(!relative)continue;
    if(!/^node_modules\/(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9_.-]+(?:\/node_modules\/(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9_.-]+)*$/.test(relative)||relative.split('/').some(part=>part==='..')||pkg.link||typeof pkg.integrity!=='string')throw new Error('component_install_manifest_unsupported');
    const directory=path.join(base,relative);if(!safeStoragePath(root,directory))throw new Error('component_install_path_unsafe');
    const archive=cacheArchive(root,owner,pkg.integrity);if(!archive)throw new Error('component_verified_archive_missing');
    files.push(...verifiedPackageFiles(root,directory,archive,pkg.integrity));
  }
  if(!files.length)throw new Error('component_install_empty');return {owner,files,packages:packages.length};
}

/** Same worker/lock as collection. Compact cursors are persisted in the existing
 * observation, not a new database. Busy/missing/changed objects are retried. */
export function maintainComponentSharing(root:string,locks:string[],caches:StorageCandidate[],previous:ComponentSharingState|undefined,options:{budgetMs?:number;maximumFiles?:number;observe?:()=>StorageUse}={}):ComponentSharingResult{
  const deadline=Date.now()+(options.budgetMs??1500),observe=options.observe??observeStorageUse;
  const state:ComponentSharingState={locks:[...new Set([...(Array.isArray(previous?.locks)?previous.locks.filter(value=>typeof value==='string'):[]),...locks])].filter(file=>homeOwner(root,file)&&fs.existsSync(file)).slice(-512),next:Number.isSafeInteger(previous?.next)&&previous!.next>=0?previous!.next:0,cacheNext:Number.isSafeInteger(previous?.cacheNext)&&previous!.cacheNext!>=0?previous!.cacheNext:0,installations:{...previous?.installations},completedCaches:{...previous?.completedCaches},cacheCursors:{...previous?.cacheCursors},cacheConflicts:{...previous?.cacheConflicts},...(previous?.cache?{cache:previous.cache}:{})};
  state.installations=Object.fromEntries(Object.entries(state.installations!).filter(([lock])=>state.locks.includes(lock)));
  state.completedCaches=Object.fromEntries(Object.entries(state.completedCaches!).filter(([directory])=>safeStoragePath(root,directory)));
  const result:ComponentSharingResult={state,complete:true,clonedBytes:0,reusedFiles:0,observations:[]};
  let count=0;
  const share=(file:string,owner:string)=>{
    if(Date.now()>deadline||count>=(options.maximumFiles??128)){result.complete=false;return false;}
    if(cloneViewCurrent(root,file))return true;
    count++;const stat=fs.lstatSync(file);if(!owned(stat)||stat.nlink!==1)return true;
    // atime is not trusted as usage. A zero-length file offers no shared body.
    if(!stat.size)return true;
    if(shareComponentFile(root,file,owner,observe)){result.clonedBytes+=stat.size;result.reusedFiles++;}else throw new Error('component_busy_or_changed');return true;
  };
  // Rotate installations; bounded file progress survives all subsequent passes.
  if(state.locks.length){
    const lock=state.locks[state.next%state.locks.length]!;
    try{
      const owner=path.dirname(lock);if(storageInUse(owner,observe()))throw new Error('component_owner_in_use');
      const directory=path.dirname(lock),identity=storageVersion(directory).identity;
      const old=state.installations![lock];
      if(old?.complete&&old.identity===identity){result.observations.push({path:lock,status:'shared',reason:'verified_installation_unchanged'});}
      else {
      const packageIndex=old?.identity===identity?old.nextPackage??0:0,manifestBefore=fs.lstatSync(lock);
      let component:ReturnType<typeof npmComponentFiles>;
      try{component=npmComponentFiles(root,lock,packageIndex);}
      catch(error){
        // A local/link dependency or missing archive must not starve later
        // verifiable packages. Retain that package and retry on the next cycle.
        const manifest=readJson(lock) as {packages?:Record<string,unknown>},packages=manifest.packages&&Object.keys(manifest.packages).filter(Boolean).length;
        if(packages&&unchanged(manifestBefore,fs.lstatSync(lock))&&storageVersion(directory).identity===identity){
          const deferred=old?.identity===identity?old.deferredPackages??[]:[];
          state.installations![lock]={identity,nextFile:0,nextPackage:(packageIndex+1)%packages,deferredPackages:[...new Set([...deferred,packageIndex])],complete:false};
        }
        throw error;
      }
      if(!unchanged(manifestBefore,fs.lstatSync(lock))||storageVersion(directory).identity!==identity)throw new Error('component_install_changed');
      let nextFile=old?.identity===identity?old.nextFile:0;
      for(;nextFile<component.files.length;nextFile++){if(!share(component.files[nextFile]!,owner))break;}
      const nextPackage=(old?.identity===identity?old.nextPackage??0:0)+(nextFile===component.files.length?1:0);
      const deferred=(old?.identity===identity?old.deferredPackages??[]:[]).filter(index=>index!==packageIndex||nextFile<component.files.length);
      state.installations![lock]={identity:storageVersion(directory).identity,nextFile:nextFile===component.files.length?0:nextFile,nextPackage:nextPackage%component.packages,deferredPackages:deferred,complete:nextPackage>=component.packages&&deferred.length===0};
      if(!state.installations![lock]!.complete)result.complete=false;
      result.observations.push({path:lock,status:result.complete?'shared':'retained',reason:result.complete?'verified_installation_shared':'component_budget_deferred',files:result.reusedFiles});
      }
    }catch(error){result.observations.push({path:lock,status:'retained',reason:componentReason(error)});}
    state.next=(state.next+1)%state.locks.length;
  }
  // Known cache ownership is supplied only by existing adapter candidates. Do
  // not invent ownership for arbitrary HOME files or recurse through symlinks.
  const available=caches.filter(item=>item.kind==='cache'&&item.eligible&&safeStoragePath(root,item.path)&&sharedCacheDestination(root,path.relative(item.ownerRoot,item.path))&&toolCacheReclaimable(item.ownerRoot,path.relative(item.ownerRoot,item.path))).sort((a,b)=>Number(/npm|Yarn/.test(b.path))-Number(/npm|Yarn/.test(a.path))||b.sizeBytes-a.sizeBytes||a.path.localeCompare(b.path));
  const item=available[(state.cacheNext??0)%Math.max(1,available.length)];
  if(item&&Date.now()<deadline){
    state.cacheNext=((state.cacheNext??0)+1)%Math.max(1,available.length);
    const saved=state.cacheCursors?.[item.path]??(state.cache?.path===item.path?state.cache.pending:undefined);
    const pending=Array.isArray(saved)&&saved.length&&saved.every(frame=>frame&&typeof frame.directory==='string'&&typeof frame.after==='string')?saved.slice(0,64).map(frame=>({...frame})):[{directory:'',after:''}];
    if(!saved)state.cacheConflicts![item.path]=false;
    const destination=sharedCacheDestination(root,path.relative(item.ownerRoot,item.path))!;
    try{
      if(storageInUse(item.path,observe()))throw new Error('component_owner_in_use');
      const identity=storageVersion(item.path).identity;
      if(state.completedCaches![item.path]===identity){result.observations.push({path:item.path,status:'shared',reason:'cache_view_unchanged'});return result;}
      const listings=new Map<string,string[]>();
      while(pending.length){
        if(Date.now()>deadline||count>=(options.maximumFiles??128)){result.complete=false;break;}
        const frame=pending[pending.length-1]!,directory=path.join(item.path,frame.directory);
        if(!safeStoragePath(root,directory)||path.relative(item.path,directory).startsWith('..'))throw new Error('component_cache_path_unsafe');
        if(!listings.has(directory))listings.set(directory,fs.readdirSync(directory).sort().filter(name=>name>frame.after).reverse());
        const names=listings.get(directory)!;if(!names.length){pending.pop();continue;}
        const name=names.pop()!,file=path.join(directory,name),stat=fs.lstatSync(file);
        if(stat.isSymbolicLink()){state.cacheConflicts![item.path]=true;result.observations.push({path:file,status:'retained',reason:'component_cache_link_retained'});frame.after=name;continue;}
        if(stat.isDirectory()){frame.after=name;pending.push({directory:path.relative(item.path,file),after:''});}
        else {
          const target=path.join(destination,path.relative(item.path,file));
          ensureSharedCacheDirectory(root,path.dirname(target));
          const current=fs.lstatSync(target,{throwIfNoEntry:false});
          if(!owned(stat)||current&&(!owned(current)||runtimeFileHash(file)!==runtimeFileHash(target))){state.cacheConflicts![item.path]=true;result.observations.push({path:file,status:'retained',reason:'component_shared_cache_conflict'});frame.after=name;continue;}
          count++;
          if(current){if(!cloneComponentFile(root,file,item.path,observe,target))throw new Error('component_busy_or_changed');}
          else {
            // Seed the real cache directly, without creating an immutable object
            // for every tiny, unique bytecode entry. The private source remains.
            const stage=path.join(path.dirname(target),'.cache-migration-'+randomUUID());
            try{
              cloneFile(file,stage);
              if(!unchanged(stat,fs.lstatSync(file))||storageInUse(item.path,observe()))throw new Error('component_busy_or_changed');
              fs.chmodSync(stage,stat.mode&0o777);
              try{fs.linkSync(stage,target);}catch(error){if(!fs.lstatSync(target,{throwIfNoEntry:false})?.isFile()||runtimeFileHash(target)!==runtimeFileHash(file)||!cloneComponentFile(root,file,item.path,observe,target))throw error;}
            }finally{fs.rmSync(stage,{force:true});}
          }
          result.clonedBytes+=stat.size;result.reusedFiles++;frame.after=name;
        }
      }
      if(pending.length)state.cacheCursors![item.path]=pending;else delete state.cacheCursors![item.path];
      state.cache=undefined;
      if(!pending.length&&!state.cacheConflicts![item.path])state.completedCaches![item.path]=storageVersion(item.path).identity;
      result.observations.push({path:item.path,status:pending.length||state.cacheConflicts![item.path]?'retained':'shared',reason:pending.length?'component_budget_deferred':state.cacheConflicts![item.path]?'component_cache_conflicts_retained':'cache_view_shared'});
    }catch(error){state.cache=undefined;delete state.cacheCursors![item.path];result.observations.push({path:item.path,status:'retained',reason:componentReason(error)});}
  }
  return result;
}
