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

const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const codexSession = new RegExp(`^rollout-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-(${uuidPattern})\\.jsonl$`, 'u');
const dshSession = new RegExp(`^session-(${uuidPattern})$`, 'u');
const claudeSessionFile = new RegExp(`^(${uuidPattern})\\.jsonl$`, 'u');
const claudeSessionDir = new RegExp(`^(${uuidPattern})$`, 'u');
const antigravityJsonl = new RegExp(`^(${uuidPattern})\\.jsonl$`, 'u');
const antigravityUuid = new RegExp(`^(${uuidPattern})$`, 'u');
const antigravityDb = new RegExp(`^(${uuidPattern})\\.db(?:-wal|-shm)?$`, 'u');
const antigravityAnnotation = new RegExp(`^(${uuidPattern})\\.pbtxt$`, 'u');
const sessionProviders = ['codex', 'dsh', 'claude-code', 'antigravity'] as const;
const homeProviders = ['codex', 'dsh', 'claude-code'] as const;
type NativeSessionProvider = typeof sessionProviders[number];
type NativeHomeProvider = typeof homeProviders[number];
const maximumEntries = 20000;
const nativeSessionDirectoryMaxNodes = 50000;

export function nativeSessionRetainedReason(item: StorageCandidate, references: NativeSessionReferenceProof): string | undefined {
  const proof = item.nativeSession;
  if (!proof) return 'native_session_identity_unknown';
  if (!references.complete) return 'native_session_reference_observation_failed';
  if (references.unresolved.has(proof.provider)) return 'native_session_binding_unresolved';
  if (references.unknownContext.has(proof.provider)) return 'native_session_context_unknown';
  if (references.contexts.has(proof.provider + ':' + proof.contextId)) return 'native_session_referenced';
  return undefined;
}

/** Individual Codex rollout files, DSH session directories, standalone
 * Claude Code session files, and Antigravity per-context session artifacts are
 * the only native objects this plan can ever expose. */
