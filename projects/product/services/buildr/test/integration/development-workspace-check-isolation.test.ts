import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { stopOwnedChildProcess } from '../verification/support/owned-process.ts';

const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
const runner: any = path.join(serviceRoot, 'tools/development/run-isolated-workspace-check.ts');
const failingScenario: any = path.join(serviceRoot, 'test/fixtures/failing-workspace-check.ts');

function snapshot(root: any): any  {
  const entries: any[] = [];
  function visit(current: any, relative: any = '.'): any  {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute: any = path.join(current, name);
      const item: any = path.join(relative, name);
      const stat: any = fs.lstatSync(absolute);
      if (stat.isDirectory()) {
        entries.push({ path: item, type: 'directory', mode: stat.mode & 0o777 });
        visit(absolute, item);
      } else {
        entries.push({
          path: item,
          type: 'file',
          mode: stat.mode & 0o777,
          sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),
        });
      }
    }
  }
  visit(root);
  return entries;
}

function setupUserState(t: any): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-smoke-user-state-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appData: any = path.join(root, 'released-web');
  const productData: any = path.join(root, 'product');
  fs.mkdirSync(appData, { recursive: true });
  fs.mkdirSync(productData, { recursive: true });
  fs.writeFileSync(path.join(appData, 'workspaces.json'), '{"sentinel":"released registry"}\n');
  fs.writeFileSync(path.join(productData, 'state.json'), '{"sentinel":"product state"}\n');
  return { appData, productData, before: snapshot(root), root };
}

function runWorkspaceCheck(args: any, state: any): any  {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: serviceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      BUILDR_NODE: process.execPath,
      BUILDR_APP_DATA_DIR: state.appData,
      BUILDR_PRODUCT_DATA_DIR: state.productData,
    },
  });
}

function summary(result: any): any  {
  const lines: any = result.stdout.trim().split('\n');
  return JSON.parse(lines.at(-1));
}

test('a nested test scenario starts a fresh Node test protocol and preserves user state', t => {
  const state = setupUserState(t);
  const scenario = path.join(state.root, 'scenario.mjs');
  fs.writeFileSync(scenario, `import test from 'node:test'; import assert from 'node:assert/strict';
test('fresh scenario protocol', () => assert.equal(process.env.NODE_TEST_CONTEXT, undefined));\n`);
  const before = snapshot(state.root);
  const result = runWorkspaceCheck(['--script', scenario], state);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(summary(result).cleanup, 'cleaned');
  assert.match(result.stdout, /fresh scenario protocol/);
  assert.equal(result.stdout.includes('\u0000'), false, 'the parent must not receive the internal binary worker protocol');
  assert.deepEqual(snapshot(state.root), before);
});

test('Workspace check 使用独立数据根并在成功后保持用户状态零副作用', (t: any) => {
  const state: any = setupUserState(t);
  const result: any = runWorkspaceCheck([], state);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const receipt: any = summary(result);
  assert.deepEqual({ status: receipt.status, cleanup: receipt.cleanup, exitCode: receipt.exitCode }, { status: 'passed', cleanup: 'cleaned', exitCode: 0 });
  assert.equal(fs.existsSync(receipt.temporaryRoot), false);
  assert.deepEqual(snapshot(state.root), state.before);
});

test('Workspace check 子场景失败仍清理并保持用户状态零副作用', (t: any) => {
  const state: any = setupUserState(t);
  const result: any = runWorkspaceCheck(['--script', failingScenario], state);
  assert.equal(result.status, 23, result.stderr || result.stdout);
  const receipt: any = summary(result);
  assert.deepEqual({ status: receipt.status, cleanup: receipt.cleanup, exitCode: receipt.exitCode }, { status: 'failed', cleanup: 'cleaned', exitCode: 23 });
  assert.equal(fs.existsSync(receipt.temporaryRoot), false);
  assert.deepEqual(snapshot(state.root), state.before);
});

for (const mode of ['deadline', 'cancellation']) test(`Workspace check external ${mode} stops descendants before deleting owned files`, { timeout: 15_000 }, async t => {
  const state = setupUserState(t);
  const proof = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-smoke-stop-proof-'));
  const observed = path.join(proof, 'processes.json'), stopping = path.join(proof, 'stopping.json');
  const scenario = path.join(proof, 'scenario.cjs');
  fs.writeFileSync(scenario, `
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const root = process.env.BUILDR_SMOKE_ROOT;
process.on('SIGTERM', () => fs.writeFileSync(${JSON.stringify(stopping)}, JSON.stringify({ filesStillPresent: fs.existsSync(root) })));
const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: ['ignore', 'inherit', 'inherit'] });
fs.writeFileSync(${JSON.stringify(observed)}, JSON.stringify({ parent: process.pid, descendant: child.pid, root }));
setInterval(() => {}, 1000);
`);
  const child = spawn(process.execPath, [runner, '--script', scenario], {
    cwd: serviceRoot, env: { ...process.env, BUILDR_NODE: process.execPath, BUILDR_APP_DATA_DIR: state.appData,
      BUILDR_PRODUCT_DATA_DIR: state.productData, BUILDR_SMOKE_TIMEOUT_MS: mode === 'deadline' ? '1000' : '10000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '', guardFired = false, confirmed = false;
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const closed = new Promise(resolve => child.once('close', resolve));
  const emergencyCleanup = () => {
    child.kill('SIGKILL');
    if (fs.existsSync(observed)) {
      const value = JSON.parse(fs.readFileSync(observed, 'utf8'));
      for (const pid of [value.parent, value.descendant]) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    }
  };
  const guard = setTimeout(() => { guardFired = true; emergencyCleanup(); }, 7000);
  t.after(async () => { clearTimeout(guard); await stopOwnedChildProcess(child); if (!confirmed) emergencyCleanup(); fs.rmSync(proof, { recursive: true, force: true }); });
  for (let index = 0; !fs.existsSync(observed) && index < 200; index++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(fs.existsSync(observed), stderr);
  await new Promise(resolve => setTimeout(resolve, 100));
  if (mode === 'cancellation') {
    child.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 50));
    child.kill('SIGTERM');
  }
  await closed;
  clearTimeout(guard);
  assert.equal(guardFired, false, 'the external runner must enforce its own deadline');
  assert.equal(child.exitCode, mode === 'deadline' ? 124 : 143, stderr || stdout);
  const receipt = summary({ stdout });
  assert.equal(receipt.cleanup, 'cleaned');
  assert.equal(receipt.status, 'failed');
  assert.equal(fs.existsSync(receipt.temporaryRoot), false);
  assert.equal(JSON.parse(fs.readFileSync(stopping, 'utf8')).filesStillPresent, true);
  const value = JSON.parse(fs.readFileSync(observed, 'utf8'));
  for (const pid of [value.parent, value.descendant]) assert.throws(() => process.kill(pid, 0), (error: any) => error.code === 'ESRCH');
  assert.deepEqual(snapshot(state.root), state.before);
  confirmed = true;
});
