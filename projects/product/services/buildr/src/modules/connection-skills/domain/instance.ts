import type { ConnectionBinding } from './definition.ts';

export type Values = Record<string, unknown>;
export type ConnectionScope = { rootPath: string; workspaceId: string };
export type AuthenticationGroup = { targetBinding: string; values: Values };
export type ConnectionInstance = {
  schemaVersion: 'buildr.connection-instance/v1'; id: string; name: string; environment: string;
  enabled: boolean; category: string; binding: ConnectionBinding; config: Values;
  authentication: AuthenticationGroup | null;
};
export type Expected = { teamRevision: string; definitionRevision: string; localRevision?: string };
export function failure(code: string, message: string, status = 409): Error & { code: string; status: number; statusCode: number } {
  return Object.assign(new Error(message), { code, status, statusCode: status });
}
export function object(value: unknown): Values {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('connection_skill_input_invalid', '输入必须是对象。', 400);
  return value as Values;
}
export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) throw failure('connection_skill_id_invalid', '连接编号无效。', 400);
  return value;
}
export function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw failure('connection_skill_input_invalid', '名称或标识缺失或过长。', 400);
  return value.trim();
}
export function assertRevision(actual: string, expected: unknown): void {
  if (actual === 'unavailable' || actual === 'unreadable' || expected === 'unavailable' || expected === 'unreadable') throw failure('connection_skill_observation_unavailable', '当前版本无法可靠观察；请恢复本机观察能力后重新读取，未执行或覆盖内容。');
  if (actual !== expected) throw failure('connection_skill_revision_conflict', '当前内容已变化，请重新读取；未覆盖已保存内容。');
}
export function diagnostic(error: unknown): string {
  // Parser and filesystem errors can contain source text, including shared credentials.
  return error instanceof Error && 'code' in error && String(error.code).startsWith('connection_') ? error.message : '连接资料不可读取或格式无效；已保留原文件。';
}
