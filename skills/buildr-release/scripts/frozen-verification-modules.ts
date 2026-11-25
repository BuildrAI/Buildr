import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Resolve a verification module inside the frozen release checkout when present. */
export function resolveFrozenVerificationModuleUrl(repo: string | undefined, relativePath: string): string | null {
  if (!repo) return null;
  const file = path.resolve(repo, 'projects/product/services/buildr/test/verification', relativePath);
  return fs.statSync(file, { throwIfNoEntry: false })?.isFile() ? pathToFileURL(file).href : null;
}

/** Load verification rules and planners from the frozen release checkout first;
 * fall back to static workspace modules only for minimal test fixtures without product trees. */
export async function importFrozenVerificationModule<T>(
  repo: string | undefined,
  relativePath: string,
  fallback: () => Promise<T>,
): Promise<T> {
  const url = resolveFrozenVerificationModuleUrl(repo, relativePath);
  return url ? (await import(url)) as T : fallback();
}
