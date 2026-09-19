import type { WorkbenchPreference } from '../../../../build/generated/workbench-dto.ts';
import { sqliteContextDatabaseOrNull, transactionDatabase, type SqliteReadContext, type TransactionContext } from '../../../infrastructure/sqlite/transaction.ts';

export type PreferenceStoreRuntime = {
  runWorkspaceSqliteRead<T>(root: string, action: (context: SqliteReadContext) => T): T;
  runWorkspaceTransaction<T>(root: string, action: (context: TransactionContext) => T): T;
};
export function createPreferencesRepository(runtime: PreferenceStoreRuntime) {
  function list(root: string): WorkbenchPreference[] {
    return runtime.runWorkspaceSqliteRead(root, (context) => {
      const db = sqliteContextDatabaseOrNull(context);
      if (!db) return [];
      if (!db.prepare("SELECT name FROM sqlite_master WHERE name = 'workbench_preferences'").get()) {
        if (Number(db.prepare('SELECT max(version) AS version FROM schema_migrations').get()?.version) >= 33) throw Object.assign(new Error('工作台偏好数据表缺失，请保留数据库现场。'), { code: 'workbench_preferences_store_invalid', status: 409 });
        return [];
      }
      return db.prepare('SELECT kind, object_key AS key, label, href, updated_at AS updatedAt FROM workbench_preferences ORDER BY updated_at DESC, rowid DESC').all() as unknown as WorkbenchPreference[];
    });
  }
  function put(root: string, value: WorkbenchPreference): void {
    runtime.runWorkspaceTransaction(root, (context) => {
      const db = transactionDatabase(context);
      const found = db.prepare('SELECT label, href FROM workbench_preferences WHERE kind=? AND object_key=?').get(value.kind, value.key);
      if (value.kind !== 'recent-resource' && found?.label === value.label && found?.href === value.href) return;
      const count = Number(db.prepare('SELECT count(*) AS n FROM workbench_preferences WHERE kind=?').get(value.kind)?.n || 0);
      if (!found && count >= 500 && value.kind !== 'recent-resource') throw Object.assign(new Error('该类偏好已达到500项，请先移除不再使用的对象。'), { code: 'workbench_preference_limit', status: 409 });
      if (value.kind === 'recent-resource') db.prepare('DELETE FROM workbench_preferences WHERE kind=? AND object_key=?').run(value.kind, value.key);
      db.prepare('INSERT INTO workbench_preferences(kind,object_key,label,href,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(kind,object_key) DO UPDATE SET label=excluded.label,href=excluded.href,updated_at=excluded.updated_at').run(value.kind, value.key, value.label, value.href, value.updatedAt);
      if (value.kind === 'recent-resource') db.prepare("DELETE FROM workbench_preferences WHERE kind='recent-resource' AND object_key NOT IN (SELECT object_key FROM workbench_preferences WHERE kind='recent-resource' ORDER BY updated_at DESC, rowid DESC LIMIT 30)").run();
    });
  }
  function remove(root: string, kind: string, key: string): void {
    runtime.runWorkspaceTransaction(root, (context) => { transactionDatabase(context).prepare('DELETE FROM workbench_preferences WHERE kind=? AND object_key=?').run(kind, key); });
  }
  return Object.freeze({ list, put, remove });
}
