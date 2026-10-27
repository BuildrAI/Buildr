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

import { createUpdateLauncher } from '../../src/modules/installation/application/update-launcher.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { buildApplicationPayload } from '../../../../../../skills/buildr-release/scripts/application-payload.ts';
import { createNpmPackStaging } from '../../../../../../skills/buildr-release/scripts/release-artifact.ts';
import { createGeneratedReleaseInputs } from '../helpers/generated-release-inputs.ts';
import {
  createProductUpdateAuthority,
  enrollProductInstallation,
} from '../../src/modules/installation/infrastructure/installation-registry.ts';
import {
  installNpmLauncher,
  npmLauncherStatus,
  assertCurrentNpmLauncherBinding,
  refreshInstalledNpmLauncher,
  repairNpmLauncher,
  uninstallNpmLauncher,
} from '../../src/modules/installation/infrastructure/npm-launcher.ts';
import { registerWebInstanceLifecycle } from '../../src/web/application/instance-lifecycle.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { ensureRegisteredTarget } from '../../src/modules/workspace/module.ts';
import {
  clearBuildrWebInstance,
  acquireBuildrWebStartLock,
  releaseBuildrWebStartLock,
  writeBuildrWebInstance,
} from '../../src/web/infrastructure/instance-runtime.ts';
import { resolveWebProfile } from '../../src/modules/installation/contracts/web-profile.ts';
import { APPLICATION_PAYLOAD_MANIFEST, canonicalApplicationPayloadIdentity } from '../../src/infrastructure/product-resources/index.ts';

const SOURCE_COMMIT: any = 'd4361952d7111f131b5923fedcf4b58077719eb6';
type FixtureCleanup = () => void | Promise<void>;
const fixtureCleanups = new WeakMap<object, FixtureCleanup[]>();
let suite: { root: string; payload: string; packageRoot: string; testContextRoot: string };
let suiteRoot: string | undefined;
let updatePackages: { old: string; next: string } | undefined;

// Build real release bytes once per file. Tests mutate independent copies;
// these templates never become an enrolled or running installation.
test.before(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-npm-launcher-suite-'));
  suiteRoot = root;
  const generated = createGeneratedReleaseInputs(path.join(root, 'generated'), SOURCE_COMMIT);
  const payload = path.join(root, 'payload');
  const packageRoot = path.join(root, 'package');
  await buildApplicationPayload(payload, SOURCE_COMMIT, { generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot });
  createNpmPackStaging(payload, packageRoot, { testContextRoot: generated.testContextRoot });
  suite = { root, payload, packageRoot, testContextRoot: generated.testContextRoot };
});
test.after(() => { if (suiteRoot) fs.rmSync(suiteRoot, { recursive: true, force: true }); });

