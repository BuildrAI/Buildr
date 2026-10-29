import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import { registerWebInstanceLifecycle } from '../../src/web/application/instance-lifecycle.ts';
import { resolveWebProfile } from '../../src/modules/installation/contracts/web-profile.ts';
import { buildrWebInstanceObservationDigest } from '../../src/web/infrastructure/instance-runtime.ts';

function developmentIdentity() {
  return {
    package: '@buildr-ai/buildr', version: '0.0.2-dev', protocolIdentity: 'buildr.web-protocol/v1',
    applicationPayloadDigest: 'dev-payload', channel: 'development',
    installationIdentity: 'sha256-' + 'a'.repeat(64), sourceCommit: 'b'.repeat(40),
    runtime: { role: 'development', executable: '/dev/node', identity: 'dev-node' },
  };
}

function restartLifecycleFixture(t: any) {
  const previousRoot = process.env.BUILDR_APP_DATA_DIR;
  const previousAttempt = process.env.BUILDR_WEB_RESTART_ATTEMPT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-handoff-'));
  process.env.BUILDR_APP_DATA_DIR = root;
  process.env.BUILDR_WEB_RESTART_ATTEMPT = 'fixture-private-attempt';
  t.after(() => {
    if (previousRoot === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousRoot;
    if (previousAttempt === undefined) delete process.env.BUILDR_WEB_RESTART_ATTEMPT;
    else process.env.BUILDR_WEB_RESTART_ATTEMPT = previousAttempt;
    fs.rmSync(root, { recursive: true, force: true });
  });
  const identity = developmentIdentity();
  const webProfile = resolveWebProfile(identity);
  const receiptFile = path.join(webProfile.dataRoot, 'instance.json');
  const previous = {
    pid: process.pid - 1, url: 'http://127.0.0.1:4499/', secret: 'old-secret',
    launcherIdentity: null as Record<string, unknown> | null, productIdentity: identity, webProfile,
  };
  fs.writeFileSync(receiptFile, JSON.stringify({ schemaVersion: 'buildr.local-app-instance/v2', ...previous }));
  const calls: any = { npmOwnership: 0, shutdown: 0, shutdownHeaders: [], servers: [] };
  const runtime: any = {
    assertNoUnknownOptions() {},
    optionValue: (args: string[], name: string, fallback: any) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback,
    productRoot: () => '/source/checkout',
    atomicWriteJson: (file: string, value: unknown) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value));
    },
  };
  const servers: any[] = [];
  registerWebInstanceLifecycle(runtime, {
    readProductIdentity: () => identity,
    assertNpmLauncherBinding: () => { throw new Error('not used'); },
    assertNpmUpdateHandoffTarget() { calls.npmOwnership += 1; },
    ensureRegisteredTarget: () => null,
    createLocalWorkspaceServer(_runtime: any, options: any) {
      const httpServer = createServer();
      const ready = Promise.resolve({
        server: httpServer,
        url: `http://127.0.0.1:${options.port || 4400}`,
        initialWorkspaceId: null,
        sessionToken: 'new-session', instanceSecret: 'new-secret',
      });
      calls.servers.push(options);
      return { server: httpServer, ready, shutdown: async () => {} };
    },
  });
  // Health evidence follows the receipt on disk: the old instance reports the
  // old observation until its authenticated shutdown removes the file; the
  // successor's own receipt is then written before readiness verification.
  t.mock.method(globalThis, 'fetch', async (input: any, init: any = {}) => {
    const url = String(input?.url || input);
    if (url.endsWith('/api/v1/app/quit-instance')) {
      calls.shutdown += 1;
      calls.shutdownHeaders.push(init.headers);
      fs.rmSync(receiptFile, { force: true });
      return new Response(JSON.stringify({ status: 'stopping' }), { status: 202 });
    }
    if (url.endsWith('/api/v1/health')) {
      if (!fs.existsSync(receiptFile)) return new Response('gone', { status: 404 });
      const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
      if (init?.headers?.['x-buildr-instance'] !== receipt.secret) return new Response('forbidden', { status: 403 });
      return new Response(JSON.stringify({
        schemaVersion: 'buildr.local-app-health/v1', status: 'ready',
        pid: receipt.pid, url: receipt.url,
        launcherIdentity: receipt.launcherIdentity, productIdentity: receipt.productIdentity, webProfile: receipt.webProfile,
      }));
    }
    return new Response('not found', { status: 404 });
  });
  return { calls, runtime, previous, receiptFile, webProfile, identity };
}

