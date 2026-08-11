import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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
