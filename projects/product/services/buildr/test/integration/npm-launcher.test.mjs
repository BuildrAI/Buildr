import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { buildApplicationPayload } from '../../scripts/release/application-payload.mjs';
import { createNpmPackStaging } from '../../scripts/release/release-artifact.mjs';
import {
  createProductUpdateAuthority,
  enrollProductInstallation,
} from '../../src/infrastructure/product-identity/installation-registry.mjs';
import {
  installNpmLauncher,
  npmLauncherStatus,
  refreshInstalledNpmLauncher,
  repairNpmLauncher,
  uninstallNpmLauncher,
} from '../../src/infrastructure/product-launcher/index.mjs';
import { registerLocalWorkspaceAppInterface } from '../../src/interfaces/local-app/http/server.mjs';

const SOURCE_COMMIT = 'd4361952d7111f131b5923fedcf4b58077719eb6';

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function legacyBinding(current) {
  const material = Object.fromEntries(Object.entries(current).filter(([field]) => !['bindingIdentity', 'webPort'].includes(field)));
  material.schemaVersion = 'buildr.npm-launcher-binding/v1';
  material.launcherOwnershipIdentity = digest(JSON.stringify({
    schemaVersion: material.schemaVersion,
    platform: material.platform,
    target: path.resolve(material.target),
    installationSlotIdentity: material.installationSlotIdentity,
  }));
  return { ...material, bindingIdentity: digest(JSON.stringify(material)) };
}

