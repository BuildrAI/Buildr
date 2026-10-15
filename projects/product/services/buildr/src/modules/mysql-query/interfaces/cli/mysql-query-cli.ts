import fs from 'node:fs';
import path from 'node:path';
import type { MySqlQueryApplication } from '../../application/mysql-query-application.ts';
import { mysqlFailure, inputObject } from '../../domain/mysql.ts';

function fileInput(file: string): string {
  let fd: number | undefined;
  try {
    fd = file === '-' ? 0 : fs.openSync(path.resolve(file), fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    const bytes: Buffer[] = []; let length = 0;
    for (;;) { const block = Buffer.alloc(16 * 1024); const count = fs.readSync(fd, block); if (!count) break; length += count; if (length > 128 * 1024) throw new Error(); bytes.push(block.subarray(0, count)); }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(bytes));
  } catch { throw mysqlFailure('mysql_query_cli_input_invalid', '无法读取输入文件，或输入超过 128 KiB。'); }
  finally { if (fd !== undefined && fd !== 0) fs.closeSync(fd); }
}
export function createMySqlQueryCli(application: MySqlQueryApplication) {
  return [Object.freeze({ key: 'mysql-query', surface: 'agent-machine', summary: '使用明确绑定的新 MySQL 实例执行独立只读查询与管理本机查询偏好。',
    help: [
      'Usage: buildr mysql-query <databases|tables|columns|query|preferences|save-preferences> --connection <id> --expected-revision <revision> [--database <name>] [--table <name>] [--sql <sql> | --sql-file <file|->] [--file <preferences.json|->] [--target <workspace>] [--json]',
      '所有操作必须提供本次明确实例及刚观察的连接版本；不按名称猜测，不接受认证参数。',
      'query 沿用单条只读 SELECT，默认100行、最多500行、10秒与4MiB结果限制。--database 空值表示无默认库。',
      'save-preferences --file 输入 {enabledDatabases,currentDatabase,expectedRevision}；偏好版本与连接版本分别校验，偏好不写入连接配置。',
    ], match: ({ domain }: { domain?: string }) => domain === 'mysql-query',
    async run(_runtime: unknown, context: { argv: string[] }) {
      const [action, ...args] = context.argv.slice(3), actionFlags: Record<string, string[]> = { databases: [], tables: ['--database'], columns: ['--database', '--table'], query: ['--database', '--sql', '--sql-file'], preferences: [], 'save-preferences': ['--file'] };
      if (!action || !Object.hasOwn(actionFlags, action)) throw mysqlFailure('mysql_query_cli_invalid', '未知查询工具操作，请执行 --help。');
      const flags = new Map<string, string>(), allowed = [...actionFlags[action]!, '--connection', '--expected-revision', '--target', '--json'];
      while (args.length) {
        const flag = args.shift()!;
        if (!allowed.includes(flag) || flags.has(flag)) throw mysqlFailure('mysql_query_cli_invalid', '查询参数无效或重复。');
        if (flag === '--json') { flags.set(flag, 'true'); continue; }
        const value = args.shift(); if (value === undefined || value.startsWith('--')) throw mysqlFailure('mysql_query_cli_invalid', '查询参数缺少值。');
        flags.set(flag, value);
      }
      const root = path.resolve(flags.get('--target') || process.cwd()), id = flags.get('--connection') || '', revision = flags.get('--expected-revision');
      if (!id || !revision) throw mysqlFailure('connection_skill_revision_required', '必须明确 --connection 和 --expected-revision。', 409);
      let result: unknown;
      if (action === 'databases') result = await application.databases(root, id, revision);
      else if (action === 'tables') result = await application.tables(root, id, revision, flags.get('--database'));
      else if (action === 'columns') result = await application.columns(root, id, revision, flags.get('--database'), flags.get('--table'));
      else if (action === 'preferences') result = application.queryPreferences(root, id, revision);
      else if (action === 'save-preferences') {
        if (!flags.has('--file')) throw mysqlFailure('mysql_query_cli_invalid', '保存偏好需要 --file。');
        let input: Record<string, unknown>;
        try { input = inputObject(JSON.parse(fileInput(flags.get('--file')!)), ['enabledDatabases', 'currentDatabase', 'expectedRevision']); }
        catch { throw mysqlFailure('mysql_query_cli_input_invalid', '查询偏好输入必须是有界的 JSON 对象。'); }
        result = application.saveQueryPreferences(root, id, { ...input, connectionRevision: revision });
      } else {
        if (flags.has('--sql') === flags.has('--sql-file')) throw mysqlFailure('mysql_query_cli_invalid', '查询需要且只能提供 --sql 或 --sql-file。');
        result = await application.query(root, id, { connectionRevision: revision, sql: flags.has('--sql-file') ? fileInput(flags.get('--sql-file')!) : flags.get('--sql'), ...(flags.has('--database') ? { database: flags.get('--database') } : {}) });
      }
      const output = { schemaVersion: 'buildr.mysql-query-result/v1', operation: action, ...(result as Record<string, unknown>) };
      process.stdout.write(JSON.stringify(output, null, 2) + '\n'); return output;
    },
  })];
}
