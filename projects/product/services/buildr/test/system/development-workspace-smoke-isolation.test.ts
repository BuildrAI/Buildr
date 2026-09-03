import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
const runner: any = path.join(serviceRoot, 'tools/development/run-isolated-workspace-smoke.ts');
const failingScenario: any = path.join(serviceRoot, 'test/fixtures/failing-workspace-smoke.ts');

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

function runSmoke(args: any, state: any): any  {
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

test('Workspace smoke 使用独立数据根并在成功后保持用户状态零副作用', (t: any) => {
  const state: any = setupUserState(t);
  const result: any = runSmoke([], state);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const receipt: any = summary(result);
  assert.deepEqual({ status: receipt.status, cleanup: receipt.cleanup, exitCode: receipt.exitCode }, { status: 'passed', cleanup: 'cleaned', exitCode: 0 });
  assert.equal(fs.existsSync(receipt.temporaryRoot), false);
  assert.deepEqual(snapshot(state.root), state.before);
});

test('Workspace smoke 子场景失败仍清理并保持用户状态零副作用', (t: any) => {
  const state: any = setupUserState(t);
  const result: any = runSmoke(['--script', failingScenario], state);
  assert.equal(result.status, 23, result.stderr || result.stdout);
  const receipt: any = summary(result);
  assert.deepEqual({ status: receipt.status, cleanup: receipt.cleanup, exitCode: receipt.exitCode }, { status: 'failed', cleanup: 'cleaned', exitCode: 23 });
  assert.equal(fs.existsSync(receipt.temporaryRoot), false);
  assert.deepEqual(snapshot(state.root), state.before);
});
