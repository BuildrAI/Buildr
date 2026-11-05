import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
import { migrateToolCache } from '../../src/storage/cache-migration.ts';
import { StorageMaintenance } from '../../src/process/storage-maintenance.ts';
import { discoverHomeStorage } from '../../src/storage/home-discovery.ts';
import { maintainComponentSharing, npmComponentFiles, shareComponentFile, type ComponentSharingState } from '../../src/storage/component-sharing.ts';
import { runtimeObjectCandidates } from '../../src/storage/runtime-objects.ts';
import { verifiedYarnCacheEntry } from '../../src/storage/tool-cache.ts';
import { executorCacheCandidates } from '../../src/application/executor-storage.ts';
import { createNativeExecutors } from '../../src/executors/index.ts';
import { storageCandidate, removeCacheBatch } from '../../src/storage/files.ts';
const unused={complete:true,paths:[]};
const write=(file:string,body:string|Buffer)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body);};
function fixture(t:test.TestContext){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'component-sharing-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function archive(entries:Record<string,string>){
  const chunks:Buffer[]=[];
  for(const [name,body]of Object.entries(entries)){
    const data=Buffer.from(body),header=Buffer.alloc(512);
    header.write('package/'+name);header.write('0000644\0',100);header.write(data.length.toString(8).padStart(11,'0')+'\0',124);header.write('0',156);
    chunks.push(header,data,Buffer.alloc((512-data.length%512)%512));
  }
  return gzipSync(Buffer.concat([...chunks,Buffer.alloc(1024)]));
}
function install(root:string,provider:string){
  const owner=path.join(root,'connections',provider),base=path.join(owner,'home/.new-tool/tools');
  const entries={'package.json':JSON.stringify({name:'previously-unseen-tool',version:'1.0.0'}),'bin/start.js':'console.log("works")\n','data.txt':'original body '.repeat(10000)};
  const tar=archive(entries),digest=createHash('sha512').update(tar).digest(),hex=digest.toString('hex');
  write(path.join(root,'toolchains/cache/npm/_cacache/content-v2/sha512',hex.slice(0,2),hex.slice(2,4),hex.slice(4)),tar);
  for(const [name,body]of Object.entries(entries))write(path.join(base,'node_modules/previously-unseen-tool',name),body);
  const lock=path.join(base,'node_modules/.package-lock.json');write(lock,JSON.stringify({lockfileVersion:3,packages:{'node_modules/previously-unseen-tool':{integrity:'sha512-'+digest.toString('base64')}}}));
  return {owner,lock,file:path.join(base,'node_modules/previously-unseen-tool/data.txt')};
}

test('new component protocol is discovered and archive verified without registering its name',t=>{
  const root=fixture(t),item=install(root,'future-agent');
  const discovery=discoverHomeStorage(root,{maximumNodes:1000,budgetMs:10000});assert.ok(discovery.installationLocks?.includes(item.lock));
  const verified=npmComponentFiles(root,item.lock);assert.equal(verified.files.length,3);assert.equal(verified.owner,item.owner);
  write(path.join(path.dirname(item.file),'private-account.json'),'must never enter pool');
  assert.equal(npmComponentFiles(root,item.lock).files.length,3);
  write(item.file,'changed');assert.throws(()=>npmComponentFiles(root,item.lock),/content_changed/);
});

test('missing archive, altered integrity and private homes cannot authorize sharing',t=>{
  const root=fixture(t),item=install(root,'codex');
  const data=JSON.parse(fs.readFileSync(item.lock,'utf8'));data.packages['node_modules/previously-unseen-tool'].integrity='sha512-'+Buffer.alloc(64).toString('base64');write(item.lock,JSON.stringify(data));
  assert.throws(()=>npmComponentFiles(root,item.lock),/archive_missing/);
  const privateLock=path.join(item.owner,'home/.ssh/node_modules/.package-lock.json');write(privateLock,'{}');assert.throws(()=>npmComponentFiles(root,privateLock),/owner_unknown/);
});

