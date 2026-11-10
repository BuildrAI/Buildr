/** Download reuse only: never shares checkouts, installs, credentials or validation results. */
import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { ReleaseSdkCommand } from './prepare-release-sdk.ts';

export const OFFICIAL_REGISTRY = 'https://registry.npmjs.org/';
export const MIRROR_REGISTRY = 'https://registry.npmmirror.com/';
export function downloadRegistry(value = process.env.BUILDR_DSH_NPM_REGISTRY ?? OFFICIAL_REGISTRY): string {
  if (![OFFICIAL_REGISTRY, MIRROR_REGISTRY].includes(value)) throw new Error('SDK registry must be the official registry or npmmirror HTTPS URL');
  return value;
}
export function hostHome(): string {
  const value = process.env.BUILDR_HOST_HOME ?? homedir();
  if (!isAbsolute(value)) throw new Error('SDK host home must be absolute');
  return realpathSync(value);
}
export function downloadDirectory(path: string): string {
  if (!isAbsolute(path) || /[\u0000-\u001f\u007f]/.test(path)) throw new Error('download cache must be absolute');
  // Check existing components before creating descendants; never follow a cache alias.
  for (let part = resolve(path); part !== dirname(part); part = dirname(part)) {
    if (existsSync(part) && lstatSync(part).isSymbolicLink()) throw new Error('download cache must not contain symlinks');
  }
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o022) !== 0))) throw new Error('download cache must be an owned regular directory');
  return realpathSync(path);
}
/** Ask the selected pnpm version for its normal user store without loading user auth/config. */
export function sharedPnpmStore(node: string, pnpm: string, run: ReleaseSdkCommand, env: NodeJS.ProcessEnv, cwd: string): string {
  const home = hostHome();
  const discovery = { ...env, HOME: home, USERPROFILE: home,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME };
  const path = process.env.BUILDR_DSH_PNPM_STORE ??
    run(node, [pnpm, 'store', 'path'], { cwd, env: discovery }).trim();
  return downloadDirectory(path);
}
export function sourceCacheRoot(): string {
  const home = hostHome();
  const base = process.platform === 'darwin' ? join(home, 'Library', 'Caches')
    : process.platform === 'win32' ? join(home, 'AppData', 'Local')
      : process.env.XDG_CACHE_HOME ?? join(home, '.cache');
  return downloadDirectory(join(base, 'buildr', 'sdk-git'));
}
/** One writer per repository; an interrupted lock is reported, never stolen from an unknown owner. */
export async function cachedSource(input: {
  source: string; repository: string; tag: string; commit: string; cacheRoot: string;
  run: ReleaseSdkCommand; env: NodeJS.ProcessEnv;
}): Promise<'hit' | 'downloaded'> {
  const { source, repository, tag, commit, run, env } = input;
  const root = downloadDirectory(input.cacheRoot);
  const name = createHash('sha256').update(repository).digest('hex');
  const cache = join(root, `${name}.git`), lock = join(root, `${name}.lock`);
  const deadline = Date.now() + 120_000;
  while (true) {
    try { mkdirSync(lock, { mode: 0o700 }); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error(`SDK source cache is locked; inspect owner before removing ${lock}`);
      await delay(250);
    }
  }
  const owner = lstatSync(lock);
  try {
    const execute = (args: string[]) => run('git', args, { cwd: source, env }).trim();
    if (!existsSync(cache)) execute(['init', '--bare', '--quiet', cache]);
    downloadDirectory(cache);
    const cached = (args: string[]) => execute(['--git-dir', cache, ...args]);
    if (cached(['rev-parse', '--is-bare-repository']) !== 'true') throw new Error('SDK source cache must be bare');
    let hit = false;
    try { hit = cached(['rev-parse', '--verify', `${commit}^{commit}`]) === commit; } catch { /* Missing objects are fetched below. */ }
    if (!hit) {
      cached(['fetch', '--quiet', '--depth=1', '--no-tags', repository, `refs/tags/${tag}`]);
      if (cached(['rev-parse', 'FETCH_HEAD^{commit}']) !== commit) throw new Error('fetched upstream tag differs from its registered exact commit');
    }
    // Independent repository, not alternates: cache eviction cannot invalidate an active preparation.
    run('git', ['fetch', '--quiet', '--update-shallow', '--no-tags', cache, commit], {
      cwd: source, env: { ...env, GIT_ALLOW_PROTOCOL: 'file' },
    });
    return hit ? 'hit' : 'downloaded';
  } finally {
    const current = lstatSync(lock, { throwIfNoEntry: false });
    if (current?.ino === owner.ino && current.dev === owner.dev && current.isDirectory() && !current.isSymbolicLink()) rmSync(lock, { recursive: true });
  }
}
function retryableDownload(error: unknown): boolean {
  const value = error as { message?: string; stdout?: unknown; stderr?: unknown };
  const text = [value.message, value.stdout, value.stderr].map(String).join('\n');
  if (/INTEGRITY|CHECKSUM|LOCKFILE|CERT_|SELF_SIGNED|401|403/i.test(text)) return false;
  return /ERR_PNPM_(?:FETCH_404|FETCH_5\d\d|META_FETCH_FAIL)|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|ECONNREFUSED/.test(text);
}
export function installSdkDependencies(node: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, run: ReleaseSdkCommand): boolean {
  const install = (selected: NodeJS.ProcessEnv) => {
    // pnpm 11 no longer consumes npm's registry environment prefix.
    // Keep npm bootstrap and pnpm installs on the same selected public endpoint.
    const output = run(node, args, { cwd, env: { ...selected,
      pnpm_config_registry: selected.NPM_CONFIG_REGISTRY ?? OFFICIAL_REGISTRY } });
    if (output.trim()) console.error(output.trim());
  };
  try { install(env); return false; }
  catch (error) {
    if (env.NPM_CONFIG_REGISTRY !== MIRROR_REGISTRY || !retryableDownload(error)) throw error;
    console.error('[dsh-sdk] mirror download unavailable; retrying frozen install once with official registry');
    install({ ...env, NPM_CONFIG_REGISTRY: OFFICIAL_REGISTRY });
    return true;
  }
}
