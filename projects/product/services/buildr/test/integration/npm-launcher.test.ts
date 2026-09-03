import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { buildApplicationPayload } from '../../tools/release/application-payload.ts';
import { createNpmPackStaging } from '../../tools/release/release-artifact.ts';
import { createGeneratedReleaseInputs } from '../helpers/generated-release-inputs.ts';
import {
  createProductUpdateAuthority,
  enrollProductInstallation,
} from '../../src/system/installation/infrastructure/installation-registry.ts';
import {
  installNpmLauncher,
  npmLauncherStatus,
  assertCurrentNpmLauncherBinding,
  refreshInstalledNpmLauncher,
  repairNpmLauncher,
  uninstallNpmLauncher,
} from '../../src/system/installation/infrastructure/npm-launcher.ts';
import { registerWebInstanceLifecycle } from '../../src/web/application/instance-lifecycle.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { ensureRegisteredTarget } from '../../src/workspace/module.ts';
import {
  clearBuildrWebInstance,
  writeBuildrWebInstance,
} from '../../src/web/infrastructure/instance-runtime.ts';
import { resolveWebProfile } from '../../src/system/installation/contracts/web-profile.ts';

const SOURCE_COMMIT: any = 'd4361952d7111f131b5923fedcf4b58077719eb6';

