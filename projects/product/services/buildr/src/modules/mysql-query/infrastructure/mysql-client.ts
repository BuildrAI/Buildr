import { mysqlFailure, databaseName, mysqlConfiguration, passwordInput, type MySqlAccess, type MySqlConfiguration, type MySqlCredentials, type MySqlClient } from '../domain/mysql.ts';
import type { Connection as MySqlConnection, FieldPacket } from 'mysql2';

export const MYSQL_QUERY_TIMEOUT_MS = 10_000;
export const MYSQL_RESULT_BYTES = 4 * 1024 * 1024;
const SAFE_FUNCTIONS = new Set(`ABS ACOS ASIN ATAN ATAN2 CEIL CEILING COS COT DEGREES EXP FLOOR LN LOG LOG10 LOG2 MOD PI POW POWER RADIANS ROUND SIGN SIN SQRT TAN TRUNCATE
ASCII BIN BIT_LENGTH CHAR CHAR_LENGTH CHARACTER_LENGTH CONCAT CONCAT_WS ELT EXPORT_SET FIELD FIND_IN_SET FORMAT FROM_BASE64 HEX INSERT INSTR LCASE LEFT LENGTH LOCATE LOWER LPAD LTRIM MAKE_SET MID OCT OCTET_LENGTH ORD POSITION QUOTE REGEXP_INSTR REGEXP_LIKE REGEXP_REPLACE REGEXP_SUBSTR REPEAT REPLACE REVERSE RIGHT RPAD RTRIM SPACE STRCMP SUBSTR SUBSTRING SUBSTRING_INDEX TO_BASE64 TRIM UCASE UNHEX UPPER
ADDDATE ADDTIME CONVERT_TZ CURDATE CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP CURTIME DATE DATEDIFF DATE_ADD DATE_FORMAT DATE_SUB DAY DAYNAME DAYOFMONTH DAYOFWEEK DAYOFYEAR EXTRACT FROM_DAYS FROM_UNIXTIME GET_FORMAT HOUR LAST_DAY LOCALTIME LOCALTIMESTAMP MAKEDATE MAKETIME MICROSECOND MINUTE MONTH MONTHNAME NOW PERIOD_ADD PERIOD_DIFF QUARTER SEC_TO_TIME SECOND STR_TO_DATE SUBDATE SUBTIME SYSDATE TIME TIMEDIFF TIMESTAMP TIMESTAMPADD TIMESTAMPDIFF TIME_FORMAT TIME_TO_SEC TO_DAYS TO_SECONDS UNIX_TIMESTAMP UTC_DATE UTC_TIME UTC_TIMESTAMP WEEK WEEKDAY WEEKOFYEAR YEAR YEARWEEK
COALESCE GREATEST IF IFNULL ISNULL LEAST NULLIF CAST CONVERT BINARY COLLATION CHARSET
JSON_ARRAY JSON_ARRAYAGG JSON_ARRAY_APPEND JSON_ARRAY_INSERT JSON_CONTAINS JSON_CONTAINS_PATH JSON_DEPTH JSON_EXTRACT JSON_INSERT JSON_KEYS JSON_LENGTH JSON_MERGE_PATCH JSON_MERGE_PRESERVE JSON_OBJECT JSON_OBJECTAGG JSON_OVERLAPS JSON_PRETTY JSON_QUOTE JSON_REMOVE JSON_REPLACE JSON_SEARCH JSON_SET JSON_STORAGE_SIZE JSON_TYPE JSON_UNQUOTE JSON_VALID JSON_VALUE
COUNT SUM AVG MIN MAX GROUP_CONCAT BIT_AND BIT_OR BIT_XOR STD STDDEV STDDEV_POP STDDEV_SAMP VAR_POP VAR_SAMP VARIANCE
ROW_NUMBER RANK DENSE_RANK CUME_DIST PERCENT_RANK NTILE LAG LEAD FIRST_VALUE LAST_VALUE NTH_VALUE
DATABASE SCHEMA VERSION CURRENT_USER SESSION_USER SYSTEM_USER USER CONNECTION_ID MD5 SHA SHA1 SHA2 CRC32 UUID_TO_BIN BIN_TO_UUID INET_ATON INET_NTOA INET6_ATON INET6_NTOA IS_IPV4 IS_IPV6 IS_IPV4_COMPAT IS_IPV4_MAPPED`.split(/\s+/));

