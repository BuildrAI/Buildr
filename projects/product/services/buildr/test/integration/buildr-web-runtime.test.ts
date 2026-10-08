import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createRuntime } from '../helpers/runtime-harness.ts';
import { createRuntime as createProductionRuntime, runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { WORKSPACE_APPLICATION, PROJECT_APPLICATION } from '../../src/modules/workspace/module.ts';
import { WEB_INSTANCE_LIFECYCLE } from '../../src/web/module.ts';
import { taskRecordFixture } from '../helpers/task-record-system-fixture.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { createLocalWorkspaceRequestRouter } from '../../src/web/http/router.ts';
import { apiError } from '../../src/web/http/responses.ts';
import { ensureRegisteredTarget } from '../../src/modules/workspace/module.ts';
import { registerWebInstanceLifecycle, handoffWaitBudget } from '../../src/web/application/instance-lifecycle.ts';
import { assertCurrentNpmLauncherBinding, createInstallationOrigin, readCurrentInstallationOrigin, readCurrentProductIdentity } from '../../src/modules/installation/module.ts';
import {
  acquireBuildrWebStartLock,
  releaseBuildrWebStartLock,
  clearBuildrWebInstance,
  buildrWebInstancePath,
  buildrWebStartLockPath,
  openDefaultBrowser,
  readLauncherIdentityFromEnvironment,
  readBuildrWebInstance,
  writeBuildrWebInstance,
} from '../../src/web/infrastructure/instance-runtime.ts';
import { pickWorkspaceDirectory } from '../../src/web/infrastructure/directory-picker.ts';
import { resolveWebProfile } from '../../src/modules/installation/contracts/web-profile.ts';

function opener(platform: any): any  {
  const calls: any[] = [];
  const spawnProcess: any = (command: any, args: any, options: any) => {
    calls.push({ command, args, options });
    return { unref(): any  {} };
  };
  return { result: openDefaultBrowser('http://127.0.0.1:4321', { platform, spawnProcess }), calls };
}

test('生产 Web 装配能够解析已登记工作空间并读取项目，未知工作空间返回 404', async (t) => {
  const { base, root } = taskRecordFixture(t, 'production-web-routing');
  const previous = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => {
    if (previous === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previous;
  });
  const runtime = createProductionRuntime();
  const workspace = runtimeProvide(runtime, WORKSPACE_APPLICATION);
  const workspaceId = workspace.ensureRegisteredTarget(root);
  const expected = runtimeProvide(runtime, PROJECT_APPLICATION).listProjects(root);
  const instance = await runtimeProvide(runtime, WEB_INSTANCE_LIFECYCLE).startBuildrWeb(['--port', '0', '--no-open']);
  t.after(() => new Promise<void>((resolve) => instance.server.close(resolve)));
  const response = await fetch(`${instance.url}/api/v1/workspaces/${workspaceId}/projects`);
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), expected);
  const missing = await fetch(`${instance.url}/api/v1/workspaces/00000000-0000-4000-8000-000000000000/projects`);
  assert.equal(missing.status, 404);
});

