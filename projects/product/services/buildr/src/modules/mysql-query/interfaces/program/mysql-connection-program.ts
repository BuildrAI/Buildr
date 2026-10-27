import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EventEmitter } from 'node:events';
import { affectedRowLimit, mysqlFailure, inputObject, mysqlTarget, passwordInput, tableFingerprintInput, type MySqlChangeResult, type MySqlConnectionClient } from '../../domain/mysql.ts';
import { createMySqlClient, prepareChangeStatement } from '../../infrastructure/mysql-client.ts';

export const VERSION = '1.1.0';
const ENVIRONMENTS = ['dev', 'test', 'qa', 'reg', 'prod'] as const;
const STATEMENT_BYTES = 64 * 1024;
const DIAGNOSTICS: Record<string, string> = {
  mysql_command_unsupported: '不支持此命令或参数；程序提供 test、databases、fingerprint 和 apply，请执行 --help。',
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
  mysql_change_invalid: '变更语句无法解析为单条受支持的语句。',
  mysql_change_unsupported: '一次只支持涉及一张表的变更语句，且无法确定语句的目标表。',
  mysql_change_where_required: '数据修改必须带有明确的 WHERE 条件；请缩小范围或拆分语句。',
  mysql_change_forbidden: '该语句不在受支持的变更范围：仅数据修改与表、索引结构变更；权限、服务器状态、过程与文件类语句始终拒绝。',
  mysql_change_database_required: '请在连接配置中选择默认数据库，或使用带数据库前缀的表名。',
  mysql_change_environment_invalid: '连接声明的目标环境无效。',
  mysql_change_environment_prohibited: '生产环境不允许通过连接技能执行变更；请人工执行并核验结果。',
  mysql_change_policy_invalid: '破坏性语句开关的配置值无效。',
  mysql_change_destructive_denied: '该语句会删除或清空数据；当前连接未开启允许破坏性语句，未执行。',
  mysql_change_fingerprint_invalid: '请先读取目标表当前结构摘要，并原样提交该摘要。',
  mysql_change_fingerprint_mismatch: '目标表结构已变化或与观察不符，未执行变更；请重新读取当前结构。',
  mysql_change_limit_invalid: '受影响行数上限必须为 1—10000 的整数；结构变更不接受该参数。',
  mysql_change_affected_rows_exceeded: '本次影响行数超过上限，已回滚，数据保持修改前状态。',
  mysql_change_statement_unreadable: '无法读取变更语句文件，或文件超过 64 KiB。',
  mysql_change_context_unverified: '写前连接上下文复核未完成，未执行变更。',
  mysql_change_context_changed: '本次连接上下文已变化，未执行变更；请重新读取并判断。',
  mysql_change_outcome_unknown: '变更结果未知；请重新读取实际状态，不要自动重试。',
  mysql_change_committed_unverified: '变更已提交，但回读未完成；请重新读取实际状态确认结果，不要重复执行。',
  mysql_change_failed: 'MySQL 变更调用失败，请检查语句、连接与账号权限。',
};
type Channel = Pick<EventEmitter, 'on' | 'off'> & { connected?: boolean; send?: (message: unknown, callback?: (error?: Error | null) => void) => unknown; disconnect?(): void };
export type MySqlProgramContext = { protocolVersion: 'buildr.connection-context/v1'; callId: string; definition?: { definitionId?: string }; connections: { primary: { id: string; config: Record<string, unknown>; authentication: { source: string; values: Record<string, unknown> } } } };
export function receiveMySqlContext(channel: Channel, timeoutMs = 10_000): { ready: Promise<MySqlProgramContext>; close(): void } {
  if (!channel.connected || typeof channel.send !== 'function') throw mysqlFailure('mysql_context_required', '请通过已明确选定连接的 Buildr 启动入口执行。', 409);
  let receive: (message: unknown) => void = () => {}, disconnected: () => void = () => {}, timer: ReturnType<typeof setTimeout>;
  const ready = new Promise<MySqlProgramContext>((resolve, reject) => {
    timer = setTimeout(() => reject(mysqlFailure('mysql_context_timeout', '未收到本次私有连接上下文。', 409)), timeoutMs);
    disconnected = () => { clearTimeout(timer); reject(mysqlFailure('mysql_context_disconnected', '连接上下文通道已关闭。', 409)); };
    receive = message => {
      if (!message || typeof message !== 'object' || (message as Record<string, unknown>).type !== 'buildr.connection-context') return;
      clearTimeout(timer); channel.off('message', receive);
      const context = (message as { context?: MySqlProgramContext }).context;
      if (context?.protocolVersion !== 'buildr.connection-context/v1' || typeof context.callId !== 'string' || !context.callId || context.definition?.definitionId !== 'mysql') { reject(mysqlFailure('mysql_context_invalid', 'MySQL 连接上下文的协议或身份无效。', 409)); return; }
      resolve(context);
    };
    channel.on('message', receive); channel.on('disconnect', disconnected);
  });
  return { ready, close() { clearTimeout(timer); channel.off('message', receive); channel.off('disconnect', disconnected); if (channel.connected) channel.disconnect?.(); } };
}

