import assert from 'node:assert/strict';
import { ConversationRepository } from '../../src/persistence/conversation-repository.ts';
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
import { retainedRuntimeCandidates, runtimeUnreferenced, retireRuntimeRecords } from '../../src/process/cleanup.ts';
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

test('all native and future executors share one tool cache while native homes and gateway contexts stay private', t => {
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
    assert.equal(env.NODE_COMPILE_CACHE, path.join(first.cacheRoot!, 'node-compile'));
    assert.equal(env.NODE_COMPILE_CACHE, peer.NODE_COMPILE_CACHE);
    assert.notEqual(env.HOME, peer.HOME); assert.notEqual(env.TMPDIR, peer.TMPDIR);
    assert.equal(env.CODEX_HOME, undefined); assert.equal(env.DSH_HOME, undefined);
    caches.add(first.cacheRoot!);
  }
  assert.equal(caches.size, 1, 'one cache across all providers');
  const future = { descriptor: { ...executors[0]!.descriptor, id: 'future-agent' }, open: executors[0]!.open };
  assert.equal(storage.options(future, { connectionId: 'future-agent', configRoot: path.join(root, 'connections/future-agent'), environment: {} }).cacheRoot, [...caches][0], 'new providers do not opt in to sharing');
  const external = path.join(path.dirname(root), 'external'); fs.mkdirSync(external);
  fs.rmSync(path.join(root, 'connections/codex/cache'), { recursive: true });
  fs.symlinkSync(external, path.join(root, 'connections/codex/cache'));
  assert.equal(storage.options(executors.find(x => x.descriptor.id === 'codex')!, { connectionId: 'codex', configRoot: root, environment: {} }).cacheRoot, path.join(root, 'toolchains/cache'), 'unsafe legacy cache does not change the verified shared root');
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

test('compile caches are declared narrowly and shared-cache removal respects every private consumer', t => {
  const root = path.join(fixture(t), 'agent-service');
  for (const executor of createNativeExecutors()) {
    const connection = path.join(root, 'connections', executor.descriptor.id);
    const config = path.join(connection, 'model-bindings', 'b'.repeat(64));
    const legacy = path.join(config, 'tmp/node-compile-cache'), shared = path.join(connection, 'cache/node-compile');
    const session = path.join(config, 'private-session'), account = path.join(config, 'private-account');
    file(path.join(legacy, 'v24-cache/cache-entry')); file(path.join(shared, 'v24-cache/cache-entry'));
    file(session, 'session'); file(account, 'account'); age(connection);
    const candidate = executorCacheCandidates(root, executor, config, unused, Infinity).find(item => item.path === legacy)!;
    assert.ok(candidate.eligible);
    file(path.join(legacy, 'new-entry'));
    assert.equal(removeStorageCandidate(root, candidate, () => unused), false);
    const sharedCandidate = executorCacheCandidates(root, executor, connection, unused, Infinity).find(item => item.path === shared)!;
    assert.ok(sharedCandidate.eligible);
    assert.equal(removeStorageCandidate(root, sharedCandidate, () => ({ complete: true, paths: [session] })), false);
    assert.equal(removeStorageCandidate(root, sharedCandidate, () => ({ complete: false, paths: [] })), false);
    assert.equal(removeStorageCandidate(root, sharedCandidate, () => unused), true);
    assert.equal(fs.readFileSync(session, 'utf8'), 'session'); assert.equal(fs.readFileSync(account, 'utf8'), 'account');
    assert.ok(fs.existsSync(legacy), 'changed private cache was retained');
  }
});

test('runtime inventory handles crashed and orphaned immutable copies while retaining current, pending, rollback, changed and opened versions', t => {
  const root = fixture(t), dataRoot = path.join(root, 'profile'), pkg = path.join(root, 'package');
  file(path.join(pkg, 'package.json'), '{"type":"module"}');
  file(path.join(pkg, 'build/runtime-contracts.json'), JSON.stringify({ contracts: AGENT_EXECUTION_CONTRACTS, storageVersion: 1 }));
  const node = path.join(root, 'fixture-node'); file(node, 'immutable-runtime-node'); fs.chmodSync(node, 0o700);
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
  let progressed = false; const timer = setTimeout(() => { progressed = true; }, 20);
  released = true; await storage.released(runtime); clearTimeout(timer);
  assert.equal(progressed, true, 'release scans and process observation leave the caller event loop available');
  assert.equal(fs.existsSync(cache), false);
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
  const cache = path.join(config, 'cache/node-compile'), plugins = path.join(config, 'codex-home/.tmp/plugins');
  file(path.join(cache, 'package')); file(path.join(plugins, 'plugin')); cleanPluginCheckout(plugins);
  const account = path.join(config, 'codex-home/auth.json'); file(account, 'credential'); age(config);
  const executor=createNativeExecutors()[0]!;new ConversationRepository(path.join(dataRoot,'agent-service')).saveConnection({view:{id:'codex',provider:'codex',label:'fixture',revision:'one',enabled:false,status:'disconnected',models:[],capabilities:executor.descriptor.capabilities}} as any);
  const plan = inspectAgentStorage({ dataRoot }); assert.equal(plan.items.filter(x => x.eligible).length, 2);
  file(path.join(plugins, 'new-plugin'));
  plan.items.push({ kind: 'cache', path: path.dirname(account), ownerRoot: config, sizeBytes: 1, identity: 'forged', eligible: true, reason: 'forged' });
  const result = collectAgentStorage(plan);
  assert.equal(result.results.find(x => x.path === cache)?.status, 'removed');
  assert.equal(result.results.find(x => x.path === plugins)?.status, 'retained');
  assert.ok(fs.existsSync(plugins)); assert.equal(fs.readFileSync(account, 'utf8'), 'credential');
});

test('maintenance reclaims unbound program packages and keeps bound or upgrading ones', { skip: process.platform !== 'darwin' }, t => {
  const dataRoot = fixture(t), root = path.join(dataRoot, 'agent-service');
  const old = path.join(root, 'programs/qoder/package-1.0.58-darwin-arm64');
  const bound = path.join(root, 'programs/qoder/package-1.0.59-darwin-arm64');
  const staging = path.join(root, 'programs/dsh/.prepare-crashed');
  for (const directory of [old, bound, staging]) { file(path.join(directory, 'node_modules/index.js'), 'module'); age(directory); }
  const repository = new ConversationRepository(root);
  const executor = createNativeExecutors().find(item => item.descriptor.id === 'qoder')!;
  repository.saveConnection({ view: { id: 'qoder', provider: 'qoder', label: 'fixture', revision: 'one', enabled: true, status: 'connected', executable: path.join(bound, 'node_modules/index.js'), models: [], capabilities: executor.descriptor.capabilities } } as any);
  const plan = inspectAgentStorage({ dataRoot, scanHomes: false });
  const items = plan.items.filter(item => item.kind === 'program-package');
  assert.equal(items.find(item => item.path === old)?.eligible, true);
  assert.equal(items.find(item => item.path === bound)?.reason, 'program_package_referenced');
  assert.equal(items.find(item => item.path === staging)?.eligible, true);
  const result = collectAgentStorage(plan);
  assert.equal(result.results.find(item => item.path === old)?.status, 'removed');
  assert.equal(result.results.find(item => item.path === staging)?.status, 'removed');
  assert.ok(!fs.existsSync(old) && !fs.existsSync(staging));
  assert.ok(fs.existsSync(path.join(bound, 'node_modules/index.js')));
});

test('runtime preparation waits for another process short storage collection', async t => {
  const root=fixture(t),dataRoot=path.join(root,'profile'),pkg=path.join(root,'package'),node=path.join(root,'node');
  file(path.join(pkg,'package.json'),'{"type":"module"}');file(path.join(pkg,'build/entry.js'),'export {};');
  file(path.join(pkg,'build/runtime-contracts.json'),JSON.stringify({contracts:AGENT_EXECUTION_CONTRACTS,storageVersion:1}));file(node,'fixture-node');fs.chmodSync(node,0o700);
  const source=new URL('../../src/process/ownership.ts',import.meta.url).href;
  const child=spawn(process.execPath,['--input-type=module','-e',`import {claim} from ${JSON.stringify(source)};const lock=claim(process.argv[1],'storage');process.stdout.write('ready');setTimeout(()=>lock.release(),150);`,dataRoot],{stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}});
  await once(child.stdout!,'data');
  assert.doesNotThrow(()=>prepareAgentRuntime({dataRoot,packageRoot:pkg,entry:'build/entry.js',node}));
});

