import fs from 'node:fs';
import path from 'node:path';
import type { Dirent } from 'node:fs';

type ArchiveIo = {
  existsSync(file: string): boolean;
  readdirSync(directory: string, options: { withFileTypes: true }): Dirent[];
};

/**
 * Upstream keeps a change name that already starts with `YYYY-MM-DD-` unchanged when
 * archiving; only an undated name gains the date prefix. Accept both spellings so a
 * dated change is still recognised after `openspec archive` moves it.
 */
export function archivedChangeRoots(archiveRoot: string, change: string, io: ArchiveIo = fs): string[] {
  if (!io.existsSync(archiveRoot)) return [];
  return io.readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && (entry.name === change || entry.name.endsWith(`-${change}`)))
    .map((entry) => path.join(archiveRoot, entry.name))
    .filter((root) => io.existsSync(path.join(root, '.openspec.yaml')));
}
