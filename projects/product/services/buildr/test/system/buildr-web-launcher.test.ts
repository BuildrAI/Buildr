import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { installLauncher, launcherStatus, uninstallLauncher } from '../../tools/build/launcher/manage.ts';
import { buildLauncher } from '../../tools/build/launcher/build.ts';

const PRODUCT_ROOT: any = path.resolve(import.meta.dirname, '../..');
const BUILDER: any = path.join(PRODUCT_ROOT, 'tools', 'build', 'launcher', 'build.ts');
const CLI: any = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
const builtBundles: any = new Map();

test.beforeEach((t: any) => {
  const previousAppData: any = process.env.BUILDR_APP_DATA_DIR;
  const appData: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-test-app-data-'));
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

function build(platform: any): any  {
  const cached: any = builtBundles.get(platform);
  if (cached) return cached;
  const output: any = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-${platform}-development-launcher-`));
  const result: any = spawnSync(process.execPath, [BUILDER, '--platform', platform, '--channel', 'development', '--runtime', process.execPath, '--output', output], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  builtBundles.set(platform, output);
  return output;
}

test('Buildr Web Dev使用固定端口、支持显式无浏览器且不复制产品字节', () => {
  if (process.platform === 'darwin') {
    const mac: any = build('darwin');
    const command: any = fs.readFileSync(path.join(mac, 'Buildr Web Dev.app', 'Contents', 'MacOS', 'Buildr'), 'utf8');
    assert.match(command, /web --port 4458/);
    assert.match(command, /BUILDR_LAUNCHER_NO_OPEN/);
    assert.match(command, /NO_OPEN_ARG="--no-open"/);
    assert.doesNotMatch(command, /web --port 0/);
    assert.match(command, /Library\/Logs\/Buildr Dev/);
    assert.doesNotMatch(command, /Resources\/buildr|MacOS\/node/);
    assert.equal(fs.existsSync(path.join(mac, 'Buildr Web Dev.app', 'Contents', 'MacOS', 'node')), false);
    const identity: any = JSON.parse(fs.readFileSync(path.join(mac, 'Buildr Web Dev.app', 'Contents', 'Resources', 'launcher-identity.json'), 'utf8'));
    assert.equal(identity.webPort, 4458);
  }
  const windows: any = build('win32');
  const command: any = fs.readFileSync(path.join(windows, 'Buildr Web Dev', 'Launch-Buildr.cmd'), 'utf8');
  assert.match(command, /web --port 4458/);
  assert.match(command, /BUILDR_LAUNCHER_NO_OPEN/);
  assert.match(command, /NO_OPEN_ARG=--no-open/);
  assert.doesNotMatch(command, /web --port 0/);
  assert.match(command, /Buildr Dev\\Logs/);
  assert.doesNotMatch(command, /runtime\\node\.exe|app\\bin\\buildr\.mjs/);
  assert.equal(fs.existsSync(path.join(windows, 'Buildr Web Dev', 'runtime')), false);
  assert.equal(fs.existsSync(path.join(windows, 'Buildr Web Dev', 'app')), false);
});

test('development launcher支持带空格checkout并绑定独立development host Node', (t: any) => {
  const sourceRoot: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr checkout with spaces-'));
  const output: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-space-launcher-'));
  t.after(() => { fs.rmSync(sourceRoot, { recursive: true, force: true }); fs.rmSync(output, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(sourceRoot, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, 'bin', 'buildr.mjs'), '#!/usr/bin/env node\n');
  buildLauncher({
    platform: 'darwin', output,
    identity: {
      schemaVersion: 'buildr.launcher-identity/v1', version: '0.0.0', channel: 'development', runtimeRole: 'development', source: 'checkout',
      buildId: 'space-test', buildNumber: '1', protocolVersion: 1, protocolIdentity: 'buildr.web-protocol/v1', platform: 'darwin', builtAt: new Date().toISOString(),
      sourceRoot,
      developmentRuntime: { executable: process.execPath, version: process.versions.node, identity: `development-host:${process.execPath}` },
    },
  });
  const launcher: any = fs.readFileSync(path.join(output, 'Buildr Web Dev.app', 'Contents', 'MacOS', 'Buildr'), 'utf8');
  const escaped: any = sourceRoot.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  assert.match(launcher, new RegExp(`SOURCE_ROOT='${escaped}'`));
  assert.match(launcher.replaceAll('\\', '/'), /bin\/buildr\.mjs/);
  assert.doesNotMatch(launcher, /Workspace Node/u);
});

test('Development Launcher生成不在普通测试中执行真实平台入口', { skip: process.platform !== 'darwin' }, (t: any) => {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-development-wrapper-smoke-'));
  const output: any = path.join(base, 'launcher');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  buildLauncher({
    platform: 'darwin', output,
    identity: {
      schemaVersion: 'buildr.launcher-identity/v1', version: '0.0.0', channel: 'development', runtimeRole: 'development', source: 'checkout',
      buildId: 'wrapper-smoke', buildNumber: '1', protocolVersion: 1, protocolIdentity: 'buildr.web-protocol/v1', platform: 'darwin', builtAt: new Date().toISOString(),
      sourceRoot: PRODUCT_ROOT,
      developmentRuntime: { executable: process.execPath, version: process.versions.node, identity: `development-host:${process.execPath}:${process.versions.node}` },
    },
  });
  const wrapper: any = path.join(output, 'Buildr Web Dev.app', 'Contents', 'MacOS', 'Buildr');
  const command: any = fs.readFileSync(wrapper, 'utf8');
  assert.match(command, /web --port 4458/);
  assert.match(command, /BUILDR_LAUNCHER_NO_OPEN/);
  assert.doesNotMatch(command, /\/usr\/bin\/open|osascript/);
});

test('generated Mac launcher为source CLI提供私有辅助PATH并保留npm默认入口，无GUI或服务副作用', { skip: process.platform !== 'darwin' }, async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-development-helper-launcher-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const sourceRoot = path.join(base, 'checkout with spaces/projects/product/services/buildr'), output = path.join(base, 'launcher'), programs = path.join(sourceRoot, 'tools/development/programs'), defaultBin = path.join(base, 'npm-bin'), observation = path.join(base, 'observed.json');
  fs.mkdirSync(programs, { recursive: true }); fs.mkdirSync(path.join(sourceRoot, 'bin')); fs.mkdirSync(path.join(sourceRoot, 'src')); fs.mkdirSync(path.join(sourceRoot, 'resources')); fs.mkdirSync(defaultBin);
  fs.writeFileSync(path.join(sourceRoot, 'resources/manifest.yml'), 'fixture\n'); fs.writeFileSync(path.resolve(sourceRoot, '../../.node-version'), '24.15.0\n');
  for (const relative of ['programs/buildr-mysql', 'resolve-development-node']) fs.copyFileSync(path.join(PRODUCT_ROOT, 'tools/development', relative), path.join(sourceRoot, 'tools/development', relative));
  fs.chmodSync(path.join(programs, 'buildr-mysql'), 0o755); fs.chmodSync(path.join(sourceRoot, 'tools/development/resolve-development-node'), 0o755);
  const defaultBuildr = path.join(defaultBin, 'buildr'); fs.writeFileSync(defaultBuildr, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(sourceRoot, 'bin/buildr-mysql.mjs'), "console.log('buildr-mysql 1.0.0');\n");
  const programModule = new URL('../../src/modules/connection-skills/infrastructure/program.ts', import.meta.url).href;
  fs.writeFileSync(path.join(sourceRoot, 'bin/buildr.mjs'), `import fs from 'node:fs';\nimport {spawnSync} from 'node:child_process';\nimport {locateExecutable} from ${JSON.stringify(programModule)};\nconst mysql=locateExecutable('buildr-mysql');\nconst version=spawnSync(mysql,['--version'],{env:process.env,encoding:'utf8'});\nfs.writeFileSync(${JSON.stringify(observation)},JSON.stringify({node:process.execPath,args:process.argv.slice(2),path:process.env.PATH,mysql,buildr:locateExecutable('buildr'),version:{status:version.status,stdout:version.stdout,stderr:version.stderr}}));\n`);
  buildLauncher({ platform: 'darwin', output, identity: { schemaVersion: 'buildr.launcher-identity/v1', version: '0.0.0', channel: 'development', runtimeRole: 'development', source: 'checkout', buildId: 'private-helper', buildNumber: '1', protocolVersion: 1, protocolIdentity: 'buildr.web-protocol/v1', platform: 'darwin', builtAt: new Date().toISOString(), sourceRoot, developmentRuntime: { executable: process.execPath, version: process.versions.node, identity: `development-host:${process.execPath}:${process.versions.node}` } } });
  const wrapper = path.join(output, 'Buildr Web Dev.app/Contents/MacOS/Buildr');
  const inherited = { ...process.env, PATH: [defaultBin, '/usr/bin', '/bin'].join(path.delimiter), HOME: path.join(base, 'isolated-home'), BUILDR_LAUNCHER_NO_OPEN: '1' }; delete inherited.BUILDR_NODE; delete inherited.NVM_DIR;
  const result = spawnSync('/bin/sh', [wrapper], { env: inherited, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  const deadline = Date.now() + 10_000;
  while (!fs.existsSync(observation) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(fs.existsSync(observation), true, 'fixture CLI must finish; this test never launches a Web service');
  const observed = JSON.parse(fs.readFileSync(observation, 'utf8'));
  assert.deepEqual(observed.path.split(path.delimiter), [programs, path.dirname(process.execPath), defaultBin, '/usr/bin', '/bin']);
  assert.equal(observed.node, fs.realpathSync(process.execPath)); assert.equal(observed.mysql, fs.realpathSync(path.join(programs, 'buildr-mysql'))); assert.equal(observed.buildr, fs.realpathSync(defaultBuildr));
  assert.deepEqual(observed.args, ['web', '--port', '4458', '--no-open']);
  assert.deepEqual(observed.version, { status: 0, stdout: 'buildr-mysql 1.0.0\n', stderr: '' });
});

test('旧release development-builder入口fail closed并引导到正式npm Launcher命令', async () => {
  const output: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-launcher-rejected-'));
  try {
    const result: any = spawnSync(process.execPath, [BUILDER, '--channel', 'release', '--output', output], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /buildr web launcher install/i);
    assert.throws(() => launcherStatus({ platform: 'darwin', channel: 'release' }), /buildr web launcher/);
    await assert.rejects(() => installLauncher({ platform: 'darwin', channel: 'release' }), /buildr web launcher/);
    await assert.rejects(() => uninstallLauncher({ platform: 'darwin', channel: 'release' }), /buildr web launcher/);
  } finally { fs.rmSync(output, { recursive: true, force: true }); }
});

test('web launcher CLI只读投影npm-owned Launcher target', (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-cli-default-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result: any = spawnSync(process.execPath, [CLI, 'web', 'launcher', 'status', '--target', root, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const status: any = JSON.parse(result.stdout);
  assert.equal(status.channel, 'npm');
  assert.equal(status.status, 'absent');
  assert.equal(status.target, root);
  assert.doesNotMatch(status.target, /Buildr Web Dev/);

  const rejected: any = spawnSync(process.execPath, [CLI, 'web', 'launcher', 'install', '--channel', 'development', '--target', root, '--json'], { encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stdout || rejected.stderr, /Unknown argument: --channel/u);
  assert.equal(fs.readdirSync(root).length, 0);
});

test('development installer直接调用内部manager而不是npm-owned公开Launcher', () => {
  const installer: any = fs.readFileSync(path.join(PRODUCT_ROOT, 'tools', 'development', 'install-buildr-development'), 'utf8');
  const manager: any = fs.readFileSync(path.join(PRODUCT_ROOT, 'tools', 'build', 'launcher', 'manage.ts'), 'utf8');
  assert.match(installer, /tools\/build\/launcher\/manage\.ts" install --channel development/u);
  assert.doesNotMatch(installer, /bin\/buildr\.mjs" web launcher/u);
  assert.doesNotMatch(installer, /install-buildr-cli|command -v buildr|buildr --version/u);
  assert.match(manager, /import \{ prepareDevelopmentWeb \} from '\.\.\/\.\.\/development\/prepare-development-web\.ts'/u);
  assert.ok(manager.indexOf("if (action === 'install') await prepareDevelopmentWeb()") < manager.indexOf("action === 'install' ? await installLauncher(options)"));
});

test('Buildr Web Dev builder拒绝覆盖非空输出目录', (t: any) => {
  const output: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-nonempty-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  fs.writeFileSync(path.join(output, 'running-bundle'), 'preserve');
  const result: any = spawnSync(process.execPath, [BUILDER, '--platform', 'darwin', '--channel', 'development', '--runtime', process.execPath, '--output', output], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be new or empty/);
  assert.equal(fs.readFileSync(path.join(output, 'running-bundle'), 'utf8'), 'preserve');
});

test('macOS Buildr Web Dev默认安装到系统Applications且与正式产品分根', { skip: process.platform !== 'darwin' }, () => {
  const override: any = process.env.BUILDR_APP_DATA_DIR;
  delete process.env.BUILDR_APP_DATA_DIR;
  const status: any = launcherStatus({ platform: 'darwin', channel: 'development' });
  process.env.BUILDR_APP_DATA_DIR = override;
  assert.equal(status.target, '/Applications/Buildr Web Dev.app');
  assert.notEqual(status.target, '/Applications/Buildr Web.app');
  assert.match(status.dataRoot, /Application Support\/Buildr Dev$/u);
});

test('Buildr Web Dev使用staging安全切换并只清理可证明所有权的development入口', async (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const official: any = path.join(root, 'Buildr Web.app');
  fs.mkdirSync(official);
  fs.writeFileSync(path.join(official, 'official-sentinel'), 'keep');
  const ownedLegacy: any = path.join(root, 'Buildr Dev.app');
  const legacyIdentity: any = path.join(ownedLegacy, 'Contents', 'Resources', 'launcher-identity.json');
  fs.mkdirSync(path.dirname(legacyIdentity), { recursive: true });
  fs.writeFileSync(legacyIdentity, `${JSON.stringify({ schemaVersion: 'buildr.launcher-identity/v1', channel: 'development', platform: 'darwin' })}\n`);

  const first: any = await installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false });
  assert.equal(first.installed, true);
  assert.equal(first.identity.source, 'checkout');
  assert.equal(first.identity.webPort, 4458);
  assert.equal(first.identity.sourceRoot, PRODUCT_ROOT);
  assert.ok(first.identity.developmentRuntime?.executable);
  assert.equal(fs.existsSync(path.join(first.target, 'Contents', 'MacOS', 'node')), false);
  assert.equal(fs.existsSync(ownedLegacy), false);
  const second: any = await installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false });
  assert.ok(second.previous);
  assert.ok(fs.existsSync(path.join(official, 'official-sentinel')));

  const identityPath: any = path.join(first.target, 'Contents', 'Resources', 'launcher-identity.json');
  const identity: any = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  identity.sourceRoot = path.join(root, 'missing-checkout');
  identity.developmentRuntime.executable = path.join(root, 'missing-node');
  fs.writeFileSync(identityPath, `${JSON.stringify(identity, null, 2)}\n`);
  const broken: any = launcherStatus({ platform: 'darwin', channel: 'development', installRoot: root });
  assert.deepEqual(broken.diagnostics.map((finding: any) => finding.code), ['development.source_missing', 'development.node_missing']);
  assert.match(broken.diagnostics[0].suggestion, /npm run install:development/u);

  const removed: any = await uninstallLauncher({ platform: 'darwin', channel: 'development', installRoot: root });
  assert.equal(removed.removed, true);
  assert.equal(fs.existsSync(first.target), false);
  assert.ok(fs.existsSync(path.join(official, 'official-sentinel')));
});

test('Buildr Web Dev保留ownership不可证明的旧入口与当前目标', async (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-launcher-foreign-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const foreignLegacy: any = path.join(root, 'Buildr Dev.app');
  fs.mkdirSync(foreignLegacy, { recursive: true });
  fs.writeFileSync(path.join(foreignLegacy, 'foreign-sentinel'), 'keep');
  const installed: any = await installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false });
  assert.deepEqual(installed.migration.preserved.map((item: any) => item.code), ['launcher.ownership_unproven']);
  await uninstallLauncher({ platform: 'darwin', channel: 'development', installRoot: root });
  assert.equal(fs.readFileSync(path.join(foreignLegacy, 'foreign-sentinel'), 'utf8'), 'keep');
  const foreignCurrent: any = path.join(root, 'Buildr Web Dev.app');
  fs.mkdirSync(foreignCurrent, { recursive: true });
  fs.writeFileSync(path.join(foreignCurrent, 'foreign-sentinel'), 'keep');
  await assert.rejects(() => installLauncher({ platform: 'darwin', channel: 'development', installRoot: root, runtime: process.execPath, stopInstance: false }), /Refusing to replace launcher without matching Buildr ownership/);
});
