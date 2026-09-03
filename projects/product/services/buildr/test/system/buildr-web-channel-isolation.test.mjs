import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { registerWorkspaceRegistryRepository } from '../../src/workspace/persistence/workspace-registry-repository.ts';
import { registerWorkspaceManagementFence } from '../../src/workspace/infrastructure/workspace-management-fence.ts';
import { oppositeWebProfile, resolveWebProfile } from '../../src/system/installation/contracts/web-profile.mjs';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { ensureRegisteredTarget } from '../../src/workspace/module.ts';
import { registerWebInstanceLifecycle } from '../../src/web/application/instance-lifecycle.ts';
import { assertCurrentNpmLauncherBinding } from '../../src/system/installation/module.mjs';

const CHILD = new URL('../fixtures/buildr-web-profile-child.mjs', import.meta.url);

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const INSTANCE_STARTUP_TIMEOUT_MS = process.platform === 'win32' ? 60_000 : 10_000;

async function waitForInstance(file, { child = null, stderr = () => '', timeoutMs = INSTANCE_STARTUP_TIMEOUT_MS } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (value.url && value.secret && value.pid) return value;
    } catch {}
    if (child?.exitCode !== null) {
      throw new Error(`Child exited before writing ${file}: exitCode=${child.exitCode}; stderr=${stderr() || '<empty>'}`);
    }
    await wait(25);
  }
  throw new Error(`Timed out waiting for ${file} after ${timeoutMs}ms; childExitCode=${child?.exitCode ?? 'running'}; stderr=${stderr() || '<empty>'}`);
}