/** Ask the host to re-read the selected instance, definition, program and authentication before a write is submitted. */
export function requestRevalidate(channel: Channel, callId: string, timeoutMs = 10_000): Promise<void> {
  if (!channel.connected || typeof channel.send !== 'function') throw mysqlFailure('mysql_context_required', '请通过已明确选定连接的 Buildr 启动入口执行。', 409);
  const send = (channel.send as (message: unknown, callback?: (error?: Error | null) => void) => unknown).bind(channel);
  const requestId = 'revalidate-' + randomUUID();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => { clearTimeout(timer); channel.off('message', receive); channel.off('disconnect', disconnected); if (error) reject(error); else resolve(); };
    const timer = setTimeout(() => finish(mysqlFailure('mysql_change_context_unverified', '写前连接上下文复核未完成，未执行变更。', 409)), timeoutMs);
    const disconnected = () => finish(mysqlFailure('mysql_context_disconnected', '连接上下文通道已关闭，未执行变更。', 409));
    const receive = (message: unknown) => {
      const value = message as { type?: string; requestId?: string; ok?: boolean; error?: { message?: unknown } };
      if (value?.type !== 'buildr.connection-revalidated' || value.requestId !== requestId) return;
      if (value.ok === true) finish();
      else finish(mysqlFailure('mysql_change_context_changed', typeof value.error?.message === 'string' ? value.error.message : DIAGNOSTICS.mysql_change_context_changed!, 409));
    };
    channel.on('message', receive); channel.on('disconnect', disconnected);
    try { send({ type: 'buildr.connection-revalidate', requestId, callId }, error => { if (error) finish(mysqlFailure('mysql_context_disconnected', '写前连接上下文复核未完成，未执行变更。', 409)); }); }
    catch { finish(mysqlFailure('mysql_context_disconnected', '写前连接上下文复核未完成，未执行变更。', 409)); }
  });
}

function changePolicy(config: Record<string, unknown>): { environment: string; allowDestructive: boolean } {
  // Production is an explicit guard, not a required declaration: an updated workspace can change
  // data immediately, and only a connection marked prod is refused.
  const environment = config.targetEnvironment;
  if (environment !== undefined && environment !== null && environment !== '' && (typeof environment !== 'string' || !(ENVIRONMENTS as readonly string[]).includes(environment))) throw mysqlFailure('mysql_change_environment_invalid', DIAGNOSTICS.mysql_change_environment_invalid!);
  if (environment === 'prod') throw mysqlFailure('mysql_change_environment_prohibited', DIAGNOSTICS.mysql_change_environment_prohibited!, 403);
  const allowDestructive = config.allowDestructive;
  if (allowDestructive !== undefined && typeof allowDestructive !== 'boolean') throw mysqlFailure('mysql_change_policy_invalid', DIAGNOSTICS.mysql_change_policy_invalid!);
  return { environment: typeof environment === 'string' && environment ? environment : 'undeclared', allowDestructive: allowDestructive === true };
}

function readStatement(file: string): string {
  let content: Buffer;
  try {
    if (file === '-') {
      const chunks: Buffer[] = []; let total = 0;
      for (;;) { const block = Buffer.alloc(16 * 1024); const count = fs.readSync(0, block); if (!count) break; total += count; if (total > STATEMENT_BYTES) throw new Error('too large'); chunks.push(block.subarray(0, count)); }
      content = Buffer.concat(chunks);
    } else {
      const resolved = path.resolve(file);
      if (fs.statSync(resolved).size > STATEMENT_BYTES) throw new Error('too large');
      content = fs.readFileSync(resolved);
    }
  } catch { throw mysqlFailure('mysql_change_statement_unreadable', DIAGNOSTICS.mysql_change_statement_unreadable!); }
  return content.toString('utf8');
}

