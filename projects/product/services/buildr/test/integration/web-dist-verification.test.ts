import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildWebDist, resolveAdjacentNpmCli } from '../../tools/build/web-dist.ts';
import { describeWebDistTree, inspectLocalWebToolchain, verifyGeneratedWebDist } from '../verification/web-dist.ts';

function fixture(t: any): any  {
  const root: any = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-dist-test-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root };
}

function fakeBuild(target: any): any  {
  fs.mkdirSync(path.join(target, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(target, 'index.html'), '<main>Buildr</main>');
  fs.writeFileSync(path.join(target, 'assets/app.js'), 'console.log("buildr")');
  fs.writeFileSync(path.join(target, 'assets/app.css'), 'body{}');
}

test('staging web-dist生成闭合manifest并清理owned root', (t: any) => {
  const { root }: any = fixture(t);
  let stagingRoot: any;
  const result: any = verifyGeneratedWebDist({
    temporaryParent: root,
    build(target: any): any  {
      stagingRoot = target;
      fakeBuild(target);
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.fileCount, 3);
  assert.equal(result.manifest.artifacts[0].id, 'web-dist');
  assert.equal(fs.existsSync(path.dirname(stagingRoot)), false, 'owned staging root must be cleaned');
});

test('staging web-dist缺失资源时在Browser前失败并清理', (t: any) => {
  const { root }: any = fixture(t);
  let stagingRoot: any;
  assert.throws(() => verifyGeneratedWebDist({
    temporaryParent: root,
    build(target: any): any  {
      stagingRoot = target;
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, 'index.html'), '<main>missing assets</main>');
    },
  }), (error: any) => error.code === 'web_dist_inventory_invalid');
  assert.equal(fs.existsSync(path.dirname(stagingRoot)), false, 'failed staging root must be cleaned');
});

test('显式staging输出被保留且不读取陈旧本地dist', (t: any) => {
  const { root }: any = fixture(t);
  const stale: any = path.join(root, 'stale-local-dist');
  const output: any = path.join(root, 'explicit-staging');
  fs.mkdirSync(stale);
  fs.writeFileSync(path.join(stale, 'stale.js'), 'stale');
  const result: any = verifyGeneratedWebDist({ outputRoot: output, build: fakeBuild });
  assert.equal(result.root, output);
  assert.equal(describeWebDistTree(output).length, 3);
  assert.equal(fs.readFileSync(path.join(stale, 'stale.js'), 'utf8'), 'stale');
});

test('Browser build preflight只接受Buildr Web本地TypeScript和Vite', (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-toolchain-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });
  const missing: any = inspectLocalWebToolchain(root);
  assert.equal(missing.status, 'blocked');
  assert.deepEqual(missing.missing, ['typescript', 'vite']);
  for (const name of ['tsc', 'vite']) fs.writeFileSync(path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name), 'fixture');
  const ready: any = inspectLocalWebToolchain(root);
  assert.equal(ready.status, 'ready');
  assert.ok(ready.tools.typescript.startsWith(root));
  assert.ok(ready.tools.vite.startsWith(root));
});

