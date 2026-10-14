import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { ConnectionsApplication } from '../../application/connections-application.ts';
import { connectionFailure } from '../../domain/connection.ts';
import { NACOS_CONTENT_BYTES } from '../../domain/nacos-connection.ts';

const FLAGS: Record<string, readonly string[]> = {
  namespaces: [], list: ['--data-id', '--group', '--page', '--page-size'], get: ['--data-id', '--group', '--output-file'],
  diff: ['--data-id', '--group', '--content-file', '--compare-connection', '--compare-data-id', '--compare-group'],
  publish: ['--data-id', '--group', '--content-file', '--expected-revision', '--expected-md5', '--authorization-file'],
};
export const NACOS_CLI_HELP = [
  'Usage: buildr connection nacos <namespaces|list|get|diff|publish> --connection <id> [--target <workspace>] [--json]',
  'list: [--data-id <filter>] [--group <filter>] [--page <number>] [--page-size <1..100>]；返回一页完整标识，不自动抓取全量。',
  'get: --data-id <id> [--group <name>] [--output-file <new-file>]；原文可写入不存在的本机文件，权限 0600，不覆盖已有文件。',
  'diff: --data-id <id> [--group <name>] (--content-file <file|-> | --compare-connection <id> [--compare-data-id <id>] [--compare-group <name>])；返回版本与本次授权范围。',
  'publish: --data-id <id> [--group <name>] --content-file <file|-> --expected-revision <revision> --expected-md5 <md5> [--authorization-file <json-file|->]；只发布已存在配置。',
  '生产每次实际发布必须先取得用户针对本次目标和差异的授权；授权输入 {source,statement,scope}，scope 使用本次 diff 的 authorizationScope。此输入不替代取得真实用户授权，也不是人类身份认证。',
  '配置发布与回读验证分别返回，不自动重启服务；已确认接口使用原生比较并交换（CAS），其余接口使用发布前二次读取，结果说明 concurrencyProtection。',
  'preflight-recheck 只能发现最后一次读取之前的变化，不能原子阻止读取与写入之间的并发覆盖；缺少原生比较并交换（CAS）不再单独阻止普通发布。',
];
function readText(file: string, maxBytes: number): string {
  try {
    const bytes = file === '-' ? fs.readFileSync(0) : fs.readFileSync(path.resolve(file));
    if (bytes.length > maxBytes) throw new Error('large input');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch { throw connectionFailure('nacos_cli_input_invalid', '无法读取 UTF-8 输入文件，或输入超过大小限制。'); }
}
export async function runNacosCli(application: ConnectionsApplication, args: string[]) {
  const [action, ...rest] = args;
  if (action === '--help' || action === 'help' || action === undefined) { const result = { schemaVersion: 'buildr.connection-result/v1', operation: 'nacos-help', help: NACOS_CLI_HELP }; process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return result; }
  const flags = FLAGS[action];
  if (!flags) throw connectionFailure('nacos_cli_invalid', '未知 Nacos 操作。');
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    if (values.has(flag) || ![...flags, '--connection', '--target', '--json'].includes(flag)) throw connectionFailure('nacos_cli_invalid', '参数无效或重复：' + flag);
    if (flag === '--json') { values.set(flag, 'true'); continue; }
    const value = rest[++index];
    if (value === undefined || value.startsWith('--')) throw connectionFailure('nacos_cli_invalid', '参数缺少值：' + flag);
    values.set(flag, value);
  }
  const id = values.get('--connection');
  if (!id) throw connectionFailure('nacos_cli_invalid', 'Nacos 操作必须明确指定 --connection。');
  const root = path.resolve(values.get('--target') || process.cwd()), input: Record<string, unknown> = {};
  const mapping = { '--data-id': 'dataId', '--group': 'group', '--page': 'pageNo', '--page-size': 'pageSize', '--compare-connection': 'compareConnection', '--compare-data-id': 'compareDataId', '--compare-group': 'compareGroup', '--expected-revision': 'expectedRevision', '--expected-md5': 'expectedMd5' };
  for (const [flag, key] of Object.entries(mapping)) if (values.has(flag)) {
    const value = values.get(flag)!;
    if (['pageNo', 'pageSize'].includes(key)) {
      if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw connectionFailure('nacos_cli_invalid', '页码和页大小必须是正整数。');
      input[key] = Number(value);
    } else input[key] = value;
  }
  if (!['list', 'namespaces'].includes(action) && !values.has('--data-id')) throw connectionFailure('nacos_cli_invalid', '配置操作必须明确指定 --data-id。');
  if (action === 'publish' && (!values.has('--content-file') || !values.has('--expected-revision') || !values.has('--expected-md5'))) throw connectionFailure('nacos_cli_invalid', '发布必须提供候选内容、已观察连接版本与配置摘要。');
  if (action === 'diff' && (values.has('--content-file') === values.has('--compare-connection') || !values.has('--compare-connection') && (values.has('--compare-data-id') || values.has('--compare-group')))) throw connectionFailure('nacos_cli_invalid', '比较必须选择候选文件或第二连接；第二配置参数需要比较连接。');
  if (values.get('--content-file') === '-' && values.get('--authorization-file') === '-') throw connectionFailure('nacos_cli_invalid', '配置内容和授权依据不能同时读取标准输入。');
  if (values.has('--content-file')) input.content = readText(values.get('--content-file')!, NACOS_CONTENT_BYTES);
  if (values.has('--authorization-file')) {
    try { input.authorization = JSON.parse(readText(values.get('--authorization-file')!, 32 * 1024)); }
    catch (error) { if ((error as { code?: string }).code) throw error; throw connectionFailure('nacos_cli_input_invalid', '授权输入必须是合法 JSON。'); }
  }
  let result: object;
  if (action === 'namespaces') result = await application.nacos.namespaces(root, id);
  else if (action === 'list') result = await application.nacos.list(root, id, input);
  else if (action === 'get') {
    const detail = await application.nacos.get(root, id, input);
    if (values.has('--output-file')) {
      const file = path.resolve(values.get('--output-file')!);
      try { fs.writeFileSync(file, detail.content, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); }
      catch { throw connectionFailure('nacos_cli_output_invalid', '无法创建输出文件；请提供不存在的本机文件路径，原文件不会被覆盖。'); }
      result = { ...detail, outputFile: file };
    } else result = detail;
  } else if (action === 'diff') result = await application.nacos.diff(root, id, input);
  else result = await application.nacos.publish(root, id, input);
  const output = { schemaVersion: 'buildr.connection-result/v1', operation: 'nacos-' + action, ...result };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n'); return output;
}
