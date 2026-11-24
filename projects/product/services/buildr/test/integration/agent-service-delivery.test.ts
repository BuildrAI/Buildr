import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import test from 'node:test';
import { copyAgentRuntimePackage } from '../../tools/build/agent-package.ts';
import { prepareDevelopmentAgent } from '../../tools/development/prepare-development-agent.ts';
import { createReleaseArtifactFixture } from '../helpers/release-artifact-fixture.ts';
import { verifyApplicationPayload } from '../../src/infrastructure/product-resources/index.ts';
import { acquireExclusiveFileLock, releaseExclusiveFileLock } from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');

/** Minimal complete source package; production packaging remains strict about every required tree. */
function createPreparationFixture(agent: string, entry: string): void {
  for (const directory of ['build', 'bin', 'resources']) fs.mkdirSync(path.join(agent, directory), { recursive: true });
  fs.writeFileSync(path.join(agent, 'package.json'), JSON.stringify({ name: '@buildr-ai/buildr-harness', version: '0.1.0', private: true, dependencies: {}, bin: { 'buildr-harness': 'bin/buildr-harness.mjs' } }));
  fs.writeFileSync(path.join(agent, 'LICENSE'), 'fixture');
  fs.writeFileSync(path.join(agent, 'build/index.js'), entry);
  fs.writeFileSync(path.join(agent, 'bin/buildr-harness.mjs'), '#!/usr/bin/env node\nconsole.log("fixture");\n', { mode: 0o755 });
  fs.writeFileSync(path.join(agent, 'resources/platform-support.json'), JSON.stringify({ fixture: true }));
}

test('dependency preparation waits for Agent publication and adopts its completed build', { timeout: 10_000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-harness-build-owner-'));
  const host = path.join(root, 'services/buildr'), agent = path.join(root, 'services/buildr-harness');
  const destination = path.join(host, 'node_modules/@buildr-ai/buildr-harness');
  const lock = acquireExclusiveFileLock(path.join(host, 'node_modules/.buildr-harness-preparation.lock'), destination);
  fs.writeFileSync(path.join(root, 'preparation.yml'), 'schemaVersion: buildr.project-preparation/v1\nentries:\n  - id: buildr-harness.build\n    cwd: services/buildr-harness\n    executable: build\n    args: []\n');
  const script = path.join(root, 'waiter.mjs');
  fs.writeFileSync(script, `import {prepareDevelopmentDependencies} from ${JSON.stringify(pathToFileURL(path.join(serviceRoot, 'tools/development/prepare-development-dependencies.ts')).href)};
process.send('started');
const result=prepareDevelopmentDependencies({root:${JSON.stringify(root)},execute(){process.send('duplicate-build');return {status:0};},log(){}});
process.send(result);`);
  const child = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env, NODE_OPTIONS: '' } });
  t.after(async () => {
    releaseExclusiveFileLock(lock);
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await once(child, 'close'); }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const messages: unknown[] = [];
  child.on('message', value => messages.push(value));
  assert.equal((await once(child, 'message'))[0], 'started');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(messages, ['started'], 'a competing builder cannot bypass the package owner');
  fs.mkdirSync(path.join(agent, 'build'), { recursive: true });
  fs.writeFileSync(path.join(agent, 'build/index.js'), 'export const ready=true;');
  assert.equal(releaseExclusiveFileLock(lock), true);
  assert.deepEqual(await once(child, 'close'), [0, null]);
  assert.deepEqual(messages, ['started', { executed: [], reused: ['buildr-harness.build'] }]);
});

