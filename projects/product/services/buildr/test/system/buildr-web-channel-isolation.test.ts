import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { createWorkspaceRegistryRepository } from '../../src/workspace/persistence/workspace-registry-repository.ts';
import { registerWorkspaceManagementFence } from '../../src/workspace/infrastructure/workspace-management-fence.ts';
import { oppositeWebProfile, resolveWebProfile } from '../../src/system/installation/contracts/web-profile.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { ensureRegisteredTarget } from '../../src/workspace/module.ts';
import { registerWebInstanceLifecycle } from '../../src/web/application/instance-lifecycle.ts';
import { assertCurrentNpmLauncherBinding } from '../../src/system/installation/module.ts';

const CHILD: any = new URL('../fixtures/buildr-web-profile-child.ts', import.meta.url);

function wait(milliseconds: any): any  {
  return new Promise((resolve: any) => setTimeout(resolve, milliseconds));
}

const INSTANCE_STARTUP_TIMEOUT_MS: any = process.platform === 'win32' ? 60_000 : 10_000;

async function waitForInstance(file: any, { child = null, stderr = () => '', timeoutMs = INSTANCE_STARTUP_TIMEOUT_MS }: any = {}): Promise<any>  {
  const deadline: any = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value: any = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (value.url && value.secret && value.pid) return value;
    } catch {}
    if (child?.exitCode !== null) {
      throw new Error(`Child exited before writing ${file}: exitCode=${child.exitCode}; stderr=${stderr() || '<empty>'}`);
    }
    await wait(25);
  }
  throw new Error(`Timed out waiting for ${file} after ${timeoutMs}ms; childExitCode=${child?.exitCode ?? 'running'}; stderr=${stderr() || '<empty>'}`);
}

async function waitForExit(child: any, timeoutMs: any = 10_000): Promise<any>  {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve: any, reject: any) => {
    const timer: any = setTimeout(() => reject(new Error(`Timed out waiting for PID ${child.pid}.`)), timeoutMs);
    timer.unref();
    child.once('exit', (code: any) => { clearTimeout(timer); resolve(code); });
  });
}

function startChild(root: any, releasedRoot: any, developmentRoot: any, identity: any): any  {
  const child: any = spawn(process.execPath, [fileURLToPath(CHILD)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BUILDR_APP_DATA_DIR: root,
      BUILDR_TEST_RELEASED_ROOT: releasedRoot,
      BUILDR_TEST_DEVELOPMENT_ROOT: developmentRoot,
      BUILDR_TEST_PRODUCT_IDENTITY: JSON.stringify(identity),
    },
  });
  let stderr: any = '';
  child.stderr.on('data', (chunk: any) => { stderr += chunk; });
  return { child, stderr: () => stderr };
}

test('released与development普通HTTP Server并行运行且独立退出', async (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dual-channel-server-'));
  const releasedRoot: any = path.join(base, 'released');
  const developmentRoot: any = path.join(base, 'development');
  const children: any[] = [];
  t.after(() => {
    for (const item of children) if (item.child.exitCode === null) item.child.kill('SIGKILL');
    fs.rmSync(base, { recursive: true, force: true });
  });

  const released: any = startChild(releasedRoot, releasedRoot, developmentRoot, {
    package: '@buildr-ai/buildr', version: 'test', protocolIdentity: 'buildr.web-protocol/v1',
    channel: 'npm', runtime: { role: 'host' }, installationIdentity: 'released-test',
  });
  children.push(released);
  const releasedState: any = await waitForInstance(path.join(releasedRoot, 'instance.json'), { child: released.child, stderr: released.stderr });

  const development: any = startChild(developmentRoot, releasedRoot, developmentRoot, {
    package: '@buildr-ai/buildr', version: 'test', protocolIdentity: 'buildr.web-protocol/v1',
    channel: 'development', runtime: { role: 'development' }, installationIdentity: 'development-test',
  });
  children.push(development);
  const developmentState: any = await waitForInstance(path.join(developmentRoot, 'instance.json'), { child: development.child, stderr: development.stderr });

  assert.notEqual(releasedState.pid, developmentState.pid);
  assert.notEqual(releasedState.url, developmentState.url);
  assert.equal(releasedState.webProfile.profile, 'released');
  assert.equal(developmentState.webProfile.profile, 'development');
  const [releasedPage, developmentPage]: any = await Promise.all([
    fetch(releasedState.url),
    fetch(developmentState.url),
  ]);
  assert.equal(releasedPage.status, 200);
  assert.equal(developmentPage.status, 200);
  assert.match(await releasedPage.text(), /<meta name="buildr-web-profile" content="released" \/>/);
  assert.match(await developmentPage.text(), /<meta name="buildr-web-profile" content="development" \/>/);
  for (const state of [releasedState, developmentState]) {
    const response: any = await fetch(`${state.url}/api/v1/health`, { headers: { 'x-buildr-instance': state.secret } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).webProfile.identity, state.webProfile.identity);
  }

  const stopped: any = await fetch(`${developmentState.url}/api/v1/app/quit-instance`, {
    method: 'POST', headers: { 'x-buildr-instance': developmentState.secret },
  });
  assert.equal(stopped.status, 202);
  assert.equal(await waitForExit(development.child), 0, development.stderr());
  assert.equal(fs.existsSync(path.join(developmentRoot, 'instance.json')), false);
  const releasedHealth: any = await fetch(`${releasedState.url}/api/v1/health`, { headers: { 'x-buildr-instance': releasedState.secret } });
  assert.equal(releasedHealth.status, 200);
  assert.equal(fs.existsSync(path.join(releasedRoot, 'instance.json')), true);

  await fetch(`${releasedState.url}/api/v1/app/quit-instance`, {
    method: 'POST', headers: { 'x-buildr-instance': releasedState.secret },
  });
  assert.equal(await waitForExit(released.child), 0, released.stderr());
  assert.equal(fs.existsSync(path.join(releasedRoot, 'instance.json')), false);
});

