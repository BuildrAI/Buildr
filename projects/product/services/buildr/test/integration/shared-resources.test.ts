import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { describePackageResources, ensurePackageResources, inspectSharedResources, sharedResourcesRoot } from '../../src/infrastructure/product-resources/shared-resources.ts';

test('固定共享目录：同内容幂等，完整替换新内容并清理废弃文件及临时备份', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-shared-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const previous=process.env.BUILDR_PRODUCT_DATA_DIR;process.env.BUILDR_PRODUCT_DATA_DIR=path.join(root,'data');t.after(()=>{if(previous===undefined)delete process.env.BUILDR_PRODUCT_DATA_DIR;else process.env.BUILDR_PRODUCT_DATA_DIR=previous;});
  const product=path.join(root,'product');fs.mkdirSync(path.join(product,'resources/workspace/skills/buildr/example/scripts'),{recursive:true});
  fs.writeFileSync(path.join(product,'package.json'),'{"version":"1.2.3"}');
  const script=path.join(product,'resources/workspace/skills/buildr/example/scripts/run.sh');fs.writeFileSync(script,'echo hello\n',{mode:0o755});
  const obsolete=path.join(product,'resources/workspace/obsolete.md');fs.writeFileSync(obsolete,'old');
  const first=ensurePackageResources(product);const location=path.join(sharedResourcesRoot(),'skills/buildr/example/scripts/run.sh');
  assert.equal(fs.readFileSync(location,'utf8'),'echo hello\n');assert.equal(fs.statSync(location).mode&0o111,0o111);
  const before=fs.statSync(location).mtimeMs;assert.deepEqual(ensurePackageResources(product),first);assert.equal(fs.statSync(location).mtimeMs,before);
  fs.writeFileSync(script,'echo next\n');fs.unlinkSync(obsolete);const next=ensurePackageResources(product);assert.notEqual(first.id,next.id);assert.equal(describePackageResources(product).id,next.id);assert.equal(fs.readFileSync(location,'utf8'),'echo next\n');
  assert.equal(fs.existsSync(path.join(sharedResourcesRoot(),'obsolete.md')),false);assert.equal(fs.existsSync(path.join(sharedResourcesRoot(),first.id)),false);assert.throws(()=>inspectSharedResources(first.id),/已更新/);
  assert.equal(fs.existsSync(path.join(root,'data/.resources-next')),false);assert.equal(fs.existsSync(path.join(root,'data/.resources-previous')),false);
  fs.writeFileSync(location,'damaged');assert.throws(()=>inspectSharedResources(next.id),/damaged/);assert.equal(ensurePackageResources(product).id,next.id);assert.equal(fs.readFileSync(location,'utf8'),'echo next\n');
  fs.writeFileSync(path.join(sharedResourcesRoot(),'unexpected.sh'),'unexpected');assert.throws(()=>inspectSharedResources(next.id),/Unexpected/);ensurePackageResources(product);assert.equal(fs.existsSync(path.join(sharedResourcesRoot(),'unexpected.sh')),false);
});

test('共享资源：拒绝符号链接，不把外部文件纳入资源身份', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-shared-link-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'resources'));fs.writeFileSync(path.join(root,'package.json'),'{"version":"1.0.0"}');fs.symlinkSync('/etc/hosts',path.join(root,'resources/escape'));
  assert.throws(()=>describePackageResources(root),/Unsupported/);
});

test('共享位置只读展示、不自动安装，打开校验当前资源身份且不接受损坏资源', async t => {
  const { createResourceLocation } = await import('../../src/modules/installation/application/resource-location.ts');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-resource-location-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const previous=process.env.BUILDR_PRODUCT_DATA_DIR;process.env.BUILDR_PRODUCT_DATA_DIR=path.join(root,'data');t.after(()=>{if(previous===undefined)delete process.env.BUILDR_PRODUCT_DATA_DIR;else process.env.BUILDR_PRODUCT_DATA_DIR=previous;});
  const product=path.join(root,'product');fs.mkdirSync(path.join(product,'resources/workspace'),{recursive:true});fs.writeFileSync(path.join(product,'package.json'),'{"version":"1.2.3"}');fs.writeFileSync(path.join(product,'resources/workspace/AGENTS.md'),'rules');
  const opened:string[]=[];const app=createResourceLocation({productRoot:()=>product,open:async directory=>{opened.push(directory);return {requested:true};}});
  assert.equal(app.resourceLocation().available,false);assert.equal(fs.existsSync(path.join(root,'data')),false);
  await assert.rejects(app.openResourceLocation({resourceSet:app.resourceLocation().resourceSet}),/尚未准备/);
  ensurePackageResources(product);const current=app.resourceLocation();assert.equal(current.available,true);
  await assert.rejects(app.openResourceLocation({resourceSet:'old'}),/已变化/);assert.equal(opened.length,0);
  assert.deepEqual(await app.openResourceLocation({resourceSet:current.resourceSet}),{requested:true});assert.deepEqual(opened,[current.path]);
  fs.writeFileSync(path.join(current.path,'AGENTS.md'),'changed');await assert.rejects(app.openResourceLocation({resourceSet:current.resourceSet}),/需要修复/);assert.equal(opened.length,1);
});