test('old staging cleanup failure does not revoke the newly published complete runtime', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-harness-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const host = path.join(root, 'host'), agent = path.join(root, 'agent');
  createPreparationFixture(agent, 'export const ready = "old";\n');
  const destination = prepareDevelopmentAgent({ serviceRoot: host, agentRoot: agent, build: false });
  fs.writeFileSync(path.join(agent, 'build/index.js'), 'export const ready = "new";\n');
  const remove = fs.rmSync, diagnostics: string[] = [];
  let retained: string | undefined;
  t.mock.method(process.stderr, 'write', (text: string) => { diagnostics.push(String(text)); return true; });
  t.mock.method(fs, 'rmSync', (file: fs.PathLike, options?: fs.RmOptions) => {
    if (String(file).startsWith(path.join(host, 'node_modules/@buildr-ai/.buildr-harness-stage-')) && String(file).endsWith('-previous')) {
      assert.equal(options?.maxRetries, 5);
      retained = String(file);
      throw Object.assign(new Error('temporary directory not empty'), { code: 'ENOTEMPTY' });
    }
    return remove(file, options);
  });
  assert.equal(prepareDevelopmentAgent({ serviceRoot: host, agentRoot: agent, build: false }), destination);
  assert.equal(fs.readFileSync(path.join(destination, 'build/index.js'), 'utf8'), 'export const ready = "new";\n');
  assert.ok(retained && fs.existsSync(retained));
  assert.ok(diagnostics.some(line => line.includes('agent_preparation_cleanup_retained') && line.includes('ENOTEMPTY')));
  assert.equal(prepareDevelopmentAgent({ serviceRoot: host, agentRoot: agent, build: false }), destination, 'retry preserves the published package');
});

test('concurrent source preparations wait for their owner and publish a complete public package', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-harness-prepare-concurrent-'));
  const children: ReturnType<typeof spawn>[] = [];
  let lock: ReturnType<typeof acquireExclusiveFileLock>;
  t.after(() => {
    releaseExclusiveFileLock(lock);
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const host = path.join(root, 'host'), agent = path.join(root, 'agent');
  createPreparationFixture(agent, 'export const ready = true;\n');
  const destination = path.join(host, 'node_modules/@buildr-ai/buildr-harness');
  lock = acquireExclusiveFileLock(path.join(host, 'node_modules/.buildr-harness-preparation.lock'), destination);
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
  const publicEntry = path.join(destination, 'build/index.js');
  const preparedFile = fs.statSync(publicEntry);
  prepareDevelopmentAgent({ serviceRoot: host, agentRoot: agent, build: false });
  assert.equal(fs.statSync(publicEntry).ino, preparedFile.ino, 'unchanged preparation preserves the public files that concurrent consumers are reading');
  fs.writeFileSync(path.join(agent, 'build/index.js'), 'export const ready = "updated";\n');
  prepareDevelopmentAgent({ serviceRoot: host, agentRoot: agent, build: false });
  assert.equal(fs.readFileSync(publicEntry, 'utf8'), 'export const ready = "updated";\n', 'changed runtime bytes must still be adopted');
  fs.writeFileSync(path.join(agent, 'package.json'), JSON.stringify({ name: '@buildr-ai/buildr-harness', version: '0.1.0', private: true, dependencies: { '@buildr-harness-fixture/missing': '1.0.0' } }));
  assert.throws(() => prepareDevelopmentAgent({ serviceRoot: host, agentRoot: agent, build: false }), /agent_runtime_dependency_missing/u);
  assert.equal(fs.readFileSync(path.join(destination, 'build/index.js'), 'utf8'), 'export const ready = "updated";\n', 'failed staging preserves the previously usable runtime');
  assert.deepEqual(fs.readdirSync(path.dirname(destination)), ['buildr-harness']);
});

test('unchanged Agent preparation avoids staging and repairs same-size output drift', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-harness-prepare-content-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const host = path.join(root, 'host'), agent = path.join(root, 'agent');
  createPreparationFixture(agent, 'original');
  const options = { serviceRoot: host, agentRoot: agent, build: false };
  const destination = prepareDevelopmentAgent(options);
  const mkdir = t.mock.method(fs, 'mkdtempSync', () => { throw Error('unchanged preparation must not stage a copy'); });
  assert.equal(prepareDevelopmentAgent(options), destination);
  mkdir.mock.restore();
  const entry = path.join(destination, 'build/index.js'), original = fs.statSync(entry);
  fs.writeFileSync(entry, 'tampered');
  fs.utimesSync(entry, original.atime, original.mtime);
  prepareDevelopmentAgent(options);
  assert.equal(fs.readFileSync(entry, 'utf8'), 'original');
  fs.writeFileSync(path.join(destination, 'extra'), 'unexpected');
  prepareDevelopmentAgent(options);
  assert.equal(fs.existsSync(path.join(destination, 'extra')), false);
  if (process.platform !== 'win32') {
    fs.chmodSync(entry, 0o777);
    prepareDevelopmentAgent(options);
    assert.equal(fs.statSync(entry).mode & 0o777, original.mode & 0o777);
  }
});

