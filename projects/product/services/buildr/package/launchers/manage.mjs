#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { buildLauncher } from './build.mjs';
import { workspaceNodeRuntimePaths } from '../../src/infrastructure/filesystem/workspace-node-runtime.mjs';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';

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
  let workspace;
  try { workspace = YAML.parse(fs.readFileSync(path.join(workspaceRoot, '.buildr', 'workspace.yml'), 'utf8')); } catch (error) { throw new Error(`Development launcher cannot read Workspace metadata: ${error.message}`); }
  const version = workspace?.runtime?.node?.version;
  if (!version) throw new Error('Development launcher requires Workspace Node identity. Run buildr sync before installing the launcher.');
  const managed = workspaceNodeRuntimePaths(version).node;
  const provided = path.resolve(runtime);
  const candidates = [managed, provided].filter((candidate, index, all) => all.indexOf(candidate) === index);
  const executable = candidates.find((candidate) => fs.existsSync(candidate) && nodeVersion(candidate) === version);
  if (!executable) throw new Error(`Workspace Node runtime ${version} is unavailable. Run buildr sync <agent> --target ${workspaceRoot}, then reinstall the Development launcher.`);
  return { workspaceRoot, version, executable, source: executable === managed ? 'workspace-managed' : 'workspace-cli' };
}
function appName(channel) { return channel === 'development' ? 'Buildr Dev' : 'Buildr'; }
function defaultInstallRoot(platform) {
  if (process.env.BUILDR_LAUNCHER_INSTALL_DIR) return path.resolve(process.env.BUILDR_LAUNCHER_INSTALL_DIR);
  if (platform === 'darwin') return '/Applications';
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs');
}
function targetPath(platform, channel, installRoot = defaultInstallRoot(platform)) {
  return platform === 'darwin'
    ? path.posix.join(installRoot.replaceAll('\\', '/'), `${appName(channel)}.app`)
    : path.win32.join(installRoot, appName(channel));
}
function appDataRoot() {
  if (process.env.BUILDR_APP_DATA_DIR) return path.resolve(process.env.BUILDR_APP_DATA_DIR);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Buildr');
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Buildr');
}
function runningInstance() { try { return JSON.parse(fs.readFileSync(path.join(appDataRoot(), 'instance.json'), 'utf8')); } catch { return null; } }
function identityPath(target, platform) { return platform === 'darwin' ? path.join(target, 'Contents', 'Resources', 'launcher-identity.json') : path.join(target, 'launcher-identity.json'); }
function readIdentity(target, platform) { try { return JSON.parse(fs.readFileSync(identityPath(target, platform), 'utf8')); } catch { return null; } }
function buildIdentity(platform, channel) {
  const checkout = checkoutIdentity();
  const identity = { schemaVersion: 'buildr.launcher-identity/v1', version: packageVersion(), channel, source: channel === 'development' ? 'checkout' : 'package', buildId: channel === 'development' ? `${checkout.head.slice(0, 12)}-${checkout.fingerprint}` : packageVersion(), buildNumber: String(Date.now()), protocolVersion: 1, platform, builtAt: new Date().toISOString(), checkout };
  if (channel === 'development') {
    const runtime = developmentRuntime(process.execPath);
    return { ...identity, sourceRoot: PRODUCT_ROOT, workspaceRoot: runtime.workspaceRoot, nodeRuntime: { executable: runtime.executable, version: runtime.version, source: runtime.source } };
  }
  return identity;
}
function validateBundle(bundle, platform, expected) {
  const actual = readIdentity(bundle, platform);
  if (!actual || actual.buildId !== expected.buildId || actual.channel !== expected.channel) throw new Error('Staged launcher identity validation failed.');
  if (expected.channel === 'development') {
    if (!sameFilesystemPath(actual.sourceRoot, expected.sourceRoot) || !sameFilesystemPath(actual.nodeRuntime?.executable, expected.nodeRuntime?.executable) || actual.nodeRuntime?.version !== expected.nodeRuntime?.version) throw new Error('Staged Development launcher checkout/runtime identity validation failed.');
    if (!fs.existsSync(actual.sourceRoot) || !fs.existsSync(path.join(actual.sourceRoot, 'bin', 'buildr.mjs')) || !fs.existsSync(path.join(actual.sourceRoot, 'package.json')) || !fs.existsSync(path.join(actual.sourceRoot, 'src')) || !fs.existsSync(path.join(actual.sourceRoot, 'package'))) throw new Error('Staged Development launcher checkout is missing.');
    if (!fs.existsSync(actual.nodeRuntime.executable)) throw new Error('Staged Development launcher Workspace Node runtime is missing.');
  } else {
    const runtime = platform === 'darwin' ? path.join(bundle, 'Contents', 'MacOS', 'node') : path.join(bundle, 'runtime', 'node.exe');
    if (!fs.existsSync(runtime)) throw new Error('Staged launcher runtime is missing.');
  }
  return actual;
}
function launcherDiagnostics(identity) {
  if (!identity || identity.channel !== 'development') return [];
  const findings = [];
  if (!identity.sourceRoot || !path.isAbsolute(identity.sourceRoot) || !fs.existsSync(identity.sourceRoot)) findings.push({ code: 'development.source_missing', message: `Buildr checkout 不存在：${identity.sourceRoot || 'unknown'}`, suggestion: '重新运行 Buildr Dev launcher install。' });
  else if (!fs.existsSync(path.join(identity.sourceRoot, 'bin', 'buildr.mjs'))) findings.push({ code: 'development.cli_missing', message: `Buildr CLI 不存在：${path.join(identity.sourceRoot, 'bin', 'buildr.mjs')}`, suggestion: '确认当前 checkout 完整后重新安装 launcher。' });
  else if (!fs.existsSync(path.join(identity.sourceRoot, 'package.json')) || !fs.existsSync(path.join(identity.sourceRoot, 'src')) || !fs.existsSync(path.join(identity.sourceRoot, 'package'))) findings.push({ code: 'development.checkout_invalid', message: `Buildr Service checkout 不完整：${identity.sourceRoot}`, suggestion: '确认当前 checkout 完整后重新安装 launcher。' });
  const executable = identity.nodeRuntime?.executable;
  if (!executable || !fs.existsSync(executable)) findings.push({ code: 'development.node_missing', message: `Workspace Node 不存在：${executable || 'unknown'}`, suggestion: '运行 buildr sync 后重新安装 launcher。' });
  else if (nodeVersion(executable) !== identity.nodeRuntime.version) findings.push({ code: 'development.node_version_mismatch', message: `Workspace Node 版本不匹配：${executable}`, suggestion: '运行 buildr sync 后重新安装 launcher。' });
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
export function launcherStatus({ platform = process.platform, channel = 'release', installRoot } = {}) {
  const target = targetPath(platform, channel, installRoot);
  const instance = runningInstance();
  const identity = readIdentity(target, platform);
  return { schemaVersion: 'buildr.launcher-status/v1', platform, channel, target, installed: fs.existsSync(target), identity, diagnostics: launcherDiagnostics(identity), runningInstance: instance ? { url: instance.url, pid: instance.pid, launcherIdentity: instance.launcherIdentity ?? null } : null };
}
export async function installLauncher({ platform = process.platform, channel = 'release', installRoot, runtime = process.execPath, stopInstance = true } = {}) {
  if (!['darwin', 'win32'].includes(platform)) throw new Error(`Unsupported launcher platform: ${platform}`);
  const target = targetPath(platform, channel, installRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const identity = buildIdentity(platform, channel);
  const staging = fs.mkdtempSync(path.join(path.dirname(target), `.buildr-${channel}-staging-`));
  const backup = `${target}.previous`;
  let stagedBundle;
  try {
    stagedBundle = buildLauncher({ platform, output: staging, runtime, identity });
    validateBundle(stagedBundle, platform, identity);
    const targetExisted = fs.existsSync(target);
    if (stopInstance) await stopOwnedInstance({ channel, failOnUnknown: targetExisted });
    fs.rmSync(backup, { recursive: true, force: true });
    if (fs.existsSync(target)) fs.renameSync(target, backup);
    try {
      fs.renameSync(stagedBundle, target);
      validateBundle(target, platform, identity);
      if (platform === 'win32' && process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(target, 'Install-Buildr-Shortcuts.ps1')]);
    } catch (error) {
      fs.rmSync(target, { recursive: true, force: true });
      if (fs.existsSync(backup)) fs.renameSync(backup, target);
      throw error;
    }
    return { ...launcherStatus({ platform, channel, installRoot }), previous: fs.existsSync(backup) ? backup : null };
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}
export async function uninstallLauncher({ platform = process.platform, channel = 'release', installRoot } = {}) {
  const status = launcherStatus({ platform, channel, installRoot });
  await stopOwnedInstance({ channel, failOnUnknown: status.installed });
  if (platform === 'win32') {
    const shortcut = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${appName(channel)}.lnk`);
    if (process.env.APPDATA) fs.rmSync(shortcut, { force: true });
  }
  fs.rmSync(status.target, { recursive: true, force: true });
  fs.rmSync(`${status.target}.previous`, { recursive: true, force: true });
  return { ...status, installed: false, removed: status.installed };
}

async function main(args = process.argv.slice(2)) {
  const action = args[0] || 'status';
  const value = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args[i + 1]; };
  const options = { platform: value('--platform', process.platform), channel: value('--channel', 'release'), installRoot: value('--target', undefined) };
  const result = action === 'install' ? await installLauncher(options) : action === 'uninstall' ? await uninstallLauncher(options) : action === 'status' ? launcherStatus(options) : (() => { throw new Error(`Unknown launcher action: ${action}`); })();
  console.log(JSON.stringify(result, null, 2));
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
