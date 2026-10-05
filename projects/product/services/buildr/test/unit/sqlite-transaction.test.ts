import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseSync } from 'node:sqlite';

import {
  createTransactionManager, runSqliteRead, sqliteContextDatabase, sqliteContextDatabaseOrNull, transactionDatabase,
} from '../../src/infrastructure/sqlite/transaction.ts';

function fixture(options: { failStatement?: string; initiallyActive?: boolean } = {}) {
  const statements: string[] = [];
  let closed = false;
  let active = options.initiallyActive ?? false;
  const database = {
    get isTransaction() { return active; },
    exec(sql: string) {
      statements.push(sql);
      if (sql === options.failStatement) throw new Error(`failed: ${sql}`);
      if (sql === 'BEGIN IMMEDIATE' || sql === 'BEGIN') active = true;
      if (sql === 'COMMIT' || sql === 'ROLLBACK') active = false;
    },
    close() { closed = true; },
  } as unknown as DatabaseSync;
  const runtime = {
    assertCanonicalStructuredWorkspace: (root) => root,
    openWorkspaceStructuredStore: () => ({ present: true, database }),
  };
  const manager = createTransactionManager(runtime);
  return { manager, runtime, database, statements, closed: () => closed };
}

test('SQLite 业务事务提交并关闭连接', () => {
  const value = fixture();
  assert.equal(value.manager.run('/workspace', (transaction) => {
    assert.equal(transactionDatabase(transaction), value.database);
    return 42;
  }), 42);
  assert.deepEqual(value.statements, ['BEGIN IMMEDIATE', 'COMMIT']);
  assert.equal(value.closed(), true);
});

test('SQLite 业务事务失败或返回 Promise 时回滚并关闭连接', () => {
  for (const action of [() => { throw new Error('failed'); }, () => Promise.resolve('async')]) {
    const value = fixture();
    assert.throws(() => value.manager.run('/workspace', action));
    assert.deepEqual(value.statements, ['BEGIN IMMEDIATE', 'ROLLBACK']);
    assert.equal(value.closed(), true);
  }
});

test('SQLite 业务事务拒绝已存在事务', () => {
  const value = fixture();
  value.database.exec('BEGIN IMMEDIATE');
  assert.throws(() => value.manager.run('/workspace', () => null), /不支持嵌套/);
  assert.deepEqual(value.statements, ['BEGIN IMMEDIATE']);
  assert.equal(value.closed(), true);
});

test('SQLite 只读事务同步返回结果，退出后撤销上下文并关闭连接', () => {
  const value = fixture();
  let savedContext: object;
  assert.equal(runSqliteRead(value.runtime, '/workspace', (context) => {
    savedContext = context;
    assert.equal(Object.isFrozen(context), true);
    assert.equal(sqliteContextDatabase(context), value.database);
    assert.equal(value.database.isTransaction, true);
    return 42;
  }), 42);
  assert.deepEqual(value.statements, ['BEGIN', 'COMMIT']);
  assert.equal(value.closed(), true);
  assert.equal(sqliteContextDatabaseOrNull(savedContext!), null);
  assert.throws(() => sqliteContextDatabase(savedContext!), /不属于当前 SQLite 事务/);
});

test('SQLite 只读事务失败或返回异步结果时回滚、撤销上下文并关闭连接', () => {
  const failure = new Error('read failed');
  for (const action of [() => { throw failure; }, () => Promise.resolve('async'), () => ({ then() {} })]) {
    const value = fixture();
    let savedContext: object;
    assert.throws(() => runSqliteRead(value.runtime, '/workspace', (context) => {
      savedContext = context;
      return action();
    }), (error: Error) => error === failure || /必须同步执行/.test(error.message));
    assert.deepEqual(value.statements, ['BEGIN', 'ROLLBACK']);
    assert.equal(value.closed(), true);
    assert.equal(sqliteContextDatabaseOrNull(savedContext!), null);
  }
});

test('SQLite 只读事务启动或提交失败仍关闭连接，提交失败回滚', () => {
  for (const failStatement of ['BEGIN', 'COMMIT']) {
    const value = fixture({ failStatement });
    let called = false;
    let savedContext: object | undefined;
    assert.throws(() => runSqliteRead(value.runtime, '/workspace', (context) => {
      called = true;
      savedContext = context;
      return 42;
    }), new RegExp(`failed: ${failStatement}`));
    assert.equal(called, failStatement === 'COMMIT');
    assert.deepEqual(value.statements, failStatement === 'BEGIN' ? ['BEGIN'] : ['BEGIN', 'COMMIT', 'ROLLBACK']);
    assert.equal(value.closed(), true);
    if (savedContext) assert.equal(sqliteContextDatabaseOrNull(savedContext), null);
  }
});

test('SQLite 只读事务拒绝复用已存在事务的连接', () => {
  const value = fixture({ initiallyActive: true });
  let called = false;
  assert.throws(() => runSqliteRead(value.runtime, '/workspace', () => { called = true; }), /不支持嵌套/);
  assert.equal(called, false);
  assert.deepEqual(value.statements, []);
  assert.equal(value.closed(), true);
});

test('SQLite 尚无数据库时返回空上下文，保持同步回调边界', () => {
  const runtime = {
    assertCanonicalStructuredWorkspace: (root: string) => root,
    openWorkspaceStructuredStore: () => ({ present: false, database: null }),
  };
  assert.equal(runSqliteRead(runtime, '/workspace', (context) => {
    assert.equal(Object.isFrozen(context), true);
    assert.equal(sqliteContextDatabaseOrNull(context), null);
    return 42;
  }), 42);
  const failure = new Error('read failed');
  assert.throws(() => runSqliteRead(runtime, '/workspace', () => { throw failure; }), (error) => error === failure);
  assert.throws(() => runSqliteRead(runtime, '/workspace', () => Promise.resolve('async')), /必须同步执行/);
});