type Ast = Record<string, any>;
let parserPromise: Promise<any> | undefined;
async function sqlParser() {
  parserPromise ||= import('node-sql-parser').then(module => new (module.Parser || module.default.Parser)());
  return parserPromise;
}
function checkNumericPrecision(sql: string): void {
  // node-sql-parser preserves large integers, but rounds high-precision decimal
  // literals. Reject those before parsing instead of silently changing a filter.
  for (let index = 0; index < sql.length;) {
    const char = sql[index];
    if (["'", '"', '`'].includes(char)) {
      const quote = char; index++;
      while (index < sql.length) {
        if (sql[index] === '\\') { index += 2; continue; }
        if (sql[index] === quote) { if (sql[index + 1] === quote) { index += 2; continue; } index++; break; }
        index++;
      }
      continue;
    }
    if (sql.startsWith('/*', index)) { const end = sql.indexOf('*/', index + 2); index = end < 0 ? sql.length : end + 2; continue; }
    if (char === '#' || sql.startsWith('--', index) && /\s/.test(sql[index + 2] || ' ')) { const end = sql.indexOf('\n', index); index = end < 0 ? sql.length : end + 1; continue; }
    if (/[0-9.]/.test(char) && !/[\w$]/.test(sql[index - 1] || '')) {
      const token = sql.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)?.[0];
      if (token) {
        if (/[.eE]/.test(token)) {
          const significant = token.split(/[eE]/)[0].replace('.', '').replace(/^0+/, '');
          if (significant.length > 15 || !Number.isFinite(Number(token))) throw mysqlFailure('mysql_query_precision_unsupported', '高精度小数字面量无法安全重生成，请使用带引号的值和 CAST 明确保留精度。');
        }
        index += token.length; continue;
      }
    }
    index++;
  }
}
/** Parse and regenerate only allowed syntax; never execute the submitted text. */
export async function prepareReadOnlySql(input: unknown): Promise<{ submittedSql: string; executedSql: string; rowLimit: number }> {
  if (typeof input !== 'string' || !input.trim() || Buffer.byteLength(input) > 64 * 1024 || input.includes('\0')) throw mysqlFailure('mysql_query_invalid', '请填写不超过 64 KiB 的单条查询语句（SQL）。');
  if (input.includes('/*!')) throw mysqlFailure('mysql_query_invalid', '首版不支持 MySQL 可执行版本注释，请改为明确的查询语法。');
  checkNumericPrecision(input);
  const parser = await sqlParser(); let ast: Ast;
  try {
    const parsed = parser.astify(input, { database: 'MySQL' });
    if (Array.isArray(parsed) && parsed.length !== 1) throw new Error('multiple statements');
    ast = Array.isArray(parsed) ? parsed[0] : parsed;
  } catch { throw mysqlFailure('mysql_query_invalid', '无法解析为单条受支持的 MySQL 查询；请保留输入并调整语句。'); }
  if (ast?.type !== 'select') throw mysqlFailure('mysql_query_readonly', '当前仅允许单条只读 SELECT 查询。');
  let nodes = 0;
  function check(value: unknown, depth = 0): void {
    if (++nodes > 20_000 || depth > 100) throw mysqlFailure('mysql_query_invalid', '查询语句过于复杂。');
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(item => check(item, depth + 1)); return; }
    const node = value as Ast;
    if (node.into?.position || node.locking_read || node.type === 'assign' || node.type === 'var' || ['insert', 'update', 'delete', 'replace', 'call', 'set', 'create', 'drop', 'alter'].includes(node.type)) throw mysqlFailure('mysql_query_readonly', '查询不允许文件操作、锁、赋值或数据修改。');
    if (node.type === 'function' || node.type === 'aggr_func') {
      const name = typeof node.name === 'string' ? node.name : node.name?.name?.map((item: Ast) => item.value).join('');
      const quoted = node.type === 'function' && (!Array.isArray(node.name?.name) || node.name.name.length !== 1 || node.name.name[0].type !== 'default');
      if (quoted || node.name?.schema || typeof name !== 'string' || !SAFE_FUNCTIONS.has(name.toUpperCase())) throw mysqlFailure('mysql_query_function_unsupported', '该函数不在首版支持的只读内置函数范围内。');
    }
    for (const child of Object.values(node)) check(child, depth + 1);
  }
  check(ast);
  let outer = ast;
  // The parser represents a UNION's outer LIMIT on the final branch.
  while (outer._next) {
    if (outer.parentheses_symbol) throw mysqlFailure('mysql_query_invalid', '请将带括号分支的 UNION 改为明确的最外层查询。');
    outer = outer._next;
  }
  if (outer.parentheses_symbol && ast._next) throw mysqlFailure('mysql_query_invalid', '请将带括号分支的 UNION 改为明确的最外层查询。');
  let rowLimit = 100;
  if (outer.limit) {
    const values = outer.limit.value;
    if (!Array.isArray(values) || values.length < 1 || values.length > 2 || values.some((item: Ast) => item.type !== 'number' || !Number.isSafeInteger(item.value) || item.value < 0)) throw mysqlFailure('mysql_query_limit_invalid', 'LIMIT 和 OFFSET 必须为明确的非负整数。');
    rowLimit = values[outer.limit.seperator === ',' && values.length === 2 ? 1 : 0].value;
    if (rowLimit < 1 || rowLimit > 500) throw mysqlFailure('mysql_query_limit_invalid', '每次查询 LIMIT 必须为 1—500；未填写时默认 100 行。');
  } else outer.limit = { seperator: '', value: [{ type: 'number', value: 100 }] };
  try { return { submittedSql: input, executedSql: parser.sqlify(ast, { database: 'MySQL' }), rowLimit }; }
  catch { throw mysqlFailure('mysql_query_invalid', '查询语句无法安全生成；请调整后重试。'); }
}