test('released Root中的健康legacy development实例不会被released启动复用、停止或清理', async (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-legacy-shared-instance-'));
  const releasedRoot: any = path.join(base, 'released');
  const developmentRoot: any = path.join(base, 'development');
  const previous: any = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = releasedRoot;
  t.after(() => {
    if (previous === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previous;
    fs.rmSync(base, { recursive: true, force: true });
  });
  const releasedIdentity: any = { package: '@buildr-ai/buildr', version: 'test', protocolIdentity: 'buildr.web-protocol/v1', channel: 'npm', runtime: { role: 'host' }, installationIdentity: 'released' };
  const developmentIdentity: any = { package: '@buildr-ai/buildr', version: 'test', protocolIdentity: 'buildr.web-protocol/v1', channel: 'development', runtime: { role: 'development' }, installationIdentity: 'development' };
  const releasedProfile: any = resolveWebProfile(releasedIdentity, { dataRoot: releasedRoot });
  const developmentProfile: any = resolveWebProfile(developmentIdentity, { dataRoot: releasedRoot });
  const profiles: any = {
    released: releasedProfile,
    development: resolveWebProfile(developmentIdentity, { dataRoot: developmentRoot }),
  };
  const legacyRuntime: any = createRuntime();
  const legacy: any = createLocalWorkspaceServer(legacyRuntime, {
    productIdentity: developmentIdentity,
    webProfile: developmentProfile,
  });
  const ready: any = await legacy.ready;
  t.after(() => new Promise((resolve: any) => legacy.server.close(resolve)));
  const receipt: any = {
    schemaVersion: 'buildr.local-app-instance/v1', url: ready.url, secret: ready.instanceSecret, pid: process.pid,
    launcherIdentity: { schemaVersion: 'buildr.launcher-identity/v1', channel: 'development', protocolVersion: 1, developmentRuntime: {} },
    productIdentity: developmentIdentity,
  };
  fs.mkdirSync(releasedRoot, { recursive: true });
  const file: any = path.join(releasedRoot, 'instance.json');
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
  const before: any = fs.readFileSync(file);

  const runtime: any = createRuntime();
  Object.assign(runtime, createWorkspaceRegistryRepository(runtime, { productIdentity: releasedIdentity, webProfile: releasedProfile, resolveWebProfile }));
  registerWorkspaceManagementFence(runtime, { peerProfiles: profiles, oppositeWebProfile });
  registerWebInstanceLifecycle(runtime, { readProductIdentity: () => releasedIdentity, assertNpmLauncherBinding: assertCurrentNpmLauncherBinding, createLocalWorkspaceServer, ensureRegisteredTarget });
  await assert.rejects(() => runtime.startBuildrWeb(['--no-open', '--port', '0']), (error: any) => error.code === 'web_instance_profile_conflict');
  assert.deepEqual(fs.readFileSync(file), before);
  const health: any = await fetch(`${ready.url}/api/v1/health`, { headers: { 'x-buildr-instance': ready.instanceSecret } });
  assert.equal(health.status, 200);
});
