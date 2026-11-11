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
    const bindings = path.join(root, 'connections', provider, 'model-bindings');
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
