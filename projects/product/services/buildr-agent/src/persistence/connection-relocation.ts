import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { withAgentDataOffline } from '../process/offline-data.ts';
import { CONVERSATION_SCHEMA_VERSION } from './conversation-repository.ts';

const SCHEMA_VERSION = CONVERSATION_SCHEMA_VERSION;
const BINDING_FORMAT = 'buildr-native-binding/v2';

export type ConnectionRelocationFailure = {
  provider: string;
  stage: 'read' | 'rewrite' | 'binding' | 'target';
  diagnostic: string;
};

export type ConnectionRelocationResult = {
  relocated: string[];
  failed: ConnectionRelocationFailure[];
};

function databasePath(root: string): string {
  return path.join(path.resolve(root), 'agent-service', 'conversations.sqlite');
}

function safeDiagnostic(error: unknown): string {
  const filesystemCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  const filesystem: Record<string, string> = {
    ENOENT: 'source_missing',
    EACCES: 'source_unreadable',
    EPERM: 'source_unreadable',
    ELOOP: 'source_symlink_loop',
    ENOTDIR: 'source_invalid',
  };
  if (filesystem[filesystemCode]) return filesystem[filesystemCode];
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[a-z][a-z0-9_]{0,80}$/.test(error.code)) return error.code;
  if (error instanceof Error && /^[a-z][a-z0-9_]{0,80}$/.test(error.message)) return error.message;
  return 'unexpected_error';
}

function rewritePath(value: string, sourceRoot: string, targetRoot: string): string {
  if (value === sourceRoot) return targetRoot;
  const prefix = `${sourceRoot}${path.sep}`;
  return value.startsWith(prefix) ? `${targetRoot}${path.sep}${value.slice(prefix.length)}` : value;
}

function rewriteValue(value: unknown, sourceRoot: string, targetRoot: string): unknown {
  if (typeof value === 'string') return rewritePath(value, sourceRoot, targetRoot);
  if (Array.isArray(value)) return value.map((entry) => rewriteValue(entry, sourceRoot, targetRoot));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, rewriteValue(entry, sourceRoot, targetRoot)]));
  }
  return value;
}

function containsSourcePath(value: unknown, sourceRoot: string): boolean {
  if (typeof value === 'string') return value === sourceRoot || value.startsWith(`${sourceRoot}${path.sep}`);
  if (Array.isArray(value)) return value.some((entry) => containsSourcePath(entry, sourceRoot));
  if (value && typeof value === 'object') return Object.values(value).some((entry) => containsSourcePath(entry, sourceRoot));
  return false;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function rebind(record: Record<string, unknown>): void {
  const raw = record.bindingData;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    // Older or partial records cannot be safely adopted at a new root; the
    // runtime will recompute the binding on first open instead of persisting
    // any identity that still points at the source environment.
    delete record.bindingIdentity;
    delete record.bindingData;
    return;
  }
  const data = raw as Record<string, any>;
  if (data.format !== BINDING_FORMAT
    || typeof data.provider !== 'string'
    || typeof data.executable !== 'string'
    || typeof data.config !== 'string'
    || typeof data.series !== 'string') {
    delete record.bindingIdentity;
    delete record.bindingData;
    return;
  }
  const executable = fs.realpathSync(data.executable);
  if (!fs.statSync(executable).isFile()) throw new Error('agent_relocation_executable_invalid');
  const config = fs.realpathSync(data.config);
  const info = fs.statSync(config);
  if (!info.isDirectory()) throw new Error('agent_relocation_config_invalid');
  const provenance = {
    format: BINDING_FORMAT,
    provider: data.provider,
    executable,
    config,
    dev: info.dev,
    ino: info.ino,
    series: data.series,
  };
  const native = sha256(JSON.stringify(provenance));
  record.bindingData = { ...data, executable, config, dev: info.dev, ino: info.ino };
  record.bindingIdentity = typeof data.gatewayIdentity === 'string'
    ? sha256(JSON.stringify(['buildr-model-gateway/v1', native, data.gatewayIdentity]))
    : native;
}

