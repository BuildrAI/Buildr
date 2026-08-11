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
  let value = resolved;
  try { value = fs.realpathSync(resolved); } catch { /* retain Git's absolute spelling */ }
  return { value, identity: normalizeFilesystemPath(resolved) };
}

export function normalizeFilesystemPath(value, platform = process.platform) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  let normalized = String(value);
  if (platform === 'win32') {
    normalized = normalized
      .replace(/^\\\\\?\\UNC\\/i, '\\\\')
      .replace(/^\\\\\?\\/i, '');
  }
  normalized = pathApi.normalize(normalized);
  const root = pathApi.parse(normalized).root;
  while (normalized.length > root.length && /[\\/]$/.test(normalized)) normalized = normalized.slice(0, -1);
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function filesystemPathCandidates(value) {
  const candidates = [path.resolve(value)];
  for (const realpath of [fs.realpathSync, fs.realpathSync.native]) {
    try { candidates.push(realpath(value)); } catch { /* retain the other observable forms */ }
  }
  return new Set(candidates.map((candidate) => normalizeFilesystemPath(candidate)));
}

export function sameFilesystemPath(left, right) {
  try {
    const leftCandidates = filesystemPathCandidates(left);
    const rightCandidates = filesystemPathCandidates(right);
    if ([...leftCandidates].some((candidate) => rightCandidates.has(candidate))) return true;
    const leftStat = fs.statSync(left, { bigint: true });
    const rightStat = fs.statSync(right, { bigint: true });
    return leftStat.ino !== 0n && rightStat.ino !== 0n && leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

export function sameGitCheckoutIdentity(left, right) {
  return Boolean(left && right
    && (left.gitDirectoryIdentity === right.gitDirectoryIdentity || sameFilesystemPath(left.gitDirectory, right.gitDirectory))
    && (left.gitCommonDirectoryIdentity === right.gitCommonDirectoryIdentity || sameFilesystemPath(left.gitCommonDirectory, right.gitCommonDirectory))
    && left.linkedWorktree === right.linkedWorktree);
}

export function observeGitCheckoutIdentity(root) {
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
