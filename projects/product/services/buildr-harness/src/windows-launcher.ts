import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {invalidLauncher, launcherDigest, parseLauncherBinding, type HarnessLauncherBinding} from './launcher-binding.ts';

const directory = (target: string) => target + '.buildr-harness';
export const windowsBindingPath = (target: string) => path.join(directory(target), 'harness-launcher.json');
const runnerPath = (target: string) => path.join(directory(target), 'harness-launcher.ps1');
const powershell = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
export function windowsHarnessArguments(runner: string): string {
  if (/["\0\r\n]/u.test(runner)) invalidLauncher('Windows 启动器路径无效。');
  return `-NoProfile -NonInteractive -WindowStyle Hidden -File "${runner}"`;
}
export function windowsHarnessRunner(): string {
  return '\uFEFF' + [
    '$ErrorActionPreference = "Stop"',
    '$bindingFile = Join-Path $PSScriptRoot "harness-launcher.json"',
    'try {',
    '  $binding = Get-Content -LiteralPath $bindingFile -Raw -Encoding UTF8 | ConvertFrom-Json',
    '  & $binding.node $binding.entry web --launcher-binding $bindingFile',
    '  if ($LASTEXITCODE -ne 0) { throw "Harness entry failed closed" }',
    '  exit 0',
    '} catch {',
    '  if ($env:BUILDR_LAUNCHER_NO_NOTIFY -ne "1") {',
    '    Add-Type -AssemblyName System.Windows.Forms',
    '    [System.Windows.Forms.MessageBox]::Show("Buildr Harness 无法启动，请核对安装入口和 Node 绑定。", "Buildr Harness") | Out-Null',
    '  }',
    '  exit 1',
    '}',
    '',
  ].join('\r\n');
}
function shell(script: string, values: Record<string, string>) {
  if (process.platform !== 'win32') throw Object.assign(new Error('Windows 原生启动器必须在 Windows 验证。'), {code: 'harness_launcher_platform_unverified'});
  const result = spawnSync(powershell(), ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [Console]::OutputEncoding; ' + script], {
    encoding: 'utf8', timeout: 15000, env: {...process.env, ...values}, windowsHide: true,
  });
  if (result.error || result.status !== 0) throw result.error ?? new Error('harness_windows_shortcut_failed');
  return result.stdout.trim();
}
function shortcut(target: string) {
  return JSON.parse(shell('$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:BUILDR_HARNESS_SHORTCUT); @{target=$s.TargetPath;arguments=$s.Arguments}|ConvertTo-Json -Compress', {BUILDR_HARNESS_SHORTCUT: target}));
}
export function readWindowsHarnessLauncher(target: string): {binding: HarnessLauncherBinding; revision: string} | null {
  const exists = fs.existsSync(target), sidecar = directory(target);
  if (!exists && !fs.existsSync(sidecar)) return null;
  const marker = windowsBindingPath(target), runner = runnerPath(target);
  if (!exists || !fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink()
    || !fs.lstatSync(sidecar, {throwIfNoEntry: false})?.isDirectory() || fs.lstatSync(sidecar).isSymbolicLink()
    || !fs.lstatSync(marker, {throwIfNoEntry: false})?.isFile() || fs.lstatSync(marker).isSymbolicLink()
    || !fs.lstatSync(runner, {throwIfNoEntry: false})?.isFile() || fs.lstatSync(runner).isSymbolicLink()) invalidLauncher('Windows 同名入口或不完整旁文件不属于当前可核对安装，未覆盖。');
  const text = fs.readFileSync(marker, 'utf8'), binding = parseLauncherBinding(text, target);
  if (binding.platform !== 'win32' || fs.readFileSync(runner, 'utf8') !== windowsHarnessRunner()) invalidLauncher('Windows 启动器包装程序已变化。');
  const value = shortcut(target);
  if (path.resolve(value.target).toLowerCase() !== path.resolve(powershell()).toLowerCase()
    || value.arguments !== windowsHarnessArguments(runner)) invalidLauncher('Windows 快捷方式目标或参数已漂移。');
  return {binding, revision: launcherDigest(text)};
}
export function installWindowsHarnessLauncher(binding: HarnessLauncherBinding) {
  const target = binding.target;
  if (!target.toLowerCase().endsWith('.lnk') || /["\0\r\n]/u.test(target)) invalidLauncher('请选择准确的 Windows .lnk 目标。');
  const previous = readWindowsHarnessLauncher(target), sidecar = directory(target);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const stage = fs.mkdtempSync(path.join(path.dirname(target), '.harness-launcher-'));
  const stagedDirectory = path.join(stage, 'binding'), stagedShortcut = path.join(stage, 'launcher.lnk');
  const backupDirectory = path.join(stage, 'old-binding'), backupShortcut = path.join(stage, 'old-launcher.lnk');
  let movedDirectory = false, movedShortcut = false, committed = false;
  try {
    fs.mkdirSync(stagedDirectory);
    fs.writeFileSync(path.join(stagedDirectory, 'harness-launcher.json'), JSON.stringify(binding) + '\n', {mode: 0o600});
    fs.writeFileSync(path.join(stagedDirectory, 'harness-launcher.ps1'), windowsHarnessRunner(), 'utf8');
    shell('$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:BUILDR_HARNESS_SHORTCUT); $s.TargetPath=$env:BUILDR_HARNESS_HOST; $s.Arguments=$env:BUILDR_HARNESS_ARGUMENTS; $s.Description="Buildr Harness"; $s.Save()', {
      BUILDR_HARNESS_SHORTCUT: stagedShortcut, BUILDR_HARNESS_HOST: powershell(), BUILDR_HARNESS_ARGUMENTS: windowsHarnessArguments(runnerPath(target)),
    });
    if (readWindowsHarnessLauncher(target)?.revision !== previous?.revision) invalidLauncher('启动器在准备期间变化，未覆盖。');
    try {
      if (previous) {fs.renameSync(target, backupShortcut); fs.renameSync(sidecar, backupDirectory);}
      fs.renameSync(stagedDirectory, sidecar); movedDirectory = true;
      fs.renameSync(stagedShortcut, target); movedShortcut = true;
      readWindowsHarnessLauncher(target); committed = true;
    } catch (error) {
      if (movedShortcut) fs.unlinkSync(target);
      if (movedDirectory) fs.rmSync(sidecar, {recursive: true});
      if (fs.existsSync(backupDirectory)) fs.renameSync(backupDirectory, sidecar);
      if (fs.existsSync(backupShortcut)) fs.renameSync(backupShortcut, target);
      throw error;
    }
    return {status: 'installed', binding};
  } finally {
    // Preserve recovery backups if a rollback itself was interrupted.
    if (committed || !fs.existsSync(backupShortcut) && !fs.existsSync(backupDirectory)) fs.rmSync(stage, {recursive: true, force: true});
  }
}
export function uninstallWindowsHarnessLauncher(target: string) {
  const current = readWindowsHarnessLauncher(target);
  if (!current) return {status: 'absent'};
  if (readWindowsHarnessLauncher(target)?.revision !== current.revision) invalidLauncher('启动器已变化，未删除。');
  fs.unlinkSync(target);
  fs.rmSync(directory(target), {recursive: true});
  return {status: 'removed', dataPreserved: true};
}
