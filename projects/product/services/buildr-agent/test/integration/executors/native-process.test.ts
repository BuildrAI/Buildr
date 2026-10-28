import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, rename, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeRpc, bindingFingerprint, nativeBinding, isolatedEnvironment, opaqueReference, parseReference } from '../../../build/executors/native-process.js';
import { toolEnvironment } from '../../../build/executors/tool-environment.js';

test('native environment isolates credentials while retaining actual proxy settings', () => {
  const before = { PATH: '/bin', OPENAI_API_KEY: 'secret-a', CODEX_HOME: '/external', QODER_CONFIG_DIR: '/external-qoder', CODEX_APP_SERVER_TOKEN: 'secret-b', HTTPS_PROXY: 'http://127.0.0.1:1234', NODE_OPTIONS: '--require=/external', HOME: '/external-home' };
  assert.deepEqual(isolatedEnvironment(before, '/owned/home', '/owned/tmp', { CODEX_HOME: '/owned/codex' }), { PATH: '/bin', HTTPS_PROXY: before.HTTPS_PROXY, ...toolEnvironment(before), HOME: '/owned/home', USERPROFILE: '/owned/home', TMPDIR: '/owned/tmp', TMP: '/owned/tmp', TEMP: '/owned/tmp', CODEX_HOME: '/owned/codex' });
  assert.equal(before.CODEX_HOME, '/external');
});
test('browser discovery uses official host caches and preserves explicit hermetic or custom paths', () => {
  assert.deepEqual(toolEnvironment({ HOME: '/users/person' }, 'darwin'), { BUILDR_HOST_HOME: '/users/person', PLAYWRIGHT_BROWSERS_PATH: '/users/person/Library/Caches/ms-playwright' });
  assert.equal(toolEnvironment({ HOME: '/users/person' }, 'linux').PLAYWRIGHT_BROWSERS_PATH, '/users/person/.cache/ms-playwright');
  assert.equal(toolEnvironment({ HOME: '/users/person', XDG_CACHE_HOME: '/shared/cache' }, 'linux').PLAYWRIGHT_BROWSERS_PATH, '/shared/cache/ms-playwright');
  assert.equal(toolEnvironment({ HOME: '/users/person', XDG_CACHE_HOME: 'relative' }, 'linux').PLAYWRIGHT_BROWSERS_PATH, '/users/person/.cache/ms-playwright');
  assert.equal(toolEnvironment({ USERPROFILE: 'C:\\Users\\person', LOCALAPPDATA: 'D:\\Local' }, 'win32').PLAYWRIGHT_BROWSERS_PATH, 'D:\\Local\\ms-playwright');
  assert.equal(toolEnvironment({ USERPROFILE: 'C:\\Users\\person' }, 'win32').PLAYWRIGHT_BROWSERS_PATH, 'C:\\Users\\person\\AppData\\Local\\ms-playwright');
  for (const value of ['0', '/custom/browsers', './browsers']) assert.equal(toolEnvironment({ HOME: '/users/person', PLAYWRIGHT_BROWSERS_PATH: value }).PLAYWRIGHT_BROWSERS_PATH, value);
  assert.deepEqual(toolEnvironment({ HOME: 'relative', BUILDR_HOST_HOME: '/spoofed', OPENAI_API_KEY: 'secret' }), {});
});
test('three private provider processes can reuse a browser cache across restart without inheriting accounts', async () => {
  const { spawnSync } = await import('node:child_process');
  const { executorEnvironment } = await import('../../../build/application/executor-environment.js');
  const root = await mkdtemp(join(tmpdir(), 'buildr-tool-discovery-'));
  try {
    const host = join(root, 'host'), browsers = join(root, 'official-browsers'); await mkdir(host); await mkdir(browsers);
    await writeFile(join(browsers, 'installed'), 'browser');
    const source = executorEnvironment({ ...process.env, HOME: host, PLAYWRIGHT_BROWSERS_PATH: browsers, OPENAI_API_KEY: 'secret', DSH_TOKEN: 'secret', QODER_CONFIG_DIR: '/external', CODEX_APP_SERVER_TOKEN: 'secret' });
    for (const [key, name] of [['CODEX_HOME', 'codex'], ['DSH_HOME', 'dsh'], ['QODER_CONFIG_DIR', 'qoder']]) {
      const home = join(root, name!, 'home'), config = join(root, name!, 'config'); await mkdir(home, { recursive: true });
      for (let restart = 0; restart < 2; restart++) {
        const env = isolatedEnvironment(source, home, root, { [key!]: config });
        const run = spawnSync(process.execPath, ['-e', `const fs=require('node:fs');const e=process.env;console.log(JSON.stringify({home:e.HOME,host:e.BUILDR_HOST_HOME,cache:fs.readFileSync(e.PLAYWRIGHT_BROWSERS_PATH+'/installed','utf8'),config:e[${JSON.stringify(key)}],secret:!!(e.OPENAI_API_KEY||e.DSH_TOKEN||e.CODEX_APP_SERVER_TOKEN)}))`], { env, encoding: 'utf8' });
        assert.equal(run.status, 0, run.stderr);
        assert.deepEqual(JSON.parse(run.stdout), { home, host, cache: 'browser', config, secret: false });
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('native context binding rejects another provider, directory or configuration', () => {
  const ref = opaqueReference('codex', 'thread-1', '/work/a', 'binding-a');
  assert.equal(parseReference(ref, 'codex', '/work/a', 'binding-a').nativeSessionId, 'thread-1');
  for (const args of [['dsh', '/work/a', 'binding-a'], ['codex', '/work/b', 'binding-a'], ['codex', '/work/a', 'binding-b']]) assert.throws(() => parseReference(ref, ...args as [string, string, string]), /binding_mismatch/);
});
test('compatible binary replacement preserves each native binding, while other sources and configs cannot adopt it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-native-upgrade-'));
  try {
    for (const [provider, before, after] of [['codex','0.163.0-alpha.11.2','0.164.0-alpha.11.1'],['dsh','0.2.1-rc.2','0.3.0-rc.1'],['qoder','1.1.75','1.2.0']]) {
      const connection = join(root, provider); await mkdir(connection);
      const config = join(connection,'native-home'); await mkdir(config);
      const executable = join(root,`${provider}.js`); await writeFile(executable,'old program');
      const binding = await nativeBinding(provider!,executable,before!,config);
      const ref = opaqueReference(provider!,'native-session',root,binding.identity);
      const next = join(root,`${provider}.next`); await writeFile(next,'new compatible program'); await rename(next,executable);
      const updated = await nativeBinding(provider!,executable,after!,config,binding);
      assert.equal(updated.identity,binding.identity); assert.equal(updated.data.observedVersion,after);
      assert.equal(parseReference(ref,provider!,root,updated.identity).nativeSessionId,'native-session');
      assert.equal((await nativeBinding(provider!,executable,after!,config)).identity,binding.identity);
      const otherProgram=join(root,`${provider}-other.js`);await writeFile(otherProgram,'another program');
      await assert.rejects(nativeBinding(provider!,otherProgram,after!,config,binding),/binding_mismatch/);
      await rename(config,`${config}-old`);await mkdir(config);
      await assert.rejects(nativeBinding(provider!,executable,after!,config,binding),/binding_mismatch/);
      await assert.rejects(nativeBinding(provider!,executable,'9.9.9',config,binding),/version_unsupported/);
    }
  } finally { await rm(root,{recursive:true,force:true}); }
});
test('major admission preserves v2 fingerprints saved under the old minor-series policy', async () => {
  const root=await mkdtemp(join(tmpdir(),'buildr-native-v2-admission-'));
  try {
    for (const [provider,series,before,after] of [['codex','0.163','0.163.0','0.164.0-alpha.11.1'],['dsh','0.2','0.2.1-rc.2','0.3.0'],['qoder','1.1','1.1.75','1.2.0']]) {
      const executable=join(root,`${provider}.js`);await writeFile(executable,'program');
      const configRoot=join(root,provider!);await mkdir(configRoot);const config=await realpath(configRoot),info=await stat(config);
      // Construct the bytes persisted before this change, without the new policy.
      const provenance={format:'buildr-native-binding/v2',provider,executable:await realpath(executable),config,dev:info.dev,ino:info.ino,series};
      const identity=createHash('sha256').update(JSON.stringify(provenance)).digest('hex');
      const prior={identity,data:{...provenance,observedVersion:before}};
      const reference=opaqueReference(provider!,'existing-native-context',root,identity);
      const actual=await nativeBinding(provider!,executable,after!,configRoot,prior);
      assert.equal(actual.identity,identity);assert.equal(actual.data.series,series);
      assert.equal((await nativeBinding(provider!,executable,after!,configRoot)).identity,identity);
      assert.equal(parseReference(reference,provider!,root,actual.identity).nativeSessionId,'existing-native-context');
      await assert.rejects(nativeBinding(provider!,executable,after!,configRoot,{...prior,data:{...prior.data,series:'other'}}),/binding_mismatch/);
    }
  } finally {await rm(root,{recursive:true,force:true});}
});
test('pre-provenance bindings retain their native identity only at recorded legacy locations', async () => {
  const root=await mkdtemp(join(tmpdir(),'buildr-native-legacy-'));
  try {
    const config=join(root,'dsh-home');await mkdir(config);const executable=join(root,'dsh.js');await writeFile(executable,'rc.2');
    const identity=await bindingFingerprint('dsh',executable,'0.2.1-rc.2',config);
    await writeFile(executable,'rc.3 upgraded in place');
    await assert.rejects(nativeBinding('dsh',executable,'0.2.1-rc.3',config,{identity}),/binding_mismatch/);
    const adopted=await nativeBinding('dsh',executable,'0.2.1-rc.3',config,{identity,executable,configRoot:root});
    assert.equal(adopted.identity,identity);assert.equal(adopted.data.series,'0.2');
    await assert.rejects(nativeBinding('dsh',executable,'0.2.1-rc.3',config,{identity,executable,configRoot:config}),/binding_mismatch/);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('stdio RPC supports independent control, multibyte fragments and private errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-executor-rpc-'));
  const fixture = join(root, 'rpc.mjs');
  await writeFile(fixture, `import{createInterface}from'node:readline';const r=createInterface({input:process.stdin});r.on('line',l=>{let m=JSON.parse(l);if(m.method==='long')return;if(m.method==='error'){process.stdout.write(JSON.stringify({id:m.id,error:{message:'secret-token-should-not-escape'}})+'\\n');return;}const b=Buffer.from(JSON.stringify({id:m.id,result:'中文完整'})+'\\n');process.stdout.write(b.subarray(0,b.length-7));setTimeout(()=>process.stdout.write(b.subarray(b.length-7)),10);});`);
  const rpc = new NativeRpc(process.execPath, [fixture], { cwd: root, env: isolatedEnvironment(process.env, root, root) });
  try {
    const long = rpc.call('long', {}, 10000); long.catch(() => {});
    assert.equal(await rpc.call('control', {}, 1000), '中文完整');
    await assert.rejects(rpc.call('error'), error => !String(error).includes('secret-token'));
    await rpc.close(); await assert.rejects(long, /process_closed/);
  } finally { await rpc.close(); await rm(root, { recursive: true, force: true }); }
});

test('a private native directory cannot redirect into a shared profile', async () => {
  const { privateDirectories, nativePreview } = await import('../../../build/executors/native-process.js');
  const { mkdir, symlink, stat } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'buildr-executor-private-symlink-'));
  try {
    const shared = join(root, 'shared'); await mkdir(shared, { mode: 0o755 }); const link = join(root, 'codex-home'); await symlink(shared, link, 'dir');
    const before = (await stat(shared)).mode;
    await assert.rejects(privateDirectories(link), /agent_config_symlink_unsupported/); assert.equal((await stat(shared)).mode, before);
    assert.equal(nativePreview('short'), 'short'); assert.match(nativePreview('a'.repeat(16001)), /内容已截断/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('an explicit RPC rejection preserves a sanitized service cause for recovery classification', async () => {
  const root = await mkdtemp(join(tmpdir(), 'buildr-executor-rejection-'));
  const fixture = join(root, 'rpc.mjs');
  await writeFile(fixture, `import{createInterface}from'node:readline';createInterface({input:process.stdin}).on('line',l=>{let m=JSON.parse(l);process.stdout.write(JSON.stringify({id:m.id,error:{message:'Selected model is at capacity. Bearer private-credential opaque-env-secret https://private.invalid/request'}})+'\\n');});`);
  const rpc = new NativeRpc(process.execPath, [fixture], {cwd: root, env: isolatedEnvironment(process.env, root, root, {BUILDR_MODEL_GATEWAY_KEY:'opaque-env-secret'})});
  try {
    await assert.rejects(rpc.call('thread/resume'), (error: any) => {
      assert.equal(error.message, 'agent_native_request_failed');
      assert.match(error.diagnostic, /Selected model is at capacity/);
      assert.doesNotMatch(error.diagnostic, /private-credential|private.invalid|opaque-env-secret/);
      return true;
    });
  } finally { await rpc.close(); await rm(root, {recursive: true, force: true}); }
});
