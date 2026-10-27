import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { adoptPackageResources, ensurePackageResources, inspectSharedResources, publishPackageResources, readResourceAdoption, resolveSharedResource, sharedResourcesRoot } from '../../src/infrastructure/product-resources/shared-resources.ts';
import { createWorkspacePreparation } from '../../src/modules/workspace/application/workspace-preparation.ts';
import { WORKSPACE_HTTP_SCHEMAS, validateWorkspaceHttp } from '../../src/modules/workspace/interfaces/http/workspace-http-contracts.ts';
import { createResourceLocation } from '../../src/modules/installation/application/resource-location.ts';

function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-resource-coexistence-'));
  const before = process.env.BUILDR_PRODUCT_DATA_DIR;
  process.env.BUILDR_PRODUCT_DATA_DIR = path.join(root, 'data');
  t.after(() => { if (before === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR; else process.env.BUILDR_PRODUCT_DATA_DIR = before; fs.rmSync(root, {recursive:true,force:true}); });
  const product = (name: string, contents: string) => {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, 'resources/workspace/skills/example'), {recursive:true});
    fs.writeFileSync(path.join(dir,'package.json'), '{"version":"1.2.3"}');
    fs.writeFileSync(path.join(dir,'resources/workspace/skills/example/SKILL.md'), contents);
    return dir;
  };
  const old = product('old', 'old'), next = product('next','new');
  const workspace = path.join(root,'workspace'); fs.mkdirSync(workspace);
  return {root, old, next, workspace};
}

test('同版本不同来源：普通消费不覆盖；显式发布、采用及位置观察使用当前集', t => {
  const {old,next,workspace} = fixture(t);
  const first = ensurePackageResources(old); adoptPackageResources(workspace,true);
  const second = publishPackageResources(next,{expectedId:first.id});
  const file = path.join(sharedResourcesRoot(),'skills/example/SKILL.md');
  const before = fs.statSync(file).mtimeMs;
  assert.notEqual(first.id,second.id);
  assert.equal(ensurePackageResources(old).id,second.id);
  assert.equal(fs.statSync(file).mtimeMs,before);
  // A stale adoption does not prevent a valid resource from being consumed.
  assert.equal(readResourceAdoption(workspace)?.resourceSet, first.id);
  assert.equal(fs.readFileSync(resolveSharedResource(workspace,'workspace/skills/example/SKILL.md'),'utf8'),'new');
  const location = createResourceLocation({productRoot:()=>old}).resourceLocation();
  assert.equal(location.available,true); assert.equal(location.resourceSet,second.id);
  assert.throws(()=>publishPackageResources(old,{expectedId:first.id}), /已变化/);
  assert.throws(()=>adoptPackageResources(workspace,true,first.id), /已变化/);
  assert.equal(inspectSharedResources().id,second.id);
});

test('局部损坏只阻止对应资源，普通消费不借旧包修复新内容', t => {
  const {old,next,workspace} = fixture(t);
  const scripts = path.join(next,'resources/workspace/skills/example/run.sh');
  fs.writeFileSync(scripts,'echo new\n',{mode:0o755});
  const published=publishPackageResources(next); adoptPackageResources(workspace,true);
  const script=resolveSharedResource(workspace,'workspace/skills/example/run.sh');
  fs.chmodSync(script,0o644);
  assert.throws(()=>resolveSharedResource(workspace,'workspace/skills/example/run.sh'),/damaged/);
  assert.equal(fs.readFileSync(resolveSharedResource(workspace,'workspace/skills/example/SKILL.md'),'utf8'),'new');
  assert.equal(ensurePackageResources(old).id,published.id);
  assert.throws(()=>inspectSharedResources(),/damaged/);
  publishPackageResources(next,{expectedId:published.id});
  assert.equal(inspectSharedResources().id,published.id);
});

test('中断目录恢复只消费原集，不以当前旧包回退', t => {
  const {old,next,root}=fixture(t);const published=publishPackageResources(next);
  fs.renameSync(sharedResourcesRoot(),path.join(root,'data/.resources-previous'));
  assert.equal(ensurePackageResources(old).id,published.id);
  assert.equal(inspectSharedResources().id,published.id);
});