test('large HOME resumes within a directory and eventually discovers later installations',t=>{
  const root=fixture(t);const home=path.join(root,'connections/codex/home');
  for(let i=0;i<50;i++)write(path.join(home,'a-large',String(i).padStart(3,'0')),'data');
  const item=install(root,'codex');let cursor:ReturnType<typeof discoverHomeStorage>['cursor'];let found=false;
  for(let n=0;n<100;n++){const result=discoverHomeStorage(root,{cursor,maximumNodes:3,budgetMs:10000});cursor=result.cursor;found ||=!!result.installationLocks?.includes(item.lock);if(!cursor)break;}
  assert.ok(found,'a small per-pass budget must progress beyond the same first files');
});

test('writable clone views preserve mode, bytes, path and isolate modifications',t=>{
  if(process.platform!=='darwin'&&process.platform!=='linux'){t.skip('filesystem clone required');return;}
  const root=fixture(t),first=install(root,'codex'),second=install(root,'dsh');
  const original=fs.readFileSync(first.file);fs.chmodSync(first.file,0o755);
  assert.equal(shareComponentFile(root,first.file,first.owner,()=>unused),true);
  assert.equal(shareComponentFile(root,second.file,second.owner,()=>unused),true);
  assert.notEqual(fs.statSync(first.file).ino,fs.statSync(second.file).ino);
  assert.equal(fs.statSync(first.file).mode&0o777,0o755);assert.deepEqual(fs.readFileSync(first.file),original);
  write(first.file,'private mutation');assert.deepEqual(fs.readFileSync(second.file),original);
});

test('active components retry automatically and bounded file progress reaches unchanged reuse',t=>{
  const root=fixture(t),item=install(root,'qoder');let active=true;let state:ComponentSharingState|undefined;
  const observe=()=>active?{complete:true,paths:[item.file]}:unused;
  let result=maintainComponentSharing(root,[item.lock],[],state,{observe,budgetMs:10000,maximumFiles:1});state=result.state;
  assert.equal(result.reusedFiles,0);assert.match(result.observations[0]!.reason,/in_use/);active=false;
  let cloned=0;
  for(let i=0;i<5;i++){result=maintainComponentSharing(root,[],[],state,{observe,budgetMs:10000,maximumFiles:1});state=result.state;cloned+=result.reusedFiles;}
  assert.equal(cloned,3);assert.ok(result.observations.some(x=>x.reason==='verified_installation_unchanged'));
});

test('known cache sharing resumes, reuses completed views and never follows external symlinks',t=>{
  const root=fixture(t),owner=path.join(root,'connections/dsh'),cache=path.join(owner,'cache/node-compile');
  for(let i=0;i<4;i++)write(path.join(cache,String(i)),'same body '+i);
  fs.chmodSync(path.join(cache,'0'),0o755);
  const item=storageCandidate(root,'cache',cache,owner,unused,Infinity);let state:ComponentSharingState|undefined;let count=0;
  for(let i=0;i<6;i++){const result=maintainComponentSharing(root,[],[item],state,{observe:()=>unused,budgetMs:10000,maximumFiles:1});state=result.state;count+=result.reusedFiles;}
  assert.equal(count,4);assert.equal(fs.statSync(path.join(root,'toolchains/cache/node-compile/0')).mode&0o777,0o755);
  const secret=path.join(fixture(t),'secret');write(secret,'secret');fs.symlinkSync(secret,path.join(cache,'z-link'));
  const result=maintainComponentSharing(root,[],[item],state,{observe:()=>unused,budgetMs:10000});assert.ok(result.observations.some(x=>x.reason==='component_cache_link_retained'));assert.equal(fs.readFileSync(secret,'utf8'),'secret');
});

test('a source changed at deletion recheck is retained with its new bytes',t=>{
  const root=fixture(t),item=install(root,'codex');let observations=0;
  const observe=()=>{if(++observations===2)write(item.file,'new user bytes');return unused;};
  assert.equal(shareComponentFile(root,item.file,item.owner,observe),false);assert.equal(fs.readFileSync(item.file,'utf8'),'new user bytes');
  assert.ok(!fs.readdirSync(path.dirname(item.file)).some(name=>name.startsWith('.component-')));
});