test('shared test preparation rebuilds only when Harness build evidence is absent or invalid', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-harness-prepare-reuse-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const host = path.join(root, 'host'), agent = path.join(root, 'buildr-harness');
  const web = path.join(root, 'buildr-harness-web');
  const put = (base: string, file: string, content = '') => {
    fs.mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
    fs.writeFileSync(path.join(base, file), content);
  };
  createPreparationFixture(agent, 'original');
  for (const file of ['src/fixture.ts', 'tools/codegen/fixture.ts', 'node_modules/compiler/fixture.js', 'package-lock.json', 'tsconfig.json']) put(agent, file);
  for (const file of ['src/fixture.ts', 'node_modules/bundler/fixture.js', 'index.html', 'mermaid-renderer.html', 'vite.config.ts', 'tsconfig.json', 'package-lock.json']) put(web, file);
  put(web, 'package.json', '{"type":"module"}');
  put(web, 'tools/build.ts', `
    import fs from 'node:fs';
    fs.appendFileSync('../builds', 'web\\n');
    fs.mkdirSync('dist', {recursive: true});
    fs.mkdirSync('build/generated', {recursive: true});
    fs.writeFileSync('dist/index.html', 'page');
    fs.writeFileSync('dist/mermaid-renderer.html', 'mermaid');
    fs.writeFileSync('build/generated/agent-service-http-dto.ts', 'dto');
  `);
  put(agent, 'tools/build.ts', `
    import fs from 'node:fs';
    fs.appendFileSync('../builds', 'core\\n');
    if (fs.existsSync('../fail')) process.exit(1);
    fs.mkdirSync('build/harness-web-dist', {recursive: true});
    fs.writeFileSync('build/harness-web-dist/index.html', 'page');
    fs.writeFileSync('build/index.js', 'ready');
    fs.writeFileSync('build/http-dto.d.ts', 'dto');
    if (fs.existsSync('../drift')) fs.appendFileSync('src/fixture.ts', '// source changed during build\\n');
  `);
  const run = path.join(root, 'run.mjs');
  const prepare = pathToFileURL(path.join(serviceRoot, 'tools/development/prepare-development-agent.ts')).href;
  put(root, 'run.mjs', `import {prepareDevelopmentAgent} from ${JSON.stringify(prepare)};
    prepareDevelopmentAgent(${JSON.stringify({ serviceRoot: host, agentRoot: agent, reuseBuild: true })});`);
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' };
  delete env.BUILDR_HARNESS_WEB_DIST;
  let scratch = 'first';
  const attempt = () => spawnSync(process.execPath, [run], {
    cwd: root, env: { ...env, BUILDR_TEST_LOCAL_STATE_ROOT: path.join(root, scratch) },
    encoding: 'utf8', timeout: 10_000,
  });
  const buildCount = () => (fs.readFileSync(path.join(root, 'builds'), 'utf8').match(/core\n/g) ?? []).length;
  const ready = (count: number, reused = false) => {
    const result = attempt();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(buildCount(), count);
    assert.equal(result.stderr.includes('verified Harness build reused'), reused);
  };
  ready(1);
  scratch = 'second'; // A fresh verification sandbox must not invalidate the build.
  ready(1, true);
  const installedEntry = path.join(host, 'node_modules/@buildr-ai/buildr-harness/build/index.js');
  fs.writeFileSync(installedEntry, 'stale');
  ready(1, true);
  assert.equal(fs.readFileSync(installedEntry, 'utf8'), 'ready', 'reuse still repairs the installed copy');

  put(web, 'dist/index.html', 'fake'); // Same size as the real output.
  ready(2);
  put(agent, 'src/fixture.ts', '// changed');
  ready(3);
  put(web, 'node_modules/bundler/fixture.js', '// dependency changed');
  ready(4);
  env.VITE_FIXTURE = 'runtime-value';
  ready(5);
  put(web, '.env.production', 'VITE_FIXTURE=changed');
  ready(6);
  scratch = 'third'; // A dotenv file may refer to this variable.
  ready(7);
  fs.unlinkSync(path.join(web, 'dist/mermaid-renderer.html'));
  put(root, 'fail');
  const failed = attempt();
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /agent_preparation_build_failed/u);
  fs.unlinkSync(path.join(root, 'fail'));
  put(root, 'drift');
  ready(9);
  fs.unlinkSync(path.join(root, 'drift'));
  ready(10);
  ready(10, true);
});

