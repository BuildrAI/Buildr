import type { ConnectionBinding, ConnectionDefinition } from '../../connection-skills/domain/definition.ts';
import { connectionFailure, databaseName, expectedRevision, inputObject, mysqlConfiguration, passwordInput, queryPreferenceValues, type ConnectionProvider } from '../../connections/domain/connection.ts';
import { createMySqlProvider } from '../../connections/infrastructure/mysql-query.ts';
import type { ConnectionStoreRuntime } from '../../connections/persistence/connection-repository.ts';
import { MySqlQueryPreferences } from '../persistence/query-preferences.ts';

export type MySqlSelectedConnection = {
  scope: { rootPath: string; workspaceId: string };
  skillId: string; binding: ConnectionBinding; definition: ConnectionDefinition;
  connection: { id: string; revision: string; config: Record<string, unknown>; authentication: { source: 'personal' | 'team'; values: Record<string, unknown> } };
};
export type MySqlConnectionAccess = <T>(root: string, selection: { id: string; expectedRevision: string }, consume: (selected: MySqlSelectedConnection) => T) => T;
export class MySqlQueryApplication {
  private readonly useConnection: MySqlConnectionAccess;
  private readonly preferences: MySqlQueryPreferences;
  private readonly mysql: NonNullable<ConnectionProvider['mysql']>;
  constructor(options: { store: ConnectionStoreRuntime; useConnection: MySqlConnectionAccess; mysql?: NonNullable<ConnectionProvider['mysql']> }) {
    this.useConnection = options.useConnection; this.preferences = new MySqlQueryPreferences(options.store); this.mysql = options.mysql ?? createMySqlProvider().mysql!;
  }
  private withAccess<T>(root: string, id: string, revision: unknown, consume: (selected: MySqlSelectedConnection, config: Record<string, unknown>, credentials: Record<string, unknown>) => T): T {
    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) throw connectionFailure('mysql_query_connection_invalid', '查询目标连接编号无效。');
    if (typeof revision !== 'string' || !revision || ['unavailable', 'unreadable', 'absent'].includes(revision)) throw connectionFailure('connection_skill_revision_required', '请刷新并明确选择当前连接版本。', 409);
    return this.useConnection(root, { id, expectedRevision: revision }, selected => {
      const definition = selected.definition;
      const program = definition.programs.cli;
      if (selected.skillId !== 'mysql-connection' || selected.binding.skillAssetIdentity !== 'buildr:skill:mysql-connection' || selected.binding.sourceIdentity !== 'package:skills/connections/mysql-connection' || definition.definitionId !== 'mysql' || definition.systemId !== 'mysql' || definition.category !== 'data-source' || definition.configVersion !== 1 || selected.binding.definitionId !== 'mysql' || selected.binding.configVersion !== 1 || !['host', 'port'].every(key => definition.authentication.targetFields.includes(key)) || program?.kind !== 'installed' || program.executable !== 'buildr-mysql' || program.contextProtocol !== 'buildr.connection-context/v1') throw connectionFailure('mysql_query_connection_unsupported', '当前独立查询工具仅支持已明确绑定的内置 MySQL 接入。', 422);
      if (selected.connection.id !== id || selected.connection.revision !== revision) throw connectionFailure('connection_skill_revision_conflict', '连接目标或版本已变化，请刷新后重试。', 409);
      const config = inputObject(selected.connection.config, ['host', 'port', 'defaultDatabase']);
      const authentication = inputObject(selected.connection.authentication.values, ['username', 'password']);
      const target = mysqlConfiguration({ ...config, username: authentication.username, selectedDatabases: [] });
      const credentials = { password: passwordInput(authentication.password) };
      return consume(selected, target, credentials);
    });
  }
  queryPreferences(root: string, id: string, revision: unknown) { return this.withAccess(root, id, revision, selected => this.preferences.get(selected.scope, id, selected.binding)); }
  saveQueryPreferences(root: string, id: string, raw: unknown) {
    const input = inputObject(raw, ['connectionRevision', 'expectedRevision', 'enabledDatabases', 'currentDatabase']);
    const revision = expectedRevision(input.expectedRevision), values = queryPreferenceValues({ enabledDatabases: input.enabledDatabases, currentDatabase: input.currentDatabase });
    return this.withAccess(root, id, input.connectionRevision, selected => this.preferences.save(selected.scope, id, selected.binding, values, revision));
  }
  async databases(root: string, id: string, revision: unknown) { return this.withAccess(root, id, revision, async (_selected, config, credentials) => ({ connectionId: id, databases: await this.mysql.databases(config, credentials) })); }
  async tables(root: string, id: string, revision: unknown, database: unknown) { const name = databaseName(database); return this.withAccess(root, id, revision, async (_selected, config, credentials) => ({ connectionId: id, database: name, tables: await this.mysql.tables(config, credentials, name) })); }
  async columns(root: string, id: string, revision: unknown, database: unknown, table: unknown) { const db = databaseName(database), name = databaseName(table); return this.withAccess(root, id, revision, async (_selected, config, credentials) => ({ connectionId: id, database: db, table: name, columns: await this.mysql.columns(config, credentials, db, name) })); }
  async query(root: string, id: string, raw: unknown) {
    const input = inputObject(raw, ['connectionRevision', 'sql', 'database']);
    return this.withAccess(root, id, input.connectionRevision, async (_selected, config, credentials) => ({ connectionId: id, ...await this.mysql.query(config, credentials, { sql: input.sql, ...(Object.hasOwn(input, 'database') ? { database: input.database } : {}) }) }));
  }
}
