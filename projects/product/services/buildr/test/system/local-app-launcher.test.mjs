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
const builtBundles = new Map();

test.after(() => {
  for (const output of builtBundles.values()) fs.rmSync(output, { recursive: true, force: true });
  builtBundles.clear();
});

function build(t, platform, channel = 'release') {
  const key = `${platform}:${channel}`;
  const cached = builtBundles.get(key);
  if (cached) return cached;
  const output = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-${platform}-launcher-`));
  const result = spawnSync(process.execPath, [BUILDER, '--platform', platform, '--channel', channel, '--runtime', process.execPath, '--output', output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  builtBundles.set(key, output);
  return output;
}

test('Buildr Web development Launcher 固定 4317 端口，release Launcher 保持动态端口', (t) => {
  if (process.platform === 'darwin') {
    const developmentMac = build(t, 'darwin', 'development');
    const releaseMac = build(t, 'darwin', 'release');
    const macCommand = (root, name) => fs.readFileSync(path.join(root, `${name}.app`, 'Contents', 'MacOS', 'Buildr'), 'utf8');
    assert.match(macCommand(developmentMac, 'Buildr Web Dev'), /web --port 4317/);
    assert.doesNotMatch(macCommand(developmentMac, 'Buildr Web Dev'), /Resources\/buildr|MacOS\/node/);
    assert.doesNotMatch(macCommand(releaseMac, 'Buildr Web'), /web --port 4317/);
    assert.equal(fs.existsSync(path.join(developmentMac, 'Buildr Web Dev.app', 'Contents', 'MacOS', 'node')), false);
    assert.equal(fs.existsSync(path.join(developmentMac, 'Buildr Web Dev.app', 'Contents', 'Resources', 'buildr')), false);
  }
  const developmentWindows = build(t, 'win32', 'development');
  const releaseWindows = build(t, 'win32', 'release');
  const windowsCommand = (root, name) => fs.readFileSync(path.join(root, name, 'Launch-Buildr.cmd'), 'utf8');

  assert.match(windowsCommand(developmentWindows, 'Buildr Web Dev'), /web --port 4317/);
  assert.doesNotMatch(windowsCommand(developmentWindows, 'Buildr Web Dev'), /runtime\\node\.exe|app\\bin\\buildr\.mjs/);
  assert.doesNotMatch(windowsCommand(releaseWindows, 'Buildr Web'), /web --port 4317/);
  assert.equal(fs.existsSync(path.join(developmentWindows, 'Buildr Web Dev', 'runtime', 'node.exe')), false);
  assert.equal(fs.existsSync(path.join(developmentWindows, 'Buildr Web Dev', 'app')), false);
});

test('development launcher 支持带空格的 checkout 路径', (t) => {
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr checkout with spaces-'));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-space-launcher-'));
  t.after(() => { fs.rmSync(sourceRoot, { recursive: true, force: true }); fs.rmSync(output, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(sourceRoot, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'bin', 'buildr.mjs'), '#!/usr/bin/env node\n');
  buildLauncher({
    platform: 'darwin',
    output,
    runtime: process.execPath,
    identity: {
      schemaVersion: 'buildr.launcher-identity/v1', version: '0.0.0', channel: 'development', source: 'checkout',
      buildId: 'space-test', buildNumber: '1', protocolVersion: 1, platform: 'darwin', builtAt: new Date().toISOString(),
      sourceRoot, nodeRuntime: { executable: process.execPath, version: process.versions.node },
    },
  });
  const launcher = fs.readFileSync(path.join(output, 'Buildr Web Dev.app', 'Contents', 'MacOS', 'Buildr'), 'utf8');
  const escapedSourceRoot = sourceRoot.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  assert.match(launcher, new RegExp(`SOURCE_ROOT='${escapedSourceRoot}'`));
  assert.match(launcher.replaceAll('\\', '/'), /bin\/buildr\.mjs/);
});

test('macOS Buildr Web Launcher 携带 Node runtime、正式 Web dist 和可双击入口', (t) => {
  if (process.platform !== 'darwin') return t.skip('仅在 macOS 构建 Darwin launcher bundle');
  const output = build(t, 'darwin');
  const app = path.join(output, 'Buildr Web.app', 'Contents');
  const node = path.join(app, 'MacOS', 'node');
  const buildr = path.join(app, 'Resources', 'buildr');
  assert.ok(fs.statSync(path.join(app, 'MacOS', 'Buildr')).mode & 0o100);
  const launcher = fs.readFileSync(path.join(app, 'MacOS', 'Buildr'), 'utf8');
  assert.match(launcher, /launcher\.log/);
  assert.match(launcher, /\/usr\/bin\/nohup/);
  assert.match(launcher, /buildr\.mjs" web .*&/);
  assert.match(launcher, /exit 0/);
  assert.doesNotMatch(launcher, /STATUS=\$\?/);
  assert.ok(fs.existsSync(path.join(app, 'Resources', 'Buildr.icns')));
  const identity = JSON.parse(fs.readFileSync(path.join(app, 'Resources', 'launcher-identity.json'), 'utf8'));
  assert.equal(identity.schemaVersion, 'buildr.launcher-identity/v1');
  assert.equal(identity.channel, 'release');
  assert.match(fs.readFileSync(path.join(app, 'Info.plist'), 'utf8'), /<key>CFBundleIconFile<\/key><string>Buildr\.icns<\/string>/);
  assert.match(fs.readFileSync(path.join(app, 'Info.plist'), 'utf8'), /CFBundleShortVersionString/);
  assert.match(fs.readFileSync(path.join(app, 'Info.plist'), 'utf8'), /<key>LSUIElement<\/key><true\/>/);
  assert.doesNotMatch(fs.readFileSync(path.join(app, 'Info.plist'), 'utf8'), /LSBackgroundOnly/);
  assert.ok(fs.existsSync(path.join(buildr, 'src', 'interfaces', 'local-app', 'web-dist', 'index.html')));
  assert.ok(fs.existsSync(path.join(buildr, 'node_modules', 'yaml', 'package.json')));
  const nodeLibraries = spawnSync('otool', ['-L', node], { encoding: 'utf8' });
  assert.equal(nodeLibraries.status, 0, nodeLibraries.stderr);
  assert.doesNotMatch(nodeLibraries.stdout, /\/opt\/homebrew\/|\/usr\/local\//, 'Release Launcher must not retain package-manager dylib paths');
  const bundledLibraries = [...nodeLibraries.stdout.matchAll(/@loader_path\/(\S+\.dylib)/g)].map((match) => match[1]);
  const sourceLibraries = spawnSync('otool', ['-L', process.execPath], { encoding: 'utf8' });
  if (/\/opt\/homebrew\/|\/usr\/local\//.test(sourceLibraries.stdout)) assert.ok(bundledLibraries.length > 0, 'Release Launcher must rewrite Node dylibs to bundle-relative paths');
  for (const library of bundledLibraries) assert.ok(fs.existsSync(path.join(app, 'MacOS', library)), `missing bundled runtime library ${library}`);
  const version = spawnSync(node, [path.join(buildr, 'bin', 'buildr.mjs'), '--version'], { encoding: 'utf8' });
  assert.equal(version.status, 0, version.stderr);
  const packageVersion = JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, 'package.json'), 'utf8')).version;
  assert.equal(version.stdout.trim(), packageVersion);
});

test('macOS Buildr Web Launcher 不等待本地服务进程，避免 Finder 将图标判为无响应', (t) => {
  if (process.platform !== 'darwin') return t.skip('仅在 macOS 执行 shell launcher 行为检查');
  const output = build(t, 'darwin');
  const app = path.join(output, 'Buildr Web.app', 'Contents');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-home-'));
  const pidFile = path.join(home, 'launcher-child.pid');
  const completedFile = path.join(home, 'launcher-child.completed');
  const runtime = path.join(app, 'MacOS', 'node');
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.writeFileSync(runtime, `#!/bin/sh\nprintf '%s\\n' "$$" > "$HOME/launcher-child.pid"\nsleep 1\nprintf 'completed\\n' > "$HOME/launcher-child.completed"\n`, { mode: 0o755 });

  const result = spawnSync(path.join(app, 'MacOS', 'Buildr'), [], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(result.status, 0, result.stderr);
  for (let attempt = 0; attempt < 20 && !fs.existsSync(pidFile); attempt += 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  assert.ok(fs.existsSync(pidFile), 'Launcher should start Buildr Web after the shell returns');
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  assert.doesNotThrow(() => process.kill(pid, 0));
  for (let attempt = 0; attempt < 300 && !fs.existsSync(completedFile); attempt += 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  assert.ok(fs.existsSync(completedFile), 'launcher fixture process should complete within its bounded lifetime');
});

test('Windows Buildr Web Launcher 携带 runtime、Web dist 与受控快捷方式安装入口', (t) => {
  const output = build(t, 'win32');
  const root = path.join(output, 'Buildr Web');
  for (const file of ['runtime/node.exe', 'Buildr.ico', 'Buildr.vbs', 'Launch-Buildr.cmd', 'Install-Buildr-Shortcuts.ps1', 'Install Buildr.cmd', 'app/bin/buildr.mjs', 'app/src/interfaces/local-app/web-dist/index.html']) {
    assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
  }
  const script = fs.readFileSync(path.join(root, 'Install-Buildr-Shortcuts.ps1'), 'utf8');
  assert.match(script, /Desktop/);
  assert.match(script, /Start Menu/);
  assert.match(script, /IconLocation/);
  assert.match(script, /Buildr\.ico/);
  assert.match(script, /Refusing to overwrite shortcut without matching Buildr ownership/);
  const launcher = fs.readFileSync(path.join(root, 'Buildr.vbs'), 'utf16le').replace(/^\uFEFF/, '');
  assert.match(launcher, /Launch-Buildr\.cmd/);
  assert.match(launcher, /shell\.Run\(command, 0, True\)/);
  assert.match(launcher, /MsgBox "Buildr Web 无法启动/);
  const command = fs.readFileSync(path.join(root, 'Launch-Buildr.cmd'), 'utf8');
  assert.match(command, /BUILDR_LAUNCHER_IDENTITY/);
  assert.match(command, /runtime\\node\.exe/);
});

test('Buildr Web Launcher builder 拒绝覆盖非空输出目录', (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-nonempty-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  fs.writeFileSync(path.join(output, 'running-bundle'), 'preserve');
  const result = spawnSync(process.execPath, [BUILDER, '--platform', 'darwin', '--runtime', process.execPath, '--output', output], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be new or empty/);
  assert.equal(fs.readFileSync(path.join(output, 'running-bundle'), 'utf8'), 'preserve');
});

test('macOS Buildr Web Launcher 默认安装到系统 Applications', () => {
  const status = launcherStatus({ platform: 'darwin', channel: 'development' });
  assert.equal(status.target, '/Applications/Buildr Web Dev.app');
});

test('development Buildr Web Launcher 使用 staging 安全切换并精确清理', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const previousAppData = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(root, 'app-data');
  t.after(() => { if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previousAppData; });
  const official = path.join(root, 'Buildr.app');
  fs.mkdirSync(official);
  fs.writeFileSync(path.join(official, 'official-sentinel'), 'keep');
  const ownedLegacy = path.join(root, 'Buildr Dev.app');
  const ownedLegacyIdentity = path.join(ownedLegacy, 'Contents', 'Resources', 'launcher-identity.json');
  fs.mkdirSync(path.dirname(ownedLegacyIdentity), { recursive: true });
  fs.writeFileSync(ownedLegacyIdentity, `${JSON.stringify({ schemaVersion: 'buildr.launcher-identity/v1', channel: 'development', platform: 'darwin' })}\n`);

  const first = await installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false });
  assert.equal(first.installed, true);
  assert.equal(first.identity.channel, 'development');
  assert.equal(first.identity.source, 'checkout');
  assert.equal(first.identity.sourceRoot, PRODUCT_ROOT);
  assert.ok(first.identity.nodeRuntime?.executable);
  assert.equal(fs.existsSync(path.join(first.target, 'Contents', 'MacOS', 'node')), false);
  assert.equal(fs.existsSync(ownedLegacy), false);
  assert.deepEqual(first.migration.removed, [ownedLegacy]);
  const second = await installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false });
  assert.equal(second.target, first.target);
  assert.ok(second.previous);
  assert.ok(fs.existsSync(path.join(official, 'official-sentinel')));
  assert.equal(launcherStatus({ platform: 'darwin', channel: 'development', installRoot: root }).installed, true);

  const identityPath = path.join(first.target, 'Contents', 'Resources', 'launcher-identity.json');
  const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  identity.sourceRoot = path.join(root, 'missing-checkout');
  identity.nodeRuntime.executable = path.join(root, 'missing-node');
  fs.writeFileSync(identityPath, `${JSON.stringify(identity, null, 2)}\n`);
  const broken = launcherStatus({ platform: 'darwin', channel: 'development', installRoot: root });
  assert.deepEqual(broken.diagnostics.map((finding) => finding.code), ['development.source_missing', 'development.node_missing']);

  fs.mkdirSync(process.env.BUILDR_APP_DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json'), '{"schemaVersion":"buildr.local-app-instance/v1","url":"http://127.0.0.1:1","secret":"legacy","pid":999999}\n');
  await assert.rejects(() => installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath }), /no launcher identity/);
  fs.rmSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json'));

  const removed = await uninstallLauncher({ platform: 'darwin', channel: 'development', installRoot: root });
  assert.equal(removed.removed, true);
  assert.equal(fs.existsSync(first.target), false);
  assert.equal(fs.existsSync(`${first.target}.previous`), false);
  assert.ok(fs.existsSync(path.join(official, 'official-sentinel')));
});

