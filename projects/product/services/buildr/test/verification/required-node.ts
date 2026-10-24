import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Local installs probed for an exact Node version, mirroring
 * resolve-development-node precedence: explicit BUILDR_NODE first, then
 * declared-version install locations, then a PATH scan. */
export function exactNodeCandidatePaths(version: string, env: NodeJS.ProcessEnv = process.env, homeDir: string = os.homedir(), platform: NodeJS.Platform = process.platform): string[] {
  const nodeName = platform === 'win32' ? 'node.exe' : 'node';
  const bin = (root: string) => path.join(root, 'bin', nodeName);
  const candidates: string[] = [];
  if (env.BUILDR_NODE) candidates.push(env.BUILDR_NODE);
  candidates.push(
    bin(path.join(env.NVM_DIR || path.join(homeDir, '.nvm'), 'versions/node', `v${version}`)),
    bin(path.join(homeDir, '.local/opt', `node-v${version}`)),
    bin(path.join(homeDir, '.volta/tools/image/node', version)),
    bin(path.join(homeDir, '.asdf/installs/nodejs', version)),
    bin(path.join(homeDir, '.nodenv/versions', version)),
    bin(path.join(homeDir, '.local/share/mise/installs/node', version)),
    bin(path.join(homeDir, '.local/share/fnm/node-versions', `v${version}`, 'installation')),
  );
  for (const entry of (env.PATH ?? '').split(path.delimiter)) {
    if (entry) candidates.push(path.join(entry, nodeName));
  }
  return [...new Set(candidates)];
}

export function probeNodeVersion(executable: string): string | null {
  const result = spawnSync(executable, ['-p', 'process.versions.node'], { encoding: 'utf8', timeout: 10_000 });
  const version = result.status === 0 && !result.error ? String(result.stdout).trim() : null;
  return version && /^\d+\.\d+\.\d+(?:-[^\s]+)?$/u.test(version) ? version : null;
}

/** Resolves a locally installed Node executable at exactly `version`, or null. */
export function resolveExactNodeExecutable(version: string, dependencies: any = {}): string | null {
  const exists = dependencies.exists ?? ((file: string) => fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false);
  const probe = dependencies.probe ?? probeNodeVersion;
  const candidates = dependencies.candidates ?? exactNodeCandidatePaths(version, dependencies.env ?? process.env, dependencies.homeDir ?? os.homedir(), dependencies.platform ?? process.platform);
  const realpath = dependencies.realpath ?? ((file: string) => fs.realpathSync(file));
  for (const candidate of candidates) {
    if (!exists(candidate)) continue;
    if (probe(candidate) === version) return realpath(candidate);
  }
  return null;
}
