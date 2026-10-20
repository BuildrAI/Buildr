import assert from 'node:assert/strict';
import test from 'node:test';
import { sqlExecutionTarget } from '../src/features/mysql-query/sql-execution-target.ts';

function verify(parts, separator = '\n') {
  const sql = parts.join(separator);
  let from = 0;
  for (const text of parts) {
    // Every code character, including inner SELECTs and delimiters, belongs to this whole query.
    for (let at = from; at < from + text.length; at++) {
      const target = sqlExecutionTarget(sql, { from: at, to: at });
      assert.deepEqual(target, { sql: text, mode: 'cursor', from, to: from + text.length }, `offset ${at}: ${sql}`);
      assert.equal(sql.slice(target.from, target.to), target.sql);
    }
    from += text.length + separator.length;
  }
  return sql;
}

test('无分号查询和混合分隔逐条定位，同行与多行均保持准确原文', () => {
  verify(['SELECT id, name\nFROM `saasx`.`sys_user`', 'SELECT *\nFROM `p_product_category`', 'SELECT 3;']);
  verify(['SELECT 1;', 'SELECT 2', 'SELECT 3;', 'SELECT 4']);
  verify(['SELECT 1', 'SELECT 2', 'SELECT 3'], '  ');
  verify(["SELECT '; SELECT UNION WITH' AS text", 'SELECT 2']);
});

test('复杂子查询、派生表和空行不构成边界', () => {
  verify([
    'SELECT id,\n (SELECT MAX(id) FROM users) AS latest\n\nFROM (SELECT id FROM users WHERE id IN (SELECT id FROM roles)) AS u\nWHERE EXISTS (SELECT 1 FROM roles r WHERE r.id = u.id)',
    'SELECT 2',
  ]);
});

test('UNION、ALL、DISTINCT、括号分支及分支注释保持整体', () => {
  for (const query of [
    'SELECT 1 UNION SELECT 2 UNION ALL SELECT 3',
    'SELECT 1 UNION DISTINCT /* SELECT ignored */ SELECT 2',
    '(SELECT 1) UNION ALL (SELECT 2)',
    'SELECT id FROM users UNION ALL (SELECT id FROM roles LIMIT 1) ORDER BY id',
  ]) verify([query, 'SELECT 99']);
});

test('WITH 多个公共表、列列表、递归和嵌套不会拆掉主查询', () => {
  for (const query of [
    'WITH a AS (SELECT 1 AS id), b AS (SELECT id FROM a) SELECT * FROM b',
    'WITH `a`(id) AS (SELECT 1), b AS (SELECT id FROM a UNION ALL SELECT 2) SELECT id FROM b UNION SELECT 3',
    'WITH RECURSIVE a(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM a WHERE n < 5) SELECT * FROM a',
    'WITH a AS (WITH b AS (SELECT 1 AS id) SELECT id FROM b) SELECT * FROM a',
  ]) verify(['SELECT 0', query, 'WITH last_query AS (SELECT 9 AS id) SELECT id FROM last_query', 'SELECT 99;']);
});

test('WITH ROLLUP 是当前查询的延续，不能误认为新 WITH 查询', () => {
  verify(['SELECT category, count(*) FROM products GROUP BY category WITH /* gap */ ROLLUP', 'SELECT 2']);
});

test('注释、转义引号和标识符中的关键字不参与边界推断', () => {
  for (const query of [
    "SELECT 'it''s SELECT; WITH' AS value",
    "SELECT 'escaped\\\' SELECT; WITH' AS value",
    'SELECT `SELECT`, `WITH` FROM `UNION`',
    'SELECT 1 /* SELECT 9; WITH ignored */ AS id',
    'SELECT 1 -- SELECT 9; WITH ignored\nAS id',
    'SELECT 1 # SELECT 9; WITH ignored\nAS id',
  ]) verify([query, 'SELECT 2']);
  const sql = 'SELECT 1\n-- next SELECT; WITH ignored\nSELECT 2';
  const target = sqlExecutionTarget(sql, { from: sql.length, to: sql.length });
  assert.equal(target.sql, '-- next SELECT; WITH ignored\nSELECT 2');
});

test('不确定或未完成的当前语句不自动执行，完整前段仍可使用', () => {
  for (const sql of ['SELECT * FROM\nSELECT 2', 'SELECT 1 UNION\nSELECT', 'WITH a AS (SELECT 1)\nSELECT', 'SELECT (1', 'SELECT 1)\nSELECT 2']) {
    assert.throws(() => sqlExecutionTarget(sql, { from: 1, to: 1 }), /无法确定|不完整/, sql);
  }
  const sql = "SELECT 1\nSELECT 'unclosed";
  assert.equal(sqlExecutionTarget(sql, { from: 3, to: 3 }).sql, 'SELECT 1');
  assert.throws(() => sqlExecutionTarget(sql, { from: sql.length, to: sql.length }), /不完整/);
  for (const unknown of ['SELECT a FROM t QUALIFY a > 1', '(SELECT id FROM users UNION ALL SELECT id FROM roles) ORDER BY id']) {
    assert.throws(() => sqlExecutionTarget(unknown, { from: 2, to: 2 }), /无法确定/, '固定版本解析器未支持的语法不能靠关键字猜测');
    assert.equal(sqlExecutionTarget(unknown, { from: 0, to: unknown.length }).sql, unknown, '显式选区原样交给后端校验');
  }
});

test('显式选择多条推断语句仍被拒绝，不从外层命令抽取内部 SELECT', () => {
  for (const sql of ['SELECT 1\nSELECT 2', 'WITH a AS (SELECT 1) SELECT * FROM a\nSELECT 2']) {
    assert.throws(() => sqlExecutionTarget(sql, { from: 0, to: sql.length }), /只能执行一条/);
  }
  for (const sql of ['INSERT INTO t SELECT * FROM users;', 'CREATE TABLE t AS SELECT * FROM users;', 'EXPLAIN SELECT * FROM users;']) {
    const target = sqlExecutionTarget(sql, { from: sql.indexOf('SELECT'), to: sql.indexOf('SELECT') });
    assert.equal(target.sql, sql, '定位外层原文，权限继续由后端判断');
  }
});

test('编辑后不复用旧边界，超过本地语法分析预算的文本不猜测', () => {
  const sql = 'SELECT 1\nSELECT 2';
  assert.equal(sqlExecutionTarget(sql, { from: sql.length, to: sql.length }).sql, 'SELECT 2');
  assert.equal(sqlExecutionTarget(sql + '0', { from: sql.length, to: sql.length }).sql, 'SELECT 20');
  const long = 'SELECT 1' + ' '.repeat(65536);
  assert.throws(() => sqlExecutionTarget(long, { from: 1, to: 1 }), /无法确定/);
});