test('默认浏览器 opener 为 macOS、Windows 和 Linux 生成平台命令', () => {
  assert.deepEqual(opener('darwin').result, { command: 'open', args: ['http://127.0.0.1:4321'] });
  assert.deepEqual(opener('win32').result, { command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', 'http://127.0.0.1:4321'] });
  assert.deepEqual(opener('linux').result, { command: 'xdg-open', args: ['http://127.0.0.1:4321'] });
});

test('launcher identity 只接受受支持 schema 与 protocol', (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file: any = path.join(root, 'identity.json');
  fs.writeFileSync(file, '{"schemaVersion":"buildr.launcher-identity/v1","protocolVersion":1,"channel":"development"}\n');
  assert.equal(readLauncherIdentityFromEnvironment({ BUILDR_LAUNCHER_IDENTITY: file }).channel, 'development');
  fs.writeFileSync(file, '{"schemaVersion":"unknown","protocolVersion":1}\n');
  assert.equal(readLauncherIdentityFromEnvironment({ BUILDR_LAUNCHER_IDENTITY: file }), null);
});

test('Workspace 目录选择器复用 macOS 与 Windows 系统对话框', () => {
  const calls: any[] = [];
  const execute: any = (command: any, args: any) => {
    calls.push({ command, args });
    return command === 'osascript' ? '/Users/demo/Workspace/\n' : 'C:\\Work\\Buildr\r\n';
  };
  assert.equal(pickWorkspaceDirectory({ platform: 'darwin', execute }), '/Users/demo/Workspace/');
  assert.equal(pickWorkspaceDirectory({ platform: 'win32', execute }), 'C:\\Work\\Buildr');
  assert.equal(calls[0].command, 'osascript');
  assert.equal(calls[1].command, 'powershell.exe');
  assert.throws(() => pickWorkspaceDirectory({ platform: 'linux', execute }), (error: any) => error.code === 'workspace_picker_unsupported');
});

test('released与development instance receipt和start lock绑定各自Web profile', (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-profiles-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const released: any = resolveWebProfile({ channel: 'npm', runtime: { role: 'host' } }, { dataRoot: path.join(base, 'released') });
  const development: any = resolveWebProfile({ channel: 'development', runtime: { role: 'development' } }, { dataRoot: path.join(base, 'development') });
  const runtime: any = { atomicWriteJson(file: any, value: any): any  { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); } };
  const state: any = { url: 'http://127.0.0.1:4321', secret: 'secret', pid: 1234, webProfile: development };
  writeBuildrWebInstance(runtime, state);
  assert.equal(buildrWebInstancePath(released), path.join(base, 'released', 'instance.json'));
  assert.equal(buildrWebInstancePath(development), path.join(base, 'development', 'instance.json'));
  assert.equal(buildrWebStartLockPath(released), path.join(base, 'released', 'instance-start.lock'));
  assert.equal(readBuildrWebInstance(released), null);
  assert.equal(readBuildrWebInstance(development).webProfile.identity, development.identity);
  assert.equal(clearBuildrWebInstance(state, development), true);
  assert.equal(fs.existsSync(buildrWebInstancePath(development)), false);
});

test('正式Web与Task Preview生命周期均不创建后台maintenance scheduler', async (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-local-app-maintenance-boundary-'));
  const previousDataRoot: any = process.env.BUILDR_APP_DATA_DIR;
  const previousPreview: any = process.env.BUILDR_LOCAL_APP_PREVIEW;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  delete process.env.BUILDR_LOCAL_APP_PREVIEW;
  t.after(() => {
    if (previousDataRoot === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousDataRoot;
    if (previousPreview === undefined) delete process.env.BUILDR_LOCAL_APP_PREVIEW;
    else process.env.BUILDR_LOCAL_APP_PREVIEW = previousPreview;
    fs.rmSync(base, { recursive: true, force: true });
  });

  const formalRuntime: any = createRuntime();
  registerWebInstanceLifecycle(formalRuntime, {
    readProductIdentity: readCurrentProductIdentity,
    assertNpmLauncherBinding: assertCurrentNpmLauncherBinding,
    createLocalWorkspaceServer,
    ensureRegisteredTarget,
  });
  const formal: any = await formalRuntime.startBuildrWeb(['--port', '0', '--no-open']);
  await new Promise((resolve: any) => formal.server.close(resolve));

  process.env.BUILDR_LOCAL_APP_PREVIEW = JSON.stringify({
    schemaVersion: 'buildr.local-app-preview/v1',
    instance: 'test-preview',
    worktree: process.cwd(),
  });
  const previewRuntime: any = createRuntime();
  registerWebInstanceLifecycle(previewRuntime, {
    readProductIdentity: readCurrentProductIdentity,
    assertNpmLauncherBinding: assertCurrentNpmLauncherBinding,
    createLocalWorkspaceServer,
    ensureRegisteredTarget,
  });
  const preview: any = await previewRuntime.startBuildrWeb(['--port', '0', '--no-open']);
  await new Promise((resolve: any) => preview.server.close(resolve));
});

test('development start reuses the current source and preserves a healthy instance when the source differs or is unproven', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-development-reuse-'));
  const previousDataRoot = process.env.BUILDR_APP_DATA_DIR;
  const previousPreview = process.env.BUILDR_LOCAL_APP_PREVIEW;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  delete process.env.BUILDR_LOCAL_APP_PREVIEW;
  let server: any;
  t.after(async () => {
    if (server) await new Promise<void>(resolve => server.close(resolve));
    if (previousDataRoot === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousDataRoot;
    if (previousPreview === undefined) delete process.env.BUILDR_LOCAL_APP_PREVIEW;
    else process.env.BUILDR_LOCAL_APP_PREVIEW = previousPreview;
    fs.rmSync(base, { recursive: true, force: true });
  });
  const runtime = createRuntime();
  const currentProduct = readCurrentProductIdentity();
  assert.equal(currentProduct.channel, 'development');
  const currentOrigin = readCurrentInstallationOrigin(runtime.productRoot());
  let expected: any = currentProduct;
  registerWebInstanceLifecycle(runtime, {
    readProductIdentity: () => expected,
    assertNpmLauncherBinding: assertCurrentNpmLauncherBinding,
    createLocalWorkspaceServer, ensureRegisteredTarget,
  });
  const first = await runtime.startBuildrWeb(['--port', '0', '--no-open']);
  server = first.server;
  const file = path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json');
  const before = fs.readFileSync(file, 'utf8');
  const reused = await runtime.startBuildrWeb(['--port', '0', '--no-open']);
  assert.equal(reused.reused, true);
  assert.equal(reused.url, first.url);
  for (const changedOrigin of [
    createInstallationOrigin({ ...currentOrigin, sourceCommit: 'd'.repeat(40) }),
    createInstallationOrigin({ ...currentOrigin, installUnit: path.join(base, 'other-source') }),
  ]) {
    expected = { ...currentProduct, installationIdentity: changedOrigin.ownershipIdentity, sourceCommit: changedOrigin.sourceCommit };
    await assert.rejects(runtime.startBuildrWeb(['--port', '0', '--no-open']), (error: any) => {
      assert.equal(error.code, 'web_instance_development_source_conflict');
      assert.match(error.message, /退出.*重新启动/);
      return true;
    });
  }
  expected = { ...currentProduct, installationIdentity: undefined };
  await assert.rejects(runtime.startBuildrWeb(['--port', '0', '--no-open']), (error: any) => error.code === 'web_instance_development_source_conflict');
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'rejected reuse preserves the running receipt');
  assert.equal(fs.existsSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance-start.lock')), false);
  const health = await fetch(`${first.url}/api/v1/health`, { headers: { 'x-buildr-instance': JSON.parse(before).secret } });
  assert.equal(health.status, 200, 'rejected reuse never stops the existing server');
});


test('Web start lock preserves incomplete/live owners, recovers a dead legacy PID, and cannot release a successor', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-start-lock-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const profile = resolveWebProfile({ channel: 'npm', runtime: { role: 'host' } }, { dataRoot: root });
  const file = buildrWebStartLockPath(profile);
  fs.writeFileSync(file, '');
  assert.equal(acquireBuildrWebStartLock(profile).owner, false);
  assert.equal(fs.readFileSync(file, 'utf8'), '');
  fs.writeFileSync(file, String(process.pid));
  assert.equal(acquireBuildrWebStartLock(profile).owner, false);
  const exited = spawnSync(process.execPath, ['-e', 'process.exit(0)'], { encoding: 'utf8' });
  assert.equal(exited.status, 0);
  fs.writeFileSync(file, String(exited.pid));
  const first = acquireBuildrWebStartLock(profile);
  assert.equal(first.owner, true);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pid, process.pid);
  assert.equal(acquireBuildrWebStartLock(profile).owner, false);
  assert.equal(releaseBuildrWebStartLock(first), true);
  const successor = acquireBuildrWebStartLock(profile);
  assert.equal(successor.owner, true);
  assert.equal(releaseBuildrWebStartLock(first), false);
  assert.equal(acquireBuildrWebStartLock(profile).owner, false);
  assert.equal(releaseBuildrWebStartLock(successor), true);
});

