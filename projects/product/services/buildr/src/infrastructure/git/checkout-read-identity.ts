import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sameFilesystemPath } from '../filesystem/filesystem-path-identity.ts';

export type GitCheckoutReadIdentity = { id: string; root: string; gitDirectory: string; commonDirectory: string };

/** A read location survives branch/file edits, but not replacement of its checkout or Git metadata. */
export function observeGitCheckoutReadIdentity(checkoutRoot: string): GitCheckoutReadIdentity {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const output = execFileSync('git', ['--no-optional-locks', '--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', checkoutRoot,
    'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'], {
    env: { ...env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' },
    timeout: 4000, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  }).toString().trim().split('\n');
  if (output.length !== 3) throw new Error('Git checkout identity is unavailable.');
  const [root, gitDirectory, commonDirectory] = output.map(value => fs.realpathSync(value));
  if (!sameFilesystemPath(root, checkoutRoot)) throw new Error('Git checkout root differs from the selected directory.');
  const statIdentity = (directory: string) => {
    const stat = fs.statSync(directory, { bigint: true });
    if (!stat.isDirectory()) throw new Error('Git checkout identity is not a directory.');
    return { dev: String(stat.dev), ino: String(stat.ino), birthtime: String(stat.birthtimeNs) };
  };
  const identity = { root, gitDirectory, commonDirectory, checkout: statIdentity(root), git: statIdentity(gitDirectory), common: statIdentity(commonDirectory) };
  const id = 'checkout-' + crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  return { id, root, gitDirectory, commonDirectory };
}

export function gitCheckoutReadId(checkoutRoot: string): string {
  return observeGitCheckoutReadIdentity(checkoutRoot).id;
}
