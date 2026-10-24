import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import crypto from 'node:crypto';
import { enumerateSkillSourceFiles } from '../../src/modules/agent-assets/infrastructure/runtime/skills/projection-files.ts';
import { assetIntegrity } from '../../src/modules/agent-assets/infrastructure/component-source.ts';
import { createBuiltinReceipts } from '../../src/modules/agent-assets/application/package-maintenance/builtin-receipts.ts';
import { collectFiles } from '../../src/infrastructure/filesystem/tree-files.ts';
import { describePackageResources, ensurePackageResources, inspectSharedResources, sharedResourcesRoot } from '../../src/infrastructure/product-resources/shared-resources.ts';

test('技能目录内Finder文件既不是定制修改也不是入口附件，真实附件修改仍被发现', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-skill-finder-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'SKILL.md'), '---\nname: example\n---\n');
  const script = path.join(root, 'scripts/run.mjs'); fs.writeFileSync(script, 'console.log(1);');
  const receipts = createBuiltinReceipts({ fs, path, crypto, collectFiles,
    existsDirectory: (file: string) => fs.statSync(file, { throwIfNoEntry: false })?.isDirectory(),
    existsFile: fs.existsSync, toPosixRelative: (base: string, file: string) => path.relative(base, file).split(path.sep).join('/') });
  const componentBefore = assetIntegrity(root), builtinBefore = receipts.snapshot(root, 'skill');
  const inventoryBefore = enumerateSkillSourceFiles(root);
  for (const dir of [root, path.join(root, 'scripts')]) fs.writeFileSync(path.join(dir, '.DS_Store'), 'Finder');
  assert.equal(assetIntegrity(root), componentBefore);
  assert.deepEqual(receipts.snapshot(root, 'skill'), builtinBefore);
  assert.deepEqual(enumerateSkillSourceFiles(root), inventoryBefore);
  fs.writeFileSync(script, 'console.log(2);');
  assert.notEqual(assetIntegrity(root), componentBefore);
  assert.notDeepEqual(receipts.snapshot(root, 'skill'), builtinBefore);
  const metadata = path.join(root, '.DS_Store'); fs.unlinkSync(metadata); fs.symlinkSync(script, metadata);
  assert.throws(() => enumerateSkillSourceFiles(root), /metadata|symbolic/);
  assert.throws(() => assetIntegrity(root), /symbolic/);
  assert.throws(() => receipts.snapshot(root, 'skill'), /symlinks/);
});

