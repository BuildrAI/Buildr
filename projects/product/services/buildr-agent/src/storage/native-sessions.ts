import fs from 'node:fs';
import path from 'node:path';
import { safeStoragePath, safeStorageResource, storageInUse, storageVersion, type StorageCandidate, type StorageUse } from './files.ts';

/** The complete reference observation shared by planning and deletion. An
 * incomplete observation or an unresolved provider retains that whole scope. */
export interface NativeSessionReferenceProof {
  complete: boolean;
  contexts: ReadonlySet<string>;
  unknownContext: ReadonlySet<string>;
  unresolved: ReadonlySet<string>;
  /** Absolute native home roots (lease or shared) still referenced by a participant, tool or handoff. */
  homes: ReadonlySet<string>;
}

const codexSession = /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/u;
const dshSession = /^session-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u;
const providers = ['codex', 'dsh'] as const;
const maximumEntries = 20000;

export function nativeSessionRetainedReason(item: StorageCandidate, references: NativeSessionReferenceProof): string | undefined {
  const proof = item.nativeSession;
  if (!proof) return 'native_session_identity_unknown';
  if (!references.complete) return 'native_session_reference_observation_failed';
  if (references.unresolved.has(proof.provider)) return 'native_session_binding_unresolved';
  if (references.unknownContext.has(proof.provider)) return 'native_session_context_unknown';
  if (references.contexts.has(proof.provider + ':' + proof.contextId)) return 'native_session_referenced';
  return undefined;
}

/** Individual Codex rollout files and DSH session directories under known
 * model bindings are the only native objects this plan can ever expose. */
export function nativeSessionCandidates(root: string, use: StorageUse, cutoff: number, references: NativeSessionReferenceProof): StorageCandidate[] {
  const items: StorageCandidate[] = [], state = { nodes: 0 };
  let visited = 0;
  const candidate = (provider: 'codex' | 'dsh', contextId: string, binding: string, target: string) => {
    if (++visited > maximumEntries) return;
    const item: StorageCandidate = { kind: 'native-session', path: target, ownerRoot: target, sizeBytes: 0, eligible: false,
      reason: 'storage_path_unsafe', nativeSession: { provider, contextId, binding } };
    items.push(item);
    if (!safeStorageResource(root, target, 64)) return;
    try {
      const version = storageVersion(target);
      Object.assign(item, { identity: version.identity, sizeBytes: version.sizeBytes, rootChanged: version.rootChanged });
      item.reason = !use.complete ? 'storage_usage_unknown'
        : storageInUse(target, use) ? 'storage_in_use'
          : nativeSessionRetainedReason(item, references)
            ?? (version.modified > cutoff ? 'storage_recent' : 'unused_native_session');
      item.eligible = item.reason === 'unused_native_session';
    } catch { item.reason = 'storage_observation_failed'; }
  };
  for (const provider of providers) {
    const account = path.join(root, 'connections', provider);
    // The shared per-connection home (gateway + native login) holds sessions too;
    // the same context reference proof, stability window and occupancy apply.
    const sharedHome = path.join(account, provider === 'codex' ? 'codex-home' : 'dsh-home');
    const accountRelative = path.relative(root, account).split(path.sep).join('/');
    if (safeStoragePath(root, sharedHome)) {
      if (provider === 'codex') codexSessions(path.join(sharedHome, 'sessions'), state, (file, contextId) => candidate(provider, contextId, accountRelative, file));
      else dshSessions(path.join(sharedHome, 'sessions'), state, (directory, contextId) => candidate(provider, contextId, accountRelative, directory));
    }
    const bindings = path.join(account, 'model-bindings');
    if (!safeStoragePath(root, bindings)) continue;
    for (const id of fs.readdirSync(bindings).sort()) {
      const binding = path.join(bindings, id);
      if (!/^[a-f0-9]{64}$/.test(id) || !safeStoragePath(root, binding)) continue;
      const relative = path.relative(root, binding).split(path.sep).join('/');
      if (provider === 'codex') codexSessions(path.join(binding, 'codex-home', 'sessions'), state, (file, contextId) => candidate(provider, contextId, relative, file));
      else dshSessions(path.join(binding, 'dsh-home', 'sessions'), state, (directory, contextId) => candidate(provider, contextId, relative, directory));
    }
  }
  return items;
}

/** A whole legacy lease home is retained by the same complete reference proof
 * as its sessions, plus the resolved home roots of every participant/tool/handoff.
 * The shared per-connection account root is never a candidate. */