test('--restart 拒绝非法摘要、--target 与摘要漂移，npm 归属核验不执行', async (t) => {
  const f = restartLifecycleFixture(t);
  await assert.rejects(f.runtime.startBuildrWeb(['--restart', 'not-a-digest']), /同身份重启/);
  await assert.rejects(f.runtime.startBuildrWeb(['--restart', buildrWebInstanceObservationDigest(f.previous), '--target', '/tmp/x']), /同身份重启/);
  await assert.rejects(f.runtime.startBuildrWeb(['--restart', 'sha256-' + '0'.repeat(64)]), { code: 'web_update_instance_changed' });
  assert.equal(f.calls.npmOwnership, 0);
  assert.equal(f.calls.servers.length, 0);
});

test('--restart inherits the authenticated launcher snapshot even when its identity file changes', async t => {
  const f = restartLifecycleFixture(t);
  const launcher = {
    schemaVersion: 'buildr.launcher-identity/v1', protocolVersion: 1, protocolIdentity: f.identity.protocolIdentity,
    channel: 'development', source: 'checkout', sourceRoot: '/source/checkout',
    developmentRuntime: { executable: '/dev/node' }, checkout: { head: 'old-verified' },
  };
  f.previous.launcherIdentity = launcher;
  fs.writeFileSync(f.receiptFile, JSON.stringify({ schemaVersion: 'buildr.local-app-instance/v2', ...f.previous }));
  const identityFile = path.join(f.webProfile.dataRoot, 'launcher-identity.json');
  fs.writeFileSync(identityFile, JSON.stringify({ ...launcher, sourceRoot: '/different/unverified', checkout: { head: 'later-install' } }));
  const beforeLauncher = process.env.BUILDR_LAUNCHER_IDENTITY;
  const beforeAttempt = process.env.BUILDR_WEB_RESTART_ATTEMPT;
  process.env.BUILDR_LAUNCHER_IDENTITY = identityFile;
  process.env.BUILDR_WEB_RESTART_ATTEMPT = 'one-use-private-attempt';
  t.after(() => {
    if (beforeLauncher === undefined) delete process.env.BUILDR_LAUNCHER_IDENTITY;
    else process.env.BUILDR_LAUNCHER_IDENTITY = beforeLauncher;
    if (beforeAttempt === undefined) delete process.env.BUILDR_WEB_RESTART_ATTEMPT;
    else process.env.BUILDR_WEB_RESTART_ATTEMPT = beforeAttempt;
  });
  await f.runtime.startBuildrWeb(['--restart', buildrWebInstanceObservationDigest(f.previous), '--port', '4499']);
  const receipt = JSON.parse(fs.readFileSync(f.receiptFile, 'utf8'));
  assert.deepEqual(receipt.launcherIdentity, launcher);
  assert.deepEqual(f.calls.servers[0].launcherIdentity, launcher);
  assert.equal(f.calls.shutdownHeaders[0]['x-buildr-restart-attempt'], 'one-use-private-attempt');
  assert.equal(process.env.BUILDR_WEB_RESTART_ATTEMPT, undefined);
  assert.equal(JSON.stringify(receipt).includes('one-use-private-attempt'), false);
});

