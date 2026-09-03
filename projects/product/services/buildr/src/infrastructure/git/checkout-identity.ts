import fs from 'node:fs';
import path from 'node:path';

import { spawnSync } from '../process.ts';
import { normalizeFilesystemPath, sameFilesystemPath } from '../filesystem/filesystem-path-identity.ts';

export { normalizeFilesystemPath, sameFilesystemPath } from '../filesystem/filesystem-path-identity.ts';

function gitPath(root: any, argument: any): any  {
  const observed = spawnSync('git', ['-C', root, 'rev-parse', argument], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (observed.status !== 0 || !observed.stdout?.trim()) return null;
  const resolved = path.resolve(root, observed.stdout.trim());
  let value = resolved;
  try { value = fs.realpathSync(resolved); } catch { /* retain Git's absolute spelling */ }
  return { value, identity: normalizeFilesystemPath(resolved) };
}

export function sameGitCheckoutIdentity(left: any, right: any): any  {
  return Boolean(left && right
    && (left.gitDirectoryIdentity === right.gitDirectoryIdentity || sameFilesystemPath(left.gitDirectory, right.gitDirectory))
    && (left.gitCommonDirectoryIdentity === right.gitCommonDirectoryIdentity || sameFilesystemPath(left.gitCommonDirectory, right.gitCommonDirectory))
    && left.linkedWorktree === right.linkedWorktree);
}

export function observeGitCheckoutIdentity(root: any): any  {
  const checkoutRoot = gitPath(root, '--show-toplevel');
  const gitDirectory = gitPath(root, '--git-dir');
  const gitCommonDirectory = gitPath(root, '--git-common-dir');
  if (!checkoutRoot || !gitDirectory || !gitCommonDirectory) return null;
  return {
    checkoutRoot: checkoutRoot.value,
    checkoutRootIdentity: checkoutRoot.identity,
    gitDirectory: gitDirectory.value,
    gitDirectoryIdentity: gitDirectory.identity,
    gitCommonDirectory: gitCommonDirectory.value,
    gitCommonDirectoryIdentity: gitCommonDirectory.identity,
    linkedWorktree: gitDirectory.identity !== gitCommonDirectory.identity
      && !sameFilesystemPath(gitDirectory.value, gitCommonDirectory.value),
  };
}
