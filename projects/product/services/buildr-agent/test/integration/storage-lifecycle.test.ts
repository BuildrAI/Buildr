import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { createNativeExecutors } from '../../src/executors/index.ts';
import { ExecutorStorage, executorCacheCandidates } from '../../src/application/executor-storage.ts';
import { isolatedEnvironment } from '../../src/executors/native-process.ts';
import { observeStorageUse, removeStorageCandidate, storageCandidate } from '../../src/storage/files.ts';
import { prepareAgentRuntime } from '../../src/process/runtime-unit.ts';
import { retainedRuntimeCandidates } from '../../src/process/cleanup.ts';
import { claim, controlRoot, writePrivate } from '../../src/process/ownership.ts';
import { AGENT_EXECUTION_CONTRACTS } from '../../src/execution-contracts.ts';
import { inspectAgentStorage, collectAgentStorage } from '../../src/application/storage-maintenance.ts';
import type { AgentRuntime } from '../../src/contracts.ts';

const unused = { complete: true, paths: [] };
const day = 24 * 60 * 60_000;
function fixture(t: test.TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-storage-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root;
}
function file(name: string, contents = 'data') { fs.mkdirSync(path.dirname(name), { recursive: true }); fs.writeFileSync(name, contents); }
function cleanPluginCheckout(directory: string) {
  for (const args of [['init', '-q'], ['remote', 'add', 'origin', 'https://github.com/openai/plugins.git'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture']]) execFileSync('git', ['-C', directory, ...args], {stdio:'pipe'});
}
function age(root: string, timestamp = Date.now() - 3 * day) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const name = path.join(root, entry.name); if (entry.isDirectory()) age(name, timestamp); else fs.utimesSync(name, timestamp / 1000, timestamp / 1000);
  }
  fs.utimesSync(root, timestamp / 1000, timestamp / 1000);
}

test('all native executors reuse only their connection download cache while native homes and gateway contexts stay private', t => {
  const root = path.join(fixture(t), 'agent-service'); fs.mkdirSync(root);
  const storage = new ExecutorStorage(root), executors = createNativeExecutors();
  const caches = new Set<string>();
  for (const executor of executors) {
    const connectionId = executor.descriptor.id;
    const first = storage.options(executor, { connectionId, configRoot: path.join(root, 'connections', connectionId, 'one'), environment: {} });
    const second = storage.options(executor, { connectionId, configRoot: path.join(root, 'connections', connectionId, 'two'), environment: {} });
    assert.equal(first.cacheRoot, second.cacheRoot);
    const env = isolatedEnvironment({}, first.configRoot, path.join(first.configRoot, 'tmp'), {}, first.cacheRoot);
    const peer = isolatedEnvironment({}, second.configRoot, path.join(second.configRoot, 'tmp'), {}, second.cacheRoot);
    assert.equal(env.npm_config_cache, peer.npm_config_cache);
    assert.notEqual(env.HOME, peer.HOME); assert.notEqual(env.TMPDIR, peer.TMPDIR);
    assert.equal(env.CODEX_HOME, undefined); assert.equal(env.DSH_HOME, undefined);
    caches.add(first.cacheRoot!);
  }
  assert.equal(caches.size, executors.length, 'no cross-executor cache directory');
  const external = path.join(path.dirname(root), 'external'); fs.mkdirSync(external);
  fs.rmSync(path.join(root, 'connections/codex/cache'), { recursive: true });
  fs.symlinkSync(external, path.join(root, 'connections/codex/cache'));
  assert.equal(storage.options(executors.find(x => x.descriptor.id === 'codex')!, { connectionId: 'codex', configRoot: root, environment: {} }).cacheRoot, undefined, 'unsafe optional cache falls back to the private native environment');
  assert.deepEqual(fs.readdirSync(external), [], 'unsafe parents never receive new cache files');
});

test('adapter-declared cache cleanup preserves accounts and sessions, and rejects plan drift, active and unknown resources', t => {
  const root = path.join(fixture(t), 'agent-service'), config = path.join(root, 'connections/codex/model-bindings', 'a'.repeat(64));
  const cache = path.join(config, 'codex-home/.tmp/plugins'); file(path.join(cache, 'plugin.js')); cleanPluginCheckout(cache);
  const session = path.join(config, 'codex-home/sessions/transcript.jsonl'), account = path.join(config, 'codex-home/auth.json');
  file(session, 'history'); file(account, 'private-test-credential');
  const executor = createNativeExecutors().find(x => x.descriptor.id === 'codex')!;
  execFileSync('git',['-C',cache,'remote','remove','origin']);
  const pinned=execFileSync('git',['-C',cache,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  file(path.join(cache,'.git/FETCH_HEAD'),pinned+"\t\t'"+pinned+"' of https://github.com/openai/plugins\n");
  assert.equal(executorCacheCandidates(root,executor,config,unused,Infinity)[0]?.eligible,true,'Codex pinned init/fetch checkout has exact public source provenance');
  execFileSync('git',['-C',cache,'config','http.extraheader','Authorization: fixture-private-header']);
  assert.equal(executorCacheCandidates(root,executor,config,unused,Infinity)[0]?.reason,'cache_contents_retained','credential-bearing Git config never becomes a shared seed');
  execFileSync('git',['-C',cache,'config','--unset','http.extraheader']);
  const [initial] = executorCacheCandidates(root, executor, config, unused, Infinity);
  assert.ok(initial?.eligible);
  file(path.join(cache, 'new-plugin.js'));
  assert.equal(executorCacheCandidates(root, executor, config, unused, Infinity)[0]?.reason, 'cache_contents_retained');
  assert.equal(removeStorageCandidate(root, initial!, () => unused), false, 'changed preview is not applied');
  fs.unlinkSync(path.join(cache, 'new-plugin.js'));
  const configuration = path.join(config, 'codex-home/config.toml');
  file(configuration, '[plugins.local]\nenabled = true\n');
  assert.equal(executorCacheCandidates(root, executor, config, unused, Infinity)[0]?.reason, 'cache_contents_retained');
  fs.unlinkSync(configuration);
  const current = storageCandidate(root, 'cache', cache, config, unused, Infinity);
  assert.equal(removeStorageCandidate(root, current, () => ({ complete: false, paths: [] })), false);
  assert.equal(removeStorageCandidate(root, current, () => ({ complete: true, paths: [session] })), false, 'active environment protects its cache');
  assert.equal(removeStorageCandidate(root, current, () => unused), true);
  assert.equal(fs.readFileSync(session, 'utf8'), 'history'); assert.equal(fs.readFileSync(account, 'utf8'), 'private-test-credential');
  fs.symlinkSync(path.dirname(root), cache);
  assert.equal(storageCandidate(root, 'cache', cache, config, unused, Infinity).eligible, false);
});

test('runtime inventory handles crashed and orphaned immutable copies while retaining current, pending, rollback, changed and opened versions', t => {
  const root = fixture(t), dataRoot = path.join(root, 'profile'), pkg = path.join(root, 'package');
  file(path.join(pkg, 'package.json'), '{"type":"module"}');
  file(path.join(pkg, 'build/runtime-contracts.json'), JSON.stringify({ contracts: AGENT_EXECUTION_CONTRACTS, storageVersion: 1 }));
  const node = path.join(root, 'fixture-node'); file(node, 'immutable-runtime-node');
  const versions = Array.from({ length: 7 }, (_, i) => {
    file(path.join(pkg, 'build/entry.js'), `export const version = ${i};`);
    const runtime = prepareAgentRuntime({ dataRoot, packageRoot: pkg, entry: 'build/entry.js', node });
    age(runtime.directory, Date.now() - (10 - i) * day); return runtime;
  });
  const [crashed, orphan, changed, opened, pending, rollback, current] = versions;
  const generation = randomUUID();
  writePrivate(path.join(controlRoot(dataRoot), 'instances', generation + '.json'), { identity: { dataRoot, generation, pid: 2147483647, runtime: crashed }, origin: 'http://127.0.0.1:1', token: 'fixture' });
  writePrivate(path.join(controlRoot(dataRoot), 'pending.json'), { runtime: pending });
  file(path.join(changed!.directory, 'user-work'), 'must keep'); age(changed!.directory);
  const items = retainedRuntimeCandidates(dataRoot, { complete: true, paths: [opened!.node] }, current);
  const eligible = items.filter(item => item.eligible).map(item => item.path);
  assert.ok(eligible.includes(crashed!.directory)); assert.ok(eligible.includes(orphan!.directory));
  for (const runtime of [changed, opened, pending, rollback, current]) assert.ok(!eligible.includes(runtime!.directory));
  assert.equal(retainedRuntimeCandidates(dataRoot, { complete: false, paths: [] }, current).some(x => x.eligible), false);
  file(path.join(pkg, 'build/entry.js'), 'export const version = 8;');
  const recent = prepareAgentRuntime({ dataRoot, packageRoot: pkg, entry: 'build/entry.js', node });
  const stoppedGeneration = randomUUID();
  writePrivate(path.join(controlRoot(dataRoot), 'instances', stoppedGeneration + '.json'), { identity: { dataRoot, generation: stoppedGeneration, pid: 2147483647, runtime: recent }, stopped:true, confirmed:true, origin:'http://127.0.0.1:1', token:'fixture' });
  assert.equal(retainedRuntimeCandidates(dataRoot, unused, current).find(x => x.path === recent.directory)?.eligible, false);
  assert.equal(retainedRuntimeCandidates(dataRoot, unused, current, Date.now(), true).find(x => x.path === recent.directory)?.eligible, true, 'normal confirmed shutdown still reaps immediately');
  file(path.join(pkg, 'build/entry.js'), 'export const version = 6;');
  const lock = claim(dataRoot, 'storage');
  try { assert.throws(() => prepareAgentRuntime({ dataRoot, packageRoot: pkg, entry: 'build/entry.js', node })); }
  finally { lock.release(); }
  prepareAgentRuntime({ dataRoot, packageRoot: pkg, entry: 'build/entry.js', node });
  assert.ok(fs.statSync(current!.directory).mtimeMs > Date.now() - day, 'reuse refreshes retention without changing content identity');
});

test('real system observation protects files held by another process', { skip: process.platform !== 'darwin' }, async t => {
  const root = fixture(t), cache = path.join(root, 'cache'), held = path.join(cache, 'plugin.js'); file(held);
  const child = spawn(process.execPath, ['-e', "require('fs').openSync(process.argv[1],'r');process.stdout.write('ready');setInterval(()=>{},1000)", held], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill();await exited;} });
  await once(child.stdout!, 'data');
  const use = observeStorageUse(); assert.ok(use.complete);
  assert.equal(storageCandidate(root, 'cache', cache, cache, use, Infinity).reason, 'storage_in_use');
  const preview = storageCandidate(root, 'cache', cache, cache, unused, Infinity);
  assert.equal(removeStorageCandidate(root, preview), false); assert.ok(fs.existsSync(held));
  const exited=once(child,'exit');child.kill();await exited;
  assert.equal(removeStorageCandidate(root, storageCandidate(root,'cache',cache,cache,observeStorageUse(),Infinity)),true,
    'after the exact holder exits, fresh system evidence permits collection');
  assert.equal(fs.existsSync(cache),false);
});

test('closed-runtime maintenance requires native release proof and keeps session state', { skip: process.platform !== 'darwin' }, async t => {
  const root = path.join(fixture(t), 'agent-service'), config = path.join(root, 'connections/codex/model-bindings', 'b'.repeat(64));
  const cache = path.join(config, 'codex-home/.tmp/plugins'); file(path.join(cache, 'plugin')); cleanPluginCheckout(cache);
  const session = path.join(config, 'codex-home/sessions/keep'); file(session, 'original session');
  const executor = createNativeExecutors().find(x => x.descriptor.id === 'codex')!, storage = new ExecutorStorage(root);
  let released = false;
  const runtime = { closed: true, canReclaimStorage: async () => released } as AgentRuntime;
  storage.opened(runtime, executor, config);
  await storage.released(runtime); assert.ok(fs.existsSync(cache));
  released = true; await storage.released(runtime); assert.equal(fs.existsSync(cache), false);
  assert.equal(fs.readFileSync(session, 'utf8'), 'original session');
  const seed = path.join(root, 'connections/codex/cache/curated-plugins'); assert.ok(fs.existsSync(path.join(seed, 'plugin')));
  const nextRoot = path.join(root, 'connections/codex/model-bindings', 'd'.repeat(64));
  storage.options(executor, {connectionId:'codex',configRoot:nextRoot,environment:{}});
  const privatePlugin = path.join(nextRoot, 'codex-home/.tmp/plugins/plugin');
  assert.equal(fs.readFileSync(privatePlugin, 'utf8'), 'data');
  assert.notEqual(fs.statSync(privatePlugin).ino, fs.statSync(path.join(seed, 'plugin')).ino, 'private working copy, not a hard link');
  fs.writeFileSync(privatePlugin, 'context-local edit');
  assert.equal(fs.readFileSync(path.join(seed, 'plugin'), 'utf8'), 'data', 'copy-on-write cannot mutate the seed');
  storage.opened(runtime, executor, nextRoot); await storage.released(runtime);
  assert.equal(fs.readFileSync(privatePlugin, 'utf8'), 'context-local edit', 'dirty private checkout is preserved');
});

test('public maintenance re-inventories previews and cannot apply a forged credential path', { skip: process.platform !== 'darwin' }, t => {
  const dataRoot = fixture(t), config = path.join(dataRoot, 'agent-service/connections/codex/model-bindings', 'c'.repeat(64));
  const cache = path.join(config, 'home/.npm/_cacache'), plugins = path.join(config, 'codex-home/.tmp/plugins');
  file(path.join(cache, 'package')); file(path.join(plugins, 'plugin')); cleanPluginCheckout(plugins);
  const account = path.join(config, 'codex-home/auth.json'); file(account, 'credential'); age(config);
  const plan = inspectAgentStorage({ dataRoot }); assert.equal(plan.items.filter(x => x.eligible).length, 2);
  file(path.join(plugins, 'new-plugin'));
  plan.items.push({ kind: 'cache', path: path.dirname(account), ownerRoot: config, sizeBytes: 1, identity: 'forged', eligible: true, reason: 'forged' });
  const result = collectAgentStorage(plan);
  assert.equal(result.results.find(x => x.path === cache)?.status, 'removed');
  assert.equal(result.results.find(x => x.path === plugins)?.status, 'retained');
  assert.ok(fs.existsSync(plugins)); assert.equal(fs.readFileSync(account, 'utf8'), 'credential');
});

test('runtime preparation waits for another process short storage collection', async t => {
  const root=fixture(t),dataRoot=path.join(root,'profile'),pkg=path.join(root,'package'),node=path.join(root,'node');
  file(path.join(pkg,'package.json'),'{"type":"module"}');file(path.join(pkg,'build/entry.js'),'export {};');
  file(path.join(pkg,'build/runtime-contracts.json'),JSON.stringify({contracts:AGENT_EXECUTION_CONTRACTS,storageVersion:1}));file(node,'fixture-node');
  const source=new URL('../../src/process/ownership.ts',import.meta.url).href;
  const child=spawn(process.execPath,['--input-type=module','-e',`import {claim} from ${JSON.stringify(source)};const lock=claim(process.argv[1],'storage');process.stdout.write('ready');setTimeout(()=>lock.release(),150);`,dataRoot],{stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}});
  await once(child.stdout!,'data');
  assert.doesNotThrow(()=>prepareAgentRuntime({dataRoot,packageRoot:pkg,entry:'build/entry.js',node}));
});
