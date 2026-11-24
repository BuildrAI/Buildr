import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { sameFilesystemPath } from './filesystem-path-identity.ts';

const execFileAsync = promisify(execFile);

export type GitCheckoutReadIdentity = { id: string; root: string; gitDirectory: string; commonDirectory: string };
export type GitCheckoutIdentityInspection =
  | { ok: true; identity: GitCheckoutReadIdentity }
  | { ok: false; reason: 'not-git' | 'subdirectory' };

function checkoutIdentityArgs(checkoutRoot: string) {
  return ['--no-optional-locks', '--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', checkoutRoot,
    'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'];
}

function checkoutIdentityEnvironment() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  return { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' };
}

function statIdentityFromStat(stat: fs.BigIntStats) {
  if (!stat.isDirectory()) throw new Error('Git checkout identity is not a directory.');
  return { dev: String(stat.dev), ino: String(stat.ino), birthtime: String(stat.birthtimeNs) };
}

function buildCheckoutIdentity(
  checkoutRoot: string,
  resolved: [string, string, string],
  stats: [fs.BigIntStats, fs.BigIntStats, fs.BigIntStats],
): GitCheckoutIdentityInspection {
  const [root, gitDirectory, commonDirectory] = resolved;
  if (!sameFilesystemPath(root, checkoutRoot)) return { ok: false, reason: 'subdirectory' };
  const identity = {
    root, gitDirectory, commonDirectory,
    checkout: statIdentityFromStat(stats[0]),
    git: statIdentityFromStat(stats[1]),
    common: statIdentityFromStat(stats[2]),
  };
  const id = 'checkout-' + crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  return { ok: true, identity: { id, root, gitDirectory, commonDirectory } };
}

export function inspectGitCheckoutReadIdentity(checkoutRoot: string): GitCheckoutIdentityInspection {
  let output: string[];
  try {
    output = execFileSync('git', checkoutIdentityArgs(checkoutRoot), {
      env: checkoutIdentityEnvironment(),
      timeout: 4000, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim().split('\n');
  } catch {
    return { ok: false, reason: 'not-git' };
  }
  if (output.length !== 3) return { ok: false, reason: 'not-git' };
  try {
    const resolved = output.map(value => fs.realpathSync(value)) as [string, string, string];
    if (!sameFilesystemPath(resolved[0], checkoutRoot)) return { ok: false, reason: 'subdirectory' };
    const statIdentity = (directory: string) => fs.statSync(directory, { bigint: true });
    return buildCheckoutIdentity(checkoutRoot, resolved, [
      statIdentity(resolved[0]),
      statIdentity(resolved[1]),
      statIdentity(resolved[2]),
    ]);
  } catch {
    return { ok: false, reason: 'not-git' };
  }
}

export async function inspectGitCheckoutReadIdentityAsync(checkoutRoot: string): Promise<GitCheckoutIdentityInspection> {
  let output: string[];
  try {
    const { stdout } = await execFileAsync('git', checkoutIdentityArgs(checkoutRoot), {
      env: checkoutIdentityEnvironment(),
      timeout: 4000, maxBuffer: 64 * 1024,
    });
    output = stdout.trim().split('\n');
  } catch {
    return { ok: false, reason: 'not-git' };
  }
  if (output.length !== 3) return { ok: false, reason: 'not-git' };
  try {
    const resolved = await Promise.all(output.map(value => fs.promises.realpath(value))) as [string, string, string];
    if (!sameFilesystemPath(resolved[0], checkoutRoot)) return { ok: false, reason: 'subdirectory' };
    const stats = await Promise.all([
      fs.promises.stat(resolved[0], { bigint: true }),
      fs.promises.stat(resolved[1], { bigint: true }),
      fs.promises.stat(resolved[2], { bigint: true }),
    ]) as [fs.BigIntStats, fs.BigIntStats, fs.BigIntStats];
    return buildCheckoutIdentity(checkoutRoot, resolved, stats);
  } catch {
    return { ok: false, reason: 'not-git' };
  }
}

/** A read location survives branch/file edits, but not replacement of its checkout or Git metadata. */
export function observeGitCheckoutReadIdentity(checkoutRoot: string): GitCheckoutReadIdentity {
  const result = inspectGitCheckoutReadIdentity(checkoutRoot);
  if (!result.ok) {
    throw new Error(result.reason === 'subdirectory'
      ? 'Git checkout root differs from the selected directory.'
      : 'Git checkout identity is unavailable.');
  }
  return result.identity;
}

export async function observeGitCheckoutReadIdentityAsync(checkoutRoot: string): Promise<GitCheckoutReadIdentity> {
  const result = await inspectGitCheckoutReadIdentityAsync(checkoutRoot);
  if (!result.ok) {
    throw new Error(result.reason === 'subdirectory'
      ? 'Git checkout root differs from the selected directory.'
      : 'Git checkout identity is unavailable.');
  }
  return result.identity;
}

export function gitCheckoutReadId(checkoutRoot: string): string {
  return observeGitCheckoutReadIdentity(checkoutRoot).id;
}