test('legacy download classes retain reuse value without package publication or manual approvals', t => {
  const root = path.join(fixture(t), 'agent-service');
  const config = path.join(root, 'connections/dsh/model-bindings', 'c'.repeat(64));
  const executor = createNativeExecutors().find(x => x.descriptor.id === 'dsh')!;
  const yarn = path.join(config, 'home/Library/Caches/Yarn/v6');
  const pkg = path.join(yarn, 'npm-example-1-integrity/node_modules/example');
  file(path.join(pkg, 'package.json'), JSON.stringify({ name: 'example', version: '1' }));
  file(path.join(pkg, '.yarn-metadata.json'), JSON.stringify({ registry: 'npm', manifest: { name: 'example', version: '1' }, remote: { integrity: 'sha512-fixture' } }));
  const npm = path.join(config, 'cache/npm/_cacache'); file(path.join(npm, 'content-v2/sha512/blob'));
  age(config, Date.now() - 30 * 60_000);
  const plan = () => executorCacheCandidates(root, executor, config, unused, Date.now() - day);
  assert.equal(plan().find(x => x.path === yarn)?.reason,'legacy_cache_reuse_value_unverified');
  assert.equal(plan().find(x => x.path === npm)?.eligible,false,'old downloads are not silently discarded');
  const selected = plan().find(x => x.path === yarn)!;
  assert.equal(removeStorageCandidate(root, selected, () => ({ complete: true, paths: [path.join(config, 'native-session')] })), false);
  file(path.join(pkg, '.yarn-metadata.json'), '{}'); age(config);
  assert.equal(plan().find(x => x.path === yarn)?.eligible,false,'unknown package data remains preserved');
  const outside=path.join(root,'business-output');file(path.join(outside,'result'),'keep');
  fs.symlinkSync(outside,path.join(pkg,'generated-link'));
  const current=plan().find(x=>x.path===yarn)!;
  assert.equal(removeStorageCandidate(root,current,()=>unused),false);
  assert.equal(fs.readFileSync(path.join(outside,'result'),'utf8'),'keep','nested links are unlinked, never followed');
  assert.equal(fs.existsSync(path.join(root,'toolchains/cache/yarn')),false,'no package publication prerequisite');
});

test('application directory hints prevent duplicate default profiles without merging HOME or overriding explicit isolation', t => {
  const root = path.join(fixture(t), 'agent-service'); fs.mkdirSync(root);
  const storage = new ExecutorStorage(root), executor = createNativeExecutors().find(x => x.descriptor.id === 'dsh')!;
  const options = storage.options(executor, { connectionId: 'dsh', configRoot: path.join(root, 'connections/dsh'), environment: {} });
  const env = isolatedEnvironment(options.environment, '/private/home', '/private/tmp', {}, options.cacheRoot);
  assert.equal(env.BUILDR_APP_DATA_DIR, path.dirname(root)); assert.equal(env.HOME, '/private/home');
  assert.equal(env.YARN_CACHE_FOLDER, path.join(root, 'toolchains/cache/yarn'));
  const custom = storage.options(executor, { connectionId: 'dsh', configRoot: path.join(root, 'connections/dsh'), environment: { BUILDR_APP_DATA_DIR: '/explicit/test' } });
  assert.equal(isolatedEnvironment(custom.environment, '/private/home', '/private/tmp').BUILDR_APP_DATA_DIR, '/explicit/test');
});

test('test artifacts require creator proof and recheck the marker after retirement', async t => {
  const { testArtifactCandidates, testArtifactUnreferenced } = await import('../../src/storage/test-artifacts.ts');
  const root = path.join(fixture(t), 'agent-service'), config = path.join(root, 'connections/dsh');
  const directory = path.join(config, 'tmp/buildr-test-state-fixture');
  file(path.join(directory, 'output'), 'disposable'); age(directory);
  const plan = () => testArtifactCandidates(root, config, unused, Infinity)[0]!;
  assert.equal(plan().reason, 'test_creator_active_or_unproven');
  const mark = (completed: boolean) => file(path.join(directory, '.buildr-test-state.json'), JSON.stringify({ schemaVersion: 1, root: directory, producerPid: process.pid, completed }));
  mark(false); assert.equal(plan().eligible, false, 'live producer retains even without open files');
  mark(true); const selected = plan(); assert.ok(selected.eligible);
  assert.equal(removeStorageCandidate(root, selected, () => ({ complete: true, paths: [path.join(directory, 'child-file')] }), moved => testArtifactUnreferenced(moved, directory)), false);
  assert.equal(removeStorageCandidate(root, selected, () => unused, moved => testArtifactUnreferenced(moved, directory)), true);
  assert.equal(fs.existsSync(directory), false);
});