function preparation(root:string,workspace:string,onRender:()=>void) {
  fs.mkdirSync(path.join(workspace,'.buildr'),{recursive:true});
  fs.writeFileSync(path.join(workspace,'.buildr/workspace.yml'),'workspace identity');
  const receipts=path.join(workspace,'.buildr/agent-runtime/workspace/agents-standard/skill-projection-ownership-receipts');
  fs.mkdirSync(receipts,{recursive:true});fs.writeFileSync(path.join(receipts,'example.json'),'{}');
  const entry={rootPath:fs.realpathSync(workspace),workspace:{id:'test',name:'Example'},registryScope:'local'};
  return createWorkspacePreparation({
    registryRepository:{workspaceRegistryPath:()=>path.join(root,'registry/workspaces.json'),isSharedRegistryScope:()=>false},
    listRegisteredWorkspaces:()=>({workspaces:[entry]}),resolveRegisteredWorkspace:()=>entry,
    assertWorkspaceManagementAccess:()=>({claimed:true}),
    canonicalWorkspaceManagementIdentity:(target:string)=>{assert.equal(target,fs.realpathSync(workspace));},
    ensureRegisteredTarget:(target:string)=>{assert.equal(target,fs.realpathSync(workspace));},
    renderRuntime:onRender,
    readWorkspaceRecord:()=>({workspace:entry.workspace}),
    readComponentsManifestForWrite:()=>({components:[{id:"buildr-self-bootstrap",enabled:true,state:"installed"}]}),
  });
}

test('打开旧采用空间只刷新本机投射；自有源保留，重复打开幂等', t => {
  const {old,next,root,workspace}=fixture(t);publishPackageResources(old);adoptPackageResources(workspace,true);
  const custom=path.join(workspace,'skills/custom/SKILL.md');fs.mkdirSync(path.dirname(custom),{recursive:true});fs.writeFileSync(custom,'custom source');
  let renders=0;const app=preparation(root,workspace,()=>{renders++;});
  const latest=publishPackageResources(next);
  const result=app.prepareWorkspaceForOpen('test');
  assert.ok('ready' in result);
  assert.equal(result.ready,true);assert.equal(result.resourceRefresh?.status,'refreshed');
  assert.equal(readResourceAdoption(workspace)?.resourceSet,latest.id);
  assert.equal(fs.readFileSync(custom,'utf8'),'custom source');
  const again = app.prepareWorkspaceForOpen('test'); assert.ok('resourceRefresh' in again);
  assert.equal(again.resourceRefresh?.status,'current');
  assert.equal(renders,1);
});

