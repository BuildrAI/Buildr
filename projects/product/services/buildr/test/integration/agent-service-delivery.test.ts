import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { copyAgentRuntimePackage } from '../../tools/build/agent-package.ts';
import { prepareDevelopmentAgent } from '../../tools/development/prepare-development-agent.ts';
import { createReleaseArtifactFixture } from '../helpers/release-artifact-fixture.ts';
import { verifyApplicationPayload } from '../../src/infrastructure/product-resources/index.ts';
import { acquireExclusiveFileLock, releaseExclusiveFileLock } from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');

test('concurrent source preparations wait for their owner and publish a complete public package', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-agent-prepare-concurrent-'));
  const children: ReturnType<typeof spawn>[] = [];
  let lock: ReturnType<typeof acquireExclusiveFileLock>;
  t.after(() => {
    releaseExclusiveFileLock(lock);
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const host = path.join(root, 'host'), agent = path.join(root, 'agent');
  fs.mkdirSync(path.join(agent, 'build'), { recursive: true });
  fs.writeFileSync(path.join(agent, 'package.json'), JSON.stringify({ name: '@buildr-ai/buildr-agent', version: '0.1.0', private: true, dependencies: {} }));
  fs.writeFileSync(path.join(agent, 'LICENSE'), 'fixture');
  fs.writeFileSync(path.join(agent, 'build/index.js'), 'export const ready = true;\n');
  const destination = path.join(host, 'node_modules/@buildr-ai/buildr-agent');
  lock = acquireExclusiveFileLock(path.join(host, 'node_modules/.buildr-agent-preparation.lock'), destination);
  const entry = path.join(root, 'prepare.mjs');
  fs.writeFileSync(entry, `import { prepareDevelopmentAgent } from ${JSON.stringify(pathToFileURL(path.join(serviceRoot, 'tools/development/prepare-development-agent.ts')).href)};console.log(prepareDevelopmentAgent(${JSON.stringify({ serviceRoot: host, agentRoot: agent, build: false })}));`);
  let finished = 0;
  const run = () => new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [entry], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_OPTIONS: '' } });
    children.push(child);
    let output = '', errors = '';
    child.stdout!.on('data', data => output += data);
    child.stderr!.on('data', data => errors += data);
    child.once('error', reject);
    child.once('close', code => { finished++; if (code === 0) resolve(output.trim()); else reject(new Error(errors)); });
  });
  const running = [run(), run()];
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(finished, 0, 'a preparation cannot bypass the existing owner');
  assert.equal(releaseExclusiveFileLock(lock), true);
  assert.deepEqual(await Promise.all(running), [destination, destination]);
  assert.equal(fs.readFileSync(path.join(destination, 'build/index.js'), 'utf8'), 'export const ready = true;\n');
  fs.writeFileSync(path.join(agent, 'package.json'), JSON.stringify({ name: '@buildr-ai/buildr-agent', version: '0.1.0', private: true, dependencies: { '@buildr-agent-fixture/missing': '1.0.0' } }));
  assert.throws(() => prepareDevelopmentAgent({ serviceRoot: host, agentRoot: agent, build: false }), /agent_runtime_dependency_missing/u);
  assert.equal(fs.readFileSync(path.join(destination, 'build/index.js'), 'utf8'), 'export const ready = true;\n', 'failed staging preserves the previously usable runtime');
  assert.deepEqual(fs.readdirSync(path.dirname(destination)), ['buildr-agent']);
});

test('the compiled public Agent package and vendor clients load away from the development checkout', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-agent-package-consumer-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  prepareDevelopmentAgent({ build: false });
  const copied = copyAgentRuntimePackage(serviceRoot, root);
  const sdkMetadata = JSON.parse(fs.readFileSync(path.join(copied, 'node_modules/@qoder-ai/qoder-agent-sdk/package.json'), 'utf8'));
  assert.equal(sdkMetadata.scripts, undefined, 'bundled SDK cannot run an installer that downloads another CLI');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(root, 'consumer.mjs'), `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    const api = await import('@buildr-ai/buildr-agent');
    assert.ok(Object.keys(api).length > 0);
    const require = createRequire(import.meta.resolve('@buildr-ai/buildr-agent'));
    const sdk = await import(require.resolve('@qoder-ai/qoder-agent-sdk'));
    assert.equal(typeof sdk.query, 'function');
    const client = await import(require.resolve('@deepseek-ai/dsh-client-connection/client'));
    assert.equal(typeof client.installConnection, 'function');
    assert.throws(() => require.resolve('@buildr-ai/buildr-agent/src/index.ts'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    console.log('isolated-agent-runtime-passed');
  `);
  const child = spawnSync(process.execPath, [path.join(root, 'consumer.mjs')], {
    cwd: root, env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 20_000,
  });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /isolated-agent-runtime-passed/u);
  fs.rmSync(path.join(copied, 'build/index.js'));
  assert.throws(() => copyAgentRuntimePackage(root, path.join(root, 'broken')), /agent_runtime_entry_missing/u);
});

