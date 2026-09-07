import fs from 'node:fs';
import path from 'node:path';

export function workspaceSymlinkSegment(targetRoot: string, relativePath: string): string | null {
  const normalized = path.normalize(relativePath);
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) throw new Error(`Workspace path must stay relative: ${relativePath}`);
  let current = targetRoot;
  for (const segment of normalized.split(path.sep)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) continue;
    if (fs.lstatSync(current).isSymbolicLink()) return path.relative(targetRoot, current).split(path.sep).join('/');
  }
  return null;
}