test('the existing maintenance worker removes completed disposable test state and keeps unproven neighbors', { skip: process.platform !== 'darwin' }, async t => {
  const { Worker } = await import('node:worker_threads');
  const dataRoot = fixture(t), config = path.join(dataRoot, 'agent-service/connections/dsh');
  const ended = path.join(config, 'tmp/buildr-test-state-ended'), unknown = path.join(config, 'tmp/buildr-test-state-legacy');
  file(path.join(ended, '.buildr-test-state.json'), JSON.stringify({ schemaVersion: 1, root: ended, producerPid: process.pid, completed: true }));
  file(path.join(ended, 'tmp/result'), 'disposable'); file(path.join(unknown, 'result'), 'keep');
  file(path.join(config,'cache/npm/_cacache/content-v2/fixture'),'reusable download'); age(config);
  file(path.join(dataRoot,'agent-service/connections/future-agent/home/business-output/keep'),'keep');
  const publicCache=path.join(dataRoot,'agent-service/toolchains/cache/node-compile');file(path.join(publicCache,'expired'),'regenerable bytecode');age(publicCache,Date.now()-40*day);
  const {recordSharedCacheUse}=await import('../../src/storage/shared-cache.ts');
  recordSharedCacheUse(path.join(dataRoot,'agent-service'));age(path.join(dataRoot,'agent-service/toolchains/cache-use'),Date.now()-40*day);
  const {ConversationRepository}=await import('../../src/persistence/conversation-repository.ts');
  const repository=new ConversationRepository(path.join(dataRoot,'agent-service'));
  const executor=createNativeExecutors()[0]!;
  repository.saveConnection({view:{id:'codex',provider:'codex',label:'fixture',revision:'one',enabled:false,status:'disconnected',models:[],capabilities:executor.descriptor.capabilities}} as any);
  let progressed = false; const timer = setTimeout(() => { progressed = true; }, 20); t.after(() => clearTimeout(timer));
  const worker = new Worker(new URL('../../build/process/storage-maintenance.js', import.meta.url), { workerData: { kind: 'agent-storage-maintenance', dataRoot } });
  const messages: any[] = []; worker.on('message', value => messages.push(value));
  assert.equal((await once(worker, 'exit'))[0], 0);
  assert.ok(progressed, 'system observation and deletion did not block the caller event loop');
  assert.equal(fs.existsSync(ended), false); assert.equal(fs.existsSync(path.join(unknown, 'result')), true);
  assert.ok(messages.some(value => value.removedBytes > 0), 'worker reports actual reclamation');
  const observation=JSON.parse(fs.readFileSync(path.join(dataRoot,'agent-service/process/storage-observation.json'),'utf8'));
  assert.equal(fs.existsSync(publicCache),false,'automatic worker reclaims proven idle expired shared cache');
  assert.ok(observation.homeStorage.objects.some((item:any)=>item.provider==='future-agent'&&item.action==='investigate-owner'));
  assert.equal(fs.readFileSync(path.join(dataRoot,'agent-service/connections/future-agent/home/business-output/keep'),'utf8'),'keep');
  assert.equal(fs.existsSync(path.join(config,'cache/npm/_cacache')),true,'worker preserves unique downloads');
  assert.equal(fs.existsSync(path.join(dataRoot,'agent-service/toolchains/cache/npm/_cacache/content-v2/fixture')),false,'automatic worker retires old cache without making a public duplicate');
});

test('nested confirmed shutdowns use their own references and storage lock without removing profile data', { skip: process.platform !== 'darwin' }, t => {
  const dataRoot = fixture(t), root = path.join(dataRoot, 'agent-service'), config = path.join(root, 'connections/codex');
  const base = path.join(config, 'home/Library/Application Support/Buildr/previews');
  const ended = path.join(base, 'ended'), current = path.join(base, 'current'), pkg = path.join(dataRoot, 'package');
  file(path.join(pkg, 'package.json'), '{"type":"module"}'); file(path.join(pkg, 'build/entry.js'), 'export const fixture = 1;');
  file(path.join(pkg, 'build/runtime-contracts.json'), JSON.stringify({ contracts: AGENT_EXECUTION_CONTRACTS, storageVersion: 1 }));
  const node = path.join(dataRoot, 'fixture-node'); file(node, 'node-fixture'); fs.chmodSync(node, 0o700);
  const versions = [ended, current].map(profile => {
    const runtime = prepareAgentRuntime({ dataRoot: profile, packageRoot: pkg, entry: 'build/entry.js', node });
    const generation = randomUUID(), record = { identity: { dataRoot: profile, generation, pid: 2147483647, runtime }, stopped: true, confirmed: true, origin: 'http://127.0.0.1:1', token: 'fixture' };
    writePrivate(path.join(controlRoot(profile), 'instances', generation + '.json'), record);
    if (profile === current) writePrivate(path.join(controlRoot(profile), 'instance.json'), record);
    file(path.join(profile, 'agent-service/unique-result'), 'preserve profile data');
    return runtime;
  });
  const plan = inspectAgentStorage({ dataRoot });
  assert.ok(plan.items.find(x => x.path === versions[0]!.directory)?.eligible);
  assert.equal(plan.items.find(x => x.path === versions[1]!.directory)?.reason, 'runtime_retained_reference');
  const lock = claim(ended, 'storage');
  try { assert.equal(collectAgentStorage(plan).removedBytes, 0, 'nested materialization lock is respected'); } finally { lock.release(); }
  const result = collectAgentStorage(plan);
  assert.ok(result.results.some(x => x.path === versions[0]!.directory && x.status === 'removed'));
  assert.ok(fs.existsSync(versions[1]!.directory));
  assert.equal(fs.readFileSync(path.join(ended, 'agent-service/unique-result'), 'utf8'), 'preserve profile data');
});

