#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildLauncher } from './build.mjs';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { resolveWebProfile } from '../../src/infrastructure/product-identity/web-profile.mjs';

const PRODUCT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function packageVersion() { return JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, 'package.json'), 'utf8')).version; }
function gitText(args) { try { return execFileSync('git', args, { cwd: PRODUCT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } }
function checkoutIdentity() {
  const head = gitText(['rev-parse', 'HEAD']) || 'not-a-checkout';
  const dirty = gitText(['status', '--porcelain=v1', '--untracked-files=all']);
  return { head, dirty: Boolean(dirty), fingerprint: crypto.createHash('sha256').update(`${head}\0${dirty}`).digest('hex').slice(0, 16) };
}
function findWorkspaceRoot(start = process.cwd()) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, '.buildr', 'workspace.yml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
function nodeVersion(executable) {
  try { return execFileSync(executable, ['-p', 'process.versions.node'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}
function developmentRuntime(runtime) {
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) throw new Error('Development launcher requires a Buildr Workspace. Run it from the Workspace checkout and retry.');
  const provided = path.resolve(runtime);
  const version = nodeVersion(provided);
  if (!version || !/^24\.(?:1[5-9]|[2-9]\d)\./.test(version)) throw new Error(`Development host Node is missing or incompatible: ${provided}. Use Node >=24.15.0 <25 and reinstall the launcher.`);
  return {
    workspaceRoot,
    version,
    executable: provided,
    source: 'development-host',
    identity: `development-host:${fs.realpathSync(provided)}:${version}`,
  };
}
function assertDevelopmentChannel(channel) {
  if (channel !== 'development') throw new Error('Formal npm Buildr Web Launcher is managed only by `buildr web launcher`; package/launchers manages development only.');
}
function appName(channel) { return channel === 'development' ? 'Buildr Web Dev' : 'Buildr Web'; }
function legacyAppName(channel) { return channel === 'development' ? 'Buildr Dev' : 'Buildr'; }
function defaultInstallRoot(platform) {
  if (process.env.BUILDR_LAUNCHER_INSTALL_DIR) return path.resolve(process.env.BUILDR_LAUNCHER_INSTALL_DIR);
  if (platform === 'darwin') return '/Applications';
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs');
}
function namedTargetPath(platform, name, installRoot = defaultInstallRoot(platform)) {
  return platform === 'darwin'
    ? path.posix.join(installRoot.replaceAll('\\', '/'), `${name}.app`)
    : path.win32.join(installRoot, name);
}
function targetPath(platform, channel, installRoot = defaultInstallRoot(platform)) { return namedTargetPath(platform, appName(channel), installRoot); }
function legacyTargetPath(platform, channel, installRoot = defaultInstallRoot(platform)) { return namedTargetPath(platform, legacyAppName(channel), installRoot); }
function appDataRoot() {
  return resolveWebProfile({ channel: 'development', runtime: { role: 'development' } }).dataRoot;
}
function runningInstance() { try { return JSON.parse(fs.readFileSync(path.join(appDataRoot(), 'instance.json'), 'utf8')); } catch { return null; } }
function identityPath(target, platform) { return platform === 'darwin' ? path.join(target, 'Contents', 'Resources', 'launcher-identity.json') : path.join(target, 'launcher-identity.json'); }
function readIdentity(target, platform) { try { return JSON.parse(fs.readFileSync(identityPath(target, platform), 'utf8')); } catch { return null; } }
function ownedLauncher(target, platform, channel) {
  const present = fs.existsSync(target);
  const identity = present ? readIdentity(target, platform) : null;
  const owned = Boolean(identity
    && identity.schemaVersion === 'buildr.launcher-identity/v1'
    && identity.channel === channel
    && (!identity.platform || identity.platform === platform));
  return {
    target,
    present,
    owned,
    identity,
    diagnostic: !present
      ? null
      : owned
        ? null
        : { code: 'launcher.ownership_unproven', message: `Launcher ownership 无法证明，已保留：${target}` },
  };
}
function buildIdentity(platform, channel) {
  assertDevelopmentChannel(channel);
  const checkout = checkoutIdentity();
  const identity = { schemaVersion: 'buildr.launcher-identity/v1', version: packageVersion(), channel, runtimeRole: 'development', source: 'checkout', buildId: `${checkout.head.slice(0, 12)}-${checkout.fingerprint}`, buildNumber: String(Date.now()), protocolVersion: 1, protocolIdentity: 'buildr.web-protocol/v1', platform, builtAt: new Date().toISOString(), checkout };
  const runtime = developmentRuntime(process.execPath);
  return { ...identity, sourceRoot: PRODUCT_ROOT, workspaceRoot: runtime.workspaceRoot, developmentRuntime: { executable: runtime.executable, version: runtime.version, source: runtime.source, identity: runtime.identity } };
}
function validateBundle(bundle, platform, expected) {
  const actual = readIdentity(bundle, platform);
  if (!actual || actual.buildId !== expected.buildId || actual.channel !== expected.channel) throw new Error('Staged launcher identity validation failed.');
  if (!sameFilesystemPath(actual.sourceRoot, expected.sourceRoot) || !sameFilesystemPath(actual.developmentRuntime?.executable, expected.developmentRuntime?.executable) || actual.developmentRuntime?.version !== expected.developmentRuntime?.version || actual.developmentRuntime?.identity !== expected.developmentRuntime?.identity) throw new Error('Staged Development launcher checkout/development runtime identity validation failed.');
  if (!fs.existsSync(actual.sourceRoot) || !fs.existsSync(path.join(actual.sourceRoot, 'bin', 'buildr.mjs')) || !fs.existsSync(path.join(actual.sourceRoot, 'package.json')) || !fs.existsSync(path.join(actual.sourceRoot, 'src')) || !fs.existsSync(path.join(actual.sourceRoot, 'package'))) throw new Error('Staged Development launcher checkout is missing.');
  if (!fs.existsSync(actual.developmentRuntime.executable)) throw new Error('Staged Development launcher host runtime is missing.');
  return actual;
}
function launcherDiagnostics(identity) {
  if (!identity || identity.channel !== 'development') return [];
  const findings = [];
  if (!identity.sourceRoot || !path.isAbsolute(identity.sourceRoot) || !fs.existsSync(identity.sourceRoot)) findings.push({ code: 'development.source_missing', message: `Buildr checkout 不存在：${identity.sourceRoot || 'unknown'}`, suggestion: '在保留的Buildr checkout中重新运行 npm run install:development。' });
  else if (!fs.existsSync(path.join(identity.sourceRoot, 'bin', 'buildr.mjs'))) findings.push({ code: 'development.cli_missing', message: `Buildr CLI 不存在：${path.join(identity.sourceRoot, 'bin', 'buildr.mjs')}`, suggestion: '确认当前 checkout 完整后重新安装 launcher。' });
  else if (!fs.existsSync(path.join(identity.sourceRoot, 'package.json')) || !fs.existsSync(path.join(identity.sourceRoot, 'src')) || !fs.existsSync(path.join(identity.sourceRoot, 'package'))) findings.push({ code: 'development.checkout_invalid', message: `Buildr Service checkout 不完整：${identity.sourceRoot}`, suggestion: '确认当前 checkout 完整后重新安装 launcher。' });
  const executable = identity.developmentRuntime?.executable;
  if (!executable || !fs.existsSync(executable)) findings.push({ code: 'development.node_missing', message: `Development host Node 不存在：${executable || 'unknown'}`, suggestion: '使用兼容 development host Node 重新安装 launcher。' });
  else if (nodeVersion(executable) !== identity.developmentRuntime.version) findings.push({ code: 'development.node_version_mismatch', message: `Development host Node 版本不匹配：${executable}`, suggestion: '使用 identity 绑定的 development host Node 重新安装 launcher。' });
  return findings;
}
async function stopOwnedInstance({ waitMs = 3000, channel, failOnUnknown = false } = {}) {
  const state = runningInstance();
  if (!state) return { stopped: false, reason: 'not-running' };
  if (!state.launcherIdentity) {
    if (failOnUnknown) throw new Error('A running Buildr instance has no launcher identity; exit it before replacing this launcher.');
    return { stopped: false, reason: 'unknown-owner' };
  }
  if (state.launcherIdentity.channel !== channel) return { stopped: false, reason: 'different-owner' };
  try {
    const response = await fetch(`${state.url}/api/v1/health`, { headers: { 'x-buildr-instance': state.secret }, signal: AbortSignal.timeout(1000) });
    if (!response.ok) return { stopped: false, reason: 'stale' };
    process.kill(state.pid, 'SIGTERM');
  } catch { return { stopped: false, reason: 'stale' }; }
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try { process.kill(state.pid, 0); } catch { return { stopped: true }; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Buildr instance ${state.pid} did not stop before launcher switch.`);
}

function windowsShortcutPath(name) {
  if (!process.env.APPDATA) return null;
  return path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${name}.lnk`);
}

function inspectWindowsShortcut(name, expectedRoot) {
  const shortcut = windowsShortcutPath(name);
  if (!shortcut || !fs.existsSync(shortcut)) return { target: shortcut, present: false, owned: false, diagnostic: null };
  if (process.platform !== 'win32') {
    return { target: shortcut, present: true, owned: false, diagnostic: { code: 'launcher.shortcut_ownership_unavailable', message: `当前主机无法证明 Windows shortcut ownership，已保留：${shortcut}` } };
  }
  const script = [
    '$shortcut = $env:BUILDR_LAUNCHER_SHORTCUT',
    '$root = $env:BUILDR_LAUNCHER_ROOT',
    '$shell = New-Object -ComObject WScript.Shell',
    '$item = $shell.CreateShortcut($shortcut)',
    '$expected = [IO.Path]::GetFullPath((Join-Path $root "Buildr.vbs"))',
    '$actual = $item.Arguments.Trim().Trim([char]34)',
    '$owned = ([IO.Path]::GetFileName($item.TargetPath) -ieq "wscript.exe") -and ([IO.Path]::GetFullPath($actual) -ieq $expected) -and ([IO.Path]::GetFullPath($item.WorkingDirectory) -ieq [IO.Path]::GetFullPath($root))',
    'if ($owned) { "owned" } else { "foreign" }',
  ].join('; ');
  try {
    const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, BUILDR_LAUNCHER_SHORTCUT: shortcut, BUILDR_LAUNCHER_ROOT: expectedRoot },
    }).trim();
    const owned = result === 'owned';
    return { target: shortcut, present: true, owned, diagnostic: owned ? null : { code: 'launcher.shortcut_ownership_unproven', message: `Windows shortcut ownership 无法证明，已保留：${shortcut}` } };
  } catch (error) {
    return { target: shortcut, present: true, owned: false, diagnostic: { code: 'launcher.shortcut_inspect_failed', message: `Windows shortcut ownership 检查失败，已保留：${shortcut}`, detail: error.message } };
  }
}

function removeOwnedPath(observation, removed, preserved) {
  if (!observation.present) return;
  if (!observation.owned) {
    preserved.push(observation.diagnostic);
    return;
  }
  fs.rmSync(observation.target, { recursive: true, force: true });
  removed.push(observation.target);
}

function removeOwnedShortcut(observation, removed, preserved) {
  if (!observation.present) return;
  if (!observation.owned) {
    preserved.push(observation.diagnostic);
    return;
  }
  fs.rmSync(observation.target, { force: true });
  removed.push(observation.target);
}
export function launcherStatus({ platform = process.platform, channel = 'development', installRoot } = {}) {
  assertDevelopmentChannel(channel);
  const target = targetPath(platform, channel, installRoot);
  const legacyTarget = legacyTargetPath(platform, channel, installRoot);
  const instance = runningInstance();
  const current = ownedLauncher(target, platform, channel);
  const legacy = ownedLauncher(legacyTarget, platform, channel);
  const diagnostics = [current.diagnostic, legacy.diagnostic, ...launcherDiagnostics(current.identity)].filter(Boolean);
  return {
    schemaVersion: 'buildr.launcher-status/v1',
    platform,
    channel,
    dataRoot: appDataRoot(),
    target,
    present: current.present,
    installed: current.owned,
    identity: current.identity,
    legacy: { target: legacy.target, present: legacy.present, owned: legacy.owned, identity: legacy.identity, diagnostic: legacy.diagnostic },
    diagnostics,
    runningInstance: instance ? { url: instance.url, pid: instance.pid, launcherIdentity: instance.launcherIdentity ?? null } : null,
  };
}
export async function installLauncher({ platform = process.platform, channel = 'development', installRoot, runtime = process.execPath, stopInstance = true } = {}) {
  assertDevelopmentChannel(channel);
  if (!['darwin', 'win32'].includes(platform)) throw new Error(`Unsupported launcher platform: ${platform}`);
  const target = targetPath(platform, channel, installRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const identity = buildIdentity(platform, channel);
  const backup = `${target}.previous`;
  const currentBefore = ownedLauncher(target, platform, channel);
  const backupBefore = ownedLauncher(backup, platform, channel);
  const legacyBefore = ownedLauncher(legacyTargetPath(platform, channel, installRoot), platform, channel);
  const legacyPreviousBefore = ownedLauncher(`${legacyBefore.target}.previous`, platform, channel);
  if (currentBefore.present && !currentBefore.owned) throw new Error(`Refusing to replace launcher without matching Buildr ownership: ${target}`);
  if (backupBefore.present && !backupBefore.owned) throw new Error(`Refusing to replace launcher backup without matching Buildr ownership: ${backup}`);
  const currentShortcutBefore = platform === 'win32' ? inspectWindowsShortcut(appName(channel), target) : null;
  const legacyShortcutBefore = platform === 'win32' && legacyBefore.owned
    ? inspectWindowsShortcut(legacyAppName(channel), legacyBefore.target)
    : platform === 'win32'
      ? { target: windowsShortcutPath(legacyAppName(channel)), present: Boolean(windowsShortcutPath(legacyAppName(channel)) && fs.existsSync(windowsShortcutPath(legacyAppName(channel)))), owned: false, diagnostic: { code: 'launcher.shortcut_ownership_unproven', message: `旧 Windows shortcut 缺少 matching Buildr Launcher ownership，已保留：${windowsShortcutPath(legacyAppName(channel)) || 'unknown'}` } }
      : null;
  const staging = fs.mkdtempSync(path.join(path.dirname(target), `.buildr-${channel}-staging-`));
  let stagedBundle;
  try {
    stagedBundle = buildLauncher({ platform, output: staging, runtime, identity });
    validateBundle(stagedBundle, platform, identity);
    if (stopInstance) await stopOwnedInstance({ channel, failOnUnknown: currentBefore.owned || legacyBefore.owned });
    fs.rmSync(backup, { recursive: true, force: true });
    if (currentBefore.present) fs.renameSync(target, backup);
    try {
      fs.renameSync(stagedBundle, target);
      validateBundle(target, platform, identity);
      if (platform === 'win32' && process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(target, 'Install-Buildr-Shortcuts.ps1')]);
    } catch (error) {
      if (platform === 'win32' && !currentShortcutBefore?.present) {
        const createdShortcut = inspectWindowsShortcut(appName(channel), target);
        if (createdShortcut.owned) fs.rmSync(createdShortcut.target, { force: true });
      }
      fs.rmSync(target, { recursive: true, force: true });
      if (fs.existsSync(backup)) fs.renameSync(backup, target);
      throw error;
    }
    const removed = [];
    const preserved = [];
    removeOwnedPath(legacyBefore, removed, preserved);
    removeOwnedPath(legacyPreviousBefore, removed, preserved);
    if (legacyShortcutBefore) removeOwnedShortcut(legacyShortcutBefore, removed, preserved);
    return {
      ...launcherStatus({ platform, channel, installRoot }),
      previous: fs.existsSync(backup) ? backup : null,
      migration: { removed, preserved: preserved.filter(Boolean) },
    };
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}
export async function uninstallLauncher({ platform = process.platform, channel = 'development', installRoot } = {}) {
  assertDevelopmentChannel(channel);
  const target = targetPath(platform, channel, installRoot);
  const legacyTarget = legacyTargetPath(platform, channel, installRoot);
  const current = ownedLauncher(target, platform, channel);
  const currentPrevious = ownedLauncher(`${target}.previous`, platform, channel);
  const legacy = ownedLauncher(legacyTarget, platform, channel);
  const legacyPrevious = ownedLauncher(`${legacyTarget}.previous`, platform, channel);
  const currentShortcut = platform === 'win32' && current.owned
    ? inspectWindowsShortcut(appName(channel), target)
    : null;
  const legacyShortcut = platform === 'win32' && legacy.owned
    ? inspectWindowsShortcut(legacyAppName(channel), legacyTarget)
    : null;
  if ([current, currentPrevious, legacy, legacyPrevious].some((item) => item.owned)) {
    await stopOwnedInstance({ channel, failOnUnknown: true });
  }
  const removed = [];
  const preserved = [];
  for (const observation of [current, currentPrevious, legacy, legacyPrevious]) removeOwnedPath(observation, removed, preserved);
  for (const observation of [currentShortcut, legacyShortcut].filter(Boolean)) removeOwnedShortcut(observation, removed, preserved);
  return {
    ...launcherStatus({ platform, channel, installRoot }),
    installed: false,
    removed: removed.length > 0,
    removedTargets: removed,
    preserved: preserved.filter(Boolean),
  };
}

async function main(args = process.argv.slice(2)) {
  const action = args[0] || 'status';
  const value = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args[i + 1]; };
  const options = { platform: value('--platform', process.platform), channel: value('--channel', 'development'), installRoot: value('--target', undefined) };
  const result = action === 'install' ? await installLauncher(options) : action === 'uninstall' ? await uninstallLauncher(options) : action === 'status' ? launcherStatus(options) : (() => { throw new Error(`Unknown launcher action: ${action}`); })();
  console.log(JSON.stringify(result, null, 2));
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
