#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PRODUCT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ASSET_ROOT = path.join(PRODUCT_ROOT, 'package', 'launchers', 'assets');
const DEVELOPMENT_APP_PORT = 4317;

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

function copyApplication(target) {
  fs.mkdirSync(target, { recursive: true });
  for (const item of ['bin', 'src', 'package', 'package.json', 'LICENSE']) fs.cpSync(path.join(PRODUCT_ROOT, item), path.join(target, item), { recursive: true });
  const modules = path.join(target, 'node_modules');
  fs.mkdirSync(modules, { recursive: true });
  fs.cpSync(path.join(PRODUCT_ROOT, 'node_modules', 'yaml'), path.join(modules, 'yaml'), { recursive: true });
}

function assertFreshOutput(output) {
  if (!fs.existsSync(output)) return;
  if (fs.readdirSync(output).length > 0) throw new Error(`Launcher staging output must be new or empty: ${output}`);
}

function writeIdentity(file, identity) {
  fs.writeFileSync(file, `${JSON.stringify(identity, null, 2)}\n`);
}

function appPortArgs(identity) {
  return identity.channel === 'development' ? ` --port ${DEVELOPMENT_APP_PORT}` : '';
}

function buildMac(output, runtime, identity) {
  const appName = identity.channel === 'development' ? 'Buildr Dev' : 'Buildr';
  const root = path.join(output, `${appName}.app`, 'Contents');
  const executableRoot = path.join(root, 'MacOS');
  const resources = path.join(root, 'Resources');
  fs.mkdirSync(executableRoot, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });
  fs.copyFileSync(runtime, path.join(executableRoot, 'node'));
  fs.chmodSync(path.join(executableRoot, 'node'), 0o755);
  fs.copyFileSync(path.join(ASSET_ROOT, 'Buildr.icns'), path.join(resources, 'Buildr.icns'));
  copyApplication(path.join(resources, 'buildr'));
  writeIdentity(path.join(resources, 'launcher-identity.json'), identity);
  fs.writeFileSync(path.join(executableRoot, 'Buildr'), `#!/bin/sh\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nIDENTITY="$HERE/../Resources/launcher-identity.json"\nLOG_DIR="\${HOME}/Library/Logs/Buildr"\nLOG_FILE="$LOG_DIR/launcher.log"\nmkdir -p "$LOG_DIR"\n# This bundle is a launcher, not the long-running Web application itself.\n# Return control to LaunchServices after spawning the local server; otherwise\n# Finder considers the shell process to be an unresponsive App.\nBUILDR_LAUNCHER_IDENTITY="$IDENTITY" /usr/bin/nohup "$HERE/node" "$HERE/../Resources/buildr/bin/buildr.mjs" app${appPortArgs(identity)} >"$LOG_FILE" 2>&1 &\nexit 0\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleName</key><string>${appName}</string><key>CFBundleDisplayName</key><string>${appName}</string><key>CFBundleIdentifier</key><string>${identity.channel === 'development' ? 'ai.buildr.local-app.dev' : 'ai.buildr.local-app'}</string><key>CFBundleShortVersionString</key><string>${identity.version}</string><key>CFBundleVersion</key><string>${identity.buildNumber}</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleExecutable</key><string>Buildr</string><key>CFBundleIconFile</key><string>Buildr.icns</string><key>LSUIElement</key><true/></dict></plist>\n`);
  return path.dirname(root);
}