test('retained runtime versions use one Node object and identical dependency inodes, retaining legacy manifests', t => {
  const dataRoot = fixture(t), pkg = path.join(dataRoot, 'package');
  file(path.join(pkg, 'package.json'), '{"type":"module"}');
  file(path.join(pkg, 'build/runtime-contracts.json'), JSON.stringify({ contracts: AGENT_EXECUTION_CONTRACTS, storageVersion: 1 }));
  file(path.join(pkg, 'node_modules/example/index.js'), 'export const dependency = 1;');
  const node = path.join(dataRoot, 'fixture-node'); file(node, 'node-fixture'); fs.chmodSync(node, 0o700);
  file(path.join(pkg, 'build/entry.js'), 'export const version = 1;');
  const first = prepareAgentRuntime({ dataRoot, packageRoot: pkg, entry: 'build/entry.js', node });
  file(path.join(pkg, 'build/entry.js'), 'export const version = 2;');
  const second = prepareAgentRuntime({ dataRoot, packageRoot: pkg, entry: 'build/entry.js', node });
  assert.notEqual(first.node, second.node, 'legacy-compatible paths remain per version');
  assert.equal(fs.statSync(first.node).ino, fs.statSync(second.node).ino, 'Node paths share one physical inode');
  const left = fs.statSync(path.join(first.directory, 'node_modules/example/index.js')), right = fs.statSync(path.join(second.directory, 'node_modules/example/index.js'));
  assert.equal(left.ino, right.ino); assert.equal(left.dev, right.dev);
  assert.equal(left.mode & 0o222, 0, 'shared dependencies cannot be modified through a normal view');
  const manifestFile = path.join(first.directory, 'runtime.json'), manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  fs.unlinkSync(first.node); fs.copyFileSync(node, path.join(first.directory, 'node')); manifest.node = path.join(first.directory, 'node');
  writePrivate(manifestFile, manifest);
  file(path.join(pkg, 'build/entry.js'), 'export const version = 1;');
  assert.equal(prepareAgentRuntime({ dataRoot, packageRoot: pkg, entry: 'build/entry.js', node }).node, manifest.node, 'old self-contained Node stays valid until safe migration');
});

test('legacy cache migration keeps reusable entries, never overwrites shared entries, and defers changed or occupied owners', async t => {
  const { migrateToolCache } = await import('../../src/storage/cache-migration.ts');
  const dataRoot = fixture(t), root = path.join(dataRoot,'agent-service'), owner = path.join(root,'connections/dsh');
  const source = path.join(owner,'cache/npm/_cacache'), target = path.join(root,'toolchains/cache/npm/_cacache');
  file(path.join(source,'content-v2/new'),'download'); file(path.join(source,'index-v5/existing'),'old-cache-index');
  file(path.join(target,'index-v5/existing'),'current-cache-index'); age(source);
  const candidate = () => storageCandidate(root,'cache',source,owner,unused,Infinity);
  const initial = candidate(); file(path.join(source,'changed'),'changed');
  assert.equal(migrateToolCache(root,initial,Date.now()+10000,()=>unused),false);
  assert.equal(migrateToolCache(root,candidate(),Date.now()+10000,()=>({complete:true,paths:[path.join(owner,'home/busy')]})),false);
  assert.equal(migrateToolCache(root,candidate(),Date.now()+10000,()=>unused),true);
  assert.equal(fs.existsSync(source),false);
  assert.equal(fs.readFileSync(path.join(target,'content-v2/new'),'utf8'),'download');
  assert.equal(fs.readFileSync(path.join(target,'index-v5/existing'),'utf8'),'current-cache-index');
  assert.equal(fs.statSync(path.join(target,'content-v2/new')).nlink,1,'mutable cache is not hardlinked');
});

test('ended legacy runtime views migrate to identical objects and unreferenced objects expire safely', async t => {
  const { runtimeSharingCandidates, shareRetainedRuntime } = await import('../../src/process/runtime-sharing.ts');
  const { runtimeObjectCandidates, runtimeObjectUnreferenced, materializeRuntimeObject } = await import('../../src/storage/runtime-objects.ts');
  const { validateRuntimeContents } = await import('../../src/process/runtime-unit.ts');
  const dataRoot = fixture(t), root = path.join(dataRoot,'agent-service'), pkg = path.join(dataRoot,'pkg');
  file(path.join(pkg,'package.json'),'{"type":"module"}'); file(path.join(pkg,'build/entry.js'),'export const one=1;');
  file(path.join(pkg,'build/runtime-contracts.json'),JSON.stringify({contracts:AGENT_EXECUTION_CONTRACTS,storageVersion:1}));
  const node=path.join(dataRoot,'node');file(node,'node');fs.chmodSync(node,0o700);
  const runtime=prepareAgentRuntime({dataRoot,packageRoot:pkg,entry:'build/entry.js',node});
  fs.unlinkSync(runtime.node);fs.copyFileSync(node,runtime.node);
  const item=runtimeSharingCandidates(dataRoot,unused)[0];assert.ok(item?.eligible);
  assert.equal(shareRetainedRuntime(root,item!,Date.now()+10000,()=>({complete:true,paths:[runtime.node]})),false);
  assert.equal(shareRetainedRuntime(root,item!,Date.now()+10000,()=>unused),true);
  assert.ok(fs.statSync(runtime.node).nlink>1);validateRuntimeContents(dataRoot,runtime);
  assert.equal(runtimeSharingCandidates(dataRoot,unused).length,0);
  file(path.join(dataRoot,'unused-object'),'never referenced');
  const object=materializeRuntimeObject(root,path.join(dataRoot,'unused-object')),view=path.join(dataRoot,'temporary-view');fs.linkSync(object,view);age(path.dirname(object));
  assert.equal(runtimeObjectCandidates(root,unused).length,0,'a live view protects even old content');fs.unlinkSync(view);
  const recent=runtimeObjectCandidates(root,unused);assert.equal(recent.length,1);assert.equal(recent[0]!.eligible,false,'recently unlinked objects retain a full grace window despite old content mtime');
  const candidates=runtimeObjectCandidates(root,unused,Date.now()+31*day);assert.equal(candidates.length,1);assert.equal(candidates[0]!.eligible,true);
  assert.equal(removeStorageCandidate(root,candidates[0]!,()=>unused,directory=>runtimeObjectUnreferenced(directory,path.basename(path.dirname(object)))),true);
  assert.ok(fs.existsSync(runtime.node));validateRuntimeContents(dataRoot,runtime);
});

