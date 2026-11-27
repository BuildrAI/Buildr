#!/usr/bin/env node
import { activateAgentServiceRuntime } from '../../../src/modules/agent-service/application/activate-runtime.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildLauncher, DEFAULT_DEVELOPMENT_LAUNCHER_WEB_PORT } from './build.ts';
import { sameFilesystemPath } from '../../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import {
  DEVELOPMENT_SOURCE_SCHEMA,
  defaultWebDataRoot,
  developmentSourceFile,
  oppositeWebProfile,
  resolveWebProfile,
} from '../../../src/modules/installation/contracts/web-profile.ts';
import { prepareDevelopmentWeb } from '../../development/prepare-development-web.ts';
import {withDevelopmentUpdate} from '../../development/dev-update.ts';

const PRODUCT_ROOT: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function packageVersion(): any  { return JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, 'package.json'), 'utf8')).version; }
function gitText(args: any): any  { try { return execFileSync('git', args, { cwd: PRODUCT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } }
function checkoutIdentity(): any  {
  const head: any = gitText(['rev-parse', 'HEAD']) || 'not-a-checkout';
  const dirty: any = gitText(['status', '--porcelain=v1', '--untracked-files=all']);
  return { head, dirty: Boolean(dirty), fingerprint: crypto.createHash('sha256').update(`${head}\0${dirty}`).digest('hex').slice(0, 16) };
}
function findWorkspaceRoot(start: any = process.cwd()): any  {
  let current: any = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, '.buildr', 'workspace.yml'))) return current;
    const parent: any = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
