import fs from 'node:fs';
import path from 'node:path';
import { devNull } from 'node:os';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { safeStoragePath } from '../../storage/files.ts';

/** Logs are not native state/session databases. Read the complete SQLite view
 * (including WAL schema) and reject any added non-diagnostic table. Producer
 * UUIDs are not PIDs: collection instead requires the whole config to be idle. */
export function codexDiagnosticLogs(config:string) {
  const home=path.join(config,'codex-home');
  const resources:Array<{relativePath:string;quiescentDatabase:string}>=[];
  if(!safeStoragePath(config,home))return resources;
  for(const name of fs.readdirSync(home).filter(name=>/^logs_[12]\.sqlite$/.test(name))){
    const file=path.join(home,name),stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)continue;
    try{
      const db=new DatabaseSync(file,{readOnly:true});let valid=false;
      try{
        const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name);
        const columns=db.prepare('PRAGMA table_info(logs)').all().map(row=>row.name);
        valid=tables.includes('logs')&&tables.every(name=>['logs','sqlite_sequence','_sqlx_migrations'].includes(String(name)))&&
          ['ts','feedback_log_body','thread_id','process_uuid'].every(name=>columns.includes(name));
      }finally{db.close();}
      if(valid)for(const suffix of ['-wal','-shm',''])if(fs.existsSync(file+suffix)){
        resources.push({relativePath:path.join('codex-home',name+suffix),quiescentDatabase:path.join('codex-home',name)});
      }
    }catch{/* Unknown/migrating schemas stay intact. */}
  }
  return resources;
}

export function codexCuratedIdentity(checkout: string): string | undefined {
  return curatedIdentity(checkout, new Set());
}

function curatedIdentity(checkout: string, visited: Set<string>): string | undefined {
  if (visited.has(checkout)) return;
  visited.add(checkout);
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
      const lines = source.split('\n').filter(line => line.startsWith(head + '\t'));
      if (!lines.some(line => / of https:\/\/github\.com\/openai\/plugins(?:\.git)?$/.test(line))) {
        // Native curated-sync rewrites FETCH_HEAD to a local path. Verify the
        // exact commit against our independently authenticated official seed;
        // a local URL alone never grants deletion authority.
        const marker = path.sep + 'connections' + path.sep + 'codex' + path.sep;
        const index = checkout.lastIndexOf(marker);
        if (index < 0 || !lines.some(line => / of \//.test(line))) return;
        const connection = checkout.slice(0, index + marker.length - 1);
        const seed = path.join(connection, 'cache/curated-plugins');
        if (seed === checkout || !safeStoragePath(connection, checkout) || !safeStoragePath(connection, seed) || curatedIdentity(seed, visited) !== head) return;
      }
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
