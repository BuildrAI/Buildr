import crypto from 'node:crypto';
import { sqliteContextDatabaseOrNull, transactionDatabase, type SqliteReadContext, type TransactionContext } from '../../../infrastructure/sqlite/transaction.ts';
import type { DatabaseSync } from 'node:sqlite';
import type { ConnectionBinding } from '../../connection-skills/domain/definition.ts';
import { mysqlFailure, queryPreferenceValues, type QueryPreferences } from '../domain/mysql.ts';

export type MySqlQueryStore = {
  runWorkspaceSqliteRead<T>(root: string, action: (context: SqliteReadContext) => T): T;
  runWorkspaceTransaction<T>(root: string, action: (context: TransactionContext) => T): T;
};

type Scope = { rootPath: string; workspaceId: string };
const hash = (value: unknown) => 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Local query choices have their own identity and lifecycle, outside connection configuration. */
export class MySqlQueryPreferences {
  private readonly store: MySqlQueryStore;
  constructor(store: MySqlQueryStore) { this.store = store; }
  private identity(binding: ConnectionBinding) { return hash([binding.skillAssetIdentity, binding.definitionId, binding.sourceIdentity, binding.configVersion]); }
  private read(database: DatabaseSync | null, scope: Scope, id: string, binding: ConnectionBinding): QueryPreferences & { generation: number } {
    const bindingKey = this.identity(binding);
    const available = database?.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mysql_skill_query_preferences'").get();
    const row = available ? database!.prepare('SELECT enabled_databases_json, current_database, generation FROM mysql_skill_query_preferences WHERE workspace_id = ? AND instance_id = ? AND binding_key = ?').get(scope.workspaceId, id, bindingKey) : undefined;
    try {
      const values = queryPreferenceValues(row ? { enabledDatabases: JSON.parse(String(row.enabled_databases_json)), currentDatabase: row.current_database } : { enabledDatabases: [], currentDatabase: null });
      const generation = Number(row?.generation ?? 0);
      if (!Number.isSafeInteger(generation) || generation < 0) throw new Error();
      return { ...values, generation, revision: hash([scope.workspaceId, id, bindingKey, generation, values]) };
    } catch { throw mysqlFailure('mysql_query_preferences_unavailable', '查询偏好内容或版本无效；已保留数据库现场。', 409); }
  }
  get(scope: Scope, id: string, binding: ConnectionBinding): QueryPreferences {
    return this.store.runWorkspaceSqliteRead(scope.rootPath, context => {
      const { generation, ...preference } = this.read(sqliteContextDatabaseOrNull(context), scope, id, binding); return preference;
    });
  }
  save(scope: Scope, id: string, binding: ConnectionBinding, values: Omit<QueryPreferences, 'revision'>, expectedRevision: string): QueryPreferences {
    return this.store.runWorkspaceTransaction(scope.rootPath, context => {
      const database = transactionDatabase(context), previous = this.read(database, scope, id, binding);
      if (previous.revision !== expectedRevision) throw mysqlFailure('connection_query_preferences_revision_conflict', '数据库选择已被其他入口修改，请刷新后重试。', 409);
      if (previous.generation >= Number.MAX_SAFE_INTEGER) throw mysqlFailure('mysql_query_preferences_unavailable', '查询偏好版本已达上限。', 409);
      database.prepare('INSERT INTO mysql_skill_query_preferences(workspace_id, instance_id, binding_key, enabled_databases_json, current_database, generation) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, instance_id, binding_key) DO UPDATE SET enabled_databases_json = excluded.enabled_databases_json, current_database = excluded.current_database, generation = excluded.generation').run(scope.workspaceId, id, this.identity(binding), JSON.stringify(values.enabledDatabases), values.currentDatabase, previous.generation + 1);
      const { generation, ...preference } = this.read(database, scope, id, binding); return preference;
    });
  }
}
