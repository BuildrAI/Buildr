import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { ConnectionsApplication } from '../../application/connections-application.ts';
import { connectionFailure, inputObject } from '../../domain/connection.ts';
import { NACOS_CLI_HELP, runNacosCli } from './nacos-cli.ts';
import { KIBANA_CLI_HELP, runKibanaCli } from './kibana-cli.ts';
import { XXL_JOB_CLI_HELP, runXxlJobCli } from './xxl-job-cli.ts';

const ACTION_FLAGS: Record<string, string[]> = {
  list: [], create: ['--file'], update: ['--connection', '--file', '--expected-revision'], remove: ['--connection', '--expected-revision'],
  test: ['--connection', '--file', '--expected-revision'], databases: ['--connection'], tables: ['--connection', '--database'], columns: ['--connection', '--database', '--table'], query: ['--connection', '--database', '--sql', '--sql-file'],
};
function fileInput(file: string): string {
  try {
    const descriptor = file === '-' ? 0 : fs.openSync(path.resolve(file), 'r');
    try { const bytes = fs.readFileSync(descriptor); if (bytes.length > 128 * 1024) throw new Error('large input'); return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    finally { if (descriptor !== 0) fs.closeSync(descriptor); }
  } catch { throw connectionFailure('connection_cli_input_invalid', '无法读取输入文件，或输入超过 128 KiB。'); }
}
export function createConnectionsCliContributions(application: ConnectionsApplication) {
  return [Object.freeze({
    key: 'connection', surface: 'agent-machine', summary: '管理外部连接，查询 MySQL、Kibana，维护 Nacos 配置和 XXL-JOB 调度。',
    help: [
      'Usage: buildr connection <list|create|update|remove|test|databases|tables|columns|query> [--connection <id>] [--file <json-file>] [--expected-revision <revision>] [--database <name>] [--table <name>] [--sql <sql> | --sql-file <file>] [--target <workspace>] [--json]',
      'create/update 的 JSON 使用 {name,category,type,environment,config,credentials?:{password}}；认证只从本机文件或标准输入读取，永不输出。',
      '编辑保留认证时省略 credentials；地址、端口或用户名改变时必须提供新 credentials。',
      '查询为单条只读 SELECT，默认100行、最多500行；--database 空值表示不使用默认库，database.table按真实账号权限执行。',
      ...NACOS_CLI_HELP,
      ...KIBANA_CLI_HELP,
      ...XXL_JOB_CLI_HELP,
    ],
    match: ({ domain }: { domain?: string }) => domain === 'connection',
    async run(_runtime: unknown, context: { argv: string[] }) {
      const [action = 'list', ...args] = context.argv.slice(3);
      if (action === 'nacos') return runNacosCli(application, args);
      if (action === 'kibana') return runKibanaCli(application, args);
      if (action === 'xxl-job') return runXxlJobCli(application, args);
      const flags = ACTION_FLAGS[action];
      if (!flags) throw connectionFailure('connection_cli_invalid', '未知连接操作。');
      const values = new Map<string, string>();
      for (let index = 0; index < args.length; index++) {
        const flag = args[index];
        if (values.has(flag) || ![...flags, '--target', '--json'].includes(flag)) throw connectionFailure('connection_cli_invalid', '参数无效或重复：' + flag);
        if (flag === '--json') { values.set(flag, 'true'); continue; }
        const value = args[++index];
        if (value === undefined || value.startsWith('--')) throw connectionFailure('connection_cli_invalid', '参数缺少值：' + flag);
        values.set(flag, value);
      }
      const root = path.resolve(values.get('--target') || process.cwd()), id = values.get('--connection') || '';
      let input: Record<string, unknown> = {};
      if (values.has('--file')) { try { input = inputObject(JSON.parse(fileInput(values.get('--file')!)), ['name', 'category', 'type', 'environment', 'config', 'credentials', 'expectedRevision']); } catch (error) { if ((error as { code?: string }).code) throw error; throw connectionFailure('connection_cli_input_invalid', '输入文件必须为合法的连接 JSON。'); } }
      if (values.has('--expected-revision')) { if (input.expectedRevision !== undefined) throw connectionFailure('connection_cli_invalid', '不能重复提供连接版本。'); input.expectedRevision = values.get('--expected-revision'); }
      let result: unknown;
      if (action === 'list') result = application.list(root);
      else if (action === 'create') { if (!values.has('--file')) throw connectionFailure('connection_cli_invalid', '创建连接需要 --file。'); result = application.create(root, input); }
      else if (action === 'update') { if (!values.has('--file')) throw connectionFailure('connection_cli_invalid', '编辑连接需要 --file。'); result = application.update(root, id, input); }
      else if (action === 'remove') result = application.remove(root, id, input);
      else if (action === 'test') {
        if (id) { const record = application.list(root).connections.find(connection => connection.id === id); if (!record) throw connectionFailure('connection_not_found', '连接不存在。', 404); input = { ...input, id, expectedRevision: input.expectedRevision ?? record.revision }; }
        if (!id && !values.has('--file')) throw connectionFailure('connection_cli_invalid', '测试连接需要 --connection 或 --file。');
        result = await application.test(root, input);
      }
      else if (action === 'databases') result = await application.databases(root, id);
      else if (action === 'tables') result = await application.tables(root, id, values.get('--database'));
      else if (action === 'columns') result = await application.columns(root, id, values.get('--database'), values.get('--table'));
      else {
        if (values.has('--sql') === values.has('--sql-file')) throw connectionFailure('connection_cli_invalid', '查询需要且只能提供 --sql 或 --sql-file。');
        result = await application.query(root, id, { sql: values.has('--sql-file') ? fileInput(values.get('--sql-file')!) : values.get('--sql'), ...(values.has('--database') ? { database: values.get('--database') } : {}) });
      }
      const output = { schemaVersion: 'buildr.connection-result/v1', operation: action, ...(result as Record<string, unknown>) };
      process.stdout.write(JSON.stringify(output, null, 2) + '\n'); return output;
    },
  })];
}
