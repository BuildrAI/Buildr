import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { installLauncher, launcherStatus, uninstallLauncher } from '../../package/launchers/manage.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDER = path.join(PRODUCT_ROOT, 'package', 'launchers', 'build.mjs');

function build(t, platform) {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-${platform}-launcher-`));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [BUILDER, '--platform', platform, '--runtime', process.execPath, '--output', output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return output;
}

test('macOS launcher bundle 携带 Node runtime、Buildr Web 资源和可双击 App 入口', (t) => {
  const output = build(t, 'darwin');
  const app = path.join(output, 'Buildr.app', 'Contents');
  const node = path.join(app, 'MacOS', 'node');
  const buildr = path.join(app, 'Resources', 'buildr');
  assert.ok(fs.statSync(path.join(app, 'MacOS', 'Buildr')).mode & 0o100);
  const launcher = fs.readFileSync(path.join(app, 'MacOS', 'Buildr'), 'utf8');
  assert.match(launcher, /launcher\.log/);
  assert.match(launcher, /\/usr\/bin\/nohup/);
  assert.match(launcher, /buildr\.mjs" app .*&/);
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
  assert.ok(fs.existsSync(path.join(buildr, 'src', 'interfaces', 'local-app', 'web', 'index.html')));
  assert.ok(fs.existsSync(path.join(buildr, 'node_modules', 'yaml', 'package.json')));
  const version = spawnSync(node, [path.join(buildr, 'bin', 'buildr.mjs'), '--version'], { encoding: 'utf8' });
  assert.equal(version.status, 0, version.stderr);
  const packageVersion = JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, 'package.json'), 'utf8')).version;
  assert.equal(version.stdout.trim(), packageVersion);
});

test('macOS launcher 不等待本地服务进程，避免 Finder 将图标判为无响应', (t) => {
  if (process.platform !== 'darwin') return t.skip('仅在 macOS 执行 shell launcher 行为检查');
  const output = build(t, 'darwin');
  const app = path.join(output, 'Buildr.app', 'Contents');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-home-'));
  const pidFile = path.join(home, 'launcher-child.pid');
  const runtime = path.join(app, 'MacOS', 'node');
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.writeFileSync(runtime, `#!/bin/sh\nprintf '%s\\n' "$$" > "$HOME/launcher-child.pid"\nexec sleep 5\n`, { mode: 0o755 });

  const result = spawnSync(path.join(app, 'MacOS', 'Buildr'), [], { encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(result.status, 0, result.stderr);
  for (let attempt = 0; attempt < 20 && !fs.existsSync(pidFile); attempt += 1) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  assert.ok(fs.existsSync(pidFile), 'launcher should start the local app after the shell returns');
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  assert.doesNotThrow(() => process.kill(pid, 0));
  process.kill(pid, 'SIGTERM');
});

test('Windows launcher bundle 携带 runtime、Web 资源与桌面/开始菜单快捷方式安装入口', (t) => {
  const output = build(t, 'win32');
  const root = path.join(output, 'Buildr');
  for (const file of ['runtime/node.exe', 'Buildr.ico', 'Buildr.vbs', 'Launch-Buildr.cmd', 'Install-Buildr-Shortcuts.ps1', 'Install Buildr.cmd', 'app/bin/buildr.mjs', 'app/src/interfaces/local-app/web/index.html']) {
    assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
  }
  const script = fs.readFileSync(path.join(root, 'Install-Buildr-Shortcuts.ps1'), 'utf8');
  assert.match(script, /Desktop/);
  assert.match(script, /Start Menu/);
  assert.match(script, /IconLocation/);
  assert.match(script, /Buildr\.ico/);
  const launcher = fs.readFileSync(path.join(root, 'Buildr.vbs'), 'utf16le').replace(/^\uFEFF/, '');
  assert.match(launcher, /Launch-Buildr\.cmd/);
  assert.match(launcher, /shell\.Run\(command, 0, True\)/);
  assert.match(launcher, /MsgBox "Buildr 无法启动/);
  const command = fs.readFileSync(path.join(root, 'Launch-Buildr.cmd'), 'utf8');
  assert.match(command, /BUILDR_LAUNCHER_IDENTITY/);
  assert.match(command, /runtime\\node\.exe/);
});

test('launcher builder 拒绝覆盖非空输出目录', (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-nonempty-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  fs.writeFileSync(path.join(output, 'running-bundle'), 'preserve');
  const result = spawnSync(process.execPath, [BUILDER, '--platform', 'darwin', '--runtime', process.execPath, '--output', output], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be new or empty/);
  assert.equal(fs.readFileSync(path.join(output, 'running-bundle'), 'utf8'), 'preserve');
});

test('macOS launcher 默认安装到系统 Applications', () => {
  const status = launcherStatus({ platform: 'darwin', channel: 'development' });
  assert.equal(status.target, '/Applications/Buildr Dev.app');
});

test('development launcher 使用 staging 安全切换并精确清理', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const previousAppData = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(root, 'app-data');
  t.after(() => { if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previousAppData; });
  const official = path.join(root, 'Buildr.app');
  fs.mkdirSync(official);
  fs.writeFileSync(path.join(official, 'official-sentinel'), 'keep');

  const first = await installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false });
  assert.equal(first.installed, true);
  assert.equal(first.identity.channel, 'development');
  assert.equal(first.identity.source, 'checkout');
  assert.ok(fs.existsSync(path.join(first.target, 'Contents', 'MacOS', 'node')));
  const second = await installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false });
  assert.equal(second.target, first.target);
  assert.ok(second.previous);
  assert.ok(fs.existsSync(path.join(official, 'official-sentinel')));
  assert.equal(launcherStatus({ platform: 'darwin', channel: 'development', installRoot: root }).installed, true);

  fs.mkdirSync(process.env.BUILDR_APP_DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json'), '{"schemaVersion":"buildr.local-app-instance/v1","url":"http://127.0.0.1:1","secret":"legacy","pid":999999}\n');
  await assert.rejects(() => installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath }), /no launcher identity/);
  fs.rmSync(path.join(process.env.BUILDR_APP_DATA_DIR, 'instance.json'));

  const removed = await uninstallLauncher({ platform: 'darwin', channel: 'development', installRoot: root });
  assert.equal(removed.removed, true);
  assert.equal(fs.existsSync(first.target), false);
  assert.ok(fs.existsSync(path.join(official, 'official-sentinel')));
});
