import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export function pathIsEqualOrInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function assertSafeAssetTarget(
  targetRoot: string,
  target: string,
  containerRoot: string,
  label = 'Managed asset target',
  dependencies: { productRoot(): string; workspaceSymlinkSegment(root: string, relative: string): string | null },
): string {
  const resolvedTarget = path.resolve(target);
  const resolvedContainer = path.resolve(containerRoot);
  const relative = path.relative(resolvedContainer, resolvedTarget);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} must be a strict descendant of ${resolvedContainer}: ${resolvedTarget}`);
  const protectedRoots = [targetRoot, dependencies.productRoot(), process.cwd(), os.homedir(), path.parse(resolvedTarget).root].map((item) => path.resolve(item));
  for (const protectedRoot of protectedRoots) if (resolvedTarget === protectedRoot || pathIsEqualOrInside(protectedRoot, resolvedTarget)) throw new Error(`${label} is protected: ${resolvedTarget}`);
  const targetRelative = path.relative(targetRoot, resolvedTarget);
  if (!targetRelative.startsWith('..') && !path.isAbsolute(targetRelative)) {
    const symlink = dependencies.workspaceSymlinkSegment(targetRoot, targetRelative);
    if (symlink) throw new Error(`${label} crosses a symbolic link: ${symlink}`);
  }
  return resolvedTarget;
}
