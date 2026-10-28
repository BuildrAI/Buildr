import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { stopAgentProcess } from '@buildr-ai/buildr-agent';

import { createRuntime, runtimeContributions } from '../helpers/runtime-harness.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { createWebStaticFixture } from '../helpers/web-static-fixture.ts';
import { materializeCleanProductSource } from '../helpers/clean-product-source.ts';

const SERVICE_ROOT: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI: any = path.join(SERVICE_ROOT, 'bin', 'buildr.mjs');
const INSTANCE_READY_TIMEOUT_MS: any = process.platform === 'win32' ? 60_000 : 30_000;

function wait(milliseconds: any): any {
  return new Promise((resolve: any) => setTimeout(resolve, milliseconds));
}

async function waitForInstanceReceipt(file: any, { children = [], timeoutMs = INSTANCE_READY_TIMEOUT_MS, previousPid = null }: any = {}): Promise<any> {
  const stderr: any = () => children.map((item: any) => item.stderr()).join('\n');
  const deadline: any = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value: any = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (value.url && value.secret && value.pid && value.pid !== previousPid) return value;
    } catch {}
    for (const item of children) {
      if (item.child.exitCode !== null && item.child.exitCode !== 0) {
        throw new Error(`Buildr Web 进程提前退出 exitCode=${item.child.exitCode}: ${stderr() || '<empty>'}`);
      }
    }
    await wait(50);
  }
  throw new Error(`等待实例回执超时：${file}；stderr=${stderr() || '<empty>'}`);
}

async function waitForExit(child: any, timeoutMs: any = 15_000): Promise<any> {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve: any, reject: any) => {
    const timer: any = setTimeout(() => reject(new Error(`Timed out waiting for PID ${child.pid}.`)), timeoutMs);
    timer.unref();
    child.once('exit', (code: any) => { clearTimeout(timer); resolve(code); });
  });
}

async function fetchSessionToken(url: any): Promise<any> {
  const response: any = await fetch(url, { cache: 'no-store' });
  assert.equal(response.status, 200);
  const html: any = await response.text();
  const match: any = html.match(/<meta name="buildr-session" content="([a-f0-9]+)"\s*\/?>/u);
  assert.ok(match, `页面缺少 buildr-session 令牌：${url}`);
  return match[1];
}