function changeOutput(result: MySqlChangeResult, environment: string) {
  return {
    status: 'success', category: result.category, statement: result.statement, database: result.database, table: result.table, environment,
    committed: true, rollbackable: result.rollbackable, affectedRows: result.affectedRows,
    fingerprintBefore: result.fingerprintBefore, fingerprintAfter: result.fingerprintAfter, readback: result.readback, elapsedMs: result.elapsedMs,
    checks: [{ id: 'mysql-change', status: 'success', message: result.rollbackable ? '数据修改已在事务中提交，并已回读结果。' : '结构变更已执行并回读；该变更不可回滚。' }],
    diagnostics: [],
    limitations: [result.rollbackable
      ? '本次修改已提交；事务只覆盖这一次执行，不证明业务结果。'
      : '结构变更已执行且不可回滚；回读只证明当前结构与摘要一致，不证明业务结果。',
      ...(environment === 'undeclared' ? ['连接未声明目标环境，本次没有生产保护；如该连接指向生产，请在连接配置中标注 prod。'] : [])],
  };
}

export async function executeMySqlConnectionCommand(command: string, context: MySqlProgramContext, client: MySqlConnectionClient = createMySqlClient(), options: { flags?: Map<string, string>; channel?: Channel } = {}): Promise<Record<string, unknown>> {
  if (!['test', 'databases', 'fingerprint', 'apply'].includes(command)) throw mysqlFailure('mysql_command_unsupported', '此连接程序只提供 test、databases、fingerprint 和 apply；查询工具是独立内置能力。');
  const flags = options.flags ?? new Map<string, string>();
  const selected = context.connections?.primary;
  if (!selected || typeof selected.id !== 'string' || !selected.id || !['personal', 'team'].includes(selected.authentication?.source)) throw mysqlFailure('mysql_context_invalid', '明确选定的 MySQL 连接或认证来源无效。', 409);
  const config = inputObject(selected.config, ['host', 'port', 'defaultDatabase', 'targetEnvironment', 'allowDestructive']);
  const auth = inputObject(selected.authentication.values, ['username', 'password']);
  const target = mysqlTarget(config, auth.username);
  const credentials = { password: passwordInput(auth.password) };
  const redact = (value: string) => credentials.password ? value.split(credentials.password).join('[已隐藏]') : value;
  if (command === 'test') {
    const result = await client.test(target, credentials);
    return { status: 'success', checks: [{ id: 'mysql-connect', status: 'success', message: '已通过所选认证连接 MySQL 并完成只读版本检查。' }], serverVersion: redact(String(result.serverVersion || '')).slice(0, 256), elapsedMs: result.elapsedMs, diagnostics: [], limitations: ['连接测试不证明其他数据库权限、查询结果或业务目标已经完成。'] };
  }
  if (command === 'databases') {
    const databases = await client.databases(target, credentials);
    if (credentials.password && databases.some(value => value.includes(credentials.password))) throw mysqlFailure('mysql_discovery_output_protected', DIAGNOSTICS.mysql_discovery_output_protected!);
    return { status: 'success', options: databases.map(value => ({ value, label: value })), databases, checks: [{ id: 'mysql-databases', status: 'success', message: '已列出当前账号可见的数据库。' }], diagnostics: [], limitations: ['可见数据库取决于本次认证账号权限；未执行用户查询。'] };
  }
  if (command === 'fingerprint') {
    const table = flags.get('--table');
    if (!table) throw mysqlFailure('mysql_change_unsupported', '结构摘要需要明确 --table。');
    const database = flags.get('--database');
    const observed = await client.fingerprint(target, credentials, { ...(database === undefined ? {} : { database }), table });
    return { status: 'success', connectionId: selected.id, ...observed, checks: [{ id: 'mysql-fingerprint', status: 'success', message: observed.exists ? '已读取目标表当前结构摘要。' : '目标表当前不存在，摘要表示缺席状态。' }], diagnostics: [], limitations: ['摘要只覆盖列与索引定义，不包含数据或权限。'] };
  }
  const policy = changePolicy(config);
  const statementFile = flags.get('--statement-file');
  if (!statementFile) throw mysqlFailure('mysql_change_invalid', '变更需要 --statement-file 提供单条语句。');
  const statement = readStatement(statementFile);
  const plan = await prepareChangeStatement(statement, target.defaultDatabase);
  if (plan.destructive && !policy.allowDestructive) throw mysqlFailure('mysql_change_destructive_denied', DIAGNOSTICS.mysql_change_destructive_denied!, 403);
  if (plan.category === 'ddl' && flags.has('--max-affected-rows')) throw mysqlFailure('mysql_change_limit_invalid', '结构变更不接受受影响行数上限。');
  const expectedFingerprint = tableFingerprintInput(flags.get('--expected-fingerprint'));
  const maxAffectedRows = plan.category === 'dml' ? affectedRowLimit(flags.get('--max-affected-rows')) : undefined;
  await requestRevalidate(options.channel ?? (process as unknown as Channel), context.callId);
  const result = await client.applyChange(target, credentials, { statement, expectedFingerprint, ...(maxAffectedRows === undefined ? {} : { maxAffectedRows }) });
  return changeOutput(result, policy.environment);
}

