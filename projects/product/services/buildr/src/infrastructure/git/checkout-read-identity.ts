import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { sameFilesystemPath } from '../filesystem/filesystem-path-identity.ts';

const execFileAsync = promisify(execFile);

export type GitCheckoutReadIdentity = { id: string; root: string; gitDirectory: string; commonDirectory: string };

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

/** A read location survives branch/file edits, but not replacement of its checkout or Git metadata. */
export function observeGitCheckoutReadIdentity(checkoutRoot: string): GitCheckoutReadIdentity {
  const output = execFileSync('git', checkoutIdentityArgs(checkoutRoot), {
    env: checkoutIdentityEnvironment(),
    timeout: 4000, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  }).toString().trim().split('\n');
  if (output.length !== 3) throw new Error('Git checkout identity is unavailable.');
  const [root, gitDirectory, commonDirectory] = output.map(value => fs.realpathSync(value));
  if (!sameFilesystemPath(root, checkoutRoot)) throw new Error('Git checkout root differs from the selected directory.');
  const statIdentity = (directory: string) => statIdentityFromStat(fs.statSync(directory, { bigint: true }));
  const identity = { root, gitDirectory, commonDirectory, checkout: statIdentity(root), git: statIdentity(gitDirectory), common: statIdentity(commonDirectory) };
  const id = 'checkout-' + crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  return { id, root, gitDirectory, commonDirectory };
}

export async function observeGitCheckoutReadIdentityAsync(checkoutRoot: string): Promise<GitCheckoutReadIdentity> {
  const { stdout } = await execFileAsync('git', checkoutIdentityArgs(checkoutRoot), {
    env: checkoutIdentityEnvironment(),
    timeout: 4000, maxBuffer: 64 * 1024,
  });
  const output = stdout.trim().split('\n');
  if (output.length !== 3) throw new Error('Git checkout identity is unavailable.');
  const [root, gitDirectory, commonDirectory] = await Promise.all(output.map(value => fs.promises.realpath(value)));
  if (!sameFilesystemPath(root, checkoutRoot)) throw new Error('Git checkout root differs from the selected directory.');
  const [checkoutStat, gitStat, commonStat] = await Promise.all([
    fs.promises.stat(root, { bigint: true }),
    fs.promises.stat(gitDirectory, { bigint: true }),
    fs.promises.stat(commonDirectory, { bigint: true }),
  ]);
  const identity = {
    root, gitDirectory, commonDirectory,
    checkout: statIdentityFromStat(checkoutStat),
    git: statIdentityFromStat(gitStat),
    common: statIdentityFromStat(commonStat),
  };
  const id = 'checkout-' + crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  return { id, root, gitDirectory, commonDirectory };
}

export function gitCheckoutReadId(checkoutRoot: string): string {
  return observeGitCheckoutReadIdentity(checkoutRoot).id;
}
