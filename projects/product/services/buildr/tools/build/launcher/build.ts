#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PRODUCT_ROOT: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ASSET_ROOT: any = path.join(PRODUCT_ROOT, 'resources', 'installation', 'launcher');
export const DEFAULT_DEVELOPMENT_LAUNCHER_WEB_PORT: any = 4458;
export const DEVELOPMENT_BUNDLE_IDENTIFIER: any = 'ai.buildr.web.dev';
export const LEGACY_DEVELOPMENT_BUNDLE_IDENTIFIERS: any = Object.freeze(['ai.buildr.local-app.dev']);
function option(args: any, name: any, fallback: any = null): any  {
  const index: any = args.indexOf(name);
  if (index === -1) return fallback;
  const value: any = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

function shellQuote(value: any): any  { return `'${String(value).replaceAll("'", "'\\''")}'`; }
function commandValue(value: any): any  { return String(value).replaceAll('%', '%%').replaceAll('"', '""'); }

function assertFreshOutput(output: any): any  {
  if (fs.existsSync(output) && fs.readdirSync(output).length > 0) throw new Error(`Launcher staging output must be new or empty: ${output}`);
}

function writeIdentity(file: any, identity: any): any  { fs.writeFileSync(file, `${JSON.stringify(identity, null, 2)}\n`); }

function assertDevelopmentIdentity(identity: any): any  {
  if (!identity || identity.schemaVersion !== 'buildr.launcher-identity/v1') throw new Error('Launcher identity is required.');
  if (identity.channel !== 'development') throw new Error('Formal npm Buildr Web Launcher is installed only by `buildr web launcher install`; tools/build/launcher is development-only.');
  if (identity.runtimeRole !== 'development' || identity.protocolIdentity !== 'buildr.web-protocol/v1') throw new Error('Development launcher requires matching development runtime role and Web protocol identity.');
  if (!path.isAbsolute(identity.sourceRoot) || !identity.developmentRuntime?.executable || !identity.developmentRuntime?.version || !identity.developmentRuntime?.identity) {
    throw new Error('Development launcher source and development host runtime identity are required.');
  }
  if (!fs.existsSync(identity.developmentRuntime.executable)) throw new Error(`Development host Node runtime not found: ${identity.developmentRuntime.executable}`);
}

const MAC_LAUNCHD_BOOTSTRAP_SCRIPT: string = [
  "const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');",
  "const jobsDir=process.env.BUILDR_LAUNCH_JOBS_DIR,logFile=process.env.BUILDR_LAUNCH_LOG,cwd=process.env.BUILDR_LAUNCH_CWD||process.cwd(),progArgs=process.argv.slice(1);",
  "if(!progArgs.length||!jobsDir||!logFile)process.exit(1);",
  "const run=(a,t=4000)=>{try{return{status:0,out:execFileSync('/bin/launchctl',a,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:t})};}catch(e){return{status:typeof e.status==='number'?e.status:1,out:''};}};",
  "const xml=s=>String(s).replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;').replaceAll(\"'\",'&apos;');",
  "const sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);",
  "fs.mkdirSync(jobsDir,{recursive:true,mode:0o700});",
  "for(const f of fs.readdirSync(jobsDir)){if(!f.endsWith('.json')||f.startsWith('.'))continue;const p=path.join(jobsDir,f);try{const r=JSON.parse(fs.readFileSync(p,'utf8'));const t=r.domain+'/'+r.label;const g=run(['print',t],2000);const st=/^\\tstate = (.+)$/m.exec(g.out)?.[1]?.trim();const pid=/^\\tpid = (\\d+)$/m.exec(g.out)?.[1];let alive=false;if(pid){try{process.kill(Number(pid),0);alive=true;}catch{}}if(g.status!==0||(!alive&&st!=='running'&&st!=='spawn scheduled')){if(g.status===0)run(['bootout',t],2000);fs.rmSync(p,{force:true});}}catch{fs.rmSync(p,{force:true});}}",
  "const label=`ai.buildr.web-dev.launcher.${process.pid}-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;",
  "const drop=new Set(['BUILDR_LAUNCH_JOBS_DIR','BUILDR_LAUNCH_LOG','BUILDR_LAUNCH_CWD','NODE_CHANNEL_FD','NODE_CHANNEL_SERIALIZATION_MODE']);",
  "const envXml=Object.entries(process.env).filter(([k,v])=>typeof v==='string'&&!drop.has(k)).map(([k,v])=>`    <key>${xml(k)}</key>\\n    <string>${xml(v)}</string>`).join('\\n');",
  "const plist=['<?xml version=\"1.0\" encoding=\"UTF-8\"?>','<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">','<plist version=\"1.0\">','<dict>','  <key>Label</key>',`  <string>${xml(label)}</string>`,'  <key>ProgramArguments</key>','  <array>',...progArgs.map(a=>`    <string>${xml(a)}</string>`),'  </array>','  <key>RunAtLoad</key>','  <true/>','  <key>KeepAlive</key>','  <false/>','  <key>ProcessType</key>','  <string>Interactive</string>','  <key>AbandonProcessGroup</key>','  <true/>','  <key>WorkingDirectory</key>',`  <string>${xml(cwd)}</string>`,'  <key>StandardOutPath</key>',`  <string>${xml(logFile)}</string>`,'  <key>StandardErrorPath</key>',`  <string>${xml(logFile)}</string>`,'  <key>EnvironmentVariables</key>','  <dict>',envXml,'  </dict>','</dict>','</plist>',''].join('\\n');",
  "const uid=typeof process.getuid==='function'?process.getuid():0,staging=path.join(jobsDir,`.staging-${label}.plist`);",
  "for(const domain of [`gui/${uid}`,`user/${uid}`]){let b;try{fs.writeFileSync(staging,plist,{mode:0o600});b=run(['bootstrap',domain,staging],5000);}finally{fs.rmSync(staging,{force:true});}if(b.status!==0)continue;const target=`${domain}/${label}`,end=Date.now()+1500;let pid;while(Date.now()<end){const g=run(['print',target],2000);if(g.status===0){const m=/^\\tpid = (\\d+)$/m.exec(g.out);if(m){pid=Number(m[1]);break;}const st=/^\\tstate = (.+)$/m.exec(g.out)?.[1]?.trim();const runs=Number(/^\\truns = (\\d+)$/m.exec(g.out)?.[1]||0);if(st==='not running'&&runs>0)break;}sleep(20);}try{fs.writeFileSync(path.join(jobsDir,`${label}.json`),JSON.stringify({label,domain,pid,createdAtMs:Date.now()})+'\\n',{mode:0o600});}catch{}process.exit(0);}",
  "process.exit(1);",
].join('\n');

function buildMac(output: any, identity: any): any  {
  const root: any = path.join(output, 'Buildr Web Dev.app', 'Contents');
  const executableRoot: any = path.join(root, 'MacOS');
  const resources: any = path.join(root, 'Resources');
  fs.mkdirSync(executableRoot, { recursive: true });
  fs.mkdirSync(resources, { recursive: true });
  fs.copyFileSync(path.join(ASSET_ROOT, 'Buildr.icns'), path.join(resources, 'Buildr.icns'));
  writeIdentity(path.join(resources, 'launcher-identity.json'), identity);
  const cliEntry: any = path.join(identity.sourceRoot, 'bin', 'buildr.mjs');
  const macWrapper = [
    '#!/bin/sh',
    'HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
    'IDENTITY="$HERE/../Resources/launcher-identity.json"',
    'LOG_DIR="${HOME}/Library/Logs/Buildr Dev"',
    'LOG_FILE="$LOG_DIR/launcher.log"',
    `SOURCE_ROOT=${shellQuote(identity.sourceRoot)}`,
    `NODE_EXECUTABLE=${shellQuote(identity.developmentRuntime.executable)}`,
    `EXPECTED_NODE_VERSION=${shellQuote(identity.developmentRuntime.version)}`,
    `CLI_ENTRY=${shellQuote(cliEntry)}`,
    'NO_OPEN_ARG=""',
    '[ "${BUILDR_LAUNCHER_NO_OPEN-}" = "1" ] && NO_OPEN_ARG="--no-open"',
    'mkdir -p "$LOG_DIR"',
    'if [ ! -d "$SOURCE_ROOT" ] || [ ! -f "$CLI_ENTRY" ] || [ ! -f "$SOURCE_ROOT/resources/manifest.yml" ] || [ ! -d "$SOURCE_ROOT/src" ] || [ ! -d "$SOURCE_ROOT/resources" ]; then',
    '  echo "Buildr Web Dev checkout 不可用：${SOURCE_ROOT}。请在保留的Buildr checkout中重新运行 npm run install:development。" >&2',
    '  exit 1',
    'fi',
    'if [ ! -x "$NODE_EXECUTABLE" ]; then',
    '  echo "Buildr Web Dev development host Node 不可用：${NODE_EXECUTABLE}。请使用 identity 绑定的兼容 Node 重新安装 Launcher。" >&2',
    '  exit 1',
    'fi',
    'ACTUAL_NODE_VERSION=$("$NODE_EXECUTABLE" -p \'process.versions.node\' 2>&1)',
    'if [ "$ACTUAL_NODE_VERSION" != "$EXPECTED_NODE_VERSION" ]; then',
    '  echo "Buildr Web Dev development host Node 版本不匹配：期望 $EXPECTED_NODE_VERSION，实际 ${ACTUAL_NODE_VERSION}。请重新安装 Launcher。" >&2',
    '  exit 1',
    'fi',
    'PATH="$SOURCE_ROOT/tools/development/programs:${NODE_EXECUTABLE%/*}${PATH:+:$PATH}"',
    'export PATH',
    'USE_LAUNCHD=1',
    'if [ "${BUILDR_DETACHED_ISOLATION-}" = "off" ] || [ "${BUILDR_DETACHED_ISOLATION-}" = "direct" ]; then',
    '  USE_LAUNCHD=0',
    'elif [ "${BUILDR_DETACHED_ISOLATION-}" != "launchd" ]; then',
    '  if [ "${BUILDR_TEST_STATE_REQUIRED-}" = "1" ] || [ -n "${NODE_TEST_CONTEXT-}" ]; then',
    '    USE_LAUNCHD=0',
    '  fi',
    'fi',
    'if [ "$USE_LAUNCHD" = "1" ]; then',
    `  if BUILDR_LAUNCHER_IDENTITY="$IDENTITY" BUILDR_LAUNCH_CWD="$SOURCE_ROOT" BUILDR_LAUNCH_LOG="$LOG_FILE" BUILDR_LAUNCH_JOBS_DIR="$LOG_DIR/launchd-jobs" "$NODE_EXECUTABLE" -e ${shellQuote(MAC_LAUNCHD_BOOTSTRAP_SCRIPT)} "$NODE_EXECUTABLE" "$CLI_ENTRY" web --port ${DEFAULT_DEVELOPMENT_LAUNCHER_WEB_PORT} $NO_OPEN_ARG; then`,
    '    exit 0',
    '  fi',
    'fi',
    `BUILDR_LAUNCHER_IDENTITY="$IDENTITY" /usr/bin/nohup "$NODE_EXECUTABLE" "$CLI_ENTRY" web --port ${DEFAULT_DEVELOPMENT_LAUNCHER_WEB_PORT} $NO_OPEN_ARG >"$LOG_FILE" 2>&1 &`,
    'exit 0',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(executableRoot, 'Buildr'), macWrapper, { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleName</key><string>Buildr Web Dev</string><key>CFBundleDisplayName</key><string>Buildr Web Dev</string><key>CFBundleIdentifier</key><string>${DEVELOPMENT_BUNDLE_IDENTIFIER}</string><key>CFBundleShortVersionString</key><string>${identity.version}</string><key>CFBundleVersion</key><string>${identity.buildNumber}</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleExecutable</key><string>Buildr</string><key>CFBundleIconFile</key><string>Buildr.icns</string><key>LSUIElement</key><true/></dict></plist>\n`);
  return path.dirname(root);
}

function buildWindows(output: any, identity: any): any  {
  const root: any = path.join(output, 'Buildr Web Dev');
  fs.mkdirSync(root, { recursive: true });
  fs.copyFileSync(path.join(ASSET_ROOT, 'Buildr.ico'), path.join(root, 'Buildr.ico'));
  writeIdentity(path.join(root, 'launcher-identity.json'), identity);
  const cliEntry: any = path.win32.join(identity.sourceRoot, 'bin', 'buildr.mjs');
  fs.writeFileSync(path.join(root, 'Launch-Buildr.cmd'), `@echo off\nset "BUILDR_LAUNCHER_IDENTITY=%~dp0launcher-identity.json"\nset "SOURCE_ROOT=${commandValue(identity.sourceRoot)}"\nset "NODE_EXECUTABLE=${commandValue(identity.developmentRuntime.executable)}"\nset "CLI_ENTRY=${commandValue(cliEntry)}"\nset "EXPECTED_NODE_VERSION=${commandValue(identity.developmentRuntime.version)}"\nset "NO_OPEN_ARG="\nif "%BUILDR_LAUNCHER_NO_OPEN%"=="1" set "NO_OPEN_ARG=--no-open"\nif not exist "%LOCALAPPDATA%\\Buildr Dev\\Logs" mkdir "%LOCALAPPDATA%\\Buildr Dev\\Logs"\nif not exist "%CLI_ENTRY%" (\n  echo Buildr Web Dev checkout 不可用：%SOURCE_ROOT%。请重新安装 Launcher。 1>&2\n  exit /b 1\n)\nif not exist "%NODE_EXECUTABLE%" (\n  echo Buildr Web Dev development host Node 不可用：%NODE_EXECUTABLE%。 1>&2\n  exit /b 1\n)\nfor /f "delims=" %%V in ('"%NODE_EXECUTABLE%" -p "process.versions.node" 2^>^&1') do set "ACTUAL_NODE_VERSION=%%V"\nif not "%ACTUAL_NODE_VERSION%"=="%EXPECTED_NODE_VERSION%" exit /b 1\n"%NODE_EXECUTABLE%" "%CLI_ENTRY%" web --port ${DEFAULT_DEVELOPMENT_LAUNCHER_WEB_PORT} %NO_OPEN_ARG% >>"%LOCALAPPDATA%\\Buildr Dev\\Logs\\launcher.log" 2>&1\nexit /b %ERRORLEVEL%\n`);
  fs.writeFileSync(path.join(root, 'Buildr.vbs'), Buffer.from(`\uFEFFSet shell = CreateObject("WScript.Shell")\nbase = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)\ncommand = Chr(34) & base & "\\Launch-Buildr.cmd" & Chr(34)\nexitCode = shell.Run(command, 0, True)\nIf exitCode <> 0 Then MsgBox "Buildr Web Dev 无法启动。", 16, "Buildr Web Dev"\n`, 'utf16le'));
  fs.writeFileSync(path.join(root, 'Install-Buildr-Shortcuts.ps1'), `﻿$ErrorActionPreference = "Stop"\n$root = Split-Path -Parent $MyInvocation.MyCommand.Path\n$start = Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs"\n$shell = New-Object -ComObject WScript.Shell\n$shortcutPath = Join-Path $start "Buildr Web Dev.lnk"\n$expectedScript = [IO.Path]::GetFullPath((Join-Path $root "Buildr.vbs"))\nif (Test-Path -LiteralPath $shortcutPath) {\n  $existing = $shell.CreateShortcut($shortcutPath)\n  $existingScript = $existing.Arguments.Trim().Trim([char]34)\n  $owned = ([IO.Path]::GetFileName($existing.TargetPath) -ieq "wscript.exe") -and ([IO.Path]::GetFullPath($existingScript) -ieq $expectedScript)\n  if (-not $owned) { throw "Refusing to overwrite shortcut without matching Buildr ownership: $shortcutPath" }\n}\n$shortcut = $shell.CreateShortcut($shortcutPath)\n$shortcut.TargetPath = "$env:WINDIR\\System32\\wscript.exe"\n$shortcut.Arguments = '"' + (Join-Path $root "Buildr.vbs") + '"'\n$shortcut.WorkingDirectory = $root\n$shortcut.IconLocation = (Join-Path $root "Buildr.ico") + ",0"\n$shortcut.Description = "打开 Buildr Web Dev"\n$shortcut.Save()\n`);
  return root;
}

export function buildLauncher({ platform = process.platform, output, identity }: any): any  {
  if (!['darwin', 'win32'].includes(platform)) throw new Error(`Unsupported launcher platform: ${platform}`);
  assertDevelopmentIdentity(identity);
  assertFreshOutput(output);
  fs.mkdirSync(output, { recursive: true });
  return platform === 'darwin' ? buildMac(output, identity) : buildWindows(output, identity);
}

async function main(args: any = process.argv.slice(2)): Promise<any>  {
  const packageData: any = JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, 'package.json'), 'utf8'));
  const channel: any = option(args, '--channel', 'development');
  if (channel !== 'development') throw new Error('tools/build/launcher only builds Buildr Web Dev; use `buildr web launcher install` from a verified npm installation for the formal local Launcher.');
  const runtime: any = path.resolve(option(args, '--runtime', process.execPath));
  const version: any = spawnSync(runtime, ['-p', 'process.versions.node'], { encoding: 'utf8' }).stdout.trim();
  const sourceRoot: any = path.resolve(option(args, '--source-root', PRODUCT_ROOT));
  const identity: any = {
    schemaVersion: 'buildr.launcher-identity/v1', version: packageData.version, channel: 'development', runtimeRole: 'development', source: 'checkout',
    buildId: option(args, '--build-id', packageData.version), buildNumber: option(args, '--build-number', '1'), protocolVersion: 1, protocolIdentity: 'buildr.web-protocol/v1',
    platform: option(args, '--platform', process.platform), builtAt: new Date().toISOString(), sourceRoot,
    webPort: DEFAULT_DEVELOPMENT_LAUNCHER_WEB_PORT,
    developmentRuntime: { executable: runtime, version, source: 'development-host', identity: `development-host:${fs.realpathSync(runtime)}:${version}` },
  };
  const output: any = path.resolve(option(args, '--output', path.join(PRODUCT_ROOT, 'dist', 'launcher', `development-${identity.buildId}`)));
  console.log(buildLauncher({ platform: identity.platform, output, identity }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((error: any) => { console.error(error.message); process.exitCode = 1; });