function copyFixture(source: string, destination: string) {
  // Copy-on-write when available, regular copies elsewhere; never hard links.
  fs.cpSync(source, destination, { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
}

function onFixtureCleanup(t: object, cleanup: FixtureCleanup) {
  const pending = fixtureCleanups.get(t);
  assert.ok(pending, 'fixture cleanup requires the suite-owned cleanup queue');
  pending.push(cleanup);
}

function prepareUpdatePackages() {
  if (updatePackages) return updatePackages;
  const old = path.join(suite.root, 'old-package');
  const next = path.join(suite.root, 'next-package');
  setFixturePayloadVersion(suite.payload, '0.0.1');
  createNpmPackStaging(suite.payload, old, { testContextRoot: suite.testContextRoot });
  setFixturePayloadVersion(suite.payload, '0.0.2');
  createNpmPackStaging(suite.payload, next, { testContextRoot: suite.testContextRoot });
  updatePackages = { old, next };
  fs.rmSync(suite.payload, { recursive: true, force: true });
  return updatePackages;
}

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
  const pending: FixtureCleanup[] = [];
  fixtureCleanups.set(t, pending);
  t.after(async () => {
    try {
      const failures: unknown[] = [];
      for (const cleanup of [...pending].reverse()) {
        try { await cleanup(); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, `Fixture cleanup failed at ${appData}.`);
      fs.rmSync(appData, { recursive: true, force: true });
    } finally {
      if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR;
      else process.env.BUILDR_APP_DATA_DIR = previousAppData;
      if (previousProductData === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR;
      else process.env.BUILDR_PRODUCT_DATA_DIR = previousProductData;
    }
  });
});

async function fixture({ runnable = false, template = suite.packageRoot } = {}): Promise<any>  {
  // Allocate below this test's state before preparation, so failures clean up too.
  const root: any = fs.mkdtempSync(path.join(process.env.BUILDR_APP_DATA_DIR!, 'installation-'));
  const prefix: any = path.join(root, 'prefix');
  const packageRoot: any = path.join(prefix, 'lib', 'node_modules', '@buildr-ai', 'buildr');
  if (runnable) copyFixture(template, packageRoot);
  else {
    // Binding and in-process lifecycle checks need real identity/entry bytes,
    // not the runtime, dependencies, skills and other installed resources.
    for (const relative of ['application-payload.json', 'installation-origin.json', 'bin/buildr.mjs', 'payload/product/package.json']) {
      const target = path.join(packageRoot, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(template, relative), target);
    }
  }
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

function setFixturePayloadVersion(payloadRoot: string, version: string) {
  const metadataFile = path.join(payloadRoot, 'resources', 'product', 'package.json');
  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  fs.writeFileSync(metadataFile, `${JSON.stringify({ ...metadata, version }, null, 2)}\n`);
  const manifestFile = path.join(payloadRoot, APPLICATION_PAYLOAD_MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const metadataBytes = fs.readFileSync(metadataFile);
  const entry = manifest.files.find((file: any) => file.path === 'resources/product/package.json');
  assert.ok(entry, 'fixture version metadata must be bound by the payload manifest');
  Object.assign(entry, { size: metadataBytes.length, sha256: crypto.createHash('sha256').update(metadataBytes).digest('hex') });
  manifest.buildrVersion = version;
  manifest.applicationPayloadDigest = canonicalApplicationPayloadIdentity(manifest);
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function updateFixture(t: any, { launcher = false }: { launcher?: boolean } = {}) {
  const templates = prepareUpdatePackages();
  const staged = await fixture({ runnable: true, template: templates.old });
  const value = { ...staged, root: fs.realpathSync(staged.root), prefix: fs.realpathSync(staged.prefix), packageRoot: fs.realpathSync(staged.packageRoot) };
  const oldVersion = '0.0.1', newVersion = '0.0.2';
  const nextPackageRoot = path.join(value.root, 'next-package');
  const npmCliPath = path.join(value.prefix, 'npm-cli.js');
  const npmLog = path.join(value.root, 'npm-commands.jsonl');
  const entryLog = path.join(value.root, 'entry-invocations.jsonl');
  const launcherTarget = launcher ? path.join(value.root, 'Applications', 'Buildr Web.app') : null;
  const appData = process.env.BUILDR_APP_DATA_DIR!;
  const receiptFile = path.join(appData, 'instance.json');
  copyFixture(templates.next, nextPackageRoot);
  const entry = path.join(value.packageRoot, 'bin', 'buildr.mjs');
  const nextEntry = path.join(nextPackageRoot, 'bin', 'buildr.mjs');
  fs.writeFileSync(nextEntry, `import fs from 'node:fs';\nfs.appendFileSync(${JSON.stringify(entryLog)}, JSON.stringify({ node: process.execPath, entry: process.argv[1], args: process.argv.slice(2), version: ${JSON.stringify(newVersion)} }) + '\\n');\n${fs.readFileSync(nextEntry, 'utf8').replace(/^#![^\n]*\n/u, '')}`);
  fs.writeFileSync(npmCliPath, `import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(npmLog)}, JSON.stringify(args) + '\\n');
if (args[0] === 'view') {
  process.stdout.write(JSON.stringify({ latest: ${JSON.stringify(newVersion)}, next: ${JSON.stringify(newVersion)} }) + '\\n');
} else if (args[0] === 'install') {
  assert.deepEqual(args, ['install', '--global', '--prefix', ${JSON.stringify(value.prefix)}, '@buildr-ai/buildr@${newVersion}']);
  fs.rmSync(${JSON.stringify(value.packageRoot)}, { recursive: true, force: true });
  fs.cpSync(${JSON.stringify(nextPackageRoot)}, ${JSON.stringify(value.packageRoot)}, { recursive: true });
  const result = spawnSync(process.execPath, [path.join(${JSON.stringify(value.packageRoot)}, 'scripts/postinstall.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, npm_lifecycle_event: 'postinstall', npm_config_global: 'true', npm_package_json: path.join(${JSON.stringify(value.packageRoot)}, 'package.json'), npm_config_prefix: ${JSON.stringify(value.prefix)}, npm_execpath: ${JSON.stringify(npmCliPath)}, npm_node_execpath: process.execPath },
  });
  if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout || String(result.error)); process.exit(result.status ?? 1); }
  ${launcherTarget ? `const repaired = spawnSync(process.execPath, [${JSON.stringify(entry)}, 'web', 'launcher', 'repair', '--target', ${JSON.stringify(launcherTarget)}, '--json'], { encoding: 'utf8', env: process.env });
  if (repaired.status !== 0) { process.stderr.write(repaired.stderr || repaired.stdout || String(repaired.error)); process.exit(repaired.status ?? 1); }` : ''}
} else { throw new Error('Unexpected fixture npm command: ' + args.join(' ')); }
`);
  const enrolled = enrollProductInstallation({
    envelopePath: path.join(value.packageRoot, 'installation-origin.json'),
    productRoot: path.join(value.packageRoot, 'payload', 'product'), entryPath: entry,
    runtimeExecutable: process.execPath,
    updateAuthority: createProductUpdateAuthority({ nodeExecutable: process.execPath, npmCliPath, prefix: value.prefix }),
  });
  const registration = { status: 'installed', entry: enrolled.entry };
  const installedLauncher = launcherTarget ? installNpmLauncher({ registration, platform: 'darwin', target: launcherTarget, port: 0 }) : null;
  const children = new Set<any>();
  const webPids = new Set<number>();
  const pending = fixtureCleanups.get(t);
  assert.ok(pending, 'update fixtures require the suite-owned cleanup queue');
  pending.push(async () => {
    const failures: unknown[] = [];
    try {
      if (fs.existsSync(receiptFile)) {
        const current = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
        webPids.add(current.pid);
        const stopped = await fetch(`${current.url}/api/v1/app/quit-instance`, { method: 'POST', headers: { 'x-buildr-instance': current.secret }, signal: AbortSignal.timeout(2_000) });
        assert.equal(stopped.status, 202, 'fixture cleanup must authenticate the current Web shutdown');
        await waitFor(() => !fs.existsSync(receiptFile), { attempts: 400, intervalMs: 25, message: 'updated fixture Web receipt cleanup' });
      }
    } catch (error) {
      failures.push(error);
    } finally {
      for (const child of children) {
        try { await stopFixtureChild(child); } catch (error) { failures.push(error); }
      }
    }
    for (const pid of webPids) {
      try {
        await waitFor(() => {
          try { process.kill(pid, 0); return false; }
          catch (error: any) { if (error.code === 'ESRCH') return true; throw error; }
        }, { attempts: 400, intervalMs: 25, message: `fixture Web PID ${pid} exit` });
      } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, `Update fixture cleanup incomplete; preserved diagnostic files at ${appData} and ${value.root}.`);
    fs.rmSync(value.root, { recursive: true, force: true });
  });
  async function startOld() {
    const child = spawnInstalledWeb(entry, installedLauncher ? ['--no-open', '--launcher-binding', installedLauncher.bindingPath] : ['--no-open', '--port', '0']);
    children.add(child);
    const receipt = await waitFor(() => {
      if (!fs.existsSync(receiptFile)) return null;
      const observed = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
      return observed.pid === child.pid ? observed : null;
    }, { message: 'old installed Web receipt', diagnostic: () => child.output.join('') });
    assert.equal(receipt.productIdentity.version, oldVersion);
    webPids.add(receipt.pid);
    return { child, receipt };
  }
  async function update() {
    const child = spawn(process.execPath, [entry, 'update', '--track', 'stable', '--json'], {
      cwd: value.root,
      env: { ...process.env, PATH: '', BUILDR_LAUNCHER_NO_OPEN: '1', BUILDR_LAUNCHER_HANDOFF_WAIT_MS: '500' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.add(child);
    const stdout: string[] = [], stderr: string[] = [];
    child.stdout.on('data', (chunk) => stdout.push(String(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(String(chunk)));
    (child as any).output = stderr;
    await waitForChildExit(child, 'installed update command');
    assert.equal(child.exitCode, 0, `${stdout.join('')}\n${stderr.join('')}`);
    const result = JSON.parse(stdout.join(''));
    if (result.webUpdate?.pid) webPids.add(result.webUpdate.pid);
    return result;
  }
  return { ...value, entry, registration, installedLauncher, oldVersion, newVersion, receiptFile, npmLog, entryLog, startOld, update };
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

async function waitFor(check: any, { attempts = 160, intervalMs = 50, message = 'condition', diagnostic = () => null }: any = {}): Promise<any>  {
  for (let index: any = 0; index < attempts; index += 1) {
    const value: any = await check();
    if (value) return value;
    await new Promise((resolve: any) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${message}. ${JSON.stringify(diagnostic())}`);
}

const LAUNCHER_HANDOFF_ATTEMPTS: any = 2400;
const LAUNCHER_HANDOFF_TIMEOUT_MS: any = 60000;

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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      once(child, 'exit'),
      new Promise((_: any, reject: any) => { timer = setTimeout(() => reject(new Error(`${label} did not exit: ${child.output.join('')}`)), LAUNCHER_HANDOFF_TIMEOUT_MS); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

async function stopFixtureChild(child: any) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const force = setTimeout(() => child.kill('SIGKILL'), 2_000);
  try {
    child.kill('SIGTERM');
    await waitForChildExit(child, 'fixture child cleanup');
  } finally { clearTimeout(force); }
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
  assert.deepEqual(fs.readFileSync(path.join(suite.packageRoot, 'bin', 'buildr.mjs')), original, 'fixture writes must not change the shared package template');
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
  const writeShortcut: any = ({ target, binding, wrapper }: any) => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'test shortcut');
    shortcutValue = {
      target: 'C:\\Windows\\System32\\wscript.exe',
      arguments: `"${wrapper.host}"`,
      workingDirectory: binding.packageRoot,
    };
  };
  const readShortcut: any = () => shortcutValue;
  const installed: any = installNpmLauncher({ registration: value.registration, platform: 'win32', target: shortcut, writeShortcut, readShortcut });
  assert.equal(installed.status, 'ready');
  // 快捷方式必须隐藏启动：TargetPath 指向 wscript.exe 托管的 .vbs，而不是会分配控制台的 node.exe。
  assert.match(shortcutValue.target, /wscript\.exe$/i);
  assert.match(shortcutValue.arguments, /Buildr Web\.vbs"$/);

  const bindingPath: any = installed.bindingPath;
  const bindingDir: any = path.dirname(bindingPath);
  const runnerPath: any = path.join(bindingDir, 'Buildr Web Runner.cmd');
  const hostPath: any = path.join(bindingDir, 'Buildr Web.vbs');
  const runnerScript: any = fs.readFileSync(runnerPath, 'utf8');
  assert.match(runnerScript, /web --launcher-binding "%BINDING%"/);
  assert.match(runnerScript, /set "BINDING=/);
  // for 子命令经 cmd /c 执行：最外层必须再包一层引号，否则 cmd /c 剥掉首尾引号会破坏命令行。
  assert.match(runnerScript, /in \('""%NODE%"/, 'for-command must wrap an extra outer quote pair for cmd /c');
  // cmd.exe 批处理必须按 CRLF 写盘；LF 行尾在多行 if/for 块上会静默误解析。
  assert.ok(runnerScript.includes('\r\n') && !/(?<!\r)\n/u.test(runnerScript), 'Windows runner must be written with CRLF line endings');
  const hostBytes: any = fs.readFileSync(hostPath);
  assert.ok(hostBytes[0] === 0xff && hostBytes[1] === 0xfe, 'VBS host must be UTF-16LE so the Chinese failure notice renders correctly');
  assert.match(hostBytes.toString('utf16le'), /shell\.Run\(command, 0, True\)/);
  assert.match(hostBytes.toString('utf16le'), /launcher\.log/, 'VBS host must record runner invocation failures into the Launcher log');

  const iconPath: any = path.join(bindingDir, 'Buildr.ico');
  const frozen: any = new Map([shortcut, bindingPath, iconPath, runnerPath, hostPath].map((file: any) => [file, fs.readFileSync(file)]));
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

  // wrapper 内容漂移按 stale 处理，repair 原子重写 runner/host/shortcut 后恢复 ready。
  fs.writeFileSync(runnerPath, `${runnerScript}\nrem drift\n`);
  const drifted: any = npmLauncherStatus({ platform: 'win32', target: shortcut, readShortcut });
  assert.equal(drifted.status, 'stale');
  assert.equal(drifted.diagnostic.code, 'launcher.wrapper_drift');
  const repaired: any = repairNpmLauncher({ registration: value.registration, platform: 'win32', target: shortcut, writeShortcut, readShortcut });
  assert.equal(repaired.status, 'ready');

  shortcutValue = { ...shortcutValue, target: 'C:\\foreign\\node.exe' };
  assert.equal(npmLauncherStatus({ platform: 'win32', target: shortcut, readShortcut }).status, 'invalid');
  assert.throws(
    () => uninstallNpmLauncher({ registration: value.registration, platform: 'win32', target: shortcut, readShortcut }),
    /Refusing to remove foreign Launcher target/,
  );

  // owned uninstall 只移除 Launcher 自身文件：shortcut、binding、icon 与 wrapper，runner 日志目录保留。
  shortcutValue = { ...shortcutValue, target: 'C:\\Windows\\System32\\wscript.exe' };
  const uninstalled: any = uninstallNpmLauncher({ registration: value.registration, platform: 'win32', target: shortcut, readShortcut });
  assert.equal(uninstalled.action, 'uninstalled');
  for (const file of [shortcut, bindingPath, iconPath, runnerPath, hostPath]) assert.equal(fs.existsSync(file), false, `${file} must be removed with the owned Launcher`);
});

test('released npm Launcher falls back once from an occupied preferred port while direct CLI stays strict', async (t: any) => {
  const value: any = await fixture();
  const target: any = path.join(value.root, 'Applications', 'Buildr Web.app');
  const occupied: any = net.createServer();
  await new Promise((resolve: any, reject: any) => {
    occupied.once('error', reject);
    occupied.listen(0, '127.0.0.1', resolve);
  });
  onFixtureCleanup(t, () => new Promise((resolve: any) => occupied.close(resolve)));
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
  registerWebInstanceLifecycle(runtime, { readProductIdentity: () => productIdentity, assertNpmLauncherBinding: assertCurrentNpmLauncherBinding, createLocalWorkspaceServer, ensureRegisteredTarget: root => ensureRegisteredTarget(runtime, root) });
  const warnings: any[] = [];
  const originalWarn: any = console.warn;
  console.warn = (message: any) => warnings.push(String(message));
  onFixtureCleanup(t, () => { console.warn = originalWarn; });

  const started: any = await runtime.startBuildrWeb(['--no-open', '--launcher-binding', installed.bindingPath]);
  onFixtureCleanup(t, async () => { if (started.server.listening) await new Promise<void>(resolve => started.server.close(() => resolve())); });
  const actualPort: any = Number(new URL(started.url).port);
  assert.notEqual(actualPort, preferred);
  assert.match(warnings.join('\n'), new RegExp(`首选端口 ${preferred} 已被占用`));
  const receipt: any = JSON.parse(fs.readFileSync(path.join(process.env.BUILDR_APP_DATA_DIR!, 'instance.json'), 'utf8'));
  assert.equal(receipt.url, started.url);
  assert.equal(receipt.launcherIdentity.bindingIdentity, installed.binding.bindingIdentity);
  const closed: any = new Promise((resolve: any) => started.server.once('close', resolve));
  const stopped: any = await fetch(`${receipt.url}/api/v1/app/quit-instance`, {
    method: 'POST',
    headers: { 'x-buildr-instance': receipt.secret },
  });
  assert.equal(stopped.status, 202);
  await closed;
  assert.equal(fs.existsSync(path.join(process.env.BUILDR_APP_DATA_DIR!, 'instance.json')), false);

  await assert.rejects(
    () => runtime.startBuildrWeb(['--no-open', '--port', String(preferred)]),
    /EADDRINUSE|address already in use/i,
  );
});

test('concurrent npm Launchers retry ownership after an old CLI releases its startup lock', async (t: any) => {
  const value: any = await fixture();
  const installed: any = installNpmLauncher({ registration: value.registration, platform: 'darwin', target: path.join(value.root, 'Applications', 'Buildr Web.app'), port: 0 });
  const productIdentity = productIdentityFor(installed.binding);
  const runtime: any = createRuntime();
  registerWebInstanceLifecycle(runtime, { readProductIdentity: () => productIdentity, assertNpmLauncherBinding: assertCurrentNpmLauncherBinding, createLocalWorkspaceServer, ensureRegisteredTarget: root => ensureRegisteredTarget(runtime, root) });
  const originalWait = process.env.BUILDR_LAUNCHER_HANDOFF_WAIT_MS;
  process.env.BUILDR_LAUNCHER_HANDOFF_WAIT_MS = '500';
  onFixtureCleanup(t, () => {
    if (originalWait === undefined) delete process.env.BUILDR_LAUNCHER_HANDOFF_WAIT_MS;
    else process.env.BUILDR_LAUNCHER_HANDOFF_WAIT_MS = originalWait;
  });
  const cli: any = await runtime.startBuildrWeb(['--no-open', '--port', '0']);
  const lock: any = acquireBuildrWebStartLock(resolveWebProfile(productIdentity));
  onFixtureCleanup(t, async () => { releaseBuildrWebStartLock(lock); if (cli.server.listening) await new Promise<void>(resolve => cli.server.close(() => resolve())); });
  const starts = [runtime.startBuildrWeb(['--no-open', '--launcher-binding', installed.bindingPath]), runtime.startBuildrWeb(['--no-open', '--launcher-binding', installed.bindingPath])];
  const releaseTimer = setTimeout(() => releaseBuildrWebStartLock(lock), 100);
  onFixtureCleanup(t, () => clearTimeout(releaseTimer));
  const results: any[] = await Promise.all(starts);
  const managed: any = results.find(result => !result.reused);
  onFixtureCleanup(t, async () => { if (managed?.server.listening) await new Promise<void>(resolve => managed.server.close(() => resolve())); });
  assert.equal(results.filter(result => !result.reused).length, 1);
  assert.equal(results.filter(result => result.reused).length, 1);
  assert.equal(results[0].url, results[1].url);
  const receipt = JSON.parse(fs.readFileSync(path.join(process.env.BUILDR_APP_DATA_DIR!, 'instance.json'), 'utf8'));
  assert.equal(receipt.launcherIdentity.bindingIdentity, installed.binding.bindingIdentity);
  assert.equal(cli.server.listening, false);
});

test('npm Launcher takes over CLI ownership, serializes concurrent opens, reuses exact binding and replaces an old same-slot binding', async (t: any) => {
  const value: any = await fixture({ runnable: true });
  const target: any = path.join(value.root, 'Applications', 'Buildr Web.app');
  const installed: any = installNpmLauncher({ registration: value.registration, platform: 'darwin', target, port: 0 });
  const entry: any = value.registration.entry.entryPath;
  const receiptFile: any = path.join(process.env.BUILDR_APP_DATA_DIR!, 'instance.json');
  const children: any = new Set();
  const launch: any = (args: any) => {
    const child: any = spawnInstalledWeb(entry, args);
    children.add(child);
    child.once('exit', () => children.delete(child));
    return child;
  };
  onFixtureCleanup(t, async () => {
    await Promise.all([...children].map(stopFixtureChild));
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
  }, { attempts: LAUNCHER_HANDOFF_ATTEMPTS, message: 'Launcher-managed replacement receipt', diagnostic: () => {
    const receipt = fs.existsSync(receiptFile) ? JSON.parse(fs.readFileSync(receiptFile, 'utf8')) : null;
    return { receipt: receipt ? { pid: receipt.pid, bindingIdentity: receipt.launcherIdentity?.bindingIdentity } : null,
      expectedBinding: installed.binding.bindingIdentity,
      processes: [cli, first, second].map(child => ({ pid: child.pid, exitCode: child.exitCode, signal: child.signalCode, output: child.output.join('').slice(-4000) })) };
  } });
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

for (const launcher of [true, false]) {
  test(`installed npm update automatically hands off an old ${launcher ? 'Launcher' : 'CLI'} Web to the new version`, async (t: any) => {
    const value = await updateFixture(t, { launcher });
    const { child, receipt: previous } = await value.startOld();
    const updated = await value.update();
    assert.equal(updated.status, 'updated');
    assert.equal(updated.webUpdate.status, 'restarted');
    assert.equal(updated.webUpdate.version, value.newVersion);
    assert.equal(updated.webUpdate.previousPid, previous.pid);
    await waitForChildExit(child, 'old Web after npm update');
    const current = JSON.parse(fs.readFileSync(value.receiptFile, 'utf8'));
    assert.notEqual(current.pid, previous.pid);
    assert.equal(current.pid, updated.webUpdate.pid);
    assert.equal(current.url, updated.webUpdate.url);
    assert.equal(new URL(current.url).port, new URL(previous.url).port, 'update handoff should preserve the original browser address');
    const health = await fetch(`${current.url}/api/v1/health`, { headers: { 'x-buildr-instance': current.secret } }).then((response) => response.json());
    assert.equal(health.productIdentity.version, value.newVersion);
    assert.equal(health.productIdentity.channel, 'npm');
    assert.equal(health.productIdentity.runtime.executable, fs.realpathSync(process.execPath));
    const invocations = fs.readFileSync(value.entryLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const handoff = invocations.find((entry: any) => entry.args[0] === 'web' && entry.args.includes('--update-handoff'));
    assert.ok(handoff, 'the update command must invoke the newly installed entry for handoff');
    assert.equal(handoff.version, value.newVersion);
    assert.equal(fs.realpathSync(handoff.node), fs.realpathSync(process.execPath));
    assert.equal(fs.realpathSync(handoff.entry), fs.realpathSync(value.entry));
    assert.match(handoff.args[handoff.args.indexOf('--update-handoff') + 1], /^sha256-[a-f0-9]{64}$/u);
    assert.ok(handoff.args.includes('--no-open'), 'automatic update must not reopen the browser');
    if (value.installedLauncher) {
      const binding = JSON.parse(fs.readFileSync(value.installedLauncher.bindingPath, 'utf8'));
      assert.equal(binding.version, value.newVersion, 'the existing temporary Launcher binding follows the new installation');
    } else {
      assert.equal(fs.existsSync(path.join(value.root, 'Applications')), false, 'CLI handoff must not install a Launcher');
    }
    const repeated = await value.update();
    assert.equal(repeated.status, 'up-to-date');
    assert.equal(repeated.webUpdate.status, 'current');
    assert.equal(JSON.parse(fs.readFileSync(value.receiptFile, 'utf8')).pid, current.pid, 'an already current Web must not restart');
    const npmCommands = fs.readFileSync(value.npmLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(npmCommands.filter((args: string[]) => args[0] === 'install').length, 1, 'rechecking an updated installation must not reinstall');
  });
}

test('installed npm update protects another prefix running the identical published origin', async (t: any) => {
  const first = await updateFixture(t);
  const second = await updateFixture(t);
  assert.notEqual(first.prefix, second.prefix);
  assert.equal(first.registration.entry.origin.installUnit, `@buildr-ai/buildr@${first.oldVersion}`);
  assert.equal(second.registration.entry.origin.installUnit, first.registration.entry.origin.installUnit);
  assert.equal(second.registration.entry.origin.ownershipIdentity, first.registration.entry.origin.ownershipIdentity, 'identical published package bytes must retain the same origin identity across prefixes');
  assert.ok(first.registration.entry.runtime.identity);
  assert.equal(second.registration.entry.runtime.identity, first.registration.entry.runtime.identity);
  const { child, receipt: running } = await first.startOld();
  assert.equal(running.launcherIdentity, null, 'the old CLI receipt intentionally has no Launcher slot identity');
  const before = fs.readFileSync(first.receiptFile, 'utf8');
  const updated = await second.update();
  assert.equal(updated.status, 'updated', 'the selected second installation still completes its package update');
  assert.equal(updated.webUpdate.status, 'failed', 'shared origin identity alone cannot identify the running installation slot');
  assert.equal(updated.webUpdate.code, 'web_update_instance_ownership_ambiguous');
  assert.ok(updated.webUpdate.message);
  assert.equal(child.exitCode, null, 'updating another prefix must not stop the first installation');
  assert.equal(child.signalCode, null);
  assert.equal(fs.readFileSync(first.receiptFile, 'utf8'), before, 'the other prefix instance receipt must remain unchanged');
  assert.equal(JSON.parse(fs.readFileSync(path.join(first.packageRoot, 'package.json'), 'utf8')).version, first.oldVersion);
  assert.equal(JSON.parse(fs.readFileSync(path.join(second.packageRoot, 'package.json'), 'utf8')).version, second.newVersion);
  const health = await fetch(`${running.url}/api/v1/health`, { headers: { 'x-buildr-instance': running.secret } }).then((response) => response.json());
  assert.equal(health.pid, running.pid);
  assert.equal(health.productIdentity.version, first.oldVersion);
  assert.equal(health.productIdentity.installationIdentity, first.registration.entry.origin.ownershipIdentity);
});

test('installed npm update retains an unopened Web when no instance is running', async (t: any) => {
  const value = await updateFixture(t);
  assert.equal(fs.existsSync(value.receiptFile), false);
  const updated = await value.update();
  assert.equal(updated.status, 'updated');
  assert.equal(updated.webUpdate.status, 'not-running');
  assert.equal(fs.existsSync(value.receiptFile), false, 'updating an unused installation must not start Web');
  assert.equal(JSON.parse(fs.readFileSync(path.join(value.packageRoot, 'package.json'), 'utf8')).version, value.newVersion);
  const invocations = fs.readFileSync(value.entryLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(invocations.some((entry: any) => entry.args.includes('--update-handoff')), false);
  assert.equal(fs.existsSync(path.join(value.root, 'Applications')), false);
});

test('installed npm update preserves package success and the old receipt when authenticated quit is refused', async (t: any) => {
  const value = await updateFixture(t);
  const origin = value.registration.entry.origin;
  const productIdentity = {
    package: origin.package, version: origin.version, channel: 'npm',
    protocolIdentity: origin.protocolIdentity, applicationPayloadDigest: origin.applicationPayloadDigest,
    sourceCommit: origin.sourceCommit, installationIdentity: origin.ownershipIdentity,
    runtime: { role: 'host', executable: fs.realpathSync(process.execPath), version: process.versions.node },
  };
  const profile = resolveWebProfile(productIdentity);
  const secret = crypto.randomBytes(32).toString('hex');
  let quitRequests = 0;
  const fake = http.createServer((request, response) => {
    if (request.headers['x-buildr-instance'] !== secret) { response.writeHead(403).end(); return; }
    if (request.url === '/api/v1/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ schemaVersion: 'buildr.local-app-health/v1', status: 'ready', pid: process.pid, launcherIdentity: null, productIdentity, webProfile: profile }));
    } else if (request.url === '/api/v1/app/quit-instance') {
      quitRequests += 1;
      response.writeHead(403, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'fixture_quit_refused', message: 'Fixture refused authenticated quit.' } }));
    } else response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => { fake.once('error', reject); fake.listen(0, '127.0.0.1', resolve); });
  const address = fake.address() as net.AddressInfo;
  const previous = { url: `http://127.0.0.1:${address.port}`, secret, pid: process.pid, launcherIdentity: null, productIdentity, webProfile: profile };
  writeBuildrWebInstance(createRuntime(), previous);
  const before = fs.readFileSync(value.receiptFile, 'utf8');
  try {
    const updated = await value.update();
    assert.equal(updated.status, 'updated', 'Web handoff failure must not erase successful package installation');
    assert.equal(updated.webUpdate.status, 'failed');
    assert.equal(updated.webUpdate.code, 'launcher_handoff_shutdown_rejected');
    assert.match(updated.webUpdate.message, /HTTP 403/u);
    assert.equal(quitRequests, 1, 'the authenticated handoff must try the existing graceful shutdown path');
    assert.equal(fs.readFileSync(value.receiptFile, 'utf8'), before, 'refused shutdown must preserve the original instance receipt');
    assert.equal(JSON.parse(fs.readFileSync(path.join(value.packageRoot, 'package.json'), 'utf8')).version, value.newVersion);
    const health = await fetch(`${previous.url}/api/v1/health`, { headers: { 'x-buildr-instance': secret } }).then((response) => response.json());
    assert.equal(health.productIdentity.version, value.oldVersion, 'a failed handoff must leave the old instance identifiable');
  } finally {
    clearBuildrWebInstance(previous, profile);
    await new Promise<void>((resolve) => fake.close(() => resolve()));
  }
});

test('npm Launcher preserves foreign ownership and a non-stopping handoff receipt', async (t: any) => {
  const value: any = await fixture();
  const target: any = path.join(value.root, 'Applications', 'Buildr Web.app');
  const installed: any = installNpmLauncher({ registration: value.registration, platform: 'darwin', target, port: 0 });
  const productIdentity: any = productIdentityFor(installed.binding);
  const foreignIdentity: any = { ...productIdentity, installationIdentity: `sha256-${'f'.repeat(64)}` };
  const foreignRuntime: any = createRuntime();
  registerWebInstanceLifecycle(foreignRuntime, { readProductIdentity: () => foreignIdentity, assertNpmLauncherBinding: assertCurrentNpmLauncherBinding, createLocalWorkspaceServer, ensureRegisteredTarget: root => ensureRegisteredTarget(foreignRuntime, root) });
  const foreign: any = await foreignRuntime.startBuildrWeb(['--no-open', '--port', '0']);
  onFixtureCleanup(t, async () => { if (foreign.server.listening) await new Promise<void>(resolve => foreign.server.close(() => resolve())); });
  const receiptFile: any = path.join(process.env.BUILDR_APP_DATA_DIR!, 'instance.json');
  const foreignReceipt: any = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  const currentRuntime: any = createRuntime();
  registerWebInstanceLifecycle(currentRuntime, { readProductIdentity: () => productIdentity, assertNpmLauncherBinding: assertCurrentNpmLauncherBinding, createLocalWorkspaceServer, ensureRegisteredTarget: root => ensureRegisteredTarget(currentRuntime, root) });
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
  onFixtureCleanup(t, async () => { if (fake.listening) await new Promise<void>(resolve => fake.close(() => resolve())); });
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
  const value: any = await fixture({ runnable: true });
  const receiptFile: any = path.join(process.env.BUILDR_APP_DATA_DIR!, 'instance.json');
  const child: any = spawnInstalledWeb(value.registration.entry.entryPath, ['--no-open', '--port', '0']);
  onFixtureCleanup(t, () => stopFixtureChild(child));
  await waitFor(() => fs.existsSync(receiptFile) ? JSON.parse(fs.readFileSync(receiptFile, 'utf8')).pid === child.pid : false, { message: 'SIGHUP test receipt' });
  child.kill('SIGHUP');
  await waitForChildExit(child, 'SIGHUP Web process');
  assert.equal(fs.existsSync(receiptFile), false);
});

test('Windows Launcher PowerShell bridge preserves shortcut and root paths containing spaces', () => {
  const npmLauncherSource: any = fs.readFileSync(new URL('../../src/modules/installation/infrastructure/npm-launcher.ts', import.meta.url), 'utf8');
  const developmentLauncherSource: any = fs.readFileSync(new URL('../../tools/build/launcher/manage.ts', import.meta.url), 'utf8');
  for (const source of [npmLauncherSource, developmentLauncherSource]) {
    assert.doesNotMatch(source, /\$args\[[01]\]/);
    assert.match(source, /\$env:BUILDR_LAUNCHER_SHORTCUT/);
  }
  assert.match(developmentLauncherSource, /\$env:BUILDR_LAUNCHER_ROOT/);
});

test('macOS Launcher 默认装入 /Applications 并可迁移 ~/Applications 的遗留入口', async () => {
  const value: any = await fixture();
  const systemApplications: any = path.join(value.root, 'system-Applications');
  const homedir: any = path.join(value.root, 'home');
  fs.mkdirSync(systemApplications, { recursive: true });
  fs.mkdirSync(path.join(homedir, 'Applications'), { recursive: true });
  const legacyTarget: any = path.join(homedir, 'Applications', 'Buildr Web.app');

  // 旧版本曾装在 ~/Applications；显式 --target 路径行为不变。
  const legacy: any = installNpmLauncher({ registration: value.registration, platform: 'darwin', target: legacyTarget });
  assert.equal(legacy.status, 'ready');

  // status 未给 --target 时按真实旧目标呈现。
  const resolved: any = npmLauncherStatus({ platform: 'darwin', homedir, systemApplications });
  assert.equal(resolved.target, legacyTarget);
  assert.equal(resolved.status, 'ready');

  // install 默认写入 /Applications，并移除同一安装槽位的旧位置入口。
  const installed: any = installNpmLauncher({ registration: value.registration, platform: 'darwin', homedir, systemApplications });
  const expectedTarget: any = path.join(systemApplications, 'Buildr Web.app');
  assert.equal(installed.target, expectedTarget);
  assert.equal(installed.status, 'ready');
  assert.equal(fs.existsSync(expectedTarget), true);
  assert.equal(installed.legacyTarget?.path, legacyTarget);
  assert.equal(installed.legacyTarget?.removed, true);
  assert.equal(fs.existsSync(legacyTarget), false, '同槽位遗留 ~/Applications 入口应被移除');

  // 迁移后 status 以新目标为准。
  const after: any = npmLauncherStatus({ platform: 'darwin', homedir, systemApplications });
  assert.equal(after.target, expectedTarget);
  assert.equal(after.status, 'ready');
});

test('macOS Launcher 默认目标不可写时 fail closed 并指引 --target', async (t: any) => {
  if (process.platform !== 'darwin') return;
  const value: any = await fixture();
  const systemApplications: any = path.join(value.root, 'system-Applications');
  const homedir: any = path.join(value.root, 'home');
  fs.mkdirSync(systemApplications, { recursive: true });
  fs.chmodSync(systemApplications, 0o555);
  onFixtureCleanup(t, () => fs.chmodSync(systemApplications, 0o755));
  const legacyTarget: any = path.join(homedir, 'Applications', 'Buildr Web.app');
  try {
    installNpmLauncher({ registration: value.registration, platform: 'darwin', homedir, systemApplications });
    assert.fail('default-target install on a read-only /Applications must fail');
  } catch (error: any) {
    assert.match(error.message, /--target/);
    assert.equal(fs.existsSync(legacyTarget), false, '权限不足时不得静默写入 ~/Applications');
  }
});


test('页面更新启动入口：核对真实安装、不创建缺失入口、只修复本安装拥有的入口', async () => {
  const value: any = await fixture({ runnable: true });
  const target = path.join(value.root, 'Applications', 'Buildr Web.app');
  const entry = value.registration.entry;
  enrollProductInstallation({ envelopePath: entry.envelopePath, productRoot: entry.productRoot, entryPath: entry.entryPath, runtimeExecutable: entry.runtime.executable, updateAuthority: entry.updateAuthority });
  const updater = createUpdateLauncher({ platform: 'darwin', target });
  const job: any = { productRoot: value.registration.entry.productRoot, version: value.registration.entry.origin.version, previousInstallationIdentity: value.registration.entry.origin.ownershipIdentity };
  assert.equal(updater.inspect(job).status, 'absent');
  assert.equal(updater.repair(job).status, 'absent');
  assert.equal(fs.existsSync(target), false);
  installNpmLauncher({ registration: value.registration, platform: 'darwin', target });
  assert.equal(updater.inspect(job).status, 'ready');
  fs.rmSync(path.join(target, 'Contents', 'MacOS', 'Buildr Web'));
  assert.equal(updater.inspect(job).status, 'failed');
  assert.equal(updater.repair(job).status, 'ready');
  const before = fs.readFileSync(path.join(target, 'Contents', 'Info.plist'), 'utf8');
  assert.throws(() => updater.repair({ ...job, version: '999.0.0' }), (e: any) => e.code === 'web_update_installation_changed');
  assert.equal(fs.readFileSync(path.join(target, 'Contents', 'Info.plist'), 'utf8'), before);
});