export function nativeHomeRetainedReason(item: StorageCandidate, references: NativeSessionReferenceProof): string | undefined {
  const proof = item.nativeHome;
  if (!proof) return 'native_home_identity_unknown';
  if (!references.complete) return 'native_home_reference_observation_failed';
  if (references.unresolved.has(proof.provider)) return 'native_home_binding_unresolved';
  if (references.unknownContext.has(proof.provider)) return 'native_home_context_unknown';
  if (references.homes.has(item.path)) return 'native_home_referenced';
  return undefined;
}

/** Belt-and-braces: even when no reference names the home path, a single
 * referenced session inside it retains the whole directory. Walks the actual
 * (possibly already renamed) home so the deletion re-proof stays accurate. */
export function nativeHomeSessionReferenced(home: string, provider: 'codex' | 'dsh', references: NativeSessionReferenceProof): boolean {
  const state = { nodes: 0 };
  let referenced = false;
  const check = (contextId: string) => { if (references.contexts.has(provider + ':' + contextId)) referenced = true; };
  const sessions = path.join(home, provider === 'codex' ? 'codex-home' : 'dsh-home', 'sessions');
  if (provider === 'codex') codexSessions(sessions, state, (_file, contextId) => check(contextId));
  else dshSessions(sessions, state, (_directory, contextId) => check(contextId));
  return referenced;
}

/** Whole dead lease homes (`model-bindings/<hash>`) are the only directories this
 * plan exposes. They are reclaimed only after a complete no-reference proof,
 * the stability window and an occupancy check; never migrated or merged. */
export function nativeHomeCandidates(root: string, use: StorageUse, cutoff: number, references: NativeSessionReferenceProof): StorageCandidate[] {
  const items: StorageCandidate[] = [];
  for (const provider of providers) {
    const bindings = path.join(root, 'connections', provider, 'model-bindings');
    if (!safeStoragePath(root, bindings)) continue;
    for (const id of fs.readdirSync(bindings).sort()) {
      if (!/^[a-f0-9]{64}$/.test(id)) continue;
      const home = path.join(bindings, id);
      if (!safeStoragePath(root, home)) continue;
      const item: StorageCandidate = { kind: 'native-home', path: home, ownerRoot: home, sizeBytes: 0, eligible: false,
        reason: 'storage_path_unsafe', nativeHome: { provider } };
      items.push(item);
      if (!safeStorageResource(root, home, 200000)) continue;
      try {
        const version = storageVersion(home);
        Object.assign(item, { identity: version.identity, sizeBytes: version.sizeBytes, rootChanged: version.rootChanged });
        item.reason = !use.complete ? 'storage_usage_unknown'
          : storageInUse(home, use) ? 'storage_in_use'
            : nativeHomeRetainedReason(item, references)
              ?? (nativeHomeSessionReferenced(home, provider, references) ? 'native_home_session_referenced' : undefined)
              ?? (version.modified > cutoff ? 'storage_recent' : 'unused_native_home');
        item.eligible = item.reason === 'unused_native_home';
      } catch { item.reason = 'storage_observation_failed'; }
    }
  }
  return items;
}

function walk(directory: string, state: { nodes: number }, visit: (file: string, name: string) => void, depth: number): void {
  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (++state.nodes > maximumEntries || entry.isSymbolicLink()) continue;
      const file = path.join(directory, entry.name);
      visit(file, entry.name);
      if (entry.isDirectory() && depth > 1) walk(file, state, visit, depth - 1);
    }
  } catch { /* Unreadable layouts retain their sessions by omission. */ }
}

function codexSessions(directory: string, state: { nodes: number }, add: (file: string, contextId: string) => void): void {
  walk(directory, state, (file, name) => {
    const match = codexSession.exec(name);
    if (match) add(file, match[1]!);
  }, 6);
}

function dshSessions(directory: string, state: { nodes: number }, add: (session: string, contextId: string) => void): void {
  try {
    for (const workspace of fs.readdirSync(directory, { withFileTypes: true })) {
      if (++state.nodes > maximumEntries || !workspace.isDirectory() || workspace.isSymbolicLink()) continue;
      walk(path.join(directory, workspace.name), state, (file, name) => {
        const match = dshSession.exec(name);
        if (!match) return;
        try {
          const stat = fs.lstatSync(file);
          if (!stat.isDirectory() || stat.isSymbolicLink()) return;
          if (!fs.existsSync(path.join(file, 'session.v4.jsonl')) && !fs.existsSync(path.join(file, 'session.v4.jsonl.zstd'))) return;
          add(file, match[1]!);
        } catch { /* A partial session directory is not a candidate. */ }
      }, 2);
    }
  } catch { /* Unreadable session roots retain their sessions by omission. */ }
}
