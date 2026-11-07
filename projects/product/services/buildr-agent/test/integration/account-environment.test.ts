import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sharedToolchainEnvironment } from '../../src/storage/toolchain-environment.ts';
import { selectHostToolCaches } from '../../src/storage/toolchain-locations.ts';
import { accountEnvironment } from '../../src/executors/native-process.ts';

test('host HOME and unknown tools share the user environment while account roots stay private', () => {
  for (const key of ['CODEX_HOME', 'DSH_HOME', 'QODER_CONFIG_DIR']) {
    const environment = accountEnvironment({HOME:'/host',TMPDIR:'/host-tmp',PATH:'/host/bin',OPENAI_API_KEY:'secret',CODEX_HOME:'/default-account'}, '/private/home', '/private/tmp', {[key]:'/private/account'});
    assert.equal(environment.HOME, '/host');
    assert.equal(environment.USERPROFILE, '/host');
    assert.equal(environment.PATH, '/host/bin');
    assert.equal(environment[key], '/private/account');
    assert.equal(environment.OPENAI_API_KEY, undefined);
    if (key !== 'CODEX_HOME') assert.equal(environment.CODEX_HOME, undefined);
    assert.equal(environment.TMPDIR, '/host-tmp');
    assert.equal(environment.TMP, '/host-tmp');
    assert.equal(environment.TEMP, '/host-tmp');
  }
});

test('explicit host hint wins over an inherited isolated HOME; missing host stays private', () => {
  assert.equal(accountEnvironment({HOME:'/old-private',BUILDR_HOST_HOME:'/host'},'/private','/tmp',{CODEX_HOME:'/account'}).HOME,'/host');
  assert.equal(accountEnvironment({},'/private','/tmp',{CODEX_HOME:'/account'}).HOME,'/private');
  assert.equal(accountEnvironment({HOME:'relative'},'/private','/tmp',{CODEX_HOME:'/account'}).HOME,'/private');
});

test('legacy private cache variables cannot erase or replace selected host cache roots', t => {
  const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'account-cache-roots-')));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const root=path.join(base,'profile'),host=path.join(base,'host');fs.mkdirSync(root);fs.mkdirSync(path.join(host,'.npm'),{recursive:true});fs.mkdirSync(path.join(host,'.cache/node/corepack'),{recursive:true});
  const old=path.join(root,'toolchains/cache/npm');fs.mkdirSync(old,{recursive:true});
  let selected=selectHostToolCaches(root,{HOME:host});assert.equal(selected.npm,path.join(host,'.npm'));
  selected=selectHostToolCaches(root,{HOME:path.join(root,'connections/codex/home'),BUILDR_HOST_HOME:host,npm_config_cache:old});assert.equal(selected.npm,path.join(host,'.npm'));
  const fresh=path.join(base,'fresh-profile');fs.mkdirSync(fresh);const legacy=path.join(fresh,'toolchains/cache/corepack');fs.mkdirSync(legacy,{recursive:true});
  selected=selectHostToolCaches(fresh,{HOME:host,COREPACK_HOME:legacy});assert.equal(selected.corepack,path.join(host,'.cache/node/corepack'));
  const environment=sharedToolchainEnvironment(fresh,{HOME:path.join(fresh,'connections/codex/home'),BUILDR_HOST_HOME:host,NVM_DIR:legacy}).environment;assert.equal(environment.NVM_DIR,path.join(host,'.nvm'));assert.equal(fs.existsSync(path.join(host,'.nvm')),false);
});


test('host temporary fallback is explicit and does not change true isolated environments', async () => {
  const {isolatedEnvironment}=await import('../../src/executors/native-process.ts');
  assert.equal(accountEnvironment({HOME:'/host',TMPDIR:'relative',TEMP:'/standard-tmp'},'/private','/private/tmp',{}).TMPDIR,'/standard-tmp');
  assert.equal(accountEnvironment({HOME:'/host',TMPDIR:'relative'},'/private','/private/tmp',{}).TMPDIR,'/private/tmp');
  assert.equal(accountEnvironment({TMPDIR:'/host-tmp'},'/private','/private/tmp',{}).TMPDIR,'/private/tmp');
  assert.equal(isolatedEnvironment({HOME:'/host',TMPDIR:'/host-tmp'},'/private','/private/tmp').TMPDIR,'/private/tmp');
});


test('first use creates host standard caches and Maven repository without copying credentials', t=>{
 const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'first-host-cache-')));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const root=path.join(base,'profile'),host=path.join(base,'host');fs.mkdirSync(root);fs.mkdirSync(host);
 const one=sharedToolchainEnvironment(root,{BUILDR_HOST_HOME:host,HOME:path.join(root,'private')}).environment;
 assert.equal(one.npm_config_cache,path.join(host,'.npm'));assert.equal(one.BUILDR_MAVEN_REPOSITORY,path.join(host,'.m2/repository'));
 assert.ok(fs.statSync(one.BUILDR_MAVEN_REPOSITORY!).isDirectory());
 assert.equal(fs.existsSync(path.join(host,'.m2/settings.xml')),false);
 const before=fs.statSync(one.BUILDR_MAVEN_REPOSITORY!).ino;
 assert.equal(sharedToolchainEnvironment(root,{HOME:host}).environment.BUILDR_MAVEN_REPOSITORY,one.BUILDR_MAVEN_REPOSITORY);
 assert.equal(fs.statSync(one.BUILDR_MAVEN_REPOSITORY!).ino,before);
 const outside=path.join(base,'outside');fs.mkdirSync(outside);fs.rmSync(path.join(host,'.m2'),{recursive:true});fs.symlinkSync(outside,path.join(host,'.m2'));
 assert.equal(sharedToolchainEnvironment(root,{HOME:host}).environment.BUILDR_MAVEN_REPOSITORY,path.join(root,'toolchains/cache/maven'));
 assert.deepEqual(fs.readdirSync(outside),[]);
});


test('all native Agents use host compilation caches while account roots stay separate', t=>{
 const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'host-compile-cache-')));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const root=path.join(base,'profile'),host=path.join(base,'host');fs.mkdirSync(root);fs.mkdirSync(host);
 const cache=path.join(host,process.platform==='darwin'?'Library/Caches':'.cache');
 const shared=sharedToolchainEnvironment(root,{HOME:host,NODE_COMPILE_CACHE:path.join(root,'connections/dsh/cache/node-compile')});
 assert.equal(shared.environment.NODE_COMPILE_CACHE,path.join(cache,'node-compile'));assert.equal(shared.environment.PYTHONPYCACHEPREFIX,path.join(cache,'python'));
 for(const key of ['CODEX_HOME','DSH_HOME','QODER_CONFIG_DIR']){
  const env=accountEnvironment(shared.environment,path.join(root,key),path.join(root,'tmp'),{[key]:path.join(root,key)},shared.cacheRoot);
  assert.equal(env.NODE_COMPILE_CACHE,path.join(cache,'node-compile'));assert.equal(env[key],path.join(root,key));
 }
 const custom=path.join(host,'custom-compile');assert.equal(sharedToolchainEnvironment(root,{HOME:host,NODE_COMPILE_CACHE:custom}).environment.NODE_COMPILE_CACHE,custom);
 assert.equal(fs.existsSync(path.join(root,'connections/dsh/cache/node-compile')),false);
});
