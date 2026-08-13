import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { atomicWriteJson } from '../filesystem/index.mjs';
import { localAppDataRoot } from '../filesystem/workspace-registry-repository.mjs';
import {
  createNpmLauncherBinding,
  inspectNpmLauncherBinding,
  readAndInspectNpmLauncherBinding,
  validateNpmLauncherBinding,
} from '../product-identity/launcher-binding.mjs';
import { resolveProductResource } from '../product-resources/index.mjs';

function quoteShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function defaultNpmLauncherTarget(platform = process.platform, options = {}) {
  if (options.target) return path.resolve(options.target);
  if (platform === 'darwin') return path.join(os.homedir(), 'Applications', 'Buildr Web.app');
  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Buildr Web.lnk');
  }
  throw new Error(`Buildr Web Launcher is not supported on ${platform}.`);
}

export function npmLauncherBindingPath(platform = process.platform, target = defaultNpmLauncherTarget(platform)) {
  return platform === 'darwin'
    ? path.join(path.resolve(target), 'Contents', 'Resources', 'launcher-binding.json')
    : path.join(localAppDataRoot(), 'launchers', 'npm', 'launcher-binding.json');
}

function macLauncherScript(binding) {
  return `#!/bin/sh
NODE=${quoteShell(binding.hostNode.path)}
NODE_SHA=${quoteShell(binding.hostNode.sha256.slice('sha256-'.length))}
ENTRY=${quoteShell(binding.packageEntry.path)}
ENTRY_SHA=${quoteShell(binding.packageEntry.sha256.slice('sha256-'.length))}
BINDING=${quoteShell(binding.bindingPath)}
LOG_DIR="\${HOME}/Library/Logs/Buildr"
LOG_FILE="\${LOG_DIR}/launcher.log"
mkdir -p "\${LOG_DIR}"
fail() {
  printf '%s\n' "$1" >>"\${LOG_FILE}"
  /usr/bin/osascript -e 'display alert "Buildr Web 无法启动" message "npm installation 或 Launcher binding 已漂移。请在终端运行 buildr web launcher status，然后执行 buildr web launcher repair。" as critical' >/dev/null 2>&1 || true
  exit 1
}
[ -x "\${NODE}" ] || fail "Host Node unavailable: \${NODE}"
[ -f "\${ENTRY}" ] || fail "Buildr entry unavailable: \${ENTRY}"
[ "$(/usr/bin/shasum -a 256 "\${NODE}" | /usr/bin/awk '{print $1}')" = "\${NODE_SHA}" ] || fail "Host Node digest drifted: \${NODE}"
[ "$(/usr/bin/shasum -a 256 "\${ENTRY}" | /usr/bin/awk '{print $1}')" = "\${ENTRY_SHA}" ] || fail "Buildr entry digest drifted: \${ENTRY}"
"\${NODE}" "\${ENTRY}" web --launcher-binding "\${BINDING}" >>"\${LOG_FILE}" 2>&1
STATUS=$?
[ "\${STATUS}" -eq 0 ] || fail "Buildr Web exited with status \${STATUS}"
exit 0
`;
}

