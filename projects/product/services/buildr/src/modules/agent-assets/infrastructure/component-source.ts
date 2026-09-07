import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function assetIntegrity(assetPath: string): string | null {
  const stat = fs.statSync(assetPath, { throwIfNoEntry: false });
  if (!stat) return null;
  const hash = crypto.createHash('sha256');
  if (fs.lstatSync(assetPath).isSymbolicLink()) throw new Error(`Integrity input must not be a symbolic link: ${assetPath}`);
  if (stat.isFile()) hash.update(fs.readFileSync(assetPath));
  else {
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Integrity input contains a symbolic link: ${absolute}`);
        if (entry.isDirectory()) visit(absolute);
        else if (entry.isFile()) files.push(absolute);
      }
    };
    visit(assetPath);
    for (const file of files.sort((left, right) => left.localeCompare(right))) {
      const relative = path.relative(assetPath, file).split(path.sep).join('/');
      hash.update(relative);
      hash.update('\0');
      hash.update(fs.readFileSync(file));
      hash.update('\0');
    }
  }
  return `sha256-${hash.digest('hex')}`;
}