test('missing required Harness launcher or resources preserves the previously prepared runtime', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-harness-required-trees-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const missing of ['bin', 'resources']) {
    const agent = path.join(root, missing, 'agent'), host = path.join(root, missing, 'host');
    createPreparationFixture(agent, 'export const ready = true;\n');
    const options = { serviceRoot: host, agentRoot: agent, build: false };
    const destination = prepareDevelopmentAgent(options);
    for (const file of ['bin/buildr-harness.mjs', 'resources/platform-support.json']) {
      assert.equal(fs.readFileSync(path.join(destination, file), 'utf8'), fs.readFileSync(path.join(agent, file), 'utf8'));
    }
    fs.rmSync(path.join(agent, missing), { recursive: true });
    assert.throws(() => prepareDevelopmentAgent(options), (error: unknown) => {
      assert.equal((error as NodeJS.ErrnoException).code, 'ENOENT');
      assert.equal((error as NodeJS.ErrnoException).path, path.join(agent, missing));
      return true;
    });
    assert.equal(fs.readFileSync(path.join(destination, 'build/index.js'), 'utf8'), 'export const ready = true;\n');
    assert.ok(fs.existsSync(path.join(destination, missing)), 'failed preparation must retain the complete published tree');
  }
});

test('the compiled public Agent package loads away from the development checkout without external vendor SDKs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-harness-package-consumer-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  prepareDevelopmentAgent({ build: false });
  const copied = copyAgentRuntimePackage(serviceRoot, root);
  for (const forbidden of ['@anthropic-ai', '@qoder-ai', '@deepseek-ai']) {
    assert.equal(fs.existsSync(path.join(copied, 'node_modules', forbidden)), false, `bundled runtime must exclude external SDK scope ${forbidden}`);
  }
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(root, 'consumer.mjs'), `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    const hostRequire = createRequire(import.meta.url);
    const hostApi = hostRequire('@buildr-ai/buildr-harness');
    assert.equal(typeof hostApi.createAgentService, 'function', 'the bundled CJS host must load the cold public package synchronously');
    const api = await import('@buildr-ai/buildr-harness');
    assert.equal(api.createAgentService, hostApi.createAgentService);
    assert.ok(Object.keys(api).length > 0);
    const require = createRequire(import.meta.resolve('@buildr-ai/buildr-harness'));
    const ajv = await import(require.resolve('ajv'));
    assert.ok(ajv.default);
    assert.throws(() => require.resolve('@buildr-ai/buildr-harness/src/index.ts'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-harness-package-link-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const copied = copyAgentRuntimePackage(serviceRoot, root);
  fs.symlinkSync(path.join(serviceRoot, 'src'), path.join(copied, 'external-source'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => copyAgentRuntimePackage(root, path.join(root, 'broken')), /agent_runtime_symlink/u);
});

test('the real frozen Buildr npm artifact installs the private runtime without sibling source or registry downloads', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-harness-npm-consumer-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const artifact = await createReleaseArtifactFixture(root, 'a'.repeat(40));
  const consumer = path.join(root, 'consumer');
  fs.mkdirSync(consumer);
  const installed = spawnSync(process.execPath, [path.join(serviceRoot, 'tools/development/run-development-npm.ts'),
    'install', '--prefix', consumer, '--ignore-scripts', '--offline', '--no-audit', '--no-fund', artifact.tarball], {
    cwd: consumer, encoding: 'utf8', timeout: 60_000, env: { ...process.env, npm_config_cache: path.join(root, 'empty-cache'), NPM_CONFIG_CACHE: path.join(root, 'empty-cache') },
  });
  assert.equal(installed.status, 0, installed.stderr);
  const packageRoot = path.join(consumer, 'node_modules/@buildr-ai/buildr');
  assert.equal(verifyApplicationPayload(packageRoot, { layout: 'installed' }).manifest.applicationPayloadDigest, artifact.manifest.applicationPayloadDigest);
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(path.join(consumer, 'node_modules/@buildr-ai/buildr/package.json'))});
    const api = await import(require.resolve('@buildr-ai/buildr-harness'));
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
    const agentRequire = createRequire(require.resolve('@buildr-ai/buildr-harness'));
    const agentRoot = path.dirname(agentRequire.resolve('@buildr-ai/buildr-harness/package.json'));
    const { toolEnvironment } = await import('node:url').then(({ pathToFileURL }) => import(pathToFileURL(path.join(agentRoot, 'build/executors/tool-environment.js')).href));
    assert.equal(toolEnvironment({ HOME: '/users/clean' }, 'darwin').PLAYWRIGHT_BROWSERS_PATH, '/users/clean/Library/Caches/ms-playwright');
    assert.equal(toolEnvironment({ HOME: '/users/clean', PLAYWRIGHT_BROWSERS_PATH: '0' }).PLAYWRIGHT_BROWSERS_PATH, '0');
    const installedSkillRoot = path.join(process.cwd(), 'payload/product/resources/runtime/skills/buildr');
    const connectionGuide = fs.readFileSync(path.join(installedSkillRoot, 'references/agent-operations.md'), 'utf8');
    assert.ok(connectionGuide.includes('BUILDR_HOST_HOME'), 'the installed connection guide must explain host tool discovery');
    assert.ok(connectionGuide.includes('PLAYWRIGHT_BROWSERS_PATH'), 'the installed connection guide must explain browser cache reuse');
    const dependencies = JSON.parse(fs.readFileSync(path.join(agentRoot, 'package.json'), 'utf8')).dependencies;
    for (const forbidden of ['@anthropic-ai', '@qoder-ai', '@deepseek-ai']) {
      assert.equal(fs.existsSync(path.join(agentRoot, 'node_modules', forbidden)), false, 'offline artifact must exclude external SDK scope ' + forbidden);
    }
    assert.ok(Object.keys(dependencies).every(name => !['@anthropic-ai/', '@qoder-ai/', '@deepseek-ai/'].some(prefix => name.startsWith(prefix)))
      && Object.entries(dependencies).every(([name, version]) => JSON.parse(fs.readFileSync(path.join(agentRoot, 'node_modules', name, 'package.json'), 'utf8')).version === version),
      'offline artifact must exclude external vendor SDKs and retain every pinned core runtime dependency');
    console.log('frozen-private-runtime-passed');
  `], { cwd: packageRoot, env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 20_000 });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout, /frozen-private-runtime-passed/u);
});