test('Buildr Web Launcher 保留 ownership 不可证明的旧入口与当前目标', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-foreign-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const foreignLegacy = path.join(root, 'Buildr Dev.app');
  fs.mkdirSync(foreignLegacy, { recursive: true });
  fs.writeFileSync(path.join(foreignLegacy, 'foreign-sentinel'), 'keep');

  const installed = await installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false });
  assert.equal(installed.installed, true);
  assert.equal(fs.readFileSync(path.join(foreignLegacy, 'foreign-sentinel'), 'utf8'), 'keep');
  assert.deepEqual(installed.migration.preserved.map((item) => item.code), ['launcher.ownership_unproven']);

  const removed = await uninstallLauncher({ platform: 'darwin', channel: 'development', installRoot: root });
  assert.equal(removed.removed, true);
  assert.equal(fs.existsSync(installed.target), false);
  assert.equal(fs.readFileSync(path.join(foreignLegacy, 'foreign-sentinel'), 'utf8'), 'keep');

  const foreignCurrent = path.join(root, 'Buildr Web Dev.app');
  fs.mkdirSync(foreignCurrent, { recursive: true });
  fs.writeFileSync(path.join(foreignCurrent, 'foreign-sentinel'), 'keep');
  await assert.rejects(
    () => installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false }),
    /Refusing to replace launcher without matching Buildr ownership/,
  );
  assert.equal(fs.readFileSync(path.join(foreignCurrent, 'foreign-sentinel'), 'utf8'), 'keep');
});
