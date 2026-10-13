export type ConnectionEnvironment = string;
export type ConnectionCategory = 'data-source' | 'logs' | 'configuration' | 'scheduling';
export type ConnectionType = 'mysql' | 'sqlite' | 'redis' | 'kibana' | 'nacos' | 'xxl-job';
export const normalizeEnvironment = (value: string) => value.trim();
export const environmentTagClass = (value: string) => `connections-env-tag${['local', 'qa', 'prod'].includes(value) ? ` env-${value}` : ''}`;
export const connectionCategories = [{ value: 'data-source', label: '数据源' }, { value: 'logs', label: '日志' }, { value: 'configuration', label: '配置' }, { value: 'scheduling', label: '调度' }];
export const futureConnectionTypes = [
  { category: '数据源', type: 'SQLite', action: '结构读取与数据查询' }, { category: '数据源', type: 'Redis', action: '键与值查询' },
  { category: '日志', type: 'Kibana', action: '日志检索' }, { category: '配置', type: 'Nacos', action: '配置读取与比较' },
  { category: '调度', type: 'XXL-JOB', action: '查看任务与运行记录' },
];
export type Connection = {
  id: string; name: string; category: ConnectionCategory; type: ConnectionType; environment: ConnectionEnvironment; host: string; port: number; revision: number; databases: string[];
  username?: string; password?: string; defaultDatabase?: string; visibleDatabases?: string[];
};
export type Target = { connectionId: string; environment: ConnectionEnvironment; endpoint: string; revision: number; database: string; defaultDatabase?: string };
export type DataRow = Record<string, string | number | null>;
export type Actor = 'agent' | 'human';
export type ExecutionStatus = 'success' | 'timeout' | 'cancelled' | 'rejected';
export type ExecutionPlan = { database: string; actualSql: string; columns: string[]; whereColumn?: string; whereValue?: string; limit: number; offset: number; defaultApplied: boolean; ordered: boolean; orderBy: string[]; stableOrder: boolean; };
export type QueryResult = {
  id: string; sql: string; actualSql: string; sqlVersion: number; target: Target; at: string; rows: DataRow[]; identityRef: string;
  fetchedRows: number; limit: number; offset: number; defaultApplied: boolean; stableOrder: boolean; actor: Actor; status: ExecutionStatus; error?: string;
};
export type Query = { id: string; target: Target; sql: string; sqlVersion: number; databases: string[] };
export const DEFAULT_QUERY_LIMIT = 100;
export const MAX_QUERY_LIMIT = 500;
export const initialConnections: Connection[] = (['qa', 'prod'] as const).map(environment => ({
  id: `commerce-mysql-${environment}`, name: '交易 MySQL', category: 'data-source', type: 'mysql', environment,
  host: 'demo.shared.example.invalid', port: 3306, revision: 1,
  databases: [`orders_${environment}`, `billing_${environment}`, `reporting_${environment}`],
  visibleDatabases: [`orders_${environment}`, `billing_${environment}`], defaultDatabase: `orders_${environment}`,
  username: `demo_${environment}_reader`, password: '',
}));
export const timestamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
export const connectionEndpoint = (connection: Connection) => `${connection.host}:${connection.port}`;
export function editConnection(previous: Connection, next: Connection): Connection {
  const addressChanged = previous.host !== next.host || previous.port !== next.port;
  const targetChanged = addressChanged || previous.environment !== next.environment || previous.defaultDatabase !== next.defaultDatabase || previous.username !== next.username || [...previous.databases].sort().join('\0') !== [...next.databases].sort().join('\0');
  return { ...next, id: previous.id, revision: previous.revision + (targetChanged ? 1 : 0) };
}
export function targetFor(connection: Connection, database: string): Target {
  return { connectionId: connection.id, environment: connection.environment, endpoint: connectionEndpoint(connection), revision: connection.revision, database, defaultDatabase: database };
}
export function isBilling(database: string) { return database.startsWith('billing_'); }
export function schemaFor(database: string) {
  const billing = isBilling(database), reporting = database.startsWith('reporting_');
  const columns = [billing ? 'invoice_id' : reporting ? 'report_id' : 'order_id', reporting ? 'report_status' : 'payment_status', billing ? 'reconcile_status' : reporting ? 'generation_status' : 'fulfillment_status', 'block_reason', 'updated_at'];
  return { table: billing ? 'invoices' : reporting ? 'daily_metrics' : 'orders', columns };
}
export function prepareSQL(target: Target, goal: string) {
  const schema = schemaFor(target.database), id = schema.columns[0];
  const specified = goal.match(isBilling(target.database) ? /B-\d+/i : target.database.startsWith('reporting_') ? /R-\d+/i : /O-\d+/i)?.[0].toUpperCase();
  return `SELECT ${schema.columns.join(', ')}\nFROM ${target.database}.${schema.table}${specified ? `\nWHERE ${id} = '${specified}'` : ''}\nORDER BY updated_at DESC, ${id} DESC\nLIMIT 100;`;
}
export function newQuery(id: string, connection: Connection, database = connection.defaultDatabase || ''): Query {
  const target = targetFor(connection, database), sampleDatabase = database || connection.databases[0];
  return { id, target, databases: [...connection.databases], sql: sampleDatabase ? prepareSQL({ ...target, database: sampleDatabase }, '').replace(/\nLIMIT 100;/, ';') : '', sqlVersion: 1 };
}
export const sqlUsesExplicitDatabase = (sql: string) => /\bFROM\s+\w+\.\w+/i.test(sql);
/** Closed demonstration grammar only; a real integration must use a database-aware readonly executor. */
export function planExecution(sql: string, target: Target, pageOffset?: number, accessibleDatabases: readonly string[] = [target.database]): ExecutionPlan {
  const statement = sql.trim().replace(/;$/, '').trim();
  if (statement.includes(';')) throw Error('仅允许一条只读 SELECT 语句；本次未执行。');
  const pattern = /^SELECT\s+([\w*,\s]+)\s+FROM\s+(?:(\w+)\.)?(\w+)(?:\s+WHERE\s+(\w+)\s*=\s*'([\w-]+)')?(?:\s+ORDER\s+BY\s+([\w\s,]+?))?(?:\s+LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?)?$/i;
  const parsed = statement.match(pattern);
  if (!parsed) throw Error('演示仅支持单表只读 SELECT、字段等值筛选、ORDER BY、LIMIT / OFFSET，不支持联合查询、子查询、函数或修改语句；本次未执行。');
  const database = parsed[2] || target.defaultDatabase || target.database;
  if (!database) throw Error('未限定表名需要选择当前数据库，或使用 database.table；本次未执行。');
  if (!accessibleDatabases.includes(database)) throw Error('该数据库不在当前连接的示例可访问库中；不能跨连接或访问未知库，本次未执行。');
  const schema = schemaFor(database);
  if (parsed[3] !== schema.table) throw Error('该库没有这张示例表；本次未执行。');
  const columns = parsed[1].trim() === '*' ? schema.columns : parsed[1].split(',').map(value => value.trim());
  if (columns.some(column => !schema.columns.includes(column)) || (parsed[4] && !schema.columns.includes(parsed[4]))) throw Error('语句引用了演示结构中不存在的字段；本次未执行。');
  const limit = parsed[7] === undefined ? DEFAULT_QUERY_LIMIT : Number(parsed[7]);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_QUERY_LIMIT) throw Error('每次查询最多 500 行，LIMIT 须为 1–500；请明确调整 SQL，本次未执行，也没有静默改写上限。');
  const offset = pageOffset ?? (parsed[8] === undefined ? 0 : Number(parsed[8]));
  if (!Number.isSafeInteger(offset) || offset < 0) throw Error('分页偏移量必须为非负整数；本次未执行。');
  const order = (parsed[6] || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const id = schema.columns[0];
  const supportedOrder = ['', 'updated_at desc', `${id} desc`, `updated_at desc, ${id} desc`];
  if (!supportedOrder.includes(order)) throw Error(`演示排序仅支持 updated_at DESC、${id} DESC 或二者组合；本次未执行。`);
  const stableOrder = order.includes(`${id} desc`);
  if (offset > 0 && !stableOrder) throw Error(`继续分页需要显式稳定排序，例如 ORDER BY updated_at DESC, ${id} DESC；本次未执行。`);
  const base = statement.replace(/\s+LIMIT\s+\d+(?:\s+OFFSET\s+\d+)?$/i, '');
  return { database, actualSql: parsed[7] !== undefined && pageOffset === undefined ? sql.trim().replace(/;?$/, ';') : `${base}\nLIMIT ${limit}${offset ? ` OFFSET ${offset}` : ''};`, columns, whereColumn: parsed[4], whereValue: parsed[5], limit, offset, defaultApplied: parsed[7] === undefined, ordered: Boolean(order), orderBy: order ? order.split(',').map(term => term.trim().replace(/ desc$/, '')) : [], stableOrder };
}
export function executionRecord(query: Query, actor: Actor, identityRef: string, plan: ExecutionPlan | undefined, status: ExecutionStatus, error?: string): QueryResult {
  return { id: `demo-${crypto.randomUUID()}`, sql: query.sql, actualSql: plan?.actualSql || '', sqlVersion: query.sqlVersion, target: { ...query.target, defaultDatabase: query.target.defaultDatabase ?? query.target.database, database: plan?.database || query.target.database }, at: timestamp(), rows: [], identityRef,
    fetchedRows: 0, limit: plan?.limit || 0, offset: plan?.offset || 0, defaultApplied: plan?.defaultApplied || false, stableOrder: plan?.stableOrder || false, actor, status, error };
}
/** 600 fictional records; only the explicitly requested page is returned. No SQL engine or network. */
export function simulateResult(query: Query, actor: Actor = 'human', identityRef = '未提供演示用户名', pageOffset?: number): QueryResult {
  const plan = planExecution(query.sql, query.target, pageOffset, query.databases), schema = schemaFor(plan.database);
  const billing = isBilling(plan.database), reporting = plan.database.startsWith('reporting_'), id = schema.columns[0], status = schema.columns[2];
  let records: DataRow[] = Array.from({ length: 600 }, (_, index) => ({
    [id]: billing ? `B-${3008 - index}` : reporting ? `R-${6008 - index}` : `O-${1008 - index}`,
    [schema.columns[1]]: reporting ? 'READY' : 'PAID', [status]: index % 17 === (billing ? 6 : 0) ? 'PENDING' : 'COMPLETED',
    block_reason: index % 17 === (billing ? 6 : 0) ? billing ? '等待渠道对账' : '库存预占未完成' : null,
    updated_at: new Date(Date.UTC(2026, 9, 12, 14, 48) - index * 60000).toISOString().slice(0, 19).replace('T', ' '),
  }));
  if (plan.whereColumn) records = records.filter(row => String(row[plan.whereColumn!]) === plan.whereValue);
  if (plan.orderBy.length) records.sort((left, right) => {
    for (const column of plan.orderBy) {
      const a = String(left[column] ?? ''), b = String(right[column] ?? '');
      if (a !== b) return a > b ? -1 : 1;
    }
    return 0;
  });
  const rows = records.slice(plan.offset, plan.offset + plan.limit).map(row => Object.fromEntries(plan.columns.map(column => [column, row[column]])));
  return { ...executionRecord(query, actor, identityRef, plan, 'success'), rows, fetchedRows: rows.length };
}
