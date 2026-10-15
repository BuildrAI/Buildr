import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { sqliteContextDatabaseOrNull, type SqliteReadContext, type TransactionContext } from '../../../infrastructure/sqlite/transaction.ts';
import type { ConnectionScope } from '../domain/instance.ts';

type Store = {
  runWorkspaceSqliteRead<T>(root: string, read: (context: SqliteReadContext) => T): T;
  runWorkspaceTransaction<T>(root: string, write: (context: TransactionContext) => T): T;
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function safePath(base: string, relative: string): string {
  const resolved = path.resolve(base), target = path.resolve(resolved, relative);
  if (!target.startsWith(resolved + path.sep)) throw new Error('outside owner');
  for (let current = resolved, parts = path.relative(resolved, target).split(path.sep), i = -1; i < parts.length; i++) {
    if (i >= 0) current = path.join(current, parts[i]);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat) break;
    if (stat.isSymbolicLink() || current !== target && !stat.isDirectory()) throw new Error('unsafe owner');
  }
  return target;
}

function unlinkObserved(base: string, relative: string, before: fs.Stats): void {
  const file = safePath(base, relative), now = fs.lstatSync(file);
  if (!now.isFile() || now.dev !== before.dev || now.ino !== before.ino || now.size !== before.size || now.mtimeMs !== before.mtimeMs) throw new Error('source changed');
  fs.unlinkSync(file);
}

function removeOwnedDirectory(base: string, relative: string, filename: RegExp): void {
  const directory = safePath(base, relative), stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!stat) return;
  if (!stat.isDirectory()) throw new Error('not a directory');
  const entries = fs.readdirSync(directory).map(name => {
    const file = safePath(base, path.join(relative, name)), entry = fs.lstatSync(file);
    if (!filename.test(name) || !entry.isFile()) throw new Error('unknown owned entry');
    return { name, entry };
  });
  for (const { name, entry } of entries) unlinkObserved(base, path.join(relative, name), entry);
  const current = fs.lstatSync(safePath(base, relative));
  if (current.dev !== stat.dev || current.ino !== stat.ino) throw new Error('directory changed');
  fs.rmdirSync(directory);
}

/** Only retired, explicitly owned objects are removed; failures do not disable new connections. */
export function retireLegacyConnections(scope: ConnectionScope, dataRoot: string, store: Store): string[] {
  const diagnostics: string[] = [];
  const attempt = (label: string, action: () => void) => {
    try { action(); } catch { diagnostics.push(`旧连接数据清理未完成：${label}；未删除身份不明对象，可修复后重试。`); }
  };
  if (!UUID.test(scope.workspaceId)) return ['旧连接数据清理未完成：工作空间身份无效。'];
  attempt('本机数据库', () => {
    const legacy = store.runWorkspaceSqliteRead(scope.rootPath, context => {
      const database = sqliteContextDatabaseOrNull(context);
      if (!database?.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'external_connection_store'").get()) return false;
      return true;
    });
    // Opening a writable store applies the new drop migration. A fresh workspace stays read-only.
    if (legacy) store.runWorkspaceTransaction(scope.rootPath, () => undefined);
  });
  attempt('connections/manifest.yml', () => {
    const relative = 'connections/manifest.yml', file = safePath(scope.rootPath, relative), stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat) return;
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('unknown manifest');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
      const current = fs.fstatSync(fd);
      if (!current.isFile() || current.size > 2 * 1024 * 1024 || current.dev !== stat.dev || current.ino !== stat.ino || current.mtimeMs !== stat.mtimeMs) throw new Error('manifest changed');
      const buffer = Buffer.alloc(2 * 1024 * 1024 + 1);
      let length = 0;
      while (length < buffer.length) { const read = fs.readSync(fd, buffer, length, buffer.length - length, null); if (!read) break; length += read; }
      const after = fs.fstatSync(fd);
      if (length > 2 * 1024 * 1024 || after.size !== current.size || after.mtimeMs !== current.mtimeMs) throw new Error('manifest changed');
      const document = YAML.parseDocument(buffer.subarray(0, length).toString('utf8'), { uniqueKeys: true });
      const value = document.toJS();
      if (document.errors.length || value?.schemaVersion !== 'buildr.connections/v1' || value.workspaceId !== scope.workspaceId || !Array.isArray(value.connections)) throw new Error('foreign manifest');
    } finally { fs.closeSync(fd); }
    unlinkObserved(scope.rootPath, relative, stat);
  });
  for (const name of ['nacos-publish-authorizations', 'xxl-job-authorizations']) {
    attempt(`.buildr/local/${name}`, () => removeOwnedDirectory(scope.rootPath, `.buildr/local/${name}`, /^[a-f0-9]{64}\.json$/));
  }
  attempt('旧本机认证', () => {
    removeOwnedDirectory(dataRoot, `external-connections/${scope.workspaceId}`, /^[a-f0-9-]{36}\.json$/);
    const directory = safePath(dataRoot, 'external-connections');
    const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
    if (!stat) return;
    if (!stat.isDirectory()) throw new Error('not a credential directory');
    const names = fs.readdirSync(directory);
    // Other workspaces still own the shared key until their credentials are retired.
    const other = names.filter(name => name !== 'credential-key.json');
    for (const name of other) {
      if (!UUID.test(name) || !fs.lstatSync(safePath(dataRoot, `external-connections/${name}`)).isDirectory()) throw new Error('unknown credential owner');
    }
    if (other.length) return;
    if (names.includes('credential-key.json')) {
      const key = 'external-connections/credential-key.json';
      unlinkObserved(dataRoot, key, fs.lstatSync(safePath(dataRoot, key)));
    }
    const now = fs.lstatSync(safePath(dataRoot, 'external-connections'));
    if (now.dev !== stat.dev || now.ino !== stat.ino) throw new Error('credential directory changed');
    fs.rmdirSync(directory);
  });
  return diagnostics;
}
