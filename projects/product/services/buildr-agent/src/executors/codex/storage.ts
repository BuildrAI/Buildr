import fs from 'node:fs';
import path from 'node:path';
import { devNull } from 'node:os';
import { spawnSync } from 'node:child_process';

export function codexCuratedIdentity(checkout: string): string | undefined {
  try {
    if (!fs.lstatSync(path.join(checkout, '.git')).isDirectory()) return;
    if (fs.lstatSync(path.join(checkout, '.git/config')).isSymbolicLink()) return;
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
    Object.assign(env, {GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:devNull,GIT_CONFIG_SYSTEM:devNull,GIT_TERMINAL_PROMPT:'0'});
    const git = (args: string[]) => {
      const result = spawnSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', checkout, ...args], { env, encoding: 'utf8', timeout: 3000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      if (result.error || result.status !== 0 || result.stderr.trim()) throw new Error('plugin_checkout_unknown');
      return result.stdout.trim();
    };
    const keys = git(['config', '--local', '--name-only', '--list']).split('\n');
    if (keys.some(key => !/^(?:core\.(?:repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode)|remote\.origin\.(?:url|fetch|promisor|partialclonefilter)|branch\..+\.(?:remote|merge)|extensions\.(?:objectformat|partialclone))$/.test(key))) return;
    const head = git(['rev-parse', 'HEAD']); if (!/^[a-f0-9]{40,64}$/.test(head)) return;
    if (git(['remote'])) {
      if (git(['remote', 'get-url', 'origin']) !== 'https://github.com/openai/plugins.git') return;
    } else {
      // Codex also creates pinned checkouts with init + fetch URL, without an origin remote.
      const fetched = path.join(checkout, '.git/FETCH_HEAD'), stat = fs.lstatSync(fetched);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) return;
      const source = fs.readFileSync(fetched, 'utf8');
      if (!source.split('\n').some(line => line.startsWith(head + '\t') && / of https:\/\/github\.com\/openai\/plugins(?:\.git)?$/.test(line))) return;
    }
    return git(['status', '--porcelain', '--untracked-files=all']) ? undefined : head;
  } catch { return; }
}

/** Only the clean, unregistered curated checkout is disposable; installed/local plugins stay. */
export function codexCacheReclaimable(configRoot: string, relative: string): boolean {
  if (relative !== 'codex-home/.tmp/plugins') return true;
  const home = path.join(configRoot, 'codex-home'), checkout = path.join(home, '.tmp/plugins');
  try {
    if (fs.existsSync(path.join(home, 'plugins')) && fs.readdirSync(path.join(home, 'plugins')).length) return false;
    const config = path.join(home, 'config.toml');
    if (fs.existsSync(config)) {
      if (fs.statSync(config).size > 1024 * 1024) return false;
      const text = fs.readFileSync(config, 'utf8');
      if (/^\s*\[\s*(?:plugins|marketplaces)(?:\.|\])/m.test(text) || /\.tmp[\\/]+plugins/.test(text)) return false;
    }
    return codexCuratedIdentity(checkout) !== undefined;
  } catch { return false; }
}