test.beforeEach((t) => {
  const previousAppData = process.env.BUILDR_APP_DATA_DIR;
  const previousProductData = process.env.BUILDR_PRODUCT_DATA_DIR;
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-launcher-test-app-data-'));
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

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-launcher-'));
  const prefix = path.join(root, 'prefix');
  const packageRoot = path.join(prefix, 'lib', 'node_modules', '@buildr-ai', 'buildr');
  const payload = path.join(root, 'payload');
  await buildApplicationPayload(payload, SOURCE_COMMIT);
  createNpmPackStaging(payload, packageRoot);
  const npmCliPath = path.join(prefix, 'npm-cli.js');
  fs.writeFileSync(npmCliPath, '// test npm authority\n');
  const updateAuthority = createProductUpdateAuthority({ nodeExecutable: process.execPath, npmCliPath, prefix });
  const enrolled = enrollProductInstallation({
    envelopePath: path.join(packageRoot, 'installation-origin.json'),
    productRoot: path.join(packageRoot, 'payload', 'product'),
    entryPath: path.join(packageRoot, 'bin', 'buildr.mjs'),
    runtimeExecutable: process.execPath,
    updateAuthority,
  }, { file: path.join(root, 'product-installations.json') });
  return { root, prefix, packageRoot, registration: { status: 'installed', entry: enrolled.entry } };
}

test('macOS npm Launcher is an owned projection and repair refreshes drift without copying product bytes', async () => {
  const value = await fixture();
  const target = path.join(value.root, 'Applications', 'Buildr Web.app');
  assert.equal(fs.existsSync(target), false, 'npm staging must not create a graphical Launcher');

  const installed = installNpmLauncher({ registration: value.registration, platform: 'darwin', target });
  assert.equal(installed.status, 'ready');
  assert.equal(installed.binding.channel, 'npm');
  assert.equal(installed.binding.schemaVersion, 'buildr.npm-launcher-binding/v2');
  assert.deepEqual(installed.binding.webPort, { preferred: 4457, fallback: 'random' });
  assert.equal(installed.binding.packageRoot, path.join(value.packageRoot, 'payload', 'product'));
  assert.equal(installed.binding.hostNode.path, process.execPath);
  const wrapper = fs.readFileSync(path.join(target, 'Contents', 'MacOS', 'Buildr Web'), 'utf8');
  assert.match(wrapper, /\/bin\/launchctl submit -l/);
  assert.match(wrapper, /trap cleanup 0/);
  assert.match(wrapper, /buildr-web-launcher "\$\{LABEL\}" "\$\{NODE\}"/);
  assert.doesNotMatch(wrapper, /\/usr\/bin\/nohup/);
  const plist = fs.readFileSync(path.join(target, 'Contents', 'Info.plist'), 'utf8');
  assert.match(plist, /<key>CFBundleIdentifier<\/key><string>ai\.buildr\.web\.npm-launcher\.slot[a-f0-9]{24}<\/string>/);

  const inventory = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
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
  assert.equal(inventory.every((file) => [
    'Contents/Info.plist',
    'Contents/MacOS/Buildr Web',
    'Contents/Resources/Buildr.icns',
    'Contents/Resources/launcher-binding.json',
  ].includes(file) || file.startsWith('Contents/_CodeSignature/')), true);
  assert.equal(inventory.some((file) => /(?:node|payload|package\.json|runtime\/buildr)/i.test(file)), false);

  const randomPort = installNpmLauncher({ registration: value.registration, platform: 'darwin', target, port: 0 });
  assert.deepEqual(randomPort.binding.webPort, { preferred: 0, fallback: 'random' });
  const preserved = repairNpmLauncher({ registration: value.registration, platform: 'darwin', target });
  assert.deepEqual(preserved.binding.webPort, { preferred: 0, fallback: 'random' });
  const explicit = repairNpmLauncher({ registration: value.registration, platform: 'darwin', target, port: 4317 });
  assert.deepEqual(explicit.binding.webPort, { preferred: 4317, fallback: 'random' });

  const bindingFile = path.join(target, 'Contents', 'Resources', 'launcher-binding.json');
  fs.writeFileSync(bindingFile, `${JSON.stringify(legacyBinding(explicit.binding), null, 2)}\n`);
  const legacy = npmLauncherStatus({ platform: 'darwin', target });
  assert.equal(legacy.status, 'stale');
  assert.equal(legacy.diagnostic.code, 'launcher.binding_legacy');
  const migrated = repairNpmLauncher({ registration: value.registration, platform: 'darwin', target });
  assert.equal(migrated.binding.schemaVersion, 'buildr.npm-launcher-binding/v2');
  assert.deepEqual(migrated.binding.webPort, { preferred: 4457, fallback: 'random' });

  const entry = value.registration.entry.entryPath;
  const original = fs.readFileSync(entry);
  fs.appendFileSync(entry, '\n// drift\n');
  assert.equal(npmLauncherStatus({ platform: 'darwin', target }).status, 'stale');
  const refreshed = refreshInstalledNpmLauncher({ registration: value.registration, platform: 'darwin', target });
  assert.equal(refreshed.status, 'ready');
  assert.equal(refreshed.action, 'refreshed');
  fs.writeFileSync(entry, original);
  assert.equal(npmLauncherStatus({ platform: 'darwin', target }).status, 'stale', 'restoring old package bytes makes the refreshed binding stale again');
  repairNpmLauncher({ registration: value.registration, platform: 'darwin', target });

  const removed = uninstallNpmLauncher({ registration: value.registration, platform: 'darwin', target });
  assert.equal(removed.status, 'absent');
  assert.equal(fs.existsSync(value.packageRoot), true, 'Launcher uninstall must retain npm Buildr');
});

test('Launcher refuses foreign targets and Windows shortcut binds exact Host Node, entry and binding', async () => {
  const value = await fixture();
  const foreign = path.join(value.root, 'foreign', 'Buildr Web.app');
  fs.mkdirSync(foreign, { recursive: true });
  assert.throws(
    () => installNpmLauncher({ registration: value.registration, platform: 'darwin', target: foreign }),
    /Refusing to replace foreign Launcher target/,
  );

  const shortcut = path.join(value.root, 'Start Menu', 'Buildr Web.lnk');
  let shortcutValue = null;
  const writeShortcut = ({ target, binding }) => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'test shortcut');
    shortcutValue = {
      target: binding.hostNode.path,
      arguments: `"${binding.packageEntry.path}" web --launcher-binding "${binding.bindingPath}"`,
      workingDirectory: binding.packageRoot,
    };
  };
  const readShortcut = () => shortcutValue;
  const installed = installNpmLauncher({ registration: value.registration, platform: 'win32', target: shortcut, writeShortcut, readShortcut });
  assert.equal(installed.status, 'ready');
  assert.equal(shortcutValue.target, process.execPath);
  assert.match(shortcutValue.arguments, /buildr\.mjs" web --launcher-binding/);

  const bindingPath = installed.bindingPath;
  const iconPath = path.join(path.dirname(bindingPath), 'Buildr.ico');
  const frozen = new Map([shortcut, bindingPath, iconPath].map((file) => [file, fs.readFileSync(file)]));
  assert.throws(() => installNpmLauncher({
    registration: value.registration,
    platform: 'win32',
    target: shortcut,
    readShortcut,
    writeShortcut: ({ target }) => {
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

test('released npm Launcher falls back once from an occupied preferred port while direct CLI stays strict', async (t) => {
  const value = await fixture();
  const target = path.join(value.root, 'Applications', 'Buildr Web.app');
  const occupied = net.createServer();
  await new Promise((resolve, reject) => {
    occupied.once('error', reject);
    occupied.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => occupied.close(resolve)));
  const preferred = occupied.address().port;
  const installed = installNpmLauncher({ registration: value.registration, platform: 'darwin', target, port: preferred });
  const productIdentity = {
    package: installed.binding.package,
    version: installed.binding.version,
    protocolIdentity: installed.binding.protocolIdentity,
    applicationPayloadDigest: installed.binding.applicationPayloadDigest,
    channel: 'npm',
    runtime: { role: 'host' },
    installationIdentity: installed.binding.installationOwnershipIdentity,
  };
  const runtime = createRuntime();
  registerLocalWorkspaceAppInterface(runtime, { readProductIdentity: () => productIdentity });
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));
  t.after(() => { console.warn = originalWarn; });

  const started = await runtime.startLocalWorkspaceApp(['--no-open', '--launcher-binding', installed.bindingPath]);
  const actualPort = Number(new URL(started.url).port);
  assert.notEqual(actualPort, preferred);
  assert.match(warnings.join('\n'), new RegExp(`首选端口 ${preferred} 已被占用`));
  const receipt = JSON.parse(fs.readFileSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json'), 'utf8'));
  assert.equal(receipt.url, started.url);
  assert.equal(receipt.launcherIdentity.bindingIdentity, installed.binding.bindingIdentity);
  const closed = new Promise((resolve) => started.server.once('close', resolve));
  const stopped = await fetch(`${receipt.url}/api/v1/app/quit-instance`, {
    method: 'POST',
    headers: { 'x-buildr-instance': receipt.secret },
  });
  assert.equal(stopped.status, 202);
  await closed;
  assert.equal(fs.existsSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json')), false);

  await assert.rejects(
    () => runtime.startLocalWorkspaceApp(['--no-open', '--port', String(preferred)]),
    /EADDRINUSE|address already in use/i,
  );
});

test('Windows Launcher PowerShell bridge preserves shortcut and root paths containing spaces', () => {
  const npmLauncherSource = fs.readFileSync(new URL('../../src/infrastructure/product-launcher/index.mjs', import.meta.url), 'utf8');
  const developmentLauncherSource = fs.readFileSync(new URL('../../package/launchers/manage.mjs', import.meta.url), 'utf8');
  for (const source of [npmLauncherSource, developmentLauncherSource]) {
    assert.doesNotMatch(source, /\$args\[[01]\]/);
    assert.match(source, /\$env:BUILDR_LAUNCHER_SHORTCUT/);
  }
  assert.match(developmentLauncherSource, /\$env:BUILDR_LAUNCHER_ROOT/);
});
