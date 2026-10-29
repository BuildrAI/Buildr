import '../register-development-entry.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createVerificationExecutor } from '../verification/executor.ts';
import { createVerificationPlan } from '../verification/planner.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const bootstrap = pathToFileURL(path.join(serviceRoot, 'test/register-development-entry.ts')).href;
const harness = pathToFileURL(path.join(serviceRoot, 'test/helpers/runtime-harness.ts')).href;
const buildr = path.join(serviceRoot, 'bin/buildr.mjs');

test('changes to shared test isolation select its primary integration owner', () => {
  for (const file of ['test/register-development-entry.ts', 'tools/development/isolated-workspace-state.ts']) {
    const plan = createVerificationPlan({ paths: [file] });
    assert.equal(plan.status, 'ready');
    assert.ok(plan.steps.some((step: any) => step.id === 'integration-verification'));
  }
});

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-state-isolation-proof-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appData = path.join(root, 'retained-app'), productData = path.join(root, 'retained-product');
  for (const directory of [appData, productData]) {
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'keep'), 'retained user state');
  }
  const externalTemp = path.join(root, 'retained-temp');
  fs.mkdirSync(externalTemp);
  fs.writeFileSync(path.join(externalTemp, 'keep'), 'retained temporary data');
  const env: NodeJS.ProcessEnv = { ...process.env, BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: productData, TMPDIR: externalTemp, TMP: externalTemp, TEMP: externalTemp };
  env.NODE_TEST_CONTEXT = undefined;
  return { root, appData, productData, externalTemp, env };
}

test('direct application and child CLI init keep auto-registration inside test state', t => {
  const f = fixture(t);
  const script = path.join(f.root, 'direct-check.mjs');
  const workspaces = ['application', 'cli', 'source-only'].map(name => path.join(f.root, name));
  fs.writeFileSync(script, `
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRuntime } from ${JSON.stringify(harness)};
const roots = ${JSON.stringify(workspaces)};
const log = console.log;
console.log = () => {};
createRuntime().initBuildr(['--target', roots[0], '--name', 'Application', '--profile', 'personal']);
console.log = log;
for (const [index, extra] of [[1, []], [2, ['--source-only']]]) {
  const result = spawnSync(process.execPath, [${JSON.stringify(buildr)}, 'init', '--target', roots[index], '--name', 'CLI', ...extra], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
const registry = JSON.parse(fs.readFileSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'workspace-registry.json'), 'utf8'));
console.log(JSON.stringify({ root: process.env.BUILDR_TEST_LOCAL_STATE_ROOT, app: process.env.BUILDR_APP_DATA_DIR, product: process.env.BUILDR_PRODUCT_DATA_DIR, roots: registry.roots }));
`);
  const result = spawnSync(process.execPath, [script], { cwd: serviceRoot, env: { ...f.env, NODE_COMPILE_CACHE: path.join(f.root, 'compile-cache') }, encoding: 'utf8', timeout: 120_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  const observed = JSON.parse(result.stdout.trim());
  assert.notEqual(observed.app, f.appData);
  assert.notEqual(observed.product, f.productData);
  assert.deepEqual(observed.roots, workspaces.slice(0, 2));
  assert.equal(fs.existsSync(observed.root), false, 'owned test state must be removed after success');
  for (const directory of [f.appData, f.productData]) assert.deepEqual(fs.readdirSync(directory), ['keep']);
  assert.ok(fs.existsSync(path.join(workspaces[2], '.buildr/workspace.yml')));
});

test('parallel verification steps isolate both local stores and clean successful and failed children', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'check.mjs'), `
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const observation = { root: process.env.BUILDR_TEST_LOCAL_STATE_ROOT, app: process.env.BUILDR_APP_DATA_DIR, product: process.env.BUILDR_PRODUCT_DATA_DIR };
const os = await import('node:os');
observation.temp = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-temp-proof-'));
fs.writeFileSync(path.join(observation.temp, 'owned'), 'temporary test files');
for (const directory of [observation.app, observation.product]) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'owned'), process.argv[2]);
}
const child = spawnSync(process.execPath, ['-e', 'process.stdout.write([process.env.BUILDR_APP_DATA_DIR, process.env.BUILDR_PRODUCT_DATA_DIR].join(String.fromCharCode(10)))'], { encoding: 'utf8' });
if (child.status !== 0) throw new Error(child.stderr);
observation.child = child.stdout;
console.log(JSON.stringify(observation));
if (process.argv[2] === 'failed') process.exitCode = 7;
`);
  const execute = createVerificationExecutor({ productRoot: f.root, env: f.env, minimumNodeVersion: null });
  const results = await Promise.all(['passed', 'failed'].map(id => execute({
    id, executor: { type: 'node', file: 'check.mjs', args: [id] }, timeoutMs: 10_000,
  })));
  assert.deepEqual(results.map(result => result.status), ['passed', 'failed']);
  const observations = results.map(result => JSON.parse(result.stdout.trim()));
  assert.notEqual(observations[0].root, observations[1].root);
  for (const observed of observations) {
    assert.equal(observed.child, observed.app + '\n' + observed.product);
    assert.notEqual(observed.app, f.appData);
    assert.notEqual(observed.product, f.productData);
    assert.equal(fs.existsSync(observed.root), false);
    assert.equal(fs.existsSync(observed.temp), false, 'temporary files must be cleaned after successful and failed steps');
  }
  for (const directory of [f.appData, f.productData]) assert.deepEqual(fs.readdirSync(directory), ['keep']);
});

