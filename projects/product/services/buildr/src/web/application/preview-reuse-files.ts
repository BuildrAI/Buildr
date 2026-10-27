import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type CopyStats = { files: number; bytes: number };
export type CopySkip = (input: { relative: string; name: string; directory: boolean }) => boolean;

function privateDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('preview_reuse_target_unsafe');
  fs.chmodSync(directory, 0o700);
}

function sourceDirectory(source: string): fs.Stats {
  const stat = fs.lstatSync(source, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) throw new Error('preview_reuse_source_invalid');
  return stat;
}

export function assertWithinRoot(root: string, target: string): void {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);
  if (resolved === resolvedRoot || !resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('preview_reuse_path_outside_root');
}

export function pathExists(file: string): boolean {
  return Boolean(fs.lstatSync(file, { throwIfNoEntry: false }));
}

export function treeStats(root: string): CopyStats {
  const stats: CopyStats = { files: 0, bytes: 0 };
  const walk = (current: string, stack: Set<string>): void => {
    const info = fs.lstatSync(current);
    if (info.isSymbolicLink()) {
      const actual = fs.realpathSync(current);
      const real = fs.statSync(actual);
      if (real.isDirectory()) {
        if (stack.has(actual)) throw new Error('preview_reuse_source_cycle');
        stack.add(actual);
        for (const name of fs.readdirSync(actual)) walk(path.join(actual, name), stack);
        stack.delete(actual);
      } else if (real.isFile()) {
        stats.files += 1;
        stats.bytes += real.size;
      }
      return;
    }
    if (info.isDirectory()) {
      for (const name of fs.readdirSync(current)) walk(path.join(current, name), stack);
      return;
    }
    if (info.isFile()) {
      stats.files += 1;
      stats.bytes += info.size;
    }
  };
  sourceDirectory(root);
  walk(root, new Set([fs.realpathSync(root)]));
  return stats;
}

function copyTree(source: string, target: string, skip?: CopySkip): CopyStats {
  const stats: CopyStats = { files: 0, bytes: 0 };
  privateDirectory(target);
  const included = (actual: string, relative: string, name: string): boolean => {
    if (!skip) return true;
    return !skip({ relative, name, directory: fs.statSync(actual).isDirectory() });
  };
  const copyEntry = (from: string, to: string, relative: string, stack: Set<string>): void => {
    const link = fs.lstatSync(from);
    const actual = link.isSymbolicLink() ? fs.realpathSync(from) : from;
    const info = fs.statSync(actual);
    if (info.isDirectory()) {
      const real = fs.realpathSync(actual);
      if (stack.has(real)) throw new Error('preview_reuse_source_cycle');
      privateDirectory(to);
      stack.add(real);
      for (const name of fs.readdirSync(actual)) {
        const child = path.join(actual, name);
        const childRelative = relative ? `${relative}/${name}` : name;
        if (!included(child, childRelative, name)) continue;
        copyEntry(child, path.join(to, name), childRelative, stack);
      }
      stack.delete(real);
      return;
    }
    if (!info.isFile()) throw new Error('preview_reuse_source_invalid');
    fs.copyFileSync(actual, to);
    // Owner-only access; only the source execute bits stay executable.
    fs.chmodSync(to, info.mode & 0o111 ? 0o700 : 0o600);
    stats.files += 1;
    stats.bytes += info.size;
  };
  sourceDirectory(source);
  const stack = new Set([fs.realpathSync(source)]);
  for (const name of fs.readdirSync(source)) {
    const child = path.join(source, name);
    if (!included(child, name, name)) continue;
    copyEntry(child, path.join(target, name), name, stack);
  }
  return stats;
}

/** Copies into a sibling staging directory, then publishes by rename. Existing targets need a refresh. */
export function replacePreviewDirectory(input: {
  source: string;
  target: string;
  refresh: boolean;
  skip?: CopySkip;
}): { stats: CopyStats; replaced: boolean } {
  const target = path.resolve(input.target);
  const parent = path.dirname(target);
  privateDirectory(parent);
  const current = fs.lstatSync(target, { throwIfNoEntry: false });
  if (current && (!current.isDirectory() || current.isSymbolicLink())) throw new Error('preview_reuse_target_unsafe');
  if (current && !input.refresh) return { stats: treeStats(target), replaced: false };
  const staging = path.join(parent, `.${path.basename(target)}.staging-${randomUUID()}`);
  let backup: string | null = null;
  try {
    const stats = copyTree(input.source, staging, input.skip);
    if (current) {
      backup = path.join(parent, `.${path.basename(target)}.backup-${randomUUID()}`);
      fs.renameSync(target, backup);
    }
    try {
      fs.renameSync(staging, target);
    } catch (error) {
      if (backup) fs.renameSync(backup, target);
      throw error;
    }
    if (backup) { fs.rmSync(backup, { recursive: true, force: true }); backup = null; }
    return { stats, replaced: Boolean(current) };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    if (backup) {
      try { if (!pathExists(target)) fs.renameSync(backup, target); } catch { /* Keep the previous copy when restoration itself fails. */ }
    }
  }
}