test('clone views keep content objects referenced and release only after view content changes',t=>{
  const root=fixture(t),item=install(root,'codex');
  assert.equal(shareComponentFile(root,item.file,path.dirname(item.lock),()=>unused),true);
  const future=Date.now()+31*24*60*60_000;
  assert.equal(runtimeObjectCandidates(root,unused,future).length,0,'referenced clone body survives 30-day collection');
  write(item.file,'new private bytes');
  assert.ok(runtimeObjectCandidates(root,unused,future).some(item=>item.eligible),'the old immutable body loses its reference after a private write');
});

test('an unrelated task in the same account does not block sharing an idle installation',t=>{
  const root=fixture(t),item=install(root,'codex');
  const result=maintainComponentSharing(root,[item.lock],[],undefined,{observe:()=>({complete:true,paths:[path.join(item.owner,'home/unrelated-task.log')]}),budgetMs:10000});
  assert.equal(result.reusedFiles,3);assert.ok(result.observations.some(item=>item.status==='shared'));
});

test('periodic maintenance automatically discovers a busy new component and shares it after its own holder exits', {skip:process.platform!=='darwin',timeout:30000}, async t=>{
  const dataRoot=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'component-auto-'))),root=path.join(dataRoot,'agent-service');
  const item=install(root,'codex');let maintenance:StorageMaintenance|undefined;
  const oldCaches=['home/.npm/_cacache','cache/node-compile'].map(relative=>path.join(item.owner,relative));
  for(const cache of oldCaches){write(path.join(cache,'proof-entry'),'rebuildable cache');fs.utimesSync(path.join(cache,'proof-entry'),1,1);fs.utimesSync(cache,1,1);}
  const executor=createNativeExecutors().find(value=>value.descriptor.id==='codex')!;
  new ConversationRepository(root).saveConnection({view:{id:'codex',provider:'codex',label:'fixture',revision:'one',enabled:false,status:'disconnected',models:[],capabilities:executor.descriptor.capabilities}} as any);
  const accountReader=path.join(item.owner,'home/account-reader');write(accountReader,'fixture');
  const warm=spawn(process.execPath,['-e','require("fs").openSync(process.argv[1],"r");console.log("ready");setInterval(()=>{},1000)',accountReader],{stdio:['ignore','pipe','pipe']});
  const holder=spawn(process.execPath,['-e','const fs=require("fs");for(const file of process.argv.slice(1))fs.openSync(file,"r");console.log("ready");setInterval(()=>{},1000)',item.file,...oldCaches.map(cache=>path.join(cache,'proof-entry'))],{stdio:['ignore','pipe','pipe']});
  t.after(async()=>{maintenance?.close();for(const child of [holder,warm])if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}const worker=(maintenance as any)?.worker;if(worker)await once(worker,'exit');fs.rmSync(dataRoot,{recursive:true,force:true});});
  await Promise.all([once(holder.stdout!,'data'),once(warm.stdout!,'data')]);maintenance=new StorageMaintenance(dataRoot,{initialMs:1,intervalMs:10});
  const snapshot=()=>{try{return JSON.parse(fs.readFileSync(path.join(root,'process/storage-observation.json'),'utf8'));}catch{return undefined;}};
  const wait=async(predicate:(value:any)=>boolean)=>{const deadline=Date.now()+20000;while(Date.now()<deadline){const value=snapshot();if(value&&predicate(value))return value;await new Promise(resolve=>setTimeout(resolve,20));}assert.fail('automatic component maintenance did not settle');};
  const busy=await wait(value=>value.componentSharing?.observations.some((row:any)=>row.path===item.lock&&row.reason==='component_owner_in_use'));
  assert.ok(busy.homeStorage.installationLocks.includes(item.lock));
  for(const cache of oldCaches)assert.ok(fs.existsSync(cache),'a running owner retains its old caches');
  holder.kill('SIGTERM');await once(holder,'exit');
  const shared=await wait(value=>value.componentSharing?.state.installations?.[item.lock]?.complete===true&&oldCaches.every(cache=>!fs.existsSync(cache)));
  assert.ok(shared.componentSharing.reusedFiles>0);assert.equal(fs.readFileSync(item.file,'utf8'),'original body '.repeat(10000));
  assert.equal(warm.exitCode,null,'warm account readers remain alive during automatic cache migration');
  for(const relative of ['npm/_cacache','node-compile'])assert.equal(fs.readFileSync(path.join(root,'toolchains/cache',relative,'proof-entry'),'utf8'),'rebuildable cache');
});