function ensureTarget(database: string): DatabaseSync {
  const directory = path.dirname(database);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const directoryInfo = fs.lstatSync(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error('agent_relocation_target_unsafe');
  const current = fs.lstatSync(database, { throwIfNoEntry: false });
  if (current && (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1)) throw new Error('agent_relocation_target_unsafe');
  const db = new DatabaseSync(database);
  try {
    const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    if (version > SCHEMA_VERSION) throw new Error('agent_relocation_target_newer');
    if (version === 0) {
      db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY, provider TEXT NOT NULL UNIQUE, revision TEXT NOT NULL, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT, hidden INTEGER NOT NULL, updated_at TEXT NOT NULL, revision TEXT NOT NULL, body TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS conversations_workspace ON conversations(workspace_id, updated_at DESC, id);
        CREATE INDEX IF NOT EXISTS conversations_task ON conversations(workspace_id, task_id);
        PRAGMA user_version=1; COMMIT;`);
    }
    fs.chmodSync(database, 0o600);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function readRows(database: string): Array<{ id: string; provider: string; revision: string; body: string }> {
  if (!fs.existsSync(database)) return [];
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    return db.prepare('SELECT id,provider,revision,body FROM connections ORDER BY provider').all() as Array<{ id: string; provider: string; revision: string; body: string }>;
  } finally {
    db.close();
  }
}

/** Connection bodies are owned here, so consumers never rewrite or rebind them directly. */
export function listConnectionExecutables(input: { sourceRoot: string; database?: string }): string[] {
  const rows = readRows(input.database ?? databasePath(input.sourceRoot));
  const executables = new Set<string>();
  for (const row of rows) {
    let record: Record<string, any>;
    try { record = JSON.parse(row.body); } catch { continue; }
    if (typeof record?.view?.executable === 'string') executables.add(record.view.executable);
    if (typeof record?.bindingData?.executable === 'string') executables.add(record.bindingData.executable);
  }
  return [...executables];
}

/**
 * Copies connection rows from a source environment into the preview interaction
 * database. Conversations, attachments and handoff materials are never read or
 * copied; existing preview conversations stay intact.
 */
export function relocateConnections(input: { sourceRoot: string; targetRoot: string; sourceDatabase?: string; targetDatabase?: string }): ConnectionRelocationResult {
  if(path.resolve(input.sourceRoot)===path.resolve(input.targetRoot) || path.resolve(input.sourceDatabase??databasePath(input.sourceRoot))===path.resolve(input.targetDatabase??databasePath(input.targetRoot)))throw new Error('agent_relocation_same_root');
  return withAgentDataOffline(input.targetRoot, () => relocateOffline(input));
}

function relocateOffline(input: { sourceRoot: string; targetRoot: string; sourceDatabase?: string; targetDatabase?: string }): ConnectionRelocationResult {
  const sourceRoot = path.resolve(input.sourceRoot);
  const targetRoot = path.resolve(input.targetRoot);
  if (sourceRoot === targetRoot) throw new Error('agent_relocation_same_root');
  const sourceDatabase = input.sourceDatabase ?? databasePath(sourceRoot);
  const targetDatabase = input.targetDatabase ?? databasePath(targetRoot);
  if (path.resolve(sourceDatabase) === path.resolve(targetDatabase)) throw new Error('agent_relocation_same_root');
  const rows = readRows(sourceDatabase);
  const result: ConnectionRelocationResult = { relocated: [], failed: [] };
  if (!rows.length) return result;

  const staged: Array<{ id: string; provider: string; revision: string; body: string }> = [];
  for (const row of rows) {
    let record: Record<string, any>;
    try {
      record = JSON.parse(row.body);
      if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.view?.id !== 'string' || typeof record.view?.provider !== 'string') throw new Error('connection_record_invalid');
    } catch (error) {
      result.failed.push({ provider: row.provider, stage: 'read', diagnostic: safeDiagnostic(error) });
      continue;
    }
    const rewritten = rewriteValue(record, sourceRoot, targetRoot) as Record<string, any>;
    if (containsSourcePath(rewritten, sourceRoot)) {
      result.failed.push({ provider: row.provider, stage: 'rewrite', diagnostic: 'source_path_remaining' });
      continue;
    }
    try {
      rebind(rewritten);
    } catch (error) {
      result.failed.push({ provider: row.provider, stage: 'binding', diagnostic: safeDiagnostic(error) });
      continue;
    }
    staged.push({ id: row.id, provider: row.provider, revision: row.revision, body: JSON.stringify(rewritten) });
  }
  if (!staged.length) return result;

  let db: DatabaseSync | null = null;
  try {
    db = ensureTarget(targetDatabase);
    db.exec('BEGIN IMMEDIATE');
    const statement = db.prepare('INSERT INTO connections(id,provider,revision,body) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body');
    for (const row of staged) statement.run(row.id, row.provider, row.revision, row.body);
    db.exec('COMMIT');
    result.relocated.push(...staged.map((row) => row.provider));
  } catch (error) {
    try { db?.exec('ROLLBACK'); } catch { /* Nothing was committed. */ }
    for (const row of staged) result.failed.push({ provider: row.provider, stage: 'target', diagnostic: safeDiagnostic(error) });
  } finally {
    try { db?.close(); } catch { /* Closing a failed target must not hide the primary result. */ }
  }
  return result;
}
