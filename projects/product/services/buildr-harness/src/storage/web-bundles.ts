import fs from 'node:fs';
import path from 'node:path';
import { AgentServiceError } from '../domain/agent-state.ts';
import { currentRuntime, pendingRuntime } from '../process/cleanup.ts';
import { live, readPrivate, readProcessInstances } from '../process/ownership.ts';
import { computeHarnessWebBundle } from '../process/web-assets.ts';
import { HarnessWebSessions } from '../process/web-session-store.ts';
import { safeStoragePath, storageCandidate, storageVersion, type StorageCandidate, type StorageUse } from './files.ts';

const BUNDLE_ID_PATTERN = /^[a-f0-9]{64}$/;
const STAGE_DIR_PATTERN = /^\.stage-[A-Za-z0-9_-]+$/;
const STAGE_GRACE_MS = 15 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export interface ProtectedWebBundles {
  complete: boolean;
  bundles: ReadonlySet<string>;
}

function validBundleManifest(directory: string, id: string): boolean {
  try {
    const manifest = readPrivate<{ id: string; files: Record<string, string> }>(path.join(directory, 'bundle.json'));
    return Boolean(
      manifest &&
      manifest.id === id &&
      manifest.files &&
      typeof manifest.files === 'object' &&
      !Array.isArray(manifest.files) &&
      Object.keys(manifest.files).length > 0,
    );
  } catch {
    return false;
  }
}

function addRuntimeBundle(bundles: Set<string>, runtimeDirectory: string | undefined): void {
  if (!runtimeDirectory) return;
  const staticRoot = path.join(runtimeDirectory, 'build', 'harness-web-dist');
  try {
    bundles.add(computeHarnessWebBundle(staticRoot).id);
  } catch (error) {
    if (error instanceof AgentServiceError && error.code === 'agent_web_payload_missing') return;
    throw error;
  }
}

/** Collects every bundle digest currently referenced by live web sessions, valid tickets,
 * active listeners, or current/pending/live runtime units. Fail-closed on corrupt metadata. */
export function protectedWebBundles(dataRoot: string, now = Date.now()): ProtectedWebBundles {
  const bundles = new Set<string>();
  try {
    const state = new HarnessWebSessions(dataRoot, () => now).read();
    if (state) {
      for (const ticket of state.tickets) {
        if (ticket.expiresAt > now && BUNDLE_ID_PATTERN.test(ticket.bundle)) bundles.add(ticket.bundle);
      }
      for (const session of state.sessions) {
        if (session.expiresAt > now && BUNDLE_ID_PATTERN.test(session.bundle)) bundles.add(session.bundle);
      }
      if (state.listener && !state.listener.released && state.listener.bundle && BUNDLE_ID_PATTERN.test(state.listener.bundle)) {
        bundles.add(state.listener.bundle);
      }
    }
    const protectedRuntimes = new Set<string>();
    const current = currentRuntime(dataRoot);
    if (current?.directory) protectedRuntimes.add(current.directory);
    const pending = pendingRuntime(dataRoot);
    if (pending?.directory) protectedRuntimes.add(pending.directory);
    for (const record of readProcessInstances(dataRoot)) {
      if (live(record.identity.pid) && record.identity.runtime.directory) {
        protectedRuntimes.add(record.identity.runtime.directory);
      }
    }
    for (const directory of protectedRuntimes) addRuntimeBundle(bundles, directory);
    return { complete: true, bundles };
  } catch {
    return { complete: false, bundles };
  }
}

export function harnessWebBundleUnreferenced(dataRoot: string, directory: string, expectedPath = directory, now = Date.now()): boolean {
  try {
    const root = path.join(path.resolve(dataRoot), 'agent-service');
    const bundlesRoot = path.join(root, 'harness-web', 'bundles');
    if (path.dirname(expectedPath) !== bundlesRoot || path.dirname(directory) !== bundlesRoot || !safeStoragePath(root, directory)) return false;
    const name = path.basename(expectedPath);
    if (STAGE_DIR_PATTERN.test(name)) {
      return storageVersion(directory).modified <= now - STAGE_GRACE_MS;
    }
    if (!BUNDLE_ID_PATTERN.test(name) || !validBundleManifest(directory, name)) return false;
    const references = protectedWebBundles(dataRoot, now);
    if (!references.complete || references.bundles.has(name)) return false;
    return storageVersion(directory).modified <= now - DAY_MS;
  } catch {
    return false;
  }
}

/** Enumerates stale Harness web static bundles and abandoned `.stage-*` directories. */
export function harnessWebBundleCandidates(
  dataRoot: string,
  use: StorageUse,
  cutoff: number,
  now = Date.now(),
  targets?: ReadonlySet<string>,
): StorageCandidate[] {
  const root = path.join(path.resolve(dataRoot), 'agent-service');
  const bundlesRoot = path.join(root, 'harness-web', 'bundles');
  if (!fs.existsSync(bundlesRoot) || !safeStoragePath(root, bundlesRoot)) return [];
  const references = protectedWebBundles(dataRoot, now);
  const items: StorageCandidate[] = [];

  const inspectEntry = (name: string) => {
    const directory = path.join(bundlesRoot, name);
    if (STAGE_DIR_PATTERN.test(name)) {
      items.push(storageCandidate(root, 'web-bundle', directory, directory, use, now - STAGE_GRACE_MS));
      return;
    }
    if (!BUNDLE_ID_PATTERN.test(name)) return;
    const item = storageCandidate(root, 'web-bundle', directory, directory, use, cutoff);
    if (!safeStoragePath(root, directory)) {
      items.push(item);
      return;
    }
    if (item.reason !== 'storage_observation_failed') {
      if (!validBundleManifest(directory, name)) {
        item.eligible = false;
        item.reason = 'web_bundle_invalid';
      } else if (!references.complete) {
        item.eligible = false;
        item.reason = 'web_bundle_reference_observation_failed';
      } else if (references.bundles.has(name)) {
        item.eligible = false;
        item.reason = 'web_bundle_referenced';
      }
    }
    items.push(item);
  };

  if (targets) {
    for (const target of targets) {
      if (path.dirname(target) === bundlesRoot) inspectEntry(path.basename(target));
    }
    return items;
  }

  for (const name of fs.readdirSync(bundlesRoot).sort()) {
    inspectEntry(name);
  }
  return items;
}
