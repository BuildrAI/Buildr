import fs from 'node:fs';
import path from 'node:path';

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

function sameFilesystemPath(left, right) {
  try {
    const leftStat = fs.statSync(left);
    const rightStat = fs.statSync(right);
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
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
