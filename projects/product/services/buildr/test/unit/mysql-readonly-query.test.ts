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