test('launcher handoff wait budget keeps the local default and widens only under CI or explicit override', () => {
  const local = handoffWaitBudget({});
  assert.deepEqual(local, { attempts: 40, intervalMs: 50 }, 'non-CI budget is millisecond-equivalent to the pre-change runtime default');
  assert.equal(local.attempts * local.intervalMs, 2000);

  const ci = handoffWaitBudget({ CI: 'true' });
  assert.equal(ci.intervalMs, 50);
  assert.ok(ci.attempts > local.attempts, 'CI widens the handoff budget');
  assert.ok(ci.attempts * ci.intervalMs >= 60000, 'CI budget absorbs loaded-runner shutdown latency');

  const overridden = handoffWaitBudget({ BUILDR_LAUNCHER_HANDOFF_WAIT_MS: '5000' });
  assert.deepEqual(overridden, { attempts: 100, intervalMs: 50 });

  const ciOverrideWins = handoffWaitBudget({ CI: 'true', BUILDR_LAUNCHER_HANDOFF_WAIT_MS: '1000' });
  assert.deepEqual(ciOverrideWins, { attempts: 20, intervalMs: 50 }, 'explicit override takes precedence over CI auto-detection');

  const invalidOverride = handoffWaitBudget({ BUILDR_LAUNCHER_HANDOFF_WAIT_MS: 'not-a-number' });
  assert.deepEqual(invalidOverride, { attempts: 40, intervalMs: 50 }, 'invalid override falls back to the local default');
});