test('文件管理器调用使用目录参数，无 shell，并覆盖 macOS、Windows 及启动失败', async t => {
  const { openDirectory } = await import('../../src/infrastructure/filesystem/open-directory.ts');const { EventEmitter }=await import('node:events');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-open-dir-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const directory=path.join(root,'空 格 & literal');fs.mkdirSync(directory);
  for(const [platform,expected] of [['darwin','/usr/bin/open'],['win32','explorer.exe'],['linux','xdg-open']]) {
    let called:any;
    const spawnProcess:any=(command:any,args:any,options:any)=>{called={command,args,options};const child:any=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;};
    await openDirectory(directory,{platform,spawnProcess});assert.equal(called.command,expected);assert.deepEqual(called.args,[directory]);assert.equal(called.options.shell,false);
  }
  const failed:any=()=>{const child:any=new EventEmitter();queueMicrotask(()=>child.emit('error',new Error('not available')));return child;};
  await assert.rejects(openDirectory(directory,{spawnProcess:failed}),/not available/);
});

test('固定目录迁移清理历史版本，切换失败保留旧内容，重试恢复中断现场', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-shared-recover-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const previous=process.env.BUILDR_PRODUCT_DATA_DIR;const data=path.join(root,'data');process.env.BUILDR_PRODUCT_DATA_DIR=data;t.after(()=>{if(previous===undefined)delete process.env.BUILDR_PRODUCT_DATA_DIR;else process.env.BUILDR_PRODUCT_DATA_DIR=previous;});
  const product=path.join(root,'product');fs.mkdirSync(path.join(product,'resources/workspace'),{recursive:true});fs.writeFileSync(path.join(product,'package.json'),'{"version":"1.0.0"}');const source=path.join(product,'resources/workspace/AGENTS.md');fs.writeFileSync(source,'first');
  // The previous layout was a directory of versioned sets and their obsolete files.
  fs.mkdirSync(path.join(sharedResourcesRoot(),'1.0.0-old'),{recursive:true});fs.writeFileSync(path.join(sharedResourcesRoot(),'1.0.0-old/stale.md'),'stale');
  const first=ensurePackageResources(product);assert.equal(fs.existsSync(path.join(sharedResourcesRoot(),'1.0.0-old')),false);
  fs.writeFileSync(source,'second');const rename=fs.renameSync;
  const mocked=t.mock.method(fs,'renameSync',((from:any,to:any)=>{if(from===path.join(data,'.resources-next')&&to===sharedResourcesRoot())throw new Error('switch denied');return rename(from,to);}) as typeof fs.renameSync);
  assert.throws(()=>ensurePackageResources(product),/switch denied/);assert.equal(inspectSharedResources(first.id).id,first.id);assert.equal(fs.readFileSync(path.join(sharedResourcesRoot(),'AGENTS.md'),'utf8'),'first');mocked.mock.restore();
  // Process interruption after moving the old directory aside, before publication.
  fs.renameSync(sharedResourcesRoot(),path.join(data,'.resources-previous'));fs.mkdirSync(path.join(data,'.resources-next'));fs.writeFileSync(path.join(data,'.resources-next/partial'),'partial');
  const second=ensurePackageResources(product);assert.notEqual(second.id,first.id);assert.equal(fs.readFileSync(path.join(sharedResourcesRoot(),'AGENTS.md'),'utf8'),'second');assert.equal(fs.existsSync(path.join(data,'.resources-previous')),false);assert.equal(fs.existsSync(path.join(data,'.resources-next')),false);
  // Process interruption after publication, before backup cleanup.
  fs.mkdirSync(path.join(data,'.resources-previous'));fs.writeFileSync(path.join(data,'.resources-previous/stale'),'stale');ensurePackageResources(product);assert.equal(fs.existsSync(path.join(data,'.resources-previous')),false);
});