function mysqlError(error: unknown): Error {
  if ((error as { code?: string })?.code?.startsWith('mysql_')) return error as Error;
  const code = (error as { code?: string })?.code;
  if (['ETIMEDOUT', 'PROTOCOL_SEQUENCE_TIMEOUT', 'ER_QUERY_TIMEOUT', 'ER_QUERY_INTERRUPTED'].includes(code || '')) return mysqlFailure('mysql_query_timeout', 'MySQL 调用超过 10 秒，已关闭本次连接。', 504);
  if (['ER_ACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR', 'ER_TABLEACCESS_DENIED_ERROR', 'ER_COLUMNACCESS_DENIED_ERROR', 'ER_SPECIFIC_ACCESS_DENIED_ERROR'].includes(code || '')) return mysqlFailure('mysql_access_denied', 'MySQL 认证或账号权限不足，请检查本机认证与数据库权限。', 403);
  if (['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST'].includes(code || '')) return mysqlFailure('mysql_unreachable', '无法连接 MySQL，请检查地址、端口和网络。', 502);
  if (code === 'ER_BAD_DB_ERROR') return mysqlFailure('mysql_database_missing', '指定数据库不存在或不可访问。');
  if (code === 'ER_NO_DB_ERROR') return mysqlFailure('mysql_database_required', '请选择当前数据库，或使用 database.table 指定数据库。');
  if (code === 'ER_NO_SUCH_TABLE') return mysqlFailure('mysql_table_missing', '查询引用的表不存在或不可访问。');
  if (code === 'ER_BAD_FIELD_ERROR') return mysqlFailure('mysql_column_missing', '查询引用的字段不存在。');
  if (code === 'ER_PARSE_ERROR') return mysqlFailure('mysql_syntax_error', 'MySQL 拒绝该查询语法，请检查语句和服务器版本。');
  return mysqlFailure('mysql_query_failed', 'MySQL 调用失败，请检查语句、连接与账号权限。', 502);
}
function jsonCell(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return '0x' + value.toString('hex');
  if (typeof value === 'bigint') return value.toString();
  if (value === undefined) return null;
  return value;
}
class MySqlExecutor {
  async execute(access: MySqlAccess, sql: string, parameters: unknown[] = [], database: string | null = access.defaultDatabase, maxRows = 10_000): Promise<{ columns: { name: string; type: string }[]; rows: unknown[][]; elapsedMs: number }> {
    const mysql = (await import('mysql2')).default;
    const typeNames = new Map(Object.entries(mysql.Types).filter((entry): entry is [string, number] => typeof entry[1] === 'number').map(([name, value]) => [value, name]));
    const startedAt = Date.now();
    let connection: MySqlConnection | null = null;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      connection = mysql.createConnection({ host: access.host, port: access.port, user: access.username, password: access.password, ...(database ? { database } : {}), connectTimeout: MYSQL_QUERY_TIMEOUT_MS, multipleStatements: false, rowsAsArray: true, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, decimalNumbers: false, flags: ['-LOCAL_FILES'], enableKeepAlive: false });
      const current = connection;
      // A separate connection for each call prevents cancelled or mutated sessions from being reused.
      const work = async () => {
        await current.promise().connect();
        // The parser uses ordinary MySQL string quoting. Align this fresh session only;
        // otherwise NO_BACKSLASH_ESCAPES can turn a parsed literal into executable syntax.
        const [modeRows] = await current.promise().query('SELECT @@SESSION.sql_mode');
        const currentMode = String((modeRows as unknown[][])[0]?.[0] || '');
        const mode = currentMode.split(',').filter(flag => !['NO_BACKSLASH_ESCAPES', 'ANSI_QUOTES', 'PIPES_AS_CONCAT'].includes(flag.toUpperCase())).join(',');
        await current.promise().query('SET SESSION sql_mode = ?', [mode]);
        await current.promise().query('SET SESSION MAX_EXECUTION_TIME = 10000');
        await current.promise().query('START TRANSACTION READ ONLY');
        const result = await new Promise<{ columns: { name: string; type: string }[]; rows: unknown[][] }>((resolve, reject) => {
          const rows: unknown[][] = []; let columns: { name: string; type: string }[] = [], bytes = 0, ended = false;
          const fail = (error: Error) => { if (ended) return; ended = true; reject(error); current.destroy(); };
          const command = current.query({ sql, values: parameters, timeout: MYSQL_QUERY_TIMEOUT_MS });
          command.on('fields', (fields: FieldPacket[]) => {
            columns = fields.map(field => ({ name: field.name, type: String(field.columnType === undefined ? 'UNKNOWN' : typeNames.get(field.columnType) ?? field.columnType) }));
            bytes += Buffer.byteLength(JSON.stringify(columns));
            if (bytes > MYSQL_RESULT_BYTES) fail(mysqlFailure('mysql_result_too_large', '查询结果超过 4 MiB，请缩小字段或查询范围。', 413));
          });
          command.on('result', row => {
            if (ended) return;
            if (!Array.isArray(row)) { fail(mysqlFailure('mysql_query_readonly', '该调用没有返回只读结果集。')); return; }
            if (rows.length >= maxRows) { fail(mysqlFailure('mysql_query_limit_exceeded', '数据库返回行数超过本次查询限制，已停止并拒绝该结果。', 413)); return; }
            const normalized = row.map(jsonCell);
            bytes += Buffer.byteLength(JSON.stringify(normalized)) + 1;
            if (bytes > MYSQL_RESULT_BYTES) { fail(mysqlFailure('mysql_result_too_large', '查询结果超过 4 MiB，请缩小字段或查询范围。', 413)); return; }
            rows.push(normalized);
          });
          command.on('error', error => fail(mysqlError(error)));
          command.on('end', () => { if (!ended) { ended = true; resolve({ columns, rows }); } });
        });
        await current.promise().query('ROLLBACK');
        return { ...result, elapsedMs: Date.now() - startedAt };
      };
      return await Promise.race([work(), new Promise<never>((_resolve, reject) => { deadline = setTimeout(() => { current.destroy(); reject(mysqlFailure('mysql_query_timeout', 'MySQL 调用超过 10 秒，已关闭本次连接。', 504)); }, MYSQL_QUERY_TIMEOUT_MS); })]);
    } catch (error) { throw mysqlError(error); }
    finally { if (deadline) clearTimeout(deadline); connection?.destroy(); }
  }
}

