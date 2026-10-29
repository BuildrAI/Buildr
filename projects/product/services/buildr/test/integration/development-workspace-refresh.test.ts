import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {registerWorkspaceQueryApplication} from '../../src/modules/workspace/application/workspace-query-application.ts';
import {createWorkspacePreparation} from '../../src/modules/workspace/application/workspace-preparation.ts';
import {createWorkspacePreparationStore} from '../../src/modules/workspace/persistence/workspace-preparation-store.ts';
import {publishPackageResources, adoptPackageResources, readResourceAdoption} from '../../src/infrastructure/product-resources/shared-resources.ts';

function fixture(t:any) {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'buildr-dev-refresh-')));
  const previous=process.env.BUILDR_PRODUCT_DATA_DIR, previousEntry=process.env.BUILDR_NPM_ENTRY_PATH;
  process.env.BUILDR_NPM_ENTRY_PATH=path.resolve(import.meta.dirname,'../../bin/buildr.mjs');
  process.env.BUILDR_PRODUCT_DATA_DIR=path.join(root,'product-data');
  t.after(()=>{if(previousEntry===undefined)delete process.env.BUILDR_NPM_ENTRY_PATH;else process.env.BUILDR_NPM_ENTRY_PATH=previousEntry;if(previous===undefined)delete process.env.BUILDR_PRODUCT_DATA_DIR;else process.env.BUILDR_PRODUCT_DATA_DIR=previous;fs.rmSync(root,{recursive:true,force:true});});
  const product=path.join(root,'product');fs.mkdirSync(path.join(product,'resources/workspace/skills/sample'),{recursive:true});
  fs.writeFileSync(path.join(product,'package.json'),'{"version":"1.2.3"}');
  const publish=(text:string)=>{fs.writeFileSync(path.join(product,'resources/workspace/skills/sample/SKILL.md'),text);return publishPackageResources(product);};
  const first=publish('first');
  const entries:any[]=[], self=new Set<string>(), failures=new Set<string>();
  const add=(name:string, prepared=true, shared=false)=>{
    const target=path.join(root,name);fs.mkdirSync(path.join(target,'.buildr'),{recursive:true});fs.writeFileSync(path.join(target,'.buildr/workspace.yml'),'{}');
    fs.writeFileSync(path.join(target,'custom.txt'),'keep');if(prepared)adoptPackageResources(target,true);
    const entry={rootPath:target,status:'ready',registryScope:shared?'shared':'local',workspace:{id:randomUUID(),name}};entries.push(entry);return entry;
  };
  const store=createWorkspacePreparationStore(path.join(root,'registry/workspace-preparations'));
  let active=0,maxActive=0;const calls:string[]=[], ensured:string[]=[];
  let beforeRun:((target:string)=>Promise<void>)|undefined;
  const runtime:any={
    registryRepository:{workspaceRegistryPath:()=>path.join(root,'registry/workspaces.json'),isSharedRegistryScope:()=>false},
    listRegisteredWorkspaces:()=>({workspaces:[...entries]}),
    resolveRegisteredWorkspace:(id:string)=>entries.find(entry=>entry.workspace.id===id),
    assertWorkspaceManagementAccess:()=>({claimed:true}),canonicalWorkspaceManagementIdentity:()=>{},
    ensureRegisteredTarget:(target:string)=>ensured.push(target),
    readWorkspaceRecord:(target:string)=>({workspace:entries.find(entry=>entry.rootPath===target)!.workspace}),
    readComponentsManifestForWrite:(target:string)=>({components:self.has(target)?[{id:'buildr-self-bootstrap',state:'installed',enabled:true}]:[]}),
    syncPackageBuiltins:()=>({findings:[]}),packageComponentsStatus:()=>({components:[]}),
  };
  const spawnProcess:any=async (_command:string,args:string[],options:any)=>{
    const target=options.cwd;calls.push(target);active++;maxActive=Math.max(maxActive,active);
    try {
      await beforeRun?.(target);
      if(failures.has(target))return {ok:false,stderr:'EACCES: fixture conflict'};
      adoptPackageResources(target,true);return {ok:true,stdout:'prepared'};
    }finally{active--;}
  };
  const app=createWorkspacePreparation(runtime,{spawnProcess});
  const query:any=registerWorkspaceQueryApplication({
    registryRepository:{...runtime.registryRepository,readWorkspaceRegistryPersistence:()=>({registry:{schemaVersion:'buildr.workspaces/v1',roots:entries.filter(item=>item.registryScope==='local').map(item=>item.rootPath),lastOpenedRoot:null},revision:'test-revision'})},
    workspaceRepository:{readWorkspacePersistence:(target:string)=>{const entry=entries.find(item=>item.rootPath===target)!;return {metadata:{canonical:true,migrationRequired:false,workspace:{...entry.workspace,description:'fixture'}},skills:{workspaceId:entry.workspace.id}};}},
    existsDirectory:()=>true,
  } as any);
  return {root,first,publish,add,entries,self,failures,app,store,calls,ensured,query,createApp:()=>createWorkspacePreparation(runtime,{spawnProcess}),get maxActive(){return maxActive;},setBeforeRun:(fn:typeof beforeRun)=>{beforeRun=fn;}};
}