test('one conflicting cache entry is retained without starving later valid entries',t=>{
  const root=fixture(t),owner=path.join(root,'connections/codex'),cache=path.join(owner,'cache/node-compile');
  write(path.join(cache,'a-conflict'),'private variant');write(path.join(cache,'z-reusable'),'share me');
  write(path.join(root,'toolchains/cache/node-compile/a-conflict'),'public variant');
  const item=storageCandidate(root,'cache',cache,owner,unused,Infinity);
  const result=maintainComponentSharing(root,[],[item],undefined,{observe:()=>unused,budgetMs:10000});
  assert.equal(result.reusedFiles,1);assert.equal(fs.readFileSync(path.join(root,'toolchains/cache/node-compile/z-reusable'),'utf8'),'share me');
  assert.equal(fs.readFileSync(path.join(cache,'a-conflict'),'utf8'),'private variant');assert.equal(fs.readFileSync(path.join(root,'toolchains/cache/node-compile/a-conflict'),'utf8'),'public variant');
  assert.ok(result.observations.some(item=>item.reason==='component_shared_cache_conflict'));
});

test('a completed Yarn package migrates independently of an unproven temporary neighbor',t=>{
  const root=fixture(t),owner=path.join(root,'connections/dsh'),cache=path.join(owner,'home/Library/Caches/Yarn/v6'),entry=path.join(cache,'npm-unseen-1.0.0-integrity'),pkg=path.join(entry,'node_modules/unseen');
  const entries={'package.json':JSON.stringify({name:'unseen',version:'1.0.0'}),'index.js':'module.exports=42;'};
  const tar=archive(entries),integrity='sha512-'+createHash('sha512').update(tar).digest('base64');
  for(const [name,body]of Object.entries(entries))write(path.join(pkg,name),body);
  write(path.join(pkg,'.yarn-tarball.tgz'),tar);write(path.join(pkg,'.yarn-metadata.json'),JSON.stringify({registry:'npm',manifest:{name:'unseen',version:'1.0.0'},remote:{integrity,reference:'https://registry.npmjs.org/unseen/-/unseen-1.0.0.tgz'}}));
  write(path.join(cache,'.tmp/unfinished'),'keep');
  assert.equal(verifiedYarnCacheEntry(owner,path.relative(owner,entry)),true);
  const age=(directory:string)=>{for(const name of fs.readdirSync(directory)){const file=path.join(directory,name);if(fs.statSync(file).isDirectory())age(file);fs.utimesSync(file,1,1);}fs.utimesSync(directory,1,1);};age(cache);
  const executor=createNativeExecutors().find(item=>item.descriptor.id==='dsh')!;
  const plan=executorCacheCandidates(root,executor,owner,unused,Date.now()-86400000);
  assert.ok(plan.some(item=>item.path===entry&&item.eligible));assert.ok(!plan.some(item=>item.path.endsWith('/.tmp')&&item.eligible));
  write(path.join(pkg,'local-business-output'),'must keep');assert.equal(verifiedYarnCacheEntry(owner,path.relative(owner,entry)),false);
});

test('small cache deletion batches observations and restores sources when an installer appears',t=>{
  const root=fixture(t),owner=path.join(root,'connections/dsh');
  const entries=[0,1,2].map(i=>{const dir=path.join(owner,'cache/yarn/v6/npm-proof-'+i);write(path.join(dir,'package.json'),'{}');return storageCandidate(root,'cache',dir,owner,unused,Infinity);});
  let calls=0;
  const removed=removeCacheBatch(root,entries,()=>{calls++;return calls===1?unused:{complete:true,paths:[path.join(owner,'installer')]};},Date.now()+10000);
  assert.deepEqual(removed,[]);assert.equal(calls,2);for(const entry of entries)assert.ok(fs.existsSync(entry.path));
  calls=0;const again=entries.map(e=>storageCandidate(root,'cache',e.path,owner,unused,Infinity));
  assert.equal(removeCacheBatch(root,again,()=>{calls++;return unused;},Date.now()+10000).length,3);assert.equal(calls,2);
});

