import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/** Missing leaves are only known absent when their nearest existing ancestor can be resolved. */
export function isConfirmedMissingPath(value: string): boolean {
  try {
    const resolved = path.resolve(value);
    if (fs.lstatSync(resolved, { throwIfNoEntry: false })) return false;
    let ancestor = path.dirname(resolved);
    while (!fs.lstatSync(ancestor, { throwIfNoEntry: false })) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) return false;
      ancestor = parent;
    }
    fs.realpathSync.native(ancestor);
    return true;
  } catch { return false; }
}

export function normalizeFilesystemPath(value: any, platform: any = process.platform): any  {
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

function filesystemPathCandidates(value: any): any  {
  const candidates: any[] = [path.resolve(value)];
  for (const realpath of [fs.realpathSync, fs.realpathSync.native]) {
    try { candidates.push(realpath(value)); } catch { /* retain the other observable forms */ }
  }
  return new Set(candidates.map((candidate: any) => normalizeFilesystemPath(candidate)));
}

export function sameFilesystemPath(left: any, right: any): any  {
  try {
    const leftCandidates = filesystemPathCandidates(left);
    const rightCandidates = filesystemPathCandidates(right);
    if ([...leftCandidates].some((candidate: any) => rightCandidates.has(candidate))) return true;
    const leftStat = fs.statSync(left, { bigint: true });
    const rightStat = fs.statSync(right, { bigint: true });
    return leftStat.ino !== 0n && rightStat.ino !== 0n && leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

// Path spelling alone cannot express containment: 8.3 aliases, junctions, and
// differing realpath forms name the same directories differently. Walk the
// ancestry and compare filesystem identity at each level.
export function insideFilesystemPath(parent: any, child: any): any  {
  const container = path.resolve(String(parent));
  let current = path.resolve(String(child));
  while (true) {
    if (sameFilesystemPath(current, container)) return true;
    const next = path.dirname(current);
    if (next === current) return false;
    current = next;
  }
}