test('shared Java and Maven use existing public installations and repository without sharing account settings', async t => {
  const { sharedToolchainEnvironment }=await import('../../src/storage/toolchain-environment.ts');
  const dataRoot=fixture(t),root=path.join(dataRoot,'agent-service'),host=path.join(dataRoot,'host');fs.mkdirSync(root);
  const java=path.join(host,'jdk'),maven=path.join(host,'maven'),repository=path.join(host,'.m2/repository');
  fs.mkdirSync(java,{recursive:true});fs.mkdirSync(maven,{recursive:true});fs.mkdirSync(repository,{recursive:true});
  file(path.join(host,'.m2/settings.xml'),'private settings');
  const shared=sharedToolchainEnvironment(root,{HOME:host,PATH:'/usr/bin',JAVA_HOME:java,MAVEN_HOME:maven});
  for(const id of ['codex','dsh','qoder','future-agent']){
    const config=path.join(root,'connections',id),env=isolatedEnvironment(shared.environment,config,path.join(config,'tmp'),{},shared.cacheRoot);
    assert.equal(env.JAVA_HOME,java);assert.equal(env.MAVEN_HOME,maven);assert.equal(env.BUILDR_MAVEN_REPOSITORY,repository);
    assert.ok(env.JAVA_TOOL_OPTIONS?.includes(repository));assert.notEqual(env.HOME,host);
    assert.equal(fs.existsSync(path.join(env.HOME!,'.m2/settings.xml')),false);
    assert.equal(env.PIP_CACHE_DIR,path.join(host,process.platform==='darwin'?'Library/Caches/pip':'.cache/pip'));
  }
});


test('finished native package installations share identical dependency bytes across providers and reject corrupt objects', async t => {
  const {sharePreparedToolPackage,materializeRuntimeObject}=await import('../../src/storage/runtime-objects.ts');
  const dataRoot=fixture(t),root=path.join(dataRoot,'agent-service');
  const left=path.join(root,'programs/codex/.prepare-abc123'),right=path.join(root,'programs/dsh/.prepare-def456');
  for(const directory of [left,right]){
    file(path.join(directory,'node_modules/common/index.js'),'shared immutable dependency');
    file(path.join(directory,'node_modules/.bin/placeholder'),'placeholder');
    fs.unlinkSync(path.join(directory,'node_modules/.bin/placeholder'));
    fs.symlinkSync('../common/index.js',path.join(directory,'node_modules/.bin/common'));
    sharePreparedToolPackage(root,directory);
  }
  const a=path.join(left,'node_modules/common/index.js'),b=path.join(right,'node_modules/common/index.js');
  assert.equal(fs.statSync(a).ino,fs.statSync(b).ino);assert.equal(fs.statSync(a).mode&0o222,0);
  assert.ok(fs.lstatSync(path.join(right,'node_modules/.bin/common')).isSymbolicLink());
  assert.throws(()=>sharePreparedToolPackage(root,path.join(root,'connections/codex/home')),/staging_unsafe/);
  const source=path.join(dataRoot,'input');file(source,'object original');
  const object=materializeRuntimeObject(root,source);fs.chmodSync(object,0o600);fs.writeFileSync(object,'corruption');fs.chmodSync(object,0o400);
  assert.throws(()=>materializeRuntimeObject(root,source),/object_changed/);
});

test('cache retention follows purpose and real observations without a capacity budget', async t=>{
  const {sharedCacheCandidates,recordSharedCacheUse,sharedCacheReclaimable,observeSharedCacheUse,sharedCachePolicy}=await import('../../src/storage/shared-cache.ts');
  const dataRoot=fixture(t),root=path.join(dataRoot,'agent-service'),owner=path.join(root,'connections');fs.mkdirSync(owner,{recursive:true});
  const cache=path.join(root,'toolchains/cache/node-compile'),download=path.join(root,'toolchains/cache/npm/_cacache');
  file(path.join(cache,'bytecode'),'regenerable');file(path.join(download,'content-v2/package'),'download');
  age(cache,Date.now()-40*day);age(download,Date.now()-40*day);
  const dependencies={complete:true,contexts:[]},usage=path.join(root,'toolchains/cache-use');
  assert.ok(sharedCacheCandidates(root,unused,dependencies).every(x=>!x.eligible&&['cache_usage_unobserved','download_cache_reuse_value_unverified'].includes(x.reason)));
  assert.equal(fs.existsSync(usage),false,'read-only inspection does not create use records');
  observeSharedCacheUse(root,unused,dependencies);
  assert.ok(sharedCacheCandidates(root,unused,dependencies).every(x=>!x.eligible),'first observation starts a full window');
  age(usage,Date.now()-10*day);
  const items=sharedCacheCandidates(root,unused,dependencies),compiled=items.find(x=>x.path===cache)!;
  assert.equal(compiled.eligible,true);assert.equal(compiled.retentionDays,7);
  assert.equal(items.find(x=>x.path===download)!.eligible,false,'downloads remain for 30 days');
  assert.equal('softLimitBytes'in sharedCachePolicy,false);assert.equal('pressureRetentionDays'in sharedCachePolicy,false);
  assert.ok(sharedCacheCandidates(root,unused,{complete:true,contexts:['qoder:pending']}).every(x=>!x.eligible));
  assert.ok(sharedCacheCandidates(root,unused,{complete:false,contexts:[]}).every(x=>!x.eligible));
  for(const relative of ['connections/future-agent/home/live','programs/dsh/.prepare-running/file','program-probes/tmp/install','toolchains/cache/node-compile/bytecode'])
    assert.ok(sharedCacheCandidates(root,{complete:true,paths:[path.join(root,relative)]},dependencies).every(x=>!x.eligible));
  recordSharedCacheUse(root);
  assert.equal(sharedCacheReclaimable(root,compiled,unused,dependencies),false,'new use invalidates an old collector preview');
  assert.ok(sharedCacheCandidates(root,unused,dependencies).every(x=>!x.eligible));
  age(usage,Date.now()-40*day);
  assert.ok(sharedCacheCandidates(root,unused,dependencies).every(x=>x.path===cache?x.eligible:!x.eligible),'expiry is insufficient to discard downloads');
  observeSharedCacheUse(root,unused,{complete:false,contexts:[]});
  assert.ok(sharedCacheCandidates(root,unused,dependencies).every(x=>!x.eligible),'unconfirmed consumers renew a conservative use bound');
  file(path.join(root,'toolchains/cache/npm/_npx/work/index.js'),'installed tool');
  file(path.join(root,'toolchains/cache/maven/private-result'),'repository');
  assert.ok(sharedCacheCandidates(root,unused,dependencies).every(x=>!x.path.includes('_npx')&&!x.path.includes('maven')));
  fs.mkdirSync(path.join(root,'toolchains/cache/yarn/v6'),{recursive:true});age(path.join(root,'toolchains/cache/yarn/v6'),Date.now()-40*day);
  age(usage,Date.now()-40*day);
  const mixed=sharedCacheCandidates(root,unused,dependencies).find(x=>x.path.endsWith('/yarn/v6'))!;
  assert.equal(mixed.eligible,false,'cache also used as installed dependency source needs independent reference proof');
});

