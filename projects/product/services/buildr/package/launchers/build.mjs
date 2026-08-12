#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
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
  const webDist = path.join(PRODUCT_ROOT, 'src', 'interfaces', 'local-app', 'web-dist', 'index.html');
  if (!fs.existsSync(webDist)) {
    throw new Error('Buildr Web Launcher 需要正式 Web dist；请先在 services/buildr 运行 npm run build:web（会构建 sibling Buildr Web Frontend Service 并写入 web-dist）。');
  }
  fs.mkdirSync(target, { recursive: true });
  for (const item of ['bin', 'src', 'package', 'package.json', 'LICENSE']) fs.cpSync(path.join(PRODUCT_ROOT, item), path.join(target, item), { recursive: true });
  const modules = path.join(target, 'node_modules');
  fs.mkdirSync(modules, { recursive: true });
  fs.cpSync(path.join(PRODUCT_ROOT, 'node_modules', 'yaml'), path.join(modules, 'yaml'), { recursive: true });
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function commandValue(value) {
  return String(value).replaceAll('%', '%%').replaceAll('"', '""');
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

function darwinTool(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout;
}

function machoDependencies(file) {
  return darwinTool('otool', ['-L', file])
    .split('\n')
    .slice(1)
    .map((line) => line.match(/^\s+(\S+)\s+\(/)?.[1])
    .filter(Boolean);
}

function machoRpaths(file) {
  const lines = darwinTool('otool', ['-l', file]).split('\n');
  const rpaths = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes('LC_RPATH')) {
      const match = lines.slice(index, index + 6).join('\n').match(/path (\S+) \(/);
      if (match) rpaths.push(match[1]);
    }
  }
  return rpaths;
}

function expandMachPath(value, { loader, executable }) {
  return value
    .replaceAll('@loader_path', path.dirname(loader))
    .replaceAll('@executable_path', path.dirname(executable));
}

function resolveMachDependency(reference, loader, executable) {
  const candidates = reference.startsWith('@rpath/')
    ? machoRpaths(loader).map((rpath) => path.join(expandMachPath(rpath, { loader, executable }), reference.slice('@rpath/'.length)))
    : [expandMachPath(reference, { loader, executable })];
  return candidates.map((candidate) => path.resolve(candidate)).find((candidate) => fs.existsSync(candidate)) || null;
}

function isSystemMachLibrary(file) {
  const resolved = path.resolve(file);
  return resolved === '/usr/lib' || resolved.startsWith('/usr/lib/') || resolved === '/System' || resolved.startsWith('/System/');
}

function bundleDarwinRuntime(runtime, executableRoot) {
  if (process.platform !== 'darwin') throw new Error('Building a darwin launcher requires macOS otool and install_name_tool.');
  const executable = path.join(executableRoot, 'node');
  const bundled = new Map();
  const destinations = new Map();
  const queue = [path.resolve(runtime)];
  const changes = [];
  while (queue.length) {
    const loader = queue.shift();
    for (const reference of machoDependencies(loader)) {
      const resolved = resolveMachDependency(reference, loader, executable);
      if (!resolved || isSystemMachLibrary(resolved)) continue;
      const real = fs.realpathSync(resolved);
      const destination = path.join(executableRoot, path.basename(real));
      const existing = bundled.get(real);
      const destinationOwner = destinations.get(destination);
      if ((existing && existing !== destination) || (destinationOwner && destinationOwner !== real)) {
        throw new Error(`Duplicate bundled macOS runtime dependency name: ${path.basename(real)}`);
      }
      if (!existing) {
        bundled.set(real, destination);
        destinations.set(destination, real);
        fs.copyFileSync(real, destination);
        fs.chmodSync(destination, 0o644);
        queue.push(real);
      }
      changes.push({ loader, reference, destination: `@loader_path/${path.basename(real)}` });
    }
  }
  for (const destination of bundled.values()) {
    if (path.extname(destination) === '.dylib') darwinTool('install_name_tool', ['-id', `@loader_path/${path.basename(destination)}`, destination]);
  }
  for (const change of changes) {
    const target = change.loader === path.resolve(runtime) ? executable : bundled.get(fs.realpathSync(change.loader));
    if (!target) throw new Error(`Unable to locate bundled loader for ${change.loader}`);
    darwinTool('install_name_tool', ['-change', change.reference, change.destination, target]);
  }
  for (const destination of bundled.values()) darwinTool('codesign', ['--force', '--sign', '-', '--timestamp=none', destination]);
  darwinTool('codesign', ['--force', '--sign', '-', '--timestamp=none', executable]);
  return [...bundled.values()];
}

function buildMac(output, runtime, identity) {
  const appName = identity.channel === 'development' ? 'Buildr Web Dev' : 'Buildr Web';
  const root = path.join(output, `${appName}.app`, 'Contents');
  const executableRoot = path.join(root, 'MacOS');
  const resources = path.join(root, 'Resources');
  fs.mkdirSync(executableRoot, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });
  fs.copyFileSync(path.join(ASSET_ROOT, 'Buildr.icns'), path.join(resources, 'Buildr.icns'));
  writeIdentity(path.join(resources, 'launcher-identity.json'), identity);
  if (identity.channel === 'development') {
    const cliEntry = path.join(identity.sourceRoot, 'bin', 'buildr.mjs');
    fs.writeFileSync(path.join(executableRoot, 'Buildr'), `#!/bin/sh\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nIDENTITY="$HERE/../Resources/launcher-identity.json"\nLOG_DIR="\${HOME}/Library/Logs/Buildr"\nLOG_FILE="$LOG_DIR/launcher.log"\nSOURCE_ROOT=${shellQuote(identity.sourceRoot)}\nNODE_EXECUTABLE=${shellQuote(identity.nodeRuntime.executable)}\nEXPECTED_NODE_VERSION=${shellQuote(identity.nodeRuntime.version)}\nCLI_ENTRY=${shellQuote(cliEntry)}\nmkdir -p "$LOG_DIR"\nif [ ! -d "$SOURCE_ROOT" ] || [ ! -f "$CLI_ENTRY" ] || [ ! -f "$SOURCE_ROOT/package.json" ] || [ ! -d "$SOURCE_ROOT/src" ] || [ ! -d "$SOURCE_ROOT/package" ]; then\n  echo "Buildr Web Dev checkout 不可用：$SOURCE_ROOT。请重新运行 buildr web launcher install --channel development。" >&2\n  exit 1\nfi\nif [ ! -x "$NODE_EXECUTABLE" ]; then\n  echo "Buildr Web Dev Workspace Node 不可用：$NODE_EXECUTABLE。请先运行 buildr sync，再重新安装 Launcher。" >&2\n  exit 1\nfi\nACTUAL_NODE_VERSION=$("$NODE_EXECUTABLE" -p 'process.versions.node' 2>&1)\nif [ "$ACTUAL_NODE_VERSION" != "$EXPECTED_NODE_VERSION" ]; then\n  echo "Buildr Web Dev Workspace Node 版本不匹配：期望 $EXPECTED_NODE_VERSION，实际 $ACTUAL_NODE_VERSION。请重新运行 buildr sync。" >&2\n  exit 1\nfi\n# This bundle is a launcher, not the long-running Web application itself.\n# Return control to LaunchServices after spawning the local server.\nBUILDR_LAUNCHER_IDENTITY="$IDENTITY" /usr/bin/nohup "$NODE_EXECUTABLE" "$CLI_ENTRY" web${appPortArgs(identity)} >"$LOG_FILE" 2>&1 &\nexit 0\n`, { mode: 0o755 });
  } else {
    fs.copyFileSync(runtime, path.join(executableRoot, 'node'));
    fs.chmodSync(path.join(executableRoot, 'node'), 0o755);
    bundleDarwinRuntime(runtime, executableRoot);
    copyApplication(path.join(resources, 'buildr'));
    fs.writeFileSync(path.join(executableRoot, 'Buildr'), `#!/bin/sh\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nIDENTITY="$HERE/../Resources/launcher-identity.json"\nLOG_DIR="\${HOME}/Library/Logs/Buildr"\nLOG_FILE="$LOG_DIR/launcher.log"\nmkdir -p "$LOG_DIR"\n# This bundle is a launcher, not the long-running Web application itself.\n# Return control to LaunchServices after spawning the local server; otherwise\n# Finder considers the shell process to be an unresponsive App.\nBUILDR_LAUNCHER_IDENTITY="$IDENTITY" /usr/bin/nohup "$HERE/node" "$HERE/../Resources/buildr/bin/buildr.mjs" web${appPortArgs(identity)} >"$LOG_FILE" 2>&1 &\nexit 0\n`, { mode: 0o755 });
  }
  fs.writeFileSync(path.join(root, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleName</key><string>${appName}</string><key>CFBundleDisplayName</key><string>${appName}</string><key>CFBundleIdentifier</key><string>${identity.channel === 'development' ? 'ai.buildr.local-app.dev' : 'ai.buildr.local-app'}</string><key>CFBundleShortVersionString</key><string>${identity.version}</string><key>CFBundleVersion</key><string>${identity.buildNumber}</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleExecutable</key><string>Buildr</string><key>CFBundleIconFile</key><string>Buildr.icns</string><key>LSUIElement</key><true/></dict></plist>\n`);
  return path.dirname(root);
}

function buildWindows(output, runtime, identity) {
  const appName = identity.channel === 'development' ? 'Buildr Web Dev' : 'Buildr Web';
  const root = path.join(output, appName);
  fs.mkdirSync(root, { recursive: true });
  fs.copyFileSync(path.join(ASSET_ROOT, 'Buildr.ico'), path.join(root, 'Buildr.ico'));
  writeIdentity(path.join(root, 'launcher-identity.json'), identity);
  if (identity.channel === 'development') {
    const cliEntry = path.win32.join(identity.sourceRoot, 'bin', 'buildr.mjs');
    fs.writeFileSync(path.join(root, 'Launch-Buildr.cmd'), `@echo off\nset "BUILDR_LAUNCHER_IDENTITY=%~dp0launcher-identity.json"\nset "SOURCE_ROOT=${commandValue(identity.sourceRoot)}"\nset "NODE_EXECUTABLE=${commandValue(identity.nodeRuntime.executable)}"\nset "CLI_ENTRY=${commandValue(cliEntry)}"\nset "EXPECTED_NODE_VERSION=${commandValue(identity.nodeRuntime.version)}"\nif not exist "%LOCALAPPDATA%\\Buildr\\Logs" mkdir "%LOCALAPPDATA%\\Buildr\\Logs"\nif not exist "%CLI_ENTRY%" (\n  echo Buildr Web Dev checkout 不可用：%SOURCE_ROOT%。请重新运行 buildr web launcher install --channel development。 1>&2\n  exit /b 1\n)\nif not exist "%SOURCE_ROOT%\\package.json" (\n  echo Buildr Web Dev Service checkout 不完整：%SOURCE_ROOT%。请重新运行 buildr web launcher install --channel development。 1>&2\n  exit /b 1\n)\nif not exist "%NODE_EXECUTABLE%" (\n  echo Buildr Web Dev Workspace Node 不可用：%NODE_EXECUTABLE%。请先运行 buildr sync，再重新安装 Launcher。 1>&2\n  exit /b 1\n)\nfor /f "delims=" %%V in ('"%NODE_EXECUTABLE%" -p "process.versions.node" 2^>^&1') do set "ACTUAL_NODE_VERSION=%%V"\nif not "%ACTUAL_NODE_VERSION%"=="%EXPECTED_NODE_VERSION%" (\n  echo Buildr Web Dev Workspace Node 版本不匹配，请重新运行 buildr sync。 1>&2\n  exit /b 1\n)\n"%NODE_EXECUTABLE%" "%CLI_ENTRY%" web${appPortArgs(identity)} >>"%LOCALAPPDATA%\\Buildr\\Logs\\launcher.log" 2>&1\nexit /b %ERRORLEVEL%\n`);
  } else {
    const runtimeRoot = path.join(root, 'runtime');
    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.copyFileSync(runtime, path.join(runtimeRoot, 'node.exe'));
    copyApplication(path.join(root, 'app'));
    fs.writeFileSync(path.join(root, 'Launch-Buildr.cmd'), `@echo off\nset "BUILDR_LAUNCHER_IDENTITY=%~dp0launcher-identity.json"\nif not exist "%LOCALAPPDATA%\\Buildr\\Logs" mkdir "%LOCALAPPDATA%\\Buildr\\Logs"\n"%~dp0runtime\\node.exe" "%~dp0app\\bin\\buildr.mjs" web${appPortArgs(identity)} >>"%LOCALAPPDATA%\\Buildr\\Logs\\launcher.log" 2>&1\nexit /b %ERRORLEVEL%\n`);
  }
  fs.writeFileSync(path.join(root, 'Buildr.vbs'), Buffer.from(`\uFEFFSet shell = CreateObject("WScript.Shell")\nbase = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)\ncommand = Chr(34) & base & "\\Launch-Buildr.cmd" & Chr(34)\nexitCode = shell.Run(command, 0, True)\nIf exitCode <> 0 Then\n  MsgBox "Buildr Web 无法启动。请重新打开；如果仍然失败，请查看 %LOCALAPPDATA%\\Buildr\\Logs\\launcher.log。", 16, "Buildr Web"\nEnd If\n`, 'utf16le'));
  fs.writeFileSync(path.join(root, 'Install-Buildr-Shortcuts.ps1'), `﻿$ErrorActionPreference = "Stop"\n$root = Split-Path -Parent $MyInvocation.MyCommand.Path\n$start = Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs"\n$folders = @($start)\nif ($args -contains "--desktop") { $folders += [Environment]::GetFolderPath("Desktop") }\n$shell = New-Object -ComObject WScript.Shell\nforeach ($folder in $folders) {\n  $shortcutPath = Join-Path $folder "${appName}.lnk"\n  $expectedScript = [IO.Path]::GetFullPath((Join-Path $root "Buildr.vbs"))\n  if (Test-Path -LiteralPath $shortcutPath) {\n    $existing = $shell.CreateShortcut($shortcutPath)\n    $existingScript = $existing.Arguments.Trim().Trim([char]34)\n    $owned = ([IO.Path]::GetFileName($existing.TargetPath) -ieq "wscript.exe") -and ([IO.Path]::GetFullPath($existingScript) -ieq $expectedScript) -and ([IO.Path]::GetFullPath($existing.WorkingDirectory) -ieq [IO.Path]::GetFullPath($root))\n    if (-not $owned) { throw "Refusing to overwrite shortcut without matching Buildr ownership: $shortcutPath" }\n  }\n  $shortcut = $shell.CreateShortcut($shortcutPath)\n  $shortcut.TargetPath = "$env:WINDIR\\System32\\wscript.exe"\n  $shortcut.Arguments = '"' + (Join-Path $root "Buildr.vbs") + '"'\n  $shortcut.WorkingDirectory = $root\n  $shortcut.IconLocation = (Join-Path $root "Buildr.ico") + ",0"\n  $shortcut.Description = "打开 Buildr Web（本机 Web 界面）"\n  $shortcut.Save()\n}\nWrite-Host "${appName} 已添加到开始菜单。"\n`);
  fs.writeFileSync(path.join(root, 'Install Buildr.cmd'), `@echo off\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Buildr-Shortcuts.ps1" %*\npause\n`);
  return root;
}

export function buildLauncher({ platform = process.platform, output, runtime = process.execPath, identity }) {
  if (!['darwin', 'win32'].includes(platform)) throw new Error(`Unsupported launcher platform: ${platform}`);
  if (!identity || identity.schemaVersion !== 'buildr.launcher-identity/v1') throw new Error('Launcher identity is required.');
  if (identity.channel !== 'development' && !fs.existsSync(runtime)) throw new Error(`Node runtime not found: ${runtime}`);
  if (identity.channel === 'development') {
    if (!path.isAbsolute(identity.sourceRoot) || !identity.nodeRuntime?.executable || !identity.nodeRuntime?.version) throw new Error('Development launcher source and Workspace Node identity are required.');
    if (!fs.existsSync(identity.nodeRuntime.executable)) throw new Error(`Workspace Node runtime not found: ${identity.nodeRuntime.executable}`);
  }
  assertFreshOutput(output);
  fs.mkdirSync(output, { recursive: true });
  return platform === 'darwin' ? buildMac(output, runtime, identity) : buildWindows(output, runtime, identity);
}

async function main(args = process.argv.slice(2)) {
  const packageData = JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, 'package.json'), 'utf8'));
  const channel = option(args, '--channel', 'release');
  const runtime = path.resolve(option(args, '--runtime', process.execPath));
  const identity = {
    schemaVersion: 'buildr.launcher-identity/v1', version: packageData.version, channel,
    source: option(args, '--source', channel === 'development' ? 'checkout' : 'release'),
    buildId: option(args, '--build-id', packageData.version), buildNumber: option(args, '--build-number', '1'),
    protocolVersion: 1, platform: option(args, '--platform', process.platform), builtAt: new Date().toISOString(),
    ...(channel === 'development' ? {
      sourceRoot: path.resolve(option(args, '--source-root', PRODUCT_ROOT)),
      nodeRuntime: { executable: runtime, version: spawnSync(runtime, ['-p', 'process.versions.node'], { encoding: 'utf8' }).stdout.trim() },
    } : {}),
  };
  const output = path.resolve(option(args, '--output', path.join(PRODUCT_ROOT, 'dist', 'launcher', `${channel}-${identity.buildId}`)));
  console.log(buildLauncher({ platform: identity.platform, output, runtime, identity }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
