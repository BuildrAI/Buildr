import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
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
import { stopOwnedChildProcess } from '../verification/support/owned-process.ts';
import { buildLauncher } from '../../tools/build/launcher/build.ts';
import { readCurrentInstallationOrigin } from '../../src/modules/installation/infrastructure/installation-origin.ts';
import { inspectDevelopmentInstance, restartDevelopmentInstance } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs';

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
  if (child.exitCode !== null || child.signalCode !== null) return child.exitCode;
  return new Promise((resolve: any, reject: any) => {
    const exited = (code: any) => { clearTimeout(timer); resolve(code); };
    const timer: any = setTimeout(() => { child.off('exit', exited); reject(new Error(`Timed out waiting for PID ${child.pid}.`)); }, timeoutMs);
    timer.unref();
    child.once('exit', exited);
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

async function stopIsolatedInstance(dataRoot: string, sourceRoot: string): Promise<void> {
  const file = path.join(dataRoot, 'instance.json');
  const deadline = Date.now() + 15_000;
  while (fs.existsSync(file)) {
    let state: any;
    try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
    assert.equal(state.productIdentity?.sourceRoot, sourceRoot, '只清理当前隔离源码的实例');
    try {
      const response = await fetch(`${state.url}/api/v1/app/quit-instance`, {
        method: 'POST', headers: { 'x-buildr-instance': state.secret }, signal: AbortSignal.timeout(1000),
      });
      await response.arrayBuffer();
      assert.ok([202, 409].includes(response.status), `隔离实例退出返回 ${response.status}`);
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
    if (Date.now() >= deadline) throw new Error(`隔离实例 ${state.pid} 未确认退出`);
    await wait(50);
  }
}

async function readAgentRuntime(url: string, session: string): Promise<any> {
  const response = await fetch(`${url}/api/v1/app/agent-service/runtime`, {
    headers: { origin: url, 'x-buildr-session': session }, signal: AbortSignal.timeout(INSTANCE_READY_TIMEOUT_MS),
  });
  assert.equal(response.status, 200);
  return response.json();
}

test('真实重启交接：旧实例退出、新实例同端口接管回执与 health，页面令牌轮换', { timeout: 120_000 }, async (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-restart-'));
  const appData: any = path.join(base, 'app-data');
  const productData: any = path.join(base, 'product-data');
  const controller = materializeCleanProductSource(SERVICE_ROOT, path.join(base, 'controller'));
  createWebStaticFixture(path.join(controller.root, 'web-dist'));
  const children: any[] = [];
  t.after(async () => {
    await stopIsolatedInstance(appData, controller.root);
    await Promise.all(children.map(item => stopOwnedChildProcess(item.child)));
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
  // The instance receipt precedes the final CLI log flush. Observe both facts.
  let successorLogText = '';
  const logDeadline = Date.now() + INSTANCE_READY_TIMEOUT_MS;
  while (Date.now() < logDeadline) {
    successorLogText = fs.readFileSync(successorLog, 'utf8');
    if (/Buildr Web：http:\/\/127\.0\.0\.1:\d+/.test(successorLogText)) break;
    await wait(25);
  }
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

test('真实隔离开发启动器→页面重启→后续源码更新，保留启动器归属并复用独立执行后台', { skip: process.platform !== 'darwin', timeout: 180_000 }, async (t: any) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-development-restart-'));
  const appData = path.join(base, 'app-data'), productData = path.join(base, 'product-data');
  const controller = materializeCleanProductSource(SERVICE_ROOT, path.join(base, 'controller'));
  createWebStaticFixture(path.join(controller.root, 'web-dist'));
  const gitRoot = path.resolve(controller.root, '../../../..');
  const git = (...args: string[]) => execFileSync('git', ['-C', gitRoot, ...args], { encoding: 'utf8' }).trim();
  const listener = net.createServer();
  const port = await new Promise<number>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const value = (listener.address() as net.AddressInfo).port;
      listener.close(error => error ? reject(error) : resolve(value));
    });
  });
  const identity = {
    schemaVersion: 'buildr.launcher-identity/v1', version: JSON.parse(fs.readFileSync(path.join(controller.root, 'package.json'), 'utf8')).version,
    channel: 'development', runtimeRole: 'development', source: 'checkout', buildId: 'restart-fixture', buildNumber: '1',
    protocolVersion: 1, protocolIdentity: 'buildr.web-protocol/v1', platform: 'darwin', builtAt: new Date().toISOString(),
    sourceRoot: controller.root, checkout: { head: git('rev-parse', 'HEAD'), dirty: false }, webPort: 4458,
    developmentRuntime: { executable: process.execPath, version: process.versions.node, source: 'development-host', identity: `development-host:${fs.realpathSync(process.execPath)}:${process.versions.node}` },
  };
  const bundle = buildLauncher({ platform: 'darwin', output: path.join(base, 'launcher'), identity });
  const wrapper = path.join(bundle, 'Contents', 'MacOS', 'Buildr');
  const identityFile = path.join(bundle, 'Contents', 'Resources', 'launcher-identity.json');
  const script = fs.readFileSync(wrapper, 'utf8');
  assert.equal(script.match(/web --port 4458/g)?.length, 1);
  // The generated native entry runs unchanged apart from its test-only port.
  // It never contacts the everyday development application on port 4458.
  fs.writeFileSync(wrapper, script.replace('web --port 4458', `web --port ${port}`), { mode: 0o755 });
  const environment = {
    ...process.env, HOME: path.join(base, 'home'), PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`,
    BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: productData, BUILDR_NPM_ENTRY_PATH: controller.cli, BUILDR_LAUNCHER_NO_OPEN: '1',
  };
  fs.mkdirSync(environment.HOME, { recursive: true });
  t.after(async () => {
    try { await stopIsolatedInstance(appData, controller.root); }
    finally {
      await stopAgentProcess({ dataRoot: appData });
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
  const launcher = spawn(wrapper, [], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  let launcherOutput = '';
  launcher.stderr.on('data', chunk => { launcherOutput += chunk; });
  launcher.stdout.on('data', chunk => { launcherOutput += chunk; });
  assert.equal(await waitForExit(launcher), 0, launcherOutput);
  const instanceFile = path.join(appData, 'instance.json');
  const initial = await waitForInstanceReceipt(instanceFile);
  assert.equal(new URL(initial.url).port, String(port));
  assert.deepEqual(initial.launcherIdentity, identity);
  assert.equal((await inspectDevelopmentInstance({ dataRoot: appData })).status, 'healthy-development');
  const session = await fetchSessionToken(initial.url);
  const agentBefore = await readAgentRuntime(initial.url, session);

  // Installing the next launcher can change its file before the old app restarts.
  // The successor must inherit the authenticated running identity instead.
  fs.writeFileSync(identityFile, `${JSON.stringify({ ...identity, buildId: 'installed-next', checkout: { head: 'f'.repeat(40), dirty: false } })}\n`);
  const response = await fetch(`${initial.url}/api/v1/app/restart`, {
    method: 'POST', headers: { origin: initial.url, 'x-buildr-session': session, 'content-type': 'application/json' }, body: '{}',
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 202);
  await response.arrayBuffer();
  const restarted = await waitForInstanceReceipt(instanceFile, { previousPid: initial.pid });
  assert.equal(restarted.url, initial.url);
  assert.deepEqual(restarted.launcherIdentity, identity, '重启保留运行实例身份，不读取已更新的启动器文件');
  const restartHealth = await fetch(`${restarted.url}/api/v1/health`, { headers: { 'x-buildr-instance': restarted.secret } });
  assert.equal(restartHealth.status, 200);
  assert.deepEqual((await restartHealth.json()).launcherIdentity, identity);
  assert.equal((await inspectDevelopmentInstance({ dataRoot: appData })).status, 'healthy-development');
  const nextSession = await fetchSessionToken(restarted.url);
  assert.notEqual(nextSession, session);
  const agentAfterRestart = await readAgentRuntime(restarted.url, nextSession);
  assert.deepEqual([agentAfterRestart.instanceId, agentAfterRestart.generation, agentAfterRestart.pid], [agentBefore.instanceId, agentBefore.generation, agentBefore.pid], '页面重启不强制重启独立执行后台');

  const changedSource = path.join(controller.root, 'src/bootstrap/cli/main.ts');
  fs.appendFileSync(changedSource, '\n// isolated development restart successor input\n');
  git('add', '--', path.relative(gitRoot, changedSource));
  git('commit', '--quiet', '-m', 'change isolated runtime input');
  const nextIdentity = { ...identity, buildId: 'continuity-successor', checkout: { head: git('rev-parse', 'HEAD'), dirty: false } };
  fs.writeFileSync(identityFile, `${JSON.stringify(nextIdentity)}\n`);
  const nextOrigin = readCurrentInstallationOrigin(controller.root);
  assert.match(nextOrigin.developmentRuntimeIdentity, /^sha256-[a-f0-9]{64}$/);
  assert.notEqual(nextOrigin.developmentRuntimeIdentity, restarted.productIdentity.developmentRuntimeIdentity);
  const updated = await restartDevelopmentInstance({
    projectBridge: controller.cli, launcherIdentityPath: identityFile,
    expectedSourceRoot: controller.root, expectedHead: nextIdentity.checkout.head, expectedRuntimeIdentity: nextOrigin.developmentRuntimeIdentity,
    nodeExecutable: process.execPath, previousPid: restarted.pid, previousPort: port, port, expectedPort: port,
    dataRoot: appData, environment, timeoutMs: INSTANCE_READY_TIMEOUT_MS,
  });
  assert.equal(updated.status, 'passed');
  assert.ok(updated.instance);
  assert.notEqual(updated.instance.pid, restarted.pid);
  assert.equal(updated.instance.url, initial.url);
  assert.deepEqual(updated.instance.launcherIdentity, nextIdentity);
  assert.equal(updated.instance.productIdentity.developmentRuntimeIdentity, nextOrigin.developmentRuntimeIdentity);
  assert.equal((await inspectDevelopmentInstance({ dataRoot: appData })).status, 'healthy-development');
  const agentAfterUpdate = await readAgentRuntime(updated.instance.url, await fetchSessionToken(updated.instance.url));
  assert.deepEqual([agentAfterUpdate.instanceId, agentAfterUpdate.generation, agentAfterUpdate.pid], [agentBefore.instanceId, agentBefore.generation, agentBefore.pid], '只修改宿主源码不更换独立执行后台');
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
