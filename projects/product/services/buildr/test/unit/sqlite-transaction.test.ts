import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseSync } from 'node:sqlite';

import { createTransactionManager, transactionDatabase } from '../../src/infrastructure/sqlite/transaction.ts';

function fixture() {
  const statements: string[] = [];
  let closed = false;
  let active = false;
  const database = {
    get isTransaction() { return active; },
    exec(sql: string) {
      statements.push(sql);
      if (sql === 'BEGIN IMMEDIATE') active = true;
      if (sql === 'COMMIT' || sql === 'ROLLBACK') active = false;
    },
    close() { closed = true; },
  } as unknown as DatabaseSync;
  const manager = createTransactionManager({
    assertCanonicalStructuredWorkspace: (root) => root,
    openWorkspaceStructuredStore: () => ({ present: true, database }),
  });
  return { manager, database, statements, closed: () => closed };
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