function nodeVersion(executable: any): any  {
  try { return execFileSync(executable, ['-p', 'process.versions.node'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
}
function developmentRuntime(runtime: any): any  {
  const workspaceRoot: any = findWorkspaceRoot();
  if (!workspaceRoot) throw new Error('Development launcher requires a Buildr Workspace. Run it from the Workspace checkout and retry.');
  const provided: any = path.resolve(runtime);
  const version: any = nodeVersion(provided);
  if (!version || !/^24\.(?:1[5-9]|[2-9]\d)\./.test(version)) throw new Error(`Development host Node is missing or incompatible: ${provided}. Use Node >=24.15.0 <25 and reinstall the launcher.`);
  return {
    workspaceRoot,
    version,
    executable: provided,
    source: 'development-host',
    identity: `development-host:${fs.realpathSync(provided)}:${version}`,
  };
}
function assertDevelopmentChannel(channel: any): any  {
  if (channel !== 'development') throw new Error('Formal npm Buildr Launcher is managed only by `buildr web launcher`; tools/build/launcher manages development only.');
}
function appName(channel: any): any  { return channel === 'development' ? 'Buildr Dev' : 'Buildr'; }
function legacyAppNames(channel: any): string[] { return channel === 'development' ? ['Buildr Development Dev', 'Buildr Web Dev'] : ['Buildr Development', 'Buildr Web']; }
function defaultInstallRoot(platform: any): any  {
  if (process.env.BUILDR_LAUNCHER_INSTALL_DIR) return path.resolve(process.env.BUILDR_LAUNCHER_INSTALL_DIR);
  if (platform === 'darwin') return '/Applications';
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs');
}
function namedTargetPath(platform: any, name: any, installRoot: any = defaultInstallRoot(platform)): any  {
  return platform === 'darwin'
    ? path.posix.join(installRoot.replaceAll('\\', '/'), `${name}.app`)
    : path.win32.join(installRoot, name);
}
function targetPath(platform: any, channel: any, installRoot: any = defaultInstallRoot(platform)): any  { return namedTargetPath(platform, appName(channel), installRoot); }
function legacyTargetPaths(platform: any, channel: any, installRoot: any = defaultInstallRoot(platform)): string[] {
  return legacyAppNames(channel).map((name) => namedTargetPath(platform, name, installRoot));
}
function appDataRoot(platform: any = process.platform): any  {
  return resolveWebProfile({ channel: 'development', runtime: { role: 'development' } }, { platform }).dataRoot;
}
function buildDevelopmentSourceRecord(identity: any, target: any): any {
  return {
    schemaVersion: DEVELOPMENT_SOURCE_SCHEMA,
    channel: 'development',
    runtimeRole: 'development',
    source: 'checkout',
    platform: identity.platform,
    protocolIdentity: identity.protocolIdentity,
    sourceRoot: identity.sourceRoot,
    workspaceRoot: identity.workspaceRoot ?? null,
    launcherTarget: target,
    buildId: identity.buildId,
    version: identity.version,
    checkout: identity.checkout ?? null,
    updatedAt: identity.builtAt,
    developmentRuntime: identity.developmentRuntime,
  };
}
function writeDevelopmentSourceRecord(dataRoot: string, target: string, identity: any): string {
  const file = developmentSourceFile(dataRoot, identity.platform);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.development-source-${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temp, `${JSON.stringify(buildDevelopmentSourceRecord(identity, target), null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, file);
    return file;
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
}
function readDevelopmentSourceRecord(dataRoot: string, platform: any = process.platform): any {
  const file = developmentSourceFile(dataRoot, platform);
  const present = Boolean(fs.lstatSync(file, { throwIfNoEntry: false }));
  if (!present) {
    return { file, present: false, owned: false, valid: false, record: null, diagnostic: null };
  }
  let record: any = null;
  try { record = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const owned = Boolean(
    record
    && record.schemaVersion === DEVELOPMENT_SOURCE_SCHEMA
    && record.channel === 'development'
    && record.runtimeRole === 'development'
    && record.source === 'checkout'
    && (!record.platform || record.platform === platform)
    && typeof record.sourceRoot === 'string'
    && path.isAbsolute(record.sourceRoot),
  );
  return {
    file,
    present: true,
    owned,
    valid: owned,
    record,
    diagnostic: owned ? null : { code: 'development.source_record_ownership_unproven', message: `开发来源登记无效或归属无法证明，已保留：${file}` },
  };
}
function removeOwnedDevelopmentSourceRecord(dataRoot: string, platform: any, scopedTargets: string[], ownedTargets: string[], removed: any[], preserved: any[]): void {
  const observed = readDevelopmentSourceRecord(dataRoot, platform);
  if (!observed.present) return;
  if (!observed.owned) {
    preserved.push(observed.diagnostic);
    return;
  }
  const targetRef = observed.record?.launcherTarget;
  const matchesTarget = typeof targetRef === 'string' && path.isAbsolute(targetRef)
    ? ownedTargets.some((candidate) => sameFilesystemPath(candidate, targetRef))
      || (scopedTargets.some((candidate) => sameFilesystemPath(candidate, targetRef)) && !fs.existsSync(targetRef))
    : ownedTargets.length > 0;
  if (!matchesTarget) {
    preserved.push({ code: 'development.source_record_ownership_unproven', message: `开发来源登记指向其他安装目标，已保留：${observed.file}` });
    return;
  }
  fs.rmSync(observed.file, { force: true });
  removed.push(observed.file);
}
export function inspectGlobalCliCompatibility({
  platform = process.platform,
  developmentDataRoot = appDataRoot(platform),
  releasedDataRoot,
}: any = {}): any {
  const resolvedDevRoot = path.resolve(developmentDataRoot);
  const devProfile = resolveWebProfile({ channel: 'development', runtime: { role: 'development' } }, { platform, dataRoot: resolvedDevRoot });
  const defaultDevRoot = defaultWebDataRoot('development', { platform });
  const peerReleasedRoot = releasedDataRoot
    ? path.resolve(releasedDataRoot)
    : sameFilesystemPath(resolvedDevRoot, defaultDevRoot)
      ? oppositeWebProfile(devProfile, { channel: 'development', runtime: { role: 'development' } }, { platform }).dataRoot
      : path.join(resolvedDevRoot, '.peer', 'released');
  const registryFile = path.join(peerReleasedRoot, 'product-installations.json');
  let registry: any = null;
  try { registry = JSON.parse(fs.readFileSync(registryFile, 'utf8')); } catch {}
  const installations: any[] = Array.isArray(registry?.installations) ? registry.installations : [];
  const selected = installations.findLast((item: any) =>
    item?.origin?.channel === 'npm' && typeof item?.entryPath === 'string' && path.isAbsolute(item.entryPath) && fs.existsSync(item.entryPath));
  if (!selected) {
    return { status: 'absent', registryFile, version: null, entryPath: null, routerFile: null, warning: null };
  }
  const version = selected.origin?.version ?? null;
  const entryPath = selected.entryPath;
  const routerFile = path.resolve(path.dirname(entryPath), '..', 'runtime', 'workspace-cli-router.cjs');
  let content = '';
  if (fs.existsSync(routerFile)) {
    try { content = fs.readFileSync(routerFile, 'utf8'); } catch {}
  }
  if (content.includes(DEVELOPMENT_SOURCE_SCHEMA)) {
    return { status: 'compatible', registryFile, version, entryPath, routerFile, warning: null };
  }
  if (content.includes('Buildr Dev') || content.includes('Buildr Development Dev')) {
    return {
      status: 'launcher_only',
      registryFile,
      version,
      entryPath,
      routerFile,
      warning: {
        code: 'development.global_cli_routing_legacy_discovery',
        severity: 'warning',
        message: `检测到本机全局 npm buildr（${version || 'unknown'}）仅支持桌面启动器路径发现，尚未支持固定数据目录来源（development-source.json）。`,
        suggestion: '请执行 `buildr update` 更新全局 npm Buildr，以避免未来桌面应用改名时影响外部命令行工具。',
      },
    };
  }
  return {
    status: 'incompatible',
    registryFile,
    version,
    entryPath,
    routerFile: fs.existsSync(routerFile) ? routerFile : null,
    warning: {
      code: 'development.global_cli_routing_incompatible',
      severity: 'warning',
      message: `检测到本机全局 npm buildr（${version || 'unknown'}）尚未支持当前开发来源发现协议；开发版应用内智能体会话直连本机源码不受影响，但外部终端及其他命令行工具调用全局 buildr 操作开发版工作空间时可能失败。`,
      suggestion: '请执行 `buildr update`（RC 轨可运行 `buildr update --track candidate`）更新全局 npm Buildr。',
    },
  };
}
function runningInstance(platform: any = process.platform): any  { try { return JSON.parse(fs.readFileSync(path.join(appDataRoot(platform), 'instance.json'), 'utf8')); } catch { return null; } }
function identityPath(target: any, platform: any): any  { return platform === 'darwin' ? path.join(target, 'Contents', 'Resources', 'launcher-identity.json') : path.join(target, 'launcher-identity.json'); }
function readIdentity(target: any, platform: any): any  { try { return JSON.parse(fs.readFileSync(identityPath(target, platform), 'utf8')); } catch { return null; } }
function ownedLauncher(target: any, platform: any, channel: any): any  {
  const present: any = fs.existsSync(target);
  const identity: any = present ? readIdentity(target, platform) : null;
  const owned: any = Boolean(identity
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
function buildIdentity(platform: any, channel: any): any  {
  assertDevelopmentChannel(channel);
  const checkout: any = checkoutIdentity();
  const identity: any = { schemaVersion: 'buildr.launcher-identity/v1', version: packageVersion(), channel, runtimeRole: 'development', source: 'checkout', buildId: `${checkout.head.slice(0, 12)}-${checkout.fingerprint}`, buildNumber: String(Date.now()), protocolVersion: 1, protocolIdentity: 'buildr.web-protocol/v1', platform, builtAt: new Date().toISOString(), checkout, webPort: DEFAULT_DEVELOPMENT_LAUNCHER_WEB_PORT };
  const runtime: any = developmentRuntime(process.execPath);
  return { ...identity, sourceRoot: PRODUCT_ROOT, workspaceRoot: runtime.workspaceRoot, developmentRuntime: { executable: runtime.executable, version: runtime.version, source: runtime.source, identity: runtime.identity } };
}
function validateBundle(bundle: any, platform: any, expected: any): any  {
  const actual: any = readIdentity(bundle, platform);
  if (!actual || actual.buildId !== expected.buildId || actual.channel !== expected.channel || actual.webPort !== DEFAULT_DEVELOPMENT_LAUNCHER_WEB_PORT) throw new Error('Staged launcher identity validation failed.');
  if (!sameFilesystemPath(actual.sourceRoot, expected.sourceRoot) || !sameFilesystemPath(actual.developmentRuntime?.executable, expected.developmentRuntime?.executable) || actual.developmentRuntime?.version !== expected.developmentRuntime?.version || actual.developmentRuntime?.identity !== expected.developmentRuntime?.identity) throw new Error('Staged Development launcher checkout/development runtime identity validation failed.');
  if (!fs.existsSync(actual.sourceRoot) || !fs.existsSync(path.join(actual.sourceRoot, 'bin', 'buildr.mjs')) || !fs.existsSync(path.join(actual.sourceRoot, 'package.json')) || !fs.existsSync(path.join(actual.sourceRoot, 'src')) || !fs.existsSync(path.join(actual.sourceRoot, 'resources', 'manifest.yml'))) throw new Error('Staged Development launcher checkout is missing.');
  if (!fs.existsSync(actual.developmentRuntime.executable)) throw new Error('Staged Development launcher host runtime is missing.');
  return actual;
}
function launcherDiagnostics(identity: any): any  {
  if (!identity || identity.channel !== 'development') return [];
  const findings: any[] = [];
  if (identity.webPort !== DEFAULT_DEVELOPMENT_LAUNCHER_WEB_PORT) findings.push({ code: 'development.web_port_mismatch', message: `Buildr Dev Launcher未绑定固定端口 ${DEFAULT_DEVELOPMENT_LAUNCHER_WEB_PORT}。`, suggestion: '重新安装 Development Launcher。' });
  if (!identity.sourceRoot || !path.isAbsolute(identity.sourceRoot) || !fs.existsSync(identity.sourceRoot)) findings.push({ code: 'development.source_missing', message: `Buildr checkout 不存在：${identity.sourceRoot || 'unknown'}`, suggestion: '在保留的Buildr checkout中重新运行 npm run install:development。' });
  else if (!fs.existsSync(path.join(identity.sourceRoot, 'bin', 'buildr.mjs'))) findings.push({ code: 'development.cli_missing', message: `Buildr CLI 不存在：${path.join(identity.sourceRoot, 'bin', 'buildr.mjs')}`, suggestion: '确认当前 checkout 完整后重新安装 launcher。' });
  else if (!fs.existsSync(path.join(identity.sourceRoot, 'package.json')) || !fs.existsSync(path.join(identity.sourceRoot, 'src')) || !fs.existsSync(path.join(identity.sourceRoot, 'resources', 'manifest.yml'))) findings.push({ code: 'development.checkout_invalid', message: `Buildr Service checkout 不完整：${identity.sourceRoot}`, suggestion: '确认当前 checkout 完整后重新安装 launcher。' });
  const executable: any = identity.developmentRuntime?.executable;
  if (!executable || !fs.existsSync(executable)) findings.push({ code: 'development.node_missing', message: `Development host Node 不存在：${executable || 'unknown'}`, suggestion: '使用兼容 development host Node 重新安装 launcher。' });
  else if (nodeVersion(executable) !== identity.developmentRuntime.version) findings.push({ code: 'development.node_version_mismatch', message: `Development host Node 版本不匹配：${executable}`, suggestion: '使用 identity 绑定的 development host Node 重新安装 launcher。' });
  return findings;
}
async function stopOwnedInstance({ waitMs = 3000, channel, failOnUnknown = false }: any = {}): Promise<any>  {
  const state: any = runningInstance();
  if (!state) return { stopped: false, reason: 'not-running' };
  if (!state.launcherIdentity) {
    if (failOnUnknown) throw new Error('A running Buildr instance has no launcher identity; exit it before replacing this launcher.');
    return { stopped: false, reason: 'unknown-owner' };
  }
  if (state.launcherIdentity.channel !== channel) return { stopped: false, reason: 'different-owner' };
  try {
    const response: any = await fetch(`${state.url}/api/v1/health`, { headers: { 'x-buildr-instance': state.secret }, signal: AbortSignal.timeout(1000) });
    if (!response.ok) return { stopped: false, reason: 'stale' };
    process.kill(state.pid, 'SIGTERM');
  } catch { return { stopped: false, reason: 'stale' }; }
  const deadline: any = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try { process.kill(state.pid, 0); } catch { return { stopped: true }; }
    await new Promise((resolve: any) => setTimeout(resolve, 50));
  }
  throw new Error(`Buildr instance ${state.pid} did not stop before launcher switch.`);
}

function windowsShortcutPath(name: any): any  {
  if (!process.env.APPDATA) return null;
  return path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${name}.lnk`);
}

function inspectWindowsShortcut(name: any, expectedRoot: any): any  {
  const shortcut: any = windowsShortcutPath(name);
  if (!shortcut || !fs.existsSync(shortcut)) return { target: shortcut, present: false, owned: false, diagnostic: null };
  if (process.platform !== 'win32') {
    return { target: shortcut, present: true, owned: false, diagnostic: { code: 'launcher.shortcut_ownership_unavailable', message: `当前主机无法证明 Windows shortcut ownership，已保留：${shortcut}` } };
  }
  const script: any = [
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
    const result: any = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, BUILDR_LAUNCHER_SHORTCUT: shortcut, BUILDR_LAUNCHER_ROOT: expectedRoot },
    }).trim();
    const owned: any = result === 'owned';
    return { target: shortcut, present: true, owned, diagnostic: owned ? null : { code: 'launcher.shortcut_ownership_unproven', message: `Windows shortcut ownership 无法证明，已保留：${shortcut}` } };
  } catch (error: any) {
    return { target: shortcut, present: true, owned: false, diagnostic: { code: 'launcher.shortcut_inspect_failed', message: `Windows shortcut ownership 检查失败，已保留：${shortcut}`, detail: error.message } };
  }
}