function hostRouterFixture(t: any, { origin = 'http://127.0.0.1:4457', closing = false } = {}) {
  const staticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-http-host-'));
  t.after(() => fs.rmSync(staticRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(staticRoot, 'index.html'), '<html>__BUILDR_SESSION_TOKEN__</html>');
  fs.writeFileSync(path.join(staticRoot, 'app.js'), 'private-static-content');
  const calls = { topLevel: 0, workspace: 0, resolve: 0, mutations: 0, shutdown: 0 };
  const workspaceId = '00000000-0000-4000-8000-000000000000';
  const sessionToken = 'private-session-token';
  const healthSecret = 'private-instance-secret';
  const router = createLocalWorkspaceRequestRouter({
    origin: () => origin, isClosing: () => closing, staticRoot, sessionToken, healthSecret,
    taskIdPattern: '[a-z-]+', launcherIdentity: { channel: 'fixture' },
    productIdentity: { version: 'fixture' }, webProfile: { profile: 'development' }, previewIdentity: null,
    shutdown: () => { calls.shutdown++; },
    resolveRegisteredWorkspace: () => { calls.resolve++; return { rootPath: '/private-workspace' }; },
    httpContributions: [{
      handleTopLevel: ({ pathname, request, authorizeWrite }: any) => {
        calls.topLevel++;
        if (pathname !== '/api/v1/top-level') return null;
        if (request.method === 'POST') { authorizeWrite(); calls.mutations++; }
        return { status: 200, body: { private: 'top-level' } };
      },
      handle: ({ request, authorizeWrite }: any) => {
        calls.workspace++;
        if (request.method === 'POST') { authorizeWrite(); calls.mutations++; }
        return { status: 200, body: { private: 'workspace' } };
      },
    }],
  });
  const validHeaders = {
    host: new URL(origin).host, origin, 'x-buildr-session': sessionToken,
    'x-buildr-instance': healthSecret, 'content-type': 'application/json',
  };
  return {
    calls, workspacePath: `/api/v1/workspaces/${workspaceId}/items`,
    async request({ method = 'GET', url = '/', headers = {}, rawHeaders }: any = {}) {
      const input = Object.assign(Readable.from([Buffer.from('{}')]), {
        method, url, headers: { ...validHeaders, ...headers }, ...(rawHeaders ? { rawHeaders } : {}),
      });
      const result = { status: 0, headers: {} as any, body: '' };
      const response = {
        writeHead(status: number, responseHeaders: any) { result.status = status; result.headers = responseHeaders; },
        end(body: any) { result.body = String(body); },
      };
      try { await router(input, response); } catch (error) { apiError(response, error); }
      return result;
    },
  };
}

test('HTTP Host rejects a foreign authority before shell, static, health, contributions or shutdown', async t => {
  const fixture = hostRouterFixture(t);
  for (const [method, url] of [
    ['GET', '/'], ['GET', '/app.js'], ['GET', '/api/v1/health'],
    ['GET', '/api/v1/top-level'], ['POST', '/api/v1/top-level'],
    ['GET', fixture.workspacePath], ['POST', fixture.workspacePath],
    ['POST', '/api/v1/app/quit'], ['POST', '/api/v1/app/quit-instance'], ['GET', '/missing'],
  ]) {
    const response = await fixture.request({ method, url, headers: { host: 'foreign.example:4457' } });
    assert.equal(response.status, 403, `${method} ${url}: ${response.body}`);
    assert.equal(JSON.parse(response.body).error.code, 'host_forbidden');
    assert.doesNotMatch(response.body, /private-|fixture/);
  }
  assert.deepEqual(fixture.calls, { topLevel: 0, workspace: 0, resolve: 0, mutations: 0, shutdown: 0 });
});

test('HTTP Host rejects missing, ambiguous, malformed and unbound local authorities', async t => {
  const fixture = hostRouterFixture(t);
  const rejected = [
    undefined, '', ['127.0.0.1:4457'], '127.0.0.1', '127.0.0.1:4458', 'localhost:4457',
    '[::1]:4457', '127.1:4457', '2130706433:4457', '0x7f000001:4457', '127.0.0.1.:4457',
    '127.0.0.1:04457', '127.0.0.1:4457, foreign.example', 'foreign.example@127.0.0.1:4457',
    '127.0.0.1:4457/path', '127.0.0.1:4457#fragment', '127.0.0.1:4457?query',
    '127.0.0.1:4457\\foreign.example', ' 127.0.0.1:4457', '127.0.0.1:4457\r\nX-Test: value',
  ];
  for (const host of rejected) {
    const response = await fixture.request({ headers: { host } });
    assert.equal(response.status, 403, JSON.stringify(host));
    assert.equal(JSON.parse(response.body).error.code, 'host_forbidden');
  }
  for (const secondHost of ['127.0.0.1:4457', 'foreign.example:4457']) {
    const response = await fixture.request({ rawHeaders: ['Host', '127.0.0.1:4457', 'hOsT', secondHost] });
    assert.equal(response.status, 403);
    assert.equal(JSON.parse(response.body).error.code, 'host_forbidden');
  }
});

test('HTTP Host preserves trusted reads, static content, instance secrets and write protection', async t => {
  const fixture = hostRouterFixture(t);
  for (const url of ['/', '/app.js', '/api/v1/top-level', fixture.workspacePath]) {
    assert.equal((await fixture.request({ url, rawHeaders: ['Host', '127.0.0.1:4457'] })).status, 200, url);
  }
  assert.match((await fixture.request()).body, /private-session-token/);
  const health = await fixture.request({ url: '/api/v1/health' });
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).launcherIdentity.channel, 'fixture');
  for (const [method, url] of [['GET', '/api/v1/health'], ['POST', '/api/v1/app/quit-instance']]) {
    const rejected = await fixture.request({ method, url, headers: { 'x-buildr-instance': undefined } });
    assert.equal(rejected.status, 403);
    assert.equal(JSON.parse(rejected.body).error.code, 'instance_forbidden');
  }
  for (const url of ['/api/v1/top-level', fixture.workspacePath, '/api/v1/app/quit']) {
    for (const [headers, status, code] of [
      [{ origin: 'http://foreign.example:4457' }, 403, 'origin_forbidden'],
      [{ 'x-buildr-session': 'wrong' }, 403, 'session_forbidden'],
      [{ 'content-type': 'text/plain' }, 415, 'content_type_unsupported'],
    ] as const) {
      const response = await fixture.request({ method: 'POST', url, headers });
      assert.equal(response.status, status, url);
      assert.equal(JSON.parse(response.body).error.code, code);
    }
  }
  assert.equal(fixture.calls.mutations, 0);
  assert.equal(fixture.calls.shutdown, 0);
  assert.equal((await fixture.request({ method: 'POST', url: '/api/v1/top-level' })).status, 200);
  assert.equal((await fixture.request({ method: 'POST', url: fixture.workspacePath })).status, 200);
  for (const url of ['/api/v1/app/quit', '/api/v1/app/quit-instance']) {
    assert.equal((await fixture.request({ method: 'POST', url })).status, 202);
  }
  assert.equal(fixture.calls.mutations, 2);
  assert.equal(fixture.calls.shutdown, 2);
});

test('HTTP Host uses the trusted runtime port and still gates a closing application', async t => {
  const standardPort = hostRouterFixture(t, { origin: 'http://127.0.0.1:80' });
  for (const host of ['127.0.0.1', '127.0.0.1:80']) {
    assert.equal((await standardPort.request({ headers: { host } })).status, 200);
  }
  const closing = hostRouterFixture(t, { origin: 'http://127.0.0.1:61234', closing: true });
  const foreign = await closing.request({ headers: { host: '127.0.0.1:4457' } });
  assert.equal(foreign.status, 403);
  assert.equal(JSON.parse(foreign.body).error.code, 'host_forbidden');
  assert.equal((await closing.request()).status, 503);
  const health = await closing.request({ url: '/api/v1/health' });
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).status, 'stopping');
});
