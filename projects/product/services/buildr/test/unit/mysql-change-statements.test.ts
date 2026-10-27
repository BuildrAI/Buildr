import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareChangeStatement } from '../../src/modules/mysql-query/infrastructure/mysql-client.ts';

test('classifies data modification statements and requires a scoped predicate', async () => {
  assert.deepEqual(await prepareChangeStatement('UPDATE orders SET status = 1 WHERE id = 2', 'shop'), {
    category: 'dml', statement: 'UPDATE orders SET status = 1 WHERE id = 2', database: 'shop', table: 'orders', destructive: false,
  });
  assert.equal((await prepareChangeStatement('DELETE FROM orders WHERE id = 2', 'shop')).category, 'dml');
  assert.equal((await prepareChangeStatement('INSERT INTO billing.orders (id) VALUES (1)', 'shop')).database, 'billing');
  await assert.rejects(prepareChangeStatement('DELETE FROM orders', 'shop'), { code: 'mysql_change_where_required' });
  await assert.rejects(prepareChangeStatement('UPDATE orders SET status = 1', 'shop'), { code: 'mysql_change_where_required' });
});

test('classifies structure statements, marks destructive ones and requires a database', async () => {
  const create = await prepareChangeStatement('CREATE TABLE orders_new (id int)', 'shop');
  assert.deepEqual([create.category, create.table, create.destructive], ['ddl', 'orders_new', false]);
  assert.equal((await prepareChangeStatement('ALTER TABLE orders ADD COLUMN note varchar(10)', 'shop')).category, 'ddl');
  assert.equal((await prepareChangeStatement('CREATE INDEX idx_orders ON orders (id)', 'shop')).table, 'orders');
  assert.equal((await prepareChangeStatement('DROP INDEX idx_orders ON orders', 'shop')).destructive, false);
  assert.equal((await prepareChangeStatement('DROP TABLE orders', 'shop')).destructive, true);
  assert.equal((await prepareChangeStatement('TRUNCATE TABLE orders', 'shop')).destructive, true);
  await assert.rejects(prepareChangeStatement('ALTER TABLE orders ADD COLUMN note varchar(10)', null), { code: 'mysql_change_database_required' });
});

test('keeps privileges, server state, routines, files and multi-table statements out of the change surface', async () => {
  for (const sql of [
    'GRANT ALL ON *.* TO fixture_user',
    'SET GLOBAL max_connections = 10',
    'CALL fixture_procedure()',
    'CREATE VIEW fixture_view AS SELECT 1',
    'DROP DATABASE shop',
    'SELECT 1 INTO OUTFILE "/tmp/fixture"',
    'SELECT 1',
  ]) await assert.rejects(prepareChangeStatement(sql, 'shop'), { code: 'mysql_change_forbidden' }, sql);
  await assert.rejects(prepareChangeStatement('UPDATE orders SET a = 1 WHERE id = 1; DELETE FROM orders WHERE id = 2', 'shop'), { code: 'mysql_change_invalid' });
  // The parser does not recognise REVOKE; unparsed input is rejected without reaching the database.
  await assert.rejects(prepareChangeStatement('REVOKE ALL ON *.* FROM fixture_user', 'shop'), { code: 'mysql_change_invalid' });
  await assert.rejects(prepareChangeStatement('UPDATE orders JOIN billing.orders AS other ON other.id = orders.id SET orders.status = 1 WHERE orders.id = 1', 'shop'), { code: 'mysql_change_unsupported' });
  await assert.rejects(prepareChangeStatement('SELECT 1 /*!50000 INTO OUTFILE "/tmp/fixture" */', 'shop'), { code: 'mysql_change_invalid' });
});