const CHANGE_FLAGS: Record<string, string[]> = { test: [], databases: [], fingerprint: ['--table', '--database'], apply: ['--statement-file', '--expected-fingerprint', '--max-affected-rows'] };
function parseArguments(argv: string[]): { action: string; flags: Map<string, string> } {
  const action = argv[0]!;
  if (!Object.hasOwn(CHANGE_FLAGS, action)) throw mysqlFailure('mysql_command_unsupported', '不支持此命令或参数，请执行 --help。');
  const flags = new Map<string, string>(); let json = 0;
  for (let index = 1; index < argv.length; index++) {
    const flag = argv[index]!;
    if (flag === '--json') { if (++json > 1) throw mysqlFailure('mysql_command_unsupported', '不支持重复的 --json。'); continue; }
    if (!CHANGE_FLAGS[action]!.includes(flag) || flags.has(flag)) throw mysqlFailure('mysql_command_unsupported', '不支持此命令或参数，请执行 --help。');
    const value = argv[++index];
    if (!value || value.startsWith('--')) throw mysqlFailure('mysql_command_unsupported', '参数缺少值。');
    flags.set(flag, value);
  }
  return { action, flags };
}

export async function runMySqlConnectionProgram(argv: string[] = process.argv.slice(2), channel: Channel = process as unknown as Channel): Promise<void> {
  if (argv.length === 1 && argv[0] === '--version') { console.log('buildr-mysql ' + VERSION); return; }
  if (!argv.length || argv.every(value => ['--help', '--json'].includes(value))) {
    console.log(JSON.stringify({ name: 'buildr-mysql', version: VERSION, help: [
      'test --json：使用明确选定连接进行只读版本检查。',
      'databases --json：发现当前账号可见数据库。',
      'fingerprint --table <表> [--database <库>] --json：读取目标表当前结构摘要，用于变更前核对。',
      'apply --statement-file <文件|-> --expected-fingerprint <摘要> [--max-affected-rows <1-10000>] --json：执行单条 DML 或 DDL；DML 需要行数上限，DDL 不接受该参数。',
      '连接被标记为 prod 时拒绝变更；未声明环境按非生产执行，并在结果中标注没有生产保护。破坏性结构语句需要连接开启 allowDestructive。',
      '仅由 Buildr 私有进程间通信（IPC）交接认证；查询工具保持独立且只读。',
    ] })); return;
  }
  let contextChannel: ReturnType<typeof receiveMySqlContext> | undefined;
  try {
    const parsed = parseArguments(argv);
    if (parsed.action === 'apply' && !parsed.flags.has('--statement-file')) throw mysqlFailure('mysql_change_invalid', '变更需要 --statement-file 提供单条语句。');
    contextChannel = receiveMySqlContext(channel);
    const result = await executeMySqlConnectionCommand(parsed.action, await contextChannel.ready, undefined, { flags: parsed.flags, channel });
    console.log(JSON.stringify(result));
  } catch (cause) {
    const supplied = (cause as { code?: unknown })?.code;
    const code = typeof supplied === 'string' && Object.hasOwn(DIAGNOSTICS, supplied) ? supplied : 'mysql_change_failed';
    const status = code === 'mysql_change_outcome_unknown' || code === 'mysql_change_committed_unverified' ? 'unknown' : 'failure';
    // Never echo a remote driver error, endpoint, authentication value, or parser input.
    console.log(JSON.stringify({ status, checks: [], diagnostics: [DIAGNOSTICS[code] || 'MySQL 调用失败，请检查连接、完整认证组和账号权限。'], error: { code }, ...(status === 'unknown' ? { committed: code === 'mysql_change_committed_unverified' ? true : null } : {}), limitations: [status === 'unknown' ? '重新读取实际状态后再决定是否继续；不要重复执行同一变更。' : '本次调用未证明变更已执行或业务目标完成。'] }));
    process.exitCode = 1;
  } finally { contextChannel?.close(); }
}