test('共享收录保留完整能力资源，旧集迁移清理内部副本而不删除安装源', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-shared-scope-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const previous = process.env.BUILDR_PRODUCT_DATA_DIR;
  process.env.BUILDR_PRODUCT_DATA_DIR = path.join(root, 'data');
  t.after(() => { if (previous === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR; else process.env.BUILDR_PRODUCT_DATA_DIR = previous; });
  const product = path.join(root, 'product');
  const shared = ['workspace/skills/buildr/example/SKILL.md', 'workspace/skills/buildr/example/templates/example.yml', 'workspace/skills/contracts/buildr/example/v1.md', 'runtime/skills/buildr/SKILL.md'];
  const internal = ['workspace/AGENTS.md', 'workspace/projects/AGENTS.project.md', 'workspace/gitignore', 'workspace/commands/manifest.yml', 'workspace/components/example/component.yml', 'installation/launcher/Buildr.icns', 'contracts/bootstrap.yml', 'manifest.yml'];
  for (const relative of [...shared, ...internal]) {
    const file = path.join(product, 'resources', relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, relative);
  }
  fs.writeFileSync(path.join(product, 'package.json'), '{"version":"1.2.3"}');
  const desired = describePackageResources(product);
  assert.deepEqual(desired.files.map(file => file.source).sort(), [...shared].sort());
  const capabilityIdentity = desired.id;
  fs.appendFileSync(path.join(product, 'resources/workspace/AGENTS.md'), '\nchanged initialization source');
  assert.equal(describePackageResources(product).id, capabilityIdentity);
  // A valid previous, wider descriptor must be replaced, not left as extra files.
  const oldFiles = [...desired.files];
  for (const relative of internal) {
    const source = path.join(product, 'resources', relative);
    const destination = relative.startsWith('workspace/') ? relative.slice('workspace/'.length) : relative;
    oldFiles.push({ source: relative, path: destination, sha256: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'), mode: fs.statSync(source).mode & 0o777 });
  }
  const target = sharedResourcesRoot();
  for (const entry of oldFiles) {
    const file = path.join(target, entry.path); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(path.join(product, 'resources', entry.source), file);
  }
  const old = { schemaVersion: 'buildr.shared-resources/v1', version: '1.2.3', id: `1.2.3-${crypto.createHash('sha256').update(JSON.stringify(oldFiles)).digest('hex')}`, files: oldFiles };
  fs.writeFileSync(path.join(target, 'resource-set.json'), JSON.stringify(old));
  assert.equal(inspectSharedResources().id, old.id);
  ensurePackageResources(product);
  assert.equal(inspectSharedResources().id, capabilityIdentity);
  assert.deepEqual(fs.readdirSync(target).sort(), ['contracts', 'resource-set.json', 'skills']);
  for (const source of [...internal, ...shared]) assert.equal(fs.existsSync(path.join(product, 'resources', source)), true);
  for (const entry of desired.files) assert.equal(fs.readFileSync(path.join(target, entry.path), 'utf8'), entry.source);
});

test('Finder元数据不改变身份、可用性或触发替换，仍拒绝非法对象和真实损坏', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-shared-finder-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const previous = process.env.BUILDR_PRODUCT_DATA_DIR;
  process.env.BUILDR_PRODUCT_DATA_DIR = path.join(root, 'data');
  t.after(() => { if (previous === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR; else process.env.BUILDR_PRODUCT_DATA_DIR = previous; });
  const product = path.join(root, 'product');
  const source = path.join(product, 'resources/workspace/skills/example/SKILL.md');
  fs.mkdirSync(path.dirname(source), { recursive: true }); fs.writeFileSync(source, 'official');
  fs.writeFileSync(path.join(product, 'package.json'), '{"version":"1.2.3"}');
  const initial = describePackageResources(product);
  fs.writeFileSync(path.join(product, 'resources/.DS_Store'), 'metadata');
  fs.writeFileSync(path.join(path.dirname(source), '.DS_Store'), 'metadata');
  assert.deepEqual(describePackageResources(product), initial);
  ensurePackageResources(product);
  const target = sharedResourcesRoot(), entry = path.join(target, 'skills/example/SKILL.md');
  for (const directory of [target, path.dirname(entry)]) fs.writeFileSync(path.join(directory, '.DS_Store'), 'metadata');
  assert.equal(inspectSharedResources().id, initial.id);
  const before = fs.statSync(entry).mtimeMs;
  ensurePackageResources(product); assert.equal(fs.statSync(entry).mtimeMs, before);
  const { createResourceLocation } = await import('../../src/modules/installation/application/resource-location.ts');
  const opened: string[] = [];
  const app = createResourceLocation({ productRoot: () => product, open: async directory => { opened.push(directory); return { requested: true }; } });
  assert.equal(app.resourceLocation().available, true);
  await app.openResourceLocation({ resourceSet: initial.id }); assert.deepEqual(opened, [target]);
  const metadata = path.join(target, '.DS_Store'); fs.unlinkSync(metadata);
  fs.mkdirSync(metadata); assert.throws(() => inspectSharedResources(), /metadata/); fs.rmdirSync(metadata);
  fs.symlinkSync(source, metadata); assert.throws(() => inspectSharedResources(), /Unsupported/); fs.unlinkSync(metadata);
  const sourceMetadata = path.join(path.dirname(source), '.DS_Store'); fs.unlinkSync(sourceMetadata);
  fs.symlinkSync(source, sourceMetadata); assert.throws(() => describePackageResources(product), /Unsupported/); fs.unlinkSync(sourceMetadata);
  fs.mkdirSync(sourceMetadata); assert.throws(() => describePackageResources(product), /metadata/); fs.rmdirSync(sourceMetadata);
  fs.writeFileSync(path.join(target, 'unexpected.sh'), 'not official');
  assert.throws(() => inspectSharedResources(), /Unexpected/); fs.unlinkSync(path.join(target, 'unexpected.sh'));
  fs.writeFileSync(entry, 'damaged'); assert.throws(() => inspectSharedResources(), /damaged/);
  fs.writeFileSync(entry, 'official'); fs.unlinkSync(entry); assert.throws(() => inspectSharedResources(), /ENOENT/);
});

test('固定共享目录：同内容幂等，完整替换新内容并清理废弃文件及临时备份', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buildr-shared-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const previous=process.env.BUILDR_PRODUCT_DATA_DIR;process.env.BUILDR_PRODUCT_DATA_DIR=path.join(root,'data');t.after(()=>{if(previous===undefined)delete process.env.BUILDR_PRODUCT_DATA_DIR;else process.env.BUILDR_PRODUCT_DATA_DIR=previous;});
  const product=path.join(root,'product');fs.mkdirSync(path.join(product,'resources/workspace/skills/buildr/example/scripts'),{recursive:true});
  fs.writeFileSync(path.join(product,'package.json'),'{"version":"1.2.3"}');
  const script=path.join(product,'resources/workspace/skills/buildr/example/scripts/run.sh');fs.writeFileSync(script,'echo hello\n',{mode:0o755});
  const obsolete=path.join(product,'resources/workspace/skills/buildr/example/obsolete.md');fs.writeFileSync(obsolete,'old');
  const first=ensurePackageResources(product);const location=path.join(sharedResourcesRoot(),'skills/buildr/example/scripts/run.sh');
  assert.equal(fs.readFileSync(location,'utf8'),'echo hello\n');assert.equal(fs.statSync(location).mode&0o111,0o111);
  const before=fs.statSync(location).mtimeMs;assert.deepEqual(ensurePackageResources(product),first);assert.equal(fs.statSync(location).mtimeMs,before);
  fs.writeFileSync(script,'echo next\n');fs.unlinkSync(obsolete);const next=ensurePackageResources(product);assert.notEqual(first.id,next.id);assert.equal(describePackageResources(product).id,next.id);assert.equal(fs.readFileSync(location,'utf8'),'echo next\n');
  assert.equal(fs.existsSync(path.join(sharedResourcesRoot(),'skills/buildr/example/obsolete.md')),false);assert.equal(fs.existsSync(path.join(sharedResourcesRoot(),first.id)),false);assert.throws(()=>inspectSharedResources(first.id),/已更新/);
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
  const product=path.join(root,'product');fs.mkdirSync(path.join(product,'resources/workspace/skills/example'),{recursive:true});fs.writeFileSync(path.join(product,'package.json'),'{"version":"1.2.3"}');fs.writeFileSync(path.join(product,'resources/workspace/skills/example/SKILL.md'),'rules');
  const opened:string[]=[];const app=createResourceLocation({productRoot:()=>product,open:async directory=>{opened.push(directory);return {requested:true};}});
  assert.equal(app.resourceLocation().available,false);assert.equal(fs.existsSync(path.join(root,'data')),false);
  await assert.rejects(app.openResourceLocation({resourceSet:app.resourceLocation().resourceSet}),/尚未准备/);
  ensurePackageResources(product);const current=app.resourceLocation();assert.equal(current.available,true);
  await assert.rejects(app.openResourceLocation({resourceSet:'old'}),/已变化/);assert.equal(opened.length,0);
  assert.deepEqual(await app.openResourceLocation({resourceSet:current.resourceSet}),{requested:true});assert.deepEqual(opened,[current.path]);
  fs.writeFileSync(path.join(current.path,'skills/example/SKILL.md'),'changed');await assert.rejects(app.openResourceLocation({resourceSet:current.resourceSet}),/需要修复/);assert.equal(opened.length,1);
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
  const product=path.join(root,'product');fs.mkdirSync(path.join(product,'resources/workspace/skills/example'),{recursive:true});fs.writeFileSync(path.join(product,'package.json'),'{"version":"1.0.0"}');const source=path.join(product,'resources/workspace/skills/example/SKILL.md');fs.writeFileSync(source,'first');
  // The previous layout was a directory of versioned sets and their obsolete files.
  fs.mkdirSync(path.join(sharedResourcesRoot(),'1.0.0-old'),{recursive:true});fs.writeFileSync(path.join(sharedResourcesRoot(),'1.0.0-old/stale.md'),'stale');
  const first=ensurePackageResources(product);assert.equal(fs.existsSync(path.join(sharedResourcesRoot(),'1.0.0-old')),false);
  fs.writeFileSync(source,'second');const rename=fs.renameSync;
  const mocked=t.mock.method(fs,'renameSync',((from:any,to:any)=>{if(from===path.join(data,'.resources-next')&&to===sharedResourcesRoot())throw new Error('switch denied');return rename(from,to);}) as typeof fs.renameSync);
  assert.throws(()=>ensurePackageResources(product),/switch denied/);assert.equal(inspectSharedResources(first.id).id,first.id);assert.equal(fs.readFileSync(path.join(sharedResourcesRoot(),'skills/example/SKILL.md'),'utf8'),'first');mocked.mock.restore();
  // Process interruption after moving the old directory aside, before publication.
  fs.renameSync(sharedResourcesRoot(),path.join(data,'.resources-previous'));fs.mkdirSync(path.join(data,'.resources-next'));fs.writeFileSync(path.join(data,'.resources-next/partial'),'partial');
  const second=ensurePackageResources(product);assert.notEqual(second.id,first.id);assert.equal(fs.readFileSync(path.join(sharedResourcesRoot(),'skills/example/SKILL.md'),'utf8'),'second');assert.equal(fs.existsSync(path.join(data,'.resources-previous')),false);assert.equal(fs.existsSync(path.join(data,'.resources-next')),false);
  // Process interruption after publication, before backup cleanup.
  fs.mkdirSync(path.join(data,'.resources-previous'));fs.writeFileSync(path.join(data,'.resources-previous/stale'),'stale');ensurePackageResources(product);assert.equal(fs.existsSync(path.join(data,'.resources-previous')),false);
});

test('退出的Archify先完整保全，再替换共享目录；同源重用且不同源和损坏均保留现场', async t => {
  const { readPreservedArchify } = await import('../../src/infrastructure/product-resources/shared-resources.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-retired-skill-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const previous = process.env.BUILDR_PRODUCT_DATA_DIR;
  process.env.BUILDR_PRODUCT_DATA_DIR = path.join(root, 'data');
  t.after(() => { if (previous === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR; else process.env.BUILDR_PRODUCT_DATA_DIR = previous; });
  const product = path.join(root, 'product'), source = path.join(product, 'resources/workspace/skills/buildr/archify');
  const version = (value: string) => fs.writeFileSync(path.join(product, 'package.json'), JSON.stringify({ version: value }));
  fs.mkdirSync(path.join(source, 'bin'), { recursive: true }); version('1.0.0');
  fs.writeFileSync(path.join(source, 'SKILL.md'), '---\nname: archify\n---\n');
  fs.writeFileSync(path.join(source, 'bin/run.mjs'), 'original', { mode: 0o755 });
  const old = ensurePackageResources(product);
  const retired = `${source}-retired`; fs.renameSync(source, retired); fs.rmSync(retired, { recursive: true });
  ensurePackageResources(product);
  const preserved = readPreservedArchify();
  assert.equal(preserved.set.files.length, 2);
  assert.equal(fs.readFileSync(path.join(preserved.sourceRoot, 'bin/run.mjs'), 'utf8'), 'original');
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(preserved.sourceRoot, 'bin/run.mjs')).mode & 0o111, 0o111);
  assert.equal(fs.existsSync(path.join(preserved.sourceRoot, 'resource-set.json')), false);
  assert.equal(fs.existsSync(path.join(sharedResourcesRoot(), 'skills/buildr/archify')), false);
  // Another installation can report the same upstream bytes under a later Buildr version.
  const restoreOld = (modified: boolean) => {
    const set = structuredClone(old); set.version = '1.0.1';
    for (const entry of set.files) {
      const file = path.join(sharedResourcesRoot(), entry.path); fs.mkdirSync(path.dirname(file), { recursive: true });
      const bytes = fs.readFileSync(path.join(preserved.root, 'files', entry.path.slice('skills/buildr/archify/'.length)));
      fs.writeFileSync(file, modified && entry.path.endsWith('run.mjs') ? 'different' : bytes, { mode: entry.mode });
      entry.sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
    set.id = `${set.version}-${crypto.createHash('sha256').update(JSON.stringify(set.files)).digest('hex')}`;
    fs.writeFileSync(path.join(sharedResourcesRoot(), 'resource-set.json'), JSON.stringify(set));
    return set;
  };
  restoreOld(false); version('1.0.2'); ensurePackageResources(product);
  assert.equal(readPreservedArchify().set.id, preserved.set.id);
  const different = restoreOld(true);
  assert.throws(() => ensurePackageResources(product), /不同/);
  assert.equal(inspectSharedResources().id, different.id);
  assert.equal(fs.readFileSync(path.join(preserved.sourceRoot, 'bin/run.mjs'), 'utf8'), 'original');
  fs.rmSync(preserved.root, { recursive: true });
  const oldFile = path.join(sharedResourcesRoot(), 'skills/buildr/archify/bin/run.mjs');
  fs.writeFileSync(oldFile, 'damaged');
  assert.throws(() => ensurePackageResources(product), /变化/);
  assert.equal(fs.existsSync(oldFile), true); assert.equal(fs.existsSync(preserved.root), false);
  fs.unlinkSync(oldFile); fs.symlinkSync(path.join(product, 'package.json'), oldFile);
  assert.throws(() => ensurePackageResources(product), /symbolic/);
  assert.equal(fs.readFileSync(path.join(product, 'package.json'), 'utf8'), '{"version":"1.0.2"}');
});