test('managed node-test workers receive separate local state even without application helpers', async t => {
  const f = fixture(t);
  for (const name of ['first', 'second']) fs.writeFileSync(path.join(f.root, name + '.test.mjs'), `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
test('writes only this worker state', () => {
  fs.writeFileSync(${JSON.stringify(path.join(f.root, name + '.json'))}, JSON.stringify({ root: process.env.BUILDR_TEST_LOCAL_STATE_ROOT, app: process.env.BUILDR_APP_DATA_DIR }));
  assert.ok(process.env.BUILDR_APP_DATA_DIR);
});
`);
  const execute = createVerificationExecutor({ productRoot: f.root, env: f.env, minimumNodeVersion: null });
  const result = await execute({ id: 'workers', executor: { type: 'node-test', files: ['*.test.mjs'] }, timeoutMs: 10_000 });
  assert.equal(result.status, 'passed', result.stderr || result.stdout);
  const observed = ['first', 'second'].map(name => {
    assert.equal(fs.existsSync(path.join(f.root, name + '.json')), true, result.stdout + result.stderr);
    return JSON.parse(fs.readFileSync(path.join(f.root, name + '.json'), 'utf8'));
  });
  assert.notEqual(observed[0].root, observed[1].root);
  for (const worker of observed) {
    assert.notEqual(worker.app, f.appData);
    assert.equal(fs.existsSync(worker.root), false);
  }
});

for (const fail of [false, true]) test(`standalone test preload cleans local state after exit; failure=${fail}`, t => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, ['--import', bootstrap, '-e',
    `const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-temp-proof-'));
fs.writeFileSync(path.join(temp, 'owned'), 'temporary test files');
process.stdout.write(JSON.stringify({ root: process.env.BUILDR_TEST_LOCAL_STATE_ROOT, app: process.env.BUILDR_APP_DATA_DIR, temp }));` + (fail ? "throw new Error('intentional failure')" : ''),
  ], { env: f.env, encoding: 'utf8' });
  assert.equal(result.status, fail ? 1 : 0, result.stderr);
  const observed = JSON.parse(result.stdout);
  assert.notEqual(observed.app, f.appData);
  assert.equal(fs.existsSync(observed.root), false);
  assert.equal(fs.existsSync(observed.temp), false, 'preload must clean temporary files even when the test throws');
  assert.deepEqual(fs.readdirSync(f.externalTemp), ['keep'], 'cleanup must retain the caller temporary directory');
});

test('verification timeout cleans nested worker state after process termination', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'timeout.mjs'), `
import ${JSON.stringify(bootstrap)};
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-temp-proof-'));
fs.writeFileSync(path.join(temp, 'owned'), 'temporary test files');
console.log(JSON.stringify({ root: process.env.BUILDR_TEST_LOCAL_STATE_ROOT, temp }));
setInterval(() => {}, 1000);
`);
  const execute = createVerificationExecutor({ productRoot: f.root, env: f.env, minimumNodeVersion: null });
  const result = await execute({ id: 'timeout', executor: { type: 'node', file: 'timeout.mjs' }, timeoutMs: 500, killGraceMs: 100 });
  assert.notEqual(result.status, 'passed');
  const observed = JSON.parse(result.stdout.trim());
  assert.equal(fs.existsSync(observed.root), false);
  assert.equal(fs.existsSync(observed.temp), false, 'timeout cleanup must include nested worker temporary files');
});

test('test temporary isolation retains reusable verification evidence outside disposable state', t => {
  const f = fixture(t);
  const reuse = pathToFileURL(path.join(serviceRoot, 'test/verification/verification-reuse.ts')).href;
  const script = path.join(f.root, 'reuse-check.mjs');
  fs.writeFileSync(script, `
import fs from 'node:fs';
import path from 'node:path';
import { resolveVerificationReuseDirectory } from ${JSON.stringify(reuse)};
const options = { productRoot: ${JSON.stringify(serviceRoot)} };
const before = resolveVerificationReuseDirectory(options);
await import(${JSON.stringify(bootstrap)});
const after = resolveVerificationReuseDirectory(options);
fs.mkdirSync(after, { recursive: true });
fs.writeFileSync(path.join(after, 'proof'), 'reusable verification evidence');
console.log(JSON.stringify({ before, after, root: process.env.BUILDR_TEST_LOCAL_STATE_ROOT }));
`);
  const result = spawnSync(process.execPath, [script], {
    env: { ...f.env, BUILDR_VERIFICATION_REUSE_DIR: undefined, BUILDR_TEST_SHARED_TEMP_ROOT: f.externalTemp }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const observed = JSON.parse(result.stdout);
  assert.equal(observed.after, observed.before, 'temporary isolation must not move the reusable verification store');
  assert.equal(fs.existsSync(observed.root), false);
  assert.equal(fs.readFileSync(path.join(observed.after, 'proof'), 'utf8'), 'reusable verification evidence');
});
