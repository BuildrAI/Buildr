import assert from 'node:assert/strict';
import test from 'node:test';
import { sqlExecutionTarget } from '../src/features/connections/sql-execution-target.ts';
import { databasePreferenceView } from '../src/features/connections/database-preferences.ts';

const cursor = (sql, at) => sqlExecutionTarget(sql, { from: at, to: at }).sql;
const selected = sql => sqlExecutionTarget(sql, { from: 0, to: sql.length }).sql;

test('多语句编辑器只运行光标所在语句，选择优先且保留准确选段', () => {
  const sql = 'SELECT 1;\nSELECT 2;\nSELECT 3;';
  assert.equal(cursor(sql, 4), 'SELECT 1;');
  assert.equal(cursor(sql, sql.indexOf('2')), 'SELECT 2;');
  assert.equal(cursor(sql, sql.length), 'SELECT 3;');
  assert.equal(cursor(sql + '\n ', sql.length + 2), 'SELECT 3;');
  const from = sql.indexOf('SELECT 2'), to = from + 'SELECT 2'.length;
  assert.deepEqual(sqlExecutionTarget(sql, { from, to }), { sql: 'SELECT 2', mode: 'selection' });
  assert.deepEqual(sqlExecutionTarget(sql, { from: from + 2, to: to - 1 }), { sql: 'LECT ', mode: 'selection' }, '不完整选择原样交给后端验证，不扩大为完整文档');
});

test('MySQL 字符串、反引号及注释中的分号不拆语句', () => {
  for (const first of [
    "SELECT ';' AS value;",
    'SELECT ";" AS value;',
    "SELECT 'it''s;still one' AS value;",
    'SELECT "a"";b" AS value;',
    "SELECT 'escaped\\\';still one' AS value;",
    'SELECT `a;``b` FROM `table;name`;',
    'SELECT `back\\` FROM names;',
    'SELECT 1 /* ; SELECT ignored; */;',
    'SELECT 1 -- ; SELECT ignored;\n;',
    'SELECT 1 # ; SELECT ignored;\n;',
  ]) {
    const sql = `${first}\nSELECT 2;`;
    assert.equal(cursor(sql, first.indexOf('SELECT') + 4), first);
    assert.equal(cursor(sql, sql.length - 2), 'SELECT 2;');
    assert.equal(selected(first), first);
  }
  assert.throws(() => selected('SELECT 1--not_a_comment; SELECT 2;'), /只能执行一条/);
});

test('选中多条、空白、注释和未闭合文本时不运行其他语句', () => {
  for (const sql of ['SELECT 1; SELECT 2;', 'SELECT 1; /* gap */ SELECT 2', ';;SELECT 1;;SELECT 2;;']) assert.throws(() => selected(sql), /只能执行一条/);
  for (const sql of ['', '  \n', '-- comment\n', '# comment;', '/* SELECT 1; */', '; ;']) assert.throws(() => selected(sql), /空白或注释|没有查询语句/);
  for (const sql of ["SELECT 'unclosed; SELECT 2;", 'SELECT "unclosed', 'SELECT `unclosed', 'SELECT 1 /* unclosed']) assert.throws(() => selected(sql), /不完整/);
  const sql = 'SELECT 1;\n-- no query';
  assert.throws(() => cursor(sql, sql.length), /没有查询语句/);
  const partial = "SELECT 'value;still string'; SELECT 2;";
  assert.throws(() => sqlExecutionTarget(partial, { from: 0, to: partial.indexOf('still') }), /不完整/);
  assert.equal(cursor("SELECT 1; SELECT 'unclosed", 3), 'SELECT 1;', '后续尚未写完的语句不阻止执行当前完整语句');
});

test('启用库初始空、显式空不回退，当前库只能来自启用且仍可访问的库', () => {
  const available = ['orders', 'billing', 'not_enabled'];
  assert.deepEqual(databasePreferenceView(null, available), { enabledDatabases: [], currentDatabase: null });
  assert.deepEqual(databasePreferenceView({ enabledDatabases: [], currentDatabase: null, revision: 'first' }, available), { enabledDatabases: [], currentDatabase: null });
  const preferences = { enabledDatabases: ['orders', 'billing'], currentDatabase: 'billing', revision: 'saved' };
  assert.deepEqual(databasePreferenceView(preferences, available), { enabledDatabases: ['orders', 'billing'], currentDatabase: 'billing' });
  assert.deepEqual(databasePreferenceView(preferences, ['orders']), { enabledDatabases: ['orders'], currentDatabase: null });
  assert.deepEqual(databasePreferenceView({ ...preferences, enabledDatabases: ['orders'] }, available), { enabledDatabases: ['orders'], currentDatabase: null });
  assert.deepEqual(preferences.enabledDatabases, ['orders', 'billing'], '展示计算不改写持久偏好或权限');
});