test('an unsupported dependency rotates without starving later verified packages',t=>{
  const root=fixture(t),item=install(root,'codex'),manifest=JSON.parse(fs.readFileSync(item.lock,'utf8'));
  manifest.packages={'node_modules/local-only':{link:true},...manifest.packages};write(item.lock,JSON.stringify(manifest));
  let state:ComponentSharingState|undefined,total=0;
  for(let i=0;i<4;i++){const result=maintainComponentSharing(root,[item.lock],[],state,{observe:()=>unused,budgetMs:10000});state=result.state;total+=result.reusedFiles;}
  assert.equal(total,3);assert.equal(state!.installations![item.lock]!.complete,false);assert.deepEqual(state!.installations![item.lock]!.deferredPackages,[0]);
});

test('atomic clone publication keeps both versions when writers race on the original inode',t=>{
  const root=fixture(t),item=install(root,'codex');let calls=0;
  const observe=()=>{calls++;if(calls===4){const retired=fs.readdirSync(path.dirname(item.file)).find(n=>n.startsWith('.component-retired-'))!;write(path.join(path.dirname(item.file),retired),'old-inode-write');write(item.file,'new-path-write');}return unused;};
  assert.equal(shareComponentFile(root,item.file,item.owner,observe),false);
  assert.equal(fs.readFileSync(item.file,'utf8'),'new-path-write');
  const retired=fs.readdirSync(path.dirname(item.file)).find(n=>n.startsWith('.component-retired-'))!;assert.equal(fs.readFileSync(path.join(path.dirname(item.file),retired),'utf8'),'old-inode-write');
});

test('idle task references allow cache-only occupancy while warm accounts and recovery remain protected',t=>{
  const root=fixture(t),owner=path.join(root,'connections/codex'),cache=path.join(owner,'cache/npm/_cacache');write(path.join(cache,'proof-entry'),'cached body');
  const executor=createNativeExecutors().find(value=>value.descriptor.id==='codex')!,warm={complete:true,paths:[path.join(owner,'codex-home/account-reader')]};
  const inspect=(dependencies:{complete:boolean;contexts:string[]},use=warm)=>executorCacheCandidates(root,executor,owner,use,Infinity,false,dependencies).find(item=>item.path===cache)!;
  assert.equal(inspect({complete:true,contexts:['codex:unfinished']}).reason,'cache_recovery_or_execution_retained');
  assert.equal(inspect({complete:false,contexts:[]}).eligible,false);
  const item=inspect({complete:true,contexts:[]});assert.equal(item.eligible,true);assert.equal(item.useRoot,cache);
  assert.equal(inspect({complete:true,contexts:[]},{complete:true,paths:[path.join(cache,'proof-entry')]}).eligible,false);
  let calls=0;
  assert.equal(migrateToolCache(root,item,Date.now()+10000,()=>warm,{canRemove:()=>++calls<3}),false,'new recovery reference after rename restores the source');
  assert.equal(fs.readFileSync(path.join(cache,'proof-entry'),'utf8'),'cached body');
  const current=inspect({complete:true,contexts:[]});assert.equal(migrateToolCache(root,current,Date.now()+10000,()=>warm,{canRemove:()=>true}),true);assert.equal(fs.existsSync(cache),false);
});

test('large-cache observation does not spend the publication budget before data migration starts',t=>{
  const root=fixture(t),owner=path.join(root,'connections/codex'),cache=path.join(owner,'cache/node-compile');write(path.join(cache,'proof-entry'),'bytecode');
  const executor=createNativeExecutors().find(value=>value.descriptor.id==='codex')!;
  const item=executorCacheCandidates(root,executor,owner,unused,Infinity,false,{complete:true,contexts:[]}).find(value=>value.path===cache)!;
  let first=true;const observe=()=>{if(first){first=false;const end=performance.now()+30;while(performance.now()<end){}}return unused;};
  assert.equal(migrateToolCache(root,item,Date.now()+10,observe,{canRemove:()=>true}),true);
  assert.equal(fs.readFileSync(path.join(root,'toolchains/cache/node-compile/proof-entry'),'utf8'),'bytecode');
});