test('--restart rejects a launcher snapshot from another source before stopping the old host', async t => {
  const f = restartLifecycleFixture(t);
  f.previous.launcherIdentity = { protocolVersion: 1, channel: 'development', sourceRoot: '/other', developmentRuntime: { executable: '/dev/node' } };
  fs.writeFileSync(f.receiptFile, JSON.stringify({ schemaVersion: 'buildr.local-app-instance/v2', ...f.previous }));
  await assert.rejects(f.runtime.startBuildrWeb(['--restart', buildrWebInstanceObservationDigest(f.previous)]), { code: 'web_launcher_profile_mismatch' });
  assert.equal(f.calls.shutdown, 0);
  assert.equal(f.calls.servers.length, 0);
});

test('--restart rechecks the launcher snapshot inside the start lock before authenticated shutdown', async t => {
  const f = restartLifecycleFixture(t);
  const originalFetch = globalThis.fetch;
  let observations = 0;
  t.mock.method(globalThis, 'fetch', async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args);
    if (String(args[0]).endsWith('/api/v1/health') && ++observations === 1) {
      fs.writeFileSync(f.receiptFile, JSON.stringify({ schemaVersion: 'buildr.local-app-instance/v2', ...f.previous, launcherIdentity: { protocolVersion: 1, channel: 'changed' } }));
    }
    return response;
  });
  await assert.rejects(f.runtime.startBuildrWeb(['--restart', buildrWebInstanceObservationDigest(f.previous)]), { code: 'web_update_instance_changed' });
  assert.equal(f.calls.shutdown, 0);
  assert.equal(f.calls.servers.length, 0);
});

test('a delayed private restart successor cannot create a host after its observed predecessor disappeared', async t => {
  const f = restartLifecycleFixture(t);
  fs.rmSync(f.receiptFile);
  const previousAttempt = process.env.BUILDR_WEB_RESTART_ATTEMPT;
  process.env.BUILDR_WEB_RESTART_ATTEMPT = 'delayed-attempt';
  t.after(() => {
    if (previousAttempt === undefined) delete process.env.BUILDR_WEB_RESTART_ATTEMPT;
    else process.env.BUILDR_WEB_RESTART_ATTEMPT = previousAttempt;
  });
  await assert.rejects(f.runtime.startBuildrWeb(['--restart', buildrWebInstanceObservationDigest(f.previous)]), { code: 'web_update_instance_unconfirmed' });
  assert.equal(f.calls.shutdown, 0);
  assert.equal(f.calls.servers.length, 0);
});

test('--restart cannot fall back to ordinary authenticated shutdown without its private attempt token', async t => {
  const f = restartLifecycleFixture(t);
  delete process.env.BUILDR_WEB_RESTART_ATTEMPT;
  await assert.rejects(f.runtime.startBuildrWeb(['--restart', buildrWebInstanceObservationDigest(f.previous)]), { code: 'web_restart_attempt_missing' });
  assert.equal(f.calls.shutdown, 0);
  assert.equal(f.calls.servers.length, 0);
});

test('--restart 同身份接管：认证退出旧实例并在原端口重建', async (t) => {
  const f = restartLifecycleFixture(t);
  const originalLog = console.log;
  console.log = () => {};
  try {
    var result: any = await f.runtime.startBuildrWeb(['--restart', buildrWebInstanceObservationDigest(f.previous), '--port', '4499']);
  } finally {
    console.log = originalLog;
  }
  assert.equal(result.reused, false);
  assert.equal(f.calls.npmOwnership, 0, 'restart 不执行 npm 安装归属核验');
  assert.equal(f.calls.shutdown, 1, '旧实例收到认证退出');
  assert.equal(f.calls.servers.length, 1);
  assert.equal(f.calls.servers[0].port, 4499, '接管绑定原端口');
  const receipt = JSON.parse(fs.readFileSync(f.receiptFile, 'utf8'));
  assert.equal(receipt.pid, process.pid);
  assert.match(receipt.url, /4499$/);
});
