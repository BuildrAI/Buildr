import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

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

const SOURCE_COMMIT = 'd4361952d7111f131b5923fedcf4b58077719eb6';

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
  assert.equal(installed.binding.packageRoot, path.join(value.packageRoot, 'payload', 'product'));
  assert.equal(installed.binding.hostNode.path, process.execPath);

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
