import fs from 'node:fs';
import path from 'node:path';
import { live } from '../process/ownership.ts';
import { safeStoragePath, storageCandidate, type StorageCandidate, type StorageUse } from './files.ts';

const testStateName = /^buildr-test-state-[A-Za-z0-9]+$/;
const transientEvidenceName = /^buildr-[a-z-]+-evidence-[A-Za-z0-9]+$/;
const maxTimingEvidenceBytes = 32 * 1024 * 1024;

function ownRegularFile(file: string, maxBytes: number): boolean {
  const stat = fs.lstatSync(file);
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= maxBytes &&
    (!process.getuid || stat.uid === process.getuid());
}

/** Produced only by Buildr's disposable development-test state helper. This
 * marker grants no access outside the already verified connection tmp root. */
export function testArtifactUnreferenced(directory: string, expectedRoot = directory): boolean {
  try {
    const name = path.basename(expectedRoot);
    if (testStateName.test(name)) {
      const marker = path.join(directory, '.buildr-test-state.json');
      if (!ownRegularFile(marker, 4096)) return false;
      const value = JSON.parse(fs.readFileSync(marker, 'utf8'));
      return value.schemaVersion === 1 && value.root === expectedRoot && Number.isSafeInteger(value.producerPid) && value.producerPid > 1 &&
        typeof value.completed === 'boolean' && (value.completed || !live(value.producerPid));
    }
    if (transientEvidenceName.test(name)) {
      const timing = path.join(directory, 'timing.json');
      if (!ownRegularFile(timing, maxTimingEvidenceBytes)) return false;
      const value = JSON.parse(fs.readFileSync(timing, 'utf8'));
      return value.schemaVersion === 'buildr.verification-timing/v1' && value.summaryPath === path.join(expectedRoot, 'timing.json') &&
        value.evidenceLifecycle?.evidenceRetention === 'transient' && value.evidenceLifecycle?.cleanupStatus === 'retained' &&
        value.evidenceLifecycle?.cleanupReference === expectedRoot;
    }
    return false;
  } catch { return false; }
}

export function testArtifactCandidates(root: string, config: string, use: StorageUse, cutoff: number): StorageCandidate[] {
  const temporary = path.join(config, 'tmp');
  if (!safeStoragePath(root, temporary)) return [];
  const items: StorageCandidate[] = [];
  for (const name of fs.readdirSync(temporary)) {
    if (!testStateName.test(name) && !transientEvidenceName.test(name)) continue;
    const directory = path.join(temporary, name);
    // Unknown legacy directories are diagnostic inventory, never disposable
    // merely because their name resembles one of our test roots.
    const item = storageCandidate(root, 'test-artifact', directory, directory, use, cutoff);
    if (!testArtifactUnreferenced(directory)) { item.eligible = false; item.reason = 'test_creator_active_or_unproven'; }
    items.push(item);
  }
  return items;
}