export function nativeSessionCandidates(root: string, use: StorageUse, cutoff: number, references: NativeSessionReferenceProof): StorageCandidate[] {
  const items: StorageCandidate[] = [], state = { nodes: 0 };
  let visited = 0;
  const candidate = (
    provider: NativeSessionProvider,
    contextId: string,
    binding: string,
    target: string,
    options?: { maxNodes?: number; group?: string },
  ) => {
    if (++visited > maximumEntries) return;
    const item: StorageCandidate = { kind: 'native-session', path: target, ownerRoot: target, sizeBytes: 0, eligible: false,
      reason: 'storage_path_unsafe', nativeSession: { provider, contextId, binding, ...(options?.group ? { group: options.group } : {}) } };
    items.push(item);
    if (!safeStorageResource(root, target, options?.maxNodes ?? 64)) return;
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
  for (const provider of sessionProviders) {
    const account = path.join(root, 'connections', provider);
    const accountRelative = path.relative(root, account).split(path.sep).join('/');
    if (provider === 'antigravity') {
      antigravitySessions(account, state, (target, contextId, options) => candidate(provider, contextId, accountRelative, target, options));
      continue;
    }
    // The shared per-connection home (gateway + native login) holds sessions too;
    // the same context reference proof, stability window and occupancy apply.
    const sharedHome = path.join(account, provider === 'codex' ? 'codex-home' : provider === 'dsh' ? 'dsh-home' : 'claude-config');
    if (safeStoragePath(root, sharedHome)) {
      if (provider === 'codex') codexSessions(path.join(sharedHome, 'sessions'), state, (file, contextId) => candidate(provider, contextId, accountRelative, file));
      else if (provider === 'dsh') dshSessions(path.join(sharedHome, 'sessions'), state, (directory, contextId) => candidate(provider, contextId, accountRelative, directory, { maxNodes: nativeSessionDirectoryMaxNodes }));
      else claudeSessions(path.join(sharedHome, 'projects'), state, (file, contextId) => candidate(provider, contextId, accountRelative, file));
    }
    const bindings = path.join(account, 'model-bindings');
    if (!safeStoragePath(root, bindings)) continue;
    for (const id of fs.readdirSync(bindings).sort()) {
      const binding = path.join(bindings, id);
      if (!/^[a-f0-9]{64}$/.test(id) || !safeStoragePath(root, binding)) continue;
      const relative = path.relative(root, binding).split(path.sep).join('/');
      if (provider === 'codex') codexSessions(path.join(binding, 'codex-home', 'sessions'), state, (file, contextId) => candidate(provider, contextId, relative, file));
      else if (provider === 'dsh') dshSessions(path.join(binding, 'dsh-home', 'sessions'), state, (directory, contextId) => candidate(provider, contextId, relative, directory, { maxNodes: nativeSessionDirectoryMaxNodes }));
      else claudeSessions(path.join(binding, 'claude-config', 'projects'), state, (file, contextId) => candidate(provider, contextId, relative, file));
    }
  }
  protectGroupedSessions(items);
  return items;
}

function protectGroupedSessions(items: StorageCandidate[]): void {
  const busyContexts = new Set<string>();
  const dbGroups = new Map<string, StorageCandidate[]>();
  for (const item of items) {
    const ns = item.nativeSession;
    if (ns?.provider !== 'antigravity') continue;
    if (item.reason === 'storage_in_use') busyContexts.add(ns.contextId);
    if (ns.group) {
      const list = dbGroups.get(ns.group) ?? [];
      list.push(item);
      dbGroups.set(ns.group, list);
    }
  }
  for (const item of items) {
    if (item.nativeSession?.provider === 'antigravity' && busyContexts.has(item.nativeSession.contextId)) {
      item.eligible = false;
      item.reason = 'storage_in_use';
    }
  }
  for (const members of dbGroups.values()) {
    const blocking = members.find(member => !member.eligible);
    if (!blocking) continue;
    for (const member of members) {
      member.eligible = false;
      if (member.reason === 'unused_native_session') member.reason = blocking.reason;
    }
  }
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
export function nativeHomeSessionReferenced(home: string, provider: NativeHomeProvider, references: NativeSessionReferenceProof): boolean {
  const state = { nodes: 0 };
  let referenced = false;
  const check = (contextId: string) => { if (references.contexts.has(provider + ':' + contextId)) referenced = true; };
  if (provider === 'codex') codexSessions(path.join(home, 'codex-home', 'sessions'), state, (_file, contextId) => check(contextId));
  else if (provider === 'dsh') dshSessions(path.join(home, 'dsh-home', 'sessions'), state, (_directory, contextId) => check(contextId));
  else claudeSessionEntries(path.join(home, 'claude-config', 'projects'), state, contextId => check(contextId));
  return referenced;
}

/** Whole dead lease homes (`model-bindings/<hash>`) are the only directories this
 * plan exposes. They are reclaimed only after a complete no-reference proof,
 * the stability window and an occupancy check; never migrated or merged. */
export function nativeHomeCandidates(root: string, use: StorageUse, cutoff: number, references: NativeSessionReferenceProof): StorageCandidate[] {
  const items: StorageCandidate[] = [];
  for (const provider of homeProviders) {
    const bindings = path.join(root, 'connections', provider, 'model-bindings');
    if (!safeStoragePath(root, bindings)) continue;
    for (const id of fs.readdirSync(bindings).sort()) {
      if (!/^[a-f0-9]{64}$/.test(id)) continue;
      const home = path.join(bindings, id);
      if (!safeStoragePath(root, home)) continue;
      const item: StorageCandidate = { kind: 'native-home', path: home, ownerRoot: home, sizeBytes: 0, eligible: false,
        reason: 'storage_path_unsafe', nativeHome: { provider } };
      items.push(item);
      if (!safeStorageResource(root, home, 200000, { allowNestedSymlinks: true })) continue;
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

function claudeSessions(directory: string, state: { nodes: number }, add: (file: string, contextId: string) => void): void {
  try {
    for (const workspace of fs.readdirSync(directory, { withFileTypes: true })) {
      if (++state.nodes > maximumEntries || !workspace.isDirectory() || workspace.isSymbolicLink()) continue;
      const workspaceDir = path.join(directory, workspace.name);
      walk(workspaceDir, state, (file, name) => {
        const match = claudeSessionFile.exec(name);
        if (!match) return;
        // Retain sessions with a sibling <uuid>/ directory (subagents/tool-results)
        // for whole-home reclamation rather than leaving orphaned child dirs.
        if (fs.existsSync(path.join(path.dirname(file), match[1]!))) return;
        add(file, match[1]!);
      }, 1);
    }
  } catch { /* Unreadable session roots retain their sessions by omission. */ }
}

function claudeSessionEntries(directory: string, state: { nodes: number }, add: (contextId: string) => void): void {
  try {
    for (const workspace of fs.readdirSync(directory, { withFileTypes: true })) {
      if (++state.nodes > maximumEntries || !workspace.isDirectory() || workspace.isSymbolicLink()) continue;
      walk(path.join(directory, workspace.name), state, (_file, name) => {
        const fileMatch = claudeSessionFile.exec(name);
        if (fileMatch) { add(fileMatch[1]!); return; }
        const dirMatch = claudeSessionDir.exec(name);
        if (dirMatch) add(dirMatch[1]!);
      }, 1);
    }
  } catch { /* Unreadable session roots retain their sessions by omission. */ }
}

function scanFlatDir(
  directory: string,
  state: { nodes: number },
  pattern: RegExp,
  kind: 'file' | 'directory',
  add: (target: string, contextId: string) => void,
): void {
  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (++state.nodes > maximumEntries || entry.isSymbolicLink()) continue;
      const match = pattern.exec(entry.name);
      if (!match) continue;
      if (kind === 'directory' ? !entry.isDirectory() : !entry.isFile()) continue;
      add(path.join(directory, entry.name), match[1]!);
    }
  } catch { /* Missing or unreadable roots retain their sessions by omission. */ }
}

function antigravitySessions(
  account: string,
  state: { nodes: number },
  add: (target: string, contextId: string, options?: { maxNodes?: number; group?: string }) => void,
): void {
  scanFlatDir(path.join(account, 'antigravity-sessions'), state, antigravityJsonl, 'file', (file, contextId) => add(file, contextId));
  const gemini = path.join(account, 'home', '.gemini');
  scanFlatDir(path.join(gemini, 'antigravity', 'transcripts'), state, antigravityJsonl, 'file', (file, contextId) => add(file, contextId));
  const cli = path.join(gemini, 'antigravity-cli');
  scanFlatDir(path.join(cli, 'brain'), state, antigravityUuid, 'directory', (dir, contextId) => add(dir, contextId, { maxNodes: nativeSessionDirectoryMaxNodes }));
  scanFlatDir(path.join(cli, 'conversations'), state, antigravityDb, 'file', (file, contextId) => add(file, contextId, { group: 'antigravity-db:' + contextId }));
  scanFlatDir(path.join(cli, 'annotations'), state, antigravityAnnotation, 'file', (file, contextId) => add(file, contextId));
}
