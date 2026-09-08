import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_EXCLUDED_DIRECTORIES = new Set(['.cursor', '.agents', '.claude', '.trae', '.qoder', '.codebuddy', 'node_modules']);

export function collectFiles(entryPath: string, excludedDirectories: ReadonlySet<string> = DEFAULT_EXCLUDED_DIRECTORIES): string[] {
  const stat = fs.statSync(entryPath, { throwIfNoEntry: false });
  if (stat?.isFile()) return [entryPath];
  if (!stat?.isDirectory()) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(entryPath).sort()) {
    if (excludedDirectories.has(entry)) continue;
    files.push(...collectFiles(path.join(entryPath, entry), excludedDirectories));
  }
  return files;
}