test('runtime packaging refuses a link to external development files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-agent-package-link-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const copied = copyAgentRuntimePackage(serviceRoot, root);
  fs.symlinkSync(path.join(serviceRoot, 'src'), path.join(copied, 'external-source'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => copyAgentRuntimePackage(root, path.join(root, 'broken')), /agent_runtime_symlink/u);
});

test('the real frozen Buildr npm artifact installs the private runtime without sibling source or registry downloads', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-agent-npm-consumer-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const artifact = await createReleaseArtifactFixture(root, 'a'.repeat(40));
  const consumer = path.join(root, 'consumer');
  fs.mkdirSync(consumer);
  const installed = spawnSync(process.execPath, [path.join(serviceRoot, 'tools/development/run-development-npm.ts'),
    'install', '--prefix', consumer, '--ignore-scripts', '--offline', '--no-audit', '--no-fund', artifact.tarball], {
    cwd: consumer, encoding: 'utf8', timeout: 60_000, env: { ...process.env, npm_config_cache: path.join(root, 'empty-cache') },
  });
  assert.equal(installed.status, 0, installed.stderr);
  const packageRoot = path.join(consumer, 'node_modules/@buildr-ai/buildr');
  assert.equal(verifyApplicationPayload(packageRoot, { layout: 'installed' }).manifest.applicationPayloadDigest, artifact.manifest.applicationPayloadDigest);
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(path.join(consumer, 'node_modules/@buildr-ai/buildr/package.json'))});
    const api = await import(require.resolve('@buildr-ai/buildr-agent'));
    if (!Object.keys(api).length) throw new Error('public API missing');
    const assert = await import('node:assert/strict');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const profile = path.join(${JSON.stringify(root)}, 'prepared-public-consumer');
    const prepared = api.createAgentService({dataRoot:profile,executors:[{descriptor:{id:'codex',label:'Codex',capabilities:{text:true,images:false,approval:true,questions:true,stop:true,resume:true,maxInputBytes:65536}},open:async()=>{throw new Error('missing program cannot execute');}}],programManager:{discover:async()=>({candidates:[],installation:{label:'Official Codex',version:'0.163.0',url:'https://learn.chatgpt.com/docs/cli',canInstall:true}}),install:async()=>{throw new Error('not authorized');}},resolveWorkspace:()=>({rootPath:profile}),assertTask:()=>{}});
    try {
      const attempt=prepared.connections.prepare('codex',{expectedRevision:'unconfigured'});
      for(let n=0;n<100&&prepared.connections.preparation('codex',attempt.id).state==='discovering';n++)await new Promise(resolve=>setTimeout(resolve,5));
      assert.equal(prepared.connections.currentPreparation('codex').attempt.state,'installation-required');
      assert.equal((await prepared.connections.cancelPreparation('codex',attempt.id)).state,'cancelled');
    } finally {await prepared.close();}
    const agentRequire = createRequire(require.resolve('@buildr-ai/buildr-agent'));
    const agentRoot = path.dirname(agentRequire.resolve('@buildr-ai/buildr-agent/package.json'));
    const { toolEnvironment } = await import('node:url').then(({ pathToFileURL }) => import(pathToFileURL(path.join(agentRoot, 'build/executors/tool-environment.js')).href));
    assert.equal(toolEnvironment({ HOME: '/users/clean' }, 'darwin').PLAYWRIGHT_BROWSERS_PATH, '/users/clean/Library/Caches/ms-playwright');
    assert.equal(toolEnvironment({ HOME: '/users/clean', PLAYWRIGHT_BROWSERS_PATH: '0' }).PLAYWRIGHT_BROWSERS_PATH, '0');
    const installedSkillRoot = path.join(process.cwd(), 'payload/product/resources/runtime/skills/buildr');
    const connectionGuide = fs.readFileSync(path.join(installedSkillRoot, 'references/agent-operations.md'), 'utf8');
    assert.ok(connectionGuide.includes('BUILDR_HOST_HOME'), 'the installed connection guide must explain host tool discovery');
    assert.ok(connectionGuide.includes('PLAYWRIGHT_BROWSERS_PATH'), 'the installed connection guide must explain browser cache reuse');
    const dependencies = JSON.parse(fs.readFileSync(path.join(agentRoot, 'package.json'), 'utf8')).dependencies;
    const permissionRemote = await import(agentRequire.resolve('@deepseek-ai/dsh-permission-presets/remote'));
    const sdk = await import(agentRequire.resolve('@qoder-ai/qoder-agent-sdk'));
    const client = await import(agentRequire.resolve('@deepseek-ai/dsh-client-connection/client'));
    assert.ok(dependencies['@deepseek-ai/dsh-permission-presets'] === '0.2.1-rc.2'
      && permissionRemote.default && typeof sdk.query === 'function' && typeof client.installConnection === 'function'
      && Object.entries(dependencies).every(([name, version]) => JSON.parse(fs.readFileSync(path.join(agentRoot, 'node_modules', name, 'package.json'), 'utf8')).version === version),
      'offline artifact must include the new permission remote and retain every pinned private runtime dependency');
    console.log('frozen-private-runtime-passed');
  `], { cwd: packageRoot, env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 20_000 });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout, /frozen-private-runtime-passed/u);
});
