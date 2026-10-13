import crypto from 'node:crypto';
import { sameFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';
import { ConnectionRepository, type ConnectionStoreRuntime } from '../persistence/connection-repository.ts';
import { ConnectionProviderRegistry, type ConnectionProvider } from './connection-provider.ts';
import { createMySqlProvider } from '../infrastructure/mysql-query.ts';
import { CONNECTION_FIELDS, configuration, connectionFailure, connectionId, databaseName, expectedRevision, inputObject, recordRevision, type ConnectionConfiguration, type ConnectionRecord, type ConnectionScope, queryPreferenceValues } from '../domain/connection.ts';

export class ConnectionsApplication {
  private readonly repository: ConnectionRepository;
  private readonly providers: ConnectionProviderRegistry;
  private readonly resolveScope: (root: string) => ConnectionScope;
  private readonly configurationWritable: boolean;
  constructor(options: { dataRoot: string; store: ConnectionStoreRuntime; resolveScope(root: string): ConnectionScope; providers?: ConnectionProvider[]; credentialDataRoot?: string; readonlyScope?: ConnectionScope }) {
    if (Boolean(options.credentialDataRoot) !== Boolean(options.readonlyScope)) throw connectionFailure('connection_preview_scope_required', '只读认证来源必须绑定准确工作空间。', 409);
    this.repository = new ConnectionRepository(options.dataRoot, options.store, options.credentialDataRoot);
    this.configurationWritable = options.readonlyScope === undefined;
    this.resolveScope = root => {
      const scope = options.resolveScope(root), bound = options.readonlyScope;
      if (bound && (scope.workspaceId !== bound.workspaceId || !sameFilesystemPath(scope.rootPath, bound.rootPath))) throw connectionFailure('connection_preview_scope_mismatch', '此预览的认证来源仅适用于启动时绑定的工作空间。', 409);
      return scope;
    };
    this.providers = new ConnectionProviderRegistry(options.providers ?? [createMySqlProvider()]);
  }
  list(root: string) {
    const scope = this.resolveScope(root);
    return { connections: this.repository.read(scope).map(record => this.public(scope, record)), ...(!this.configurationWritable ? { configurationWritable: false } : {}) };
  }
  private assertConfigurationWritable() { if (!this.configurationWritable) throw connectionFailure('connection_preview_readonly', '此预览使用日常 Buildr 的认证，仅支持查询；连接配置请在日常 Buildr 中修改。', 409); }
  private bindingDigest(config: ConnectionConfiguration, provider = this.providers.get(config.type, config.category)): string {
    const identity = provider.authenticationTargetIdentity(config.config);
    if (typeof identity !== 'string' || !identity || Buffer.byteLength(identity) > 32 * 1024) throw connectionFailure('connection_credentials_binding_invalid', '提供者无法确认认证对应的连接目标。', 409);
    return 'sha256-' + crypto.createHash('sha256').update(JSON.stringify([config.category, config.type, identity])).digest('hex');
  }
  private public(scope: ConnectionScope, record: ConnectionRecord) {
    let bindingDigest: string | null = null;
    try { bindingDigest = this.bindingDigest(record); }
    catch (error) { if ((error as { code?: string }).code !== 'connection_type_unsupported') throw error; }
    return this.repository.public(scope, record, bindingDigest);
  }
  private find(scope: ConnectionScope, id: string, records = this.repository.read(scope)): ConnectionRecord {
    connectionId(id);
    const record = records.find(item => item.id === id);
    if (!record) throw connectionFailure('connection_not_found', '连接不存在，请刷新连接列表。', 404);
    return record;
  }
  private observed(record: ConnectionRecord, revision: unknown): void {
    if (recordRevision(record) !== expectedRevision(revision)) throw connectionFailure('connection_revision_conflict', '连接已被其他入口修改，请刷新后重试。', 409);
  }
  private normalize(input: Record<string, unknown>, previous?: ConnectionRecord) {
    const fields = Object.fromEntries(CONNECTION_FIELDS.filter(key => key in input).map(key => [key, input[key]]));
    const merged = configuration({ ...fields, config: fields.config === undefined ? previous?.config : { ...(previous?.config || {}), ...inputObject(fields.config, Object.keys((fields.config || {}) as object)) } }, previous);
    const provider = this.providers.get(merged.type, merged.category);
    if (previous && (previous.type !== merged.type || previous.category !== merged.category)) throw connectionFailure('connection_type_change_forbidden', '连接类型创建后不可更换，请新建连接。');
    merged.config = provider.validateConfig(merged.config, previous?.config);
    if (previous?.credentialId && this.bindingDigest(previous, provider) !== this.bindingDigest(merged, provider) && input.credentials === undefined) throw connectionFailure('connection_credentials_required', '地址、端口或用户名改变后，请重新填写认证信息，避免将旧认证交给新目标。');
    const credentials = input.credentials === undefined ? undefined : provider.validateCredentials(input.credentials);
    return { configuration: merged, provider, credentials };
  }
  create(root: string, value: unknown) {
    this.assertConfigurationWritable();
    const input = inputObject(value, [...CONNECTION_FIELDS, 'credentials']);
    const scope = this.resolveScope(root), normalized = this.normalize(input);
    let newCredential: string | null = null;
    let record: ConnectionRecord;
    try { record = this.repository.mutate(scope, records => {
      if (records.length >= 1000) throw connectionFailure('connection_limit_reached', '连接数量已达 1000 个。', 409);
      const stamp = new Date().toISOString();
      const current: ConnectionRecord = { ...normalized.configuration, id: 'connection-' + crypto.randomUUID(), credentialId: normalized.credentials === undefined ? null : (newCredential = this.repository.writeCredentials(scope, normalized.credentials, this.bindingDigest(normalized.configuration, normalized.provider))), createdAt: stamp, updatedAt: stamp };
      records.push(current); return current;
    }); } catch (error) { this.repository.discardUnreferencedCredentials(scope, newCredential); throw error; }
    return { connection: this.public(scope, record) };
  }
  update(root: string, id: string, value: unknown) {
    this.assertConfigurationWritable();
    const input = inputObject(value, [...CONNECTION_FIELDS, 'credentials', 'expectedRevision']);
    const scope = this.resolveScope(root); let previousCredential: string | null = null, newCredential: string | null = null;
    let record: ConnectionRecord;
    try { record = this.repository.mutate(scope, records => {
      const current = this.find(scope, id, records); this.observed(current, input.expectedRevision);
      const normalized = this.normalize(input, current);
      previousCredential = current.credentialId;
      const next: ConnectionRecord = { ...current, ...normalized.configuration, credentialId: normalized.credentials === undefined ? current.credentialId : (newCredential = this.repository.writeCredentials(scope, normalized.credentials, this.bindingDigest(normalized.configuration, normalized.provider))), updatedAt: new Date().toISOString() };
      records.splice(records.indexOf(current), 1, next); return next;
    }); } catch (error) { this.repository.discardUnreferencedCredentials(scope, newCredential); throw error; }
    if (previousCredential !== record.credentialId) { try { this.repository.removeCredentials(scope, previousCredential); } catch { /* The committed connection remains authoritative; unreferenced local ciphertext can be cleaned later. */ } }
    return { connection: this.public(scope, record) };
  }
  remove(root: string, id: string, value: unknown) {
    this.assertConfigurationWritable();
    const input = inputObject(value, ['expectedRevision']), scope = this.resolveScope(root);
    const credentialId = this.repository.mutate(scope, records => { const current = this.find(scope, id, records); this.observed(current, input.expectedRevision); records.splice(records.indexOf(current), 1); return current.credentialId; });
    try { this.repository.removeCredentials(scope, credentialId); } catch { /* Removal of registration never operates on the external system. */ }
    return { removedId: id };
  }
  queryPreferences(root: string, id: string) {
    connectionId(id); return this.repository.queryPreferences(this.resolveScope(root), id);
  }
  saveQueryPreferences(root: string, id: string, value: unknown) {
    connectionId(id);
    const input = inputObject(value, ['enabledDatabases', 'currentDatabase', 'expectedRevision']);
    if (typeof input.expectedRevision !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(input.expectedRevision)) throw connectionFailure('connection_query_preferences_revision_required', '请刷新数据库选择后再保存。', 409);
    const values = queryPreferenceValues({ enabledDatabases: input.enabledDatabases, currentDatabase: input.currentDatabase });
    return this.repository.saveQueryPreferences(this.resolveScope(root), id, values, input.expectedRevision);
  }
  async test(root: string, value: unknown) {
    const input = inputObject(value, [...CONNECTION_FIELDS, 'credentials', 'id', 'expectedRevision']), scope = this.resolveScope(root);
    const previous = input.id === undefined ? undefined : this.find(scope, connectionId(input.id));
    if (previous) this.observed(previous, input.expectedRevision);
    const normalized = this.normalize(input, previous);
    const credentials = normalized.credentials ?? (previous ? this.repository.readCredentials(scope, previous.credentialId, this.bindingDigest(normalized.configuration, normalized.provider)) : null);
    return normalized.provider.test(normalized.configuration.config, credentials ?? {});
  }
  private access(root: string, id: string) {
    const scope = this.resolveScope(root), record = this.find(scope, id), provider = this.providers.get(record.type, record.category);
    const credentials = this.repository.readCredentials(scope, record.credentialId, this.bindingDigest(record, provider));
    if (!provider.mysql) throw connectionFailure('connection_operation_unsupported', '该连接不提供 MySQL 查询能力。', 422);
    return { record, credentials: credentials ?? {}, mysql: provider.mysql };
  }
  async databases(root: string, id: string) { const access = this.access(root, id); return { connectionId: id, databases: await access.mysql.databases(access.record.config, access.credentials) }; }
  async tables(root: string, id: string, database: unknown) { const name = databaseName(database), access = this.access(root, id); return { connectionId: id, database: name, tables: await access.mysql.tables(access.record.config, access.credentials, name) }; }
  async columns(root: string, id: string, database: unknown, table: unknown) { const db = databaseName(database), name = databaseName(table), access = this.access(root, id); return { connectionId: id, database: db, table: name, columns: await access.mysql.columns(access.record.config, access.credentials, db, name) }; }
  async query(root: string, id: string, value: unknown) {
    const input = inputObject(value, ['sql', 'database']), access = this.access(root, id);
    return { connectionId: id, ...await access.mysql.query(access.record.config, access.credentials, { sql: input.sql, ...(Object.hasOwn(input, 'database') ? { database: input.database } : {}) }) };
  }
}
