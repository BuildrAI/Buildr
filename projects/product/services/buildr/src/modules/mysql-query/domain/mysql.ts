export type MySqlConfiguration = { host: string; port: number; username: string; defaultDatabase: string | null };
export type MySqlCredentials = { password: string };
export type MySqlAccess = MySqlConfiguration & MySqlCredentials;
export type QueryPreferences = { enabledDatabases: string[]; currentDatabase: string | null; revision: string };
export type MySqlQueryResult = {
  database: string | null; submittedSql: string; executedSql: string;
  columns: { name: string; type: string }[]; rows: unknown[][]; rowCount: number; rowLimit: number; elapsedMs: number; limitReached: boolean;
};
/** MySQL operations shared by the connection program and the independent query tool. */
export interface MySqlClient {
  test(config: MySqlConfiguration, credentials: MySqlCredentials): Promise<{ ok: true; serverVersion?: string; elapsedMs: number }>;
  databases(config: MySqlConfiguration, credentials: MySqlCredentials): Promise<string[]>;
  tables(config: MySqlConfiguration, credentials: MySqlCredentials, database: string): Promise<{ name: string; type: string }[]>;
  columns(config: MySqlConfiguration, credentials: MySqlCredentials, database: string, table: string): Promise<{ name: string; type: string; nullable: boolean; key: string; comment: string }[]>;
  query(config: MySqlConfiguration, credentials: MySqlCredentials, input: { sql: unknown; database?: unknown }): Promise<MySqlQueryResult>;
}
export type MySqlQueryClient = Omit<MySqlClient, 'test'>;
export type MySqlChangeCategory = 'dml' | 'ddl';
export type MySqlChangeStatement = { category: MySqlChangeCategory; statement: string; database: string | null; table: string; destructive: boolean };
export type MySqlTableState = { database: string | null; table: string; exists: boolean; fingerprint: string };
export type MySqlChangeResult = {
  category: MySqlChangeCategory; statement: string; database: string | null; table: string;
  committed: true; rollbackable: boolean; affectedRows: number | null;
  fingerprintBefore: string; fingerprintAfter: string;
  readback: { exists: boolean; columns: number; indexes: number }; elapsedMs: number;
};
/** Controlled change operations. The independent query tool never receives these. */
export interface MySqlChangeClient {
  fingerprint(config: MySqlConfiguration, credentials: MySqlCredentials, input: { database?: unknown; table: unknown }): Promise<MySqlTableState>;
  applyChange(config: MySqlConfiguration, credentials: MySqlCredentials, input: { statement: unknown; expectedFingerprint: unknown; maxAffectedRows?: unknown }): Promise<MySqlChangeResult>;
}
export type MySqlConnectionClient = Pick<MySqlClient, 'test' | 'databases'> & MySqlChangeClient;

export function mysqlFailure(code: string, message: string, status = 400): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code, status });
}
export function inputObject(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw mysqlFailure('connection_input_invalid', '连接请求包含无效字段。');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/u.test(value) || !empty && !value.trim()) throw mysqlFailure('connection_input_invalid', label + '无效。');
  return value.trim();
}
export function databaseName(value: unknown): string { return text(value, '数据库名称', 64); }
export function mysqlConfiguration(value: unknown, previous?: MySqlConfiguration): MySqlConfiguration {
  const input = inputObject(value, ['host', 'port', 'username', 'defaultDatabase']);
  const current = { port: 3306, defaultDatabase: null, ...previous, ...input };
  const host = text(current.host, '主机地址', 253);
  if (/[\s/@?#\\]/u.test(host)) throw mysqlFailure('connection_input_invalid', '请填写主机名或 IP 地址。');
  if (!Number.isSafeInteger(current.port) || Number(current.port) < 1 || Number(current.port) > 65535) throw mysqlFailure('connection_input_invalid', '端口必须为 1—65535 的整数。');
  return {
    host, port: Number(current.port), username: text(current.username, '用户名', 128),
    defaultDatabase: current.defaultDatabase === null || current.defaultDatabase === '' ? null : databaseName(current.defaultDatabase),
  };
}
/** Build the connection target from stored instance config, ignoring keys the connection program owns. */
export function mysqlTarget(config: Record<string, unknown>, username: unknown): MySqlConfiguration {
  return mysqlConfiguration({ host: config.host, port: config.port, ...(config.defaultDatabase === undefined ? {} : { defaultDatabase: config.defaultDatabase }), username });
}
export function passwordInput(value: unknown): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 4096 || value.includes('\0')) throw mysqlFailure('connection_password_invalid', '密码输入无效。');
  return value;
}
export function expectedRevision(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(value)) throw mysqlFailure('connection_revision_required', '请刷新连接后再提交修改。', 409);
  return value;
}
export function tableFingerprintInput(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(value)) throw mysqlFailure('mysql_change_fingerprint_invalid', '请先读取目标表当前结构摘要，并原样提交该摘要。', 409);
  return value;
}
export function affectedRowLimit(value: unknown): number {
  const limit = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 10_000) throw mysqlFailure('mysql_change_limit_invalid', '受影响行数上限必须为 1—10000 的整数。');
  return Number(limit);
}
export function queryPreferenceValues(value: unknown): Omit<QueryPreferences, 'revision'> {
  const input = inputObject(value, ['enabledDatabases', 'currentDatabase']);
  if (!Array.isArray(input.enabledDatabases) || input.enabledDatabases.length > 1000 || input.currentDatabase !== null && typeof input.currentDatabase !== 'string') throw mysqlFailure('connection_query_preferences_invalid', '数据库选择无效。');
  const enabledDatabases = [...new Set(input.enabledDatabases.map(databaseName))];
  const currentDatabase = input.currentDatabase === null ? null : databaseName(input.currentDatabase);
  if (currentDatabase !== null && !enabledDatabases.includes(currentDatabase)) throw mysqlFailure('connection_query_preferences_invalid', '当前数据库必须在已启用的数据库中。');
  return { enabledDatabases, currentDatabase };
}