function macInfoPlist(binding) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Buildr Web</string>
<key>CFBundleDisplayName</key><string>Buildr Web</string>
<key>CFBundleIdentifier</key><string>ai.buildr.web.npm-launcher</string>
<key>CFBundleShortVersionString</key><string>${binding.version}</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>Buildr Web</string>
<key>CFBundleIconFile</key><string>Buildr.icns</string>
<key>LSUIElement</key><true/>
</dict></plist>
`;
}

function writeMacLauncherCandidate(stage, binding) {
  const contents = path.join(stage, 'Contents');
  const executable = path.join(contents, 'MacOS', 'Buildr Web');
  const resources = path.join(contents, 'Resources');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.mkdirSync(resources, { recursive: true });
  fs.writeFileSync(executable, macLauncherScript(binding), { encoding: 'utf8', mode: 0o755 });
  fs.writeFileSync(path.join(contents, 'Info.plist'), macInfoPlist(binding), 'utf8');
  fs.copyFileSync(resolveProductResource('product/package/launchers/assets/Buildr.icns'), path.join(resources, 'Buildr.icns'));
  atomicWriteJson(path.join(resources, 'launcher-binding.json'), binding, { mode: 0o600 });
  const signed = spawnSync('/usr/bin/codesign', ['--force', '--sign', '-', '--timestamp=none', stage], { encoding: 'utf8' });
  if (process.platform === 'darwin' && signed.status !== 0) throw new Error(`Cannot ad-hoc sign Buildr Web Launcher: ${(signed.stderr || '').trim()}`);
}

function windowsShortcutScript(target, binding, icon) {
  const argumentsValue = `"${binding.packageEntry.path.replaceAll('"', '""')}" web --launcher-binding "${binding.bindingPath.replaceAll('"', '""')}"`;
  return [
    '$ErrorActionPreference = "Stop"',
    `$target = ${quotePowerShell(target)}`,
    '$parent = Split-Path -Parent $target',
    'New-Item -ItemType Directory -Force -Path $parent | Out-Null',
    '$shell = New-Object -ComObject WScript.Shell',
    '$shortcut = $shell.CreateShortcut($target)',
    `$shortcut.TargetPath = ${quotePowerShell(binding.hostNode.path)}`,
    `$shortcut.Arguments = ${quotePowerShell(argumentsValue)}`,
    `$shortcut.WorkingDirectory = ${quotePowerShell(binding.packageRoot)}`,
    `$shortcut.IconLocation = ${quotePowerShell(`${icon},0`)}`,
    '$shortcut.Description = "Open Buildr Web from the registered npm installation"',
    '$shortcut.Save()',
  ].join('; ');
}

function writeWindowsLauncherCandidate(target, binding, options = {}) {
  const bindingDir = path.dirname(binding.bindingPath);
  fs.mkdirSync(bindingDir, { recursive: true });
  const icon = path.join(bindingDir, 'Buildr.ico');
  const token = `${process.pid}-${crypto.randomUUID()}`;
  const stagedBinding = `${binding.bindingPath}.buildr-stage-${token}`;
  const stagedIcon = `${icon}.buildr-stage-${token}`;
  const originals = [target, binding.bindingPath, icon].map((file) => ({ file, backup: `${file}.buildr-backup-${token}`, present: fs.existsSync(file), moved: false }));
  const restore = () => {
    for (const { file, present, moved } of originals) if (moved || !present) fs.rmSync(file, { force: true });
    for (const { file, backup, moved } of originals) if (moved && fs.existsSync(backup)) fs.renameSync(backup, file);
  };
  try {
    fs.copyFileSync(resolveProductResource('product/package/launchers/assets/Buildr.ico'), stagedIcon);
    atomicWriteJson(stagedBinding, binding, { mode: 0o600 });
    for (const original of originals) if (original.present) {
      fs.renameSync(original.file, original.backup);
      original.moved = true;
    }
    fs.renameSync(stagedBinding, binding.bindingPath);
    fs.renameSync(stagedIcon, icon);
    if (options.writeShortcut) options.writeShortcut({ target, binding, icon });
    else {
      if (process.platform !== 'win32') throw new Error('Windows Launcher shortcut creation requires a Windows host.');
      const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsShortcutScript(target, binding, icon)], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`Cannot create Buildr Web shortcut: ${(result.stderr || '').trim()}`);
    }
    const shortcut = readWindowsShortcut(target, options);
    const expected = expectedWindowsShortcut(binding);
    if (!shortcut || !Object.entries(expected).every(([field, value]) => String(shortcut[field] || '').toLowerCase() === String(value).toLowerCase())) {
      throw new Error('Created Buildr Web shortcut does not match its npm Launcher binding.');
    }
    for (const { backup } of originals) fs.rmSync(backup, { force: true });
  } catch (error) {
    fs.rmSync(stagedBinding, { force: true });
    fs.rmSync(stagedIcon, { force: true });
    restore();
    throw error;
  }
}

function readWindowsShortcut(target, options = {}) {
  if (options.readShortcut) return options.readShortcut(target);
  if (process.platform !== 'win32') return null;
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$shell = New-Object -ComObject WScript.Shell',
    '$shortcut = $shell.CreateShortcut($env:BUILDR_LAUNCHER_SHORTCUT)',
    '[ordered]@{ target = $shortcut.TargetPath; arguments = $shortcut.Arguments; workingDirectory = $shortcut.WorkingDirectory } | ConvertTo-Json -Compress',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    env: { ...process.env, BUILDR_LAUNCHER_SHORTCUT: target },
  });
  if (result.status !== 0) throw new Error(`Cannot inspect Buildr Web shortcut: ${(result.stderr || '').trim()}`);
  return JSON.parse(result.stdout);
}

function expectedWindowsShortcut(binding) {
  return {
    target: binding.hostNode.path,
    arguments: `"${binding.packageEntry.path}" web --launcher-binding "${binding.bindingPath}"`,
    workingDirectory: binding.packageRoot,
  };
}

function launcherStructure(platform, target, observed, options = {}) {
  if (observed.status !== 'ready') return observed;
  if (platform === 'darwin') {
    const executable = path.join(target, 'Contents', 'MacOS', 'Buildr Web');
    const plist = path.join(target, 'Contents', 'Info.plist');
    const icon = path.join(target, 'Contents', 'Resources', 'Buildr.icns');
    for (const file of [executable, plist, icon]) {
      if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return { ...observed, status: 'stale', code: 'launcher.structure_drift', message: `Launcher structure is missing: ${file}.` };
    }
    const expectedScript = macLauncherScript(observed.binding);
    if (fs.readFileSync(executable, 'utf8') !== expectedScript) return { ...observed, status: 'stale', code: 'launcher.wrapper_drift', message: 'Launcher wrapper bytes differ from the recorded npm binding.' };
    return observed;
  }
  if (platform === 'win32') {
    let shortcut;
    try { shortcut = readWindowsShortcut(target, options); } catch (error) {
      return { ...observed, status: 'invalid', code: 'launcher.shortcut_unreadable', message: error.message };
    }
    if (!shortcut) return options.readShortcut
      ? { ...observed, status: 'stale', code: 'launcher.shortcut_missing', message: `Launcher shortcut is unavailable: ${target}.` }
      : observed;
    const expected = expectedWindowsShortcut(observed.binding);
    const equal = Object.entries(expected).every(([field, value]) => String(shortcut[field] || '').toLowerCase() === String(value).toLowerCase());
    if (!equal) return { ...observed, status: 'invalid', code: 'launcher.shortcut_foreign', message: 'Launcher shortcut target, arguments, or working directory differs from its binding.' };
  }
  return observed;
}

function readBindingForTarget(platform, target) {
  return readAndInspectNpmLauncherBinding(npmLauncherBindingPath(platform, target), { target });
}

function ownershipMatches(observed, expected) {
  return observed.binding?.launcherOwnershipIdentity === expected.launcherOwnershipIdentity;
}

export function npmLauncherStatus({ platform = process.platform, target, readShortcut } = {}) {
  const resolvedTarget = defaultNpmLauncherTarget(platform, { target });
  const bindingPath = npmLauncherBindingPath(platform, resolvedTarget);
  const targetPresent = fs.existsSync(resolvedTarget);
  const bindingObservation = readAndInspectNpmLauncherBinding(bindingPath, { target: resolvedTarget });
  const observed = targetPresent ? launcherStructure(platform, resolvedTarget, bindingObservation, { readShortcut }) : bindingObservation;
  const status = !targetPresent && observed.status === 'absent'
    ? 'absent'
    : !targetPresent
      ? 'stale'
      : observed.status;
  return {
    schemaVersion: 'buildr.launcher-status/v1',
    channel: 'npm',
    platform,
    target: resolvedTarget,
    bindingPath,
    status,
    installed: status === 'ready',
    binding: observed.binding,
    diagnostic: status === 'ready' || status === 'absent' ? null : { code: observed.code || 'launcher.target_missing', message: observed.message || `Launcher target is unavailable: ${resolvedTarget}.` },
    nextActions: status === 'ready' ? [] : status === 'absent' ? ['Run buildr web launcher install.'] : ['Run buildr web launcher repair from the same npm installation.'],
  };
}

export function installNpmLauncher({ registration, platform = process.platform, target, repair = false, writeShortcut, readShortcut } = {}) {
  const resolvedTarget = defaultNpmLauncherTarget(platform, { target });
  const bindingPath = npmLauncherBindingPath(platform, resolvedTarget);
  const expected = createNpmLauncherBinding({ registration, platform, target: resolvedTarget, bindingPath });
  const existing = readBindingForTarget(platform, resolvedTarget);
  const existingStructure = fs.existsSync(resolvedTarget) ? launcherStructure(platform, resolvedTarget, existing, { readShortcut }) : existing;
  if (fs.existsSync(resolvedTarget) && (!ownershipMatches(existing, expected) || (existingStructure.code === 'launcher.shortcut_foreign' && !repair))) {
    throw new Error(`Refusing to replace foreign Launcher target: ${resolvedTarget}.`);
  }
  if (repair && existing.status === 'absent') throw new Error('Launcher repair requires an existing owned Launcher; run launcher install instead.');
  if (platform === 'darwin') {
    fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true });
    const stage = `${resolvedTarget}.buildr-stage-${process.pid}-${crypto.randomUUID()}`;
    const backup = `${resolvedTarget}.buildr-backup-${process.pid}-${crypto.randomUUID()}`;
    try {
      writeMacLauncherCandidate(stage, expected);
      const verifiedStage = readAndInspectNpmLauncherBinding(npmLauncherBindingPath(platform, stage), { target: resolvedTarget });
      if (verifiedStage.status !== 'ready') throw new Error(`Staged Launcher validation failed: ${verifiedStage.message}`);
      if (fs.existsSync(resolvedTarget)) fs.renameSync(resolvedTarget, backup);
      fs.renameSync(stage, resolvedTarget);
      if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
    } catch (error) {
      fs.rmSync(stage, { recursive: true, force: true });
      if (!fs.existsSync(resolvedTarget) && fs.existsSync(backup)) fs.renameSync(backup, resolvedTarget);
      throw error;
    }
  } else if (platform === 'win32') {
    writeWindowsLauncherCandidate(resolvedTarget, expected, { writeShortcut, readShortcut });
  } else throw new Error(`Buildr Web Launcher is not supported on ${platform}.`);
  const result = npmLauncherStatus({ platform, target: resolvedTarget, readShortcut });
  if (result.status !== 'ready') throw new Error(`Installed Launcher did not validate: ${result.diagnostic?.message || result.status}.`);
  return { ...result, action: repair ? 'repaired' : existing.status === 'absent' ? 'installed' : 'refreshed' };
}

export function repairNpmLauncher(options = {}) {
  return installNpmLauncher({ ...options, repair: true });
}

export function uninstallNpmLauncher({ registration, platform = process.platform, target, readShortcut } = {}) {
  const resolvedTarget = defaultNpmLauncherTarget(platform, { target });
  const bindingPath = npmLauncherBindingPath(platform, resolvedTarget);
  const expected = createNpmLauncherBinding({ registration, platform, target: resolvedTarget, bindingPath });
  const observed = readAndInspectNpmLauncherBinding(bindingPath, { target: resolvedTarget });
  const structure = fs.existsSync(resolvedTarget) ? launcherStructure(platform, resolvedTarget, observed, { readShortcut }) : observed;
  if (fs.existsSync(resolvedTarget) && (!ownershipMatches(observed, expected) || structure.code === 'launcher.shortcut_foreign')) throw new Error(`Refusing to remove foreign Launcher target: ${resolvedTarget}.`);
  if (observed.binding && !ownershipMatches(observed, expected)) throw new Error(`Refusing to remove foreign Launcher binding: ${bindingPath}.`);
  if (platform === 'darwin') fs.rmSync(resolvedTarget, { recursive: true, force: true });
  else if (platform === 'win32') {
    fs.rmSync(resolvedTarget, { force: true });
    fs.rmSync(bindingPath, { force: true });
    fs.rmSync(path.join(path.dirname(bindingPath), 'Buildr.ico'), { force: true });
  }
  return { ...npmLauncherStatus({ platform, target: resolvedTarget }), action: observed.status === 'absent' ? 'absent' : 'uninstalled' };
}

export function refreshInstalledNpmLauncher({ registration, platform = process.platform, target, writeShortcut, readShortcut } = {}) {
  if (!['darwin', 'win32'].includes(platform)) return { action: 'skipped', reason: `unsupported platform ${platform}` };
  const resolvedTarget = defaultNpmLauncherTarget(platform, { target });
  const bindingPath = npmLauncherBindingPath(platform, resolvedTarget);
  if (!fs.existsSync(resolvedTarget) && !fs.existsSync(bindingPath)) return { action: 'skipped', reason: 'Launcher is not installed' };
  const expected = createNpmLauncherBinding({ registration, platform, target: resolvedTarget, bindingPath });
  const existing = readAndInspectNpmLauncherBinding(bindingPath, { target: resolvedTarget });
  if (!ownershipMatches(existing, expected)) return { action: 'blocked', reason: 'Existing Launcher ownership does not match this npm installation slot' };
  return installNpmLauncher({ registration, platform, target: resolvedTarget, repair: false, writeShortcut, readShortcut });
}

export function assertCurrentNpmLauncherBinding(file, productIdentity) {
  const observed = readAndInspectNpmLauncherBinding(file);
  if (observed.status !== 'ready') throw new Error(`Buildr Web Launcher binding is ${observed.status}: ${observed.message || observed.code}.`);
  const binding = validateNpmLauncherBinding(observed.binding);
  const mismatches = [
    ['version', binding.version, productIdentity.version],
    ['protocolIdentity', binding.protocolIdentity, productIdentity.protocolIdentity],
    ['applicationPayloadDigest', binding.applicationPayloadDigest, productIdentity.applicationPayloadDigest],
    ['installationIdentity', binding.installationOwnershipIdentity, productIdentity.installationIdentity],
  ].filter(([, expected, actual]) => expected !== actual);
  if (mismatches.length) throw new Error(`Buildr Web Launcher does not match the current npm Buildr (${mismatches.map(([field]) => field).join(', ')}).`);
  return binding;
}