function digest(value: any): any  {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function legacyBinding(current: any): any  {
  const material: any = Object.fromEntries(Object.entries(current).filter(([field]: any) => !['bindingIdentity', 'webPort'].includes(field)));
  material.schemaVersion = 'buildr.npm-launcher-binding/v1';
  material.launcherOwnershipIdentity = digest(JSON.stringify({
    schemaVersion: material.schemaVersion,
    platform: material.platform,
    target: path.resolve(material.target),
    installationSlotIdentity: material.installationSlotIdentity,
  }));
  return { ...material, bindingIdentity: digest(JSON.stringify(material)) };
}

test.beforeEach((t: any) => {
  const previousAppData: any = process.env.BUILDR_APP_DATA_DIR;
  const previousProductData: any = process.env.BUILDR_PRODUCT_DATA_DIR;
  const appData: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-launcher-test-app-data-'));
  process.env.BUILDR_APP_DATA_DIR = appData;
  process.env.BUILDR_PRODUCT_DATA_DIR = appData;
  t.after(() => {
    if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousAppData;
    if (previousProductData === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR;
    else process.env.BUILDR_PRODUCT_DATA_DIR = previousProductData;
    fs.rmSync(appData, { recursive: true, force: true });
  });
});

async function fixture(): Promise<any>  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-launcher-'));
  const prefix: any = path.join(root, 'prefix');
  const packageRoot: any = path.join(prefix, 'lib', 'node_modules', '@buildr-ai', 'buildr');
  const payload: any = path.join(root, 'payload');
  const generated: any = createGeneratedReleaseInputs(path.join(root, 'generated'), SOURCE_COMMIT);
  await buildApplicationPayload(payload, SOURCE_COMMIT, { generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot });
  createNpmPackStaging(payload, packageRoot, { testContextRoot: generated.testContextRoot });
  const npmCliPath: any = path.join(prefix, 'npm-cli.js');
  fs.writeFileSync(npmCliPath, '// test npm authority\n');
  const updateAuthority: any = createProductUpdateAuthority({ nodeExecutable: process.execPath, npmCliPath, prefix });
  const enrolled: any = enrollProductInstallation({
    envelopePath: path.join(packageRoot, 'installation-origin.json'),
    productRoot: path.join(packageRoot, 'payload', 'product'),
    entryPath: path.join(packageRoot, 'bin', 'buildr.mjs'),
    runtimeExecutable: process.execPath,
    updateAuthority,
  }, { file: path.join(root, 'product-installations.json') });
  return { root, prefix, packageRoot, registration: { status: 'installed', entry: enrolled.entry } };
}

function productIdentityFor(binding: any): any  {
  return {
    package: binding.package,
    version: binding.version,
    protocolIdentity: binding.protocolIdentity,
    applicationPayloadDigest: binding.applicationPayloadDigest,
    sourceCommit: binding.sourceCommit,
    channel: 'npm',
    runtime: { role: 'host' },
    installationIdentity: binding.installationOwnershipIdentity,
  };
}

async function waitFor(check: any, { attempts = 160, intervalMs = 50, message = 'condition' }: any = {}): Promise<any>  {
  for (let index: any = 0; index < attempts; index += 1) {
    const value: any = await check();
    if (value) return value;
    await new Promise((resolve: any) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${message}.`);
}

const LAUNCHER_HANDOFF_ATTEMPTS: any = 400;
const LAUNCHER_HANDOFF_TIMEOUT_MS: any = 20000;

function spawnInstalledWeb(entry: any, args: any): any  {
  const child: any = spawn(process.execPath, [entry, 'web', ...args], {
    env: { ...process.env, BUILDR_LAUNCHER_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output: any[] = [];
  child.stdout.on('data', (chunk: any) => output.push(String(chunk)));
  child.stderr.on('data', (chunk: any) => output.push(String(chunk)));
  child.output = output;
  return child;
}

async function waitForChildExit(child: any, label: any): Promise<any>  {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    once(child, 'exit'),
    new Promise((_: any, reject: any) => setTimeout(() => reject(new Error(`${label} did not exit: ${child.output.join('')}`)), LAUNCHER_HANDOFF_TIMEOUT_MS)),
  ]);
}

test('macOS npm Launcher is an owned projection and repair refreshes drift without copying product bytes', async () => {
  const value: any = await fixture();
  const target: any = path.join(value.root, 'Applications', 'Buildr Web.app');
  assert.equal(fs.existsSync(target), false, 'npm staging must not create a graphical Launcher');

  const installed: any = installNpmLauncher({ registration: value.registration, platform: 'darwin', target });
  assert.equal(installed.status, 'ready');
  assert.equal(installed.binding.channel, 'npm');
  assert.equal(installed.binding.schemaVersion, 'buildr.npm-launcher-binding/v2');
  assert.deepEqual(installed.binding.webPort, { preferred: 4457, fallback: 'random' });
  assert.equal(installed.binding.packageRoot, path.join(value.packageRoot, 'payload', 'product'));
  assert.equal(installed.binding.hostNode.path, process.execPath);
  const wrapper: any = fs.readFileSync(path.join(target, 'Contents', 'MacOS', 'Buildr Web'), 'utf8');
  assert.match(wrapper, /\/bin\/launchctl submit -l/);
  assert.match(wrapper, /trap cleanup 0/);
  assert.match(wrapper, /NODE_BIN=\$\(\/usr\/bin\/dirname "\$\{NODE\}"\)/);
  assert.match(wrapper, /export PATH="\$\{NODE_BIN\}\$\{PATH:\+:\$\{PATH\}\}"/);
  assert.match(wrapper, /Node identity: executable=\$\{NODE_EXECUTABLE\} version=\$\{NODE_VERSION\} pathHead=\$\{NODE_BIN\}/);
  assert.match(wrapper, /buildr-web-launcher "\$\{LABEL\}" "\$\{NODE\}" "\$\{NODE_BIN\}"/);
  assert.match(wrapper, /NO_NOTIFY="\$\{BUILDR_LAUNCHER_NO_NOTIFY-\}"/);
  assert.match(wrapper, /\[ "\$\{NO_NOTIFY\}" = "1" \] && return 0/);
  assert.match(wrapper, /NO_NOTIFY="\$\{10\}"/);
  assert.match(wrapper, /export BUILDR_LAUNCHER_NO_NOTIFY="\$\{NO_NOTIFY\}"/);
  assert.match(wrapper, /if \[ "\$\{NO_NOTIFY\}" != "1" \]; then/);
  assert.match(wrapper, /"\$\{NO_OPEN\}" "\$\{NO_NOTIFY\}"/);
  assert.doesNotMatch(wrapper, /\/usr\/bin\/nohup/);
  const plist: any = fs.readFileSync(path.join(target, 'Contents', 'Info.plist'), 'utf8');
  assert.match(plist, /<key>CFBundleIdentifier<\/key><string>ai\.buildr\.web\.npm-launcher\.slot[a-f0-9]{24}<\/string>/);

  const inventory: any[] = [];
  const visit: any = (directory: any) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file: any = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else inventory.push(path.relative(target, file).split(path.sep).join('/'));
    }
  };
  visit(target);
  for (const required of [
    'Contents/Info.plist',
    'Contents/MacOS/Buildr Web',
    'Contents/Resources/Buildr.icns',
    'Contents/Resources/launcher-binding.json',
  ]) assert.ok(inventory.includes(required));
  assert.equal(inventory.every((file: any) => [
    'Contents/Info.plist',
    'Contents/MacOS/Buildr Web',
    'Contents/Resources/Buildr.icns',
    'Contents/Resources/launcher-binding.json',
  ].includes(file) || file.startsWith('Contents/_CodeSignature/')), true);
  assert.equal(inventory.some((file: any) => /(?:node|payload|package\.json|runtime\/buildr)/i.test(file)), false);

  const randomPort: any = installNpmLauncher({ registration: value.registration, platform: 'darwin', target, port: 0 });
  assert.deepEqual(randomPort.binding.webPort, { preferred: 0, fallback: 'random' });
  const preserved: any = repairNpmLauncher({ registration: value.registration, platform: 'darwin', target });
  assert.deepEqual(preserved.binding.webPort, { preferred: 0, fallback: 'random' });
  const explicit: any = repairNpmLauncher({ registration: value.registration, platform: 'darwin', target, port: 4317 });
  assert.deepEqual(explicit.binding.webPort, { preferred: 4317, fallback: 'random' });

  const bindingFile: any = path.join(target, 'Contents', 'Resources', 'launcher-binding.json');
  fs.writeFileSync(bindingFile, `${JSON.stringify(legacyBinding(explicit.binding), null, 2)}\n`);
  const legacy: any = npmLauncherStatus({ platform: 'darwin', target });
  assert.equal(legacy.status, 'stale');
  assert.equal(legacy.diagnostic.code, 'launcher.binding_legacy');
  const migrated: any = repairNpmLauncher({ registration: value.registration, platform: 'darwin', target });
  assert.equal(migrated.binding.schemaVersion, 'buildr.npm-launcher-binding/v2');
  assert.deepEqual(migrated.binding.webPort, { preferred: 4457, fallback: 'random' });

  const entry: any = value.registration.entry.entryPath;
  const original: any = fs.readFileSync(entry);
  fs.appendFileSync(entry, '\n// drift\n');
  assert.equal(npmLauncherStatus({ platform: 'darwin', target }).status, 'stale');
  const refreshed: any = refreshInstalledNpmLauncher({ registration: value.registration, platform: 'darwin', target });
  assert.equal(refreshed.status, 'ready');
  assert.equal(refreshed.action, 'refreshed');
  fs.writeFileSync(entry, original);
  assert.equal(npmLauncherStatus({ platform: 'darwin', target }).status, 'stale', 'restoring old package bytes makes the refreshed binding stale again');
  repairNpmLauncher({ registration: value.registration, platform: 'darwin', target });

  const removed: any = uninstallNpmLauncher({ registration: value.registration, platform: 'darwin', target });
  assert.equal(removed.status, 'absent');
  assert.equal(fs.existsSync(value.packageRoot), true, 'Launcher uninstall must retain npm Buildr');
});

test('Launcher refuses foreign targets and Windows shortcut binds exact Host Node, entry and binding', async () => {
  const value: any = await fixture();
  const foreign: any = path.join(value.root, 'foreign', 'Buildr Web.app');
  fs.mkdirSync(foreign, { recursive: true });
  assert.throws(
    () => installNpmLauncher({ registration: value.registration, platform: 'darwin', target: foreign }),
    /Refusing to replace foreign Launcher target/,
  );

  const shortcut: any = path.join(value.root, 'Start Menu', 'Buildr Web.lnk');
  let shortcutValue: any = null;
  const writeShortcut: any = ({ target, binding }: any) => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'test shortcut');
    shortcutValue = {
      target: binding.hostNode.path,
      arguments: `"${binding.packageEntry.path}" web --launcher-binding "${binding.bindingPath}"`,
      workingDirectory: binding.packageRoot,
    };
  };
  const readShortcut: any = () => shortcutValue;
  const installed: any = installNpmLauncher({ registration: value.registration, platform: 'win32', target: shortcut, writeShortcut, readShortcut });
  assert.equal(installed.status, 'ready');
  assert.equal(shortcutValue.target, process.execPath);
  assert.match(shortcutValue.arguments, /buildr\.mjs" web --launcher-binding/);

  const bindingPath: any = installed.bindingPath;
  const iconPath: any = path.join(path.dirname(bindingPath), 'Buildr.ico');
  const frozen: any = new Map([shortcut, bindingPath, iconPath].map((file: any) => [file, fs.readFileSync(file)]));
  assert.throws(() => installNpmLauncher({
    registration: value.registration,
    platform: 'win32',
    target: shortcut,
    readShortcut,
    writeShortcut: ({ target }: any) => {
      fs.writeFileSync(target, 'partial shortcut');
      throw new Error('injected shortcut failure');
    },
  }), /injected shortcut failure/);
  for (const [file, bytes] of frozen) assert.deepEqual(fs.readFileSync(file), bytes, `${file} must roll back atomically`);
  assert.equal(npmLauncherStatus({ platform: 'win32', target: shortcut, readShortcut }).status, 'ready');

  shortcutValue = { ...shortcutValue, target: 'C:\\foreign\\node.exe' };
  assert.equal(npmLauncherStatus({ platform: 'win32', target: shortcut, readShortcut }).status, 'invalid');
  assert.throws(
    () => uninstallNpmLauncher({ registration: value.registration, platform: 'win32', target: shortcut, readShortcut }),
    /Refusing to remove foreign Launcher target/,
  );
});

test('released npm Launcher falls back once from an occupied preferred port while direct CLI stays strict', async (t: any) => {
  const value: any = await fixture();
  const target: any = path.join(value.root, 'Applications', 'Buildr Web.app');
  const occupied: any = net.createServer();
  await new Promise((resolve: any, reject: any) => {
    occupied.once('error', reject);
    occupied.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve: any) => occupied.close(resolve)));
  const preferred: any = occupied.address().port;
  const installed: any = installNpmLauncher({ registration: value.registration, platform: 'darwin', target, port: preferred });
  const productIdentity: any = {
    package: installed.binding.package,
    version: installed.binding.version,
    protocolIdentity: installed.binding.protocolIdentity,
    applicationPayloadDigest: installed.binding.applicationPayloadDigest,
    sourceCommit: installed.binding.sourceCommit,
    channel: 'npm',
    runtime: { role: 'host' },
    installationIdentity: installed.binding.installationOwnershipIdentity,
  };
  const runtime: any = createRuntime();
  registerWebInstanceLifecycle(runtime, { readProductIdentity: () => productIdentity, assertNpmLauncherBinding: assertCurrentNpmLauncherBinding, createLocalWorkspaceServer, ensureRegisteredTarget });
  const warnings: any[] = [];
  const originalWarn: any = console.warn;
  console.warn = (message: any) => warnings.push(String(message));
  t.after(() => { console.warn = originalWarn; });

  const started: any = await runtime.startBuildrWeb(['--no-open', '--launcher-binding', installed.bindingPath]);
  const actualPort: any = Number(new URL(started.url).port);
  assert.notEqual(actualPort, preferred);
  assert.match(warnings.join('\n'), new RegExp(`首选端口 ${preferred} 已被占用`));
  const receipt: any = JSON.parse(fs.readFileSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json'), 'utf8'));
  assert.equal(receipt.url, started.url);
  assert.equal(receipt.launcherIdentity.bindingIdentity, installed.binding.bindingIdentity);
  const closed: any = new Promise((resolve: any) => started.server.once('close', resolve));
  const stopped: any = await fetch(`${receipt.url}/api/v1/app/quit-instance`, {
    method: 'POST',
    headers: { 'x-buildr-instance': receipt.secret },
  });
  assert.equal(stopped.status, 202);
  await closed;
  assert.equal(fs.existsSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json')), false);

  await assert.rejects(
    () => runtime.startBuildrWeb(['--no-open', '--port', String(preferred)]),
    /EADDRINUSE|address already in use/i,
  );
});

test('npm Launcher takes over CLI ownership, serializes concurrent opens, reuses exact binding and replaces an old same-slot binding', async (t: any) => {
  const value: any = await fixture();
  const target: any = path.join(value.root, 'Applications', 'Buildr Web.app');
  const installed: any = installNpmLauncher({ registration: value.registration, platform: 'darwin', target, port: 0 });
  const entry: any = value.registration.entry.entryPath;
  const receiptFile: any = path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json');
  const children: any = new Set();
  const launch: any = (args: any) => {
    const child: any = spawnInstalledWeb(entry, args);
    children.add(child);
    child.once('exit', () => children.delete(child));
    return child;
  };
  t.after(() => {
    for (const child of children) child.kill('SIGTERM');
  });

  const cli: any = launch(['--no-open', '--port', '0']);
  const cliReceipt: any = await waitFor(() => {
    if (!fs.existsSync(receiptFile)) return null;
    const valueAtFile: any = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
    return valueAtFile.pid === cli.pid && !valueAtFile.launcherIdentity ? valueAtFile : null;
  }, { message: 'foreground CLI receipt' });

  const first: any = launch(['--no-open', '--launcher-binding', installed.bindingPath]);
  const second: any = launch(['--no-open', '--launcher-binding', installed.bindingPath]);
  const managed: any = await waitFor(() => {
    if (!fs.existsSync(receiptFile)) return null;
    const valueAtFile: any = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
    return valueAtFile.pid !== cliReceipt.pid && valueAtFile.launcherIdentity?.bindingIdentity === installed.binding.bindingIdentity
      ? valueAtFile
      : null;
  }, { attempts: LAUNCHER_HANDOFF_ATTEMPTS, message: 'Launcher-managed replacement receipt' });
  await waitForChildExit(cli, 'foreground CLI after Launcher handoff');
  assert.notEqual(managed.pid, cliReceipt.pid);
  const managedHealth: any = await fetch(`${managed.url}/api/v1/health`, { headers: { 'x-buildr-instance': managed.secret } }).then((response: any) => response.json());
  assert.equal(managedHealth.launcherIdentity.bindingIdentity, installed.binding.bindingIdentity);
  const managedChild: any = first.pid === managed.pid ? first : second;
  const concurrentFollower: any = managedChild === first ? second : first;
  await waitForChildExit(concurrentFollower, 'concurrent Launcher follower');

  const exactReuse: any = launch(['--no-open', '--launcher-binding', installed.bindingPath]);
  await waitForChildExit(exactReuse, 'exact binding reuse invocation');
  assert.equal(JSON.parse(fs.readFileSync(receiptFile, 'utf8')).pid, managed.pid);

  const updated: any = repairNpmLauncher({ registration: value.registration, platform: 'darwin', target, port: 4317 });
  assert.notEqual(updated.binding.bindingIdentity, installed.binding.bindingIdentity);
  assert.equal(updated.binding.launcherOwnershipIdentity, installed.binding.launcherOwnershipIdentity);
  const replacement: any = launch(['--no-open', '--launcher-binding', updated.bindingPath]);
  const replaced: any = await waitFor(() => {
    if (!fs.existsSync(receiptFile)) return null;
    const valueAtFile: any = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
    return valueAtFile.launcherIdentity?.bindingIdentity === updated.binding.bindingIdentity ? valueAtFile : null;
  }, { message: 'updated same-slot Launcher receipt' });
  await waitForChildExit(managedChild, 'old same-slot Launcher');
  assert.notEqual(replaced.pid, managed.pid);
  const replacedHealth: any = await fetch(`${replaced.url}/api/v1/health`, { headers: { 'x-buildr-instance': replaced.secret } }).then((response: any) => response.json());
  assert.equal(replacedHealth.launcherIdentity.bindingIdentity, updated.binding.bindingIdentity);

  const stopped: any = await fetch(`${replaced.url}/api/v1/app/quit-instance`, {
    method: 'POST',
    headers: { 'x-buildr-instance': replaced.secret },
  });
  assert.equal(stopped.status, 202);
  await waitForChildExit(replacement, 'updated Launcher');
  assert.equal(fs.existsSync(receiptFile), false);
});

test('npm Launcher preserves foreign ownership and a non-stopping handoff receipt', async (t: any) => {
  const value: any = await fixture();
  const target: any = path.join(value.root, 'Applications', 'Buildr Web.app');
  const installed: any = installNpmLauncher({ registration: value.registration, platform: 'darwin', target, port: 0 });
  const productIdentity: any = productIdentityFor(installed.binding);
  const foreignIdentity: any = { ...productIdentity, installationIdentity: `sha256-${'f'.repeat(64)}` };
  const foreignRuntime: any = createRuntime();
  registerWebInstanceLifecycle(foreignRuntime, { readProductIdentity: () => foreignIdentity, assertNpmLauncherBinding: assertCurrentNpmLauncherBinding, createLocalWorkspaceServer, ensureRegisteredTarget });
  const foreign: any = await foreignRuntime.startBuildrWeb(['--no-open', '--port', '0']);
  const receiptFile: any = path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json');
  const foreignReceipt: any = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  const currentRuntime: any = createRuntime();
  registerWebInstanceLifecycle(currentRuntime, { readProductIdentity: () => productIdentity, assertNpmLauncherBinding: assertCurrentNpmLauncherBinding, createLocalWorkspaceServer, ensureRegisteredTarget });
  await assert.rejects(
    () => currentRuntime.startBuildrWeb(['--no-open', '--launcher-binding', installed.bindingPath]),
    (error: any) => error.code === 'launcher_handoff_cli_ownership_conflict',
  );
  assert.equal(JSON.parse(fs.readFileSync(receiptFile, 'utf8')).secret, foreignReceipt.secret);
  assert.equal(await fetch(`${foreign.url}/api/v1/health`, { headers: { 'x-buildr-instance': foreignReceipt.secret } }).then((response: any) => response.status), 200);
  await new Promise((resolve: any) => foreign.server.close(resolve));

  const profile: any = resolveWebProfile(productIdentity);
  const fakeSecret: any = crypto.randomBytes(32).toString('hex');
  const fake: any = http.createServer((request: any, response: any) => {
    if (request.url === '/api/v1/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(`${JSON.stringify({ schemaVersion: 'buildr.local-app-health/v1', status: 'ready', pid: process.pid, launcherIdentity: null, productIdentity, webProfile: profile })}\n`);
      return;
    }
    if (request.url === '/api/v1/app/quit-instance') {
      response.writeHead(202, { 'content-type': 'application/json' });
      response.end('{"status":"stopping"}\n');
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve: any, reject: any) => {
    fake.once('error', reject);
    fake.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => { if (fake.listening) fake.close(); });
  const fakeState: any = { url: `http://127.0.0.1:${fake.address().port}`, secret: fakeSecret, pid: process.pid, launcherIdentity: null, productIdentity, webProfile: profile };
  writeBuildrWebInstance(currentRuntime, fakeState);
  await assert.rejects(
    () => currentRuntime.startBuildrWeb(['--no-open', '--launcher-binding', installed.bindingPath]),
    (error: any) => error.code === 'launcher_handoff_shutdown_timeout',
  );
  assert.equal(JSON.parse(fs.readFileSync(receiptFile, 'utf8')).secret, fakeSecret);
  clearBuildrWebInstance(fakeState, profile);
  await new Promise((resolve: any) => fake.close(resolve));
});

test('non-Windows foreground Web clears its receipt on SIGHUP', async (t: any) => {
  if (process.platform === 'win32') return;
  const value: any = await fixture();
  const receiptFile: any = path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json');
  const child: any = spawnInstalledWeb(value.registration.entry.entryPath, ['--no-open', '--port', '0']);
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); });
  await waitFor(() => fs.existsSync(receiptFile) ? JSON.parse(fs.readFileSync(receiptFile, 'utf8')).pid === child.pid : false, { message: 'SIGHUP test receipt' });
  child.kill('SIGHUP');
  await waitForChildExit(child, 'SIGHUP Web process');
  assert.equal(fs.existsSync(receiptFile), false);
});

test('Windows Launcher PowerShell bridge preserves shortcut and root paths containing spaces', () => {
  const npmLauncherSource: any = fs.readFileSync(new URL('../../src/system/installation/infrastructure/npm-launcher.ts', import.meta.url), 'utf8');
  const developmentLauncherSource: any = fs.readFileSync(new URL('../../package/launchers/manage.ts', import.meta.url), 'utf8');
  for (const source of [npmLauncherSource, developmentLauncherSource]) {
    assert.doesNotMatch(source, /\$args\[[01]\]/);
    assert.match(source, /\$env:BUILDR_LAUNCHER_SHORTCUT/);
  }
  assert.match(developmentLauncherSource, /\$env:BUILDR_LAUNCHER_ROOT/);
});