test('actual native turns renew shared cache use at start and completion without changing results or replaying',async t=>{
  const dataRoot=fixture(t),root=path.join(dataRoot,'agent-service');fs.mkdirSync(root);
  let calls=0,finish!:()=>void;const done=new Promise<void>(resolve=>finish=resolve);
  const runtime={send:async()=>{calls++;await done;}}as unknown as AgentRuntime;
  const storage=new ExecutorStorage(root),executor=createNativeExecutors()[0]!;
  storage.opened(runtime,executor,path.join(root,'connections/codex'));
  storage.opened(runtime,executor,path.join(root,'connections/codex'));
  const sending=runtime.send({}as any),usage=path.join(root,'toolchains/cache-use');
  assert.ok(fs.existsSync(path.join(usage,'node-compile')));age(usage,Date.now()-40*day);
  finish();await sending;
  assert.equal(calls,1);assert.ok(fs.statSync(path.join(usage,'node-compile')).mtimeMs>Date.now()-10000);
});

test('HOME discovery includes future providers, reports partial metadata and never follows links or authorizes deletion',async t=>{
  const {discoverHomeStorage}=await import('../../src/storage/home-discovery.ts');
  const dataRoot=fixture(t),root=path.join(dataRoot,'agent-service'),home=path.join(root,'connections/future-agent/home');
  file(path.join(home,'Library/Caches/node-gyp/24.21.0/header'),'headers');
  file(path.join(home,'business-output/result'),'preserve business work');
  file(path.join(home,'.ssh/config'),'private configuration');
  const outside=path.join(dataRoot,'outside');file(path.join(outside,'large'),'external');fs.symlinkSync(outside,path.join(home,'outside-link'));
  const result=discoverHomeStorage(root,{maximumNodes:1000,budgetMs:1000});
  assert.equal(result.complete,true);assert.equal(result.totalHomes,1);
  assert.ok(result.objects.some(x=>x.classification==='tool-cache'));
  assert.ok(result.objects.some(x=>x.path.endsWith('business-output')&&x.action==='investigate-owner'));
  assert.ok(result.objects.some(x=>x.classification==='private-state'));
  assert.ok(result.objects.every(x=>!x.path.includes('outside-link')&&!('eligible'in x)));
  assert.equal(discoverHomeStorage(root,{maximumNodes:2,budgetMs:1000}).complete,false);
  assert.equal(fs.readFileSync(path.join(home,'business-output/result'),'utf8'),'preserve business work');
});

test('node headers and Corepack caches require real manager metadata; new agents use the shared destinations',async t=>{
  const {toolCacheReclaimable}=await import('../../src/storage/tool-cache.ts');
  const {sharedToolchainEnvironment}=await import('../../src/storage/toolchain-environment.ts');
  const {migrateToolCache}=await import('../../src/storage/cache-migration.ts');
  const dataRoot=fixture(t),root=path.join(dataRoot,'agent-service'),owner=path.join(root,'connections/dsh');
  const cache=path.join(owner,'home/Library/Caches/node-gyp');
  file(path.join(cache,'24.21.0/installVersion'),'11\n');
  file(path.join(cache,'24.21.0/include/node/node_version.h'),'#define NODE_MAJOR_VERSION 24\n#define NODE_MINOR_VERSION 21\n#define NODE_PATCH_VERSION 0\n');
  assert.equal(toolCacheReclaimable(owner,'home/Library/Caches/node-gyp'),true);
  const shared=sharedToolchainEnvironment(root,{}),env=isolatedEnvironment(shared.environment,owner,path.join(owner,'tmp'),{},shared.cacheRoot);
  assert.equal(env.COREPACK_HOME,path.join(shared.cacheRoot,'corepack'));
  assert.equal(env.npm_config_devdir,path.join(shared.cacheRoot,'node-gyp'));
  const item=storageCandidate(root,'cache',cache,owner,unused,Infinity);
  assert.equal(migrateToolCache(root,item,Date.now()+10000,()=>unused),true);
  assert.ok(fs.existsSync(path.join(shared.cacheRoot,'node-gyp/24.21.0/include/node/node_version.h')));
  const corepack=path.join(owner,'home/.cache/node/corepack/v1');
  file(path.join(corepack,'yarn/1.22.22/.corepack'),JSON.stringify({locator:{name:'yarn',reference:'1.22.22'},hash:'sha512.abcdef'}));
  file(path.join(corepack,'yarn/1.22.22/package.json'),JSON.stringify({name:'yarn',version:'1.22.22'}));
  assert.equal(toolCacheReclaimable(owner,'home/.cache/node/corepack/v1'),true);
  file(path.join(corepack,'yarn/1.22.22/package.json'),'{"name":"other","version":"1.22.22"}');
  assert.equal(toolCacheReclaimable(owner,'home/.cache/node/corepack/v1'),false);
});


test('parallel cache-use observations keep one private stamp without directory creation races',async t=>{
  const {Worker}=await import('node:worker_threads');
  const dataRoot=fixture(t),root=path.join(dataRoot,'agent-service');fs.mkdirSync(root);
  const barrier=new SharedArrayBuffer(4),signal=new Int32Array(barrier);
  const module=new URL('../../src/storage/shared-cache.ts',import.meta.url).href;
  const code=`const {workerData}=require('node:worker_threads');import(workerData.module).then(({recordSharedCacheUse})=>{const signal=new Int32Array(workerData.barrier);Atomics.wait(signal,0,0);for(let n=0;n<20;n++)recordSharedCacheUse(workerData.root);});`;
  const workers=[0,1].map(()=>new Worker(code,{eval:true,workerData:{root,module,barrier}}));
  const outcomes=workers.map(worker=>once(worker,'exit'));
  Atomics.store(signal,0,1);Atomics.notify(signal,0);
  for(const outcome of outcomes)assert.equal((await outcome)[0],0);
  const directory=path.join(root,'toolchains/cache-use');
  assert.equal(fs.readdirSync(directory).length,6);
  for(const name of fs.readdirSync(directory)){const stat=fs.lstatSync(path.join(directory,name));assert.equal(stat.nlink,1);assert.equal(stat.size,0);assert.equal(stat.isSymbolicLink(),false);}
});