function buildWindows(output, runtime, identity) {
  const appName = identity.channel === 'development' ? 'Buildr Dev' : 'Buildr';
  const root = path.join(output, appName);
  const runtimeRoot = path.join(root, 'runtime');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.copyFileSync(runtime, path.join(runtimeRoot, 'node.exe'));
  fs.copyFileSync(path.join(ASSET_ROOT, 'Buildr.ico'), path.join(root, 'Buildr.ico'));
  copyApplication(path.join(root, 'app'));
  writeIdentity(path.join(root, 'launcher-identity.json'), identity);
  fs.writeFileSync(path.join(root, 'Launch-Buildr.cmd'), `@echo off\nset "BUILDR_LAUNCHER_IDENTITY=%~dp0launcher-identity.json"\nif not exist "%LOCALAPPDATA%\\Buildr\\Logs" mkdir "%LOCALAPPDATA%\\Buildr\\Logs"\n"%~dp0runtime\\node.exe" "%~dp0app\\bin\\buildr.mjs" app${appPortArgs(identity)} >>"%LOCALAPPDATA%\\Buildr\\Logs\\launcher.log" 2>&1\nexit /b %ERRORLEVEL%\n`);
  fs.writeFileSync(path.join(root, 'Buildr.vbs'), Buffer.from(`\uFEFFSet shell = CreateObject("WScript.Shell")\nbase = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)\ncommand = Chr(34) & base & "\\Launch-Buildr.cmd" & Chr(34)\nexitCode = shell.Run(command, 0, True)\nIf exitCode <> 0 Then\n  MsgBox "Buildr 无法启动。请重新打开；如果仍然失败，请查看 %LOCALAPPDATA%\\Buildr\\Logs\\launcher.log。", 16, "Buildr"\nEnd If\n`, 'utf16le'));
  fs.writeFileSync(path.join(root, 'Install-Buildr-Shortcuts.ps1'), `﻿$ErrorActionPreference = "Stop"\n$root = Split-Path -Parent $MyInvocation.MyCommand.Path\n$start = Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs"\n$folders = @($start)\nif ($args -contains "--desktop") { $folders += [Environment]::GetFolderPath("Desktop") }\n$shell = New-Object -ComObject WScript.Shell\nforeach ($folder in $folders) {\n  $shortcut = $shell.CreateShortcut((Join-Path $folder "${appName}.lnk"))\n  $shortcut.TargetPath = "$env:WINDIR\\System32\\wscript.exe"\n  $shortcut.Arguments = '"' + (Join-Path $root "Buildr.vbs") + '"'\n  $shortcut.WorkingDirectory = $root\n  $shortcut.IconLocation = (Join-Path $root "Buildr.ico") + ",0"\n  $shortcut.Description = "打开 Buildr 本机 Web 应用"\n  $shortcut.Save()\n}\nWrite-Host "${appName} 已添加到开始菜单。"\n`);
  fs.writeFileSync(path.join(root, 'Install Buildr.cmd'), `@echo off\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Buildr-Shortcuts.ps1" %*\npause\n`);
  return root;
}

export function buildLauncher({ platform = process.platform, output, runtime = process.execPath, identity }) {
  if (!['darwin', 'win32'].includes(platform)) throw new Error(`Unsupported launcher platform: ${platform}`);
  if (!fs.existsSync(runtime)) throw new Error(`Node runtime not found: ${runtime}`);
  if (!identity || identity.schemaVersion !== 'buildr.launcher-identity/v1') throw new Error('Launcher identity is required.');
  assertFreshOutput(output);
  fs.mkdirSync(output, { recursive: true });
  return platform === 'darwin' ? buildMac(output, runtime, identity) : buildWindows(output, runtime, identity);
}

async function main(args = process.argv.slice(2)) {
  const packageData = JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, 'package.json'), 'utf8'));
  const channel = option(args, '--channel', 'release');
  const identity = {
    schemaVersion: 'buildr.launcher-identity/v1', version: packageData.version, channel,
    source: option(args, '--source', channel === 'development' ? 'checkout' : 'release'),
    buildId: option(args, '--build-id', packageData.version), buildNumber: option(args, '--build-number', '1'),
    protocolVersion: 1, platform: option(args, '--platform', process.platform), builtAt: new Date().toISOString(),
  };
  const output = path.resolve(option(args, '--output', path.join(PRODUCT_ROOT, 'dist', 'launcher', `${channel}-${identity.buildId}`)));
  console.log(buildLauncher({ platform: identity.platform, output, runtime: path.resolve(option(args, '--runtime', process.execPath)), identity }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
