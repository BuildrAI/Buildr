import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { ConnectionsApplication } from '../../application/connections-application.ts';
import { connectionFailure } from '../../domain/connection.ts';

const OBSERVATION = ['--expected-revision', '--expected-job-revision', '--authorization-file'];
const FLAGS: Record<string, readonly string[]> = {
  executors: ['--offset', '--limit', '--app-name'], resolve: ['--service', '--app-name'], bind: ['--service', '--app-name', '--expected-revision'], local: ['--service', '--app-name', '--expected-revision'],
  jobs: ['--service', '--offset', '--limit', '--description', '--handler', '--author', '--status'], get: ['--service', '--job'],
  prepare: ['--service', '--action', '--job', '--job-file', '--executor-param-file'], diff: ['--service', '--action', '--job', '--job-file', '--executor-param-file'],
  create: ['--service', '--job-file', '--expected-revision', '--authorization-file'], update: ['--service', '--job', '--job-file', ...OBSERVATION],
  start: ['--service', '--job', ...OBSERVATION], stop: ['--service', '--job', ...OBSERVATION], trigger: ['--service', '--job', '--executor-param-file', ...OBSERVATION],
  logs: ['--service', '--offset', '--limit', '--job', '--log-status', '--from', '--to'], log: ['--service', '--job', '--log', '--from-line', '--max-lines', '--max-bytes'],
  preview: ['--service', '--schedule-type', '--schedule-conf'],
};
const WRITES = ['create', 'update', 'start', 'stop', 'trigger'];
export const XXL_JOB_CLI_HELP = [
  'Usage: buildr connection xxl-job <executors|resolve|bind|jobs|get|prepare|create|update|start|stop|trigger|logs|log|preview> --connection <id> [--service <registered-service-uuid>] [--target <workspace>] [--json]',
  '所有任务（Job）、调度记录及日志动作必须明确 --connection 与 --service；工具核对已登记服务（Service）和关联执行器（Executor），不按显示名称猜测。',
  'executors: [--app-name <actual-appname>] [--offset <0..>] [--limit <1..100>]；只返回一页，不自动抓取全量。',
  'resolve: --service <uuid> --app-name <actual-appname>；从代码及同环境配置取得真实 AppName，核验唯一远端目标，不保存。',
  'bind: --service <uuid> --app-name <actual-appname> --expected-revision <connection-revision>；核验并保存本机关联，不改变远端系统；local 是同一动作的别名。',
  'jobs: --service <uuid> [--description <text>] [--handler <name>] [--author <text>] [--status <0|1>] [--offset <0..>] [--limit <1..100>]；get: --service <uuid> --job <id>。',
  'prepare: --service <uuid> --action <create|update|start|stop|trigger> [--job <id>] [--job-file <json-file|->] [--executor-param-file <text-file|->]；diff 是同一只读动作的别名，返回完整候选、默认值、版本、差异和 authorizationScope。',
  'create: --service <uuid> --job-file <json-file|-> --expected-revision <revision>；JSON 为代码处理器模式（BEAN）可编辑字段，必须含 jobDesc/author/executorHandler，创建保持停止。',
  'update: --service <uuid> --job <id> --job-file <json-file|-> --expected-revision <revision> --expected-job-revision <digest>；JSON 为局部字段，保留其它现状；不支持在线脚本（GLUE）编辑。',
  'start|stop|trigger: --service <uuid> --job <id> --expected-revision <revision> --expected-job-revision <digest>；trigger 可用 --executor-param-file 覆盖参数，未指定则显式沿用当前完整参数，空文件表示空参数。',
  '所有生产实际写入、启停、触发还需 --authorization-file <json-file|->，内容 {source,statement,scope}，scope 精确使用本次 prepare 的 authorizationScope；必须真实取得本次用户授权，同一依据仅限一次尝试，工具不鉴别人类身份。',
  '写前重读只提供 preflight-recheck，不能原子阻止读取与写入间的并发覆盖；已受理、回读核验与业务执行结果分别返回。停止不终止在途业务，触发成功仅证明请求已提交；未知结果不自动重发。',
  'logs: --service <uuid> [--job <id>] [--log-status <1|2|3>] [--from <yyyy-MM-dd HH:mm:ss>] [--to <yyyy-MM-dd HH:mm:ss>] [--offset <0..>] [--limit <1..100>]；时间使用调度中心时间，未知其时区时不自行换算。',
  'log: --service <uuid> --job <id> --log <id> [--from-line <1..>] [--max-lines <1..1000>] [--max-bytes <1..262144>]；使用 nextFromLine 续读，不接受任意节点地址。',
  'preview: --service <uuid> --schedule-type <NONE|CRON|FIX_RATE> --schedule-conf <configuration>；只预览调度时间，时区来自调度中心，未实际运行。',
];
function invalid(message: string): never { throw connectionFailure('xxl_job_cli_invalid', message); }
function readText(file: string, maxBytes: number): string {
  try {
    const descriptor = file === '-' ? 0 : fs.openSync(path.resolve(file), 'r');
    try {
      const bytes = fs.readFileSync(descriptor);
      if (bytes.length > maxBytes) throw new Error('large input');
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } finally { if (descriptor !== 0) fs.closeSync(descriptor); }
  } catch { throw connectionFailure('xxl_job_cli_input_invalid', '无法读取 UTF-8 输入文件，或输入超过大小限制。'); }
}
function readJson(file: string, maxBytes: number): unknown {
  try { return JSON.parse(readText(file, maxBytes)); }
  catch (error) {
    if ((error as { code?: string }).code) throw error;
    throw connectionFailure('xxl_job_cli_input_invalid', '候选配置或授权文件必须是合法 JSON。');
  }
}
export async function runXxlJobCli(application: Pick<ConnectionsApplication, 'xxlJob'>, args: string[]) {
  const [action, ...rest] = args;
  if (action === undefined || action === '--help' || action === 'help') {
    const result = { schemaVersion: 'buildr.connection-result/v1', operation: 'xxl-job-help', help: XXL_JOB_CLI_HELP };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return result;
  }
  const flags = FLAGS[action];
  if (!flags) invalid('未知 XXL-JOB 操作。');
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    if (values.has(flag) || ![...flags, '--connection', '--target', '--json'].includes(flag)) invalid('参数无效或重复：' + flag);
    if (flag === '--json') { values.set(flag, 'true'); continue; }
    const value = rest[++index];
    if (value === undefined || value.startsWith('--')) invalid('参数缺少值：' + flag);
    values.set(flag, value);
  }
  const id = values.get('--connection');
  if (!id) invalid('XXL-JOB 操作必须明确指定 --connection。');
  const require = (...names: string[]) => { for (const name of names) if (!values.has(name) || !values.get(name)) invalid('操作缺少必需参数：' + name); };
  if (action !== 'executors') require('--service');
  if (['resolve', 'bind', 'local'].includes(action)) require('--app-name');
  if (['bind', 'local', ...WRITES].includes(action)) require('--expected-revision');
  if (['get', 'update', 'start', 'stop', 'trigger', 'log'].includes(action)) require('--job');
  if (['update', 'start', 'stop', 'trigger'].includes(action)) require('--expected-job-revision');
  if (['create', 'update'].includes(action)) require('--job-file');
  if (action === 'log') require('--log');
  if (action === 'preview') require('--schedule-type');
  if (action === 'preview' && !values.has('--schedule-conf')) invalid('预览必须提供 --schedule-conf（NONE 可提供空值）。');
  if (['prepare', 'diff'].includes(action)) {
    require('--action');
    const preparedAction = values.get('--action');
    if (!WRITES.includes(preparedAction!)) invalid('准备动作无效。');
    if (preparedAction !== 'create') require('--job');
    if (['create', 'update'].includes(preparedAction!)) require('--job-file');
    if (preparedAction === 'create' && values.has('--job')) invalid('创建准备不接受 --job。');
    if (!['create', 'update'].includes(preparedAction!) && values.has('--job-file') || preparedAction !== 'trigger' && values.has('--executor-param-file')) invalid('候选文件或参数覆盖不适用于本次准备动作。');
  }
  const input: Record<string, unknown> = {};
  const numeric = { '--offset': 'offset', '--limit': 'limit', '--job': 'jobId', '--log': 'logId', '--status': 'triggerStatus', '--log-status': 'logStatus', '--from-line': 'fromLine', '--max-lines': 'maxLines', '--max-bytes': 'maxBytes' };
  for (const [flag, key] of Object.entries(numeric)) if (values.has(flag)) {
    const value = values.get(flag)!;
    if (!/^(0|[1-9][0-9]*)$/u.test(value) || !Number.isSafeInteger(Number(value))) invalid('数值参数必须是非负安全整数：' + flag);
    if (!['offset', 'triggerStatus'].includes(key) && Number(value) < 1) invalid('数值参数必须是正整数：' + flag);
    input[key] = Number(value);
  }
  const strings = { '--service': 'serviceId', '--app-name': 'appName', '--description': 'jobDesc', '--handler': 'executorHandler', '--author': 'author', '--from': 'from', '--to': 'to', '--action': 'action', '--expected-revision': 'expectedRevision', '--expected-job-revision': 'expectedJobRevision', '--schedule-type': 'scheduleType', '--schedule-conf': 'scheduleConf' };
  for (const [flag, key] of Object.entries(strings)) if (values.has(flag)) input[key] = values.get(flag)!;
  for (const flag of ['--expected-revision', '--expected-job-revision']) if (values.has(flag) && !/^sha256-[a-f0-9]{64}$/u.test(values.get(flag)!)) invalid('观察版本无效：' + flag);
  const files = ['--job-file', '--executor-param-file', '--authorization-file'];
  if (files.filter(flag => values.get(flag) === '-').length > 1) invalid('候选、执行参数和授权文件不能同时读取标准输入。');
  if (values.has('--job-file')) input.fields = readJson(values.get('--job-file')!, 64 * 1024);
  if (values.has('--executor-param-file')) input.executorParam = readText(values.get('--executor-param-file')!, 16 * 1024);
  if (values.has('--authorization-file')) input.authorization = readJson(values.get('--authorization-file')!, 32 * 1024);
  const root = path.resolve(values.get('--target') || process.cwd());
  let result: object;
  if (action === 'executors') result = await application.xxlJob.executors(root, id, input);
  else if (action === 'resolve') result = await application.xxlJob.resolve(root, id, input);
  else if (action === 'bind' || action === 'local') result = await application.xxlJob.bind(root, id, input);
  else if (action === 'jobs') result = await application.xxlJob.jobs(root, id, input);
  else if (action === 'get') result = await application.xxlJob.get(root, id, input);
  else if (action === 'prepare' || action === 'diff') result = await application.xxlJob.prepare(root, id, input);
  else if (action === 'logs') result = await application.xxlJob.logs(root, id, input);
  else if (action === 'log') result = await application.xxlJob.log(root, id, input);
  else if (action === 'preview') result = await application.xxlJob.preview(root, id, input);
  else result = await application.xxlJob.execute(root, id, action, input);
  const output = { schemaVersion: 'buildr.connection-result/v1', operation: 'xxl-job-' + action, ...result };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n'); return output;
}