test('legacy cache references protect the exact binding and fall back conservatively when identity cannot be resolved', async t => {
  const {legacyCacheReferences}=await import('../../src/application/storage-maintenance.ts');
  const root=path.join(fixture(t),'agent-service'),record={view:{id:'conversation',cwd:'/project'}};
  const participant={id:'one',provider:'dsh',connectionId:'dsh',bindingIdentity:'native-binding'} as any;
  const scoped=legacyCacheReferences(root,{storageDependencies(visitor){visitor?.(record,participant);return {complete:true,contexts:['dsh:running']};}});
  assert.deepEqual(scoped(path.join(root,'connections/dsh')).contexts,['dsh:running']);
  assert.deepEqual(scoped(path.join(root,'connections/dsh/model-bindings','a'.repeat(64))).contexts,[],'unrelated old binding is not pinned by another task');
  const replaced=legacyCacheReferences(root,{storageDependencies(visitor){visitor?.(record,participant,'old-binding');return {complete:true,contexts:['dsh:recovering']};}});
  assert.deepEqual(replaced(path.join(root,'connections/dsh/model-bindings','a'.repeat(64))).contexts,['dsh:recovering']);
  const incomplete=legacyCacheReferences(root,{storageDependencies(){return {complete:false,contexts:[]};}});
  assert.equal(incomplete(path.join(root,'connections/dsh')).complete,false);
});

test('shared connection caches retain every active binding and pre-context startup owner', async t => {
  const {legacyCacheReferences}=await import('../../src/application/storage-maintenance.ts');
  const {configRoot}=await import('../../src/application/native-content-resolver.ts');
  const root=path.join(fixture(t),'agent-service'),record={view:{id:'conversation',cwd:'/project'}};
  const participant={id:'one',provider:'dsh',connectionId:'dsh',bindingIdentity:'native-binding',modelAccountId:'account',modelAccountIdentity:'identity',modelId:'model',modelConfiguration:'{}'} as any;
  const config=configRoot(root,record,participant)!;
  for(const contexts of [['dsh:active'],[]]){
    const references=legacyCacheReferences(root,{storageDependencies(visitor){visitor?.(record,participant);return {complete:true,contexts};}});
    assert.ok(references(path.join(root,'connections/dsh')).contexts.length,'connection-level cache serves all bindings');
    assert.ok(references(config).contexts.length,'pending native creation still protects its binding');
    assert.deepEqual(references(path.join(root,'connections/dsh/model-bindings','f'.repeat(64))).contexts,[]);
  }
});

test('legacy npm exec installations keep installed tool reuse value', t => {
  const root=path.join(fixture(t),'agent-service'),config=path.join(root,'connections/dsh');
  const cache=path.join(config,'home/.npm/_npx'),project=path.join(config,'home/project/node_modules');
  file(path.join(cache,'opaque-install/node_modules/tool/index.js'),'regenerable tool');
  file(path.join(project,'business/index.js'),'user work');
  const executor=createNativeExecutors().find(item=>item.descriptor.id==='dsh')!;
  const items=executorCacheCandidates(root,executor,config,unused,Infinity,false,{complete:true,contexts:[]});
  const item=items.find(item=>item.path===cache)!;assert.ok(!item?.eligible&&item.retire);
  assert.equal(removeStorageCandidate(root,item,()=>unused),false);
  assert.equal(fs.readFileSync(path.join(project,'business/index.js'),'utf8'),'user work');
});

test('cache-only consumers release stale history without weakening native evidence or pending guards', async t => {
  const {legacyCacheReferences}=await import('../../src/application/storage-maintenance.ts');
  const root=path.join(fixture(t),'agent-service'),record={view:{id:'conversation',cwd:'/project'}};
  const participant={id:'one',provider:'dsh',connectionId:'dsh',bindingIdentity:'binding'} as any;
  const config=path.join(root,'connections/dsh');
  const run={status:'unknown',executionState:'unknown',resourcesReleased:true,tools:[]} as any;
  const consumer={run,pending:false,executionRef:{id:'old',data:{resourceGroup:2_000_000_000}}};
  const inspect=()=>legacyCacheReferences(root,{storageDependencies(visitor){visitor?.(record,participant,undefined,consumer);return {complete:true,contexts:['dsh:history']};}});
  let references=inspect();
  assert.deepEqual(references(config).contexts,[]);
  assert.deepEqual(references.dependencies.contexts,['dsh:history'],'native recovery dependency is unchanged');
  consumer.pending=true;assert.ok(inspect()(config).contexts.length);
  consumer.pending=false;run.resourcesReleased=false;assert.ok(inspect()(config).contexts.length,'unknown unreleased work is protected');
  run.status='completed';run.executionState='ended';assert.deepEqual(inspect()(config).contexts,[],'terminal dead resource no longer pins downloads');
  consumer.executionRef.data.resourceGroup=1;assert.ok(inspect()(config).contexts.length,'invalid ownership proof is retained');
  assert.equal(run.resourcesReleased,false,'cache inspection never repairs business state');
});


test('unaccepted stale work requires whole-config quiescence while new pending work remains protected',async t=>{
  const {legacyCacheReferences}=await import('../../src/application/storage-maintenance.ts');
  const root=path.join(fixture(t),'agent-service'),config=path.join(root,'connections/dsh');
  const participant={id:'one',provider:'dsh',connectionId:'dsh',bindingIdentity:'binding'} as any;
  const run={status:'unknown',executionState:'unknown',accepted:false,tools:[]} as any;
  const consumer={run,pending:false};
  const inspect=()=>legacyCacheReferences(root,{storageDependencies(visitor){visitor?.({view:{id:'conversation',cwd:'/work'}},participant,undefined,consumer);return {complete:true,contexts:['dsh:history']};}})(config);
  const cache=path.join(config,'cache/node-compile');file(path.join(cache,'download'),'rebuildable');
  const references=inspect();assert.deepEqual(references.contexts,[]);assert.equal(references.strictOccupancy,true);
  const executor=createNativeExecutors().find(x=>x.descriptor.id==='dsh')!;
  const held=executorCacheCandidates(root,executor,config,{complete:true,paths:[path.join(config,'dsh-home/session')]},Infinity,false,references).find(x=>x.path===cache)!;
  assert.equal(held.eligible,false);assert.equal(held.useRoot,undefined);
  assert.equal(executorCacheCandidates(root,executor,config,unused,Infinity,false,references).find(x=>x.path===cache)?.eligible,true);
  consumer.pending=true;assert.ok(inspect().contexts.length);
  consumer.pending=false;run.status='starting';assert.ok(inspect().contexts.length);
  assert.equal(run.executionState,'unknown');
});