function removeOwnedPath(observation: any, removed: any, preserved: any): any  {
  if (!observation.present) return;
  if (!observation.owned) {
    preserved.push(observation.diagnostic);
    return;
  }
  fs.rmSync(observation.target, { recursive: true, force: true });
  removed.push(observation.target);
}

function removeOwnedShortcut(observation: any, removed: any, preserved: any): any  {
  if (!observation.present) return;
  if (!observation.owned) {
    preserved.push(observation.diagnostic);
    return;
  }
  fs.rmSync(observation.target, { force: true });
  removed.push(observation.target);
}
export function launcherStatus({ platform = process.platform, channel = 'development', installRoot, dataRoot, releasedDataRoot }: any = {}): any  {
  assertDevelopmentChannel(channel);
  const resolvedDataRoot = dataRoot ? path.resolve(dataRoot) : appDataRoot(platform);
  const target: any = targetPath(platform, channel, installRoot);
  const instance: any = runningInstance(platform);
  const current: any = ownedLauncher(target, platform, channel);
  const legacyObservations: any[] = legacyTargetPaths(platform, channel, installRoot).map((itemTarget) => ownedLauncher(itemTarget, platform, channel));
  const legacy: any = legacyObservations.find((item) => item.present) ?? legacyObservations[0];
  const diagnostics: any = [current.diagnostic, ...legacyObservations.map((item) => item.diagnostic), ...launcherDiagnostics(current.identity)].filter(Boolean);
  const sourceObservation = readDevelopmentSourceRecord(resolvedDataRoot, platform);
  const globalCliCompatibility = inspectGlobalCliCompatibility({ platform, developmentDataRoot: resolvedDataRoot, releasedDataRoot });
  const warnings = globalCliCompatibility.warning ? [globalCliCompatibility.warning] : [];
  return {
    schemaVersion: 'buildr.launcher-status/v1',
    platform,
    channel,
    dataRoot: resolvedDataRoot,
    target,
    present: current.present,
    installed: current.owned,
    identity: current.identity,
    developmentSource: {
      file: sourceObservation.file,
      present: sourceObservation.present,
      valid: sourceObservation.valid,
      sourceRoot: sourceObservation.record?.sourceRoot ?? null,
    },
    legacy: { target: legacy.target, present: legacy.present, owned: legacy.owned, identity: legacy.identity, diagnostic: legacy.diagnostic },
    diagnostics,
    globalCliCompatibility,
    warnings,
    runningInstance: instance ? { url: instance.url, pid: instance.pid, launcherIdentity: instance.launcherIdentity ?? null } : null,
  };
}
export async function installLauncher({ platform = process.platform, channel = 'development', installRoot, dataRoot, releasedDataRoot, runtime = process.execPath, stopInstance = true }: any = {}): Promise<any>  {
  assertDevelopmentChannel(channel);
  if (!['darwin', 'win32'].includes(platform)) throw new Error(`Unsupported launcher platform: ${platform}`);
  const resolvedDataRoot = dataRoot ? path.resolve(dataRoot) : appDataRoot(platform);
  const target: any = targetPath(platform, channel, installRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const identity: any = buildIdentity(platform, channel);
  const backup: any = `${target}.previous`;
  const currentBefore: any = ownedLauncher(target, platform, channel);
  const backupBefore: any = ownedLauncher(backup, platform, channel);
  const legacyNames = legacyAppNames(channel);
  const legacyEntries: any[] = legacyTargetPaths(platform, channel, installRoot).map((itemTarget, index) => ({
    name: legacyNames[index],
    current: ownedLauncher(itemTarget, platform, channel),
    previous: ownedLauncher(`${itemTarget}.previous`, platform, channel),
  }));
  if (currentBefore.present && !currentBefore.owned) throw new Error(`Refusing to replace launcher without matching Buildr ownership: ${target}`);
  if (backupBefore.present && !backupBefore.owned) throw new Error(`Refusing to replace launcher backup without matching Buildr ownership: ${backup}`);
  const currentShortcutBefore: any = platform === 'win32' ? inspectWindowsShortcut(appName(channel), target) : null;
  const legacyShortcutsBefore: any[] = platform === 'win32'
    ? legacyEntries.map((entry) => entry.current.owned
      ? inspectWindowsShortcut(entry.name, entry.current.target)
      : { target: windowsShortcutPath(entry.name), present: Boolean(windowsShortcutPath(entry.name) && fs.existsSync(windowsShortcutPath(entry.name)!)), owned: false, diagnostic: { code: 'launcher.shortcut_ownership_unproven', message: `旧 Windows shortcut 缺少 matching Buildr Launcher ownership，已保留：${windowsShortcutPath(entry.name) || 'unknown'}` } })
    : [];
  const staging: any = fs.mkdtempSync(path.join(path.dirname(target), `.buildr-${channel}-staging-`));
  let stagedBundle: any;
  try {
    stagedBundle = buildLauncher({ platform, output: staging, runtime, identity });
    validateBundle(stagedBundle, platform, identity);
    if (stopInstance) await stopOwnedInstance({ channel, failOnUnknown: currentBefore.owned || legacyEntries.some((entry) => entry.current.owned) });
    fs.rmSync(backup, { recursive: true, force: true });
    if (currentBefore.present) fs.renameSync(target, backup);
    try {
      fs.renameSync(stagedBundle, target);
      validateBundle(target, platform, identity);
      if (platform === 'win32' && process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(target, 'Install-Buildr-Shortcuts.ps1')]);
    } catch (error: any) {
      if (platform === 'win32' && !currentShortcutBefore?.present) {
        const createdShortcut: any = inspectWindowsShortcut(appName(channel), target);
        if (createdShortcut.owned) fs.rmSync(createdShortcut.target, { force: true });
      }
      fs.rmSync(target, { recursive: true, force: true });
      if (fs.existsSync(backup)) fs.renameSync(backup, target);
      throw error;
    }
    writeDevelopmentSourceRecord(resolvedDataRoot, target, identity);
    const removed: any[] = [];
    const preserved: any[] = [];
    for (const entry of legacyEntries) {
      removeOwnedPath(entry.current, removed, preserved);
      removeOwnedPath(entry.previous, removed, preserved);
    }
    for (const shortcut of legacyShortcutsBefore) removeOwnedShortcut(shortcut, removed, preserved);
    return {
      ...launcherStatus({ platform, channel, installRoot, dataRoot: resolvedDataRoot, releasedDataRoot }),
      previous: fs.existsSync(backup) ? backup : null,
      migration: { removed, preserved: preserved.filter(Boolean) },
    };
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}
export async function uninstallLauncher({ platform = process.platform, channel = 'development', installRoot, dataRoot, releasedDataRoot }: any = {}): Promise<any>  {
  assertDevelopmentChannel(channel);
  const resolvedDataRoot = dataRoot ? path.resolve(dataRoot) : appDataRoot(platform);
  const target: any = targetPath(platform, channel, installRoot);
  const current: any = ownedLauncher(target, platform, channel);
  const currentPrevious: any = ownedLauncher(`${target}.previous`, platform, channel);
  const legacyNames = legacyAppNames(channel);
  const legacyEntries: any[] = legacyTargetPaths(platform, channel, installRoot).map((itemTarget, index) => ({
    name: legacyNames[index],
    current: ownedLauncher(itemTarget, platform, channel),
    previous: ownedLauncher(`${itemTarget}.previous`, platform, channel),
  }));
  const currentShortcut: any = platform === 'win32' && current.owned
    ? inspectWindowsShortcut(appName(channel), target)
    : null;
  const legacyShortcuts: any[] = platform === 'win32'
    ? legacyEntries.filter((entry) => entry.current.owned).map((entry) => inspectWindowsShortcut(entry.name, entry.current.target))
    : [];
  const allObservations = [current, currentPrevious, ...legacyEntries.flatMap((entry) => [entry.current, entry.previous])];
  const ownedTargets = allObservations.filter((item: any) => item.owned).map((item: any) => item.target);
  if (ownedTargets.length > 0) {
    await stopOwnedInstance({ channel, failOnUnknown: true });
  }
  const removed: any[] = [];
  const preserved: any[] = [];
  for (const observation of allObservations) removeOwnedPath(observation, removed, preserved);
  for (const observation of [currentShortcut, ...legacyShortcuts].filter(Boolean)) removeOwnedShortcut(observation, removed, preserved);
  const scopedTargets = [target, ...legacyTargetPaths(platform, channel, installRoot)];
  removeOwnedDevelopmentSourceRecord(resolvedDataRoot, platform, scopedTargets, ownedTargets, removed, preserved);
  return {
    ...launcherStatus({ platform, channel, installRoot, dataRoot: resolvedDataRoot, releasedDataRoot }),
    installed: false,
    removed: removed.length > 0,
    removedTargets: removed,
    preserved: preserved.filter(Boolean),
  };
}

async function runManagement(args: any): Promise<any>  {
  const action: any = args[0] || 'status';
  const value: any = (name: any, fallback: any) => { const i: any = args.indexOf(name); return i === -1 ? fallback : args[i + 1]; };
  const options: any = { platform: value('--platform', process.platform), channel: value('--channel', 'development'), installRoot: value('--target', undefined), stopInstance: !args.includes('--no-stop-instance') };
  const preparation = action === 'install' ? await prepareDevelopmentWeb() : null;
  const result: any = action === 'install' ? await installLauncher(options) : action === 'uninstall' ? await uninstallLauncher(options) : action === 'status' ? launcherStatus(options) : (() => { throw new Error(`Unknown launcher action: ${action}`); })();
  if (action === 'install') {
    result.webPreparation = { status: preparation!.status, timings: preparation!.timings };
    const profile = resolveWebProfile({channel: 'development', runtime: {role: 'development'}});
    result.agentService = await activateAgentServiceRuntime({dataRoot: profile.dataRoot, profileId: profile.profile ?? 'development'});
    if (result.globalCliCompatibility?.status === 'incompatible' && result.globalCliCompatibility.warning) {
      const warning = result.globalCliCompatibility.warning;
      process.stderr.write(`[warning] ${warning.code}: ${warning.message} ${warning.suggestion}\n`);
    }
  }
  console.log(JSON.stringify(result, null, 2));
}
export async function main(args: any = process.argv.slice(2)): Promise<any> {
  return args[0] === 'install'
    ? withDevelopmentUpdate(PRODUCT_ROOT, () => runManagement(args), {formal: true})
    : runManagement(args);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((error: any) => { console.error(JSON.stringify({status:'failed',stage:error.stage??'install',...(error.timings?{timings:error.timings}:{}),...(typeof error.internalCode==='string'&&/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(error.internalCode)?{internalCode:error.internalCode}:{}),code:typeof error.code==='string'&&/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(error.code)?error.code:'development_install_failed',message:error.stage||error.code?error.message:'开发应用安装未完成，原应用与工作记录已保留。'})); process.exitCode = 1; });