test('web-dist在没有相邻npm时回落到PATH中的npm CLI', (t: any) => {
  const { root }: any = fixture(t);
  const bin = path.join(root, 'bin');
  const npmCli = path.join(bin, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  fs.mkdirSync(path.dirname(npmCli), { recursive: true });
  fs.writeFileSync(npmCli, 'fixture');
  fs.symlinkSync(npmCli, path.join(bin, 'npm'));
  const nodeExecutable = path.join(root, 'node');
  fs.writeFileSync(nodeExecutable, 'fixture');
  assert.equal(resolveAdjacentNpmCli(nodeExecutable, { PATH: bin }, 'darwin'), fs.realpathSync(npmCli));
});

test('Windows web-dist通过相邻npm CLI运行而不直接spawn npm.cmd', (t: any) => {
  const { root }: any = fixture(t);
  const nodeExecutable = path.join(root, 'node.exe');
  const npmCli = path.join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  fs.mkdirSync(path.dirname(npmCli), { recursive: true });
  fs.writeFileSync(nodeExecutable, 'fixture');
  fs.writeFileSync(npmCli, 'fixture');
  assert.equal(resolveAdjacentNpmCli(nodeExecutable, {}, 'win32'), npmCli);
});

function productionDist(target: string, hash: string, body = hash): void {
  fs.mkdirSync(path.join(target, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(target, 'index.html'), `<div id="root"></div><script type="module" src="/assets/app-${hash}.js"></script><link rel="stylesheet" href="/assets/app-${hash}.css">`);
  fs.writeFileSync(path.join(target, 'assets', `app-${hash}.js`), body);
  fs.writeFileSync(path.join(target, 'assets', `app-${hash}.css`), 'body{}');
}

function safeBuildFixture(t: any) {
  const { root } = fixture(t);
  const frontend = path.join(root, 'frontend');
  const target = path.join(root, 'live');
  fs.mkdirSync(path.join(frontend, 'node_modules', '.bin'), { recursive: true });
  for (const name of ['tsc', 'vite']) fs.writeFileSync(path.join(frontend, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name), 'fixture');
  productionDist(target, 'previous1');
  const original = describeWebDistTree(target);
  const build = (hash: string, options: Parameters<typeof buildWebDist>[2] = {}) => buildWebDist(target, frontend, {
    resolveNpm: () => '/fixture/npm-cli.js',
    execute(_executable, args) {
      assert.deepEqual(describeWebDistTree(target), original, 'live output remains unchanged during compilation');
      productionDist(args[args.length - 1], hash);
      return { status: 0 };
    },
    ...options,
  });
  return { root, frontend, target, original, build };
}

test('safe Web build preserves the live tree throughout compilation and retains previous hashes', t => {
  const { target, build } = safeBuildFixture(t);
  assert.equal(build('current12'), target);
  assert.ok(fs.readFileSync(path.join(target, 'index.html'), 'utf8').includes('current12'));
  assert.equal(fs.readFileSync(path.join(target, 'assets/app-previous1.js'), 'utf8'), 'previous1');
  assert.equal(fs.readFileSync(path.join(target, 'assets/app-current12.js'), 'utf8'), 'current12');
});

test('missing toolchain and npm leave the previous Web output byte-identical', t => {
  const { frontend, target, original, build } = safeBuildFixture(t);
  assert.throws(() => build('current12', { resolveNpm: () => { throw new Error('npm unavailable'); } }), /npm unavailable/);
  fs.unlinkSync(path.join(frontend, 'node_modules/.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite'));
  assert.throws(() => build('current12'), (error: any) => error.code === 'web_dist_local_toolchain_missing');
  assert.deepEqual(describeWebDistTree(target), original);
});

test('failed and partial Web compilations do not delete the old page or leave owned staging', t => {
  const { root, target, original, build } = safeBuildFixture(t);
  assert.throws(() => build('current12', { execute: () => ({ status: 2, stderr: 'typescript failed' }) }), /typescript failed/);
  assert.throws(() => build('current12', { execute(_executable, args) {
    const candidate = args[args.length - 1];
    fs.mkdirSync(candidate); fs.writeFileSync(path.join(candidate, 'index.html'), '<div id="root"></div>');
    return { status: 0 };
  } }), (error: any) => error.code === 'web_dist_inventory_invalid');
  assert.deepEqual(describeWebDistTree(target), original);
  assert.deepEqual(fs.readdirSync(root).sort(), ['frontend', 'live']);
});

test('missing referenced resources and symlink artifacts cannot replace the live dist', t => {
  const { target, original, build } = safeBuildFixture(t);
  for (const corrupt of ['missing', 'symlink']) {
    assert.throws(() => build('current12', { execute(_executable, args) {
      const candidate = args[args.length - 1]; productionDist(candidate, 'current12');
      if (corrupt === 'missing') fs.unlinkSync(path.join(candidate, 'assets/app-current12.js'));
      else fs.symlinkSync(path.join(target, 'index.html'), path.join(candidate, 'foreign.html'));
      return { status: 0 };
    } }));
    assert.deepEqual(describeWebDistTree(target), original);
  }
});

test('failed publication restores the original tree before returning an error', t => {
  const { root, target, original, build } = safeBuildFixture(t);
  assert.throws(() => build('current12', { rename(source, destination) {
    if (path.basename(source) === 'candidate') throw new Error('publish denied');
    fs.renameSync(source, destination);
  } }), (error: any) => error.code === 'web_dist_publish_failed');
  assert.deepEqual(describeWebDistTree(target), original);
  assert.deepEqual(fs.readdirSync(root).sort(), ['frontend', 'live']);
});

test('failed restoration preserves the unique recoverable backup and reports its path', t => {
  const { target, original, build } = safeBuildFixture(t);
  let backup: string | undefined;
  assert.throws(() => build('current12', { rename(source, destination) {
    if (source === target) return fs.renameSync(source, destination);
    throw new Error('rename denied');
  } }), (error: any) => {
    assert.equal(error.code, 'web_dist_restore_failed');
    backup = error.details.backupRoot;
    assert.deepEqual(describeWebDistTree(backup), original);
    return true;
  });
  assert.ok(backup && fs.existsSync(backup));
  assert.equal(fs.existsSync(target), false);
});

test('retained hashes are bounded to the previous native generation and never overwrite current assets', t => {
  const { target, frontend, build } = safeBuildFixture(t);
  build('current12');
  const next = (hash: string, body = hash) => buildWebDist(target, frontend, { resolveNpm: () => '/fixture/npm-cli.js',
    execute(_executable, args) { productionDist(args[args.length - 1], hash, body); return { status: 0 }; } });
  next('nextgen12');
  assert.equal(fs.existsSync(path.join(target, 'assets/app-previous1.js')), false);
  assert.equal(fs.existsSync(path.join(target, 'assets/app-current12.js')), true);
  next('nextgen12', 'new bytes win');
  assert.equal(fs.readFileSync(path.join(target, 'assets/app-nextgen12.js'), 'utf8'), 'new bytes win');
  assert.equal(fs.existsSync(path.join(target, 'assets/app-current12.js')), false);
});

test('verbose successful compiler output is not a maxBuffer failure and staging logs are cleaned', t => {
  const { root, frontend, target } = safeBuildFixture(t);
  const npm = path.join(root, 'npm-cli.cjs');
  fs.writeFileSync(npm, `const fs=require('node:fs'),path=require('node:path');
    const output=process.argv.at(-1); fs.mkdirSync(path.join(output,'assets'),{recursive:true});
    fs.writeFileSync(path.join(output,'index.html'),'<div id="root"></div><script type="module" src="/assets/app-verbose12.js"></script><link rel="stylesheet" href="/assets/app-verbose12.css">');
    fs.writeFileSync(path.join(output,'assets/app-verbose12.js'),'export{}');
    fs.writeFileSync(path.join(output,'assets/app-verbose12.css'),'body{}');
    process.stdout.write('x'.repeat(3*1024*1024));process.stderr.write('y'.repeat(2*1024*1024));`);
  assert.equal(buildWebDist(target, frontend, { resolveNpm: () => npm }), target);
  assert.equal(fs.existsSync(path.join(target, 'assets/app-verbose12.js')), true);
  assert.equal(fs.readdirSync(root).some(name => name.startsWith('.buildr-web-dist-')), false);
});

test('compiler signals remain real failures without deleting the previous output', t => {
  const { target, original, build } = safeBuildFixture(t);
  assert.throws(() => build('current12', { execute: () => ({ status: null, signal: 'SIGTERM' }) }), (error: any) => {
    assert.equal(error.code, 'web_dist_build_failed'); assert.equal(error.details.signal, 'SIGTERM'); return true;
  });
  assert.deepEqual(describeWebDistTree(target), original);
});

test('output symlinks and source directories are never treated as disposable generated output', t => {
  const { root, frontend, target, build } = safeBuildFixture(t);
  const alias = path.join(root, 'alias'); fs.symlinkSync(target, alias);
  assert.throws(() => buildWebDist(frontend, frontend), /source directory/);
  const mustNotBuild = () => { throw new Error('compiler must not start for a source output'); };
  for (const source of [path.join(frontend, 'src'), path.resolve(import.meta.dirname, '../../src')]) {
    assert.throws(() => buildWebDist(source, frontend, { resolveNpm: () => '/fixture/npm-cli.js', execute: mustNotBuild }), /source directory/);
  }
  const parentAlias = path.join(root, 'parent-alias'); fs.symlinkSync(root, parentAlias);
  assert.throws(() => buildWebDist(path.join(parentAlias, 'frontend'), frontend), /source directory/);
  assert.throws(() => buildWebDist(alias, frontend, { resolveNpm: () => '/fixture/npm-cli.js',
    execute(_executable, args) { productionDist(args[args.length - 1], 'current12'); return { status: 0 }; }
  }), /real directory/);
  assert.ok(fs.readFileSync(path.join(target, 'index.html'), 'utf8').includes('previous1'));
});

test('网页准备复用完整输入和输出字节，损坏或源码变化必须重建',t=>{
  const {root}=fixture(t),cacheRoot=path.join(root,'cache'),source=path.join(root,'source.ts');fs.writeFileSync(source,'first');let builds=0;
  const build=(target:string)=>{builds++;fakeBuild(target);};
  const prepare=(name:string,env:any={})=>verifyGeneratedWebDist({outputRoot:path.join(root,name),cacheRoot,inputPaths:[source],optionalPaths:[],build,env});
  const cold=prepare('cold'),warm=prepare('warm');assert.equal(builds,1);assert.equal(cold.preparation.status,'rebuilt');assert.equal(warm.preparation.status,'reused');
  assert.deepEqual(describeWebDistTree(cold.root),describeWebDistTree(warm.root));
  assert.equal(prepare('npm-cache-change',{npm_config_cache:'/different-owned-cache'}).preparation.status,'reused');assert.equal(builds,1);
  fs.writeFileSync(path.join(cacheRoot,'dist/assets/app.js'),'corrupt');assert.equal(prepare('corrupt').preparation.status,'rebuilt');assert.equal(builds,2);
  fs.writeFileSync(source,'changed');assert.equal(prepare('source-change').preparation.status,'rebuilt');assert.equal(builds,3);
  assert.equal(prepare('env-change',{VITE_FIXTURE:'different'}).preparation.status,'rebuilt');assert.equal(builds,4);
  fs.writeFileSync(path.join(cacheRoot,'verification-web-dist.json'),'{broken');assert.equal(prepare('receipt-change').preparation.status,'rebuilt');assert.equal(builds,5);
});

test('准备缓存不能接管符号链接，输入在构建中改变不能生成通过证据',t=>{
  const {root}=fixture(t),source=path.join(root,'source.ts'),cache=path.join(root,'cache');fs.writeFileSync(source,'first');
  fs.mkdirSync(cache);const alias=path.join(root,'alias');fs.symlinkSync(cache,alias);
  assert.throws(()=>verifyGeneratedWebDist({outputRoot:path.join(root,'output'),cacheRoot:alias,inputPaths:[source],optionalPaths:[],build:fakeBuild}),/cache_root/);
  assert.throws(()=>verifyGeneratedWebDist({outputRoot:path.join(root,'changed'),cacheRoot:cache,inputPaths:[source],optionalPaths:[],build:(target:string)=>{fakeBuild(target);fs.writeFileSync(source,'changed');}}),/inputs_changed/);
});

test('unknown npm options remain conservative cache inputs while download cache paths do not',t=>{
  const {root}=fixture(t),source=path.join(root,'source.ts');fs.writeFileSync(source,'first');let builds=0;
  const run=(name:string,env:any)=>verifyGeneratedWebDist({outputRoot:path.join(root,name),cacheRoot:path.join(root,'cache'),inputPaths:[source],optionalPaths:[],env,build:(target:string)=>{builds++;fakeBuild(target);}});
  run('first',{});assert.equal(run('workspace',{npm_config_workspace:'another'}).preparation.status,'rebuilt');
  assert.equal(run('same',{npm_config_workspace:'another',npm_config_cache:'/another-cache'}).preparation.status,'reused');assert.equal(builds,2);
});