test('Development and Harness Dev entries share the identical pruned runtime digest without retiring each other', { timeout: 30_000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-unified-harness-digest-'));
  const dataRoot = path.join(root, 'shared-data');
  let stopRuntime: (() => Promise<unknown>) | undefined;
  t.after(async () => {
    if (stopRuntime) await stopRuntime().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  });
  const workspaceService = path.join(root, 'services/buildr');
  const harnessSource = path.join(root, 'services/buildr-harness');
  const harnessWebSource = path.join(root, 'services/buildr-harness-web');
  fs.mkdirSync(workspaceService, { recursive: true });
  createPreparationFixture(harnessSource, 'export const ready = true;\n');
  fs.mkdirSync(path.join(harnessSource, 'build/process'), { recursive: true });
  fs.writeFileSync(path.join(harnessSource, 'build/process/entry.js'), 'export {};\n');
  fs.mkdirSync(path.join(harnessSource, 'node_modules/@types/dev-only'), { recursive: true });
  fs.writeFileSync(path.join(harnessSource, 'node_modules/@types/dev-only/package.json'), '{"name":"@types/dev-only","version":"1.0.0"}');
  fs.writeFileSync(path.join(harnessSource, 'build/index.js.map'), '{"version":3}');
  fs.mkdirSync(path.join(harnessWebSource, 'src'), { recursive: true });
  fs.mkdirSync(path.join(harnessWebSource, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(harnessWebSource, 'package.json'), JSON.stringify({ name: '@buildr-ai/buildr-harness-web', version: '0.1.0', private: true }));
  fs.writeFileSync(path.join(harnessWebSource, 'tools/dev-server.mjs'), 'export {};\n');

  const preparedDir = prepareDevelopmentAgent({ serviceRoot: workspaceService, agentRoot: harnessSource, build: false });
  const unifiedHarnessEntry = path.join(workspaceService, 'node_modules/@buildr-ai/buildr-harness/bin/buildr-harness.mjs');
  assert.equal(fs.existsSync(unifiedHarnessEntry), true);

  const { computeAgentRuntimeDigest, prepareAgentRuntimeAsync, activateAgentRuntime, stopAgentProcess } = await import('@buildr-ai/buildr-harness');
  const harnessEntryPackageRoot = path.resolve(path.dirname(unifiedHarnessEntry), '..');
  assert.equal(
    computeAgentRuntimeDigest({ packageRoot: preparedDir, node: process.execPath }),
    computeAgentRuntimeDigest({ packageRoot: harnessEntryPackageRoot, node: process.execPath }),
    'Development Dev and unified Harness Dev entry must produce identical runtime digests',
  );
  assert.notEqual(
    computeAgentRuntimeDigest({ packageRoot: preparedDir, node: process.execPath }),
    computeAgentRuntimeDigest({ packageRoot: harnessSource, node: process.execPath }),
    'unpruned source directory with devDependencies/.map must not match the pruned runtime package',
  );

  const realPreparedRoot = path.join(serviceRoot, 'node_modules/@buildr-ai/buildr-harness');
  if (fs.existsSync(path.join(realPreparedRoot, 'build/process/entry.js'))) {
    stopRuntime = () => stopAgentProcess({ dataRoot, profileId: 'development', mode: 'stop-owned' });
    const devRuntime = await prepareAgentRuntimeAsync({ dataRoot, packageRoot: realPreparedRoot });
    const first = await activateAgentRuntime({ dataRoot, profileId: 'development', runtime: devRuntime, sourceId: 'buildr' });
    const harnessRuntime = await prepareAgentRuntimeAsync({ dataRoot, packageRoot: realPreparedRoot });
    const second = await activateAgentRuntime({ dataRoot, profileId: 'development', runtime: harnessRuntime, sourceId: 'harness-local' });
    assert.equal(second.currentDigest, first.currentDigest);
    assert.equal(second.generation, first.generation);
    const retiredFile = path.join(dataRoot, 'agent-service/process/retired-runtimes.json');
    const retired = fs.existsSync(retiredFile) ? JSON.parse(fs.readFileSync(retiredFile, 'utf8')) : [];
    assert.deepEqual(retired, [], 're-activating unified runtime across both product entries must not retire any digest');
  }
});
