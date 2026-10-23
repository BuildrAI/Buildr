import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRuntime, runtimeProvide, runtimeContributions } from '../../src/bootstrap/runtime.ts';
import { WORKSPACE_APPLICATION } from '../../src/modules/workspace/module.ts';
import { AGENT_ASSETS_APPLICATION } from '../../src/modules/agent-assets/module.ts';
import { readResourceAdoption, sharedResourcesRoot } from '../../src/infrastructure/product-resources/shared-resources.ts';
let root=process.env.BUILDR_SMOKE_WORKSPACE_ROOT!;assert.ok(root,'Use isolated smoke runner.');
const service=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
process.env.BUILDR_NPM_ENTRY_PATH=path.join(service,'bin/buildr.mjs');
fs.mkdirSync(root,{recursive:true});root=fs.realpathSync(root);fs.writeFileSync(path.join(root,'user.txt'),'keep this');
const runtime=createRuntime();const app:any=runtimeProvide(runtime,WORKSPACE_APPLICATION);
const first=app.selectWorkspaceDirectory(root);assert.equal(first.status,'selected');
app.prepareSelectedWorkspace({id:first.id,revision:first.revision,name:'生命周期验证'});
async function wait(id:string){for(let i=0;i<150;i++){const result=app.workspacePreparation(id);if(result.status!=='preparing')return result;await new Promise(resolve=>setTimeout(resolve,200));}throw new Error('Preparation timed out.');}
const ready=await wait(first.id);assert.equal(ready.status,'ready',ready.error);assert.ok(ready.workspaceId);
assert.equal(fs.readFileSync(path.join(root,'user.txt'),'utf8'),'keep this');
const selection=app.selectWorkspaceDirectory(root);assert.equal(selection.id,first.id);
const manifest=fs.readFileSync(path.join(root,'skills/manifest.yml'),'utf8');assert.match(manifest,/resource:/);assert.match(manifest,/id: task-verification/);assert.doesNotMatch(manifest,new RegExp(sharedResourcesRoot().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
assert.equal(fs.existsSync(path.join(root,'skills/buildr/task-manager/SKILL.md')),false);
assert.equal(fs.existsSync(path.join(root,'skills/openspec/openspec-propose/SKILL.md')),false);
assert.ok(fs.existsSync(path.join(root,'.agents/skills/task-manager/SKILL.md')));assert.ok(readResourceAdoption(root)?.ready);
// An old layout receipt cannot skip regeneration even when its content identity matches.
const legacyAdoptionFile=path.join(root,'.buildr/local/package-resources.json');
const legacyAdoption=JSON.parse(fs.readFileSync(legacyAdoptionFile,'utf8'));delete legacyAdoption.layout;fs.writeFileSync(legacyAdoptionFile,JSON.stringify(legacyAdoption));
assert.equal(readResourceAdoption(root)?.ready,false);
const reopening=app.prepareWorkspaceForOpen(ready.workspaceId);assert.equal(reopening.status,'preparing');const reopened=await wait(reopening.id);assert.equal(reopened.status,'ready',reopened.error);assert.equal(JSON.parse(fs.readFileSync(legacyAdoptionFile,'utf8')).layout,'fixed');
const assets:any=runtimeProvide(runtime,AGENT_ASSETS_APPLICATION);assert.ok(assets.skillFile(root,'task-manager','SKILL.md').content);
await app.prepareRegisteredWorkspace({rootPath:root,workspaceId:ready.workspaceId});assert.equal(app.listRegisteredWorkspaces().workspaces.length,1);
const removed=spawnSync(process.execPath,[process.env.BUILDR_NPM_ENTRY_PATH,'skills','remove','mysql-connection','--target',root],{encoding:'utf8'});assert.equal(removed.status,0,removed.stderr);
await app.prepareRegisteredWorkspace({rootPath:root,workspaceId:ready.workspaceId});assert.match(fs.readFileSync(path.join(root,'skills/manifest.yml'),'utf8'),/id: mysql-connection[\s\S]*?enabled: false/);assert.equal(fs.existsSync(path.join(root,'.agents/skills/mysql-connection')),false);
const moved=`${root}-offline`;fs.renameSync(root,moved);
await assert.rejects(()=>app.prepareRegisteredWorkspace({rootPath:root,workspaceId:ready.workspaceId}));
fs.renameSync(moved,root);await app.prepareRegisteredWorkspace({rootPath:root,workspaceId:ready.workspaceId});
// A proven old official copy is migrated; a changed copy is retained until explicitly adopted.
const skillsFile=path.join(root,'skills/manifest.yml');
const YAML=(await import('yaml')).default;
let document=YAML.parse(fs.readFileSync(skillsFile,'utf8'));
const custom=document.skills.find((entry:any)=>entry.id==='task-manager');
const {resolveSharedResource}=await import('../../src/infrastructure/product-resources/shared-resources.ts');
const original=path.dirname(resolveSharedResource(root,`${custom.resource}/SKILL.md`));
fs.mkdirSync(path.dirname(path.join(root,'skills',custom.path)),{recursive:true});fs.cpSync(original,path.join(root,'skills',custom.path),{recursive:true});delete custom.resource;fs.appendFileSync(path.join(root,'skills',custom.path,'SKILL.md'),'\nLocal customization\n');fs.writeFileSync(skillsFile,YAML.stringify(document));
await assert.rejects(()=>app.prepareRegisteredWorkspace({rootPath:root,workspaceId:ready.workspaceId}),(error:any)=>error.code==='workspace_customizations_pending'&&error.customizations.length===1);
const retrySelection=app.selectWorkspaceDirectory(root);app.prepareSelectedWorkspace({id:retrySelection.id,revision:retrySelection.revision,name:retrySelection.name});
const failed=await wait(retrySelection.id);assert.equal(failed.status,'failed');assert.ok(failed.customizations.length);
app.prepareSelectedWorkspace({id:failed.id,revision:failed.revision,name:failed.name,keepCustomizations:true});const customized=await wait(failed.id);assert.equal(customized.status,'ready',customized.error);assert.match(fs.readFileSync(path.join(root,'.agents/skills/task-manager/SKILL.md'),'utf8'),/Local customization/);
// Explicit replacement copies a shared method into this workspace without changing global bytes.
document=YAML.parse(fs.readFileSync(skillsFile,'utf8'));const ux=document.skills.find((entry:any)=>entry.id==='ux-design-laws');const uxSource=path.dirname(resolveSharedResource(root,`${ux.resource}/SKILL.md`));const beforeUx=fs.readFileSync(path.join(uxSource,'SKILL.md'),'utf8');
const copied=spawnSync(process.execPath,[process.env.BUILDR_NPM_ENTRY_PATH,'skills','add','ux-design-laws','--source',uxSource,'--replace','--target',root],{encoding:'utf8'});assert.equal(copied.status,0,copied.stderr);fs.appendFileSync(path.join(root,'skills/ux-design-laws/SKILL.md'),'\nWorkspace design choices\n');await app.prepareRegisteredWorkspace({rootPath:root,workspaceId:ready.workspaceId});assert.equal(fs.readFileSync(path.join(uxSource,'SKILL.md'),'utf8'),beforeUx);assert.match(fs.readFileSync(path.join(root,'.agents/skills/ux-design-laws/SKILL.md'),'utf8'),/Workspace design choices/);
// A changed standard contract is retained until the user chooses its local adoption.
document=YAML.parse(fs.readFileSync(skillsFile,'utf8'));const contract=document.contracts.find((entry:any)=>entry.resource);const contractSource=resolveSharedResource(root,contract.resource);const localContract=path.join(root,'skills',contract.path);fs.mkdirSync(path.dirname(localContract),{recursive:true});fs.copyFileSync(contractSource,localContract);fs.appendFileSync(localContract,'\nWorkspace-specific agreement.\n');delete contract.resource;fs.writeFileSync(skillsFile,YAML.stringify(document));
const contractSelection=app.selectWorkspaceDirectory(root);app.prepareSelectedWorkspace({id:contractSelection.id,revision:contractSelection.revision,name:contractSelection.name});const contractFailed=await wait(contractSelection.id);assert.equal(contractFailed.status,'failed');assert.ok(contractFailed.customizations.some((item:any)=>item.id.startsWith('contract:')));
app.prepareSelectedWorkspace({id:contractFailed.id,revision:contractFailed.revision,name:contractFailed.name,keepCustomizations:true});const contractReady=await wait(contractFailed.id);assert.equal(contractReady.status,'ready',contractReady.error);assert.match(fs.readFileSync(localContract,'utf8'),/Workspace-specific agreement/);
// A collaborating machine starts without local adoption and can rebuild it.
fs.rmSync(path.join(root,'.buildr/local/package-resources.json'));await app.prepareRegisteredWorkspace({rootPath:root,workspaceId:ready.workspaceId});
const adoption=path.join(root,'.buildr/local/package-resources.json');const adopted=JSON.parse(fs.readFileSync(adoption,'utf8'));fs.writeFileSync(adoption,JSON.stringify({...adopted,resourceSet:adopted.resourceSet.replace(/^\d+/, '999')}));
const doctor=spawnSync(process.execPath,[process.env.BUILDR_NPM_ENTRY_PATH,'doctor','--target',root,'--json'],{encoding:'utf8'});assert.match(doctor.stdout,/workspace.resources_(?:outdated|invalid)/);
fs.writeFileSync(adoption,JSON.stringify(adopted));
let second=path.join(process.env.BUILDR_SMOKE_ROOT!,'second');fs.mkdirSync(second);second=fs.realpathSync(second);
const contributions=runtimeContributions(runtime,'http').map((contribution:any)=>contribution.id==='workspace-core.http'?{...contribution,handleTopLevel:(input:any)=>contribution.handleTopLevel({...input,pickWorkspaceDirectory:()=>second})}:contribution);
let secondWorkspaceId:string;
const server=createLocalWorkspaceServer(runtime,{targetRoot:root,httpContributions:contributions,ensureRegisteredTarget:app.ensureRegisteredTarget,resolveRegisteredWorkspace:app.resolveRegisteredWorkspace});
try {
  const {url,sessionToken}=await server.ready;
  const headers={origin:url,'content-type':'application/json','x-buildr-session':sessionToken};
  let response=await fetch(`${url}/api/v1/workspaces/choose`,{method:'POST',headers:{origin:url,'content-type':'application/json'},body:'{}'});assert.equal(response.status,403);
  response=await fetch(`${url}/api/v1/workspaces/choose`,{method:'POST',headers,body:'{}'});assert.equal(response.status,200);const chosen:any=await response.json();assert.equal(chosen.ownerPid,undefined);assert.equal(chosen.directoryIdentity,undefined);
  response=await fetch(`${url}/api/v1/workspaces/prepare`,{method:'POST',headers,body:JSON.stringify({id:chosen.id,revision:0,name:'HTTP validation'})});assert.equal(response.status,400);
  response=await fetch(`${url}/api/v1/workspaces/prepare`,{method:'POST',headers,body:JSON.stringify({id:chosen.id,revision:chosen.revision,name:'HTTP validation',unexpected:true})});assert.equal(response.status,400);assert.equal(fs.existsSync(path.join(second,'.buildr/workspace.yml')),false);
  response=await fetch(`${url}/api/v1/workspaces/prepare`,{method:'POST',headers,body:JSON.stringify({id:chosen.id,revision:chosen.revision,name:'HTTP validation'})});assert.equal(response.status,200);assert.equal((await response.json()).status,'preparing');
  const prepared=await wait(chosen.id);assert.equal(prepared.status,'ready',prepared.error);secondWorkspaceId=prepared.workspaceId;
  response=await fetch(`${url}/api/v1/workspaces/preparations/${chosen.id}`);assert.equal(response.status,200);assert.equal((await response.json()).status,'ready');
  response=await fetch(`${url}/api/v1/workspaces/open`,{method:'POST',headers,body:JSON.stringify({workspaceId:prepared.workspaceId})});assert.equal(response.status,200);assert.equal((await response.json()).ready,true);
} finally {await server.shutdown();}
// A global replacement succeeds for available spaces; an unavailable stale space retries latest.
const currentIdentity=readResourceAdoption(root)!.resourceSet;
for(const workspace of [root,second]){const file=path.join(workspace,'.buildr/local/package-resources.json');const value=JSON.parse(fs.readFileSync(file,'utf8'));fs.writeFileSync(file,JSON.stringify({...value,resourceSet:value.resourceSet.replace(/^\d+/,'999')}));}
fs.writeFileSync(path.join(sharedResourcesRoot(),'retired-official-file.md'),'must be removed');
fs.renameSync(root,moved);
await assert.rejects(()=>app.prepareRegisteredWorkspace({rootPath:root,workspaceId:ready.workspaceId}));
try {const result=await app.prepareRegisteredWorkspace({rootPath:second,workspaceId:secondWorkspaceId!});assert.notEqual(result.status,'removed');}finally{fs.renameSync(moved,root);}
assert.equal(fs.existsSync(path.join(sharedResourcesRoot(),'retired-official-file.md')),false);assert.equal(readResourceAdoption(second)?.resourceSet,currentIdentity);assert.notEqual(readResourceAdoption(root)?.resourceSet,currentIdentity);
const staleDoctor=spawnSync(process.execPath,[process.env.BUILDR_NPM_ENTRY_PATH,'doctor','--target',root,'--json'],{encoding:'utf8'});assert.match(staleDoctor.stdout,/workspace.resources_outdated/);assert.doesNotMatch(staleDoctor.stdout,/workspace.resources_invalid/);
await app.prepareRegisteredWorkspace({rootPath:root,workspaceId:ready.workspaceId});assert.equal(readResourceAdoption(root)?.resourceSet,currentIdentity);assert.equal(readResourceAdoption(root)?.ready,true);
assert.match(fs.readFileSync(path.join(root,'skills/ux-design-laws/SKILL.md'),'utf8'),/Workspace design choices/);
console.log(JSON.stringify({status:'passed',workspaceId:ready.workspaceId,scenarios:['add','shared sources','component source','skill reading','repeat','unavailable','retry','doctor']}));
