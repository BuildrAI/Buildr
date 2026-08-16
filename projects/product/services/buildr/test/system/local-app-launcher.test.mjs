import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { installLauncher, launcherStatus, uninstallLauncher } from '../../package/launchers/manage.mjs';
import { buildLauncher } from '../../package/launchers/build.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDER = path.join(PRODUCT_ROOT, 'package', 'launchers', 'build.mjs');
const CLI = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
const builtBundles = new Map();

test.beforeEach((t) => {
  const previousAppData = process.env.BUILDR_APP_DATA_DIR;
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-test-app-data-'));
  process.env.BUILDR_APP_DATA_DIR = appData;
  t.after(() => {
    if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousAppData;
    fs.rmSync(appData, { recursive: true, force: true });
  });
});

test.after(() => {
  for (const output of builtBundles.values()) fs.rmSync(output, { recursive: true, force: true });
  builtBundles.clear();
});

function build(platform) {
  const cached = builtBundles.get(platform);
  if (cached) return cached;
  const output = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-${platform}-development-launcher-`));
  const result = spawnSync(process.execPath, [BUILDER, '--platform', platform, '--channel', 'development', '--runtime', process.execPath, '--output', output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  builtBundles.set(platform, output);
  return output;
}

test('Buildr Web Dev固定4317端口且不复制Node、Buildr payload或正式安装代码', () => {
  if (process.platform === 'darwin') {
    const mac = build('darwin');
    const command = fs.readFileSync(path.join(mac, 'Buildr Web Dev.app', 'Contents', 'MacOS', 'Buildr'), 'utf8');
    assert.match(command, /web --port 4317/);
    assert.doesNotMatch(command, /Resources\/buildr|MacOS\/node/);
    assert.equal(fs.existsSync(path.join(mac, 'Buildr Web Dev.app', 'Contents', 'MacOS', 'node')), false);
  }
  const windows = build('win32');
  const command = fs.readFileSync(path.join(windows, 'Buildr Web Dev', 'Launch-Buildr.cmd'), 'utf8');
  assert.match(command, /web --port 4317/);
  assert.doesNotMatch(command, /runtime\\node\.exe|app\\bin\\buildr\.mjs/);
  assert.equal(fs.existsSync(path.join(windows, 'Buildr Web Dev', 'runtime')), false);
  assert.equal(fs.existsSync(path.join(windows, 'Buildr Web Dev', 'app')), false);
});

test('development launcher支持带空格checkout并绑定独立development host Node', (t) => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr checkout with spaces-'));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-space-launcher-'));
  t.after(() => { fs.rmSync(sourceRoot, { recursive: true, force: true }); fs.rmSync(output, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(sourceRoot, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'bin', 'buildr.mjs'), '#!/usr/bin/env node\n');
  buildLauncher({
    platform: 'darwin', output,
    identity: {
      schemaVersion: 'buildr.launcher-identity/v1', version: '0.0.0', channel: 'development', source: 'checkout',
      buildId: 'space-test', buildNumber: '1', protocolVersion: 1, platform: 'darwin', builtAt: new Date().toISOString(),
      sourceRoot,
      developmentRuntime: { executable: process.execPath, version: process.versions.node, identity: `development-host:${process.execPath}` },
    },
  });
  const launcher = fs.readFileSync(path.join(output, 'Buildr Web Dev.app', 'Contents', 'MacOS', 'Buildr'), 'utf8');
  const escaped = sourceRoot.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  assert.match(launcher, new RegExp(`SOURCE_ROOT='${escaped}'`));
  assert.match(launcher.replaceAll('\\', '/'), /bin\/buildr\.mjs/);
  assert.doesNotMatch(launcher, /Workspace Node/u);
});

test('旧release development-builder入口fail closed并引导到正式npm Launcher命令', async () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-launcher-rejected-'));
  try {
    const result = spawnSync(process.execPath, [BUILDER, '--channel', 'release', '--output', output], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /buildr web launcher install/i);
    assert.throws(() => launcherStatus({ platform: 'darwin', channel: 'release' }), /buildr web launcher/);
    await assert.rejects(() => installLauncher({ platform: 'darwin', channel: 'release' }), /buildr web launcher/);
    await assert.rejects(() => uninstallLauncher({ platform: 'darwin', channel: 'release' }), /buildr web launcher/);
  } finally { fs.rmSync(output, { recursive: true, force: true }); }
});

test('web launcher CLI只读投影npm-owned Launcher target', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-cli-default-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [CLI, 'web', 'launcher', 'status', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const status = JSON.parse(result.stdout);
  assert.equal(status.channel, 'npm');
  assert.equal(status.status, 'absent');
  assert.equal(status.target, root);
  assert.doesNotMatch(status.target, /Buildr Web Dev/);

  const rejected = spawnSync(process.execPath, [CLI, 'web', 'launcher', 'install', '--channel', 'development', '--target', root, '--json'], { encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stdout || rejected.stderr, /Unknown argument: --channel/u);
  assert.equal(fs.readdirSync(root).length, 0);
});

test('development installer直接调用内部manager而不是npm-owned公开Launcher', () => {
  const installer = fs.readFileSync(path.join(PRODUCT_ROOT, 'scripts', 'install-buildr-development'), 'utf8');
  assert.match(installer, /package\/launchers\/manage\.mjs" install --channel development/u);
  assert.doesNotMatch(installer, /bin\/buildr\.mjs" web launcher/u);
  assert.doesNotMatch(installer, /install-buildr-cli|command -v buildr|buildr --version/u);
});

test('Buildr Web Dev builder拒绝覆盖非空输出目录', (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-nonempty-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  fs.writeFileSync(path.join(output, 'running-bundle'), 'preserve');
  const result = spawnSync(process.execPath, [BUILDER, '--platform', 'darwin', '--channel', 'development', '--runtime', process.execPath, '--output', output], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be new or empty/);
  assert.equal(fs.readFileSync(path.join(output, 'running-bundle'), 'utf8'), 'preserve');
});

test('macOS Buildr Web Dev默认安装到系统Applications且与正式产品分根', () => {
  const status = launcherStatus({ platform: 'darwin', channel: 'development' });
  assert.equal(status.target, '/Applications/Buildr Web Dev.app');
  assert.notEqual(status.target, '/Applications/Buildr Web.app');
});

test('Buildr Web Dev使用staging安全切换并只清理可证明所有权的development入口', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const official = path.join(root, 'Buildr Web.app');
  fs.mkdirSync(official);
  fs.writeFileSync(path.join(official, 'official-sentinel'), 'keep');
  const ownedLegacy = path.join(root, 'Buildr Dev.app');
  const legacyIdentity = path.join(ownedLegacy, 'Contents', 'Resources', 'launcher-identity.json');
  fs.mkdirSync(path.dirname(legacyIdentity), { recursive: true });
  fs.writeFileSync(legacyIdentity, `${JSON.stringify({ schemaVersion: 'buildr.launcher-identity/v1', channel: 'development', platform: 'darwin' })}\n`);

  const first = await installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false });
  assert.equal(first.installed, true);
  assert.equal(first.identity.source, 'checkout');
  assert.equal(first.identity.sourceRoot, PRODUCT_ROOT);
  assert.ok(first.identity.developmentRuntime?.executable);
  assert.equal(fs.existsSync(path.join(first.target, 'Contents', 'MacOS', 'node')), false);
  assert.equal(fs.existsSync(ownedLegacy), false);
  const second = await installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false });
  assert.ok(second.previous);
  assert.ok(fs.existsSync(path.join(official, 'official-sentinel')));

  const identityPath = path.join(first.target, 'Contents', 'Resources', 'launcher-identity.json');
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  identity.sourceRoot = path.join(root, 'missing-checkout');
  identity.developmentRuntime.executable = path.join(root, 'missing-node');
  fs.writeFileSync(identityPath, `${JSON.stringify(identity, null, 2)}\n`);
  const broken = launcherStatus({ platform: 'darwin', channel: 'development', installRoot: root });
  assert.deepEqual(broken.diagnostics.map((finding) => finding.code), ['development.source_missing', 'development.node_missing']);
  assert.match(broken.diagnostics[0].suggestion, /npm run install:development/u);

  const removed = await uninstallLauncher({ platform: 'darwin', channel: 'development', installRoot: root });
  assert.equal(removed.removed, true);
  assert.equal(fs.existsSync(first.target), false);
  assert.ok(fs.existsSync(path.join(official, 'official-sentinel')));
});

test('Buildr Web Dev保留ownership不可证明的旧入口与当前目标', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-foreign-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const foreignLegacy = path.join(root, 'Buildr Dev.app');
  fs.mkdirSync(foreignLegacy, { recursive: true });
  fs.writeFileSync(path.join(foreignLegacy, 'foreign-sentinel'), 'keep');
  const installed = await installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false });
  assert.deepEqual(installed.migration.preserved.map((item) => item.code), ['launcher.ownership_unproven']);
  await uninstallLauncher({ platform: 'darwin', channel: 'development', installRoot: root });
  assert.equal(fs.readFileSync(path.join(foreignLegacy, 'foreign-sentinel'), 'utf8'), 'keep');
  const foreignCurrent = path.join(root, 'Buildr Web Dev.app');
  fs.mkdirSync(foreignCurrent, { recursive: true });
  fs.writeFileSync(path.join(foreignCurrent, 'foreign-sentinel'), 'keep');
  await assert.rejects(() => installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false }), /Refusing to replace launcher without matching Buildr ownership/);
});
