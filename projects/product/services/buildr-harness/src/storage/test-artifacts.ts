import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { live } from '../process/ownership.ts';
import { ownStorageDirectory, safeStoragePath, storageCandidate, type StorageCandidate, type StorageUse } from './files.ts';

const testStateName = /^buildr-test-state-[A-Za-z0-9]+$/;
const transientEvidenceName = /^buildr-[a-z-]+-evidence-[A-Za-z0-9]+$/;
const maxTimingEvidenceBytes = 32 * 1024 * 1024;

function sameExpectedPath(candidate: unknown, expected: string): boolean {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) return false;
  if (candidate === expected) return true;
  try {
    const resolvedExpected = path.join(fs.realpathSync(path.dirname(expected)), path.basename(expected));
    if (candidate === resolvedExpected) return true;
    const resolvedCandidate = path.join(fs.realpathSync(path.dirname(candidate)), path.basename(candidate));
    return resolvedCandidate === resolvedExpected;
  } catch {
    return false;
  }
}

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
      return value.schemaVersion === 1 && sameExpectedPath(value.root, expectedRoot) && Number.isSafeInteger(value.producerPid) && value.producerPid > 1 &&
        typeof value.completed === 'boolean' && (value.completed || !live(value.producerPid));
    }
    if (transientEvidenceName.test(name)) {
      const timing = path.join(directory, 'timing.json');
      if (!ownRegularFile(timing, maxTimingEvidenceBytes)) return false;
      const value = JSON.parse(fs.readFileSync(timing, 'utf8'));
      return value.schemaVersion === 'buildr.verification-timing/v1' && sameExpectedPath(value.summaryPath, path.join(expectedRoot, 'timing.json')) &&
        value.evidenceLifecycle?.evidenceRetention === 'transient' && value.evidenceLifecycle?.cleanupStatus === 'retained' &&
        sameExpectedPath(value.evidenceLifecycle?.cleanupReference, expectedRoot);
    }
    return false;
  } catch { return false; }
}

function scanArtifactDirectory(boundaryRoot: string, temporary: string, use: StorageUse, cutoff: number, bindBoundary = false): StorageCandidate[] {
  if (temporary === boundaryRoot ? !ownStorageDirectory(boundaryRoot) : !safeStoragePath(boundaryRoot, temporary)) return [];
  const items: StorageCandidate[] = [];
  for (const name of fs.readdirSync(temporary)) {
    if (!testStateName.test(name) && !transientEvidenceName.test(name)) continue;
    const directory = path.join(temporary, name);
    // Unknown legacy directories are diagnostic inventory, never disposable
    // merely because their name resembles one of our test roots.
    const item = storageCandidate(boundaryRoot, 'test-artifact', directory, directory, use, cutoff);
    if (bindBoundary) item.boundaryRoot = boundaryRoot;
    if (!testArtifactUnreferenced(directory)) { item.eligible = false; item.reason = 'test_creator_active_or_unproven'; }
    items.push(item);
  }
  return items;
}

export function testArtifactCandidates(root: string, config: string, use: StorageUse, cutoff: number): StorageCandidate[] {
  return scanArtifactDirectory(root, path.join(config, 'tmp'), use, cutoff);
}

export function defaultHostTempRoots(): string[] {
  if (process.env.BUILDR_TEST_STATE_REQUIRED === '1' || Boolean(process.env.NODE_TEST_CONTEXT)) return [];
  const raw = [process.env.TMPDIR, process.env.TEMP, process.env.TMP, os.tmpdir(), process.platform === 'darwin' ? '/private/tmp' : '/tmp'];
  const roots: string[] = [], seen = new Set<string>();
  for (const entry of raw) {
    if (!entry) continue;
    try {
      const resolved = fs.realpathSync(entry);
      const stat = fs.lstatSync(resolved);
      if (!stat.isDirectory() || stat.isSymbolicLink() || seen.has(resolved)) continue;
      seen.add(resolved);
      roots.push(resolved);
    } catch { /* Ignore missing or unresolvable temp roots. */ }
  }
  return roots;
}

export function hostTempArtifactCandidates(use: StorageUse, cutoff: number, roots = defaultHostTempRoots()): StorageCandidate[] {
  const items: StorageCandidate[] = [], seen = new Set<string>();
  for (const entry of roots) {
    if (!entry) continue;
    let boundary: string;
    try {
      boundary = fs.realpathSync(entry);
      const stat = fs.lstatSync(boundary);
      if (!stat.isDirectory() || stat.isSymbolicLink() || boundary === path.parse(boundary).root || seen.has(boundary)) continue;
      seen.add(boundary);
    } catch { continue; }
    items.push(...scanArtifactDirectory(boundary, boundary, use, cutoff, true));
  }
  return items;
}
