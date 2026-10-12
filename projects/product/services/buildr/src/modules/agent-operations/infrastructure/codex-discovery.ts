import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findExecutableOnPath, spawnCommandSync } from '../../../infrastructure/process.ts';
import type { CodexAgentRegistration, CodexDesktopInstallation, CodexDiscoveryCandidate } from '../domain/agent-operations.ts';
import { inspectCodexEntry } from './codex-entry.ts';

type Entry = Omit<CodexAgentRegistration, 'id' | 'kind'>;
export type DiscoveredCodex = { view: CodexDiscoveryCandidate; entry: Entry | null; installation: CodexDesktopInstallation | null; identity: string };
export type CodexDiscoveryOptions = {
  registrations: readonly CodexAgentRegistration[];
  inspectEntry?: typeof inspectCodexEntry;
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  platform?: NodeJS.Platform;
  applicationRoots?: readonly string[];
};
const digest = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const real = (file: string) => { try { return fs.realpathSync(file); } catch { return path.resolve(file); } };
const stat = (file: string) => { try { return fs.statSync(file); } catch { return null; } };
const identity = (file: string, directory = false) => {
  try { const stat = fs.statSync(file); return [real(file), stat.dev, stat.ino, ...(directory ? [] : [stat.size, stat.mtimeMs])]; }
  catch { return [path.resolve(file), 'unavailable']; }
};
function desktopApp(executable: string): string | null {
  const match = /^(.*?\.app)[/\\]Contents[/\\]Resources[/\\](?:codex-cli[/\\])?/.exec(executable);
  return match?.[1] ?? null;
}
function appVersion(appPath: string, platform: NodeJS.Platform): string | null {
  const file = path.join(appPath, 'Contents', 'Info.plist');
  try {
    if (fs.statSync(file).size > 256 * 1024) return null;
    const body = fs.readFileSync(file, 'utf8');
    const xml = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]{1,100})<\/string>/.exec(body)?.[1];
    if (xml && !/[\u0000-\u001f]/.test(xml)) return xml;
    if (platform !== 'darwin') return null;
    const result = spawnCommandSync('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', file], { encoding: 'utf8', timeout: 1000, maxBuffer: 1024, windowsHide: true });
    const value = String(result.stdout || '').trim();
    return result.status === 0 && value && value.length <= 100 && !/[\u0000-\u001f]/.test(value) ? value : null;
  } catch { return null; }
}

/** A bounded local inventory. Probes only installation/version/protocol, never a model or chat. */
export function discoverCodexInstallations(options: CodexDiscoveryOptions): DiscoveredCodex[] {
  const env = options.env ?? process.env, home = options.homeDirectory ?? os.homedir(), platform = options.platform ?? process.platform;
  const configuredHome = env.CODEX_HOME ?? path.join(home, '.codex');
  type Source = { executable: string; codexHome: string; source: CodexDiscoveryCandidate['source']; appPath: string | null; label?: string };
  const sources: Source[] = [];
  const add = (source: Source) => { if (path.isAbsolute(source.executable) && path.isAbsolute(source.codexHome) && !/[\0\r\n]/.test(source.executable + source.codexHome) && sources.length < 96) sources.push(source); };
  if (platform === 'darwin') {
    const appPaths = new Set<string>();
    for (const root of (options.applicationRoots ?? ['/Applications', path.join(home, 'Applications')]).slice(0, 8)) {
      if (!path.isAbsolute(root)) continue;
      try { for (const name of fs.readdirSync(root).slice(0, 512)) if (/^(?:ChatGPT|Codex)(?:[- .][^/]*)?\.app$/i.test(name)) appPaths.add(path.join(root, name)); } catch { /* Missing installation roots are ordinary. */ }
    }
    for (const entry of options.registrations) { const app = desktopApp(real(entry.executable)); if (app) appPaths.add(app); }
    if (env.CODEX_CLI_PATH && path.isAbsolute(env.CODEX_CLI_PATH)) { const app = desktopApp(real(env.CODEX_CLI_PATH)); if (app) appPaths.add(app); }
    for (const appPath of [...appPaths].slice(0, 32)) {
      for (const relative of ['Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex', 'Contents/Resources/codex']) {
        const executable = path.join(appPath, relative);
        if (stat(executable)?.isFile()) { add({ executable, codexHome: configuredHome, source: 'desktop-bundled', appPath }); break; }
      }
    }
  }
  const onPath = findExecutableOnPath('codex', { env, platform }) as string | null;
  if (onPath) add({ executable: path.resolve(onPath), codexHome: configuredHome, source: 'path', appPath: platform === 'darwin' ? desktopApp(real(onPath)) : null });
  for (const entry of options.registrations.slice(0, 32)) add({ executable: entry.executable, codexHome: entry.codexHome, source: 'registered', appPath: platform === 'darwin' ? desktopApp(real(entry.executable)) : null, label: entry.label });
  const found = new Map<string, DiscoveredCodex>();
  const inspect = options.inspectEntry ?? inspectCodexEntry;
  for (const source of sources) {
    const key = digest([real(source.executable), real(source.codexHome)]);
    if (found.has(key) || found.size >= 32) continue;
    const previous = options.registrations.find(record => real(record.executable) === real(source.executable) && real(record.codexHome) === real(source.codexHome));
    const storedLabel = previous?.label ?? source.label;
    const label = storedLabel === 'Codex（ChatGPT）' ? 'Codex' : storedLabel ?? 'Codex';
    let entry: Entry | null = null;
    try { entry = inspect({ executable: source.executable, codexHome: source.codexHome, label }); } catch { /* Surface an unavailable candidate without exposing probe diagnostics. */ }
    const installation = source.appPath && stat(source.appPath)?.isDirectory() ? { appPath: real(source.appPath), appVersion: appVersion(source.appPath, platform) } : null;
    const configurationPath = real(source.codexHome), relativeHome = path.relative(real(home), configurationPath);
    const configurationLabel = !relativeHome.startsWith('..') && !path.isAbsolute(relativeHome) ? '~/' + relativeHome : configurationPath;
    const observed = { executable: identity(source.executable), codexHome: identity(source.codexHome, true), app: installation && { ...installation, identity: identity(installation.appPath, true), metadata: identity(path.join(installation.appPath, 'Contents', 'Info.plist')) }, version: entry?.version ?? previous?.version ?? 'unknown' };
    found.set(key, {
      identity: digest(observed), entry, installation,
      view: { id: 'codex-candidate-' + key, label: entry?.label ?? label, version: observed.version, installationLabel: installation ? installation.appPath + (installation.appVersion ? ' · ' + installation.appVersion : '') : (source.source === 'registered' ? '已登记 Codex 命令行 · ' : '搜索路径（PATH） · ') + real(source.executable), configurationLabel, source: installation ? 'desktop-bundled' : source.source, registeredAgentId: previous?.id ?? null, desktopAvailable: installation !== null, generationAvailability: entry ? 'available' : 'unavailable', safeReason: entry ? null : '已发现安装，但程序、配置目录或应用服务（App Server）协议尚未确认可用。' },
    });
  }
  return [...found.values()];
}
export function codexDiscoveryRevision(candidates: readonly DiscoveredCodex[]): string {
  return 'sha256-' + digest(candidates.map(candidate => ({ view: candidate.view, identity: candidate.identity })));
}
