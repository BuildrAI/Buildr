import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { migrateVerifiedNpmCache } from '../../src/storage/cache-migration.ts';
import { registerToolCache } from '../../src/storage/toolchain-locations.ts';
import { storageCandidate } from '../../src/storage/files.ts';

const cache=createRequire(import.meta.url)('cacache') as {
  put(directory:string,key:string,data:string):Promise<{toString():string}>;
  get: { (directory:string,key:string):Promise<{data:Buffer}>; byDigest(directory:string,digest:string):Promise<Buffer>; info(directory:string,key:string):Promise<{path:string}> };
  rm: { entry(directory:string,key:string):Promise<void> };
};
const unused={complete:true,paths:[]};
function fixture(t:test.TestContext){
  const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'npm-cache-merge-')));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const root=path.join(directory,'agent-service'),owner=path.join(root,'connections/dsh'),source=path.join(owner,'cache/npm/_cacache'),host=path.join(directory,'host-npm'),target=path.join(host,'_cacache');
  fs.mkdirSync(source,{recursive:true});fs.mkdirSync(host);registerToolCache(root,'npm',host);
  return {root,owner,source,target,item:()=>storageCandidate(root,'cache',source,owner,unused,Infinity)};
}

test('npm native reads verify complete merge, preserve host index responses and retain unindexed lockfile content',async t=>{
  const f=fixture(t),digest=String(await cache.put(f.source,'same-url','old response'));
  await cache.put(f.source,'source-only','downloaded package');
  const orphan=String(await cache.put(f.source,'orphan','useful by integrity'));await cache.rm.entry(f.source,'orphan');
  await cache.put(f.target,'same-url','current host response');
  const result=await migrateVerifiedNpmCache(f.root,f.item(),Date.now()+10000,()=>unused);
  assert.equal(result.removed,true);assert.equal(result.checkedContents,3);assert.equal(result.checkedEntries,2);
  assert.equal(fs.existsSync(f.source),false);
  assert.equal((await cache.get(f.target,'same-url')).data.toString(),'current host response');
  assert.equal((await cache.get(f.target,'source-only')).data.toString(),'downloaded package');
  assert.equal((await cache.get.byDigest(f.target,digest)).toString(),'old response');
  assert.equal((await cache.get.byDigest(f.target,orphan)).toString(),'useful by integrity');
  assert.equal(fs.statSync((await cache.get.info(f.target,'source-only')).path).nlink,1,'mutable caches are not hardlinked to the source');
});

test('a corrupt host blob cannot be mistaken for public coverage',async t=>{
  const f=fixture(t);await cache.put(f.source,'package','complete download');await cache.put(f.target,'package','complete download');
  fs.writeFileSync((await cache.get.info(f.target,'package')).path,'corrupt');
  await assert.rejects(migrateVerifiedNpmCache(f.root,f.item(),Date.now()+10000,()=>unused));
  assert.equal((await cache.get(f.source,'package')).data.toString(),'complete download');
});

test('occupied npm caches are delayed and migrate on the next idle pass',async t=>{
  const f=fixture(t);await cache.put(f.source,'package','reusable');
  assert.equal((await migrateVerifiedNpmCache(f.root,f.item(),Date.now()+10000,()=>({complete:true,paths:[f.owner]}))).removed,false);
  assert.equal(fs.existsSync(f.target),false);
  assert.equal((await migrateVerifiedNpmCache(f.root,f.item(),Date.now()+10000,()=>unused)).removed,true);
});

test('new source writes, changed references and unknown neighboring files preserve the old npm cache',async t=>{
  const f=fixture(t);await cache.put(f.source,'package','reusable');let calls=0;
  const result=await migrateVerifiedNpmCache(f.root,f.item(),Date.now()+10000,()=>{
    if(++calls===2)fs.writeFileSync(path.join(f.source,'new-input'),'changed');return unused;
  });
  assert.equal(result.removed,false);assert.equal(fs.existsSync(f.source),true);
  assert.equal((await migrateVerifiedNpmCache(f.root,f.item(),Date.now()+10000,()=>unused)).reason,'npm_cache_format_unknown');
  fs.unlinkSync(path.join(f.source,'new-input'));
  let references=0;
  assert.equal((await migrateVerifiedNpmCache(f.root,f.item(),Date.now()+10000,()=>unused,()=>++references<3)).removed,false);
  assert.equal(fs.existsSync(f.source),true);
});

test('installed npx tools and unrelated private files are outside npm download migration',async t=>{
  const f=fixture(t);await cache.put(f.source,'package','download');
  const installed=path.join(f.owner,'cache/npm/_npx/fixture/node_modules/tool/index.js');fs.mkdirSync(path.dirname(installed),{recursive:true});fs.writeFileSync(installed,'installed tool');
  assert.equal((await migrateVerifiedNpmCache(f.root,f.item(),Date.now()+10000,()=>unused)).removed,true);
  assert.equal(fs.readFileSync(installed,'utf8'),'installed tool');
});

test('a host cache change during retirement restores the source instead of accepting stale coverage',async t=>{
  const f=fixture(t);await cache.put(f.source,'package','download');let observations=0;
  const result=await migrateVerifiedNpmCache(f.root,f.item(),Date.now()+10000,()=>{
    if(++observations>=2&&fs.existsSync(path.join(f.target,'content-v2'))){
      const visit=(p:string):string[]=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?visit(path.join(p,e.name)):[path.join(p,e.name)]);
      fs.writeFileSync(visit(path.join(f.target,'content-v2'))[0]!,'concurrent replacement');
    }
    return unused;
  });
  assert.equal(result.removed,false);assert.equal((await cache.get(f.source,'package')).data.toString(),'download');
});
