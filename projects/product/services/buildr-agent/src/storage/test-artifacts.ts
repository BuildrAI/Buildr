import fs from 'node:fs';
import path from 'node:path';
import { live } from '../process/ownership.ts';
import { safeStoragePath, storageCandidate, type StorageCandidate, type StorageUse } from './files.ts';

/** Produced only by Buildr's disposable development-test state helper. This
 * marker grants no access outside the already verified connection tmp root. */
export function testArtifactUnreferenced(directory: string, expectedRoot = directory): boolean {
  try {
    const marker = path.join(directory, '.buildr-test-state.json'), stat = fs.lstatSync(marker);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4096 || process.getuid && stat.uid !== process.getuid()) return false;
    const value = JSON.parse(fs.readFileSync(marker, 'utf8'));
    return value.schemaVersion === 1 && value.root === expectedRoot && Number.isSafeInteger(value.producerPid) && value.producerPid > 1 &&
      typeof value.completed === 'boolean' && (value.completed || !live(value.producerPid));
  } catch { return false; }
}

export function testArtifactCandidates(root: string, config: string, use: StorageUse, cutoff: number): StorageCandidate[] {
  const temporary = path.join(config, 'tmp');
  if (!safeStoragePath(root, temporary)) return [];
  const items: StorageCandidate[] = [];
  for (const name of fs.readdirSync(temporary)) {
    if (!/^buildr-test-state-[A-Za-z0-9]+$/.test(name)) continue;
    const directory = path.join(temporary, name);
    // Unknown legacy directories are diagnostic inventory, never disposable
    // merely because their name resembles one of our test roots.
    const item = storageCandidate(root, 'test-artifact', directory, directory, use, cutoff);
    if (!testArtifactUnreferenced(directory)) { item.eligible = false; item.reason = 'test_creator_active_or_unproven'; }
    items.push(item);
  }
  return items;
}
