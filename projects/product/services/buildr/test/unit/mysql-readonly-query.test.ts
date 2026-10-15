import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareReadOnlySql } from '../../src/modules/mysql-query/infrastructure/mysql-client.ts';

test('MySQL parses SELECT, CTE, JSON, joins, aggregation, and outer UNION limits', async () => {
  const plain = await prepareReadOnlySql('SELECT id FROM orders_demo.orders WHERE id = 2;');
  assert.equal(plain.rowLimit, 100); assert.match(plain.executedSql, /LIMIT 100$/);
  assert.equal(plain.submittedSql, 'SELECT id FROM orders_demo.orders WHERE id = 2;');
  for (const sql of [
    "WITH chosen AS (SELECT id FROM orders_demo.orders WHERE id < 4) SELECT * FROM chosen LIMIT 500",
    "SELECT JSON_UNQUOTE(JSON_EXTRACT(ext, '$.category')) AS category, COUNT(*) AS n FROM orders_demo.orders GROUP BY category LIMIT 2",
    'SELECT a.id, b.id FROM orders_demo.orders a JOIN billing_demo.invoices b ON a.id=b.order_id LIMIT 10 OFFSET 20',
    'SELECT 1 AS id UNION ALL SELECT 2 AS id LIMIT 500',
    'SELECT id FROM orders_demo.orders LIMIT 10, 20',
    'SELECT * FROM (SELECT id FROM orders_demo.orders LIMIT 600) a',
  ]) assert.ok((await prepareReadOnlySql(sql)).executedSql);
  assert.equal((await prepareReadOnlySql('SELECT 1 UNION ALL SELECT 2 LIMIT 500')).rowLimit, 500);
  assert.equal((await prepareReadOnlySql('SELECT 1 UNION ALL SELECT 2')).rowLimit, 100);
  assert.equal((await prepareReadOnlySql('SELECT id FROM t LIMIT 10, 20')).rowLimit, 20);
});
test('MySQL rejects mutation and side effects inside nested expressions and CTEs', async () => {
  for (const sql of [
    'UPDATE t SET id=1', 'DELETE FROM t', 'CREATE TABLE t(id INT)', 'SELECT 1; UPDATE t SET id=1',
    "SELECT * FROM t INTO OUTFILE '/tmp/forbidden'", "SELECT 1 INTO DUMPFILE '/tmp/forbidden'", 'SELECT 1 INTO @x', 'SELECT @x := 1',
    "SELECT * FROM t FOR UPDATE", "SELECT GET_LOCK('x', 0)", "SELECT LOAD_FILE('/tmp/forbidden')", 'SELECT SLEEP(1)', 'SELECT BENCHMARK(2, MD5(1))',
    'WITH x AS (SELECT SLEEP(1)) SELECT * FROM x', 'SELECT 1 UNION ALL SELECT GET_LOCK(1, 0)', 'SELECT (SELECT SLEEP(1))',
    'SELECT custom_function(1)', 'SELECT tenant.ABS(1)', 'SELECT `ABS`(1)',
  ]) await assert.rejects(() => prepareReadOnlySql(sql), { code: /^mysql_query_/ });
});
test('MySQL rejects excessive LIMIT, ambiguous UNION branch limits, and executable comments', async () => {
  for (const sql of ['SELECT 1 LIMIT 0', 'SELECT 1 LIMIT 501', 'SELECT 1 LIMIT -1', 'SELECT 1 LIMIT ?', 'SELECT 1 UNION SELECT 2 LIMIT 501', '(SELECT 1 LIMIT 500) UNION ALL (SELECT 2 LIMIT 500)', 'SELECT id FROM t /*!80000 WHERE id = 1 */']) await assert.rejects(() => prepareReadOnlySql(sql), { code: /^mysql_query_/ });
  assert.equal((await prepareReadOnlySql('SELECT 1 /* ordinary comment */')).executedSql, 'SELECT 1 LIMIT 100');
  assert.equal((await prepareReadOnlySql('SELECT 1 -- ordinary comment')).executedSql, 'SELECT 1 LIMIT 100');
});
test('MySQL never silently rounds a high-precision decimal filter', async () => {
  await assert.rejects(() => prepareReadOnlySql('SELECT 0.123456789012345678901'), { code: 'mysql_query_precision_unsupported' });
  await assert.rejects(() => prepareReadOnlySql('SELECT * FROM t WHERE amount = 123456789012345.67'), { code: 'mysql_query_precision_unsupported' });
  assert.match((await prepareReadOnlySql('SELECT 9007199254740993')).executedSql, /9007199254740993/);
  assert.match((await prepareReadOnlySql("SELECT CAST('0.123456789012345678901' AS DECIMAL(30,21))")).executedSql, /0\.123456789012345678901/);
  assert.ok((await prepareReadOnlySql('SELECT 12.345 /* 0.123456789012345678901 */')).executedSql);
});
test('MySQL rejects scientific numeric literals instead of regenerating them as columns or arithmetic', async () => {
  for (const literal of ['1e2', '1E2', '1E+2', '1e-2', '+1e2', '-1e2', '1.25e2', '1.e2', '.5e+2', '1e309', '1e-400', '1e2+3', '2*1e2', '1e2/2']) {
    await assert.rejects(() => prepareReadOnlySql(`SELECT id FROM t WHERE amount > ${literal}`), error => {
      assert.equal((error as { code?: string }).code, 'mysql_query_scientific_notation_unsupported', literal);
      assert.match((error as Error).message, /科学计数.*普通数值/);
      return true;
    });
  }
  await assert.rejects(() => prepareReadOnlySql('SELECT t.1e2 + 1e2 FROM t'), { code: 'mysql_query_scientific_notation_unsupported' });
  await assert.rejects(() => prepareReadOnlySql('SELECT 1e2.amount FROM t'), { code: 'mysql_query_scientific_notation_unsupported' });
  for (const expression of ['t.1E+2e3', 't.1E-2e3', 't.1E+2E+3', 't.1E-2E-3', 't.1E+2e-3', 't.1E-2e+3', 't.1E+2e3*3']) {
    await assert.rejects(() => prepareReadOnlySql(`SELECT ${expression} FROM t`), { code: 'mysql_query_scientific_notation_unsupported' }, expression);
  }
  for (const sql of ['SELECT id FROM t WHERE amount > 100', 'SELECT id FROM t WHERE amount > 0.0125', 'SELECT -100, +100']) {
    const result = await prepareReadOnlySql(sql);
    assert.equal(result.submittedSql, sql); assert.match(result.executedSql, /LIMIT 100$/);
  }
});
test('scientific-looking strings, comments and real identifier names remain usable', async () => {
  for (const sql of [
    "SELECT `1e2`, '1e2', \"1E+2\", '1e309' FROM t",
    "SELECT 'it''s 1e2', 'escaped\\'1E+2' FROM t",
    'SELECT value1e2, e2value, 1e2value, 1e309value, 金额1e2 FROM t',
    'SELECT 100 /* 1e2 1E+2 1e309 */ FROM t',
    'SELECT 100 FROM t -- 1e2 1E+2\n',
    'SELECT 100 FROM t # 1e2 1E+2\n',
  ]) {
    const result = await prepareReadOnlySql(sql);
    assert.equal(result.submittedSql, sql); assert.match(result.executedSql, /LIMIT 100$/, sql);
  }
  const names = await prepareReadOnlySql('SELECT value1e2, e2value, 1e2value, 1e309value, 金额1e2 FROM t');
  for (const name of ['value1e2', 'e2value', '1e2value', '1e309value', '金额1e2']) assert.ok(names.executedSql.includes('`' + name + '`'), name);
  const strings = await prepareReadOnlySql("SELECT `1e2`, '1e2', '1E+2', '1e309' FROM t");
  for (const spelling of ['`1e2`', "'1e2'", "'1E+2'", "'1e309'"]) assert.ok(strings.executedSql.includes(spelling), spelling);
});
test('qualified numeric-looking identifiers keep their original column meaning', async () => {
  for (const reference of ['t.1e2', 't . 1e2', '`t`.1e2', 't./* qualifier */1e2', 't.1E+2', 't.1E-2', 't.1e309', 't.1E+2e3value', 't.1E+2e3foo', 't.1E+2E']) {
    const result = await prepareReadOnlySql(`SELECT ${reference} FROM t`);
    assert.match(result.executedSql, /`t`\.`1[eE](?:2|309)?`/, reference);
    if (reference === 't.1E+2') assert.match(result.executedSql, /`t`\.`1E` \+ 2/);
    if (reference === 't.1E-2') assert.match(result.executedSql, /`t`\.`1E` - 2/);
    if (reference === 't.1E+2e3value') assert.match(result.executedSql, /`t`\.`1E` \+ `2e3value`/);
    if (reference === 't.1E+2e3foo') assert.match(result.executedSql, /`t`\.`1E` \+ `2e3foo`/);
    if (reference === 't.1E+2E') assert.match(result.executedSql, /`t`\.`1E` \+ `2E`/);
    assert.match(result.executedSql, /LIMIT 100$/);
  }
});