test('投射失败时打开自动转入完整准备收敛，保留原采用', async t => {
  const {old,next,root,workspace}=fixture(t);const first=publishPackageResources(old);adoptPackageResources(workspace,true);
  const app=preparation(root,workspace,()=>{throw new Error('example attachment damaged');});
  publishPackageResources(next);
  // Refresh failure falls through to full preparation instead of reporting a retryable banner.
  const result=app.prepareWorkspaceForOpen('test');
  assert.ok(!('ready' in result));
  assert.equal(result.status,'preparing');
  assert.equal(validateWorkspaceHttp(WORKSPACE_HTTP_SCHEMAS.preparationOpenResponse.$id,result,'workspace.preparation.open','response'),result);
  assert.equal(readResourceAdoption(workspace)?.resourceSet,first.id);
  // The asynchronous full preparation must settle without leaving a stuck run.
  const deadline=Date.now()+120_000;
  while(Date.now()<deadline){
    const value=app.workspacePreparation(result.id);
    if(value.status!=='preparing'){assert.ok(['ready','failed','selected'].includes(value.status));return;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.fail('full preparation did not settle');
});

test('上次准备失败的打开如实返回失败，不静默重新开始', async t => {
  const {root,workspace}=fixture(t);
  const app=preparation(root,workspace,()=>{});
  const first=app.prepareWorkspaceForOpen('test');
  assert.ok(!('ready' in first));assert.equal(first.status,'preparing');
  const deadline=Date.now()+120_000;
  let failed:any=null;
  while(Date.now()<deadline){
    const value=app.workspacePreparation(first.id);
    if(value.status!=='preparing'){failed=value;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(failed,'first preparation did not settle');
  assert.equal(failed.status,'failed');
  // Unattended opens (auto-open, registry refresh) must surface the failure
  // instead of starting another attempt; retry stays with explicit /prepare.
  const again=app.prepareWorkspaceForOpen('test');
  assert.ok(!('ready' in again));
  assert.equal(again.status,'failed');
  assert.equal(again.id,failed.id);
  assert.equal(again.revision,failed.revision);
  assert.match(String(again.error),/自身维护程序/);
});

test('收敛降级：失效共享来源引用视为缺失，不阻塞整次同步', async t => {
  const {root}=fixture(t);
  t.mock.method(console,'log',()=>{});
  const service=path.resolve(import.meta.dirname,'../..');
  const {createRuntime}=await import('../helpers/runtime-harness.ts');
  const runtime=createRuntime();
  const workspace=path.join(root,'sync-target');
  runtime.initBuildr(['--source-only','--target',workspace,'--name','stale-resource','--profile','personal']);
  publishPackageResources(service); adoptPackageResources(workspace,true);
  const manifestFile=path.join(workspace,'skills/manifest.yml');
  const YAML=(await import('yaml')).default;
  const manifest=YAML.parse(fs.readFileSync(manifestFile,'utf8'));
  const entry=manifest.skills.find((item:any)=>item.id==='project-verification');
  assert.ok(entry,'project-verification installed by init');
  entry.resource='resources/workspace/skills/buildr/stale-removed-source';
  fs.writeFileSync(manifestFile,YAML.stringify(manifest));
  const result=runtime.syncPackageBuiltins(workspace);
  const finding=result.findings.find((item:any)=>item.type==='skill'&&item.id==='project-verification');
  assert.equal(finding?.status,'missing');
  const after=YAML.parse(fs.readFileSync(manifestFile,'utf8'));
  assert.equal(after.skills.find((item:any)=>item.id==='project-verification').state,'missing');
});

test('退役共享来源在发布时封存，陈旧引用仍能解析到保留副本', t => {
  const {old,next,workspace,root}=fixture(t);
  fs.writeFileSync(path.join(next,'resources/manifest.yml'),YAML.stringify({builtins:{skills:[{id:'example',target:'skills/example',description:'retired example',retired:true}]}}));
  fs.rmSync(path.join(next,'resources/workspace/skills/example'),{recursive:true,force:true});
  const first=publishPackageResources(old);adoptPackageResources(workspace,true);
  const second=publishPackageResources(next,{expectedId:first.id});
  assert.notEqual(first.id,second.id);
  // The retired source left the shared set but stayed resolvable from the preserved copy.
  assert.equal(inspectSharedResources().files.some((item:any)=>item.source.startsWith('workspace/skills/example/')),false);
  assert.equal(fs.readFileSync(resolveSharedResource(workspace,'workspace/skills/example/SKILL.md'),'utf8'),'old');
  const preserved=path.join(root,'data','local','preserved-skills','example','files','SKILL.md');
  assert.equal(fs.readFileSync(preserved,'utf8'),'old');
  // Unknown retired references still fail closed instead of guessing.
  assert.throws(()=>resolveSharedResource(workspace,'workspace/skills/never-shipped/SKILL.md'),/not declared|尚未准备/);
});

test('显式发布也拒绝较低版本和较早候选回退', t => {
  const {old,next}=fixture(t);
  fs.writeFileSync(path.join(old,'package.json'),' {"version":"1.2.3-rc.1"}');
  fs.writeFileSync(path.join(next,'package.json'),' {"version":"1.2.3-rc.2"}');
  const current=publishPackageResources(next);
  assert.throws(()=>publishPackageResources(old,{expectedId:current.id}), /版本更高/);
  assert.equal(ensurePackageResources(old).id,current.id);
  assert.equal(inspectSharedResources().id,current.id);
});

test('自举工作空间重试仅刷新投射，不再被随包摘要锁死', async t => {
  const {old,next,root,workspace}=fixture(t);publishPackageResources(old);adoptPackageResources(workspace,true);
  let renders=0;const app=preparation(root,workspace,()=>{renders++;});
  const latest=publishPackageResources(next);
  const result=await app.prepareRegisteredWorkspace({rootPath:fs.realpathSync(workspace),workspaceId:'test'});
  assert.ok('workspaceId' in result);
  assert.equal(result.workspaceId,'test');assert.equal(renders,1);
  assert.equal(readResourceAdoption(workspace)?.resourceSet,latest.id);
});

test('真实隔离进程：旧安装消费后，打开工作空间刷新当前共享技能', {timeout:90000}, () => {
  const service=path.resolve(import.meta.dirname,'../..');
  const result=spawnSync(process.execPath,[path.join(service,'tools/development/run-isolated-workspace-check.ts'),'--script',path.join(service,'tools/development/shared-resource-coexistence-check.ts')],{cwd:service,env:process.env,encoding:'utf8',timeout:85000,maxBuffer:4*1024*1024});
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert.match(result.stdout,/"status":"passed"/);assert.match(result.stdout,/"cleanup":"cleaned"/);
});
