#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PRODUCT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ASSET_ROOT = path.join(PRODUCT_ROOT, 'package', 'launchers', 'assets');
function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

function shellQuote(value) { return `'${String(value).replaceAll("'", "'\\''")}'`; }
function commandValue(value) { return String(value).replaceAll('%', '%%').replaceAll('"', '""'); }

function assertFreshOutput(output) {
  if (fs.existsSync(output) && fs.readdirSync(output).length > 0) throw new Error(`Launcher staging output must be new or empty: ${output}`);
}

function writeIdentity(file, identity) { fs.writeFileSync(file, `${JSON.stringify(identity, null, 2)}\n`); }

function assertDevelopmentIdentity(identity) {
  if (!identity || identity.schemaVersion !== 'buildr.launcher-identity/v1') throw new Error('Launcher identity is required.');
  if (identity.channel !== 'development') throw new Error('Formal npm Buildr Web Launcher is installed only by `buildr web launcher install`; package/launchers is development-only.');
  if (identity.runtimeRole !== 'development' || identity.protocolIdentity !== 'buildr.web-protocol/v1') throw new Error('Development launcher requires matching development runtime role and Web protocol identity.');
  if (!path.isAbsolute(identity.sourceRoot) || !identity.developmentRuntime?.executable || !identity.developmentRuntime?.version || !identity.developmentRuntime?.identity) {
    throw new Error('Development launcher source and development host runtime identity are required.');
  }
  if (!fs.existsSync(identity.developmentRuntime.executable)) throw new Error(`Development host Node runtime not found: ${identity.developmentRuntime.executable}`);
}

function buildMac(output, identity) {
  const root = path.join(output, 'Buildr Web Dev.app', 'Contents');
  const executableRoot = path.join(root, 'MacOS');
  const resources = path.join(root, 'Resources');
  fs.mkdirSync(executableRoot, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });
  fs.copyFileSync(path.join(ASSET_ROOT, 'Buildr.icns'), path.join(resources, 'Buildr.icns'));
  writeIdentity(path.join(resources, 'launcher-identity.json'), identity);
  const cliEntry = path.join(identity.sourceRoot, 'bin', 'buildr.mjs');
  fs.writeFileSync(path.join(executableRoot, 'Buildr'), `#!/bin/sh\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nIDENTITY="$HERE/../Resources/launcher-identity.json"\nLOG_DIR="\${HOME}/Library/Logs/Buildr Dev"\nLOG_FILE="$LOG_DIR/launcher.log"\nSOURCE_ROOT=${shellQuote(identity.sourceRoot)}\nNODE_EXECUTABLE=${shellQuote(identity.developmentRuntime.executable)}\nEXPECTED_NODE_VERSION=${shellQuote(identity.developmentRuntime.version)}\nCLI_ENTRY=${shellQuote(cliEntry)}\nmkdir -p "$LOG_DIR"\nif [ ! -d "$SOURCE_ROOT" ] || [ ! -f "$CLI_ENTRY" ] || [ ! -f "$SOURCE_ROOT/package.json" ] || [ ! -d "$SOURCE_ROOT/src" ] || [ ! -d "$SOURCE_ROOT/package" ]; then\n  echo "Buildr Web Dev checkout 不可用：$SOURCE_ROOT。请在保留的Buildr checkout中重新运行 npm run install:development。" >&2\n  exit 1\nfi\nif [ ! -x "$NODE_EXECUTABLE" ]; then\n  echo "Buildr Web Dev development host Node 不可用：$NODE_EXECUTABLE。请使用 identity 绑定的兼容 Node 重新安装 Launcher。" >&2\n  exit 1\nfi\nACTUAL_NODE_VERSION=$("$NODE_EXECUTABLE" -p 'process.versions.node' 2>&1)\nif [ "$ACTUAL_NODE_VERSION" != "$EXPECTED_NODE_VERSION" ]; then\n  echo "Buildr Web Dev development host Node 版本不匹配：期望 $EXPECTED_NODE_VERSION，实际 $ACTUAL_NODE_VERSION。请重新安装 Launcher。" >&2\n  exit 1\nfi\nBUILDR_LAUNCHER_IDENTITY="$IDENTITY" /usr/bin/nohup "$NODE_EXECUTABLE" "$CLI_ENTRY" web --port 0 >"$LOG_FILE" 2>&1 &\nexit 0\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleName</key><string>Buildr Web Dev</string><key>CFBundleDisplayName</key><string>Buildr Web Dev</string><key>CFBundleIdentifier</key><string>ai.buildr.local-app.dev</string><key>CFBundleShortVersionString</key><string>${identity.version}</string><key>CFBundleVersion</key><string>${identity.buildNumber}</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleExecutable</key><string>Buildr</string><key>CFBundleIconFile</key><string>Buildr.icns</string><key>LSUIElement</key><true/></dict></plist>\n`);
  return path.dirname(root);
}

