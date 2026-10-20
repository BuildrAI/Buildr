import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { EditorState } from '@codemirror/state';
import { sql, MySQL } from '@codemirror/lang-sql';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL?.includes('/features/mysql-query/')) {
    const url = new URL(specifier + '.ts', context.parentURL); if (existsSync(url)) return { url: url.href, shortCircuit: true };
  }
  return next(specifier, context);
} });
const { sqlCompletionContext, quoteIdentifier } = await import('../src/features/mysql-query/editor/sql-context.ts');
const { sqlShortcutActions } = await import('../src/features/mysql-query/editor/shortcut-actions.ts');
const { DatabaseCatalog } = await import('../src/features/mysql-query/editor/database-catalog.ts');
const { createMySqlQueryClient } = await import('../src/features/mysql-query/api/mysql-query-api.ts');
function context(marked) {
  marked = marked.replaceAll('\r\n', '\n');
  const pos = marked.indexOf('|'), doc = marked.replace('|', '');
  const state = EditorState.create({ doc, selection: { anchor: pos }, extensions: [sql({ dialect: MySQL })] });
  return { doc, value: sqlCompletionContext(state) };
}

test('快捷操作只在当前语句起始识别，保留现有分号并允许后续扩展', () => {
  for (const text of ['sel|', 'SELECT 1;\n-- 说明\n sel|;', '/*说明*/ sel|;']) {
    const { value } = context(text); assert.equal(value.kind, 'shortcut'); assert.equal(value.query, 'sel');
    const plan = sqlShortcutActions[0].createPlan(value); assert.equal(plan.cursor, 14);
    assert.equal(plan.insert.endsWith(';'), !value.terminated);
  }
  for (const text of ["SELECT 'sel|';", 'SELECT "sel|";', 'SELECT 1 -- sel|', '/*sel|*/', 'SELECT * FROM users AS sel|;', 'SELECT * FROM users sel|;', 'se|lect']) assert.equal(context(text).value, null, text);
});

test('语法上下文处理嵌套、多语句、JOIN、注释、空白和带引号的限定库名', () => {
  for (const marked of ['SELECT * FROM |;', 'SELECT * FROM   |', 'SELECT * FROM db.|', 'SELECT * FROM `db`.`us``er|s` u;', 'SELECT * FROM\n |', 'SELECT * FROM users u JOIN /* 注释 */ |;', 'SELECT * FROM (SELECT * FROM |) x;', 'SELECT 1; SELECT * FROM |;', 'SELECT * FROM users u, |;']) assert.equal(context(marked).value.kind, 'relation', marked);
  const { value } = context('SELECT * FROM `db``-名`.us|ers u;');
  assert.equal(value.database, 'db`-名');assert.equal(value.query, 'us');
  const quoted = context('SELECT * FROM `db`.`us|ers` u;');
  assert.equal(quoted.doc.slice(quoted.value.from,quoted.value.to),'`users`');
  for (const marked of ['SELECT * FROM users WHERE text = \'FROM us|\';', 'SELECT * FROM users -- JOIN |', 'SELECT * FROM /* JOIN | */ users;', 'SELECT EXTRACT(YEAR FROM |);', 'SELECT * FROM users u WHERE u.|', 'SELECT * FROM users AS |;']) assert.equal(context(marked).value,null,marked);
  assert.equal(quoteIdentifier('a`b'),'`a``b`');
});

test('无分号完整查询后的空行支持新快捷操作，不把内部位置或别名当作起始', () => {
  const previous = 'SELECT 0\n\nWITH RECURSIVE a(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM a WHERE n < 3), b AS (SELECT n FROM a)\nSELECT n FROM b UNION SELECT 9';
  for (const text of [`${previous}\n\nsel|\n\nSELECT 3;`, 'SELECT * FROM users\n\n  sel|', 'SELECT 1\r\n\r\nsel|;', `${previous}\n\nnext_action|`]) {
    const { value, doc } = context(text);
    assert.equal(value?.kind, 'shortcut', text);
    assert.equal(doc.slice(value.from, value.to), value.query);
  }
  for (const text of ['SELECT 1\nsel|', 'SELECT * FROM users AS\n\nsel|', 'SELECT (\n\nsel|)', 'WITH a AS (SELECT 1)\n\nsel|', "SELECT 'value\n\nsel|", 'SELECT 1 /*\n\nsel|', 'SELECT * FROM users\n\nsel| + 1', 'SELECT * FROM users\n\n`sel|`']) assert.equal(context(text).value, null, text);
});

const deferred = () => { let resolve, reject;const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; };
const settle = () => new Promise(resolve=>setImmediate(resolve));
test('目录复用请求、拒绝错目标，刷新取消旧请求并且迟到响应不污染新目录', async () => {
  const calls=[];const client={ tables(id,database,signal){const item=deferred();calls.push({id,database,signal,...item});return item.promise;} };
  const catalog=new DatabaseCatalog(client,'a');let notices=0;catalog.subscribe(()=>notices++);
  assert.equal(catalog.read('x').status,'loading');catalog.read('x');await settle();assert.equal(calls.length,1);
  catalog.invalidate();assert.equal(calls[0].signal.aborted,true);
  catalog.read('x');await settle();assert.equal(calls.length,2);
  calls[0].resolve({connectionId:'a',database:'x',tables:[{name:'stale',type:'BASE TABLE'}]});await settle();assert.equal(catalog.read('x').status,'loading');
  calls[1].resolve({connectionId:'a',database:'x',tables:[{name:'current',type:'BASE TABLE'}]});await settle();assert.equal(catalog.read('x').tables[0].name,'current');assert.equal(notices,2);
  catalog.read('y');await settle();calls[2].resolve({connectionId:'other',database:'y',tables:[]});await settle();assert.equal(catalog.read('y').status,'error');
  catalog.dispose();
});
test('目录失败可重试，释放后不通知订阅者', async () => {
  const calls=[];const catalog=new DatabaseCatalog({tables(){const item=deferred();calls.push(item);return item.promise;}},'a');
  let notified=0;catalog.subscribe(()=>notified++);catalog.read('x');await settle();calls[0].reject(Error('permission denied'));await settle();assert.match(catalog.read('x').error,/permission denied/);
  catalog.retry('x');await settle();assert.equal(calls.length,2);catalog.dispose();const before=notified;calls[1].resolve({connectionId:'a',database:'x',tables:[]});await settle();assert.equal(notified,before);
});
test('真实客户端表列表使用固定的已观察版本与编码后的数据库，传递取消信号', async () => {
  const calls=[];const client=createMySqlQueryClient((url,init)=>{calls.push({url,init});return Promise.resolve({});},'workspace',[{id:'qa',revision:'old/version'}]);
  const controller=new AbortController();await client.tables('qa','db `中',controller.signal);
  assert.equal(calls[0].url,'/api/v1/workspaces/workspace/mysql-query/connections/qa/tables?revision=old%2Fversion&database=db%20%60%E4%B8%AD');assert.equal(calls[0].init.signal,controller.signal);
});