test('local curated-sync copies require the same clean official managed seed', t => {
 const root=path.join(fixture(t),'agent-service'),config=path.join(root,'connections/codex/model-bindings','d'.repeat(64));
 const seed=path.join(root,'connections/codex/cache/curated-plugins');file(path.join(seed,'plugin.js'));cleanPluginCheckout(seed);
 const checkout=path.join(config,'codex-home/.tmp/plugins');fs.mkdirSync(path.dirname(checkout),{recursive:true});fs.cpSync(seed,checkout,{recursive:true});
 execFileSync('git',['-C',checkout,'remote','remove','origin']);
 const head=execFileSync('git',['-C',seed,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 file(path.join(checkout,'.git/FETCH_HEAD'),head+"\t\t'refs/codex/curated-sync' of /retired/local/checkout\n");
 const executor=createNativeExecutors().find(x=>x.descriptor.id==='codex')!;
 assert.equal(executor.storage!.canReclaim!(config,'codex-home/.tmp/plugins'),true);
 file(path.join(checkout,'local-work'),'keep');assert.equal(executor.storage!.canReclaim!(config,'codex-home/.tmp/plugins'),false);
 fs.unlinkSync(path.join(checkout,'local-work'));fs.rmSync(seed,{recursive:true});
 assert.equal(executor.storage!.canReclaim!(config,'codex-home/.tmp/plugins'),false,'local URL alone grants no deletion authority');
});


test('historical recovery contexts do not pin retired compile caches but pending work still protects them', async t=>{
 const {cacheStorageDependencies}=await import('../../src/application/storage-maintenance.ts');
 const {sharedCacheCandidates,sharedCacheReclaimable}=await import('../../src/storage/shared-cache.ts');
 const {registerToolCache}=await import('../../src/storage/toolchain-locations.ts');
 const base=fixture(t),root=path.join(base,'agent-service'),owner=path.join(root,'connections/dsh'),cache=path.join(root,'toolchains/cache/node-compile'),host=path.join(base,'host-compile');
 file(path.join(owner,'keep'),'account');file(path.join(cache,'code'),'bytecode');fs.mkdirSync(host);registerToolCache(root,'node-compile',host);
 const run={resourcesReleased:true,tools:[]} as any,consumer={run,pending:false};
 const repo={storageDependencies(visitor:any){visitor?.({view:{id:'one',cwd:'/work'}},{provider:'dsh',connectionId:'dsh',bindingIdentity:'binding'},undefined,consumer);return {complete:true,contexts:['dsh:native-history']};}};
 let refs=cacheStorageDependencies(root,repo);assert.deepEqual(refs.contexts,[]);
 let item=sharedCacheCandidates(root,unused,refs).find(item=>item.path===cache)!;
 assert.equal(item.eligible,true,'explicitly retired bytecode needs no extra retention window');assert.equal(sharedCacheReclaimable(root,item,unused,refs),true);
 consumer.pending=true;refs=cacheStorageDependencies(root,repo);assert.ok(refs.contexts.length);assert.equal(sharedCacheCandidates(root,unused,refs).find(item=>item.path===cache)!.eligible,false);
 assert.equal(fs.readdirSync(host).length,0,'host content is never collected');
});


test('a completed adoption acknowledgement cannot pin a confirmed stopped runtime', t=>{
 const base=fixture(t),dataRoot=path.join(base,'profile'),pkg=path.join(base,'package'),node=path.join(base,'node');
 file(path.join(pkg,'package.json'),'{}');file(path.join(pkg,'build/entry.js'),'export {};');file(path.join(pkg,'build/runtime-contracts.json'),JSON.stringify({contracts:AGENT_EXECUTION_CONTRACTS,storageVersion:1}));file(node,'fixture node');fs.chmodSync(node,0o700);
 const unit=prepareAgentRuntime({dataRoot,packageRoot:pkg,entry:'build/entry.js',node}),generation=randomUUID();
 writePrivate(path.join(controlRoot(dataRoot),'instances',generation+'.json'),{identity:{dataRoot,generation,pid:2147483647,runtime:unit},stopped:true,confirmed:true});
 writePrivate(path.join(controlRoot(dataRoot),'pending.json'),{runtime:unit,state:'waiting'});
 assert.equal(retainedRuntimeCandidates(dataRoot,unused,undefined,Date.now(),true).find(x=>x.path===unit.directory)!.eligible,false);
 writePrivate(path.join(controlRoot(dataRoot),'pending.json'),{runtime:unit,state:'adopted'});
 assert.equal(retainedRuntimeCandidates(dataRoot,unused,undefined,Date.now(),true).find(x=>x.path===unit.directory)!.eligible,true);
 const instanceId=randomUUID();writePrivate(path.join(controlRoot(dataRoot),'instance.json'),{identity:{dataRoot,generation,instanceId,pid:2147483647,runtime:unit},stopped:false,confirmed:false});
 writePrivate(path.join(controlRoot(dataRoot),'last-stop.json'),{instanceId:randomUUID(),confirmed:true});
 assert.equal(runtimeUnreferenced(dataRoot,unit.directory),false,'mismatched stop receipt preserves the current pointer');
 writePrivate(path.join(controlRoot(dataRoot),'last-stop.json'),{instanceId,confirmed:true});
 const candidate=retainedRuntimeCandidates(dataRoot,unused,undefined,Date.now(),true).find(x=>x.path===unit.directory)!;
 assert.equal(candidate.eligible,true);assert.equal(removeStorageCandidate(path.join(dataRoot,'agent-service'),candidate,()=>unused,()=>runtimeUnreferenced(dataRoot,unit.directory)),true);
 retireRuntimeRecords(dataRoot,unit.directory);
 assert.equal(fs.existsSync(path.join(controlRoot(dataRoot),'instance.json')),false);assert.equal(fs.existsSync(path.join(controlRoot(dataRoot),'pending.json')),false);

});