async function waitForExit(child, timeoutMs = 10_000) {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for PID ${child.pid}.`)), timeoutMs);
    timer.unref();
    child.once('exit', (code) => { clearTimeout(timer); resolve(code); });
  });
}

function startChild(root, releasedRoot, developmentRoot, identity) {
  const child = spawn(process.execPath, [fileURLToPath(CHILD)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BUILDR_APP_DATA_DIR: root,
      BUILDR_TEST_RELEASED_ROOT: releasedRoot,
      BUILDR_TEST_DEVELOPMENT_ROOT: developmentRoot,
      BUILDR_TEST_PRODUCT_IDENTITY: JSON.stringify(identity),
    },
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return { child, stderr: () => stderr };
}

test('released与development普通HTTP Server并行运行且独立退出', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dual-channel-server-'));
  const releasedRoot = path.join(base, 'released');
  const developmentRoot = path.join(base, 'development');
  const children = [];
  t.after(() => {
    for (const item of children) if (item.child.exitCode === null) item.child.kill('SIGKILL');
    fs.rmSync(base, { recursive: true, force: true });
  });

  const released = startChild(releasedRoot, releasedRoot, developmentRoot, {
    package: '@buildr-ai/buildr', version: 'test', protocolIdentity: 'buildr.web-protocol/v1',
    channel: 'npm', runtime: { role: 'host' }, installationIdentity: 'released-test',
  });
  children.push(released);
  const releasedState = await waitForInstance(path.join(releasedRoot, 'instance.json'), { child: released.child, stderr: released.stderr });

  const development = startChild(developmentRoot, releasedRoot, developmentRoot, {
    package: '@buildr-ai/buildr', version: 'test', protocolIdentity: 'buildr.web-protocol/v1',
    channel: 'development', runtime: { role: 'development' }, installationIdentity: 'development-test',
  });
  children.push(development);
  const developmentState = await waitForInstance(path.join(developmentRoot, 'instance.json'), { child: development.child, stderr: development.stderr });

  assert.notEqual(releasedState.pid, developmentState.pid);
  assert.notEqual(releasedState.url, developmentState.url);
  assert.equal(releasedState.webProfile.profile, 'released');
  assert.equal(developmentState.webProfile.profile, 'development');
  const [releasedPage, developmentPage] = await Promise.all([
    fetch(releasedState.url),
    fetch(developmentState.url),
  ]);
  assert.equal(releasedPage.status, 200);
  assert.equal(developmentPage.status, 200);
  assert.match(await releasedPage.text(), /<meta name="buildr-web-profile" content="released" \/>/);
  assert.match(await developmentPage.text(), /<meta name="buildr-web-profile" content="development" \/>/);
  for (const state of [releasedState, developmentState]) {
    const response = await fetch(`${state.url}/api/v1/health`, { headers: { 'x-buildr-instance': state.secret } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).webProfile.identity, state.webProfile.identity);
  }

  const stopped = await fetch(`${developmentState.url}/api/v1/app/quit-instance`, {
    method: 'POST', headers: { 'x-buildr-instance': developmentState.secret },
  });
  assert.equal(stopped.status, 202);
  assert.equal(await waitForExit(development.child), 0, development.stderr());
  assert.equal(fs.existsSync(path.join(developmentRoot, 'instance.json')), false);
  const releasedHealth = await fetch(`${releasedState.url}/api/v1/health`, { headers: { 'x-buildr-instance': releasedState.secret } });
  assert.equal(releasedHealth.status, 200);
  assert.equal(fs.existsSync(path.join(releasedRoot, 'instance.json')), true);

  await fetch(`${releasedState.url}/api/v1/app/quit-instance`, {
    method: 'POST', headers: { 'x-buildr-instance': releasedState.secret },
  });
  assert.equal(await waitForExit(released.child), 0, released.stderr());
  assert.equal(fs.existsSync(path.join(releasedRoot, 'instance.json')), false);
});

test('released Root中的健康legacy development实例不会被released启动复用、停止或清理', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-legacy-shared-instance-'));
  const releasedRoot = path.join(base, 'released');
  const developmentRoot = path.join(base, 'development');
  const previous = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = releasedRoot;
  t.after(() => {
    if (previous === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previous;
    fs.rmSync(base, { recursive: true, force: true });
  });
  const releasedIdentity = { package: '@buildr-ai/buildr', version: 'test', protocolIdentity: 'buildr.web-protocol/v1', channel: 'npm', runtime: { role: 'host' }, installationIdentity: 'released' };
  const developmentIdentity = { package: '@buildr-ai/buildr', version: 'test', protocolIdentity: 'buildr.web-protocol/v1', channel: 'development', runtime: { role: 'development' }, installationIdentity: 'development' };
  const releasedProfile = resolveWebProfile(releasedIdentity, { dataRoot: releasedRoot });
  const developmentProfile = resolveWebProfile(developmentIdentity, { dataRoot: releasedRoot });
  const profiles = {
    released: releasedProfile,
    development: resolveWebProfile(developmentIdentity, { dataRoot: developmentRoot }),
  };
  const legacyRuntime = createRuntime();
  const legacy = createLocalWorkspaceServer(legacyRuntime, {
    productIdentity: developmentIdentity,
    webProfile: developmentProfile,
  });
  const ready = await legacy.ready;
  t.after(() => new Promise((resolve) => legacy.server.close(resolve)));
  const receipt = {
    schemaVersion: 'buildr.local-app-instance/v1', url: ready.url, secret: ready.instanceSecret, pid: process.pid,
    launcherIdentity: { schemaVersion: 'buildr.launcher-identity/v1', channel: 'development', protocolVersion: 1, developmentRuntime: {} },
    productIdentity: developmentIdentity,
  };
  fs.mkdirSync(releasedRoot, { recursive: true });
  const file = path.join(releasedRoot, 'instance.json');
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
  const before = fs.readFileSync(file);

  const runtime = createRuntime();
  registerWorkspaceRegistryRepository(runtime, { productIdentity: releasedIdentity, webProfile: releasedProfile, resolveWebProfile });
  registerWorkspaceManagementFence(runtime, { peerProfiles: profiles, oppositeWebProfile });
  registerWebInstanceLifecycle(runtime, { readProductIdentity: () => releasedIdentity, assertNpmLauncherBinding: assertCurrentNpmLauncherBinding, createLocalWorkspaceServer, ensureRegisteredTarget });
  await assert.rejects(() => runtime.startBuildrWeb(['--no-open', '--port', '0']), (error) => error.code === 'web_instance_profile_conflict');
  assert.deepEqual(fs.readFileSync(file), before);
  const health = await fetch(`${ready.url}/api/v1/health`, { headers: { 'x-buildr-instance': ready.instanceSecret } });
  assert.equal(health.status, 200);
});