function buildWindows(output, identity) {
  const root = path.join(output, 'Buildr Web Dev');
  fs.mkdirSync(root, { recursive: true });
  fs.copyFileSync(path.join(ASSET_ROOT, 'Buildr.ico'), path.join(root, 'Buildr.ico'));
  writeIdentity(path.join(root, 'launcher-identity.json'), identity);
  const cliEntry = path.win32.join(identity.sourceRoot, 'bin', 'buildr.mjs');
  fs.writeFileSync(path.join(root, 'Launch-Buildr.cmd'), `@echo off\nset "BUILDR_LAUNCHER_IDENTITY=%~dp0launcher-identity.json"\nset "SOURCE_ROOT=${commandValue(identity.sourceRoot)}"\nset "NODE_EXECUTABLE=${commandValue(identity.developmentRuntime.executable)}"\nset "CLI_ENTRY=${commandValue(cliEntry)}"\nset "EXPECTED_NODE_VERSION=${commandValue(identity.developmentRuntime.version)}"\nif not exist "%LOCALAPPDATA%\\Buildr Dev\\Logs" mkdir "%LOCALAPPDATA%\\Buildr Dev\\Logs"\nif not exist "%CLI_ENTRY%" (\n  echo Buildr Web Dev checkout 不可用：%SOURCE_ROOT%。请重新安装 Launcher。 1>&2\n  exit /b 1\n)\nif not exist "%NODE_EXECUTABLE%" (\n  echo Buildr Web Dev development host Node 不可用：%NODE_EXECUTABLE%。 1>&2\n  exit /b 1\n)\nfor /f "delims=" %%V in ('"%NODE_EXECUTABLE%" -p "process.versions.node" 2^>^&1') do set "ACTUAL_NODE_VERSION=%%V"\nif not "%ACTUAL_NODE_VERSION%"=="%EXPECTED_NODE_VERSION%" exit /b 1\n"%NODE_EXECUTABLE%" "%CLI_ENTRY%" web --port 0 >>"%LOCALAPPDATA%\\Buildr Dev\\Logs\\launcher.log" 2>&1\nexit /b %ERRORLEVEL%\n`);
  fs.writeFileSync(path.join(root, 'Buildr.vbs'), Buffer.from(`\uFEFFSet shell = CreateObject("WScript.Shell")\nbase = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)\ncommand = Chr(34) & base & "\\Launch-Buildr.cmd" & Chr(34)\nexitCode = shell.Run(command, 0, True)\nIf exitCode <> 0 Then MsgBox "Buildr Web Dev 无法启动。", 16, "Buildr Web Dev"\n`, 'utf16le'));
  fs.writeFileSync(path.join(root, 'Install-Buildr-Shortcuts.ps1'), `﻿$ErrorActionPreference = "Stop"\n$root = Split-Path -Parent $MyInvocation.MyCommand.Path\n$start = Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs"\n$shell = New-Object -ComObject WScript.Shell\n$shortcutPath = Join-Path $start "Buildr Web Dev.lnk"\n$expectedScript = [IO.Path]::GetFullPath((Join-Path $root "Buildr.vbs"))\nif (Test-Path -LiteralPath $shortcutPath) {\n  $existing = $shell.CreateShortcut($shortcutPath)\n  $existingScript = $existing.Arguments.Trim().Trim([char]34)\n  $owned = ([IO.Path]::GetFileName($existing.TargetPath) -ieq "wscript.exe") -and ([IO.Path]::GetFullPath($existingScript) -ieq $expectedScript)\n  if (-not $owned) { throw "Refusing to overwrite shortcut without matching Buildr ownership: $shortcutPath" }\n}\n$shortcut = $shell.CreateShortcut($shortcutPath)\n$shortcut.TargetPath = "$env:WINDIR\\System32\\wscript.exe"\n$shortcut.Arguments = '"' + (Join-Path $root "Buildr.vbs") + '"'\n$shortcut.WorkingDirectory = $root\n$shortcut.IconLocation = (Join-Path $root "Buildr.ico") + ",0"\n$shortcut.Description = "打开 Buildr Web Dev"\n$shortcut.Save()\n`);
  return root;
}

export function buildLauncher({ platform = process.platform, output, identity }) {
  if (!['darwin', 'win32'].includes(platform)) throw new Error(`Unsupported launcher platform: ${platform}`);
  assertDevelopmentIdentity(identity);
  assertFreshOutput(output);
  fs.mkdirSync(output, { recursive: true });
  return platform === 'darwin' ? buildMac(output, identity) : buildWindows(output, identity);
}

async function main(args = process.argv.slice(2)) {
  const packageData = JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, 'package.json'), 'utf8'));
  const channel = option(args, '--channel', 'development');
  if (channel !== 'development') throw new Error('package/launchers only builds Buildr Web Dev; use `buildr web launcher install` from a verified npm installation for the formal local Launcher.');
  const runtime = path.resolve(option(args, '--runtime', process.execPath));
  const version = spawnSync(runtime, ['-p', 'process.versions.node'], { encoding: 'utf8' }).stdout.trim();
  const sourceRoot = path.resolve(option(args, '--source-root', PRODUCT_ROOT));
  const identity = {
    schemaVersion: 'buildr.launcher-identity/v1', version: packageData.version, channel: 'development', runtimeRole: 'development', source: 'checkout',
    buildId: option(args, '--build-id', packageData.version), buildNumber: option(args, '--build-number', '1'), protocolVersion: 1, protocolIdentity: 'buildr.web-protocol/v1',
    platform: option(args, '--platform', process.platform), builtAt: new Date().toISOString(), sourceRoot,
    developmentRuntime: { executable: runtime, version, source: 'development-host', identity: `development-host:${fs.realpathSync(runtime)}:${version}` },
  };
  const output = path.resolve(option(args, '--output', path.join(PRODUCT_ROOT, 'dist', 'launcher', `development-${identity.buildId}`)));
  console.log(buildLauncher({ platform: identity.platform, output, identity }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
