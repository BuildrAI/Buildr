import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { after } from 'node:test';

// Seeds are private to this test process, copied byte-for-byte without hardlinks.
// Only initialization is shared. Every hook, index, branch, remote and write is private.
const seeds = new Map<string, string>();
const owned = new Set<string>();
after(() => { for (const root of owned) fs.rmSync(root, { recursive: true, force: true }); });
const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export function copyEmptyCodeRepository(destination: string, format: string, name: string, email: string): void {
  const key = JSON.stringify([format, name, email]);
  let seed = seeds.get(key);
  if (!seed) {
    seed = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-code-empty-seed-')); owned.add(seed);
    git(seed, 'init', '--initial-branch=main', '--object-format=' + format);
    git(seed, 'config', 'user.name', name); git(seed, 'config', 'user.email', email); git(seed, 'config', 'commit.gpgSign', 'false');
    seeds.set(key, seed);
  }
  fs.cpSync(seed, destination, { recursive: true });
}
export function copyCodeSyncRepositories(destination: string, format: string): string {
  const key = 'sync:' + format;
  let seed = seeds.get(key);
  if (!seed) {
    seed = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-code-sync-seed-')); owned.add(seed);
    const root = path.join(seed, 'repository'), remote = path.join(seed, 'remote.git'), peer = path.join(seed, 'peer');
    copyEmptyCodeRepository(root, format, 'Sync Fixture', 'sync@example.com');
    fs.writeFileSync(path.join(root, 'base.txt'), 'base\n');
    git(root, 'add', '--all'); git(root, 'commit', '-qm', 'base');
    git(seed, 'init', '--bare', '--initial-branch=main', '--object-format=' + format, remote);
    git(root, 'remote', 'add', 'origin', remote); git(root, 'push', '-u', 'origin', 'main');
    git(seed, 'clone', '--branch=main', remote, peer);
    git(peer, 'config', 'user.name', 'Peer Fixture'); git(peer, 'config', 'user.email', 'peer@example.com'); git(peer, 'config', 'commit.gpgSign', 'false');
    seeds.set(key, seed);
  }
  fs.cpSync(seed, destination, { recursive: true });
  const remote = path.join(destination, 'remote.git');
  for (const name of ['repository', 'peer']) git(path.join(destination, name), 'remote', 'set-url', 'origin', remote);
  return git(path.join(destination, 'repository'), 'rev-parse', 'HEAD');
}
