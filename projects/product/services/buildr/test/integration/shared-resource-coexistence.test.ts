import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
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

test('投射失败仍可打开已准备工作空间，保留原采用并返回局部问题供重试', t => {
  const {old,next,root,workspace}=fixture(t);const first=publishPackageResources(old);adoptPackageResources(workspace,true);
  let failed=true;const app=preparation(root,workspace,()=>{if(failed)throw new Error('example attachment damaged');});
  publishPackageResources(next);
  const result=app.prepareWorkspaceForOpen('test');
  assert.ok('ready' in result);
  assert.equal(result.ready,true);assert.equal(result.resourceRefresh?.status,'failed');
  assert.equal(validateWorkspaceHttp(WORKSPACE_HTTP_SCHEMAS.preparationOpenResponse.$id,result,'workspace.preparation.open','response'),result);
  assert.match(result.resourceRefresh?.message||'',/attachment damaged/);
  assert.equal(readResourceAdoption(workspace)?.resourceSet,first.id);
  failed=false;const restored=app.prepareWorkspaceForOpen('test');assert.ok('resourceRefresh' in restored);assert.equal(restored.resourceRefresh?.status,'refreshed');
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
