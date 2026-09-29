/**
 * Platform facts and per-package channel resolution, kept in one place.
 *
 * macOS is the verified platform. Windows follows the conventions Buildr's own code declares for its
 * launchers, but is NOT verified on a Windows host, and nothing here may claim otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Buildr's internal channel names, as they appear in its public installation status. */
export type BuildrChannel = 'npm' | 'development';

const SUPPORTED_PLATFORMS = ['darwin', 'win32'] as const;

export function assertSupportedPlatform(platform: string): void {
  if (!(SUPPORTED_PLATFORMS as readonly string[]).includes(platform)) {
    throw new Error(`当前 Buildr 插件只支持 macOS 与 Windows 桌面版；当前平台是 ${platform}。`);
  }
}

/**
 * Which Buildr installation this plugin package opens. Each package serves exactly one channel, so
 * the user never chooses and the wire protocol never carries a channel argument.
 */
export function channelForPackage(packageName: string): BuildrChannel {
  return packageName.endsWith('-dev') ? 'development' : 'npm';
}

function localAppData(environment: NodeJS.ProcessEnv): string {
  return environment.LOCALAPPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Local');
}

/** Conventional launcher roots for one channel, most specific first. A miss is reported, not guessed. */
export function launcherRoots(channel: BuildrChannel, environment: NodeJS.ProcessEnv, platform: string = process.platform): string[] {
  if (platform === 'darwin') {
    return channel === 'npm'
      ? [path.join(os.homedir(), 'Applications', 'Buildr Web.app'), '/Applications/Buildr Web.app']
      : ['/Applications/Buildr Web Dev.app'];
  }
  if (platform === 'win32') {
    return [path.join(localAppData(environment), 'Programs', channel === 'npm' ? 'Buildr Web' : 'Buildr Web Dev')];
  }
  return [];
}

/** The launcher executable inside one resolved launcher root. */
export function launcherExecutable(root: string, channel: BuildrChannel, platform: string = process.platform): string {
  return platform === 'darwin'
    ? path.join(root, 'Contents', 'MacOS', channel === 'npm' ? 'Buildr Web' : 'Buildr')
    // Windows launchers sit beside their identity file as Buildr's own status code reads them; the
    // executable name below is a convention and remains unverified on a real Windows host.
    : path.join(root, channel === 'npm' ? 'Buildr Web.exe' : 'Buildr Dev.exe');
}

/** The launcher identity file inside one resolved launcher root. */
export function launcherIdentityFile(root: string, platform: string = process.platform): string {
  return platform === 'darwin'
    ? path.join(root, 'Contents', 'Resources', 'launcher-identity.json')
    : path.join(root, 'launcher-identity.json');
}

export interface LauncherIdentityCandidate { root: string; identity: unknown }

/** Read every conventional launcher identity for a channel; absent roots are skipped. */
export function launcherIdentityCandidates(channel: BuildrChannel, environment: NodeJS.ProcessEnv, platform: string = process.platform): LauncherIdentityCandidate[] {
  const candidates: LauncherIdentityCandidate[] = [];
  for (const root of launcherRoots(channel, environment, platform)) {
    const file = launcherIdentityFile(root, platform);
    if (!existsSync(file)) continue;
    try {
      candidates.push({ root, identity: JSON.parse(readFileSync(file, 'utf8')) as unknown });
    } catch {
      candidates.push({ root, identity: null });
    }
  }
  return candidates;
}