export function createMySqlClient(): MySqlClient {
  const executor = new MySqlExecutor();
  const access = (config: MySqlConfiguration, credentials: MySqlCredentials): MySqlAccess => {
    if (!Object.hasOwn(credentials, 'password')) throw mysqlFailure('connection_credentials_missing', '该 MySQL 连接尚未在本机配置认证信息。', 409);
    return { ...mysqlConfiguration(config), password: passwordInput(credentials.password) };
  };
  return {
    async test(config, credentials) { const result = await executor.execute(access(config, credentials), 'SELECT VERSION() AS version LIMIT 1'); return { ok: true, serverVersion: String(result.rows[0]?.[0] || ''), elapsedMs: result.elapsedMs }; },
    async databases(config, credentials) { const result = await executor.execute(access(config, credentials), 'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME LIMIT 1001', [], null); if (result.rows.length > 1000) throw mysqlFailure('mysql_metadata_too_large', '可访问数据库超过 1000 个，首版无法完整展示。', 413); return result.rows.map(row => String(row[0])); },
    async tables(config, credentials, database) { const result = await executor.execute(access(config, credentials), 'SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME LIMIT 1001', [databaseName(database)], null); if (result.rows.length > 1000) throw mysqlFailure('mysql_metadata_too_large', '数据库超过 1000 张表，首版无法完整展示。', 413); return result.rows.map(row => ({ name: String(row[0]), type: String(row[1]) })); },
    async columns(config, credentials, database, table) { const result = await executor.execute(access(config, credentials), 'SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION', [databaseName(database), databaseName(table)], null); return result.rows.map(row => ({ name: String(row[0]), type: String(row[1]), nullable: row[2] === 'YES', key: String(row[3]), comment: String(row[4]) })); },
    async query(config, credentials, input) { const prepared = await prepareReadOnlySql(input.sql); const database = input.database === undefined ? mysqlConfiguration(config).defaultDatabase : input.database === null || input.database === '' ? null : databaseName(input.database); const result = await executor.execute(access(config, credentials), prepared.executedSql, [], database, prepared.rowLimit); const output = { ...prepared, ...result, database, rowCount: result.rows.length, limitReached: result.rows.length === prepared.rowLimit }; if (Buffer.byteLength(JSON.stringify(output)) > MYSQL_RESULT_BYTES - 256) throw mysqlFailure('mysql_result_too_large', '查询结果超过 4 MiB，请缩小字段或查询范围。', 413); return output; },
  };
}
