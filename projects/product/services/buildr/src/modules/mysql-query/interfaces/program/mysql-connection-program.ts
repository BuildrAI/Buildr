import type { EventEmitter } from 'node:events';
import { connectionFailure, inputObject, mysqlConfiguration, passwordInput, type ConnectionProvider } from '../../../connections/domain/connection.ts';
import { createMySqlProvider } from '../../../connections/infrastructure/mysql-query.ts';

const VERSION = '1.0.0';
const DIAGNOSTICS: Record<string, string> = {
  mysql_command_unsupported: '不支持此命令或参数；程序仅提供 test 和 databases，请执行 --help。',
  mysql_context_required: '请通过已明确选定连接的 Buildr 启动入口执行。',
  mysql_context_timeout: '未收到本次私有连接上下文。',
  mysql_context_disconnected: '连接上下文通道已关闭。',
  mysql_context_invalid: 'MySQL 连接上下文的协议、目标或完整认证组无效。',
  mysql_query_timeout: 'MySQL 调用超过 10 秒，已关闭本次连接。',
  mysql_access_denied: 'MySQL 认证或账号权限不足，请检查所选完整认证组。',
  mysql_unreachable: '无法连接 MySQL，请检查地址、端口和网络。',
  mysql_database_missing: '指定数据库不存在或不可访问。',
  mysql_metadata_too_large: '可见数据库超过 1000 个，无法完整返回。',
  mysql_discovery_output_protected: '发现结果与认证值重叠，无法安全展示准确数据库身份；请核对所选账号与数据库范围。',
};
type Channel = Pick<EventEmitter, 'on' | 'off'> & { connected?: boolean; send?: unknown; disconnect?(): void };
export type MySqlProgramContext = { protocolVersion: 'buildr.connection-context/v1'; callId: string; definition?: { definitionId?: string }; connections: { primary: { id: string; config: Record<string, unknown>; authentication: { source: string; values: Record<string, unknown> } } } };
export function receiveMySqlContext(channel: Channel, timeoutMs = 10_000): { ready: Promise<MySqlProgramContext>; close(): void } {
  if (!channel.connected || typeof channel.send !== 'function') throw connectionFailure('mysql_context_required', '请通过已明确选定连接的 Buildr 启动入口执行。', 409);
  let receive: (message: unknown) => void = () => {}, disconnected: () => void = () => {}, timer: ReturnType<typeof setTimeout>;
  const ready = new Promise<MySqlProgramContext>((resolve, reject) => {
    timer = setTimeout(() => reject(connectionFailure('mysql_context_timeout', '未收到本次私有连接上下文。', 409)), timeoutMs);
    disconnected = () => { clearTimeout(timer); reject(connectionFailure('mysql_context_disconnected', '连接上下文通道已关闭。', 409)); };
    receive = message => {
      if (!message || typeof message !== 'object' || (message as Record<string, unknown>).type !== 'buildr.connection-context') return;
      clearTimeout(timer); channel.off('message', receive);
      const context = (message as { context?: MySqlProgramContext }).context;
      if (context?.protocolVersion !== 'buildr.connection-context/v1' || typeof context.callId !== 'string' || !context.callId || context.definition?.definitionId !== 'mysql') { reject(connectionFailure('mysql_context_invalid', 'MySQL 连接上下文的协议或身份无效。', 409)); return; }
      resolve(context);
    };
    channel.on('message', receive); channel.on('disconnect', disconnected);
  });
  return { ready, close() { clearTimeout(timer); channel.off('message', receive); channel.off('disconnect', disconnected); if (channel.connected) channel.disconnect?.(); } };
}
export async function executeMySqlConnectionCommand(command: string, context: MySqlProgramContext, provider: ConnectionProvider = createMySqlProvider()) {
  if (!['test', 'databases'].includes(command)) throw connectionFailure('mysql_command_unsupported', '此连接程序只提供 test 和 databases；查询工具是独立内置能力。');
  const selected = context.connections?.primary;
  if (!selected || typeof selected.id !== 'string' || !selected.id || !['personal', 'team'].includes(selected.authentication?.source)) throw connectionFailure('mysql_context_invalid', '明确选定的 MySQL 连接或认证来源无效。', 409);
  const config = inputObject(selected.config, ['host', 'port', 'defaultDatabase']);
  const auth = inputObject(selected.authentication.values, ['username', 'password']);
  const target = mysqlConfiguration({ ...config, username: auth.username, selectedDatabases: [] });
  const credentials = { password: passwordInput(auth.password) };
  const redact = (value: string) => credentials.password ? value.split(credentials.password).join('[已隐藏]') : value;
  if (command === 'test') {
    const result = await provider.test(target, credentials);
    return { status: 'success', checks: [{ id: 'mysql-connect', status: 'success', message: '已通过所选认证连接 MySQL 并完成只读版本检查。' }], serverVersion: redact(String(result.serverVersion || '')).slice(0, 256), elapsedMs: result.elapsedMs, diagnostics: [], limitations: ['连接测试不证明其他数据库权限、查询结果或业务目标已经完成。'] };
  }
  if (!provider.mysql) throw connectionFailure('mysql_program_unavailable', 'MySQL 数据库发现能力不可用。', 409);
  const databases = await provider.mysql.databases(target, credentials);
  if (credentials.password && databases.some(value => value.includes(credentials.password))) throw connectionFailure('mysql_discovery_output_protected', DIAGNOSTICS.mysql_discovery_output_protected!);
  return { status: 'success', options: databases.map(value => ({ value, label: value })), databases, checks: [{ id: 'mysql-databases', status: 'success', message: '已列出当前账号可见的数据库。' }], diagnostics: [], limitations: ['可见数据库取决于本次认证账号权限；未执行用户查询。'] };
}
export async function runMySqlConnectionProgram(argv: string[] = process.argv.slice(2), channel: Channel = process): Promise<void> {
  if (argv.length === 1 && argv[0] === '--version') { console.log('buildr-mysql ' + VERSION); return; }
  if (!argv.length || argv.every(value => ['--help', '--json'].includes(value))) {
    console.log(JSON.stringify({ name: 'buildr-mysql', version: VERSION, help: ['test --json：使用明确选定连接进行只读版本检查。', 'databases --json：发现当前账号可见数据库。', '仅由 Buildr 私有进程间通信（IPC）交接认证；查询工具保持独立。'] })); return;
  }
  let contextChannel: ReturnType<typeof receiveMySqlContext> | undefined;
  try {
    if (!['test', 'databases'].includes(argv[0]!) || argv.slice(1).some(value => value !== '--json') || argv.filter(value => value === '--json').length > 1) throw connectionFailure('mysql_command_unsupported', '不支持此命令或参数，请执行 --help。');
    contextChannel = receiveMySqlContext(channel);
    const result = await executeMySqlConnectionCommand(argv[0]!, await contextChannel.ready);
    console.log(JSON.stringify(result));
  } catch (cause) {
    const supplied = (cause as { code?: unknown })?.code;
    const code = typeof supplied === 'string' && Object.hasOwn(DIAGNOSTICS, supplied) ? supplied : 'mysql_connection_failed';
    // Never echo a remote driver error, endpoint, authentication value, or parser input.
    console.log(JSON.stringify({ status: 'failure', checks: [], diagnostics: [DIAGNOSTICS[code] || 'MySQL 调用失败，请检查连接、完整认证组和账号权限。'], error: { code }, limitations: ['本次调用未证明连接可用或业务目标完成。'] }));
    process.exitCode = 1;
  } finally { contextChannel?.close(); }
}
