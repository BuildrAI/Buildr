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

export function observeGitCheckoutIdentity(root) {
  const checkoutRoot = gitPath(root, '--show-toplevel');
  const gitDirectory = gitPath(root, '--git-dir');
  const gitCommonDirectory = gitPath(root, '--git-common-dir');
  if (!checkoutRoot || !gitDirectory || !gitCommonDirectory) return null;
  return {
    checkoutRoot,
    gitDirectory,
    gitCommonDirectory,
    linkedWorktree: gitDirectory !== gitCommonDirectory,
  };
}
