import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { atomicWriteJson } from '../../../infrastructure/filesystem/atomic-files.ts';
import { sqliteContextDatabaseOrNull, transactionDatabase, type SqliteReadContext, type TransactionContext } from '../../../infrastructure/sqlite/transaction.ts';
import type { DatabaseSync } from 'node:sqlite';
import { CONNECTION_FIELDS, configuration, connectionFailure, connectionId, inputObject, recordRevision, type ConnectionRecord, type ConnectionScope, type PublicConnection, type QueryPreferences, queryPreferenceValues } from '../domain/connection.ts';

const MAX_BYTES = 2 * 1024 * 1024;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export type ConnectionStoreRuntime = {
  runWorkspaceSqliteRead<T>(root: string, action: (context: SqliteReadContext) => T): T;
  runWorkspaceTransaction<T>(root: string, action: (context: TransactionContext) => T): T;
};
/** The workspace SQLite owns local connection metadata; the host profile owns encrypted credentials. */
export class ConnectionRepository {
  readonly dataRoot: string;
  private readonly credentialDataRoot: string;
  private readonly credentialsReadonly: boolean;
  private readonly store: ConnectionStoreRuntime;
  constructor(dataRoot: string, store: ConnectionStoreRuntime, credentialDataRoot?: string) { this.dataRoot = path.resolve(dataRoot); this.store = store; this.credentialDataRoot = path.resolve(credentialDataRoot ?? dataRoot); this.credentialsReadonly = credentialDataRoot !== undefined; }
  private assertCredentialWritable() { if (this.credentialsReadonly) throw connectionFailure('connection_preview_readonly', '此预览使用日常 Buildr 的认证，仅支持查询；连接配置请在日常 Buildr 中修改。', 409); }
  private assertDirectory(directory: string, boundary: string) {
    const relative = path.relative(boundary, directory);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw connectionFailure('connection_storage_invalid', '连接存储目录越界。', 409);
    for (let current = boundary, index = -1, parts = relative.split(path.sep).filter(Boolean); index < parts.length; index++) {
      if (index >= 0) current = path.join(current, parts[index]);
      const stat = fs.lstatSync(current, { throwIfNoEntry: false });
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw connectionFailure('connection_storage_invalid', '连接存储目录被替换或不可用。', 409);
    }
  }
  private file(scope: ConnectionScope) { return path.join(scope.rootPath, 'connections', 'manifest.yml'); }
  private secretDirectory(scope: ConnectionScope) {
    if (!uuid(scope.workspaceId)) throw connectionFailure('connection_workspace_invalid', '工作空间编号无效。', 409);
    return path.join(this.credentialDataRoot, 'external-connections', scope.workspaceId);
  }
  private readFile(file: string, maxBytes = MAX_BYTES): string | null {
    try {
      const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      try {
        const before = fs.fstatSync(descriptor);
        if (!before.isFile() || before.size > maxBytes) throw new Error('invalid file');
        const bytes = Buffer.alloc(maxBytes + 1); let length = 0;
        while (length < bytes.length) { const read = fs.readSync(descriptor, bytes, length, bytes.length - length, null); if (!read) break; length += read; }
        const after = fs.fstatSync(descriptor);
        if (length > maxBytes || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('file changed');
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
      } finally { fs.closeSync(descriptor); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw connectionFailure('connection_storage_invalid', '连接数据无法安全读取；已保留原文件。', 409);
    }
  }
  private decodeRecord(raw: unknown): ConnectionRecord {
    const item = inputObject(raw, [...CONNECTION_FIELDS, 'id', 'credentialId', 'createdAt', 'updatedAt']);
    if (item.credentialId !== null && !uuid(item.credentialId) || !['createdAt', 'updatedAt'].every(field => typeof item[field] === 'string' && Number.isFinite(Date.parse(item[field] as string)))) throw new Error('invalid record');
    return { ...configuration(item), id: connectionId(item.id), credentialId: item.credentialId as string | null, createdAt: item.createdAt as string, updatedAt: item.updatedAt as string };
  }
  private assertRecords(records: ConnectionRecord[]): void {
    if (records.length > 1000 || Buffer.byteLength(JSON.stringify(records)) > MAX_BYTES) throw connectionFailure('connection_storage_full', '连接存储容量已达上限。', 409);
    if (new Set(records.map(item => item.id)).size !== records.length) throw new Error('duplicate id');
    const credentials = records.flatMap(item => item.credentialId === null ? [] : [item.credentialId]);
    if (new Set(credentials).size !== credentials.length) throw new Error('shared credential identity');
  }
  private legacy(scope: ConnectionScope): { records: ConnectionRecord[]; digest: string | null } {
    this.assertDirectory(path.dirname(this.file(scope)), scope.rootPath);
    const content = this.readFile(this.file(scope));
    if (content === null) return { records: [], digest: null };
    try {
      const document = YAML.parseDocument(content, { uniqueKeys: true });
      if (document.errors.length) throw new Error('invalid yaml');
      const value = inputObject(document.toJS(), ['schemaVersion', 'workspaceId', 'connections']);
      if (value.schemaVersion !== 'buildr.connections/v1' || value.workspaceId !== scope.workspaceId || !Array.isArray(value.connections)) throw new Error('invalid manifest');
      const records = value.connections.map(raw => this.decodeRecord(raw));
      this.assertRecords(records);
      return { records, digest: 'sha256-' + crypto.createHash('sha256').update(content).digest('hex') };
    } catch { throw connectionFailure('connection_manifest_invalid', '旧连接清单无效；已保留原文件，未导入连接。', 409); }
  }
  private initialized(database: DatabaseSync, scope: ConnectionScope): boolean {
    if (!database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'external_connection_store'").get()) {
      if (!database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get()) return false;
      throw connectionFailure('connection_storage_invalid', '连接数据库缺少初始化记录表；已保留数据库现场。', 409);
    }
    const state = database.prepare('SELECT workspace_id FROM external_connection_store WHERE singleton = 1').get();
    if (!state) return false;
    if (state.workspace_id !== scope.workspaceId) throw connectionFailure('connection_workspace_mismatch', '连接数据库属于其他工作空间；已保留数据库现场。', 409);
    return true;
  }
  private initialize(database: DatabaseSync, scope: ConnectionScope): void {
    if (this.initialized(database, scope)) return;
    if (Number(database.prepare('SELECT count(*) AS count FROM external_connections').get()?.count) || Number(database.prepare('SELECT count(*) AS count FROM connection_query_preferences').get()?.count)) throw connectionFailure('connection_migration_conflict', '连接数据库已有未确认归属的数据；未覆盖，也未导入旧清单。', 409);
    const legacy = this.legacy(scope);
    const insert = database.prepare('INSERT INTO external_connections(connection_id, record_json) VALUES (?, ?)');
    for (const record of legacy.records) insert.run(record.id, JSON.stringify(record));
    database.prepare('INSERT INTO external_connection_store(singleton, workspace_id, legacy_digest, initialized_at) VALUES (1, ?, ?, ?)').run(scope.workspaceId, legacy.digest, new Date().toISOString());
  }
  private records(database: DatabaseSync): ConnectionRecord[] {
    try {
      const records = database.prepare('SELECT connection_id, record_json FROM external_connections ORDER BY rowid').all().map(row => {
        const record = this.decodeRecord(JSON.parse(String(row.record_json)));
        if (record.id !== row.connection_id) throw new Error('identity mismatch');
        return record;
      });
      this.assertRecords(records); return records;
    } catch { throw connectionFailure('connection_storage_invalid', '连接数据库内容无效；已保留数据库现场，不会回退旧文件。', 409); }
  }
  private readInitialized<T>(scope: ConnectionScope, action: (database: DatabaseSync) => T): T {
    const pending = Symbol('connections initialization required');
    let result: T | typeof pending;
    try {
      result = this.store.runWorkspaceSqliteRead(scope.rootPath, context => {
        const database = sqliteContextDatabaseOrNull(context);
        return database && this.initialized(database, scope) ? action(database) : pending;
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'workspace_store_migration_required') throw error;
      result = pending;
    }
    if (result !== pending) return result;
    if (this.credentialsReadonly) throw connectionFailure('connection_preview_store_unprepared', '规范工作空间的连接存储尚未准备完成；请先在日常 Buildr 中打开连接，预览不会迁移正式连接配置。', 409);
    // Schema upgrades happen in the store before this atomic business import transaction.
    return this.store.runWorkspaceTransaction(scope.rootPath, context => {
      const database = transactionDatabase(context); this.initialize(database, scope); return action(database);
    });
  }
  read(scope: ConnectionScope): ConnectionRecord[] { return this.readInitialized(scope, database => this.records(database)); }
  mutate<T>(scope: ConnectionScope, action: (records: ConnectionRecord[]) => T): T {
    this.assertCredentialWritable();
    return this.store.runWorkspaceTransaction(scope.rootPath, context => {
      const database = transactionDatabase(context); this.initialize(database, scope);
      const records = this.records(database), result = action(records);
      this.assertRecords(records);
      const ids = new Set(records.map(record => record.id));
      for (const row of database.prepare('SELECT connection_id FROM external_connections').all()) if (!ids.has(String(row.connection_id))) database.prepare('DELETE FROM external_connections WHERE connection_id = ?').run(row.connection_id!);
      const put = database.prepare('INSERT INTO external_connections(connection_id, record_json) VALUES (?, ?) ON CONFLICT(connection_id) DO UPDATE SET record_json = excluded.record_json');
      for (const record of records) put.run(record.id, JSON.stringify(record));
      return result;
    });
  }
  private preference(database: DatabaseSync, scope: ConnectionScope, id: string): QueryPreferences & { generation: number } {
    if (!database.prepare('SELECT connection_id FROM external_connections WHERE connection_id = ?').get(id)) throw connectionFailure('connection_not_found', '连接不存在，请刷新连接列表。', 404);
    const row = database.prepare('SELECT enabled_databases_json, current_database, generation FROM connection_query_preferences WHERE connection_id = ?').get(id);
    try {
      const values = queryPreferenceValues(row ? { enabledDatabases: JSON.parse(String(row.enabled_databases_json)), currentDatabase: row.current_database } : { enabledDatabases: [], currentDatabase: null });
      const generation = Number(row?.generation ?? 0);
      if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('invalid preference version');
      const revision = 'sha256-' + crypto.createHash('sha256').update(JSON.stringify([scope.workspaceId, id, generation, values])).digest('hex');
      return { ...values, revision, generation };
    } catch { throw connectionFailure('connection_storage_invalid', '查询偏好数据无效；已保留数据库现场。', 409); }
  }
  queryPreferences(scope: ConnectionScope, id: string): QueryPreferences {
    return this.readInitialized(scope, database => { const { generation, ...preference } = this.preference(database, scope, id); return preference; });
  }
  saveQueryPreferences(scope: ConnectionScope, id: string, values: Omit<QueryPreferences, 'revision'>, expectedRevision: string): QueryPreferences {
    if (this.credentialsReadonly) this.readInitialized(scope, () => true);
    return this.store.runWorkspaceTransaction(scope.rootPath, context => {
      const database = transactionDatabase(context); this.initialize(database, scope);
      const previous = this.preference(database, scope, id);
      if (previous.revision !== expectedRevision) throw connectionFailure('connection_query_preferences_revision_conflict', '数据库选择已被其他入口修改，请刷新后重试。', 409);
      database.prepare('INSERT INTO connection_query_preferences(connection_id, enabled_databases_json, current_database, generation) VALUES (?, ?, ?, ?) ON CONFLICT(connection_id) DO UPDATE SET enabled_databases_json = excluded.enabled_databases_json, current_database = excluded.current_database, generation = excluded.generation').run(id, JSON.stringify(values.enabledDatabases), values.currentDatabase, previous.generation + 1);
      const { generation, ...preference } = this.preference(database, scope, id); return preference;
    });
  }
  private key(create: boolean): Buffer | null {
    const directory = path.join(this.credentialDataRoot, 'external-connections');
    this.assertDirectory(directory, this.credentialDataRoot);
    if (create) { fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); fs.chmodSync(directory, 0o700); }
    const file = path.join(directory, 'credential-key.json');
    if (create) {
      try { fs.writeFileSync(file, JSON.stringify({ key: crypto.randomBytes(32).toString('base64') }) + '\n', { flag: 'wx', mode: 0o600 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw connectionFailure('connection_credentials_unavailable', '本机认证密钥无法创建。', 409); }
    }
    const raw = this.readFile(file, 1024);
    if (raw === null) return null;
    try {
      const value = JSON.parse(raw), key = Buffer.from(value.key, 'base64');
      if (key.length !== 32 || Object.keys(value).join(',') !== 'key' || (fs.statSync(file).mode & 0o077) !== 0) throw new Error('invalid key');
      return key;
    } catch { throw connectionFailure('connection_credentials_unavailable', '本机认证密钥不可用；请重新配置密码。', 409); }
  }
  writeCredentials(scope: ConnectionScope, credentials: Record<string, unknown>, bindingDigest: string): string {
    this.assertCredentialWritable();
    if (!/^sha256-[a-f0-9]{64}$/.test(bindingDigest)) throw connectionFailure('connection_credentials_binding_invalid', '无法确认认证对应的连接目标。', 409);
    const directory = this.secretDirectory(scope);
    this.assertDirectory(directory, this.credentialDataRoot);
    const key = this.key(true)!;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
    const id = crypto.randomUUID(), iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(scope.workspaceId + ':' + id + ':' + bindingDigest));
    const plaintext = JSON.stringify(credentials);
    if (Buffer.byteLength(plaintext) > 16 * 1024) throw connectionFailure('connection_credentials_invalid', '本机认证配置过大。');
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    atomicWriteJson(path.join(directory, id + '.json'), { schemaVersion: 'buildr.connection-credential/v2', bindingDigest, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }, { mode: 0o600 });
    return id;
  }
  readCredentials(scope: ConnectionScope, id: string | null, bindingDigest: string): Record<string, unknown> | null {
    if (id === null) return null;
    if (!uuid(id)) throw connectionFailure('connection_credentials_unavailable', '本机认证编号无效。', 409);
    const directory = this.secretDirectory(scope);
    this.assertDirectory(directory, this.credentialDataRoot);
    const file = path.join(directory, id + '.json'), raw = this.readFile(file, 32 * 1024);
    if (raw === null) return null;
    const key = this.key(false);
    if (!key) return null;
    try {
      const value = JSON.parse(raw);
      if (value.schemaVersion !== 'buildr.connection-credential/v2' || !/^sha256-[a-f0-9]{64}$/.test(value.bindingDigest)) throw connectionFailure('connection_credentials_binding_invalid', '本机认证尚未绑定连接目标，请重新配置认证信息。', 409);
      if (value.bindingDigest !== bindingDigest) throw connectionFailure('connection_credentials_target_changed', '连接的地址、身份或类型已改变，请为当前目标重新配置认证信息。', 409);
      if ((fs.statSync(file).mode & 0o077) !== 0) throw new Error('invalid secret');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
      decipher.setAAD(Buffer.from(scope.workspaceId + ':' + id + ':' + bindingDigest)); decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
      const valueRaw = JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
      return inputObject(valueRaw, Object.keys(valueRaw || {}));
    } catch (error) {
      if (['connection_credentials_binding_invalid', 'connection_credentials_target_changed'].includes((error as { code?: string }).code || '')) throw error;
      throw connectionFailure('connection_credentials_unavailable', '本机认证无法解密；请重新配置认证信息。', 409);
    }
  }
  discardUnreferencedCredentials(scope: ConnectionScope, id: string | null): void {
    this.assertCredentialWritable();
    if (!uuid(id)) return;
    try {
      const unreferenced = this.store.runWorkspaceSqliteRead(scope.rootPath, context => {
        const database = sqliteContextDatabaseOrNull(context);
        if (!database) return false;
        const initialized = this.initialized(database, scope), records = this.records(database);
        if (!initialized && records.length) return false;
        return !records.some(record => record.credentialId === id);
      });
      if (unreferenced) this.removeCredentials(scope, id);
    } catch { /* An unreadable or unconfirmed store cannot prove that newly written ciphertext is unreferenced. */ }
  }
  removeCredentials(scope: ConnectionScope, id: string | null): void {
    this.assertCredentialWritable();
    if (!uuid(id)) return;
    this.assertDirectory(this.secretDirectory(scope), this.credentialDataRoot);
    fs.rmSync(path.join(this.secretDirectory(scope), id + '.json'), { force: true });
  }
  public(scope: ConnectionScope, record: ConnectionRecord, bindingDigest: string | null): PublicConnection {
    const { credentialId, ...fields } = record;
    let hasCredentials = false;
    try { hasCredentials = bindingDigest !== null && this.readCredentials(scope, credentialId, bindingDigest) !== null; } catch { /* Unavailable local authentication does not hide the registered target. */ }
    return { ...fields, hasCredentials, revision: recordRevision(record) };
  }
}
