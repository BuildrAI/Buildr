import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { spawnSync } from '../process.mjs';

function gitPath(root, argument) {
  const observed = spawnSync('git', ['-C', root, 'rev-parse', argument], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (observed.status !== 0 || !observed.stdout?.trim()) return null;
  const resolved = path.resolve(root, observed.stdout.trim());
  try { return fs.realpathSync(resolved); } catch { return resolved; }
}

export function sameFilesystemPath(left, right) {
  try {
    const leftReal = fs.realpathSync.native(left);
    const rightReal = fs.realpathSync.native(right);
    if (process.platform === 'win32'
      ? leftReal.toLowerCase() === rightReal.toLowerCase()
      : leftReal === rightReal) return true;
    const leftStat = fs.statSync(left);
    const rightStat = fs.statSync(right);
    return leftStat.ino !== 0 && rightStat.ino !== 0 && leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

export function sameGitCheckoutIdentity(left, right) {
  return Boolean(left && right
    && sameFilesystemPath(left.gitDirectory, right.gitDirectory)
    && sameFilesystemPath(left.gitCommonDirectory, right.gitCommonDirectory)
    && left.linkedWorktree === right.linkedWorktree);
}

export function observeGitCheckoutIdentity(root) {
  const checkoutRoot = gitPath(root, '--show-toplevel');
  const gitDirectory = gitPath(root, '--git-dir');
  const gitCommonDirectory = gitPath(root, '--git-common-dir');
  if (!checkoutRoot || !gitDirectory || !gitCommonDirectory) return null;
  return {
    checkoutRoot,
    gitDirectory,
    gitCommonDirectory,
    linkedWorktree: !sameFilesystemPath(gitDirectory, gitCommonDirectory) && gitDirectory !== gitCommonDirectory,
  };
}