test('background preparation selects only stale prepared local directories and runs serially without opening them',async t=>{
  const f=fixture(t);const a=f.add('a'),b=f.add('b');f.add('unprepared',false);f.add('shared',true,true);const own=f.add('self');f.self.add(own.rootPath);
  const latest=f.publish('second');f.add('current');
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});f.setBeforeRun(async()=>gate);
  const batch=f.app.refreshPreparedWorkspaces();assert.equal(f.app.refreshPreparedWorkspaces(),batch);
  assert.equal(f.store.list().filter(entry=>entry.status==='preparing').length,2,'queued work is observable before completion');
  assert.equal(f.query.listRegisteredWorkspaces().workspaces.filter((entry:any)=>entry.readiness==='preparing').length,2);
  const opening=f.app.prepareWorkspaceForOpen(a.workspace.id);assert.ok(!('ready' in opening));assert.equal(opening.status,'preparing','opening joins the existing preparation instead of racing its projection');
  release();await batch;
  assert.deepEqual(f.calls,[a.rootPath,b.rootPath]);assert.equal(f.maxActive,1);
  for(const entry of [a,b]){assert.equal(readResourceAdoption(entry.rootPath)?.resourceSet,latest.id);assert.equal(fs.readFileSync(path.join(entry.rootPath,'custom.txt'),'utf8'),'keep');}
  await f.app.refreshPreparedWorkspaces();assert.equal(f.calls.length,2,'current adoptions are not repeated');
  for(const entry of [a,b])assert.equal(f.query.listRegisteredWorkspaces().workspaces.find((item:any)=>item.rootPath===entry.rootPath).readiness,'ready');
});

test('one failure remains visible and does not stop another directory or loop on the same target',async t=>{
  const f=fixture(t);const a=f.add('failed'),b=f.add('good');f.failures.add(a.rootPath);const latest=f.publish('second');
  await f.app.refreshPreparedWorkspaces();assert.deepEqual(f.calls,[a.rootPath,b.rootPath]);
  const failed=f.store.list().find(entry=>entry.rootPath===a.rootPath)!;assert.equal(failed.status,'failed');assert.equal(failed.resourceSet,latest.id);
  assert.equal(readResourceAdoption(a.rootPath)?.resourceSet,f.first.id);
  const view=f.query.listRegisteredWorkspaces().workspaces.find((item:any)=>item.rootPath===a.rootPath);assert.equal(view.readiness,'failed');assert.match(view.error.message,/目录暂时无法写入/);
  const opened=f.app.prepareWorkspaceForOpen(a.workspace.id);assert.ok(!('ready' in opened));assert.equal(opened.status,'failed');
  const restarted=f.createApp();
  await restarted.refreshPreparedWorkspaces();assert.equal(f.calls.length,2);
  f.failures.clear();f.publish('third');await f.app.refreshPreparedWorkspaces();assert.equal(f.store.list().find(entry=>entry.rootPath===a.rootPath)?.status,'ready');
});

test('queued removal or directory replacement never re-registers or updates the changed target',async t=>{
  const f=fixture(t);const a=f.add('first'),b=f.add('removed'),c=f.add('replaced');f.publish('second');
  f.setBeforeRun(async target=>{
    if(target!==a.rootPath)return;
    f.entries.splice(f.entries.indexOf(b),1);
    fs.renameSync(c.rootPath,c.rootPath+'-old');fs.mkdirSync(c.rootPath);fs.mkdirSync(path.join(c.rootPath,'.buildr'));fs.writeFileSync(path.join(c.rootPath,'.buildr/workspace.yml'),'{}');
  });
  await f.app.refreshPreparedWorkspaces();assert.deepEqual(f.calls,[a.rootPath]);assert.deepEqual(f.ensured,[a.rootPath]);
  assert.equal(fs.readFileSync(path.join(c.rootPath+'-old','custom.txt'),'utf8'),'keep');
});

test('a dead interrupted preparation resumes, while a live preparation remains owned',async t=>{
  const f=fixture(t);const dead=f.add('dead'),live=f.add('live');const target=f.publish('second').id;
  for(const [entry,pid]of [[dead,2147483647],[live,process.pid]]as const){const stat=fs.statSync(entry.rootPath);f.store.write({id:randomUUID(),revision:0,rootPath:entry.rootPath,directoryIdentity:`${stat.dev}:${stat.ino}`,name:entry.workspace.name,workspaceId:entry.workspace.id,status:'preparing',ownerPid:pid,error:null,updatedAt:'',resourceSet:target},null);}
  await f.app.refreshPreparedWorkspaces();assert.deepEqual(f.calls,[dead.rootPath]);
});