test('真实重启交接：旧实例退出、新实例同端口接管回执与 health，页面令牌轮换', { timeout: 120_000 }, async (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-restart-'));
  const appData: any = path.join(base, 'app-data');
  const productData: any = path.join(base, 'product-data');
  const controller = materializeCleanProductSource(SERVICE_ROOT, path.join(base, 'controller'));
  createWebStaticFixture(path.join(controller.root, 'web-dist'));
  const children: any[] = [];
  t.after(async () => {
    for (const item of children) if (item.child.exitCode === null) item.child.kill('SIGKILL');
    for (const item of children) await waitForExit(item.child, 5_000).catch(() => {});
    await stopAgentProcess({dataRoot:appData});
    fs.rmSync(base, { recursive: true, force: true });
  });

  const launch = (args: string[]): any => {
    const child: any = spawn(process.execPath, [controller.cli, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: productData, BUILDR_NPM_ENTRY_PATH: controller.cli },
    });
    let stderr: any = '';
    child.stderr.on('data', (chunk: any) => { stderr += chunk; });
    child.stdout.on('data', (chunk: any) => { stderr += `[stdout] ${chunk}`; });
    const wrapped: any = { child, stderr: () => stderr };
    children.push(wrapped);
    return wrapped;
  };

  const first: any = launch(['web', '--no-open', '--port', '0']);
  const instanceFile: any = path.join(appData, 'instance.json');
  const before: any = await waitForInstanceReceipt(instanceFile, { children: [first] });
  const session: any = await fetchSessionToken(before.url);

  const response: any = await fetch(`${before.url}/api/v1/app/restart`, {
    method: 'POST',
    headers: { origin: before.url, 'x-buildr-session': session, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).status, 'restarting');

  assert.equal(await waitForExit(first.child), 0, `旧实例未按预期退出：${first.stderr()}`);
  const after: any = await waitForInstanceReceipt(instanceFile, { children, previousPid: before.pid });
  assert.notEqual(after.pid, before.pid, '继任实例必须是新进程');
  const successorLog: any = path.join(appData, 'logs', 'web-handoff-successor.log');
  assert.ok(fs.existsSync(successorLog), '交接后继输出必须落盘到实例日志');
  const successorLogText: any = fs.readFileSync(successorLog, 'utf8');
  assert.match(successorLogText, /restart successor argv=web --restart sha256-[a-f0-9]{64} --no-open --port \d+/);
  assert.match(successorLogText, /Buildr Web：http:\/\/127\.0\.0\.1:\d+/);
  assert.equal(after.url, before.url, '重启接管原端口');
  assert.notEqual(after.secret, before.secret, '实例 secret 轮换');

  const health: any = await fetch(`${after.url}/api/v1/health`, { headers: { 'x-buildr-instance': after.secret } });
  assert.equal(health.status, 200);
  const body: any = await health.json();
  assert.equal(body.status, 'ready');
  assert.equal(body.pid, after.pid);
  const nextSession: any = await fetchSessionToken(after.url);
  assert.notEqual(nextSession, session, '会话令牌随实例轮换');

  const stopped: any = await fetch(`${after.url}/api/v1/app/quit-instance`, { method: 'POST', headers: { 'x-buildr-instance': after.secret } });
  assert.equal(stopped.status, 202);
  const successor: any = children[children.length - 1].child;
  assert.equal(await waitForExit(successor), 0, `新实例应干净退出：${children[children.length - 1].stderr()}`);
  const exitDeadline: any = Date.now() + 10_000;
  while (fs.existsSync(instanceFile) && Date.now() < exitDeadline) await wait(50);
  assert.equal(fs.existsSync(instanceFile), false);
});

test('Preview 实例拒绝重启并保持服务', { timeout: 30_000 }, async (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-restart-preview-'));
  const previousAppData: any = process.env.BUILDR_APP_DATA_DIR;
  const previousProductData: any = process.env.BUILDR_PRODUCT_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  process.env.BUILDR_PRODUCT_DATA_DIR = path.join(base, 'product-data');
  t.after(() => {
    if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previousAppData;
    if (previousProductData === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR; else process.env.BUILDR_PRODUCT_DATA_DIR = previousProductData;
    fs.rmSync(base, { recursive: true, force: true });
  });
  const spawnCalls: any[] = [];
  const runtime: any = createRuntime();
  const instance: any = createLocalWorkspaceServer(runtime, {
    staticRoot: createWebStaticFixture(path.join(base, 'web')),
    httpContributions: runtimeContributions(runtime, 'http'),
    previewIdentity: {
      schemaVersion: 'buildr.local-app-preview/v1', instance: 'restart-test', url: null,
      worktree: base, branch: 'task/restart-test', head: '0'.repeat(40), dirty: false,
      workspaceRoot: null, taskId: null, productIdentity: null, createdAt: new Date().toISOString(),
      identityMode: 'workspace-v1', taskStore: null,
    },
    spawnSuccessor: (state: any) => { spawnCalls.push(state); return null; },
  });
  t.after(() => new Promise((resolve: any) => instance.server.close(resolve)));
  const { url, sessionToken, instanceSecret }: any = await instance.ready;

  const response: any = await fetch(`${url}/api/v1/app/restart`, {
    method: 'POST',
    headers: { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'restart_preview_unsupported');
  await new Promise((resolve: any) => setImmediate(resolve));
  assert.equal(spawnCalls.length, 0, 'Preview 拒绝不得启动继任进程');
  const health: any = await fetch(`${url}/api/v1/health`, { headers: { 'x-buildr-instance': instanceSecret } });
  assert.equal(health.status, 200);
});
