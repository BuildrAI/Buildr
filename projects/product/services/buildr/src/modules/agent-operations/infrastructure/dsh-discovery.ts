import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectDshEntry, dshDesktopAppPath, dshDesktopScopeIdentity } from './dsh-entry.ts';
import { readDesktopDiscovery } from './dsh-desktop-transport.ts';
import type { DshDesktopChannel, DshDesktopDiscovery } from '../contracts/dsh-desktop-bridge.ts';
import type { DshAgentRegistration, DshDiscoveryCandidate } from '../domain/agent-operations.ts';
export type DiscoveredDsh = { view: DshDiscoveryCandidate; entry: Omit<DshAgentRegistration, 'id' | 'kind'> | null; discovery: DshDesktopDiscovery | null; identity: string };
const digest = (value: unknown) => 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const real = (file: string) => { try { return fs.realpathSync(file); } catch { return path.resolve(file); } };
export function discoverDshInstallations(options: { registrations: readonly DshAgentRegistration[]; channel: DshDesktopChannel; env?: NodeJS.ProcessEnv; homeDirectory?: string; applicationRoots?: readonly string[] }): DiscoveredDsh[] {
  const home = options.homeDirectory ?? os.homedir(), env = options.env ?? process.env;
  const configuredHome = real(env.DSH_HOME ?? path.join(home, '.dsh'));
  const sources: { executable: string; dshHome: string; label?: string; source: DshDiscoveryCandidate['source'] }[] = options.registrations.map(r => ({ ...r, source: 'registered' }));
  for (const root of (options.applicationRoots ?? ['/Applications', path.join(home, 'Applications')]).slice(0, 8)) {
    try { for (const name of fs.readdirSync(root).slice(0, 512)) if (/^DeepSeek Harness(?:[- .][^/]*)?\.app$/i.test(name)) sources.push({ executable: path.join(root, name, 'Contents/Resources/runtime/cli/bin/dsh'), dshHome: configuredHome, source: 'desktop-bundled' }); } catch { /* Missing roots are ordinary. */ }
  }
  // The authenticated plugin can advertise non-default desktop installation locations.
  try { const record = readDesktopDiscovery(configuredHome, options.channel); sources.push({ executable: record.executable, dshHome: configuredHome, source: 'desktop-bundled' }); } catch { /* Offline is a candidate diagnostic. */ }
  const found = new Map<string, DiscoveredDsh>();
  for (const source of sources.slice(0, 96)) {
    const executable = real(source.executable), dshHome = real(source.dshHome), key = digest([executable, dshHome]);
    if (found.has(key) || found.size >= 32) continue;
    const previous = options.registrations.find(r => real(r.executable) === executable && real(r.dshHome) === dshHome);
    let entry: DiscoveredDsh['entry'] = null, discovery: DshDesktopDiscovery | null = null;
    try { const inspected = inspectDshEntry({ executable, dshHome, label: previous?.label ?? source.label }); const appPath = dshDesktopAppPath(executable)!; entry = { ...inspected, desktop: { appPath, channel: options.channel, scopeIdentity: dshDesktopScopeIdentity(executable, dshHome, appPath) } }; } catch { /* Show unavailable installation without raw diagnostics. */ }
    try { const d = readDesktopDiscovery(dshHome, options.channel); if (entry?.desktop?.appPath === d.appPath && executable === d.executable && entry.version === d.dshVersion) discovery = d; } catch { /* No new Host is started for discovery. */ }
    const available = !!entry && !!discovery;
    const view: DshDiscoveryCandidate = { id: 'dsh-candidate-' + key.slice(7), label: previous?.label ?? entry?.label ?? 'DSH', version: entry?.version ?? previous?.version ?? 'unknown', installationLabel: entry?.desktop?.appPath ?? executable, configurationLabel: dshHome === path.join(home, '.dsh') ? '~/.dsh · desktop' : dshHome + ' · desktop', source: source.source, registeredAgentId: previous?.id ?? null, desktopAvailable: !!discovery, generationAvailability: available ? 'available' : 'unavailable', safeReason: available ? null : '已发现 DSH；桌面后台或兼容的 Buildr 插件连接当前不可用，请打开桌面并检查插件。' };
    const identity = digest({ view, appPath: entry?.desktop?.appPath, scopeIdentity: entry?.desktop?.scopeIdentity, channel: options.channel, hostInstanceId: discovery?.hostInstanceId ?? null, pluginVersion: discovery?.pluginVersion ?? null });
    found.set(key, { view, entry, discovery, identity });
  }
  return [...found.values()];
}
export const dshDiscoveryRevision = (candidates: readonly DiscoveredDsh[]) => digest(candidates.map(c => ({ view: c.view, identity: c.identity })));
