import type { DatabaseSync } from 'node:sqlite';

export type TransactionContext = object;
export type SqliteReadContext = object;
export type SqliteContext = TransactionContext | SqliteReadContext;

export type TransactionManager = {
  run<T>(targetRoot: string, action: (transaction: TransactionContext) => T): T;
};

type OpenedStore = { present: boolean; database: DatabaseSync | null };
type TransactionRuntime = {
  assertCanonicalStructuredWorkspace(targetRoot: string, options?: { writable?: boolean }): string;
  openWorkspaceStructuredStore(targetRoot: string, options: { writable: boolean }): OpenedStore;
};

const DATABASES = new WeakMap<SqliteContext, DatabaseSync>();

export function sqliteContextDatabase(context: SqliteContext): DatabaseSync {
  const database = DATABASES.get(context);
  if (!database) throw new Error('TransactionContext 不属于当前 SQLite 事务。');
  return database;
}

export function sqliteContextDatabaseOrNull(context: SqliteContext): DatabaseSync | null {
  return DATABASES.get(context) ?? null;
}

export const transactionDatabase = sqliteContextDatabase;

export function runSqliteRead<T>(runtime: TransactionRuntime, targetRoot: string, action: (context: SqliteReadContext) => T): T {
  const root = runtime.assertCanonicalStructuredWorkspace(targetRoot);
  const opened = runtime.openWorkspaceStructuredStore(root, { writable: false });
  if (!opened.present || !opened.database) return action(Object.freeze({}));
  const context = Object.freeze({});
  DATABASES.set(context, opened.database);
  try { return action(context); }
  finally {
    DATABASES.delete(context);
    opened.database?.close();
  }
}

export function createTransactionManager(runtime: TransactionRuntime): TransactionManager {
  return Object.freeze({
    run<T>(targetRoot: string, action: (transaction: TransactionContext) => T): T {
      const root = runtime.assertCanonicalStructuredWorkspace(targetRoot, { writable: true });
      const opened = runtime.openWorkspaceStructuredStore(root, { writable: true });
      const database = opened.database;
      if (!database) throw new Error('SQLite writable store 未返回数据库连接。');
      const transaction = Object.freeze({});
      let began = false;
      try {
        if (database.isTransaction) throw new Error('SQLite 业务事务不支持嵌套执行。');
        database.exec('BEGIN IMMEDIATE');
        began = true;
        DATABASES.set(transaction, database);
        const result = action(transaction);
        if (result && typeof (result as { then?: unknown }).then === 'function') {
          throw new Error('SQLite 业务事务回调必须同步执行。');
        }
        database.exec('COMMIT');
        return result;
      } catch (error) {
        if (began && database.isTransaction) {
          try { database.exec('ROLLBACK'); } catch {}
        }
        throw error;
      } finally {
        DATABASES.delete(transaction);
        database.close();
      }
    },
  });
}

export function registerSqliteTransaction(runtime: TransactionRuntime & Record<string, unknown>): typeof runtime {
  const transactionManager = createTransactionManager(runtime);
  Object.assign(runtime, {
    transactionManager,
    runWorkspaceTransaction: transactionManager.run.bind(transactionManager),
    runWorkspaceSqliteRead: <T>(targetRoot: string, action: (context: SqliteReadContext) => T) => runSqliteRead(runtime, targetRoot, action),
  });
  return runtime;
}
