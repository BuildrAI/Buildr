import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NativeProgramPolicy } from '../program-policy.ts';

const antigravityBinaryName = process.platform === 'win32' ? 'antigravity.exe' : 'antigravity';

async function ensurePrivateDirs(...directories: string[]): Promise<void> {
  for (const directory of directories) {
    if (!path.isAbsolute(directory)) throw new Error('agent_config_path_invalid');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await fs.lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('agent_config_symlink_unsupported');
    await fs.chmod(directory, 0o700);
  }
}

export async function ensureAntigravityAutoUpdateDisabled(configRoot: string): Promise<string> {
  const home = path.join(configRoot, 'home');
  const temporary = path.join(configRoot, 'tmp');
  const cliDir = path.join(home, '.gemini', 'antigravity-cli');
  await ensurePrivateDirs(configRoot, home, temporary, path.join(home, '.gemini'), cliDir);
  const settingsPath = path.join(cliDir, 'settings.json');
  let existing: Record<string, unknown> = {};
  try {
    const info = await fs.lstat(settingsPath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error('agent_config_symlink_unsupported');
    }
    const parsed = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  } catch (error) {
    if ((error as Error)?.message === 'agent_config_symlink_unsupported') throw error;
  }
  if (existing.autoUpdate === false) return settingsPath;
  const next = { ...existing, autoUpdate: false };
  const tempPath = `${settingsPath}.${randomUUID()}`;
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await fs.rename(tempPath, settingsPath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
  return settingsPath;
}

export const antigravityProgramPolicy: NativeProgramPolicy = {
  id: 'antigravity',
  major: 1,
  bindingSeries: '1.x',
  compatibility: '1.x.x',
  version: '1.5.8',
  package: 'antigravity',
  entry: antigravityBinaryName,
  names: process.platform === 'win32' ? ['antigravity.exe', 'agy.exe', 'agy.cmd'] : ['antigravity', 'agy'],
  url: 'https://antigravity.google/docs/getting-started?tab=cli',
  label: 'Antigravity 独立执行程序',
  guidance: 'Buildr 会从 Google 官方发布清单准备独立的 Antigravity CLI（agy）并关闭自动更新，不执行环境改写或接管外部安装；用户个人全局设置、技能与 MCP 配置不在独立配置内生效。',
  managedOnly: true,
  prepareConnectionConfig: async configRoot => {
    await ensureAntigravityAutoUpdateDisabled(configRoot);
  },
  distribution: {
    kind: 'manifest',
    manifest: platform => new URL(`https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/${platform}.json`),
    manifestAllowedHosts: ['antigravity-cli-auto-updater-974169037036.us-central1.run.app'],
    archiveAllowedHosts: ['storage.googleapis.com'],
    digest: 'sha512',
    payload: {
      'tar.gz': { member: 'antigravity' },
      binary: true,
    },
    entry: antigravityBinaryName,
  },
  versionDisplay: 'program',
};
