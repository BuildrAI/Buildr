import crypto from 'node:crypto';

export type ConnectionConfiguration = {
  name: string; category: string; type: string; environment: string; config: Record<string, unknown>;
};
export type MySqlConfiguration = { host: string; port: number; username: string; defaultDatabase: string | null; selectedDatabases: string[] };
export type ConnectionRecord = ConnectionConfiguration & { id: string; credentialId: string | null; createdAt: string; updatedAt: string };
export type PublicConnection = ConnectionConfiguration & { id: string; hasCredentials: boolean; revision: string; createdAt: string; updatedAt: string };
export type ConnectionScope = { rootPath: string; workspaceId: string };
export type MySqlAccess = MySqlConfiguration & { password: string };
export type QueryResult = {
  connectionId: string; database: string | null; submittedSql: string; executedSql: string;
  columns: { name: string; type: string }[]; rows: unknown[][]; rowCount: number; rowLimit: number; elapsedMs: number; limitReached: boolean;
};
export type ConnectionProvider = {
  category: string; type: string;
  validateConfig(value: unknown, previous?: Record<string, unknown>): Record<string, unknown>;
  validateCredentials(value: unknown): Record<string, unknown>;
  authenticationTargetIdentity(config: Record<string, unknown>): string;
  test(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<{ ok: true; serverVersion?: string; elapsedMs: number }>;
  mysql?: {
    databases(config: Record<string, unknown>, credentials: Record<string, unknown>): Promise<string[]>;
    tables(config: Record<string, unknown>, credentials: Record<string, unknown>, database: string): Promise<{ name: string; type: string }[]>;
    columns(config: Record<string, unknown>, credentials: Record<string, unknown>, database: string, table: string): Promise<{ name: string; type: string; nullable: boolean; key: string; comment: string }[]>;
    query(config: Record<string, unknown>, credentials: Record<string, unknown>, input: { sql: unknown; database?: unknown }): Promise<Omit<QueryResult, 'connectionId'>>;
  };
};
export function connectionFailure(code: string, message: string, status = 400): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code, status });
}
export function recordRevision(record: ConnectionRecord): string { return 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex'); }
export function connectionId(value: unknown): string {
  if (typeof value !== 'string' || !/^connection-[a-f0-9-]{36}$/.test(value)) throw connectionFailure('connection_id_invalid', '连接编号无效。');
  return value;
}
export function inputObject(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw connectionFailure('connection_input_invalid', '连接请求包含无效字段。');
  return value as Record<string, unknown>;
}
export const CONNECTION_FIELDS = ['name', 'category', 'type', 'environment', 'config'] as const;
function text(value: unknown, label: string, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/u.test(value) || !empty && !value.trim()) throw connectionFailure('connection_input_invalid', label + '无效。');
  return value.trim();
}
export function databaseName(value: unknown): string { return text(value, '数据库名称', 64); }
export function configuration(value: Record<string, unknown>, previous?: ConnectionConfiguration): ConnectionConfiguration {
  const current = { environment: '', ...previous, ...value };
  const category = text(current.category, '连接类别', 64), type = text(current.type, '连接类型', 64);
  if (![category, type].every(item => /^[a-z][a-z0-9-]*$/.test(item))) throw connectionFailure('connection_input_invalid', '连接类别或类型无效。');
  const config = inputObject(current.config, Object.keys((current.config || {}) as object));
  if (Buffer.byteLength(JSON.stringify(config)) > 32 * 1024) throw connectionFailure('connection_input_invalid', '连接配置过大。');
  return { name: text(current.name, '连接名称', 100), category, type, environment: text(current.environment, '环境', 80, true), config: structuredClone(config) };
}
export function mysqlConfiguration(value: unknown, previous?: MySqlConfiguration): MySqlConfiguration {
  const input = inputObject(value, ['host', 'port', 'username', 'defaultDatabase', 'selectedDatabases']);
  const current = { port: 3306, defaultDatabase: null, selectedDatabases: [], ...previous, ...input };
  const host = text(current.host, '主机地址', 253);
  if (/[\s/@?#\\]/u.test(host)) throw connectionFailure('connection_input_invalid', '请填写主机名或 IP 地址。');
  if (!Number.isSafeInteger(current.port) || Number(current.port) < 1 || Number(current.port) > 65535) throw connectionFailure('connection_input_invalid', '端口必须为 1—65535 的整数。');
  if (!Array.isArray(current.selectedDatabases) || current.selectedDatabases.length > 1000) throw connectionFailure('connection_input_invalid', '展示数据库选择无效。');
  return {
    host, port: Number(current.port), username: text(current.username, '用户名', 128),
    defaultDatabase: current.defaultDatabase === null || current.defaultDatabase === '' ? null : databaseName(current.defaultDatabase),
    selectedDatabases: [...new Set(current.selectedDatabases.map(databaseName))],
  };
}
export function passwordInput(value: unknown): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 4096 || value.includes('\0')) throw connectionFailure('connection_password_invalid', '密码输入无效。');
  return value;
}
export function expectedRevision(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256-[a-f0-9]{64}$/.test(value)) throw connectionFailure('connection_revision_required', '请刷新连接后再提交修改。', 409);
  return value;
}
